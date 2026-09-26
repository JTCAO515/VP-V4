import XCTest
@testable import VisePanda

nonisolated final class NativeTravelPaceTests: XCTestCase {
    @MainActor private func scope(_ subject: String = "a", generation: Int = 1) -> NativeDataScope {
        .init(endpoint: "local", subject: subject, mobileEpoch: 1, generation: generation)
    }
    @MainActor private func reply(_ command: NativeTravelPaceCommand, reused: Bool = false) throws -> Data {
        try JSONSerialization.data(withJSONObject: ["schemaVersion": "travel-pace/1", "revision": command.expectedRevision + 1,
            "state": "explicit", "travelPace": command.travelPace?.rawValue ?? "relaxed", "scope": "account",
            "purpose": "local_trip_planning", "noticeVersion": NativeTravelPaceStore.noticeVersion,
            "operationId": command.operationId.uuidString, "reused": reused])
    }
    @MainActor private func save() -> NativeTravelPaceCommand {
        .init(action: "save", operationId: UUID(), expectedRevision: 0, travelPace: .relaxed,
              noticeVersion: NativeTravelPaceStore.noticeVersion)
    }
    @MainActor func testUnknownWriteRetriesSameOperationAndToastAppearsOnlyOnce() async throws {
        let store = NativeTravelPaceStore(), actor = scope(), command = save()
        store.reset(for: actor)
        await store.perform(currentScope: { actor }, command: command) { throw URLError(.timedOut) }
        XCTAssertEqual(store.pending, command); XCTAssertNil(store.toast)
        await store.perform(currentScope: { actor }, command: command) { try self.reply(command, reused: true) }
        XCTAssertNil(store.pending); XCTAssertEqual(store.toast?.operationId, command.operationId)
        store.dismissToast(command.operationId)
        await store.perform(currentScope: { actor }, command: command) { try self.reply(command, reused: true) }
        XCTAssertNil(store.toast)
        await store.perform(currentScope: { actor }, command: nil) { try self.reply(command) }
        XCTAssertNil(store.toast)
    }
    @MainActor func testCrossAccountAndSameAccountNewEpochDiscardLateWriteAndOldUndo() async throws {
        for replacement in [scope("b"), scope(generation: 2)] {
            let store = NativeTravelPaceStore(), initial = scope(), command = save()
            var current: NativeDataScope? = initial
            store.reset(for: initial)
            await store.perform(currentScope: { current }, command: command) {
                current = replacement; store.reset(for: replacement)
                return try self.reply(command)
            }
            XCTAssertNil(store.snapshot); XCTAssertNil(store.toast); XCTAssertNil(store.pending)
            XCTAssertFalse(store.busy)
        }
    }
    @MainActor func testConcurrentCorrectionConflictClearsUndoAndRequiresReload() async throws {
        let store = NativeTravelPaceStore(), actor = scope(), command = save()
        store.reset(for: actor)
        await store.perform(currentScope: { actor }, command: command) { try self.reply(command) }
        XCTAssertNotNil(store.toast)
        let undo = NativeTravelPaceCommand(action: "undo", operationId: UUID(), expectedRevision: 1)
        await store.perform(currentScope: { actor }, command: undo) { throw NativeDataError.server(code: "PACE_CONFLICT") }
        XCTAssertEqual(store.notice, "conflict"); XCTAssertNil(store.toast); XCTAssertNil(store.snapshot)
        XCTAssertNil(store.pending)
    }
    @MainActor func testReadCannotTurnUnconsentedDefaultIntoSavedPace() throws {
        let invalid = Data("{\"schemaVersion\":\"travel-pace/1\",\"revision\":0,\"state\":\"unset\",\"travelPace\":\"balanced\"}".utf8)
        XCTAssertFalse(try JSONDecoder().decode(NativeTravelPaceSnapshot.self, from: invalid).valid)
    }
}

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

    @MainActor func testTaskProjectionRequiresMatchingTripPurposeSourceAndExplicitChoice() throws {
        let trip = UUID().uuidString
        func projection(_ source: String, _ pace: Any, revision: Any = NSNull(), operation: Any = NSNull(), purpose: String = "local_trip_planning") throws -> NativeTaskTravelPace {
            let data = try JSONSerialization.data(withJSONObject: ["schemaVersion": "task-travel-pace/1", "tripId": trip,
                "travelPace": pace, "source": source, "sourceRevision": revision, "sourceOperationId": operation, "purpose": purpose])
            return try JSONDecoder().decode(NativeTaskTravelPace.self, from: data)
        }
        let saved = try projection("profile", "relaxed", revision: 4, operation: UUID().uuidString)
        XCTAssertTrue(saved.valid(for: trip, choice: .saved))
        XCTAssertFalse(saved.canPromoteToTripDraft(for: trip, choice: .saved))
        XCTAssertFalse(saved.valid(for: UUID().uuidString, choice: .saved))
        XCTAssertFalse(saved.valid(for: trip, choice: .thisTimeNone))
        XCTAssertFalse(try projection("profile", "relaxed", revision: 4).valid(for: trip, choice: .saved))
        XCTAssertFalse(try projection("profile", "relaxed", revision: 4, operation: UUID().uuidString, purpose: "provider_prompt").valid(for: trip, choice: .saved))
        let thisTime = try projection("current_input", "packed")
        XCTAssertTrue(thisTime.valid(for: trip, choice: .packed))
        XCTAssertTrue(thisTime.canPromoteToTripDraft(for: trip, choice: .packed))
        XCTAssertFalse(thisTime.canPromoteToTripDraft(for: UUID().uuidString, choice: .packed))
        let skipped = try projection("none", NSNull())
        XCTAssertTrue(skipped.valid(for: trip, choice: .thisTimeNone))
        XCTAssertTrue(skipped.canPromoteToTripDraft(for: trip, choice: .thisTimeNone))
        let body = try JSONSerialization.jsonObject(with: JSONEncoder().encode(NativeTaskTravelPaceInput(tripId: trip, choice: .saved))) as? [String: Any]
        XCTAssertTrue(body?["currentPace"] is NSNull)
        XCTAssertEqual(body?["useSaved"] as? Bool, true)
    }

    @MainActor func testTaskProjectionDiscardsLateResponseAfterAccountChange() async throws {
        let trip = UUID().uuidString, original = scope(), replacement = scope("b")
        var current: NativeDataScope? = original
        do {
            _ = try await NativeTaskTravelPaceReader.read(tripID: trip, choice: .saved, currentScope: { current }) { _ in
                current = replacement
                return try JSONSerialization.data(withJSONObject: ["schemaVersion": "task-travel-pace/1", "tripId": trip,
                    "travelPace": "relaxed", "source": "profile", "sourceRevision": 4,
                    "sourceOperationId": UUID().uuidString, "purpose": "local_trip_planning"])
            }
            XCTFail("Late account-A projection must not enter account B")
        } catch NativeDataError.staleSessionResponse { }
    }
}

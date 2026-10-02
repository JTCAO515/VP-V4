import XCTest
@testable import VisePanda

nonisolated final class NativeTaskActivityTests: XCTestCase {
    @MainActor private func selection() -> NativeTaskActivitySelection {
        .init(scope: NativeDataScope(endpoint: "http://127.0.0.1:63251", subject: UUID().uuidString, mobileEpoch: 1, generation: 1),
              conversationID: UUID().uuidString, taskID: UUID().uuidString, latestTurnID: UUID().uuidString, eligible: true)
    }
    @MainActor private func wire(_ selected: NativeTaskActivitySelection, status: String = "accepted",
                                  actions: [[String: String]] = [], edits: [String: Any] = [:]) throws -> Data {
        var value: [String: Any] = ["version": 5, "kind": "task_activity", "conversationId": selected.conversationID,
            "taskId": selected.taskID, "turnId": selected.latestTurnID, "turnStatus": status,
            "limit": 4, "recording": actions.isEmpty ? "unrecorded" : "recorded", "actions": actions]
        value.merge(edits) { _, incoming in incoming }
        return try JSONSerialization.data(withJSONObject: value)
    }
    @MainActor func testClosedWireRejectsUnknownPrivateAndInconsistentFields() throws {
        let target = selection()
        for edits: [String: Any] in [["version": 6], ["limit": 5], ["kind": "other"], ["receiptKey": "synthetic"],
                                    ["recording": "recorded"], ["turnStatus": "online"], ["taskId": "invalid"]] {
            XCTAssertThrowsError(try JSONDecoder().decode(NativeTaskActivity.self, from: wire(target, edits: edits)))
        }
        for actions in [[ ["tool": "unknown", "state": "started"] ], [["tool": "place.read", "state": "finished"]],
                        [["tool": "place.read", "state": "unknown", "lease": "synthetic"]],
                        Array(repeating: ["tool": "place.read", "state": "completed"], count: 5)] {
            XCTAssertThrowsError(try JSONDecoder().decode(NativeTaskActivity.self, from: wire(target, actions: actions)))
        }
    }
    @MainActor func testUnknownAndUnrecordedRemainActualFactsAcrossTerminalTurn() throws {
        let target = selection()
        let unknown = try JSONDecoder().decode(NativeTaskActivity.self, from: wire(target, status: "cancelled",
            actions: [["tool": "place.read", "state": "unknown"], ["tool": "place.read", "state": "completed"]]))
        XCTAssertEqual(unknown.actions[0].state, .unknown); XCTAssertEqual(unknown.turnStatus, .cancelled)
        XCTAssertEqual(unknown.actions.count, 2, "duplicate tools are valid distinct receipts; no inferred stage ordering")
        let empty = try JSONDecoder().decode(NativeTaskActivity.self, from: wire(target, status: "completed"))
        XCTAssertEqual(empty.recording, .unrecorded); XCTAssertTrue(empty.actions.isEmpty)
    }
    @MainActor func testScopeLatestTurnAndQualificationMustMatchBeforeDispatchAndDisplay() async throws {
        let target = selection(), store = NativeTaskActivityStore()
        store.bind(selection: target, active: true)
        let wrong = selection()
        await store.load(selection: target, currentSelection: { target }, active: { true }, request: { _, _ in try self.wire(wrong) })
        XCTAssertEqual(store.state, .unavailable); XCTAssertNil(store.visible(selection: target, active: true))
        let ineligible = NativeTaskActivitySelection(scope: target.scope, conversationID: target.conversationID,
            taskID: target.taskID, latestTurnID: target.latestTurnID, eligible: false)
        store.bind(selection: ineligible, active: true)
        await store.load(selection: ineligible, currentSelection: { ineligible }, active: { true }, request: { _, _ in XCTFail("No request for unknown latest qualification"); return Data() })
        XCTAssertEqual(store.state, .idle)
    }
    @MainActor func testThirtySecondWindowIncludesRequestTimeAndExpiryClears() async throws {
        var now: TimeInterval = 100
        let target = selection(), store = NativeTaskActivityStore(uptime: { now })
        store.bind(selection: target, active: true)
        await store.load(selection: target, currentSelection: { target }, active: { true }, request: { _, _ in now = 110; return try self.wire(target) })
        now = 129; XCTAssertNotNil(store.visible(selection: target, active: true))
        now = 130; XCTAssertNil(store.visible(selection: target, active: true)); store.expireIfNeeded()
        XCTAssertEqual(store.state, .idle)
        now = 200
        await store.load(selection: target, currentSelection: { target }, active: { true }, request: { _, _ in now = 230; return try self.wire(target) })
        XCTAssertEqual(store.state, .unavailable)
    }
    @MainActor func testSwitchLateReplyCannotOverwriteNewTaskOrBackgroundBinding() async throws {
        let first = selection(), second = selection(), store = NativeTaskActivityStore()
        var held: CheckedContinuation<Data, Never>?
        store.bind(selection: first, active: true)
        let old = Task { @MainActor in
            await store.load(selection: first, currentSelection: { store.boundSelection }, active: { store.boundActive }, request: { _, _ in
                await withCheckedContinuation { held = $0 }
            })
        }
        while held == nil { await Task.yield() }
        store.bind(selection: second, active: true)
        await store.load(selection: second, currentSelection: { second }, active: { true }, request: { _, _ in try self.wire(second, actions: [["tool": "result.prepare", "state": "started"]]) })
        held?.resume(returning: try wire(first)); await old.value
        XCTAssertNotNil(store.visible(selection: second, active: true)); XCTAssertNil(store.visible(selection: first, active: true))
        // An old view/button closure cannot dispatch or clear the newer binding.
        await store.load(selection: first, currentSelection: { first }, active: { true }, request: { _, _ in XCTFail("Stale button request"); return Data() })
        XCTAssertNotNil(store.visible(selection: second, active: true))
        store.bind(selection: second, active: false)
        XCTAssertNil(store.visible(selection: second, active: false)); XCTAssertEqual(store.state, .idle)
    }
    @MainActor func testRevocationErrorAndLostActorClearRatherThanReuseOldActivity() async throws {
        let target = selection(), store = NativeTaskActivityStore()
        store.bind(selection: target, active: true)
        await store.load(selection: target, currentSelection: { target }, active: { true }, request: { _, _ in throw NativeDataError.server(code: "DATA_POLICY_BLOCKED") })
        XCTAssertNil(store.visible(selection: target, active: true)); XCTAssertEqual(store.state, .unavailable)
        await store.load(selection: target, currentSelection: { target }, active: { true }, request: { _, _ in try self.wire(target) })
        XCTAssertNotNil(store.visible(selection: target, active: true))
        store.bind(selection: nil, active: false)
        XCTAssertNil(store.visible(selection: target, active: true))
    }
    @MainActor func testEachSelectionDimensionAndBackgroundInvalidateInFlightRead() async throws {
        let first = selection()
        let replacedScope = NativeDataScope(endpoint: first.scope.endpoint, subject: first.scope.subject, mobileEpoch: 2, generation: 2)
        let variants: [(NativeTaskActivitySelection?, Bool)] = [
            (.init(scope: first.scope, conversationID: UUID().uuidString, taskID: first.taskID, latestTurnID: first.latestTurnID, eligible: true), true),
            (.init(scope: first.scope, conversationID: first.conversationID, taskID: UUID().uuidString, latestTurnID: first.latestTurnID, eligible: true), true),
            (.init(scope: first.scope, conversationID: first.conversationID, taskID: first.taskID, latestTurnID: UUID().uuidString, eligible: true), true),
            (.init(scope: replacedScope, conversationID: first.conversationID, taskID: first.taskID, latestTurnID: first.latestTurnID, eligible: true), true),
            (.init(scope: first.scope, conversationID: first.conversationID, taskID: first.taskID, latestTurnID: first.latestTurnID, eligible: false), true),
            (first, false), (nil, false)
        ]
        for (next, active) in variants {
            let store = NativeTaskActivityStore()
            store.bind(selection: first, active: true)
            await store.load(selection: first, currentSelection: { store.boundSelection }, active: { store.boundActive }, request: { _, _ in
                store.bind(selection: next, active: active)
                await Task.yield()
                return try self.wire(first)
            })
            XCTAssertEqual(store.state, .idle)
            XCTAssertNil(store.visible(selection: first, active: true))
        }
    }

    @MainActor func testSameTaskWrongLatestTurnAndOversizeWireCannotBecomeCurrent() async throws {
        let first = selection(), store = NativeTaskActivityStore()
        store.bind(selection: first, active: true)
        await store.load(selection: first, currentSelection: { first }, active: { true }, request: { _, _ in
            try self.wire(first, edits: ["turnId": UUID().uuidString])
        })
        XCTAssertEqual(store.state, .unavailable)
        await store.load(selection: first, currentSelection: { first }, active: { true }, request: { _, _ in Data(repeating: 32, count: 10001) })
        XCTAssertEqual(store.state, .unavailable); XCTAssertNil(store.visible(selection: first, active: true))
    }

}

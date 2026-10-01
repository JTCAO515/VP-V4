import XCTest
@testable import VisePanda

nonisolated final class NativeJourneysTests: XCTestCase {
    private let conversation = "10000000-0000-4000-8000-000000000001"
    private let goal = "20000000-0000-4000-8000-000000000001"
    private let trip = "30000000-0000-4000-8000-000000000001"
    private var scope: NativeDataScope { .init(endpoint: "http://127.0.0.1", subject: "owner", mobileEpoch: 1, generation: 1) }
    private func data(_ value: Any) throws -> Data { try JSONSerialization.data(withJSONObject: value) }
    private func policy(_ state: String = "accepted") throws -> Data {
        try data(["version":5,"kind":"policy","policy":["id":conversation,"provider":"qwen","recipient":"test","sourceRegion":"test","processingRegion":"test","storageRegion":"test","termsVersion":"test","noticeVersion":"test","noticeHash":String(repeating:"a",count:64),"noticeZh":"test","noticeEn":"test","retention":"retain_after_hide_v1","expiresAt":"2099-01-01","consentState":state]])
    }
    private func wire(_ path: String, linked: Bool = false, revision: Int = 1) throws -> Data {
        if path.hasSuffix("/policy") { return try policy() }
        if path == "api/trips/native/v2" { return try data(["version":2,"trips":[["id":trip,"title":"Saved Shanghai","headVersion":2,"updatedAt":"2026-10-02"]],"currentTripId":NSNull()]) }
        if path.hasSuffix("/conversation") { return try data(["version":5,"kind":"conversation","conversationId":conversation,"goals":[["goalId":goal,"scopeVersion":1,"text":"China someday, dates undecided"]]]) }
        return try data(["version":5,"kind":"goal_trip_link","conversationId":conversation,"goalId":goal,"goalScopeVersion":revision,"linkVersion":linked ? 1 : 0,"tripId":linked ? trip as Any : NSNull(),"tripHeadVersion":linked ? 2 as Any : NSNull(),"terminalUnlinked":false,"current":linked])
    }

    @MainActor
    func testUndatedGoalAndOwnedTripHaveDistinctIdentityAndNoWriterRequests() async throws {
        let store = NativeJourneysStore(); var paths: [String] = []
        await store.load(scope: scope, assistant: true, currentScope: { self.scope }) { path in
            paths.append(path); return try self.wire(path)
        }
        XCTAssertEqual(store.rows.first?.goal.text, "China someday, dates undecided")
        XCTAssertEqual(store.rows.first?.relation, .unlinked)
        XCTAssertEqual(store.trips.first?.id, trip)
        XCTAssertTrue(store.goalsAvailable); XCTAssertTrue(store.tripsAvailable)
        XCTAssertEqual(paths, ["api/trips/native/v2","api/chat/native/v5/policy","api/chat/native/v5/conversation","api/chat/native/v5/goals/\(goal)/trip","api/chat/native/v5/policy"])
    }
    @MainActor
    func testExactOwnedCurrentTripLinkAndStaleVersion() async throws {
        let store = NativeJourneysStore()
        await store.load(scope: scope, assistant: true, currentScope: { self.scope }) { try self.wire($0, linked: true) }
        XCTAssertEqual(store.rows.first?.relation, .linked(trip))
        await store.load(scope: scope, assistant: true, currentScope: { self.scope }) { try self.wire($0, linked: true, revision: 2) }
        XCTAssertEqual(store.rows.first?.relation, .unknown)
        for patch in [["tripHeadVersion": 3 as Any], ["tripId": "40000000-0000-4000-8000-000000000001" as Any]] {
            await store.load(scope: scope, assistant: true, currentScope: { self.scope }) { path in
                let bytes = try self.wire(path, linked: true)
                guard path.hasSuffix("/trip") else { return bytes }
                var reply = try XCTUnwrap(JSONSerialization.jsonObject(with: bytes) as? [String:Any])
                for (key,value) in patch { reply[key] = value }
                return try self.data(reply)
            }
            XCTAssertEqual(store.rows.first?.relation, .unknown)
        }
    }
    @MainActor
    func testMissingLinkFieldsAreUnknownRatherThanUnlinked() async throws {
        let store = NativeJourneysStore()
        await store.load(scope: scope, assistant: true, currentScope: { self.scope }) { path in
            path.hasSuffix("/trip") ? try self.data(["version":5,"kind":"goal_trip_link"]) : try self.wire(path)
        }
        XCTAssertEqual(store.rows.first?.relation, .unknown)
    }
    @MainActor
    func testWithdrawalDuringReadHidesGoalsButRetainsIndependentTripList() async throws {
        let store = NativeJourneysStore(); var policies = 0
        await store.load(scope: scope, assistant: true, currentScope: { self.scope }) { path in
            if path.hasSuffix("/policy") { policies += 1; return try self.policy(policies == 1 ? "accepted" : "withdrawn") }
            return try self.wire(path)
        }
        XCTAssertTrue(store.rows.isEmpty); XCTAssertFalse(store.goalsAvailable)
        XCTAssertTrue(store.tripsAvailable); XCTAssertEqual(store.trips.count, 1)
    }
    @MainActor
    func testAccountSwitchAndLateReadAfterClearCannotPublish() async throws {
        let store = NativeJourneysStore(); var current: NativeDataScope? = scope
        await store.load(scope: scope, assistant: true, currentScope: { current }) { path in
            current = nil; return try self.wire(path)
        }
        XCTAssertTrue(store.rows.isEmpty); XCTAssertTrue(store.trips.isEmpty)
        await store.load(scope: scope, assistant: true, currentScope: { self.scope }) { path in
            store.clear(); return try self.wire(path)
        }
        XCTAssertNil(store.scope); XCTAssertTrue(store.trips.isEmpty)
        var pending: CheckedContinuation<Data, Error>?
        let read = Task {
            await store.load(scope: self.scope, assistant: true, currentScope: { self.scope }) { _ in
                try await withCheckedThrowingContinuation { pending = $0 }
            }
        }
        while pending == nil { await Task.yield() }
        store.clear()
        pending?.resume(returning: try wire("api/trips/native/v2"))
        await read.value
        XCTAssertNil(store.scope); XCTAssertTrue(store.rows.isEmpty); XCTAssertTrue(store.trips.isEmpty)
    }
    @MainActor
    func testExpiryIsRequestBoundAndOldModeKeepsTripReadsOnly() async throws {
        let store = NativeJourneysStore(); let start = Date(timeIntervalSince1970: 1000); var clock = start
        await store.load(scope: scope, assistant: false, currentScope: { self.scope }, request: { path in
            XCTAssertEqual(path, "api/trips/native/v2"); clock = start.addingTimeInterval(10)
            return try self.wire(path)
        }, now: { clock })
        XCTAssertTrue(store.isCurrent(scope, now: start.addingTimeInterval(19)))
        XCTAssertFalse(store.isCurrent(scope, now: start.addingTimeInterval(20)))
        XCTAssertFalse(store.goalsAvailable); XCTAssertTrue(store.tripsAvailable)
    }
    @MainActor
    func testMalformedAndOversizedGoalListNeverBecomesEmptySuccess() async throws {
        for malformed in [true, false] {
            let store = NativeJourneysStore()
            await store.load(scope: scope, assistant: true, currentScope: { self.scope }) { path in
                if path.hasSuffix("/conversation") {
                    let row: [String:Any] = malformed ? ["goalId":self.goal,"text":"missing version"] : ["goalId":self.goal,"scopeVersion":1,"text":"duplicate/over bound"]
                    return try self.data(["version":5,"kind":"conversation","conversationId":self.conversation,"goals":Array(repeating:row,count:malformed ? 1 : 51)])
                }
                return try self.wire(path)
            }
            XCTAssertFalse(store.goalsAvailable); XCTAssertTrue(store.rows.isEmpty); XCTAssertTrue(store.tripsAvailable)
        }
    }
    @MainActor
    func testTripEntryReloadsThenSelectsOnlyTheOwnedRequestedID() async {
        let selected = NativeJourneyTripSelection(tripID: trip, scope: scope)
        var paths: [String] = []
        let opened = await NativeJourneyTripEntry.open(selected, currentScope: { self.scope }, reload: {
            paths.append("reload")
            return [.init(id: self.trip, title: "Owned", headVersion: 2, updatedAt: "today")]
        }, select: { id in paths.append(id); return true })
        XCTAssertTrue(opened); XCTAssertEqual(paths, ["reload", trip])
    }
    @MainActor
    func testTripEntryRejectsMissingIDAndScopeReplacementAfterReload() async {
        for replaced in [false, true] {
            let selected = NativeJourneyTripSelection(tripID: trip, scope: scope)
            var current: NativeDataScope? = scope; var selects = 0
            let opened = await NativeJourneyTripEntry.open(selected, currentScope: { current }, reload: {
                if replaced { current = .init(endpoint: self.scope.endpoint, subject: "other", mobileEpoch: 2, generation: 2) }
                return replaced ? [.init(id: self.trip, title: "Old owner", headVersion: 2, updatedAt: "today")] : []
            }, select: { _ in selects += 1; return true })
            XCTAssertFalse(opened); XCTAssertEqual(selects, 0)
        }
    }
    @MainActor
    func testTripEntrySelectionFailureCannotFallBackToAnotherTrip() async {
        let opened = await NativeJourneyTripEntry.open(.init(tripID: trip, scope: scope), currentScope: { self.scope }, reload: {
            [.init(id: self.trip, title: "Owned", headVersion: 2, updatedAt: "today")]
        }, select: { _ in false })
        XCTAssertFalse(opened)
    }

}

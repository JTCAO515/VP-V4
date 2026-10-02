import XCTest
@testable import VisePanda

nonisolated final class NativeJourneyGoalIndexTests: XCTestCase {
    @MainActor private func qualification(epoch: Int = 1, consent: NativeTextPolicy.Consent = .accepted,
                                          expiry: String = "2099-01-01T00:00:00Z") -> NativeJourneyGoalIndexQualification {
        .init(scope: .init(endpoint: "http://127.0.0.1:1", subject: "owner-a", mobileEpoch: epoch, generation: epoch),
              policy: .init(id: "10000000-0000-4000-8000-000000000001", provider: "qwen", recipient: "test recipient",
                            sourceRegion: "test", processingRegion: "test", storageRegion: "test", termsVersion: "1",
                            noticeVersion: "1", noticeHash: String(repeating: "a", count: 64), noticeZh: "测试", noticeEn: "Test",
                            retention: "retain_after_hide_v1", expiresAt: expiry, consentState: consent))
    }

    private func row(_ n: Int, version: Int = 1, relation: String = "unlinked") -> [String: Any] {
        ["conversationId": "10000000-0000-4000-8000-000000000001",
         "goalId": String(format: "20000000-0000-4000-8000-%012x", n), "scopeVersion": version, "text": "Goal \(n)",
         "relation": ["state": relation, "tripId": NSNull(), "tripHeadVersion": NSNull()]]
    }
    private func value(_ indices: Range<Int>, snapshot: String = String(repeating: "a", count: 32), more: Bool = false) -> [String: Any] {
        let rows = indices.map { row($0) }
        let cursor: Any = more ? "v1.\(rows.last!["conversationId"]!).\(rows.last!["goalId"]!).\(snapshot)" : NSNull()
        return ["version": 5, "kind": "journeys_goal_index", "snapshot": snapshot, "goals": rows, "nextCursor": cursor]
    }
    private func bytes(_ value: [String: Any]) throws -> Data { try JSONSerialization.data(withJSONObject: value) }
    @MainActor private func decode(_ value: [String: Any]) throws -> NativeJourneyGoalIndexPage {
        try JSONDecoder().decode(NativeJourneyGoalIndexPage.self, from: bytes(value))
    }

    @MainActor func testClosedPageBoundsOrderingCursorAndTerminalVersion() throws {
        let valid = value(1..<21, more: true)
        XCTAssertEqual(try decode(valid).goals.count, 20)
        var terminal = value(1..<2)
        terminal["goals"] = [row(1, version: 10001)]
        XCTAssertFalse(try decode(terminal).goals[0].canAmend)
        var cases: [[String: Any]] = []
        var invalid = valid; invalid["version"] = 6; cases.append(invalid)
        invalid = valid; invalid["extra"] = true; cases.append(invalid)
        invalid = valid; invalid.removeValue(forKey: "nextCursor"); cases.append(invalid)
        invalid = value(1..<22); cases.append(invalid)
        invalid = value(1..<3); invalid["goals"] = [row(2), row(1)]; cases.append(invalid)
        invalid = value(1..<3); invalid["goals"] = [row(1), row(1)]; cases.append(invalid)
        invalid = terminal; invalid["goals"] = [row(1, version: 10002)]; cases.append(invalid)
        invalid = valid; invalid["nextCursor"] = "v1.10000000-0000-4000-8000-000000000001.20000000-0000-4000-8000-000000000001.\(String(repeating: "a", count: 32))"; cases.append(invalid)
        for candidate in cases { XCTAssertThrowsError(try decode(candidate)) }
        // UUID raw byte/hex order is used, with no locale-aware comparison.
        let page = try decode(value(9..<12))
        XCTAssertEqual(page.goals.map { String($0.goal.goalId.suffix(2)) }, ["09", "0a", "0b"])
    }

    @MainActor func testUnknownRelationDropsTripAuthorityAndKnownUnknownRejectsLeak() throws {
        var future = row(1)
        future["relation"] = ["state": "future_relation", "tripId": "30000000-0000-4000-8000-000000000001", "tripHeadVersion": 8]
        var wire = value(1..<2); wire["goals"] = [future]
        let projected = try decode(wire).goals[0]
        XCTAssertEqual(projected.relation, .unknown); XCTAssertNil(projected.tripHeadVersion)
        future["relation"] = ["state": "unknown", "tripId": "30000000-0000-4000-8000-000000000001", "tripHeadVersion": 8]
        wire["goals"] = [future]
        XCTAssertThrowsError(try decode(wire))
    }

    @MainActor func testPageReplacementSnapshotFailureRequiresExplicitFirstRead() async throws {
        let q = qualification(); let store = NativeJourneyGoalIndexStore()
        let first = try bytes(value(1..<21, more: true))
        await store.reloadFirst(qualification: q, currentQualification: { q }, foreground: { true }, read: { cursor in
            XCTAssertNil(cursor); return first
        })
        XCTAssertEqual(store.visiblePage(qualification: q, foreground: true)?.goals.count, 20)
        var held: CheckedContinuation<Data, Never>?
        let next = Task { await store.loadNext(qualification: q, currentQualification: { q }, foreground: { true }, read: { _ in
            await withCheckedContinuation { held = $0 }
        }) }
        while held == nil { await Task.yield() }
        XCTAssertEqual(store.state, .loading)
        XCTAssertNil(store.visiblePage(qualification: q, foreground: true))
        held?.resume(returning: try bytes(value(21..<23, snapshot: String(repeating: "b", count: 32))))
        await next.value
        XCTAssertEqual(store.state, .unavailable)
        var calls = 0
        await store.loadNext(qualification: q, currentQualification: { q }, foreground: { true }, read: { _ in calls += 1; return first })
        XCTAssertEqual(calls, 0)
        await store.reloadFirst(qualification: q, currentQualification: { q }, foreground: { true }, read: { cursor in
            XCTAssertNil(cursor); return first
        })
        XCTAssertEqual(store.state, .ready)
        let second = try bytes(value(21..<23))
        await store.loadNext(qualification: q, currentQualification: { q }, foreground: { true }, read: { cursor in
            XCTAssertNotNil(cursor); return second
        })
        XCTAssertEqual(store.visiblePage(qualification: q, foreground: true)?.goals.map { $0.goal.text }, ["Goal 21", "Goal 22"])
    }

    @MainActor func testContinuationMustFollowAnchorAndSnapshot() throws {
        let first = try decode(value(1..<21, more: true))
        let cursor = try XCTUnwrap(first.nextCursor.flatMap(NativeJourneyGoalIndexCursor.init))
        XCTAssertTrue(try decode(value(21..<23)).follows(cursor))
        XCTAssertFalse(try decode(value(20..<22)).follows(cursor))
        XCTAssertFalse(try decode(value(21..<23, snapshot: String(repeating: "b", count: 32))).follows(cursor))
    }

    @MainActor func testTTLStartsBeforeDispatchAndExpiryDropsPage() async throws {
        var tick: TimeInterval = 10
        let q = qualification(); let data = try bytes(value(1..<2))
        let store = NativeJourneyGoalIndexStore(uptime: { tick })
        await store.reloadFirst(qualification: q, currentQualification: { q }, foreground: { true }, read: { _ in tick = 29; return data })
        XCTAssertNotNil(store.visiblePage(qualification: q, foreground: true))
        tick = 30
        XCTAssertNil(store.visiblePage(qualification: q, foreground: true)); XCTAssertEqual(store.state, .unavailable)
        await store.reloadFirst(qualification: q, currentQualification: { q }, foreground: { true }, read: { _ in tick = 50; return data })
        XCTAssertEqual(store.state, .unavailable)
    }

    @MainActor func testActorConsentAndForegroundChangesRejectLateResponse() async throws {
        let data = try bytes(value(1..<2)); let q = qualification()
        for change in 0..<4 {
            let store = NativeJourneyGoalIndexStore()
            var current: NativeJourneyGoalIndexQualification? = q
            var foreground = true
            var held: CheckedContinuation<Data, Never>?
            let load = Task { await store.reloadFirst(qualification: q, currentQualification: { current }, foreground: { foreground }, read: { _ in
                await withCheckedContinuation { held = $0 }
            }) }
            while held == nil { await Task.yield() }
            switch change {
            case 0: current = qualification(epoch: 2)
            case 1: current = qualification(consent: .withdrawn)
            case 2: foreground = false
            default:
                foreground = false
                XCTAssertNil(store.visiblePage(qualification: q, foreground: foreground))
                foreground = true
            }
            held?.resume(returning: data); await load.value
            XCTAssertEqual(store.state, .unavailable)
            XCTAssertNil(store.visiblePage(qualification: current, foreground: foreground))
        }
    }

    @MainActor func testExpiredQualificationDoesNotDispatch() async {
        let q = qualification(expiry: "2000-01-01T00:00:00Z")
        let store = NativeJourneyGoalIndexStore()
        var calls = 0
        await store.reloadFirst(qualification: q, currentQualification: { q }, foreground: { true }, read: { _ in
            calls += 1; return Data()
        })
        XCTAssertEqual(calls, 0); XCTAssertEqual(store.state, .unavailable)
    }

    @MainActor func testNewGenerationWinsAndUnavailableThrowsDropsContinuation() async throws {
        let q = qualification(); let store = NativeJourneyGoalIndexStore()
        var held: CheckedContinuation<Data, Never>?
        let old = Task { await store.reloadFirst(qualification: q, currentQualification: { q }, foreground: { true }, read: { _ in
            await withCheckedContinuation { held = $0 }
        }) }
        while held == nil { await Task.yield() }
        let fresh = try bytes(value(9..<10))
        await store.reloadFirst(qualification: q, currentQualification: { q }, foreground: { true }, read: { _ in fresh })
        held?.resume(returning: try bytes(value(1..<21, more: true))); await old.value
        XCTAssertEqual(store.visiblePage(qualification: q, foreground: true)?.goals.first?.goal.text, "Goal 9")
        await store.reloadFirst(qualification: q, currentQualification: { q }, foreground: { true }, read: { _ in throw NativeDataError.server(code: "DATA_POLICY_BLOCKED") })
        XCTAssertEqual(store.state, .unavailable)
        XCTAssertNil(store.visiblePage(qualification: q, foreground: true))
    }

    @MainActor func testJourneysHostUsesEachConversationAndDropsUnavailableContinuation() async throws {
        let q = qualification(); let store = NativeJourneysStore()
        let policy: [String: Any] = ["version": 5, "kind": "policy", "policy": [
            "id": q.policy.id, "provider": "qwen", "recipient": "test", "sourceRegion": "test", "processingRegion": "test", "storageRegion": "test",
            "termsVersion": "1", "noticeVersion": "1", "noticeHash": q.policy.noticeHash, "noticeZh": "测试", "noticeEn": "Test",
            "retention": "retain_after_hide_v1", "expiresAt": q.policy.expiresAt, "consentState": "accepted"]]
        var fail = false; var paths: [String] = []
        let request: (String) async throws -> Data = { path in
            paths.append(path)
            if path == "api/trips/native/v2" { return try self.bytes(["version": 2, "trips": [], "currentTripId": NSNull()]) }
            if path.hasSuffix("/policy") { return try self.bytes(policy) }
            XCTAssertTrue(path.hasPrefix("api/chat/native/v5/journeys-goals"))
            if fail { throw NativeDataError.server(code: "DATA_POLICY_BLOCKED") }
            return try self.bytes(self.value(1..<21, more: true))
        }
        await store.load(scope: q.scope, assistant: true, crossConversation: true, currentScope: { q.scope }, request: request)
        XCTAssertTrue(store.goalsAvailable); XCTAssertEqual(store.rows.count, 20)
        XCTAssertEqual(store.rows.first?.conversationID, "10000000-0000-4000-8000-000000000001")
        XCTAssertNil(store.conversationID)
        let cursor = try XCTUnwrap(store.nextCursor)
        store.beginPageChange(); XCTAssertTrue(store.rows.isEmpty)
        fail = true
        await store.load(scope: q.scope, assistant: true, cursor: cursor, crossConversation: true, currentScope: { q.scope }, request: request)
        XCTAssertFalse(store.goalsAvailable); XCTAssertNil(store.nextCursor); XCTAssertTrue(store.rows.isEmpty)
        XCTAssertFalse(paths.contains("api/chat/native/v5/journeys"))
    }

    @MainActor func testLateHostReadCannotEraseNewerIndexPage() async throws {
        let q = qualification(); let store = NativeJourneysStore()
        let policy = try bytes(["version": 5, "kind": "policy", "policy": [
            "id": q.policy.id, "provider": "qwen", "recipient": "test", "sourceRegion": "test", "processingRegion": "test", "storageRegion": "test",
            "termsVersion": "1", "noticeVersion": "1", "noticeHash": q.policy.noticeHash, "noticeZh": "测试", "noticeEn": "Test",
            "retention": "retain_after_hide_v1", "expiresAt": q.policy.expiresAt, "consentState": "accepted"]])
        let trips = try bytes(["version": 2, "trips": [], "currentTripId": NSNull()])
        var held: CheckedContinuation<Data, Never>?
        let old = Task { await store.load(scope: q.scope, assistant: true, crossConversation: true, currentScope: { q.scope }) { path in
            if path.hasSuffix("/policy") { return policy }
            if path == "api/trips/native/v2" { return trips }
            return await withCheckedContinuation { held = $0 }
        } }
        while held == nil { await Task.yield() }
        let newer = try bytes(value(9..<10))
        await store.load(scope: q.scope, assistant: true, crossConversation: true, currentScope: { q.scope }) { path in
            path.hasSuffix("/policy") ? policy : path == "api/trips/native/v2" ? trips : newer
        }
        held?.resume(returning: try bytes(value(1..<21, more: true))); await old.value
        XCTAssertEqual(store.rows.first?.goal.text, "Goal 9")
        XCTAssertTrue(store.isCurrent(q.scope)); XCTAssertTrue(store.goalsAvailable)
    }
}

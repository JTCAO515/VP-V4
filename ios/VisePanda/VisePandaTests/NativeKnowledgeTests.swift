import XCTest
@testable import VisePanda

nonisolated final class NativeKnowledgeTests: XCTestCase {
    @MainActor private func payload(city: String = "shanghai", locale: String = "en", seconds: Int = 60, text: String = "Reviewed note") throws -> Data {
        let assertion = ["subjectId": "merchant", "predicate": "accepts_method", "objectId": "card", "conditions": ["operator_support"], "exclusions": ["success_guarantee"]] as [String: Any]
        let row: [String: Any] = ["factId": "11111111-1111-4111-8111-111111111111", "version": 1, "assertionId": "22222222-2222-4222-8222-222222222222", "assertionRevision": 1, "assertion": assertion, "text": text, "conditions": ["Confirm operator support."], "exclusions": ["No success guarantee."], "reviewedAt": "2026-09-12T00:00:00Z", "publishedAt": "2026-09-12T01:00:00Z", "expiresAt": seconds == 60 ? "2026-09-13T00:01:00Z" : "2026-09-13T00:00:05Z", "sources": [["sourceRevisionId": "33333333-3333-4333-8333-333333333333", "publisher": "Test publisher", "uri": "https://example.test/source", "locator": "Section 1"]]]
        return try JSONSerialization.data(withJSONObject: ["data": ["schemaVersion": "knowledge-read/1", "evaluatedAt": "2026-09-13T00:00:00Z", "scope": ["city": city, "scene": "payment", "locale": locale], "purpose": "trip_planning", "recipient": "first_party", "territory": "CN-mainland", "status": "available", "statements": [row]]])
    }
    @MainActor private var owner: NativeDataScope { .init(endpoint: "http://127.0.0.1", subject: "owner-a", mobileEpoch: 1, generation: 1) }
    @MainActor private var selection: NativeKnowledgeSelection { .init(city: "shanghai", scene: "payment", locale: "en") }

    @MainActor func testScopeLanguageRecipientAndConditionsAreValidated() async throws {
        let store = NativeKnowledgeStore()
        await store.load(scope: owner, selection: selection) { try payload() }
        XCTAssertEqual(store.state, .ready)
        XCTAssertEqual(store.rows.first?.conditions, ["Confirm operator support."])
        XCTAssertEqual(store.rows.first?.exclusions, ["No success guarantee."])
        await store.load(scope: owner, selection: selection) { try payload(locale: "zh") }
        XCTAssertEqual(store.state, .unavailable)
        XCTAssertTrue(store.rows.isEmpty)
        await store.load(scope: owner, selection: selection) { try payload(city: "beijing") }
        XCTAssertEqual(store.state, .unavailable)
        for mutation in ["recipient", "conditions", "status", "duplicate"] {
            var root = try XCTUnwrap(JSONSerialization.jsonObject(with: payload()) as? [String: Any])
            var data = try XCTUnwrap(root["data"] as? [String: Any])
            var rows = try XCTUnwrap(data["statements"] as? [[String: Any]])
            if mutation == "recipient" { data["recipient"] = "model" }
            if mutation == "status" { data["status"] = "no_eligible_content" }
            if mutation == "conditions" { rows[0]["conditions"] = []; data["statements"] = rows }
            if mutation == "duplicate" { data["statements"] = rows + rows }
            root["data"] = data
            let malformed = try JSONSerialization.data(withJSONObject: root)
            await store.load(scope: owner, selection: selection) { malformed }
            XCTAssertEqual(store.state, .unavailable, mutation)
            XCTAssertTrue(store.rows.isEmpty)
        }
    }

    @MainActor func testServerExpiryUsesMonotonicLifetimeAndIncludesRequestDuration() async throws {
        var clock: TimeInterval = 100
        let store = NativeKnowledgeStore(uptime: { clock })
        await store.load(scope: owner, selection: selection) { clock += 2; return try payload(seconds: 5) }
        XCTAssertEqual(store.refreshDelay, 3, accuracy: 0.001)
        XCTAssertTrue(store.isCurrent(scope: owner, selection: selection))
        clock += 3
        XCTAssertFalse(store.isCurrent(scope: owner, selection: selection))
        await store.load(scope: owner, selection: selection) { clock += 6; return try payload(seconds: 5) }
        XCTAssertEqual(store.state, .unavailable)
        XCTAssertTrue(store.rows.isEmpty)
    }

    @MainActor func testLateSelectionResponseCannotReplaceNewContent() async throws {
        let store = NativeKnowledgeStore(), barrier = KnowledgeReadBarrier()
        let old = try payload(), next = NativeKnowledgeSelection(city: "beijing", scene: "payment", locale: "en")
        let delayed = Task { await store.load(scope: owner, selection: selection) { await barrier.wait() } }
        await barrier.awaitStart()
        await store.load(scope: owner, selection: next) { try payload(city: "beijing", text: "New city") }
        await barrier.finish(old)
        await delayed.value
        XCTAssertEqual(store.rows.first?.text, "New city")
        XCTAssertEqual(store.selection, next)
    }

    @MainActor func testAccountLossAndBackgroundClearRejectOutstandingResponse() async throws {
        let store = NativeKnowledgeStore(), barrier = KnowledgeReadBarrier()
        let old = try payload()
        let delayed = Task { await store.load(scope: owner, selection: selection) { await barrier.wait() } }
        await barrier.awaitStart()
        store.clear()
        await barrier.finish(old)
        await delayed.value
        XCTAssertTrue(store.rows.isEmpty)
        XCTAssertNil(store.scope)
        XCTAssertFalse(store.isCurrent(scope: owner, selection: selection))
    }

    @MainActor func testRefreshFailureNeverKeepsPreviouslyReadableText() async throws {
        let store = NativeKnowledgeStore()
        await store.load(scope: owner, selection: selection) { try payload() }
        XCTAssertEqual(store.rows.count, 1)
        await store.load(scope: owner, selection: selection) { throw URLError(.notConnectedToInternet) }
        XCTAssertEqual(store.state, .unavailable)
        XCTAssertTrue(store.rows.isEmpty)
        var called = false
        await store.load(scope: nil, selection: selection) { called = true; return try payload() }
        XCTAssertFalse(called)
    }

    @MainActor func testEmptyEligibleResultIsHonestAndRefreshIsBounded() async throws {
        let store = NativeKnowledgeStore(uptime: { 100 })
        var root = try XCTUnwrap(JSONSerialization.jsonObject(with: payload()) as? [String: Any])
        var data = try XCTUnwrap(root["data"] as? [String: Any])
        data["statements"] = []; data["status"] = "no_eligible_content"; root["data"] = data
        let empty = try JSONSerialization.data(withJSONObject: root)
        await store.load(scope: owner, selection: selection) { empty }
        XCTAssertEqual(store.state, .empty)
        XCTAssertEqual(store.refreshDelay, 30)
    }
}

private actor KnowledgeReadBarrier {
    private var response: CheckedContinuation<Data, Never>?
    private var started: CheckedContinuation<Void, Never>?
    func wait() async -> Data {
        await withCheckedContinuation { response = $0; started?.resume(); started = nil }
    }
    func awaitStart() async {
        if response != nil { return }
        await withCheckedContinuation { started = $0 }
    }
    func finish(_ data: Data) { response?.resume(returning: data); response = nil }
}

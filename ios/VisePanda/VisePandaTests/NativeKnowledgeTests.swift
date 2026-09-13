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
    @MainActor private func questionPayload(partial: Bool = false, invalid: String? = nil) throws -> Data {
        var root = try XCTUnwrap(JSONSerialization.jsonObject(with: payload()) as? [String: Any])
        var data = try XCTUnwrap(root["data"] as? [String: Any])
        let original = try XCTUnwrap((data["statements"] as? [[String: Any]])?.first)
        var rows: [[String: Any]] = []
        var claims: [[String: Any]] = []
        for (index, required) in NativeKnowledgeAnswer.required.enumerated() {
            var row = original
            let id = index == 0 ? "11111111-1111-4111-8111-111111111111" : "44444444-4444-4444-8444-444444444444"
            row["factId"] = id
            var assertion = try XCTUnwrap(row["assertion"] as? [String: Any])
            assertion["subjectId"] = "rail_eticket_boarding"; assertion["predicate"] = "requires_document"; assertion["objectId"] = required
            row["assertion"] = assertion
            let missing = partial && index == 1
            if !missing { rows.append(row) }
            claims.append(["id": required, "status": missing ? "unavailable" : "covered", "reasons": missing ? ["revoked"] : [], "factIds": missing ? [] : [id]])
        }
        var answer: [String: Any] = ["questionId": "rail_boarding_documents", "questionVersion": 1, "outcome": partial ? "partial" : "answered", "claims": claims]
        if invalid == "false_complete" { answer["outcome"] = "answered" }
        if invalid == "missing_claim" { answer["claims"] = [claims[0]] }
        if invalid == "wrong_question" { answer["questionId"] = "book_train" }
        if invalid == "unbound_fact" { rows[0]["factId"] = "55555555-5555-4555-8555-555555555555" }
        if invalid == "wrong_relation" {
            var assertion = try XCTUnwrap(rows[0]["assertion"] as? [String: Any]); assertion["objectId"] = "other"; rows[0]["assertion"] = assertion
        }
        data["schemaVersion"] = "knowledge-answer/1"; data["scope"] = ["city": "shanghai", "scene": "rail", "locale": "en"]
        data["answer"] = answer; data["statements"] = rows; root["data"] = data
        return try JSONSerialization.data(withJSONObject: root)
    }

    @MainActor func testPaymentQuestionRelationsAndExplicitRailSelectionStayBound() throws {
        let ids = ["payment_card_acceptance", "payment_mobile_setup", "payment_cash_access", "payment_card_and_mobile", "payment_card_and_cash", "payment_mobile_and_cash", "payment_getting_started"]
        for id in ids {
            var root = try XCTUnwrap(JSONSerialization.jsonObject(with: questionPayload()) as? [String: Any])
            var data = try XCTUnwrap(root["data"] as? [String: Any])
            let template = try XCTUnwrap((data["statements"] as? [[String: Any]])?.first)
            let definition = try XCTUnwrap(NativeKnowledgeAnswer.definition(id))
            var rows: [[String: Any]] = [], claims: [[String: Any]] = []
            for obligation in definition.claims {
                var row = template
                let factId = UUID().uuidString
                row["factId"] = factId
                var assertion = try XCTUnwrap(row["assertion"] as? [String: Any])
                assertion["subjectId"] = obligation.subject; assertion["predicate"] = obligation.predicate; assertion["objectId"] = obligation.object
                row["assertion"] = assertion; rows.append(row)
                claims.append(["id": obligation.object, "status": "covered", "reasons": [], "factIds": [factId]])
            }
            data["statements"] = rows; data["scope"] = ["city": "shanghai", "scene": "payment", "locale": "en"]
            data["answer"] = ["questionId": id, "questionVersion": 1, "outcome": "answered", "claims": claims]
            root["data"] = data
            let read = try JSONDecoder().decode(NativeKnowledgeReply.self, from: JSONSerialization.data(withJSONObject: root)).data
            let selection = NativeKnowledgeSelection(city: "shanghai", scene: "payment", locale: "en")
            XCTAssertGreaterThan(try read.lifetime(for: selection, elapsed: 0, question: true, questionId: id), 0)
            XCTAssertThrowsError(try read.lifetime(for: selection, elapsed: 0, question: true), "The explicit rail question cannot consume a payment answer")
            var first = rows[0]
            var assertion = try XCTUnwrap(first["assertion"] as? [String: Any]); assertion["subjectId"] = "wrong_subject"
            first["assertion"] = assertion; rows[0] = first; data["statements"] = rows; root["data"] = data
            let invalid = try JSONDecoder().decode(NativeKnowledgeReply.self, from: JSONSerialization.data(withJSONObject: root)).data
            XCTAssertThrowsError(try invalid.lifetime(for: selection, elapsed: 0, question: true, questionId: id))
        }
    }

    @MainActor func testExplicitQuestionKeepsPartialFactsAndWithdrawalReason() async throws {
        let store = NativeKnowledgeStore(), rail = NativeKnowledgeSelection(city: "shanghai", scene: "rail", locale: "en")
        await store.load(scope: owner, selection: rail, question: true) { try questionPayload() }
        XCTAssertEqual(store.answer?.outcome, "answered"); XCTAssertEqual(store.rows.count, 2)
        await store.load(scope: owner, selection: rail, question: true) { try questionPayload(partial: true) }
        XCTAssertEqual(store.answer?.outcome, "partial"); XCTAssertEqual(store.rows.count, 1)
        XCTAssertEqual(store.answer?.claims.last?.reasons, ["revoked"])
        XCTAssertEqual(store.rows.first?.conditions, ["Confirm operator support."])
        store.clear(); XCTAssertNil(store.answer); XCTAssertTrue(store.rows.isEmpty)
    }

    @MainActor func testQuestionRejectsFalseCompletenessWrongRelationAndUnboundFacts() async throws {
        let store = NativeKnowledgeStore(), rail = NativeKnowledgeSelection(city: "shanghai", scene: "rail", locale: "en")
        for invalid in ["false_complete", "missing_claim", "wrong_question", "unbound_fact", "wrong_relation"] {
            await store.load(scope: owner, selection: rail, question: true) { try questionPayload(partial: true, invalid: invalid) }
            XCTAssertEqual(store.state, .unavailable, invalid); XCTAssertNil(store.answer); XCTAssertTrue(store.rows.isEmpty)
        }
        await store.load(scope: owner, selection: rail) { try questionPayload() }
        XCTAssertEqual(store.state, .unavailable, "Question response cannot be silently consumed as ordinary notes")
        await store.load(scope: owner, selection: selection, question: true) { try payload() }
        XCTAssertEqual(store.state, .unavailable, "Generic notes cannot be silently promoted to a question answer")
    }


    @MainActor private func groundedTurn(partial: Bool = false, compound: Bool = false) throws -> NativeTextTurn {
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: questionPayload(partial: partial)) as? [String: Any])
        let knowledge = try XCTUnwrap(root["data"])
        let result: [String: Any] = ["type": "reviewed_answer", "city": "shanghai", "intent": "rail_boarding_documents",
            "requestScope": compound ? "additional_needs" : "single", "originalOutcome": partial || compound ? "partial" : "answered",
            "completedAt": "2026-09-13T00:00:00Z", "projection": "current", "knowledge": knowledge]
        let data: [String: Any] = ["turnId": UUID().uuidString, "threadId": UUID().uuidString, "locale": "en",
            "input": "What documents do I need?", "outcome": partial || compound ? "partial" : "answered",
            "output": "reviewed-answer-v1", "status": "completed", "createdAt": "2026-09-13T00:00:00Z",
            "serviceTaskId": UUID().uuidString, "scopeVersion": 1, "relationship": "new_goal", "result": result]
        return try JSONDecoder().decode(NativeTextTurn.self, from: JSONSerialization.data(withJSONObject: data))
    }

    @MainActor func testGroundedProjectionHasBoundedLifetimeAndKeepsCompoundIncomplete() throws {
        for turn in [try groundedTurn(), try groundedTurn(partial: true), try groundedTurn(compound: true)] {
            XCTAssertTrue(turn.valid)
            XCTAssertEqual(try XCTUnwrap(turn.result).lifetime(for: turn, elapsed: 2), 28)
            XCTAssertThrowsError(try XCTUnwrap(turn.result).lifetime(for: turn, elapsed: 30))
        }
        var turn = try groundedTurn()
        let old = try XCTUnwrap(turn.result)
        turn.result = NativeGroundedResult(type: old.type, city: "beijing", intent: old.intent, requestScope: old.requestScope,
            originalOutcome: old.originalOutcome, completedAt: old.completedAt, projection: old.projection, knowledge: old.knowledge)
        XCTAssertThrowsError(try XCTUnwrap(turn.result).lifetime(for: turn, elapsed: 0))
        turn.result = NativeGroundedResult(type: old.type, city: old.city, intent: old.intent, requestScope: "additional_needs",
            originalOutcome: old.originalOutcome, completedAt: old.completedAt, projection: old.projection, knowledge: old.knowledge)
        XCTAssertThrowsError(try XCTUnwrap(turn.result).lifetime(for: turn, elapsed: 0))
    }

    @MainActor func testGroundedUnavailableHidesFactsWithoutChangingSavedOutcome() throws {
        var turn = try groundedTurn()
        let old = try XCTUnwrap(turn.result)
        for retainedFacts in [false, true] {
            turn.result = NativeGroundedResult(type: old.type, city: old.city, intent: old.intent, requestScope: old.requestScope,
                originalOutcome: old.originalOutcome, completedAt: old.completedAt, projection: "unavailable",
                knowledge: retainedFacts ? old.knowledge : nil)
            if retainedFacts { XCTAssertThrowsError(try XCTUnwrap(turn.result).lifetime(for: turn, elapsed: 0)) }
            else { XCTAssertEqual(try XCTUnwrap(turn.result).lifetime(for: turn, elapsed: 3), 27) }
            XCTAssertEqual(turn.outcome, .answered)
        }
    }

    @MainActor func testGroundedPendingRequestRetainsExactCityAcrossEncodingAndRejectsOtherMode() throws {
        let turn = try groundedTurn()
        var request = NativeTextSubmission(threadId: turn.threadId, turnId: turn.turnId, idempotencyKey: UUID().uuidString,
            policyId: UUID().uuidString, locale: turn.locale, text: turn.input,
            serviceTask: .init(id: try XCTUnwrap(turn.serviceTaskId), scopeVersion: 1, relationship: "new_goal", parentTurnId: nil), city: "shanghai")
        func pending(_ mode: NativeAskMode) -> NativePendingAsk {
            .init(schemaVersion: 1, mobileEpoch: 1, mode: mode, noticeVersion: "grounded-v1", noticeHash: String(repeating: "a", count: 64), request: request)
        }
        XCTAssertTrue(request.matches(turn)); XCTAssertTrue(pending(.grounded).valid)
        let restored = try JSONDecoder().decode(NativePendingAsk.self, from: JSONEncoder().encode(pending(.grounded)))
        XCTAssertEqual(restored.request, request)
        XCTAssertFalse(pending(.taskContext).valid)
        request.city = "beijing"; XCTAssertFalse(request.matches(turn))
        request.city = nil; XCTAssertFalse(pending(.grounded).valid)
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

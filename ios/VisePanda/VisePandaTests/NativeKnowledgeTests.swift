import XCTest
import SwiftUI
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

    @MainActor func testPaymentAndSIMRelationsAndExplicitRailSelectionStayBound() throws {
        let ids = ["payment_card_acceptance", "payment_mobile_setup", "payment_cash_access", "payment_card_and_mobile", "payment_card_and_cash", "payment_mobile_and_cash", "payment_getting_started", "connectivity_sim_documents", "connectivity_plan_allowances", "connectivity_getting_started"]
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
            data["statements"] = rows; data["scope"] = ["city": "shanghai", "scene": definition.scene, "locale": "en"]
            data["answer"] = ["questionId": id, "questionVersion": 1, "outcome": "answered", "claims": claims]
            root["data"] = data
            let read = try JSONDecoder().decode(NativeKnowledgeReply.self, from: JSONSerialization.data(withJSONObject: root)).data
            let selection = NativeKnowledgeSelection(city: "shanghai", scene: definition.scene, locale: "en")
            XCTAssertGreaterThan(try read.lifetime(for: selection, elapsed: 0, question: true, questionId: id), 0)
            XCTAssertThrowsError(try read.lifetime(for: selection, elapsed: 0, question: true), "The explicit rail question cannot consume another domain")
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

    @MainActor private func placeTurn(mode: String = "current") throws -> NativeTextTurn {
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: questionPayload()) as? [String: Any])
        var knowledge = try XCTUnwrap(root["data"] as? [String: Any])
        var rows = try XCTUnwrap(knowledge["statements"] as? [[String: Any]])
        let subject = "test_lake_pavilion"
        for index in rows.indices {
            var assertion = try XCTUnwrap(rows[index]["assertion"] as? [String: Any])
            assertion["subjectId"] = mode == "wrong_subject" ? "different_place" : subject
            assertion["predicate"] = index == 0 ? "located_at" : "opens_during"
            assertion["objectId"] = index == 0 ? "place_address" : "opening_hours"
            rows[index]["assertion"] = assertion
            rows[index]["scope"] = ["cities": ["shanghai"], "scene": "attraction", "audience": "international_independent_traveler"]
            rows[index]["text"] = "See the reviewed structured value."
            rows[index]["place"] = ["names": ["en": "Test Lake Pavilion", "zh": "测试湖亭"]]
            rows[index]["value"] = index == 0 ? ["lines": ["3 Test Lake Road"], "countryCode": "CN"] :
                ["startsAt": mode == "wrong_date" ? "2026-09-12T01:00:00Z" : "2026-09-13T01:00:00Z",
                 "endsAt": mode == "wrong_date" ? "2026-09-12T09:00:00Z" : "2026-09-13T09:00:00Z", "timeZone": "Asia/Shanghai"]
            rows[index]["reviewedAt"] = "2026-09-01T00:00:00Z"
            rows[index]["publishedAt"] = "2026-09-02T00:00:00Z"
            rows[index]["expiresAt"] = "2026-09-14T15:00:00Z"
        }
        var claims: [[String: Any]] = try rows.enumerated().map { index, row in
            ["id": index == 0 ? "place_address" : "opening_hours", "status": "covered", "reasons": [], "factIds": [try XCTUnwrap(row["factId"] as? String)]]
        }
        if mode == "partial" {
            rows.removeLast(); claims[1] = ["id": "opening_hours", "status": "unavailable", "reasons": ["not_current_date"], "factIds": []]
        }
        knowledge["statements"] = rows
        knowledge["evaluatedAt"] = mode == "midnight" ? "2026-09-13T15:59:59Z" : "2026-09-13T00:00:00Z"
        knowledge["scope"] = ["city": "shanghai", "scene": "attraction", "locale": "en"]
        knowledge["answer"] = ["questionId": "place_address_and_hours", "questionVersion": 1, "subjectId": subject,
            "outcome": mode == "partial" ? "partial" : "answered", "claims": claims]
        let outcome = mode == "ambiguous" ? "clarification" : mode == "partial" ? "partial" : "answered"
        let result: [String: Any] = ["type": "reviewed_answer", "city": "shanghai", "intent": mode == "ambiguous" ? "clarification" : "place_address_and_hours",
            "requestScope": mode == "ambiguous" ? "unknown" : "single", "unansweredNeeds": [], "originalOutcome": outcome,
            "placeName": mode == "invented_name" ? "Other Museum" : "Test Lake Pavilion", "placeSubjectId": mode == "ambiguous" ? NSNull() : subject,
            "placeResolution": mode == "ambiguous" ? "ambiguous" : "matched", "completedAt": "2026-09-13T00:00:00Z",
            "projection": "current", "knowledge": mode == "ambiguous" ? NSNull() : knowledge]
        let data: [String: Any] = ["turnId": UUID().uuidString, "threadId": UUID().uuidString, "locale": "en",
            "input": "What are Test Lake Pavilion’s address and opening time today?", "outcome": outcome,
            "output": "reviewed-answer-v1", "status": "completed", "createdAt": "2026-09-13T00:00:00Z",
            "serviceTaskId": UUID().uuidString, "scopeVersion": 1, "relationship": "new_goal", "result": result]
        return try JSONDecoder().decode(NativeTextTurn.self, from: JSONSerialization.data(withJSONObject: data))
    }

    @MainActor func testPlaceSelectionTypedValuesAndLocalDateAreBoundToSavedTask() throws {
        for mode in ["current", "partial", "ambiguous"] {
            let turn = try placeTurn(mode: mode)
            XCTAssertEqual(try XCTUnwrap(turn.result).lifetime(for: turn, elapsed: 2), 28)
        }
        for mode in ["wrong_subject", "wrong_date", "invented_name"] {
            let turn = try placeTurn(mode: mode)
            XCTAssertThrowsError(try XCTUnwrap(turn.result).lifetime(for: turn, elapsed: 0))
        }
        let current = try placeTurn()
        let facts = try XCTUnwrap(current.result?.knowledge?.statements)
        XCTAssertEqual(facts[0].placeDetails(chinese: false), ["3 Test Lake Road", "China"])
        XCTAssertEqual(facts[0].placeDetails(chinese: true), ["3 Test Lake Road", "中国"])
        XCTAssertEqual(facts[1].placeDetails(chinese: false), ["2026-09-13 09:00:00 – 2026-09-13 17:00:00 (Asia/Shanghai, UTC+08:00)"])
        let midnight = try placeTurn(mode: "midnight")
        XCTAssertEqual(try XCTUnwrap(midnight.result).lifetime(for: midnight, elapsed: 0.25), 0.75)
        XCTAssertThrowsError(try XCTUnwrap(midnight.result).lifetime(for: midnight, elapsed: 1))
    }

    @MainActor func testSpecificGapsMustBeBoundedExcerptsFromThisTurn() throws {
        let turn = try groundedTurn(compound: true)
        let old = try XCTUnwrap(turn.result)
        for needs in [["What documents do I need?"], [], ["Invented question"], ["What", "What"], ["\t"]] {
            let result = NativeGroundedResult(type: old.type, city: old.city, intent: old.intent,
                requestScope: old.requestScope, unansweredNeeds: needs, placeSubjectId: nil, placeName: nil, placeResolution: nil, originalOutcome: old.originalOutcome,
                completedAt: old.completedAt, projection: old.projection, knowledge: old.knowledge)
            if needs == ["What documents do I need?"] {
                XCTAssertEqual(try result.lifetime(for: turn, elapsed: 2), 28)
            } else { XCTAssertThrowsError(try result.lifetime(for: turn, elapsed: 2)) }
        }
    }

    @MainActor func testGroundedProjectionHasBoundedLifetimeAndKeepsCompoundIncomplete() throws {
        for turn in [try groundedTurn(), try groundedTurn(partial: true), try groundedTurn(compound: true)] {
            XCTAssertTrue(turn.valid)
            XCTAssertEqual(try XCTUnwrap(turn.result).lifetime(for: turn, elapsed: 2), 28)
            XCTAssertThrowsError(try XCTUnwrap(turn.result).lifetime(for: turn, elapsed: 30))
        }
        var turn = try groundedTurn()
        let old = try XCTUnwrap(turn.result)
        turn.result = NativeGroundedResult(type: old.type, city: "beijing", intent: old.intent, requestScope: old.requestScope, unansweredNeeds: old.unansweredNeeds, placeSubjectId: nil, placeName: nil, placeResolution: nil,
            originalOutcome: old.originalOutcome, completedAt: old.completedAt, projection: old.projection, knowledge: old.knowledge)
        XCTAssertThrowsError(try XCTUnwrap(turn.result).lifetime(for: turn, elapsed: 0))
        turn.result = NativeGroundedResult(type: old.type, city: old.city, intent: old.intent, requestScope: "additional_needs", unansweredNeeds: nil, placeSubjectId: nil, placeName: nil, placeResolution: nil,
            originalOutcome: old.originalOutcome, completedAt: old.completedAt, projection: old.projection, knowledge: old.knowledge)
        XCTAssertThrowsError(try XCTUnwrap(turn.result).lifetime(for: turn, elapsed: 0))
    }

    @MainActor func testGroundedUnavailableHidesFactsWithoutChangingSavedOutcome() throws {
        var turn = try groundedTurn()
        let old = try XCTUnwrap(turn.result)
        for retainedFacts in [false, true] {
            turn.result = NativeGroundedResult(type: old.type, city: old.city, intent: old.intent, requestScope: old.requestScope, unansweredNeeds: old.unansweredNeeds, placeSubjectId: nil, placeName: nil, placeResolution: nil,
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

    @MainActor private func basisReceipt(memories: Int = 0, schema: String = "comparison/1", omit: String? = nil, historical: Bool = false) throws -> Data {
        let id = "11111111-1111-4111-8111-111111111111"
        var row: [String: Any] = ["kind": "result_artifact", "artifactId": id, "revision": 2,
            "current": !historical, "currentRevision": historical ? 3 : 2, "historicalReadable": true, "lifecycle": "active", "createdAt": "2026-10-02T00:00:00Z",
            "source": ["taskId": id, "taskTurnId": id, "goalId": id, "goalVersion": 3,
                       "inputMessageId": id, "inputSequence": 7, "tripId": id, "tripVersion": 2],
            "basis": ["memories": (0..<memories).map { ["id": UUID().uuidString, "revision": $0 == 0 ? 1 : 4] as [String: Any] }, "evidence": []],
            "content": ["schemaVersion": schema, "title": "Synthetic comparison", "summary": "Local read-only test.",
                        "options": [["id": "one", "title": "One", "tradeoff": "Unknown"], ["id": "two", "title": "Two", "tradeoff": "Unknown"]]]]
        if let omit {
            if omit == "source" || omit == "basis" || omit == "createdAt" || omit == "currentRevision" || omit == "historicalReadable" { row.removeValue(forKey: omit) }
            else if omit == "memories" || omit == "evidence" { var basis = row["basis"] as! [String: Any]; basis.removeValue(forKey: omit); row["basis"] = basis }
            else { var source = row["source"] as! [String: Any]; source.removeValue(forKey: omit); row["source"] = source }
        }
        return try JSONSerialization.data(withJSONObject: ["version": 1, "data": row])
    }

    @MainActor func testResultBasisUsesOnlyCompleteRecordedFactsInBothLanguages() throws {
        for count in [0, 2] {
            let result = try JSONDecoder().decode(NativeResultEnvelope.self, from: basisReceipt(memories: count)).data
            XCTAssertTrue(result.valid)
            for chinese in [false, true] {
                let lines = result.basisLines(chinese: chinese).joined(separator: "\n")
                XCTAssertTrue(lines.contains("v2")); XCTAssertTrue(lines.contains("7"))
                XCTAssertTrue(lines.contains(chinese ? "无法说明" : "unknown"))
                XCTAssertTrue(lines.contains(chinese ? "来源记录没有说明" : "does not provide"))
                XCTAssertTrue(lines.contains(chinese ? "此次读取" : "This read"))
                if count == 0 { XCTAssertTrue(lines.contains(chinese ? "未记录记忆引用" : "No Memory references were recorded")) }
                else { XCTAssertTrue(lines.contains(chinese ? "2 项" : "2 entries")); XCTAssertTrue(lines.contains("v1")); XCTAssertTrue(lines.contains("v4")) }
                XCTAssertFalse(lines.contains(result.artifactId!))
                for memory in result.basis!.memories! { XCTAssertFalse(lines.contains(memory.id)) }
            }
        }
        let historical = try JSONDecoder().decode(NativeResultEnvelope.self, from: basisReceipt(historical: true)).data
        XCTAssertTrue(historical.basisLines(chinese: false).last!.contains("earlier result"))
        XCTAssertFalse(historical.basisLines(chinese: false).joined().contains("source-version checks"))
    }

    @MainActor func testResultBasisMissingAndUnknownRecordsNeverFabricateZeroReferences() throws {
        for missing in ["source", "basis", "createdAt", "currentRevision", "historicalReadable", "memories", "evidence", "inputSequence", "tripVersion", "goalVersion", "taskTurnId"] {
            let result = try JSONDecoder().decode(NativeResultEnvelope.self, from: basisReceipt(omit: missing)).data
            XCTAssertTrue(result.valid, "old body compatibility is retained")
            for chinese in [true, false] {
                let lines = result.basisLines(chinese: chinese)
                XCTAssertEqual(lines.count, 1)
                XCTAssertTrue(lines[0].contains(chinese ? "无法说明" : "unknown"))
                XCTAssertFalse(lines[0].contains(chinese ? "未记录记忆引用" : "No Memory references"))
            }
        }
        let unknown = try JSONDecoder().decode(NativeResultEnvelope.self, from: basisReceipt(schema: "comparison/99")).data
        XCTAssertEqual(unknown.basisLines(chinese: true).count, 1)
        for mutation in ["evidence", "extra", "badMemory", "tooMany", "badSequence", "badDate", "revisionMismatch", "unreadable"] {
            var envelope = try JSONSerialization.jsonObject(with: basisReceipt()) as! [String: Any]
            var row = envelope["data"] as! [String: Any]
            var basis = row["basis"] as! [String: Any]
            if mutation == "evidence" { basis["evidence"] = [["title": "Do not infer verified search"]] }
            if mutation == "extra" { basis["guessedPreference"] = "rail" }
            if mutation == "badMemory" { basis["memories"] = [["id": "PREFER_RAIL", "revision": 1]] }
            if mutation == "tooMany" { basis["memories"] = (0..<21).map { _ in ["id": UUID().uuidString, "revision": 1] as [String: Any] } }
            row["basis"] = basis
            if mutation == "badSequence" { var source = row["source"] as! [String: Any]; source["inputSequence"] = 0; row["source"] = source }
            if mutation == "badDate" { row["createdAt"] = "Not a date" }
            if mutation == "revisionMismatch" { row["currentRevision"] = 3 }
            if mutation == "unreadable" { row["historicalReadable"] = false }
            envelope["data"] = row
            let result = try JSONDecoder().decode(NativeResultEnvelope.self, from: JSONSerialization.data(withJSONObject: envelope)).data
            XCTAssertEqual(result.basisLines(chinese: false).count, 1, mutation)
        }
    }

    @MainActor func testResultBasisSharesBodyScopeDeadlineTripAndLateClearGate() async throws {
        var now: TimeInterval = 100
        let store = NativeResultStore(uptime: { now })
        await store.load(scope: owner) { try basisReceipt(memories: 2) }
        XCTAssertEqual(store.visibleResult(owner)?.basisLines(chinese: false).count, 6)
        let other = NativeDataScope(endpoint: owner.endpoint, subject: "other", mobileEpoch: 1, generation: 2)
        XCTAssertNil(store.visibleResult(other))
        XCTAssertNil(store.visibleResult(nil), "background/non-active scope hides both")
        XCTAssertNil(store.visibleResult(owner, expectedTripID: UUID().uuidString))
        now = 130; XCTAssertNil(store.visibleResult(owner))
        await store.load(scope: owner) { throw NativeDataError.invalidResponse }
        XCTAssertNil(store.result); XCTAssertNil(store.visibleResult(owner))
        let barrier = KnowledgeReadBarrier()
        let pending = Task { await store.load(scope: owner) { await barrier.wait() } }
        await barrier.awaitStart(); store.clear()
        await barrier.finish(try basisReceipt(memories: 2)); await pending.value
        XCTAssertNil(store.result); XCTAssertNil(store.visibleResult(owner))
    }

    @MainActor func testResultBasisNativeDisclosureSmallMaximumTextRendering() async throws {
        for chinese in [false, true] {
            let store = NativeResultStore()
            await store.load(scope: owner) { try basisReceipt(memories: chinese ? 2 : 0) }
            let host = UIHostingController(rootView: ScrollView {
                NativeResultCard(store: store, scope: owner, chinese: chinese).padding(12)
            }.dynamicTypeSize(.accessibility5))
            let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 568))
            window.windowScene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
            window.windowLevel = .alert + 1
            host.view.accessibilityViewIsModal = true
            window.rootViewController = host; window.makeKeyAndVisible()
            defer { window.isHidden = true }
            host.view.frame = window.bounds; host.view.layoutIfNeeded()
            try await Task.sleep(for: .milliseconds(200))
            func scrolls(_ view: UIView) -> [UIScrollView] {
                (view as? UIScrollView).map { [$0] } ?? view.subviews.flatMap(scrolls)
            }
            let scroll = try XCTUnwrap(scrolls(host.view).first)
            scroll.setContentOffset(CGPoint(x: 0, y: max(0, scroll.contentSize.height - scroll.bounds.height)), animated: false)
            try await Task.sleep(for: .milliseconds(150))
            XCTAssertLessThanOrEqual(scroll.contentSize.width, 320, "maximum text remains vertically scrollable without horizontal overflow")
            XCTAssertGreaterThan(scroll.contentSize.height, 568, "maximum text has a scrollable reading surface")
            let image = UIGraphicsImageRenderer(bounds: host.view.bounds).image { _ in host.view.drawHierarchy(in: host.view.bounds, afterScreenUpdates: true) }
            let attachment = XCTAttachment(image: image); attachment.name = "result-basis-\(chinese ? "zh" : "en")-320-max-folded"
            attachment.lifetime = .keepAlways; add(attachment)
            store.clear()

        }
    }

    @MainActor func testSavedComparisonReadbackFencesScopeAndUnknownSchema() async throws {
        let artifact = UUID().uuidString.lowercased()
        func bytes(_ schema: String = "comparison/1") throws -> Data {
            try JSONSerialization.data(withJSONObject: ["version": 1, "data": [
                "kind": "result_artifact", "artifactId": artifact, "revision": 2,
                "current": false, "lifecycle": "active", "content": ["schemaVersion": schema,
                    "title": "Synthetic directions", "summary": "No real travel recommendation.",
                    "options": [["id": "one", "title": "Option one", "tradeoff": "Time unknown"],
                                ["id": "two", "title": "Option two", "tradeoff": "Availability unknown"]]]
            ]])
        }
        let store = NativeResultStore()
        await store.load(scope: owner) { try bytes() }
        XCTAssertTrue(store.isCurrent(owner))
        XCTAssertEqual(store.result?.artifactId, artifact)
        XCTAssertEqual(store.result?.revision, 2)
        XCTAssertEqual(store.result?.content?.options?.count, 2)
        let another = NativeDataScope(endpoint: owner.endpoint, subject: "other-owner", mobileEpoch: 1, generation: 2)
        XCTAssertFalse(store.isCurrent(another))
        store.clear()
        XCTAssertNil(store.result)
        await store.load(scope: owner) { try bytes("comparison/999") }
        XCTAssertEqual(store.result?.content?.schemaVersion, "comparison/999")
        XCTAssertFalse(store.result?.content?.schemaVersion == "comparison/1")
        let barrier = KnowledgeReadBarrier()
        let pending = Task { await store.load(scope: owner) { await barrier.wait() } }
        await barrier.awaitStart()
        store.clear()
        await barrier.finish(try bytes())
        await pending.value
        XCTAssertNil(store.result, "a cleared account must not revive a late result")
    }

    @MainActor func testLibrarySearchAndExactOpenRejectChangedOrRevokedResult() async throws {
        let artifact = UUID().uuidString.lowercased()
        let content = NativeResultContent(schemaVersion: "comparison/1", title: "Shanghai directions",
                                          summary: "Two routes compared", options: nil)
        XCTAssertTrue(NativeLibrarySearch.matches(content, query: " routes "))
        XCTAssertFalse(NativeLibrarySearch.matches(content, query: "Beijing"))
        func bytes(id: String, revision: Int = 1, current: Bool = true, lifecycle: String = "active") throws -> Data {
            try JSONSerialization.data(withJSONObject: ["version": 1, "data": [
                "kind": "result_artifact", "artifactId": id, "revision": revision,
                "current": current, "lifecycle": lifecycle,
                "content": ["schemaVersion": "comparison/1", "title": "Shanghai directions",
                    "summary": "Two routes compared", "options": [
                        ["id": "one", "title": "One", "tradeoff": "Time unknown"],
                        ["id": "two", "title": "Two", "tradeoff": "Availability unknown"]]]
            ]])
        }
        let store = NativeResultStore()
        await store.loadExact(scope: owner, artifactID: artifact, revision: 1) { try bytes(id: artifact) }
        XCTAssertTrue(store.isCurrent(owner))
        await store.loadExact(scope: owner, artifactID: artifact, revision: 1) { try bytes(id: UUID().uuidString.lowercased()) }
        XCTAssertNil(store.result)
        await store.loadExact(scope: owner, artifactID: artifact, revision: 1) { try bytes(id: artifact, revision: 2) }
        XCTAssertNil(store.result)
        await store.loadExact(scope: owner, artifactID: artifact, revision: 1) { try bytes(id: artifact, current: false) }
        XCTAssertNil(store.result)
        await store.loadExact(scope: owner, artifactID: artifact, revision: 1) { try bytes(id: artifact, lifecycle: "withdrawn") }
        XCTAssertNil(store.result)
    }

    @MainActor func testExactResultReadDeadlineIncludesNetworkAndAllowsSameReferenceRetry() async throws {
        let artifact = UUID().uuidString.lowercased()
        var now: TimeInterval = 100
        let store = NativeResultStore(uptime: { now })
        func bytes(current: Bool = true) throws -> Data {
            try JSONSerialization.data(withJSONObject: ["version": 1, "data": [
                "kind": "result_artifact", "artifactId": artifact, "revision": 3,
                "current": current, "lifecycle": "active", "content": ["schemaVersion": "comparison/1",
                    "title": "Synthetic comparison", "summary": "Fixture only",
                    "options": [["id": "one", "title": "One", "tradeoff": "Unknown"],
                                ["id": "two", "title": "Two", "tradeoff": "Unknown"]]]
            ]])
        }
        await store.loadExact(scope: owner, artifactID: artifact, revision: 3) {
            now = 129; return try bytes()
        }
        XCTAssertTrue(store.isCurrent(owner))
        now = 130
        XCTAssertFalse(store.isCurrent(owner), "network time cannot extend the 30-second read authority")

        await store.loadExact(scope: owner, artifactID: artifact, revision: 3) { try bytes(current: false) }
        XCTAssertNil(store.result, "refresh must remove a superseded revision")
        XCTAssertEqual(store.state, "unavailable")
        await store.loadExact(scope: owner, artifactID: artifact, revision: 3) { try bytes() }
        XCTAssertEqual(store.result?.artifactId, artifact)
        XCTAssertEqual(store.result?.revision, 3)
        XCTAssertTrue(store.isCurrent(owner), "retry opens only the original exact reference")

        await store.loadExact(scope: owner, artifactID: artifact, revision: 3) {
            now = 160; return try bytes()
        }
        XCTAssertNil(store.result, "a response arriving at the deadline must not restore private content")
        XCTAssertEqual(store.state, "unavailable")
        XCTAssertFalse(store.isCurrent(owner))
    }

    @MainActor func testLibraryPagesReplaceExpireAndFenceLateResponses() async throws {
        var now: TimeInterval = 100
        let store = NativeLibrarySearchStore(uptime: { now })
        let ids = (0..<20).map { _ in UUID().uuidString.lowercased() }
        func page(_ values: [String], next: String? = nil) throws -> Data {
            try JSONSerialization.data(withJSONObject: ["version": 1, "data": ["kind": "result_search",
                "results": values.map { ["artifactId": $0, "revision": 1, "title": "Synthetic title", "summary": "Fixture only", "tripId": NSNull(), "tripVersion": NSNull()] as [String: Any] },
                "nextCursor": next as Any? ?? NSNull()]])
        }
        await store.load(scope: owner) { try page(ids, next: ids.last) }
        XCTAssertEqual(store.rows.count, 20); XCTAssertEqual(store.nextCursor, ids.last)
        XCTAssertFalse(store.isCurrent(owner, query: "different"))
        XCTAssertFalse(store.isCurrent(owner, cursor: ids.last))
        await store.load(scope: owner) { try page([UUID().uuidString.lowercased()]) }
        XCTAssertEqual(store.rows.count, 1, "a page replaces previous excerpts rather than retaining revoked rows")
        now = 131; XCTAssertFalse(store.isCurrent(owner))
        let other = NativeDataScope(endpoint: owner.endpoint, subject: "other", mobileEpoch: 1, generation: 2)
        XCTAssertFalse(store.isCurrent(other))
        let barrier = KnowledgeReadBarrier()
        let pending = Task { await store.load(scope: owner) { await barrier.wait() } }
        await barrier.awaitStart(); store.clear()
        await barrier.finish(try page(ids)); await pending.value
        XCTAssertTrue(store.rows.isEmpty); XCTAssertNil(store.nextCursor)
        await store.load(scope: owner) { try page(ids, next: UUID().uuidString) }
        XCTAssertEqual(store.state, "unavailable", "cursor must identify the final eligible result in a full page")
    }

    @MainActor func testLibraryUnavailablePageCannotClaimCurrentEmptySearch() async throws {
        let store = NativeLibrarySearchStore()
        let unavailable = try JSONSerialization.data(withJSONObject: ["version": 1, "data": ["kind": "unavailable"]])
        await store.load(scope: owner) { unavailable }
        XCTAssertEqual(store.state, "unavailable")
        XCTAssertTrue(store.rows.isEmpty)
        XCTAssertFalse(store.isCurrent(owner), "scan overflow must render unavailable, not a current empty page")
    }

    @MainActor private func phrasePolicy(_ accepted: Bool = true, hash: String = String(repeating: "a", count: 64)) -> Data {
        Data("""
        {"version":1,"kind":"policy","policy":{"id":"11111111-1111-4111-8111-111111111111","provider":"qwen","recipient":"Synthetic recipient","sourceRegion":"test","processingRegion":"test","storageRegion":"test","termsVersion":"test","noticeVersion":"test","noticeHash":"\(hash)","noticeZh":"测试","noticeEn":"Test notice","retention":"retain_after_hide_v1","expiresAt":"2099-01-01T00:00:00Z","consentState":"\(accepted ? "accepted" : "not_accepted")"}}
        """.utf8)
    }
    @MainActor private func phraseHistory(_ translated: String? = "合成短语", id: String = "22222222-2222-4222-8222-222222222222", back: String = "Synthetic phrase") throws -> Data {
        let rows: [[String: Any]] = translated.map { value in [["turnId": id, "sourceLocale": "en", "targetLocale": "zh", "original": "Synthetic phrase", "state": "translated", "translation": value, "backTranslation": back]] } ?? []
        return try JSONSerialization.data(withJSONObject: ["version": 2, "kind": "translations", "policyId": "11111111-1111-4111-8111-111111111111", "phrases": rows, "nextCursor": NSNull()])
    }
    @MainActor func testLibraryPhraseReusesReadonlyReaderAndRechecksExactBodyAndPolicy() async throws {
        let store = NativeLibraryPhraseStore()
        var requests = 0
        let read: NativeTranslationStore.Request = { path, method, body in
            XCTAssertEqual(method, "GET"); XCTAssertNil(body); requests += 1
            return path.hasSuffix("policy") ? self.phrasePolicy() : try self.phraseHistory()
        }
        await store.load(scope: owner, currentScope: { self.owner }, request: read)
        XCTAssertEqual(requests, 3); XCTAssertTrue(store.isCurrent(owner))
        let reference = try XCTUnwrap(store.reference(try XCTUnwrap(store.rows.first), scope: owner))
        await store.load(scope: owner, exact: reference, currentScope: { self.owner }, request: read)
        XCTAssertEqual(store.opened, reference.phrase)
        for change in ["changed", "missing", "other", "policy", "revoked"] {
            await store.load(scope: owner, exact: reference, currentScope: { self.owner }) { path, _, _ in
                if path.hasSuffix("policy") { return self.phrasePolicy(change != "revoked", hash: String(repeating: change == "policy" ? "b" : "a", count: 64)) }
                return try self.phraseHistory(change == "missing" ? nil : change == "changed" ? "改变内容" : "合成短语", id: change == "other" ? "33333333-3333-4333-8333-333333333333" : reference.id)
            }
            XCTAssertNil(store.opened, change); XCTAssertFalse(store.isCurrent(owner), change)
            XCTAssertEqual(store.state, "unavailable", change)
        }
    }
    @MainActor func testLibraryPhraseExpiryAccountChangeAndLateResponseHideAllText() async throws {
        var now: TimeInterval = 100
        let store = NativeLibraryPhraseStore(uptime: { now })
        await store.load(scope: owner, currentScope: { self.owner }) { path, _, _ in
            path.hasSuffix("policy") ? self.phrasePolicy() : try self.phraseHistory()
        }
        now = 120; XCTAssertFalse(store.isCurrent(owner))
        let other = NativeDataScope(endpoint: owner.endpoint, subject: "another", mobileEpoch: 1, generation: 2)
        XCTAssertFalse(store.isCurrent(other))
        let barrier = KnowledgeReadBarrier()
        let pending = Task {
            await store.load(scope: self.owner, currentScope: { self.owner }) { path, _, _ in
                if path.hasSuffix("policy") { return self.phrasePolicy() }
                return await barrier.wait()
            }
        }
        await barrier.awaitStart(); store.clear(); await barrier.finish(try phraseHistory()); await pending.value
        XCTAssertTrue(store.rows.isEmpty); XCTAssertNil(store.opened)
        var actor: NativeDataScope? = owner
        await store.load(scope: owner, currentScope: { actor }) { path, _, _ in
            if path.hasSuffix("policy") { return self.phrasePolicy() }
            actor = other; return try self.phraseHistory()
        }
        XCTAssertFalse(store.isCurrent(owner)); XCTAssertTrue(store.rows.isEmpty)
        await store.load(scope: owner, currentScope: { self.owner }) { path, _, _ in
            if path.hasSuffix("policy") { return self.phrasePolicy() }
            now += 21; return try self.phraseHistory()
        }
        XCTAssertEqual(store.state, "unavailable"); XCTAssertTrue(store.rows.isEmpty)
    }

    @MainActor func testGroupedPhraseMatchingIsBoundedAndNeverRenewsEligibility() async throws {
        var now: TimeInterval = 100
        let store = NativeLibraryPhraseStore(uptime: { now })
        var reads = 0
        await store.load(scope: owner, currentScope: { self.owner }) { path, _, _ in
            reads += 1
            return path.hasSuffix("policy") ? self.phrasePolicy() : try self.phraseHistory(back: "Back-only wording")
        }
        for term in [" SYNTHETIC ", "合成", "back-only", ""] {
            XCTAssertEqual(store.matches(scope: owner, query: term)?.count, 1, term)
        }
        XCTAssertEqual(store.matches(scope: owner, query: "not present")?.count, 0)
        XCTAssertNil(store.matches(scope: owner, query: String(repeating: "x", count: 121)))
        now = 119
        XCTAssertEqual(store.matches(scope: owner, query: "合成")?.count, 1)
        XCTAssertEqual(reads, 3, "matching does not re-read or renew the source window")
        now = 120
        XCTAssertNil(store.matches(scope: owner, query: "合成"), "expiry is unavailable, not zero matches")
        XCTAssertNil(store.matches(scope: nil, query: ""))
        await store.load(scope: owner, currentScope: { self.owner }) { _, _, _ in self.phrasePolicy(false) }
        XCTAssertNil(store.matches(scope: owner, query: ""), "revoked/unaccepted must not claim an empty search")
    }

    @MainActor func testGroupedPhraseLateWindowUsesLatestQueryAndClearedScopeCannotReviveMatches() async throws {
        let store = NativeLibraryPhraseStore()
        let barrier = KnowledgeReadBarrier()
        let pending = Task {
            await store.load(scope: self.owner, currentScope: { self.owner }) { path, _, _ in
                if path.hasSuffix("policy") { return self.phrasePolicy() }
                return await barrier.wait()
            }
        }
        await barrier.awaitStart()
        XCTAssertNil(store.matches(scope: owner, query: "Synthetic"))
        await barrier.finish(try phraseHistory()); await pending.value
        XCTAssertEqual(store.matches(scope: owner, query: "new missing query")?.count, 0)
        XCTAssertEqual(store.matches(scope: owner, query: "Synthetic")?.count, 1)
        let other = NativeDataScope(endpoint: owner.endpoint, subject: "other", mobileEpoch: 1, generation: 2)
        XCTAssertNil(store.matches(scope: other, query: "Synthetic"))
        store.clear()
        XCTAssertNil(store.matches(scope: owner, query: "Synthetic"))
    }

    @MainActor func testGroupedSearchSmallMaximumTextNativeRendering() async throws {
        for locale in [SupportedLocale.en, .zh] {
            let settings = AppSettings(selectedLocale: locale, nativeSession: NativeSession(arguments: [], bundleConfiguration: [:]), defaults: try XCTUnwrap(UserDefaults(suiteName: "vpj82.render.\(UUID().uuidString)")))
            let host = UIHostingController(rootView: NativeKnowledgeView().environment(settings).dynamicTypeSize(.accessibility5))
            let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 568))
            window.rootViewController = host; window.makeKeyAndVisible()
            defer { window.isHidden = true }
            host.view.frame = window.bounds; host.view.layoutIfNeeded()
            try await Task.sleep(for: .milliseconds(250))
            func fields(_ view: UIView) -> [UITextField] {
                (view as? UITextField).map { [$0] } ?? view.subviews.flatMap(fields)
            }
            let field = try XCTUnwrap(fields(host.view).first)
            XCTAssertGreaterThan(field.bounds.width, 0)
            XCTAssertGreaterThan(field.font?.pointSize ?? 0, 17)
            XCTAssertLessThanOrEqual(field.convert(field.bounds, to: host.view).maxX, 320)
            field.text = locale == .zh ? "合成" : "Synthetic"
            field.sendActions(for: .editingChanged)
            try await Task.sleep(for: .milliseconds(100))
            var ancestor = field.superview
            while let view = ancestor {
                if let scroll = view as? UIScrollView {
                    let rect = field.convert(field.bounds, to: scroll)
                    scroll.setContentOffset(CGPoint(x: 0, y: max(0, rect.minY - 20)), animated: false)
                    break
                }
                ancestor = view.superview
            }
            host.view.layoutIfNeeded()
            let image = UIGraphicsImageRenderer(bounds: host.view.bounds).image { _ in
                host.view.drawHierarchy(in: host.view.bounds, afterScreenUpdates: true)
            }
            let attachment = XCTAttachment(image: image)
            attachment.name = "Library-grouped-search-\(locale.rawValue)-small-max-signedout"
            attachment.lifetime = .keepAlways; add(attachment)
        }
    }

    @MainActor func testMatchedPhraseExactLocalReadRendersReadonlyCard() async throws {
        let store = NativeLibraryPhraseStore()
        let reader: NativeTranslationStore.Request = { path, _, _ in
            path.hasSuffix("policy") ? self.phrasePolicy() : try self.phraseHistory()
        }
        await store.load(scope: owner, currentScope: { self.owner }, request: reader)
        let match = try XCTUnwrap(store.matches(scope: owner, query: "合成")?.first)
        let reference = try XCTUnwrap(store.reference(match, scope: owner))
        await store.load(scope: owner, exact: reference, currentScope: { self.owner }, request: reader)
        let opened = try XCTUnwrap(store.opened)
        XCTAssertEqual(opened, match)
        for chinese in [false, true] {
            let host = UIHostingController(rootView: NativeTranslationCard(phrase: opened, chinese: chinese).dynamicTypeSize(.accessibility5))
            let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 568))
            window.rootViewController = host; window.makeKeyAndVisible()
            defer { window.isHidden = true }
            host.view.frame = window.bounds; host.view.layoutIfNeeded()
            try await Task.sleep(for: .milliseconds(150))
            let image = UIGraphicsImageRenderer(bounds: host.view.bounds).image { _ in host.view.drawHierarchy(in: host.view.bounds, afterScreenUpdates: true) }
            let attachment = XCTAttachment(image: image)
            attachment.name = "Library-exact-local-reader-card-\(chinese ? "zh" : "en")-small-max"
            attachment.lifetime = .keepAlways; add(attachment)
        }
    }

    @MainActor func testLibraryV2OlderPageReplacesRowsAndReopensOutsideLegacyWindow() async throws {
        let store = NativeLibraryPhraseStore()
        let newest = (0..<20).map { index in NativeTranslationPhrase(turnId: UUID().uuidString.lowercased(), sourceLocale: "en", targetLocale: "zh", original: "New \(index)", state: "translated", translation: "新", backTranslation: "New \(index)") }
        let old = NativeTranslationPhrase(turnId: UUID().uuidString.lowercased(), sourceLocale: "en", targetLocale: "zh", original: "Older CNY 50", state: "translated", translation: "旧50元", backTranslation: "Older CNY 50")
        func wire(_ phrases: [NativeTranslationPhrase], exact: Bool = false, next: String? = nil) throws -> Data {
            let rows = phrases.map { ["turnId": $0.id, "sourceLocale": $0.sourceLocale, "targetLocale": $0.targetLocale, "original": $0.original, "state": $0.state, "translation": $0.translation ?? "", "backTranslation": $0.backTranslation ?? ""] }
            var value: [String: Any] = ["version": 2, "kind": exact ? "translation" : "translations", "policyId": "11111111-1111-4111-8111-111111111111"]
            if exact { value["phrase"] = rows.first } else { value["phrases"] = rows; value["nextCursor"] = next as Any? ?? NSNull() }
            return try JSONSerialization.data(withJSONObject: value)
        }
        let policy: NativeTranslationStore.Request = { _, method, body in XCTAssertEqual(method, "GET"); XCTAssertNil(body); return self.phrasePolicy() }
        let next = try XCTUnwrap(newest.last?.id)
        await store.load(scope: owner, currentScope: { self.owner }, request: policy, read: { after, id in
            XCTAssertNil(after); XCTAssertNil(id); return try wire(newest, next: next)
        })
        XCTAssertEqual(store.matches(scope: owner, query: "Older")?.count, 0, "only first-page matching")
        await store.load(scope: owner, cursor: next, currentScope: { self.owner }, request: policy, read: { after, id in
            XCTAssertEqual(after, next); XCTAssertNil(id); return try wire([old])
        })
        XCTAssertEqual(store.rows, [old]); XCTAssertNil(store.nextCursor)
        XCTAssertNil(store.matches(scope: owner, query: "Older"), "old page identity cannot expose the new page")
        XCTAssertEqual(store.matches(scope: owner, query: "Older", cursor: next), [old])
        let reference = try XCTUnwrap(store.reference(old, scope: owner, cursor: next))
        await store.load(scope: owner, exact: reference, currentScope: { self.owner }, request: policy, read: { after, id in
            XCTAssertNil(after); XCTAssertEqual(id, old.id); return try wire([old], exact: true)
        })
        XCTAssertEqual(store.opened, old, "exact endpoint does not require the phrase in an owner-latest20 page")
    }

    @MainActor func testLibraryV2UnavailableAndExpiredAnchorNeverClaimEmptyPage() async throws {
        var now: TimeInterval = 100
        let store = NativeLibraryPhraseStore(uptime: { now })
        let ids = (0..<20).map { _ in UUID().uuidString.lowercased() }
        let rows = ids.map { ["turnId": $0, "sourceLocale": "en", "targetLocale": "zh", "original": "Synthetic", "state": "translated", "translation": "合成", "backTranslation": "Synthetic"] }
        let data = try JSONSerialization.data(withJSONObject: ["version": 2, "kind": "translations", "policyId": "11111111-1111-4111-8111-111111111111", "phrases": rows, "nextCursor": ids.last!])
        let policy: NativeTranslationStore.Request = { _, _, _ in self.phrasePolicy() }
        await store.load(scope: owner, currentScope: { self.owner }, request: policy, read: { _, _ in data })
        now = 120
        var reads = 0
        await store.load(scope: owner, cursor: ids.last, currentScope: { self.owner }, request: policy, read: { _, _ in reads += 1; return data })
        XCTAssertEqual(reads, 0); XCTAssertEqual(store.state, "unavailable")
        XCTAssertNil(store.matches(scope: owner, query: "", cursor: ids.last))
        await store.load(scope: owner, currentScope: { self.owner }, request: policy, read: { _, _ in Data("{\"version\":2,\"kind\":\"unavailable\"}".utf8) })
        XCTAssertEqual(store.state, "unavailable"); XCTAssertNil(store.matches(scope: owner, query: ""))
    }

    @MainActor func testLibraryHistoryQueryFindsBeyondBrowsePageAndPreservesRawBinding() async throws {
        var now: TimeInterval = 100
        let store = NativeLibraryPhraseStore(uptime: { now })
        let raw = " é "
        let alternate = " e\u{301} "
        XCTAssertEqual(raw, alternate)
        func page(query: String?) throws -> Data {
            var value = try XCTUnwrap(JSONSerialization.jsonObject(with: phraseHistory()) as? [String: Any])
            var phrases = try XCTUnwrap(value["phrases"] as? [[String: Any]])
            phrases[0]["original"] = "Café"; phrases[0]["translation"] = "咖啡"; phrases[0]["backTranslation"] = "Café"
            value["phrases"] = phrases
            if let query { value["query"] = query }
            return try JSONSerialization.data(withJSONObject: value)
        }
        let policy: NativeTranslationStore.Request = { _, _, _ in self.phrasePolicy() }
        await store.load(scope: owner, query: raw, currentScope: { self.owner }, request: policy, read: { after, id in
            XCTAssertNil(after); XCTAssertNil(id); return try page(query: raw)
        })
        let matched = try XCTUnwrap(store.searchResults(scope: owner, query: raw)?.first)
        XCTAssertNil(store.searchResults(scope: owner, query: alternate), "canonically equal strings cannot reuse another raw query")
        XCTAssertNil(store.searchResults(scope: owner, query: nil))
        now = 119; XCTAssertEqual(store.searchResults(scope: owner, query: raw)?.count, 1)
        let reference = try XCTUnwrap(store.reference(matched, scope: owner, query: raw))
        await store.load(scope: owner, exact: reference, currentScope: { self.owner }, request: policy, read: { after, id in
            XCTAssertNil(after); XCTAssertEqual(id, matched.id)
            return try JSONSerialization.data(withJSONObject: ["version": 2, "kind": "translation", "policyId": reference.policyID, "phrase": ["turnId": matched.id, "sourceLocale": matched.sourceLocale, "targetLocale": matched.targetLocale, "original": matched.original, "state": matched.state, "translation": matched.translation!, "backTranslation": matched.backTranslation!]])
        })
        XCTAssertEqual(store.opened, matched); XCTAssertTrue(store.isCurrent(owner, query: raw))
        now = 139; XCTAssertNil(store.searchResults(scope: owner, query: raw), "inspection cannot renew request-start lifetime")
        await store.load(scope: owner, query: raw, currentScope: { self.owner }, request: policy, read: { _, _ in try page(query: alternate) })
        XCTAssertEqual(store.state, "unavailable"); XCTAssertNil(store.searchResults(scope: owner, query: raw))
    }

    @MainActor func testLibraryQueryChangeRejectsLatePageAndWrongQueryCursor() async throws {
        let store = NativeLibraryPhraseStore(), barrier = KnowledgeReadBarrier()
        let policy: NativeTranslationStore.Request = { _, _, _ in self.phrasePolicy() }
        let pending = Task {
            await store.load(scope: self.owner, query: "old", currentScope: { self.owner }, request: policy, read: { _, _ in await barrier.wait() })
        }
        await barrier.awaitStart(); store.clear()
        var value = try XCTUnwrap(JSONSerialization.jsonObject(with: phraseHistory()) as? [String: Any]); value["query"] = "old"
        await barrier.finish(try JSONSerialization.data(withJSONObject: value)); await pending.value
        XCTAssertNil(store.searchResults(scope: owner, query: "new")); XCTAssertNil(store.searchResults(scope: owner, query: "old"))
        let ids = (0..<20).map { _ in UUID().uuidString.lowercased() }
        let payload = try JSONSerialization.data(withJSONObject: ["turnId": ids.last!, "query": "old"])
        let cursor = "q1." + payload.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        let rows = ids.map { ["turnId": $0, "sourceLocale": "en", "targetLocale": "zh", "original": "Old", "state": "translated", "translation": "旧", "backTranslation": "Old"] }
        let data = try JSONSerialization.data(withJSONObject: ["version": 2, "kind": "translations", "policyId": "11111111-1111-4111-8111-111111111111", "query": "old", "phrases": rows, "nextCursor": cursor])
        await store.load(scope: owner, query: "old", currentScope: { self.owner }, request: policy, read: { _, _ in data })
        XCTAssertEqual(store.nextCursor, cursor)
        let second = try JSONSerialization.data(withJSONObject: ["version": 2, "kind": "translations", "policyId": "11111111-1111-4111-8111-111111111111", "query": "old", "phrases": [rows[0]], "nextCursor": NSNull()])
        await store.load(scope: owner, query: "old", cursor: cursor, currentScope: { self.owner }, request: policy, read: { after, id in
            XCTAssertEqual(after?.utf8.map { $0 }, cursor.utf8.map { $0 }); XCTAssertNil(id)
            return second
        })
        XCTAssertEqual(store.searchResults(scope: owner, query: "old", cursor: cursor)?.count, 1)
        XCTAssertNil(store.nextCursor)
        var calls = 0
        await store.load(scope: owner, query: "new", cursor: cursor, currentScope: { self.owner }, request: policy, read: { _, _ in calls += 1; return data })
        XCTAssertEqual(calls, 0); XCTAssertEqual(store.state, "unavailable")
    }

    @MainActor func testTripResultOpensOnlyExactCurrentReference() async throws {
        let tripID = UUID().uuidString.lowercased(), otherTrip = UUID().uuidString.lowercased()
        let artifactID = UUID().uuidString.lowercased(), store = NativeResultStore()
        func bytes(_ value: [String: Any]) throws -> Data { try JSONSerialization.data(withJSONObject: value) }
        let reference = try bytes(["version": 1, "data": ["kind": "result_reference", "artifactId": artifactID, "revision": 2, "tripId": tripID]])
        func result(_ sourceTrip: String, current: Bool = true, historicalReadable: Bool = true,
                    artifact: String? = nil, revision: Int = 2) throws -> Data {
            try bytes(["version": 1, "data": ["kind": "result_artifact", "artifactId": artifact ?? artifactID, "revision": revision,
                "current": current, "historicalReadable": historicalReadable, "lifecycle": "active", "source": ["tripId": sourceTrip, "tripVersion": 0],
                "content": ["schemaVersion": "comparison/1", "title": "Synthetic Trip comparison", "summary": "No real travel advice.",
                    "options": [["id": "one", "title": "One", "tradeoff": "Time unknown"],
                                ["id": "two", "title": "Two", "tradeoff": "Availability unknown"]]]]])
        }
        await store.load(scope: owner, tripID: tripID, reference: { reference }, open: { id, revision in
            XCTAssertEqual(id, artifactID); XCTAssertEqual(revision, 2)
            return try result(tripID)
        })
        XCTAssertEqual(store.result?.artifactId, artifactID)
        XCTAssertEqual(store.result?.revision, 2)
        XCTAssertTrue(store.isCurrent(owner))
        await store.load(scope: owner, tripID: tripID, reference: { reference }, open: { _, _ in try result(otherTrip) })
        XCTAssertNil(store.result, "another Trip's body cannot replace this reference")
        XCTAssertEqual(store.state, "unavailable")
        await store.load(scope: owner, tripID: tripID, reference: { reference }, open: { _, _ in try result(tripID, current: false) })
        XCTAssertNil(store.result, "a changed basis cannot remain in the selected Trip")
        let archiveReference = try bytes(["version": 1, "data": ["kind": "result_reference", "artifactId": artifactID,
            "revision": 2, "tripId": tripID, "archiveHistorical": true]])
        await store.load(scope: owner, tripID: tripID, reference: { archiveReference }, open: { _, _ in try result(tripID, current: false) })
        XCTAssertEqual(store.visibleResult(owner, expectedTripID: tripID)?.artifactId, artifactID)
        XCTAssertEqual(store.result?.current, false, "archive proof grants read-only history, never current execution")
        await store.load(scope: owner, tripID: tripID, reference: { archiveReference }, open: { _, _ in try result(otherTrip, current: false) })
        XCTAssertNil(store.result)
        await store.load(scope: owner, tripID: tripID, reference: { archiveReference }, open: { _, _ in try result(tripID, current: false, artifact: UUID().uuidString.lowercased()) })
        XCTAssertNil(store.result)
        await store.load(scope: owner, tripID: tripID, reference: { archiveReference }, open: { _, _ in try result(tripID, current: false, revision: 3) })
        XCTAssertNil(store.result)
        await store.load(scope: owner, tripID: tripID, reference: { archiveReference }, open: { _, _ in try result(tripID, current: false, historicalReadable: false) })
        XCTAssertNil(store.result, "archive proof cannot replace the exact reader's current permission")
        await store.load(scope: owner, tripID: tripID, reference: { archiveReference }, open: { _, _ in throw NativeDataError.server(code: "FORBIDDEN") })
        XCTAssertEqual(store.state, "unavailable", "a withdrawn source stays unreadable after archive")
        await store.loadExact(scope: owner, artifactID: artifactID, revision: 2) { try result(tripID, current: false) }
        XCTAssertNil(store.result, "archive history never changes global current-only exact use")
        for proof in [false as Any, 1 as Any, NSNull()] {
            let invalid = try bytes(["version": 1, "data": ["kind": "result_reference", "artifactId": artifactID,
                "revision": 2, "tripId": tripID, "archiveHistorical": proof]])
            await store.load(scope: owner, tripID: tripID, reference: { invalid }, open: { _, _ in XCTFail("invalid proof must not open"); return Data() })
            XCTAssertNil(store.result)
        }
        let extra = try bytes(["version": 1, "data": ["kind": "result_reference", "artifactId": artifactID,
            "revision": 2, "tripId": tripID, "archiveHistorical": true, "extra": true]])
        await store.load(scope: owner, tripID: tripID, reference: { extra }, open: { _, _ in XCTFail("extra field must not open"); return Data() })
        XCTAssertNil(store.result)
        let empty = try bytes(["version": 1, "data": ["kind": "empty"]])
        await store.load(scope: owner, tripID: tripID, reference: { empty }, open: { _, _ in
            XCTFail("an empty reference must not open a result"); return Data()
        })
        XCTAssertEqual(store.state, "empty")
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

// Test-only v2 wire adapter preserves the earlier Library permission regression cases.
@MainActor private extension NativeLibraryPhraseStore {
    func load(scope requested: NativeDataScope?, exact: NativeLibraryPhraseReference? = nil,
              currentScope: () -> NativeDataScope?, request: NativeTranslationStore.Request) async {
        await load(scope: requested, exact: exact, currentScope: currentScope, request: request, read: { _, id in
            let data = try await request("fixture/history", "GET", nil)
            guard let id else { return data }
            let page = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            let row = (page?["phrases"] as? [[String: Any]])?.first { $0["turnId"] as? String == id }
            guard let row else { return Data("{\"version\":2,\"kind\":\"unavailable\"}".utf8) }
            return try JSONSerialization.data(withJSONObject: ["version": 2, "kind": "translation", "policyId": page?["policyId"] as Any, "phrase": row])
        })
    }
}

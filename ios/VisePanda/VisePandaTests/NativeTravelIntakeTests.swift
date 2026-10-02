import XCTest
@testable import VisePanda

nonisolated final class NativeTravelIntakeTests: XCTestCase {
    @MainActor func testFullProjectionEncodesAllUnknownFieldsAsNull() throws {
        let bytes = try JSONEncoder().encode(NativeTravelIntake())
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: bytes) as? [String: Any])
        XCTAssertEqual(Set(root.keys), Set(NativeTravelIntake.CodingKeys.allCases.map(\.rawValue)))
        for key in NativeTravelIntake.CodingKeys.allCases where key != .schemaVersion { XCTAssertTrue(root[key.rawValue] is NSNull) }
    }
    @MainActor func testCorrectionPreservesUntouchedFieldsAndExplicitClear() throws {
        var original = NativeTravelIntake(city: "shanghai", comparisonTarget: "area_transport", durationDays: 10, partySize: 2,
            interests: ["photography"], pace: "relaxed", lodgingBudget: .init(currency: "CNY", perNightMinorUnits: 40000),
            dates: .init(startDate: "2026-10-03", endDate: "2026-10-10"), mobilityConstraints: ["No stairs"])
        let previous = original; original.city = "beijing"; original.lodgingBudget = nil
        XCTAssertEqual(original.dates, previous.dates); XCTAssertEqual(original.interests, previous.interests)
        XCTAssertEqual(original.mobilityConstraints, previous.mobilityConstraints)
        XCTAssertTrue(original.valid)
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(original)) as? [String: Any])
        XCTAssertTrue(root["lodgingBudget"] is NSNull)
    }
    @MainActor func testUnknownBudgetDoesNotInvalidateTransportProjection() {
        XCTAssertTrue(NativeTravelIntake(city: "shanghai", comparisonTarget: "area_transport").valid)
        XCTAssertTrue(NativeTravelIntake(interests: [], mobilityConstraints: []).valid)
        XCTAssertFalse(NativeTravelIntake(durationDays: 31).valid)
        XCTAssertFalse(NativeTravelIntake(interests: ["food", "food"]).valid)
        XCTAssertFalse(NativeTravelIntake(dates: .init(startDate: "2026-02-30", endDate: "2026-03-01")).valid)
    }
    @MainActor private func target() -> NativeTravelIntakeSelection {
        .init(scope: .init(endpoint: "http://127.0.0.1:63251", subject: UUID().uuidString, mobileEpoch: 1, generation: 1),
            conversationID: UUID().uuidString, goalID: UUID().uuidString, goalVersion: 2, parentMessageID: UUID().uuidString, policyID: UUID().uuidString)
    }
    @MainActor private func wire(_ t: NativeTravelIntakeSelection) throws -> Data {
        let intake = try JSONSerialization.jsonObject(with: JSONEncoder().encode(NativeTravelIntake(city: "shanghai", comparisonTarget: "area_transport")))
        return try JSONSerialization.data(withJSONObject: ["version": 5, "kind": "travel_intake", "schemaVersion": "assistant-travel-current-basis/1",
            "conversationId": t.conversationID, "goalId": t.goalID, "goalVersion": t.goalVersion, "messageId": t.parentMessageID,
            "messageSequence": 4, "intakeRevision": 1, "sourceKind": "explicit_current_input", "intake": intake,
            "memoryBasis": [], "contextDigest": String(repeating: "a", count: 64),
            "readiness": ["kind": "ready", "scope": "transport_screening", "unknown": ["durationDays", "partySize", "interests", "pace", "lodgingBudget", "dates", "mobilityConstraints"]], "readyForProvider": false])
    }
    @MainActor func testClosedResponsesRejectPrivateKeysUnknownEnumsAndFalseProviderClaim() throws {
        let original = try XCTUnwrap(JSONSerialization.jsonObject(with: wire(target())) as? [String: Any])
        for edits: [String: Any] in [["privateReceipt": "secret"], ["readyForProvider": true], ["readiness": ["kind": "online"]], ["sourceKind": "memory"]] {
            var value = original; value.merge(edits) { _, new in new }
            XCTAssertThrowsError(try NativeTravelIntakeBasis.decode(JSONSerialization.data(withJSONObject: value)))
        }
        for reason in ["intake_unrecorded", "stale_basis"] {
            let data = try JSONSerialization.data(withJSONObject: ["version": 5, "kind": "unavailable", "reason": reason, "readyForProvider": false])
            if case .unavailable(let actual) = try NativeTravelIntakeRead.decode(data) { XCTAssertEqual(actual, reason) } else { XCTFail() }
        }
    }
    @MainActor func testLateReadCannotRestoreOldActorOrSelection() async throws {
        let t = target(), store = NativeTravelIntakeStore(); store.bind(t)
        var resume: CheckedContinuation<Data, Never>?
        let task = Task { await store.load(request: { _, _ in await withCheckedContinuation { resume = $0 } }, current: { store.selection }) }
        while resume == nil { await Task.yield() }
        store.invalidate(); resume?.resume(returning: try wire(t)); await task.value
        XCTAssertNil(store.basis); XCTAssertNil(store.selection); XCTAssertEqual(store.state, .idle)
    }
    @MainActor func testUnrecordedNeedsExplicitQualifiedGoalReview() async throws {
        let t = target(), store = NativeTravelIntakeStore(); store.bind(t)
        await store.load(request: { _, _ in try JSONSerialization.data(withJSONObject: ["version": 5, "kind": "unavailable", "reason": "intake_unrecorded", "readyForProvider": false]) }, current: { t })
        XCTAssertNil(store.basis); XCTAssertEqual(store.state, .unavailable)
        await store.reviewForCorrection(request: { _, _ in try self.metadata(t, revision: 0) }, current: { t })
        XCTAssertEqual(store.state, .current); XCTAssertEqual(store.writeBasis?.intakeRevision, 0)
        XCTAssertNil(store.basis); XCTAssertEqual(store.draft, NativeTravelIntake())
    }
    @MainActor func testCASFailureRetainsFullDraftWithoutAutomaticWriteRetry() async throws {
        let t = target(), store = NativeTravelIntakeStore(); store.bind(t)
        await store.load(request: { _, _ in try self.wire(t) }, current: { t })
        store.draft.city = "beijing"; store.draft.dates = .init(startDate: "2026-10-03", endDate: "2026-10-08")
        let saved = store.draft; var writes = 0; var reads = 0
        store.submit(locale: "en", current: { t }, post: { _ in writes += 1; throw NativeDataError.server(code: "VERSION_CONFLICT") }, read: { _, _ in reads += 1; return try self.wire(t) }, accepted: { XCTFail("No acceptance from failed CAS") })
        while store.state == .submitting { await Task.yield() }
        XCTAssertEqual(writes, 1); XCTAssertEqual(reads, 0); XCTAssertEqual(store.draft, saved)
        XCTAssertEqual(store.state, .needsReview); XCTAssertNil(store.basis)
    }
    @MainActor func testReceiptIsNotCurrentBasisAndHistoricalDigestIsRejected() throws {
        var receipt: [String: Any] = ["version": 5, "kind": "accepted", "conversationId": UUID().uuidString, "goalId": UUID().uuidString,
            "messageId": UUID().uuidString, "messageSequence": 5, "goalVersion": 3, "intakeRevision": 2, "reused": true, "current": false, "readyForProvider": false]
        XCTAssertFalse(try NativeTravelIntakeReceipt.decode(JSONSerialization.data(withJSONObject: receipt)).current)
        receipt["contextDigest"] = String(repeating: "a", count: 64)
        XCTAssertThrowsError(try NativeTravelIntakeReceipt.decode(JSONSerialization.data(withJSONObject: receipt)))
        receipt["current"] = true; receipt["privateKey"] = "not allowed"
        XCTAssertThrowsError(try NativeTravelIntakeReceipt.decode(JSONSerialization.data(withJSONObject: receipt)))
    }
    @MainActor func testRevocationDiscardsDraftAndQualification() async throws {
        let t = target(), store = NativeTravelIntakeStore(); store.bind(t)
        await store.load(request: { _, _ in try self.wire(t) }, current: { t })
        store.draft.city = "beijing"
        store.submit(locale: "en", current: { t }, post: { _ in throw NativeDataError.server(code: "DATA_POLICY_BLOCKED") },
            read: { _, _ in XCTFail("No read after blocked admission"); return Data() }, accepted: { XCTFail() })
        while store.state == .submitting { await Task.yield() }
        XCTAssertNil(store.selection); XCTAssertNil(store.basis); XCTAssertEqual(store.draft, NativeTravelIntake())
    }
    @MainActor func testAcceptedReceiptAlwaysReadsBeforeShowingCurrent() async throws {
        let t = target(), store = NativeTravelIntakeStore(); store.bind(t)
        await store.load(request: { _, _ in try self.wire(t) }, current: { t })
        var reads = 0
        store.submit(locale: "en", current: { t }, post: { body in
            let request = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
            return try JSONSerialization.data(withJSONObject: ["version": 5, "kind": "accepted", "conversationId": t.conversationID, "goalId": t.goalID,
                "messageId": request["messageId"]!, "messageSequence": 5, "goalVersion": 3, "intakeRevision": 2, "reused": false, "current": true,
                "readyForProvider": false, "contextDigest": String(repeating: "a", count: 64)])
        }, read: { _, _ in reads += 1; return try self.wire(t) }, accepted: { XCTFail("Old basis cannot validate new receipt") })
        while store.state == .submitting { await Task.yield() }
        XCTAssertEqual(reads, 1); XCTAssertNil(store.basis); XCTAssertEqual(store.state, .needsReview)
    }
    @MainActor func testFreshReadbackValidatesFullReplacementBeforeAcceptance() async throws {
        let t = target(), store = NativeTravelIntakeStore(); store.bind(t)
        await store.load(request: { _, _ in try self.wire(t) }, current: { t })
        store.draft.partySize = 2; store.draft.interests = []
        var request: [String: Any] = [:]; var accepted = false
        store.submit(locale: "zh", current: { t }, post: { body in
            request = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
            XCTAssertEqual(request["expectedGoalVersion"] as? Int, 2)
            XCTAssertEqual(request["expectedIntakeRevision"] as? Int, 1)
            let projection = try XCTUnwrap(request["intake"] as? [String: Any]); XCTAssertTrue(projection["lodgingBudget"] is NSNull)
            return try JSONSerialization.data(withJSONObject: ["version": 5, "kind": "accepted", "conversationId": t.conversationID, "goalId": t.goalID,
                "messageId": request["messageId"]!, "messageSequence": 5, "goalVersion": 3, "intakeRevision": 2, "reused": false, "current": true,
                "readyForProvider": false, "contextDigest": String(repeating: "a", count: 64)])
        }, read: { _, _ in
            var fresh = try XCTUnwrap(JSONSerialization.jsonObject(with: self.wire(t)) as? [String: Any])
            fresh["messageId"] = request["messageId"]; fresh["messageSequence"] = 5; fresh["goalVersion"] = 3; fresh["intakeRevision"] = 2
            fresh["intake"] = request["intake"]
            fresh["readiness"] = ["kind": "ready", "scope": "transport_screening", "unknown": ["durationDays", "pace", "lodgingBudget", "dates", "mobilityConstraints"]]
            return try JSONSerialization.data(withJSONObject: fresh)
        }, accepted: { accepted = true })
        while store.state == .submitting { await Task.yield() }
        XCTAssertTrue(accepted); XCTAssertEqual(store.basis?.intakeRevision, 2); XCTAssertEqual(store.basis?.intake.partySize, 2)
        XCTAssertEqual(store.basis?.intake.interests, []); XCTAssertEqual(store.state, .current)
    }
    @MainActor func testLateAcceptedPostCannotRestoreDismissedEditor() async throws {
        let t = target(), store = NativeTravelIntakeStore(); store.bind(t)
        await store.load(request: { _, _ in try self.wire(t) }, current: { store.selection })
        var resume: CheckedContinuation<Data, Never>?; var reads = 0
        store.submit(locale: "en", current: { store.selection }, post: { _ in await withCheckedContinuation { resume = $0 } },
            read: { _, _ in reads += 1; return Data() }, accepted: { XCTFail() })
        while resume == nil { await Task.yield() }
        store.invalidate(); resume?.resume(returning: Data("{}".utf8))
        for _ in 0..<10 { await Task.yield() }
        XCTAssertEqual(reads, 0); XCTAssertNil(store.selection); XCTAssertNil(store.basis); XCTAssertEqual(store.state, .idle)
    }
    @MainActor private func metadata(_ t: NativeTravelIntakeSelection, revision: Int = 1) throws -> Data {
        try JSONSerialization.data(withJSONObject: ["version": 5, "kind": "travel_intake_write_basis", "conversationId": t.conversationID,
            "goalId": t.goalID, "goalVersion": t.goalVersion, "parentMessageId": t.parentMessageID, "messageSequence": 4,
            "intakeRevision": revision, "policyId": t.policyID, "readyForProvider": false])
    }
    @MainActor func testWriteBasisRejectsContentAndWrongGoalWithoutRestoringAuthority() throws {
        let t = target(); let value = try NativeTravelIntakeWriteBasis.decode(metadata(t))
        XCTAssertTrue(value.matches(t)); XCTAssertFalse(value.matches(target()))
        var root = try XCTUnwrap(JSONSerialization.jsonObject(with: metadata(t)) as? [String: Any])
        for (key, value): (String, Any) in [("intake", ["city": "shanghai"]), ("contextDigest", String(repeating: "a", count: 64)), ("readyForProvider", true), ("intakeRevision", -1)] {
            var invalid = root; invalid[key] = value
            XCTAssertThrowsError(try NativeTravelIntakeWriteBasis.decode(JSONSerialization.data(withJSONObject: invalid)))
        }
        root["kind"] = "travel_intake"; XCTAssertThrowsError(try NativeTravelIntakeWriteBasis.decode(JSONSerialization.data(withJSONObject: root)))
    }
    @MainActor func testExplicitMetadataReviewPreservesDraftClearsMemoryAndNeverPostsAutomatically() async throws {
        let t = target(), store = NativeTravelIntakeStore(); store.bind(t)
        await store.load(request: { _, _ in try self.wire(t) }, current: { t }); store.draft.city = "beijing"
        let saved = store.draft
        await store.reviewForCorrection(request: { _, _ in try self.metadata(t, revision: 7) }, current: { t })
        XCTAssertEqual(store.draft, saved); XCTAssertNil(store.basis); XCTAssertEqual(store.writeBasis?.intakeRevision, 7)
        var writes = 0
        store.submit(locale: "en", current: { t }, post: { body in
            writes += 1; let root = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
            XCTAssertEqual(root["expectedIntakeRevision"] as? Int, 7)
            XCTAssertEqual((root["memoryBasis"] as? [Any])?.count, 0)
            throw NativeDataError.server(code: "VERSION_CONFLICT")
        }, read: { _, _ in XCTFail(); return Data() }, accepted: { XCTFail() })
        while store.state == .submitting { await Task.yield() }
        XCTAssertEqual(writes, 1); XCTAssertEqual(store.draft, saved); XCTAssertNil(store.writeBasis)
        XCTAssertEqual(store.state, .needsReview)
    }
    @MainActor func testLateWriteBasisDoesNotReplaceNewerReviewOrRestoreDismissedScope() async throws {
        let t = target(), store = NativeTravelIntakeStore(); store.bind(t)
        var resume: CheckedContinuation<Data, Never>?
        let old = Task { await store.reviewForCorrection(request: { _, _ in await withCheckedContinuation { resume = $0 } }, current: { store.selection }) }
        while resume == nil { await Task.yield() }
        await store.reviewForCorrection(request: { _, _ in try self.metadata(t, revision: 3) }, current: { store.selection })
        resume?.resume(returning: try metadata(t, revision: 1)); await old.value
        XCTAssertEqual(store.writeBasis?.intakeRevision, 3)
        store.invalidate(); XCTAssertNil(store.writeBasis); XCTAssertNil(store.selection)
    }
    @MainActor func testSameGoalRefreshAfterCASRetainsDraftAndCannotAutomaticallyRestoreWriteQualification() async throws {
        let t = target(), store = NativeTravelIntakeStore(); store.bind(t)
        await store.load(request: { _, _ in try self.wire(t) }, current: { t }); store.draft.city = "beijing"
        let saved = store.draft
        store.submit(locale: "en", current: { t }, post: { _ in throw NativeDataError.server(code: "SERVICE_TASK_CONFLICT") }, read: { _, _ in Data() }, accepted: { XCTFail() })
        while store.state == .submitting { await Task.yield() }
        let next = NativeTravelIntakeSelection(scope: t.scope, conversationID: t.conversationID, goalID: t.goalID, goalVersion: 3, parentMessageID: UUID().uuidString, policyID: t.policyID)
        store.bind(next); XCTAssertEqual(store.draft, saved); XCTAssertEqual(store.state, .needsReview)
        await store.load(request: { _, _ in try self.wire(next) }, current: { next })
        XCTAssertEqual(store.draft, saved); XCTAssertNil(store.basis); XCTAssertNil(store.writeBasis); XCTAssertEqual(store.state, .needsReview)
        await store.reviewForCorrection(request: { _, _ in try self.metadata(next, revision: 4) }, current: { next })
        XCTAssertEqual(store.draft, saved); XCTAssertNil(store.basis); XCTAssertEqual(store.writeBasis?.intakeRevision, 4); XCTAssertEqual(store.state, .current)
        store.bind(target()); XCTAssertEqual(store.draft, NativeTravelIntake()); XCTAssertNil(store.writeBasis)
    }
}

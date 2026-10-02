import XCTest
import SwiftUI
import UIKit
@testable import VisePanda

nonisolated final class NativeQualifiedDelegationTests: XCTestCase {
    @MainActor private func context() throws -> NativeQualifiedDelegationContext {
        let scope = NativeDataScope(endpoint: "http://127.0.0.1:63251", subject: UUID().uuidString, mobileEpoch: 1, generation: 1)
        let selected = NativeTravelIntakeSelection(scope: scope, conversationID: UUID().uuidString, goalID: UUID().uuidString,
            goalVersion: 3, parentMessageID: UUID().uuidString, policyID: UUID().uuidString)
        let intake = try JSONSerialization.jsonObject(with: JSONEncoder().encode(NativeTravelIntake(city: "shanghai", comparisonTarget: "area_transport", durationDays: 10, partySize: 2, interests: ["food"], pace: "relaxed")))
        let bytes = try JSONSerialization.data(withJSONObject: ["version": 5, "kind": "travel_intake", "schemaVersion": "assistant-travel-current-basis/1",
            "conversationId": selected.conversationID, "goalId": selected.goalID, "goalVersion": 3, "messageId": selected.parentMessageID, "messageSequence": 7,
            "intakeRevision": 2, "sourceKind": "explicit_current_input", "intake": intake, "memoryBasis": [], "contextDigest": String(repeating: "a", count: 64),
            "readiness": ["kind": "ready", "scope": "transport_screening", "unknown": ["lodgingBudget", "dates", "mobilityConstraints"]], "readyForProvider": false])
        return .init(selection: selected, basisScope: scope, basis: try NativeTravelIntakeBasis.decode(bytes),
            planningPolicy: .init(id: UUID().uuidString, scope: scope, textPolicyID: selected.policyID, consentAccepted: true, current: true))
    }
    @MainActor private func receipt(_ request: NativeQualifiedDelegationRPC, artifact: String = UUID().uuidString, current: Bool = true, reused: Bool = false) throws -> Data {
        var v: [String: Any] = ["kind": "accepted", "reused": reused, "taskId": request.taskID, "turnId": request.turnID, "artifactId": artifact,
            "conversationId": request.conversationID, "goalId": request.goalID, "goalVersion": request.expectedGoalVersion, "messageId": request.messageID,
            "messageSequence": 9, "intakeRevision": request.expectedIntakeRevision + 1, "current": current, "readyForProvider": false, "executionAvailable": false]
        if current { v["intakeContextDigest"] = String(repeating: "b", count: 64); v["planningContextDigest"] = String(repeating: "c", count: 64) }
        return try JSONSerialization.data(withJSONObject: v)
    }
    @MainActor func testExactTwentyRPCParametersPreserveFullProjectionAndOriginalAuthority() throws {
        let c = try context(), r = try NativeQualifiedDelegationRPC(context: c, locale: "en", text: "Compare stay areas using my confirmed current requirements")
        let v = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(r)) as? [String: Any])
        XCTAssertEqual(Set(v.keys), Set(NativeQualifiedDelegationRPC.CodingKeys.allCases.map(\.rawValue))); XCTAssertEqual(v.count, 20)
        XCTAssertEqual(r.parentMessageID, c.basis.messageId); XCTAssertEqual(r.expectedIntakeMessageID, c.basis.messageId)
        XCTAssertEqual(r.expectedSourceSequence, 7); XCTAssertEqual(r.expectedIntakeRevision, 2); XCTAssertEqual(r.expectedIntakeDigest, c.basis.contextDigest)
        XCTAssertEqual(r.intake, c.basis.intake); XCTAssertTrue((v["p_intake"] as? [String: Any])?["lodgingBudget"] is NSNull)
        XCTAssertNil(v["ownerId"]); XCTAssertNil(v["provider"]); XCTAssertNil(v["budget"])
    }
    @MainActor func testPolicyAndScopeSnapshotsCannotBorrowOldInputOrConsent() throws {
        let c = try context(), foreign = try context()
        let wrongActor = NativeQualifiedDelegationContext(selection: foreign.selection, basisScope: c.basisScope, basis: c.basis, planningPolicy: c.planningPolicy)
        XCTAssertFalse(wrongActor.qualified)
        let revoked = NativeQualifiedDelegationContext(selection: c.selection, basisScope: c.basisScope, basis: c.basis,
            planningPolicy: .init(id: c.planningPolicy.id, scope: c.selection.scope, textPolicyID: c.selection.policyID, consentAccepted: false, current: true))
        XCTAssertFalse(revoked.qualified); XCTAssertThrowsError(try NativeQualifiedDelegationRPC(context: revoked, locale: "en", text: "Explicit delegation"))
        XCTAssertThrowsError(try NativeQualifiedDelegationRPC(context: c, locale: "en", text: ""))
    }
    @MainActor func testClosedReceiptSeparatesBothDigestsAndRejectsFakeExecution() throws {
        let r = try NativeQualifiedDelegationRPC(context: context(), locale: "zh", text: "明确委托比较住宿区域和交通")
        let base = try XCTUnwrap(JSONSerialization.jsonObject(with: receipt(r)) as? [String: Any])
        for edits: [String: Any] in [["contextDigest": String(repeating: "b", count: 64)], ["ownerId": UUID().uuidString], ["executionAvailable": true], ["readyForProvider": true], ["planningContextDigest": String(repeating: "b", count: 64)]] {
            var v = base; v.merge(edits) { _, new in new }
            XCTAssertThrowsError(try NativeQualifiedDelegationRPCReceipt.decode(JSONSerialization.data(withJSONObject: v)))
        }
        XCTAssertTrue(try NativeQualifiedDelegationRPCReceipt.decode(receipt(r)).matches(r))
        var stale = base; stale["current"] = false
        XCTAssertThrowsError(try NativeQualifiedDelegationRPCReceipt.decode(JSONSerialization.data(withJSONObject: stale)))
        XCTAssertFalse(try NativeQualifiedDelegationRPCReceipt.decode(receipt(r, current: false)).current)
        var http = base; http["version"] = 2
        XCTAssertTrue(try NativeQualifiedDelegationHTTPReceipt.decode(JSONSerialization.data(withJSONObject: http)).matches(r))
        http["version"] = 1; XCTAssertThrowsError(try NativeQualifiedDelegationHTTPReceipt.decode(JSONSerialization.data(withJSONObject: http)))
    }
    @MainActor func testRealEntryNeverSendsEvenWithQualifiedInput() async throws {
        let store = NativeQualifiedDelegationStore(); store.bind(try context()); store.draft = "Explicit current delegation"
        _ = try store.prepareLocalFixture(locale: "en"); var calls = 0
        await store.attemptRealSubmission { _ in calls += 1; return Data() }
        XCTAssertEqual(calls, 0); XCTAssertFalse(store.canStartRealWork); XCTAssertEqual(store.state, .unavailable)
    }
    @MainActor func testIdenticalLocalReplayKeepsIDsAndStableReceiptIdentity() async throws {
        let c = try context(), store = NativeQualifiedDelegationStore(); store.bind(c); store.draft = "Explicit current delegation"
        let first = try store.prepareLocalFixture(locale: "en"), again = try store.prepareLocalFixture(locale: "en")
        XCTAssertEqual(first, again); let artifact = UUID().uuidString
        await store.inspectLocalRPCReceipt(current: { c }, response: { try self.receipt($0, artifact: artifact) })
        XCTAssertEqual(store.state, .localReceipt); XCTAssertFalse(store.canStartRealWork)
        await store.inspectLocalRPCReceipt(current: { c }, response: { try self.receipt($0, artifact: artifact, reused: true) })
        XCTAssertEqual(store.receipt?.artifactId, artifact); XCTAssertEqual(store.receipt?.reused, true)
        store.draft = "Changed delegation"; XCTAssertThrowsError(try store.prepareLocalFixture(locale: "en"))
        await store.inspectLocalRPCReceipt(current: { c }, response: { try self.receipt($0, artifact: UUID().uuidString, reused: true) })
        XCTAssertEqual(store.state, .needsReview); XCTAssertNil(store.receipt)
    }
    @MainActor func testLateReceiptCannotRestoreCancelledOrOtherSessionContext() async throws {
        let c = try context(), store = NativeQualifiedDelegationStore(); store.bind(c); store.draft = "Explicit current delegation"
        let r = try store.prepareLocalFixture(locale: "en"); var resume: CheckedContinuation<Data, Never>?
        let pending = Task { await store.inspectLocalRPCReceipt(current: { store.context }, response: { _ in await withCheckedContinuation { resume = $0 } }) }
        while resume == nil { await Task.yield() }
        store.bind(try context()); resume?.resume(returning: try receipt(r)); await pending.value
        XCTAssertNil(store.receipt); XCTAssertNil(store.request); XCTAssertEqual(store.draft, "")
        store.invalidate(); XCTAssertNil(store.context)
    }
    @MainActor func test409AndStaleReplayNeverResubmitOrGrantExecution() async throws {
        let c = try context(), store = NativeQualifiedDelegationStore(); store.bind(c); store.draft = "Explicit current delegation"
        _ = try store.prepareLocalFixture(locale: "en"); var calls = 0
        await store.inspectLocalRPCReceipt(current: { c }, response: { _ in calls += 1; throw NativeDataError.server(code: "SERVICE_TASK_CONFLICT") })
        XCTAssertEqual(calls, 1); XCTAssertEqual(store.draft, "Explicit current delegation"); XCTAssertEqual(store.state, .needsReview)
        await store.inspectLocalRPCReceipt(current: { c }, response: { try self.receipt($0, current: false, reused: true) })
        XCTAssertEqual(store.state, .needsReview); XCTAssertFalse(store.canStartRealWork)
        await store.inspectLocalRPCReceipt(current: { c }, response: { _ in throw NativeDataError.server(code: "DATA_POLICY_BLOCKED") })
        XCTAssertNil(store.context); XCTAssertNil(store.request); XCTAssertNil(store.receipt); XCTAssertEqual(store.draft, "")
        XCTAssertNotNil(store.pendingIdentity)
        store.bind(c); store.draft = "Explicit new delegation"
        XCTAssertThrowsError(try store.prepareLocalFixture(locale: "en"), "A recovery identity cannot silently create another admission")
    }
    @MainActor func testFrozenHTTPNineteenKeysExcludeServerTextPolicyAndDoNotChangeRPCIdentity() throws {
        let r = try NativeQualifiedDelegationRPC(context: context(), locale: "en", text: "Explicit qualified delegation")
        let v = try XCTUnwrap(JSONSerialization.jsonObject(with: NativeQualifiedDelegationHTTPRequest(rpc: r).bytes()) as? [String: Any])
        XCTAssertEqual(v.count, 19); XCTAssertEqual(Set(v.keys), Set(NativeQualifiedDelegationHTTPRequest.CodingKeys.allCases.map(\.rawValue)))
        XCTAssertNil(v["textPolicyId"]); XCTAssertNil(v["p_text_policy_id"]); XCTAssertNil(v["ownerId"])
        XCTAssertEqual(v["messageKey"] as? String, r.messageKey); XCTAssertEqual(v["taskKey"] as? String, r.taskKey)
        XCTAssertEqual(v["expectedIntakeDigest"] as? String, r.expectedIntakeDigest)
        XCTAssertEqual(v["parentMessageId"] as? String, v["expectedIntakeMessageId"] as? String)
        XCTAssertTrue((v["intake"] as? [String: Any])?["lodgingBudget"] is NSNull)
    }
    @MainActor func testLocalHTTPReplayIsMetadataOnlyAndCannotRestoreHistoricalDigest() async throws {
        let c = try context(), store = NativeQualifiedDelegationStore(); store.bind(c); store.draft = "Explicit qualified delegation"
        _ = try store.prepareLocalFixture(locale: "en")
        await store.inspectLocalHTTPReceipt(current: { c }, response: { request in
            var v = try XCTUnwrap(JSONSerialization.jsonObject(with: self.receipt(request.rpc, current: false, reused: true)) as? [String: Any]); v["version"] = 2
            return try JSONSerialization.data(withJSONObject: v)
        })
        XCTAssertEqual(store.state, .needsReview); XCTAssertNil(store.receipt?.intakeContextDigest); XCTAssertNil(store.receipt?.planningContextDigest)
        XCTAssertFalse(store.canStartRealWork); XCTAssertNotNil(store.request)
    }
    @MainActor func testRenderedPreparationDraftWithoutExecutableAdmission() async throws {
        let c = try context(), store = NativeQualifiedDelegationStore()
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.first as? UIWindowScene)
        let previous = scene.windows.first(where: { $0.isKeyWindow })
        let window = UIWindow(windowScene: scene)
        let host = UIHostingController(rootView: NativeQualifiedDelegationView(context: c, chinese: false, store: store))
        window.rootViewController = host; window.makeKeyAndVisible()
        defer { window.isHidden = true; previous?.makeKeyAndVisible() }
        func textView(_ view: UIView) -> UITextView? {
            if let text = view as? UITextView { return text }
            return view.subviews.lazy.compactMap(textView).first
        }
        var editor: UITextView?
        for _ in 0..<20 {
            host.view.layoutIfNeeded(); editor = textView(host.view)
            if editor != nil { break }; try await Task.sleep(for: .milliseconds(50))
        }
        let field = try XCTUnwrap(editor); field.becomeFirstResponder(); field.insertText("Compare using my explicitly confirmed requirements")
        await Task.yield()
        XCTAssertEqual(store.draft, "Compare using my explicitly confirmed requirements"); XCTAssertFalse(store.canStartRealWork)
        field.resignFirstResponder()
        let picture = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in window.drawHierarchy(in: window.bounds, afterScreenUpdates: true) }
        let attachment = XCTAttachment(image: picture); attachment.name = "LOCAL-rendered-preparation-no-execution"; attachment.lifetime = .keepAlways; add(attachment)
        store.invalidate(); XCTAssertEqual(store.draft, ""); XCTAssertNil(store.context)
    }
}

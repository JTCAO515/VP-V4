import XCTest
@testable import VisePanda

nonisolated final class NativeQAConsumerTests: XCTestCase {
    @MainActor func testSavedSessionSelectionReadsPersistedAnswerWithoutSubmission() async {
        let port = NativeQAConsumerTestPort(); port.saved = true
        let store = NativeQAStore(transport: port)
        await store.activate(true); await store.select(port.sessionID)
        XCTAssertEqual(store.messages.first?.text, "Synthetic persisted answer")
        XCTAssertEqual(port.posts, 0)
        let reopened = NativeQAStore(transport: port)
        await reopened.activate(true); await reopened.select(port.sessionID)
        XCTAssertEqual(reopened.messages, store.messages)
        XCTAssertEqual(port.posts, 0)
    }
    @MainActor func testSubmissionRetainsExactBytesBeforePostAndClearsOnlyAfterReadback() async {
        let port = NativeQAConsumerTestPort(); let store = NativeQAStore(transport: port)
        await store.activate(true); await store.select(port.sessionID)
        store.draft = "  Original question \n"; await store.send()
        XCTAssertEqual(port.posts, 1)
        XCTAssertEqual(port.posted?.originalText, "  Original question \n")
        XCTAssertNil(port.retained)
        XCTAssertEqual(store.messages.first?.input, "  Original question \n")
        XCTAssertEqual(store.state, .ready)
    }
    @MainActor func testJournalWriteFailurePreventsAnyPost() async {
        let port = NativeQAConsumerTestPort(); port.failRetain = true
        let store = NativeQAStore(transport: port)
        await store.activate(true); await store.select(port.sessionID)
        store.draft = "Do not send without durable identity"; await store.send()
        XCTAssertEqual(port.posts, 0); XCTAssertEqual(store.state, .unavailable)
    }
    @MainActor func testLostAckReopenRecoversOriginalRequestWithoutSecondPost() async {
        let port = NativeQAConsumerTestPort(); port.dropAck = true
        let store = NativeQAStore(transport: port)
        await store.activate(true); await store.select(port.sessionID)
        store.draft = "Lost acknowledgement"; await store.send()
        let original = port.retained
        XCTAssertNotNil(original); XCTAssertEqual(store.state, .unknown)
        let reopened = NativeQAStore(transport: port)
        await reopened.activate(true)
        XCTAssertEqual(port.posts, 1); XCTAssertNil(port.retained)
        XCTAssertEqual(reopened.messages.first?.requestId, original?.requestID)
    }
    @MainActor func testAbsentReceiptRetainsOriginalBytesAndBlocksAnotherSubmission() async {
        let port = NativeQAConsumerTestPort(); port.hideReceipt = true
        let store = NativeQAStore(transport: port)
        await store.activate(true); await store.select(port.sessionID)
        store.draft = "Receipt is unknown"; await store.send()
        let retained = port.retained
        await store.refresh(); store.draft = "Do not replace"; await store.send()
        XCTAssertEqual(port.posts, 1); XCTAssertEqual(port.retained, retained)
        XCTAssertEqual(store.state, .unknown); XCTAssertFalse(store.canSend)
    }
    @MainActor func testChangedNoticeDoesNotSendOrRebindPending() async {
        let port = NativeQAConsumerTestPort(); port.hideReceipt = true
        let store = NativeQAStore(transport: port)
        await store.activate(true); await store.select(port.sessionID)
        store.draft = "Original policy binding"; await store.send()
        let retained = port.retained
        port.noticeHash = String(repeating: "b", count: 64)
        await store.refresh()
        XCTAssertEqual(store.state, .blocked("PENDING_NOTICE_CHANGED"))
        XCTAssertEqual(port.retained, retained); XCTAssertEqual(port.posts, 1)
    }
    @MainActor func testBackgroundClearsVisiblePayloadAndPreservesUnknownCommand() async {
        let port = NativeQAConsumerTestPort(); port.hideReceipt = true
        let store = NativeQAStore(transport: port)
        await store.activate(true); await store.select(port.sessionID)
        store.draft = "Keep durable only"; await store.send()
        let retained = port.retained
        await store.activate(false)
        XCTAssertTrue(store.messages.isEmpty); XCTAssertTrue(store.sessions.isEmpty)
        XCTAssertNil(store.policy); XCTAssertNil(store.pending); XCTAssertTrue(store.draft.isEmpty)
        XCTAssertEqual(port.retained, retained); XCTAssertFalse(store.canSend)
    }
    @MainActor func testActorChangeDuringReadDiscardsLateProjection() async {
        let port = NativeQAConsumerTestPort(); port.saved = true; port.changeActorOnHistory = true
        let store = NativeQAStore(transport: port)
        await store.activate(true); await store.select(port.sessionID)
        XCTAssertTrue(store.messages.isEmpty); XCTAssertTrue(store.sessions.isEmpty)
        XCTAssertNil(store.policy); XCTAssertEqual(store.state, .signedOut)
    }
    @MainActor func testForeignSessionReplyCannotBecomeVisible() async {
        let port = NativeQAConsumerTestPort(); port.saved = true; port.foreignHistory = true
        let store = NativeQAStore(transport: port)
        await store.activate(true); await store.select(port.sessionID)
        XCTAssertEqual(store.state, .unavailable); XCTAssertTrue(store.messages.isEmpty); XCTAssertFalse(store.canSend)
    }
    @MainActor func testPendingTerminalDistinctionAndEightTurnBound() async {
        let port = NativeQAConsumerTestPort(); port.saved = true; port.messageStatus = "pending"
        let store = NativeQAStore(transport: port)
        await store.activate(true); await store.select(port.sessionID)
        store.draft = "Should wait"; XCTAssertFalse(store.canSend); XCTAssertEqual(store.state, .pending)
        port.messageStatus = "answered"; port.messageCount = 8
        await store.refresh(); store.draft = "Ninth question"
        XCTAssertEqual(store.messages.count, 8); XCTAssertFalse(store.canSend); XCTAssertEqual(port.posts, 0)
    }
    @MainActor func testConsentUsesExactReviewedNoticeAndNeverAutoAccepts() async {
        let port = NativeQAConsumerTestPort(); port.consent = "not_accepted"
        let store = NativeQAStore(transport: port)
        await store.activate(true)
        XCTAssertEqual(port.consents, 0); XCTAssertEqual(store.state, .blocked("CONSENT_REQUIRED"))
        port.noticeHash = String(repeating: "b", count: 64)
        await store.acceptConsent()
        XCTAssertEqual(port.consents, 0); XCTAssertEqual(store.state, .blocked("NOTICE_CHANGED"))
    }
    @MainActor func testLocalRequestPathsAndPendingIdentityAreClosed() throws {
        let port = NativeQAConsumerTestPort()
        let policy = try JSONDecoder().decode(NativeQAPolicy.self, from: JSONSerialization.data(withJSONObject: port.policy))
        let command = try NativeQAPending(scope: XCTUnwrap(port.scope), sessionID: port.sessionID, policy: policy, text: "Original bytes")
        XCTAssertEqual(try NativeQARequest.submit(command).body, command.body)
        XCTAssertTrue(try NativeQARequest.recover(sessionID: port.sessionID, requestID: command.requestID).path.hasPrefix("api/qa-agent/native/v1/sessions/"))
        XCTAssertThrowsError(try NativeQARequest.history(sessionID: "../other").path)
        XCTAssertFalse(command.matches(.init(endpoint: port.scope!.endpoint, subject: port.scope!.subject, mobileEpoch: 2, generation: 0)))
        XCTAssertThrowsError(try NativeQAWire.decode(NativeQAWire.Policy.self, response: .init(status: 200, body: Data("{\"version\":\"foreign/1\"}".utf8))))
    }
}

/// Synthetic transport only: no Auth, HTTP, Keychain, SQL, provider or target evidence.
@MainActor private final class NativeQAConsumerTestPort: NativeQATransport {
    var scope: NativeDataScope? = .init(endpoint: "https://synthetic.invalid", subject: "00000000-0000-4000-8000-000000000001", mobileEpoch: 1, generation: 0)
    let sessionID = "00000000-0000-4000-8000-000000000002"
    let policyID = "00000000-0000-4000-8000-000000000003"
    var retained: NativeQAPending?
    var posted: NativeQAPending?
    var posts = 0, consents = 0, messageCount = 1
    var failRetain = false, dropAck = false, hideReceipt = false, saved = false
    var changeActorOnHistory = false, foreignHistory = false
    var noticeHash = String(repeating: "a", count: 64)
    var consent = "accepted", messageStatus = "answered"
    var policy: [String: Any] {
        ["id": policyID, "noticeHash": noticeHash, "noticeZh": "合成说明", "noticeEn": "Synthetic notice", "provider": "synthetic", "recipient": "synthetic", "consentState": consent, "contextMode": "qa_session_history_v1", "maxTurns": 8]
    }
    var session: [String: Any] { ["id": sessionID, "label": "Synthetic session", "createdAt": "2026-10-16T00:00:00Z", "updatedAt": "2026-10-16T00:00:00Z"] }
    var messages: [[String: Any]] {
        guard saved else { return [] }
        return (0..<messageCount).map { index in
            let id = index == 0 ? posted?.requestID ?? "00000000-0000-4000-8000-000000000004" : String(format: "00000000-0000-4000-8000-%012d", index + 10)
            return ["requestId": id, "turnId": id, "sessionId": sessionID, "input": posted?.originalText ?? "Synthetic question", "text": messageStatus == "pending" ? NSNull() : "Synthetic persisted answer", "status": messageStatus, "createdAt": "2026-10-16T00:00:00Z"]
        }
    }
    func loadPending(scope: NativeDataScope) throws -> NativeQAPending? {
        guard let retained else { return nil }
        guard retained.matches(scope) else { throw NativeQAError.stale }
        return retained
    }
    func retainPending(_ pending: NativeQAPending, scope: NativeDataScope) throws {
        if failRetain { throw NativeQAError.journalUnavailable }
        guard retained == nil || retained == pending, pending.matches(scope) else { throw NativeQAError.stale }
        retained = pending
    }
    func clearPending(_ pending: NativeQAPending, scope: NativeDataScope) throws {
        guard pending == retained, pending.matches(scope) else { throw NativeQAError.stale }
        retained = nil
    }
    func request(_ request: NativeQARequest, scope: NativeDataScope) async throws -> NativeQAHTTPResponse {
        var object: [String: Any]
        switch request {
        case .policy: object = ["policy": policy]
        case .sessions: object = ["sessions": [session]]
        case .createSession: object = ["session": session]
        case .consent(let id, let hash):
            guard id == policyID, hash == noticeHash else { throw NativeQAError.invalidResponse }
            consents += 1; consent = "accepted"; object = ["policy": policy]
        case .submit(let pending):
            guard retained == pending else { throw NativeQAError.journalUnavailable }
            posts += 1; posted = pending; saved = true
            if dropAck { throw NativeQAError.server(code: "PROVIDER_UNAVAILABLE", ack: "unknown") }
            object = ["requestId": pending.requestID, "turnId": pending.requestID, "sessionId": sessionID, "status": "pending", "reused": false]
        case .recover:
            if hideReceipt { throw NativeQAError.server(code: "PROVIDER_UNAVAILABLE", ack: "unknown") }
            object = ["message": messages.first as Any]
        case .history:
            if changeActorOnHistory { self.scope = nil }
            var selected = session
            if foreignHistory { selected["id"] = policyID }
            object = ["session": selected, "messages": messages, "historyLimit": 20, "policy": policy]
        }
        object["version"] = "qa-agent/1"
        return .init(status: 200, body: try JSONSerialization.data(withJSONObject: object))
    }
}

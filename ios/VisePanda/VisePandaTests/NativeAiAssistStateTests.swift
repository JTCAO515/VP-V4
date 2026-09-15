import XCTest
@testable import VisePanda

/// VPJ-76 (#360) slice 9: NativeAskStore.runAiAssist, the iOS counterpart of
/// the Web job orchestration already covered server-side by
/// tests/contract/knowledge/wiki-grounded-ai-assist-job.test.mjs. Only the
/// client-side polling/decoding contract is exercised here -- the job's own
/// claim/complete/fencing semantics are the server's responsibility and are
/// verified there (and against a real database).
nonisolated final class NativeAiAssistStateTests: XCTestCase {
    private static let turnId = "40000000-0000-4000-8000-000000000001"

    @MainActor private func groundedStore() async throws -> (NativeSession, NativeAskStore) {
        AiAssistProtocol.reset()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [AiAssistProtocol.self]
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "vpj76.ai-assist.\(UUID().uuidString)"))
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", "http://127.0.0.1:59651", "-VisePandaGroundedMode"], defaults: defaults, configuration: configuration)
        await session.login(email: "ai-assist-owner", password: "unit-only")
        let store = NativeAskStore(mode: .grounded)
        await store.reload(using: session)
        XCTAssertEqual(store.policy?.consentState, .accepted)
        XCTAssertEqual(store.turns.map(\.id), [Self.turnId])
        XCTAssertEqual(store.turns.first?.result?.originalOutcome, "blocked")
        return (session, store)
    }

    @MainActor func testImmediateAnsweredOutcomeIsStoredAsDone() async throws {
        let (session, store) = try await groundedStore()
        AiAssistProtocol.enqueue(["data": ["status": "succeeded", "outcome": ["kind": "answered", "summary": "Most large merchants accept international cards.", "gaps": []]]])
        await store.runAiAssist(Self.turnId, using: session)
        guard case .done(let reply) = store.aiAssist[Self.turnId] else { return XCTFail("expected .done") }
        XCTAssertEqual(reply.status, "succeeded")
        XCTAssertEqual(reply.outcome?.kind, "answered")
        XCTAssertEqual(reply.outcome?.summary, "Most large merchants accept international cards.")
        await session.logout()
    }

    @MainActor func testNotOfferedOutcomeIsStoredAsDoneNotError() async throws {
        let (session, store) = try await groundedStore()
        AiAssistProtocol.enqueue(["data": ["status": "not_offered", "reason": "not_blocked"]])
        await store.runAiAssist(Self.turnId, using: session)
        guard case .done(let reply) = store.aiAssist[Self.turnId] else { return XCTFail("expected .done") }
        XCTAssertEqual(reply.status, "not_offered")
        XCTAssertEqual(reply.reason, "not_blocked")
        await session.logout()
    }

    @MainActor func testPendingThenSucceededPollsOnceMoreBeforeSettling() async throws {
        let (session, store) = try await groundedStore()
        AiAssistProtocol.enqueue(["data": ["status": "pending"]])
        AiAssistProtocol.enqueue(["data": ["status": "succeeded", "outcome": ["kind": "unavailable", "reason": "retrieval_miss"]]])
        await store.runAiAssist(Self.turnId, using: session)
        XCTAssertEqual(AiAssistProtocol.callCount, 2)
        guard case .done(let reply) = store.aiAssist[Self.turnId] else { return XCTFail("expected .done") }
        XCTAssertEqual(reply.outcome?.kind, "unavailable")
        XCTAssertEqual(reply.outcome?.reason, "retrieval_miss")
        await session.logout()
    }

    @MainActor func testMalformedReplyIsErrorNotCrash() async throws {
        let (session, store) = try await groundedStore()
        AiAssistProtocol.enqueue(["data": ["status": "succeeded"]]) // "succeeded" with no outcome fails NativeAiAssistStatus.valid
        await store.runAiAssist(Self.turnId, using: session)
        XCTAssertEqual(store.aiAssist[Self.turnId], .error)
        await session.logout()
    }

    @MainActor func testUnknownTurnIsANoOp() async throws {
        let (session, store) = try await groundedStore()
        await store.runAiAssist(UUID().uuidString.lowercased(), using: session)
        XCTAssertTrue(store.aiAssist.isEmpty)
        await session.logout()
    }
}

nonisolated private final class AiAssistProtocol: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var queue: [[String: Any]] = []
    nonisolated(unsafe) private static var calls = 0
    static var callCount: Int { lock.withLock { calls } }
    static func reset() { lock.withLock { queue = []; calls = 0 } }
    static func enqueue(_ reply: [String: Any]) { lock.withLock { queue.append(reply) } }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}
    override func startLoading() {
        let path = request.url?.path ?? ""
        if path.hasSuffix("/policy") {
            reply(["version": 4, "kind": "policy", "policy": ["id": "11111111-1111-4111-8111-111111111111", "provider": "qwen", "recipient": "fixture", "sourceRegion": "fixture", "processingRegion": "fixture", "storageRegion": "fixture", "termsVersion": "fixture", "noticeVersion": "fixture", "noticeHash": String(repeating: "a", count: 64), "noticeZh": "合成条款", "noticeEn": "Synthetic terms", "retention": "retain_after_hide_v1", "expiresAt": "2099-01-01", "consentState": "accepted"]])
            return
        }
        if path.hasSuffix("/turns") && request.httpMethod == "GET" {
            let turnId = NativeAiAssistStateTests.turnIdForTest
            reply(["version": 4, "kind": "grounded_history", "turns": [
                ["turnId": turnId, "threadId": "50000000-0000-4000-8000-000000000001", "locale": "en", "input": "Can I pay by international card in Shanghai?", "outcome": "blocked", "output": "reviewed-answer-v1", "status": "unavailable", "createdAt": "2026-09-15T00:00:00Z", "serviceTaskId": "60000000-0000-4000-8000-000000000001", "scopeVersion": 1, "relationship": "new_goal", "parentTurnId": NSNull(),
                 "result": ["type": "reviewed_answer", "city": "shanghai", "intent": "payment_card_acceptance", "requestScope": "single", "originalOutcome": "blocked", "completedAt": "2026-09-15T00:00:00Z", "projection": "unavailable", "knowledge": NSNull()]],
            ]])
            return
        }
        if path.contains("/ai-assist") {
            Self.lock.withLock { Self.calls += 1 }
            let next = Self.lock.withLock { Self.queue.isEmpty ? nil : Self.queue.removeFirst() }
            reply(next ?? ["data": ["status": "failed", "errorCode": "NO_FIXTURE_QUEUED"]])
            return
        }
        if path.hasSuffix("/credentials") || path.hasSuffix("/refresh") {
            reply(["subject": "ai-assist-owner", "accessToken": "ai-assist-owner", "refreshToken": "ai-assist-owner", "expiresAt": Date().timeIntervalSince1970 + 3600, "mobileEpoch": 1])
        } else if path.hasSuffix("/profile") { reply(["subject": "ai-assist-owner", "displayName": "ai-assist-owner"]) }
        else { reply(["subject": "ai-assist-owner", "mobileEpoch": 1]) }
    }
    private func reply(_ value: [String: Any]) {
        guard let url = request.url, let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"]), let data = try? JSONSerialization.data(withJSONObject: value) else { return }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data); client?.urlProtocolDidFinishLoading(self)
    }
}

extension NativeAiAssistStateTests { nonisolated static var turnIdForTest: String { turnId } }

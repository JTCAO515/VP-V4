import XCTest
import SwiftUI
@testable import VisePanda

nonisolated final class NativeAskStateTests: XCTestCase {
    @MainActor func testEventParserRequiresCompleteFrameAndMonotonicMatchingCursor() throws {
        let id = "30000000-0000-4000-8000-000000000001"
        let json = "{\"schemaVersion\":\"grounded-events/1\",\"turnId\":\"\(id)\",\"sequence\":1,\"eventId\":\"accepted\",\"type\":\"accepted\",\"state\":\"accepted\",\"turn\":null}"
        let wire = "id: 1\nevent: turn\ndata: \(json)\n\n"
        var parser = NativeAskEventDecoder()
        var frames: [NativeAskEventDecoder.Frame] = []
        for byte in wire.utf8 { if let frame = try parser.append(byte) { frames.append(frame) } }
        try parser.finish()
        XCTAssertEqual(frames.count, 1)
        let frame = try XCTUnwrap(frames.first)
        let event = try JSONDecoder().decode(NativeAskEvent.self, from: frame.data)
        XCTAssertEqual(try event.validate(frame: frame, expected: id, cursor: 0), 1)
        XCTAssertThrowsError(try event.validate(frame: frame, expected: id, cursor: 1))
        XCTAssertThrowsError(try event.validate(frame: frame, expected: UUID().uuidString, cursor: 0))
        for length in [1, 8, wire.utf8.count - 1] {
            var truncated = NativeAskEventDecoder()
            for byte in wire.utf8.prefix(length) { XCTAssertNil(try truncated.append(byte)) }
            XCTAssertThrowsError(try truncated.finish())
        }
    }

    @MainActor func testEventParserRejectsOversizedOrAmbiguousFrames() throws {
        for wire in ["id: 01\n", "id: 1\nid: 2\n", "event: turn\nevent: projection\n", "data: {}\ndata: {}\n", "event: invented\n"] {
            var parser = NativeAskEventDecoder()
            XCTAssertThrowsError(try wire.utf8.forEach { _ = try parser.append($0) })
        }
        var parser = NativeAskEventDecoder()
        XCTAssertThrowsError(try (0...262_144).forEach { _ in _ = try parser.append(65) })
    }

    @MainActor private func session(grounded: Bool = false) throws -> NativeSession {
        TextStateProtocol.reset()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [TextStateProtocol.self]
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "vpj07.state.\(UUID().uuidString)"))
        return NativeSession(arguments: ["-VisePandaNativeAPI", "http://127.0.0.1:59651"] + (grounded ? ["-VisePandaGroundedMode"] : []), defaults: defaults, configuration: configuration)
    }
    @MainActor func testGroundedConsentScreenDoesNotPollEverySecond() async throws {
        let session = try session(grounded: true)
        TextStateProtocol.immediatePolicy()
        await session.login(email: "text-owner-a", password: "unit-only")
        let store = NativeAskStore(mode: .grounded)
        await store.reload(using: session)
        XCTAssertEqual(store.policy?.consentState, .notAccepted)
        XCTAssertGreaterThan(store.groundedRefreshDelay, 25)
        XCTAssertLessThanOrEqual(store.groundedRefreshDelay, 30)
        XCTAssertFalse(store.busy); XCTAssertFalse(store.canSend)
        store.suspendReads()
        XCTAssertFalse(store.groundedCurrent); XCTAssertNil(store.policy)
        await session.logout()
    }

    @MainActor func testGroundedAcceptedReadRefreshesBeforeLeaseExpires() async throws {
        let session = try session(grounded: true)
        TextStateProtocol.immediatePolicy()
        TextStateProtocol.acceptGroundedPolicy()
        await session.login(email: "text-owner-a", password: "unit-only")
        let store = NativeAskStore(mode: .grounded)
        await store.reload(using: session)
        XCTAssertEqual(store.policy?.consentState, .accepted)
        XCTAssertTrue(store.groundedCurrent)
        XCTAssertGreaterThan(store.groundedRefreshDelay, 20)
        XCTAssertLessThanOrEqual(store.groundedRefreshDelay, 25)
        store.draft = "Shanghai four days, food and walks"
        store.suspendReads()
        XCTAssertFalse(store.groundedCurrent)
        XCTAssertNil(store.policy)
        XCTAssertTrue(store.turns.isEmpty)
        XCTAssertTrue(store.aiAssist.isEmpty)
        XCTAssertEqual(store.draft, "Shanghai four days, food and walks")
        await store.reload(using: session)
        XCTAssertTrue(store.groundedCurrent)
        XCTAssertEqual(store.policy?.consentState, .accepted)
        XCTAssertEqual(store.draft, "Shanghai four days, food and walks")
        store.reset(for: nil)
        XCTAssertNil(store.scope)
        XCTAssertTrue(store.draft.isEmpty)
        XCTAssertNil(store.policy)
        await session.logout()
    }

    @MainActor func testTaskChainRejectsMissingRootForkAndCrossThread() throws {
        func turn(_ id: String, parent: String?, relationship: String, thread: String = "10000000-0000-0000-0000-000000000001") throws -> NativeTextTurn {
            let data = try JSONSerialization.data(withJSONObject: ["turnId": id, "threadId": thread, "locale": "en", "input": "test", "outcome": "clarification", "output": "Which one?", "status": "completed", "createdAt": "2026-09-12", "serviceTaskId": "20000000-0000-0000-0000-000000000001", "scopeVersion": 1, "relationship": relationship, "parentTurnId": parent as Any? ?? NSNull()])
            return try JSONDecoder().decode(NativeTextTurn.self, from: data)
        }
        let root = try turn("30000000-0000-0000-0000-000000000001", parent: nil, relationship: "new_goal")
        let child = try turn("30000000-0000-0000-0000-000000000002", parent: root.id, relationship: "clarification")
        XCTAssertEqual(NativeTaskChain(containing: child, history: [child, root])?.turns.map(\.id), [root.id, child.id])
        XCTAssertNil(NativeTaskChain(containing: child, history: [child]))
        let fork = try turn("30000000-0000-0000-0000-000000000003", parent: root.id, relationship: "clarification")
        XCTAssertNil(NativeTaskChain(containing: child, history: [root, child, fork]))
        let foreign = try turn(child.id, parent: root.id, relationship: "clarification", thread: "10000000-0000-0000-0000-000000000002")
        XCTAssertNil(NativeTaskChain(containing: foreign, history: [root, foreign]))
        let repair = try turn(child.id, parent: root.id, relationship: "repair")
        XCTAssertNil(NativeTaskChain(containing: repair, history: [root, repair]))
        let link = NativeServiceTaskLink(id: root.serviceTaskId!, scopeVersion: 1, relationship: "new_goal", parentTurnId: nil)
        let encoded = try JSONSerialization.jsonObject(with: JSONEncoder().encode(link)) as? [String: Any]
        XCTAssertTrue(encoded?["parentTurnId"] is NSNull)
    }

    @MainActor func testAcceptedTurnSurvivesFailedHistoryRefresh() async throws {
        ObsoleteTaskProtocol.reset(acknowledge: true)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ObsoleteTaskProtocol.self]
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", "http://127.0.0.1:59651", "-VisePandaTaskContext"], defaults: try XCTUnwrap(UserDefaults(suiteName: "vpj07.ack.\(UUID().uuidString)")), configuration: configuration)
        await session.login(email: "fixture", password: "fixture")
        let store = NativeAskStore(mode: .taskContext)
        await store.reload(using: session)
        store.draft = "Acknowledged synthetic request"
        await store.send(locale: "en", using: session)
        XCTAssertNotNil(store.pending)
        XCTAssertEqual(try session.retainedPendingAsk()?.acknowledged, true)
        XCTAssertNil(store.policy)
        guard case .awaiting(let id) = store.intent else { XCTFail("Lost acknowledged task after refresh failure"); return }
        XCTAssertFalse(store.canStartNew)
        XCTAssertFalse(store.canSend)
        await store.reload(using: session)
        let restored = try XCTUnwrap(store.turns.first)
        XCTAssertEqual(restored.id, id)
        XCTAssertNil(store.pending)
        XCTAssertNil(try session.retainedPendingAsk())
        XCTAssertEqual(store.intent, .continuation(restored))
        await session.logout()
    }

    @MainActor func testLostReceiptPolicyChangeRequiresStoppingOldSharingBeforeNewQuestion() async throws {
        ObsoleteTaskProtocol.reset()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ObsoleteTaskProtocol.self]
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", "http://127.0.0.1:59651", "-VisePandaTaskContext"], defaults: try XCTUnwrap(UserDefaults(suiteName: "vpj07.obsolete.\(UUID().uuidString)")), configuration: configuration)
        await session.login(email: "fixture", password: "fixture")
        let store = NativeAskStore(mode: .taskContext)
        await store.reload(using: session)
        store.draft = "Uncertain synthetic request"
        await store.send(locale: "en", using: session)
        let original = try XCTUnwrap(store.pending)
        XCTAssertNil(store.policy)
        await store.reload(using: session)
        XCTAssertTrue(store.canSend)
        ObsoleteTaskProtocol.changePolicy()
        await store.reload(using: session)
        XCTAssertTrue(store.hasObsoletePending)
        XCTAssertFalse(store.canSend); XCTAssertFalse(store.canStartNew)
        XCTAssertEqual(store.pending?.turnId, original.turnId)
        // Another reload must not silently rebind the original text to the new notice.
        await store.reload(using: session)
        XCTAssertFalse(store.canSend)
        await store.withdraw(using: session)
        XCTAssertNotEqual(ObsoleteTaskProtocol.withdrawnPolicy, original.policyId)
        XCTAssertEqual(store.pending?.turnId, original.turnId)
        XCTAssertTrue(store.hasObsoletePending)
        await store.stopPreviousRequest(using: session)
        XCTAssertEqual(ObsoleteTaskProtocol.withdrawnPolicy, original.policyId)
        XCTAssertNil(store.pending)
        XCTAssertFalse(store.canSend) // Current policy was also deliberately withdrawn.
        XCTAssertTrue(store.draft.isEmpty)
        await session.logout()
    }

    @MainActor func testTemporaryAuthLossKeepsHiddenDraftAndLogoutClearsIt() async throws {
        let session = try session()
        await session.login(email: "text-owner-a", password: "unit-only")
        let identity = try XCTUnwrap(session.dataScope)
        let store = NativeAskStore(); store.reset(for: identity); store.draft = "Unsent private draft"
        TextStateProtocol.failRefresh(true)
        await session.validate()
        XCTAssertNil(session.dataScope); XCTAssertEqual(session.retainedDataScope, identity)
        await store.reload(using: session)
        XCTAssertEqual(store.draft, "Unsent private draft"); XCTAssertNil(store.policy); XCTAssertTrue(store.turns.isEmpty)
        TextStateProtocol.failRefresh(false)
        await session.validate()
        XCTAssertEqual(session.dataScope, identity)
        XCTAssertEqual(store.draft, "Unsent private draft")
        await session.logout(); await store.reload(using: session)
        XCTAssertTrue(store.draft.isEmpty); XCTAssertNil(store.scope)
    }
    @MainActor func testViewObservesPermanentClearAfterActiveScopeIsAlreadyNil() async throws {
        let session = try session()
        TextStateProtocol.immediatePolicy()
        await session.login(email: "text-owner-a", password: "unit-only")
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let oldWindow = scene.windows.first(where: \.isKeyWindow)
        let window = UIWindow(windowScene: scene)
        let store = NativeAskStore()
        window.rootViewController = UIHostingController(rootView: NativeAskView(store: store).environment(AppSettings(selectedLocale: .en, nativeSession: session)))
        window.makeKeyAndVisible()
        defer { window.isHidden = true; window.rootViewController = nil; oldWindow?.makeKeyAndVisible() }
        for _ in 0..<200 where store.policy == nil { try await Task.sleep(for: .milliseconds(10)) }
        XCTAssertNotNil(store.policy)
        store.draft = "Private draft before temporary failure"
        TextStateProtocol.failRefresh(true)
        await session.validate()
        for _ in 0..<200 where store.policy != nil { try await Task.sleep(for: .milliseconds(10)) }
        XCTAssertNil(session.dataScope); XCTAssertNotNil(session.retainedDataScope)
        XCTAssertEqual(store.draft, "Private draft before temporary failure")
        await session.logout()
        for _ in 0..<200 where store.scope != nil { try await Task.sleep(for: .milliseconds(10)) }
        // No manual reset/reload: production View observation must handle nil -> nil active scope.
        XCTAssertNil(store.scope); XCTAssertNil(store.pending); XCTAssertTrue(store.draft.isEmpty)
    }
    @MainActor func testLatePolicyCannotEnterAnotherAccount() async throws {
        let session = try session()
        await session.login(email: "text-owner-a", password: "unit-only")
        let original = try XCTUnwrap(session.dataScope)
        let store = NativeAskStore()
        let load = Task { await store.reload(using: session) }
        for _ in 0..<200 where !TextStateProtocol.hasPending { try await Task.sleep(for: .milliseconds(10)) }
        guard TextStateProtocol.hasPending else { load.cancel(); XCTFail("Policy did not reach controlled transport"); return }
        await session.login(email: "text-owner-b", password: "unit-only")
        XCTAssertNotEqual(session.dataScope, original)
        TextStateProtocol.finishPolicy()
        await load.value
        XCTAssertNil(store.policy); XCTAssertTrue(store.turns.isEmpty)
        XCTAssertEqual(store.scope, session.retainedDataScope)
        await session.logout()
    }
}

/// Only test callback state is shared, under one lock; no production credential.
nonisolated private final class TextStateProtocol: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var pending: TextStateProtocol?
    nonisolated(unsafe) private static var refreshFails = false
    nonisolated(unsafe) private static var holdPolicy = true
    nonisolated(unsafe) private static var groundedAccepted = false
    static var hasPending: Bool { lock.withLock { pending != nil } }
    static func failRefresh(_ value: Bool) { lock.withLock { refreshFails = value } }
    static func reset() { lock.withLock { pending = nil; refreshFails = false; holdPolicy = true; groundedAccepted = false } }
    static func acceptGroundedPolicy() { lock.withLock { groundedAccepted = true } }
    static func immediatePolicy() { lock.withLock { holdPolicy = false } }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}
    override func startLoading() {
        let path = request.url?.path ?? ""
        let owner = request.value(forHTTPHeaderField: "Authorization")?.contains("text-owner-b") == true ? "text-owner-b" : "text-owner-a"
        if path.hasSuffix("/policy") {
            if Self.lock.withLock({ Self.holdPolicy }) { Self.lock.withLock { Self.pending = self } }
            else {
                var response = Self.policyReply()
                if path.contains("/v4/") {
                    response["version"] = 4
                    var policy = response["policy"] as! [String: Any]
                    policy["consentState"] = Self.lock.withLock({ Self.groundedAccepted }) ? "accepted" : "not_accepted"; response["policy"] = policy
                }
                reply(response)
            }
            return
        }
        if path.hasSuffix("/turns") { reply(["version": path.contains("/v4/") ? 4 : 1, "kind": path.contains("/v4/") ? "grounded_history" : "history", "turns": []]); return }
        if path.hasSuffix("/refresh") && Self.lock.withLock({ Self.refreshFails }) { client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet)); return }
        if path.hasSuffix("/credentials") || path.hasSuffix("/refresh") {
            let subject = Self.hasPending ? "text-owner-b" : owner
            reply(["subject": subject, "accessToken": subject, "refreshToken": subject, "expiresAt": Date().timeIntervalSince1970 + 3600, "mobileEpoch": 1])
        } else if path.hasSuffix("/profile") { reply(["subject": owner, "displayName": owner]) }
        else { reply(["subject": owner, "mobileEpoch": 1]) }
    }
    static func finishPolicy() {
        let held = lock.withLock { let old = pending; pending = nil; return old }
        held?.reply(policyReply())
    }
    private static func policyReply() -> [String: Any] {
        ["version": 1, "kind": "policy", "policy": ["id": "11111111-1111-4111-8111-111111111111", "provider": "qwen", "recipient": "old owner fixture", "sourceRegion": "fixture", "processingRegion": "fixture", "storageRegion": "fixture", "termsVersion": "fixture", "noticeVersion": "fixture", "noticeHash": String(repeating: "a", count: 64), "noticeZh": "旧账号内容", "noticeEn": "Old owner content", "retention": "retain_after_hide_v1", "expiresAt": "2099-01-01", "consentState": "accepted"]]
    }
    private func reply(_ value: [String: Any]) {
        guard let url = request.url, let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"]), let data = try? JSONSerialization.data(withJSONObject: value) else { return }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data); client?.urlProtocolDidFinishLoading(self)
    }
}

/// Controlled transport: the original POST loses its receipt; no actual provider call.
nonisolated private final class ObsoleteTaskProtocol: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var changed = false
    nonisolated(unsafe) private static var withdrawn: String?
    nonisolated(unsafe) private static var withdrawnIDs: Set<String> = []
    nonisolated(unsafe) private static var acknowledge = false
    nonisolated(unsafe) private static var failNextHistory = false
    nonisolated(unsafe) private static var stored: [String: Any]?
    static var withdrawnPolicy: String? { lock.withLock { withdrawn } }
    static func reset(acknowledge: Bool = false) { lock.withLock { changed = false; withdrawn = nil; withdrawnIDs = []; Self.acknowledge = acknowledge; failNextHistory = false; stored = nil } }
    static func changePolicy() { lock.withLock { changed = true } }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}
    override func startLoading() {
        let path = request.url?.path ?? ""
        let newPolicy = Self.lock.withLock { Self.changed }
        let activeID = newPolicy ? "22222222-2222-4222-8222-222222222222" : "11111111-1111-4111-8111-111111111111"
        let state = Self.lock.withLock { Self.withdrawnIDs.contains(activeID) ? "withdrawn" : "accepted" }
        if path.hasSuffix("/turns") && request.httpMethod == "POST" {
            if Self.lock.withLock({ Self.acknowledge }), let body = requestBody(),
               let input = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any],
               let task = input["serviceTask"] as? [String: Any] {
                Self.lock.withLock { Self.stored = input; Self.failNextHistory = true }
                reply(["version": 3, "kind": "accepted", "reused": false, "turnId": input["turnId"]!, "serviceTaskId": task["id"]!, "scopeVersion": task["scopeVersion"]!, "relationship": task["relationship"]!, "parentTurnId": task["parentTurnId"]!])
            } else { client?.urlProtocol(self, didFailWithError: URLError(.networkConnectionLost)) }
            return
        }
        if path.hasSuffix("/turns"), Self.lock.withLock({ let fail = Self.failNextHistory; Self.failNextHistory = false; return fail }) {
            client?.urlProtocol(self, didFailWithError: URLError(.networkConnectionLost)); return
        }
        var result: [String: Any]
        if path.hasSuffix("/policy") {
            result = ["version": 3, "kind": "policy", "policy": ["id": newPolicy ? "22222222-2222-4222-8222-222222222222" : "11111111-1111-4111-8111-111111111111", "provider": "qwen", "recipient": "fixture", "sourceRegion": "fixture", "processingRegion": "fixture", "storageRegion": "fixture", "termsVersion": "fixture", "noticeVersion": newPolicy ? "new" : "old", "noticeHash": String(repeating: newPolicy ? "b" : "a", count: 64), "noticeZh": "合成同意条款", "noticeEn": "Synthetic terms", "retention": "retain_after_hide_v1", "expiresAt": "2099-01-01", "consentState": state]]
        } else if path.hasSuffix("/turns") {
            var turns: [[String: Any]] = []
            if let input = Self.lock.withLock({ Self.stored }), let task = input["serviceTask"] as? [String: Any] {
                turns = [["turnId": input["turnId"]!, "threadId": input["threadId"]!, "locale": input["locale"]!, "input": input["text"]!, "outcome": "clarification", "output": "Which direction?", "status": "completed", "createdAt": "2026-09-12", "serviceTaskId": task["id"]!, "scopeVersion": task["scopeVersion"]!, "relationship": task["relationship"]!, "parentTurnId": task["parentTurnId"]!]]
            }
            result = ["version": 3, "kind": "history", "turns": turns]
        }
        else if path.hasSuffix("/consent") && request.httpMethod == "DELETE" {
            let parsed = requestBody().flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: String] }
            Self.lock.withLock { Self.withdrawn = parsed?["policyId"]; if let id = parsed?["policyId"] { Self.withdrawnIDs.insert(id) } }
            result = ["version": 3, "kind": "withdrawn"]
        } else if path.hasSuffix("/credentials") || path.hasSuffix("/refresh") {
            result = ["subject": "task-fixture-owner", "accessToken": "task-fixture-owner", "refreshToken": "fixture", "expiresAt": Date().timeIntervalSince1970 + 3600, "mobileEpoch": 1]
        } else if path.hasSuffix("/profile") { result = ["subject": "task-fixture-owner", "displayName": "fixture"] }
        else { result = ["subject": "task-fixture-owner", "mobileEpoch": 1] }
        reply(result)
    }
    private func requestBody() -> Data? {
        if let data = request.httpBody { return data }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open(); defer { stream.close() }
        var data = Data(); var buffer = [UInt8](repeating: 0, count: 1024)
        while stream.hasBytesAvailable { let n = stream.read(&buffer, maxLength: buffer.count); if n <= 0 { break }; data.append(buffer, count: n) }
        return data
    }
    private func reply(_ result: [String: Any]) {
        guard let url = request.url, let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"]), let data = try? JSONSerialization.data(withJSONObject: result) else { return }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data); client?.urlProtocolDidFinishLoading(self)
    }
}

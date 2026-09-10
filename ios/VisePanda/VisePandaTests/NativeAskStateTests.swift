import XCTest
import SwiftUI
@testable import VisePanda

nonisolated final class NativeAskStateTests: XCTestCase {
    @MainActor private func session() throws -> NativeSession {
        TextStateProtocol.reset()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [TextStateProtocol.self]
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "vpj07.state.\(UUID().uuidString)"))
        return NativeSession(arguments: ["-VisePandaNativeAPI", "http://127.0.0.1:59651"], defaults: defaults, configuration: configuration)
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
    static var hasPending: Bool { lock.withLock { pending != nil } }
    static func failRefresh(_ value: Bool) { lock.withLock { refreshFails = value } }
    static func reset() { lock.withLock { pending = nil; refreshFails = false; holdPolicy = true } }
    static func immediatePolicy() { lock.withLock { holdPolicy = false } }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}
    override func startLoading() {
        let path = request.url?.path ?? ""
        let owner = request.value(forHTTPHeaderField: "Authorization")?.contains("text-owner-b") == true ? "text-owner-b" : "text-owner-a"
        if path.hasSuffix("/policy") {
            if Self.lock.withLock({ Self.holdPolicy }) { Self.lock.withLock { Self.pending = self } }
            else { reply(Self.policyReply()) }
            return
        }
        if path.hasSuffix("/turns") { reply(["version": 1, "kind": "history", "turns": []]); return }
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

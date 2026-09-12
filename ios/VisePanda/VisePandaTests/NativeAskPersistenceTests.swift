import XCTest
import Security
@testable import VisePanda

nonisolated final class NativeAskPersistenceTests: XCTestCase {
    @MainActor private func makeSession(_ defaults: UserDefaults, vault: any NativeCredentialVault,
                                       mode: Bool = true, origin: String = "http://127.0.0.1:59651") -> NativeSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [PendingAskProtocol.self]
        return NativeSession(arguments: ["-VisePandaNativeAPI", origin] + (mode ? ["-VisePandaTaskContext"] : []),
                             defaults: defaults, configuration: configuration, vault: vault)
    }
    @MainActor private func fixture() async throws -> (NativeSession, NativeAskStore, MemoryCredentialVault, UserDefaults) {
        PendingAskProtocol.reset()
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "vpj07.pending.\(UUID().uuidString)"))
        let vault = MemoryCredentialVault()
        let session = makeSession(defaults, vault: vault)
        await session.login(email: "owner-a", password: "synthetic-only")
        XCTAssertNotNil(session.dataScope)
        let store = NativeAskStore(mode: .taskContext)
        await store.reload(using: session)
        XCTAssertEqual(store.policy?.consentState, .accepted)
        return (session, store, vault, defaults)
    }
    @MainActor private func request(policy: NativeTextPolicy) -> NativeTextSubmission {
        NativeTextSubmission(threadId: UUID().uuidString, turnId: UUID().uuidString,
            idempotencyKey: UUID().uuidString, policyId: policy.id, locale: "en", text: "Synthetic pending question",
            serviceTask: NativeServiceTaskLink(id: UUID().uuidString, scopeVersion: 1, relationship: "new_goal", parentTurnId: nil))
    }

    @MainActor func testWriteFailurePreventsNetworkAndLeavesDraftEditable() async throws {
        let (session, store, vault, _) = try await fixture()
        vault.failWrites = true
        store.draft = "Do not send without durable identity"
        await store.send(locale: "en", using: session)
        XCTAssertEqual(PendingAskProtocol.posts.count, 0)
        XCTAssertNil(store.pending)
        XCTAssertEqual(store.draft, "Do not send without durable identity")
        vault.failWrites = false
        await store.reload(using: session)
        await store.send(locale: "en", using: session)
        XCTAssertEqual(PendingAskProtocol.posts.count, 1)
        XCTAssertTrue(PendingAskProtocol.allPostsWereDurable)
        XCTAssertNil(try session.retainedPendingAsk())
        await session.logout()
    }

    @MainActor func testWrittenButUnsentRequestRestoresWithoutAutomaticPost() async throws {
        let (session, store, vault, defaults) = try await fixture()
        let policy = try XCTUnwrap(store.policy), original = request(policy: policy)
        _ = try session.retainPendingAsk(original, policy: policy, mode: .taskContext)
        let restarted = makeSession(defaults, vault: vault)
        await restarted.restore()
        let recovered = NativeAskStore(mode: .taskContext)
        await recovered.reload(using: restarted)
        XCTAssertEqual(recovered.pending, original)
        XCTAssertEqual(PendingAskProtocol.posts.count, 0)
        recovered.startNewQuestion()
        XCTAssertEqual(recovered.pending, original)
        XCTAssertFalse(recovered.canStartNew)
        recovered.draft = "An edited draft must not replace the submitted request"
        await recovered.send(locale: "zh", using: restarted)
        XCTAssertEqual(try PendingAskProtocol.posts.map { try JSONDecoder().decode(NativeTextSubmission.self, from: $0) }, [original])
        XCTAssertTrue(PendingAskProtocol.allPostsWereDurable)
        XCTAssertNil(try restarted.retainedPendingAsk())
        await restarted.logout()
    }

    @MainActor func testAcknowledgedRequestSurvivesEmptyHistoryAfterRestart() async throws {
        let (session, store, vault, defaults) = try await fixture()
        PendingAskProtocol.configure(hideHistory: true)
        store.draft = "Accepted receipt before process exits"
        await store.send(locale: "en", using: session)
        let original = try XCTUnwrap(store.pending)
        XCTAssertEqual(try session.retainedPendingAsk()?.acknowledged, true)
        let restarted = makeSession(defaults, vault: vault)
        await restarted.restore()
        let recovered = NativeAskStore(mode: .taskContext)
        await recovered.reload(using: restarted)
        XCTAssertEqual(recovered.pending, original)
        XCTAssertEqual(recovered.intent, .awaiting(original.turnId))
        XCTAssertFalse(recovered.canSend)
        XCTAssertFalse(recovered.canStartNew)
        XCTAssertTrue(recovered.draft.isEmpty)
        recovered.startNewQuestion()
        await recovered.send(locale: "en", using: restarted)
        XCTAssertEqual(PendingAskProtocol.posts.count, 1)
        PendingAskProtocol.configure()
        await recovered.reload(using: restarted)
        XCTAssertNil(recovered.pending)
        XCTAssertNil(try restarted.retainedPendingAsk())
        XCTAssertEqual(recovered.turns.first?.id, original.turnId)
        await restarted.logout()
    }

    @MainActor func testLostReceiptReconcilesHistoryWithoutAnotherPost() async throws {
        let (session, store, vault, defaults) = try await fixture()
        PendingAskProtocol.configure(dropReceipt: true)
        store.draft = "Accepted by the server but receipt lost"
        await store.send(locale: "en", using: session)
        let original = try XCTUnwrap(store.pending)
        let restarted = makeSession(defaults, vault: vault)
        await restarted.restore()
        let recovered = NativeAskStore(mode: .taskContext)
        await recovered.reload(using: restarted)
        XCTAssertNil(recovered.pending)
        XCTAssertEqual(recovered.turns.first?.id, original.turnId)
        XCTAssertEqual(recovered.turns.first?.output, "Synthetic recovered answer")
        XCTAssertEqual(PendingAskProtocol.posts.count, 1)
        XCTAssertNil(try restarted.retainedPendingAsk())
        await restarted.logout()
    }

    @MainActor func testAbsentHistoryKeepsOriginalPayloadAndTaskOnExplicitRetry() async throws {
        let (session, store, vault, defaults) = try await fixture()
        PendingAskProtocol.configure(dropReceipt: true, hideHistory: true)
        store.draft = "An acknowledgement may exist beyond the visible window"
        await store.send(locale: "en", using: session)
        let original = try XCTUnwrap(store.pending)
        let restarted = makeSession(defaults, vault: vault)
        await restarted.restore()
        let recovered = NativeAskStore(mode: .taskContext)
        await recovered.reload(using: restarted)
        XCTAssertEqual(recovered.pending, original)
        XCTAssertTrue(recovered.canSend)
        XCTAssertEqual(PendingAskProtocol.posts.count, 1)
        await recovered.send(locale: "en", using: restarted)
        XCTAssertEqual(PendingAskProtocol.posts.count, 2)
        let posts = try PendingAskProtocol.posts.map { try JSONDecoder().decode(NativeTextSubmission.self, from: $0) }
        XCTAssertEqual(posts, [original, original])
        XCTAssertEqual(PendingAskProtocol.admissions, 1)
        XCTAssertEqual(try restarted.retainedPendingAsk()?.acknowledged, true)
        await restarted.logout()
    }

    @MainActor func testChangedModeAndNoticeCannotRebindPersistedRequest() async throws {
        let (session, store, vault, defaults) = try await fixture()
        PendingAskProtocol.configure(dropReceipt: true, hideHistory: true)
        store.draft = "Old sharing permission"
        await store.send(locale: "en", using: session)
        let original = try XCTUnwrap(store.pending)
        PendingAskProtocol.configure(changedPolicy: true)
        let restarted = makeSession(defaults, vault: vault, mode: false)
        await restarted.restore()
        let recovered = NativeAskStore()
        await recovered.reload(using: restarted)
        XCTAssertTrue(recovered.hasObsoletePending)
        XCTAssertFalse(recovered.canSend)
        XCTAssertTrue(recovered.draft.isEmpty)
        XCTAssertEqual(recovered.pending, original)
        await recovered.send(locale: "en", using: restarted)
        XCTAssertEqual(PendingAskProtocol.posts.count, 1)
        await recovered.stopPreviousRequest(using: restarted)
        XCTAssertEqual(PendingAskProtocol.withdrawnPolicy, original.policyId)
        XCTAssertNil(recovered.pending)
        XCTAssertNil(try restarted.retainedPendingAsk())
        await restarted.logout()
    }

    @MainActor func testFailedRemovalAfterAcknowledgementPreservesRecoveryRecord() async throws {
        let (session, store, vault, defaults) = try await fixture()
        vault.failAtWrite = vault.writes + 2 // retain succeeds; acknowledgement clearing fails
        store.draft = "Receipt confirmed while vault becomes unavailable"
        await store.send(locale: "en", using: session)
        XCTAssertNotNil(store.pending)
        XCTAssertNotNil(try session.retainedPendingAsk())
        let restarted = makeSession(defaults, vault: vault)
        await restarted.restore()
        let recovered = NativeAskStore(mode: .taskContext)
        await recovered.reload(using: restarted)
        XCTAssertNil(recovered.pending)
        XCTAssertEqual(PendingAskProtocol.posts.count, 1)
        XCTAssertNil(try restarted.retainedPendingAsk())
        await restarted.logout()
    }

    @MainActor func testLockedVaultAndFailedLogoutDoNotSilentlyDiscardPending() async throws {
        let (session, store, vault, defaults) = try await fixture()
        let policy = try XCTUnwrap(store.policy)
        _ = try session.retainPendingAsk(request(policy: policy), policy: policy, mode: .taskContext)
        vault.failReads = true
        let restarted = makeSession(defaults, vault: vault)
        await restarted.restore()
        XCTAssertNil(restarted.dataScope)
        XCTAssertEqual(vault.records.count, 1)
        vault.failReads = false
        await restarted.restore()
        XCTAssertNotNil(try restarted.retainedPendingAsk())
        vault.failDeletes = true
        await restarted.logout()
        XCTAssertNil(restarted.dataScope)
        XCTAssertEqual(restarted.status, "storageError")
        let credentialsBefore = PendingAskProtocol.credentialRequests
        await restarted.login(email: "owner-b", password: "synthetic-only")
        XCTAssertEqual(PendingAskProtocol.credentialRequests, credentialsBefore)
        XCTAssertEqual(vault.records.count, 1)
        vault.failDeletes = false
        await restarted.logout()
        XCTAssertEqual(vault.records.count, 0)
        await restarted.login(email: "owner-b", password: "synthetic-only")
        XCTAssertEqual(restarted.subject, "owner-b")
        XCTAssertNil(try restarted.retainedPendingAsk())
        await restarted.logout()
    }

    @MainActor func testUnsupportedStoredSchemaBlocksRestoreWithoutErasingIt() async throws {
        let (session, store, vault, defaults) = try await fixture()
        let policy = try XCTUnwrap(store.policy)
        _ = try session.retainPendingAsk(request(policy: policy), policy: policy, mode: .taskContext)
        let key = try XCTUnwrap(vault.records.keys.first)
        var value = try XCTUnwrap(JSONSerialization.jsonObject(with: try XCTUnwrap(vault.records[key])) as? [String: Any])
        var pending = try XCTUnwrap(value["pendingAsk"] as? [String: Any])
        pending["schemaVersion"] = 99; value["pendingAsk"] = pending
        vault.records[key] = try JSONSerialization.data(withJSONObject: value)
        let restarted = makeSession(defaults, vault: vault)
        await restarted.restore()
        XCTAssertNil(restarted.dataScope)
        XCTAssertEqual(vault.records.count, 1)
        XCTAssertEqual(PendingAskProtocol.posts.count, 0)
        // Explicit account clearing remains distinct from automatic recovery.
        await restarted.logout()
        XCTAssertEqual(vault.records.count, 0)
    }

    @MainActor func testActualDeviceOnlyKeychainPersistsAcrossSessionRecreation() async throws {
        PendingAskProtocol.reset()
        let origin = "http://127.0.0.1:\(Int.random(in: 40000...49000))"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "vpj07.keychain.\(UUID().uuidString)"))
        let vault = NativeKeychainVault()
        let service = "com.visepanda.native.local-session.v2." + origin
        defer { _ = vault.remove(service: service, owner: "owner-a") }
        let session = makeSession(defaults, vault: vault, origin: origin)
        await session.login(email: "owner-a", password: "synthetic-only")
        let store = NativeAskStore(mode: .taskContext)
        await store.reload(using: session)
        let policy = try XCTUnwrap(store.policy), original = request(policy: policy)
        _ = try session.retainPendingAsk(original, policy: policy, mode: .taskContext)
        var attributes: CFTypeRef?
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
            kSecAttrAccount as String: "owner-a", kSecReturnAttributes as String: true]
        XCTAssertEqual(SecItemCopyMatching(query as CFDictionary, &attributes), errSecSuccess)
        XCTAssertEqual((attributes as? [String: Any])?[kSecAttrAccessible as String] as? String, kSecAttrAccessibleWhenUnlockedThisDeviceOnly as String)
        let restarted = makeSession(defaults, vault: vault, origin: origin)
        await restarted.restore()
        XCTAssertEqual(try restarted.retainedPendingAsk()?.request, original)
        XCTAssertEqual(PendingAskProtocol.posts.count, 0)
        await restarted.logout()
        XCTAssertEqual(vault.read(service: service, owner: "owner-a").0, errSecItemNotFound)
    }
}

@MainActor private final class MemoryCredentialVault: NativeCredentialVault {
    var records: [String: Data] = [:]
    var failWrites = false, failReads = false, failDeletes = false
    var failAtWrite: Int?
    var writes = 0
    func write(_ data: Data, service: String, owner: String) -> OSStatus {
        writes += 1
        if failWrites || writes == failAtWrite { return errSecInteractionNotAllowed }
        records[service + "|" + owner] = data
        if let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let pending = value["pendingAsk"] as? [String: Any],
           let request = pending["request"] as? [String: Any], let id = request["turnId"] as? String {
            PendingAskProtocol.markDurable(id)
        }
        return errSecSuccess
    }
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        if failReads { return (errSecInteractionNotAllowed, nil) }
        let data = records[service + "|" + owner]
        return (data == nil ? errSecItemNotFound : errSecSuccess, data)
    }
    func remove(service: String, owner: String) -> OSStatus {
        if failDeletes { return errSecInteractionNotAllowed }
        records.removeValue(forKey: service + "|" + owner)
        return errSecSuccess
    }
}

/// The fake can lose only a receipt while preserving server admission. Actual
/// Keychain storage is exercised separately; no real supplier request is made.
nonisolated private final class PendingAskProtocol: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var sent: [Data] = []
    nonisolated(unsafe) private static var accepted: [String: [String: Any]] = [:]
    nonisolated(unsafe) private static var durable: Set<String> = []
    nonisolated(unsafe) private static var beforeWrite = true
    nonisolated(unsafe) private static var drop = false, hidden = false, changed = false
    nonisolated(unsafe) private static var withdrawn: String?
    nonisolated(unsafe) private static var credentials = 0
    static var posts: [Data] { lock.withLock { sent } }
    static var admissions: Int { lock.withLock { accepted.count } }
    static var allPostsWereDurable: Bool { lock.withLock { beforeWrite } }
    static var credentialRequests: Int { lock.withLock { credentials } }
    static var withdrawnPolicy: String? { lock.withLock { withdrawn } }
    static func markDurable(_ id: String) { lock.withLock { _ = durable.insert(id) } }
    static func reset() { lock.withLock { sent = []; accepted = [:]; durable = []; beforeWrite = true; drop = false; hidden = false; changed = false; withdrawn = nil; credentials = 0 } }
    static func configure(dropReceipt: Bool = false, hideHistory: Bool = false, changedPolicy: Bool = false) {
        lock.withLock { drop = dropReceipt; hidden = hideHistory; changed = changedPolicy }
    }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}
    override func startLoading() {
        let path = request.url?.path ?? ""
        let version = path.contains("/v3/") ? 3 : 1
        let owner = request.value(forHTTPHeaderField: "Authorization")?.replacingOccurrences(of: "Bearer ", with: "") ?? "owner-a"
        let body = requestBody().flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]
        if path.hasSuffix("/turns") && request.httpMethod == "POST",
           let id = body["turnId"] as? String {
            let lose = Self.lock.withLock {
                Self.sent.append(try! JSONSerialization.data(withJSONObject: body, options: [.sortedKeys]))
                Self.beforeWrite = Self.beforeWrite && Self.durable.contains(id)
                if Self.accepted[id] == nil { var stored = body; stored["owner"] = owner; Self.accepted[id] = stored }
                let lose = Self.drop; Self.drop = false; return lose
            }
            if lose { client?.urlProtocol(self, didFailWithError: URLError(.networkConnectionLost)); return }
            var reply: [String: Any] = ["version": version, "kind": "accepted", "turnId": id, "reused": Self.posts.count > 1]
            if let task = body["serviceTask"] as? [String: Any] {
                reply["serviceTaskId"] = task["id"]; reply["scopeVersion"] = task["scopeVersion"]
                reply["relationship"] = task["relationship"]; reply["parentTurnId"] = task["parentTurnId"]
            }
            respond(reply); return
        }
        if path.hasSuffix("/policy") {
            let changed = Self.lock.withLock { Self.changed }
            respond(["version": version, "kind": "policy", "policy": [
                "id": changed ? "22222222-2222-4222-8222-222222222222" : "11111111-1111-4111-8111-111111111111",
                "provider": "qwen", "recipient": "synthetic", "sourceRegion": "synthetic", "processingRegion": "synthetic", "storageRegion": "synthetic",
                "termsVersion": "synthetic", "noticeVersion": changed ? "new" : "old", "noticeHash": String(repeating: changed ? "b" : "a", count: 64),
                "noticeZh": "合成条款", "noticeEn": "Synthetic notice", "retention": "retain_after_hide_v1", "expiresAt": "2099-01-01", "consentState": "accepted"]]); return
        }
        if path.hasSuffix("/turns") {
            let rows: [[String: Any]] = Self.lock.withLock {
                if Self.hidden { return [] }
                return Self.accepted.values.filter { $0["owner"] as? String == owner }.map { input in
                    var result: [String: Any] = ["turnId": input["turnId"]!, "threadId": input["threadId"]!, "locale": input["locale"]!, "input": input["text"]!,
                        "outcome": "answered", "output": "Synthetic recovered answer", "status": "completed", "createdAt": "2026-09-12"]
                    if let task = input["serviceTask"] as? [String: Any] {
                        result["serviceTaskId"] = task["id"]; result["scopeVersion"] = task["scopeVersion"]
                        result["relationship"] = task["relationship"]; result["parentTurnId"] = task["parentTurnId"]
                    }
                    return result
                }
            }
            respond(["version": version, "kind": "history", "turns": rows]); return
        }
        if path.hasSuffix("/consent") {
            Self.lock.withLock { Self.withdrawn = body["policyId"] as? String }
            respond(["version": version, "kind": "withdrawn"]); return
        }
        if path.hasSuffix("/credentials") || path.hasSuffix("/refresh") {
            let subject = (body["email"] ?? body["refreshToken"]) as? String ?? owner
            if path.hasSuffix("/credentials") { Self.lock.withLock { Self.credentials += 1 } }
            respond(["subject": subject, "accessToken": subject, "refreshToken": subject, "expiresAt": Date().timeIntervalSince1970 + 3600, "mobileEpoch": 1]); return
        }
        if path.hasSuffix("/profile") { respond(["subject": owner, "displayName": "synthetic"]); return }
        respond(["subject": owner, "mobileEpoch": 1])
    }
    private func requestBody() -> Data? {
        if let data = request.httpBody { return data }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open(); defer { stream.close() }
        var data = Data(), buffer = [UInt8](repeating: 0, count: 1024)
        while stream.hasBytesAvailable { let count = stream.read(&buffer, maxLength: buffer.count); if count <= 0 { break }; data.append(buffer, count: count) }
        return data
    }
    private func respond(_ value: [String: Any]) {
        guard let url = request.url, let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil),
              let data = try? JSONSerialization.data(withJSONObject: value) else { return }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data); client?.urlProtocolDidFinishLoading(self)
    }
}

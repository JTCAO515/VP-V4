import Foundation
import Security
import Testing
@testable import VisePanda

@MainActor @Suite(.serialized)
struct NativeQASessionTransportTests {
    private let owner = "11111111-1111-4111-8111-111111111111"
    private let thread = "22222222-2222-4222-8222-222222222222"
    private let policyID = "33333333-3333-4333-8333-333333333333"
    private func fixture(vault: NativeQAIntegrationVault = NativeQAIntegrationVault(), subject: String? = nil) async throws -> (NativeSession, NativeQASessionTransport) {
        NativeQAIntegrationProtocol.state.reset(owner: subject ?? owner)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [NativeQAIntegrationProtocol.self]
        let defaults = try #require(UserDefaults(suiteName: "nativeqa.integration.\(UUID())"))
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", "http://127.0.0.1:59991"],
                                    defaults: defaults, configuration: configuration, bundleConfiguration: [:],
                                    vault: vault)
        await session.login(email: "synthetic@example.invalid", password: "synthetic-only")
        #expect(session.status == "active")
        #expect(session.dataScope != nil)
        return (session, session.makeNativeQATransport())
    }
    private func pending(_ scope: NativeDataScope, text: String = "  original QA request  ") throws -> NativeQAPending {
        let policy = NativeQAPolicy(id: policyID, noticeHash: String(repeating: "a", count: 64),
            noticeZh: "合成测试说明", noticeEn: "Synthetic notice", provider: "fixture", recipient: "fixture",
            consentState: .accepted, contextMode: "qa_session_history_v1", maxTurns: 8)
        return try NativeQAPending(scope: scope, sessionID: thread, policy: policy, text: text)
    }

    @Test func cancellationWireKeepsOriginalTupleBodyAndRawReceipt() async throws {
        let (session, port) = try await fixture()
        let scope = try #require(port.scope)
        let generated = try pending(scope)
        try port.retainPending(generated, scope: scope)
        let target = NativeQACancellationTarget(scope: scope, sessionID: thread, requestID: generated.requestID, canRequestStop: true)
        let stop = try NativeQACancellationPending(target: target)
        let envelope: [String: Any] = ["version": "qa-cancellation/1", "sessionId": thread,
            "requestId": generated.requestID, "state": "cancelled", "ack": "observed"]
        NativeQAIntegrationProtocol.state.qa(status: 200, type: "application/json", body: envelope)
        let response = try await port.request(.requestCancellation(stop), scope: scope)
        let sent = try #require(NativeQAIntegrationProtocol.state.lastQA())
        #expect(sent.url?.path == "/api/qa-agent/native/v1/sessions/\(thread)/messages/\(generated.requestID)/cancellation")
        #expect(sent.httpMethod == "POST")
        #expect(!sent.httpShouldHandleCookies && sent.value(forHTTPHeaderField: "Cookie") == nil)
        #expect(NativeQAIntegrationProtocol.state.lastQABody() == Data("{}".utf8))
        #expect(try NativeQACancellationReceipt.decode(response, command: stop).state == .cancelled)
        #expect(throws: NativeQAError.self) { try port.clearPending(generated, scope: scope) }
        #expect(try port.loadPending(scope: scope)?.body == generated.body)
        _ = try await port.request(.readCancellation(sessionID: thread, requestID: generated.requestID), scope: scope)
        #expect(NativeQAIntegrationProtocol.state.lastQA()?.httpMethod == "GET")
        #expect(session.status == "active")
    }

    @Test func cancellationRejectsForeignOwnerAndEpochAndDoesNotUseAgentAuthDecoder() async throws {
        let (session, port) = try await fixture()
        let scope = try #require(port.scope)
        let foreign = NativeDataScope(endpoint: scope.endpoint, subject: policyID, mobileEpoch: scope.mobileEpoch, generation: scope.generation)
        let stale = try NativeQACancellationPending(target: .init(scope: foreign, sessionID: thread, requestID: policyID, canRequestStop: true))
        await #expect(throws: Error.self) { try await port.request(.requestCancellation(stale), scope: scope) }
        let nextEpoch = NativeDataScope(endpoint: scope.endpoint, subject: scope.subject, mobileEpoch: scope.mobileEpoch + 1, generation: scope.generation)
        let wrongEpoch = try NativeQACancellationPending(target: .init(scope: nextEpoch, sessionID: thread, requestID: policyID, canRequestStop: true))
        await #expect(throws: Error.self) { try await port.request(.requestCancellation(wrongEpoch), scope: scope) }
        NativeQAIntegrationProtocol.state.qa(status: 401, type: "application/json", body: ["version": "qa-agent/1", "error": ["code": "UNAUTHENTICATED", "ack": "unknown"]])
        let raw = try await port.request(.readCancellation(sessionID: thread, requestID: policyID), scope: scope)
        #expect(raw.status == 401 && session.status == "active")
        #expect(port.scope == scope)
    }

    @Test func cancellationJournalUsesPortLeaseAndExportsOnlyMetadata() async throws {
        let (session, port) = try await fixture()
        let scope = try #require(port.scope)
        let target = NativeQACancellationTarget(scope: scope, sessionID: thread, requestID: policyID, canRequestStop: true)
        let command = try NativeQACancellationPending(target: target)
        let journal = port.cancellationJournal
        #expect(journal === port.cancellationJournal)
        try journal.retainCancellation(command, scope: scope)
        #expect(try journal.loadCancellation(target: target)?.command == command)
        let receipt = NativeQACancellationReceipt(version: "qa-cancellation/1", sessionId: thread, requestId: policyID, state: .cancelled, ack: .observed)
        try journal.finishCancellation(command, receipt: receipt, scope: scope)
        let actor = try session.communitySafetyActor()
        let snapshot = try #require(try session.journalDataSource().snapshot(source: .qaCancellation, actor: actor))
        #expect(snapshot.valid && snapshot.record.kind == .metadataOnly)
        #expect(snapshot.record.qaCancellation?.totalRecords == 1)
        #expect(snapshot.record.qaCancellation?.records.first?.mobileEpoch == scope.mobileEpoch)
        #expect(snapshot.record.qaCancellation?.records.first?.observedState == .cancelled)
        let encoded = String(decoding: try JSONEncoder().encode(snapshot.record), as: UTF8.self)
        #expect(!encoded.contains("recordBytes") && !encoded.contains("\"identity\"") && !encoded.contains("\"body\""))
        #expect(snapshot.record.originalOperationBytes == nil && snapshot.record.operationID == nil && snapshot.record.objectID == nil)
    }

    @Test func explicitLogoutErasesCancellationAndGenerationCustodyTogether() async throws {
        let vault = NativeQAIntegrationVault()
        let (session, port) = try await fixture(vault: vault)
        let scope = try #require(port.scope)
        let generated = try pending(scope)
        try port.retainPending(generated, scope: scope)
        let target = NativeQACancellationTarget(scope: scope, sessionID: thread, requestID: generated.requestID, canRequestStop: true)
        try port.cancellationJournal.retainCancellation(.init(target: target), scope: scope)
        #expect(vault.read(service: NativeQACancellationJournal.service(scope.endpoint), owner: scope.subject).0 == errSecSuccess)
        await session.logout()
        #expect(session.dataScope == nil && port.scope == nil)
        #expect(vault.read(service: NativeQACancellationJournal.service(scope.endpoint), owner: scope.subject).0 == errSecItemNotFound)
        #expect(vault.read(service: NativeQAPendingJournal.service(scope.endpoint), owner: scope.subject).0 == errSecItemNotFound)
    }

    @Test func legacyIdentityCleanupRequiresPhysicalCancellationAbsence() async throws {
        let (session, _) = try await fixture(subject: "legacy-synthetic-owner")
        await session.logout()
        #expect(session.status == "signedOut")
        #expect(session.failureCode != "qaCancellationCleanupRequired")
        #expect(session.dataScope == nil)
    }

    @Test func legacyIdentityUnexpectedCancellationBytesRemainFailClosed() async throws {
        let vault = NativeQAIntegrationVault()
        let (session, _) = try await fixture(vault: vault, subject: "legacy-synthetic-owner")
        let scope = try #require(session.dataScope)
        let service = NativeQACancellationJournal.service(scope.endpoint)
        let original = Data("synthetic-unqualified-record".utf8)
        #expect(vault.write(original, service: service, owner: scope.subject) == errSecSuccess)
        await session.logout()
        #expect(session.failureCode == "qaCancellationCleanupRequired")
        #expect(vault.read(service: service, owner: scope.subject).1 == original)
    }

    @Test func legacyIdentityLockedCancellationNamespaceDoesNotBecomeAbsent() async throws {
        let vault = NativeQAIntegrationVault()
        let (session, _) = try await fixture(vault: vault, subject: "legacy-synthetic-owner")
        let scope = try #require(session.dataScope)
        vault.blockedService = NativeQACancellationJournal.service(scope.endpoint)
        await session.logout()
        #expect(session.failureCode == "qaCancellationCleanupRequired")
    }

    @Test func installedQAEntryNeedsAnInstalledStagingTarget() {
        var config = ["VisePandaNativeTaskContext": "qa_session_v1", "VisePandaNativeEnvironment": "staging",
                      "VisePandaStagingAPIOrigin": "https://vp-v4-abc123-jtcao515s-projects.vercel.app"]
        #expect(NativeQAEntryRollout.enabled(arguments: [], configuration: config))
        config["VisePandaNativeEnvironment"] = "production"
        #expect(!NativeQAEntryRollout.enabled(arguments: [], configuration: config))
        config["VisePandaNativeEnvironment"] = "staging"
        config["VisePandaStagingAPIOrigin"] = "https://attacker.invalid"
        #expect(!NativeQAEntryRollout.enabled(arguments: [], configuration: config))
        #expect(!NativeQAEntryRollout.enabled(arguments: ["-VisePandaNativeAPI", "https://qatesting.go2china.space"], configuration: [:]))
    }

    @Test func nativeWirePreservesFailureACKAndNeverUsesCookies() async throws {
        let (_, port) = try await fixture()
        let scope = try #require(port.scope)
        NativeQAIntegrationProtocol.state.qa(status: 503, type: "application/json",
            body: ["version": "qa-agent/1", "error": ["code": "PROVIDER_UNAVAILABLE", "ack": "not_submitted"]])
        let response = try await port.request(.policy, scope: scope)
        #expect(response.status == 503)
        do {
            _ = try NativeQAWire.decode(NativeQAWire.Policy.self, response: response)
            Issue.record("Expected the actual QA failure envelope")
        } catch NativeQAError.server(let code, let ack) {
            #expect(code == "PROVIDER_UNAVAILABLE" && ack == "not_submitted")
        }
        let request = try #require(NativeQAIntegrationProtocol.state.lastQA())
        #expect(request.url?.path == "/api/qa-agent/native/v1/policy")
        #expect(request.value(forHTTPHeaderField: "Authorization")?.hasPrefix("Bearer ") == true)
        #expect(request.value(forHTTPHeaderField: "Cookie") == nil)
        #expect(request.value(forHTTPHeaderField: "Origin") == nil)
        #expect(!request.httpShouldHandleCookies)
    }

    @Test func proxyDenialDoesNotClearIdentityOrPendingBytes() async throws {
        let (session, port) = try await fixture()
        let scope = try #require(port.scope)
        let command = try pending(scope)
        try port.retainPending(command, scope: scope)
        NativeQAIntegrationProtocol.state.qa(status: 401, type: "text/html", body: [:])
        await #expect(throws: Error.self) { try await port.request(.policy, scope: scope) }
        #expect(session.status == "active")
        #expect(try port.loadPending(scope: scope) == command)
    }

    @Test func onlyExactProtectedMessagePermitsClearingAndMetadataExcludesQuestion() async throws {
        let (session, port) = try await fixture()
        let scope = try #require(port.scope)
        let command = try pending(scope)
        try port.retainPending(command, scope: scope)
        #expect(throws: NativeQAError.self) { try port.clearPending(command, scope: scope) }
        let actor = try session.communitySafetyActor()
        let snapshot = try #require(try session.journalDataSource().snapshot(source: .qaSubmission, actor: actor))
        #expect(snapshot.record.state == .pending && snapshot.record.kind == .metadataOnly)
        #expect(snapshot.record.operationID == command.requestID && snapshot.record.objectID == thread)
        let exported = String(decoding: try JSONEncoder().encode(snapshot.record), as: UTF8.self)
        #expect(!exported.contains("original QA request"))
        #expect(snapshot.record.originalOperationBytes == nil)
        NativeQAIntegrationProtocol.state.qa(status: 200, type: "application/json", body: ["version": "qa-agent/1", "message": [
            "requestId": command.requestID, "turnId": command.requestID, "sessionId": thread,
            "input": command.originalText!, "text": NSNull(), "status": "pending", "createdAt": "2026-10-16T00:00:00Z"]])
        _ = try await port.request(.recover(sessionID: thread, requestID: command.requestID), scope: scope)
        try port.clearPending(command, scope: scope)
        #expect(try port.loadPending(scope: scope) == nil)
        #expect(session.journalDataSource().completion(source: .qaSubmission, actor: actor) == nil)
    }

    @Test func foreignMessageCannotEraseAndLogoutInvalidatesPresentationLease() async throws {
        let (session, port) = try await fixture()
        let scope = try #require(port.scope)
        let command = try pending(scope)
        try port.retainPending(command, scope: scope)
        NativeQAIntegrationProtocol.state.qa(status: 200, type: "application/json", body: ["version": "qa-agent/1", "message": [
            "requestId": command.requestID, "turnId": command.requestID, "sessionId": thread,
            "input": "different bytes", "text": NSNull(), "status": "pending", "createdAt": "2026-10-16T00:00:00Z"]])
        _ = try await port.request(.recover(sessionID: thread, requestID: command.requestID), scope: scope)
        #expect(throws: NativeQAError.self) { try port.clearPending(command, scope: scope) }
        #expect(try port.loadPending(scope: scope) == command)
        // An explicit session logout must invalidate the old view lease and erase local custody.
        await session.logout()
        #expect(port.scope == nil)
        #expect(throws: NativeQAError.self) { try port.loadPending(scope: scope) }
    }

    @Test func canonicallyEquivalentReceiptCannotClearDifferentOriginalUTF8() async throws {
        for (original, returned) in [("\u{00E9}", "e\u{0301}"), ("e\u{0301}", "\u{00E9}")] {
            #expect(original == returned)
            #expect(Data(original.utf8) != Data(returned.utf8))
            let (_, port) = try await fixture()
            let scope = try #require(port.scope)
            let command = try pending(scope, text: original)
            try port.retainPending(command, scope: scope)
            NativeQAIntegrationProtocol.state.qa(status: 200, type: "application/json", body: ["version": "qa-agent/1", "message": [
                "requestId": command.requestID, "turnId": command.requestID, "sessionId": thread,
                "input": returned, "text": NSNull(), "status": "pending", "createdAt": "2026-10-16T00:00:00Z"]])
            _ = try await port.request(.recover(sessionID: thread, requestID: command.requestID), scope: scope)
            #expect(throws: NativeQAError.self) { try port.clearPending(command, scope: scope) }
            #expect(try port.loadPending(scope: scope)?.body == command.body)
        }
    }
}

@MainActor private final class NativeQAIntegrationVault: NativeCredentialVault {
    private var values: [String: Data] = [:]
    var blockedService: String?
    private func key(_ service: String, _ owner: String) -> String { "\(service.utf8.count):\(service)\(owner)" }
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        if service == blockedService { return (errSecInteractionNotAllowed, nil) }
        guard let value = values[key(service, owner)] else { return (errSecItemNotFound, nil) }
        return (errSecSuccess, value)
    }
    func write(_ data: Data, service: String, owner: String) -> OSStatus { values[key(service, owner)] = data; return errSecSuccess }
    func remove(service: String, owner: String) -> OSStatus { values.removeValue(forKey: key(service, owner)); return errSecSuccess }
}

nonisolated private final class NativeQAIntegrationProtocol: URLProtocol, @unchecked Sendable {
    static let state = NativeQAIntegrationState()
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let reply = Self.state.response(request)
        let response = HTTPURLResponse(url: request.url!, statusCode: reply.0, httpVersion: nil,
                                       headerFields: ["Content-Type": reply.1])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: reply.2)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

nonisolated private final class NativeQAIntegrationState: @unchecked Sendable {
    private let lock = NSLock()
    private var owner = "", requests: [URLRequest] = []
    private var qaReply: (Int, String, Data) = (503, "application/json", Data())
    private var qaBody: Data?
    func reset(owner: String) { lock.lock(); defer { lock.unlock() }; self.owner = owner; requests = []; qaBody = nil }
    func qa(status: Int, type: String, body: [String: Any]) {
        lock.lock(); defer { lock.unlock() }
        qaReply = (status, type, try! JSONSerialization.data(withJSONObject: body))
    }
    func lastQA() -> URLRequest? {
        lock.lock(); defer { lock.unlock() }
        return requests.last { $0.url?.path.hasPrefix("/api/qa-agent/native/v1/") == true }
    }
    func lastQABody() -> Data? { lock.lock(); defer { lock.unlock() }; return qaBody }
    private func body(_ request: URLRequest) -> Data? {
        if let bytes = request.httpBody { return bytes }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open(); defer { stream.close() }
        var bytes = Data(), buffer = [UInt8](repeating: 0, count: 4096)
        while bytes.count <= 65_536 {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count == 0 { return bytes }
            guard count > 0 else { return nil }
            bytes.append(contentsOf: buffer.prefix(count))
        }
        return nil
    }
    func response(_ request: URLRequest) -> (Int, String, Data) {
        lock.lock(); defer { lock.unlock() }; requests.append(request)
        if request.url?.path.hasPrefix("/api/qa-agent/native/v1/") == true { qaBody = body(request); return qaReply }
        let sessionID = "44444444-4444-4444-8444-444444444444"
        let claims = try! JSONSerialization.data(withJSONObject: ["sub": owner, "session_id": sessionID]).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        var body: [String: Any] = ["subject": owner, "mobileEpoch": 1]
        if request.url?.path.hasSuffix("/credentials") == true || request.url?.path.hasSuffix("/refresh") == true {
            body = ["subject": owner, "accessToken": "synthetic.\(claims).unsigned-fixture", "refreshToken": "synthetic-only",
                    "expiresAt": Date().timeIntervalSince1970 + 3600, "mobileEpoch": 1]
        } else if request.url?.path.hasSuffix("/profile") == true { body = ["subject": owner, "displayName": "Synthetic QA owner"] }
        return (200, "application/json", try! JSONSerialization.data(withJSONObject: body))
    }
}

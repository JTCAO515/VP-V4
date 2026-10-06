import Foundation
import CryptoKit
import Security
import Testing
@testable import VisePanda

@MainActor struct NativeCoverageProgressTests {
    private let actor = NativeCommunitySafetyActor(scope: .init(endpoint: "http://127.0.0.1:65160",
        subject: "00000000-0000-4000-8000-000000000001", mobileEpoch: 2, generation: 1),
        sessionID: "00000000-0000-4000-8000-000000000002")
    private let wall = Date(timeIntervalSince1970: 1_801_800_000)
    private func fixture() throws -> [String: Any] {
        let url = try #require(Bundle(for: CoverageProgressFixtureAnchor.self).url(forResource: "producer", withExtension: "json", subdirectory: "CoverageProgressData"))
        return try #require(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }
    private func bytes(_ v: [String: Any], _ key: String) throws -> Data { try JSONSerialization.data(withJSONObject: #require(v[key])) }
    private func command(_ v: [String: Any], _ key: String) throws -> NativeCoverageProgressCommand {
        try .init(body: Data(#require(v[key] as? String).utf8))
    }
    private func changed(_ fixture: [String: Any], _ key: String, _ modify: (inout [String: Any]) throws -> Void) throws -> Data {
        var outer = try #require(fixture[key] as? [String: Any]), value = try #require(outer["data"] as? [String: Any])
        try modify(&value); outer["data"] = value
        return try JSONSerialization.data(withJSONObject: outer)
    }

    @Test func soleProducerAllFieldsHistoricalFencesAndFlatExitInventoryDecode() throws {
        let v = try fixture(), preview = try command(v, "previewBytes")
        let result = try NativeCoverageProgressProtocol.preview(bytes(v, "preview"), command: preview, actor: actor, now: wall)
        #expect(result.items.count == 3 && result.items[0].fields.contains("fence"))
        #expect(result.items[1].fields.contains("lastLimit") && result.items[1].fields.contains("mobileEpoch"))
        #expect(result.items[2].domain == "exit" && result.items[2].fields.contains("requestDigest"))
        let foreign = try changed(v, "preview") {
            var rows = try #require($0["items"] as? [[String: Any]]), fence = try #require(rows[0]["fence"] as? [String: Any])
            fence["ownerId"] = "00000000-0000-4000-8000-000000000009"; rows[0]["fence"] = fence; $0["items"] = rows
        }
        #expect(throws: (any Error).self) { try NativeCoverageProgressProtocol.preview(foreign, command: preview, actor: actor, now: wall) }
        let recursive = try changed(v, "preview") {
            var rows = try #require($0["items"] as? [[String: Any]]), request = try #require(rows[2]["request"] as? [String: Any])
            request["items"] = rows; rows[2]["request"] = request; $0["items"] = rows
        }
        #expect(throws: (any Error).self) { try NativeCoverageProgressProtocol.preview(recursive, command: preview, actor: actor, now: wall) }
        let missing = try changed(v, "preview") {
            var rows = try #require($0["items"] as? [[String: Any]]), request = try #require(rows[2]["request"] as? [String: Any])
            request.removeValue(forKey: "effects"); rows[2]["request"] = request; $0["items"] = rows
        }
        #expect(throws: (any Error).self) { try NativeCoverageProgressProtocol.preview(missing, command: preview, actor: actor, now: wall) }
    }

    @Test func exactExportBytesAndProofBoundariesMustMatchReviewedSelection() throws {
        let v = try fixture(), preview = try command(v, "previewBytes"), export = try command(v, "exportBytes")
        let reviewed = try NativeCoverageProgressProtocol.preview(bytes(v, "preview"), command: preview, actor: actor, now: wall).binding
        let binding = try NativeCoverageProgressProtocol.bundle(bytes(v, "bundle"), command: export, reviewed: reviewed, actor: actor, now: wall)
        #expect(binding == reviewed)
        let normalized = try NativeCoverageProgressCommand(body: NativeCommunityWire.bytes(#require(JSONSerialization.jsonObject(with: export.body) as? [String: Any])))
        #expect(throws: (any Error).self) { try NativeCoverageProgressProtocol.bundle(bytes(v, "bundle"), command: normalized, reviewed: reviewed, actor: actor, now: wall) }
        let partial = try changed(v, "bundle") { $0["proof"] = ["coverage": "partial", "pages": 1, "rows": 3] }
        #expect(throws: (any Error).self) { try NativeCoverageProgressProtocol.bundle(partial, command: export, reviewed: reviewed, actor: actor, now: wall) }
        let truncated = try changed(v, "bundle") { var rows = try #require($0["items"] as? [[String: Any]]); rows.removeLast(); $0["items"] = rows }
        #expect(throws: (any Error).self) { try NativeCoverageProgressProtocol.bundle(truncated, command: export, reviewed: reviewed, actor: actor, now: wall) }
        #expect(throws: (any Error).self) { try NativeCoverageProgressProtocol.preview(bytes(v, "preview"), command: preview, actor: actor, now: wall.addingTimeInterval(30)) }
        var raw = try #require(JSONSerialization.jsonObject(with: preview.body) as? [String: Any])
        raw["requestId"] = "00000000-0000-4000-8000-00000000000A"
        #expect(throws: (any Error).self) { try NativeCoverageProgressCommand(body: NativeCommunityWire.bytes(raw)) }
    }

    @Test func unknownAckQueriesOriginalBytesAndTerminalRecoveryAfterTTLCannotRenewOrDropFences() async throws {
        let v = try fixture(), original = try command(v, "eraseBytes"), vault = CoverageProgressTestVault()
        let journal = NativeCoverageProgressJournal(vault: vault, validateErase: NativeCoverageProgressCommand.validateErase)
        _ = try journal.retain(original.body, actor: actor)
        let root = temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let store = NativeCoverageProgressStore(vault: vault, file: .init(root: root), now: { wall.addingTimeInterval(60) }, uptime: { 10 })
        var dispatches = 0
        await store.recover(client: .init(current: { actor }, request: { data, _ in
            dispatches += 1
            let recovery = try NativeCoverageProgressCommand(body: data)
            #expect(recovery.action == "recover" && recovery.mutationBytes == original.body)
            return try bytes(v, "unknown")
        }))
        let unresolved = try journal.read(actor)
        #expect(dispatches == 1 && unresolved?.body == original.body && store.completion == nil)
        let badFence = try changed(v, "receipt") { var effects = try #require($0["effects"] as? [String: Any]); effects["retainedFences"] = 0; $0["effects"] = effects }
        #expect(throws: (any Error).self) { try NativeCoverageProgressProtocol.erased(badFence, command: original.recovery(), actor: actor, now: wall.addingTimeInterval(60)) }
        let lateDecision = try changed(v, "receipt") { $0["decidedAt"] = 1_801_800_000_002 }
        #expect(throws: (any Error).self) { try NativeCoverageProgressProtocol.erased(lateDecision, command: original.recovery(), actor: actor, now: wall.addingTimeInterval(60)) }
        await store.recover(client: .init(current: { actor }, request: { data, _ in
            let recovery = try NativeCoverageProgressCommand(body: data)
            #expect(recovery.action == "recover" && recovery.mutationBytes == original.body)
            return try bytes(v, "receipt")
        }))
        #expect(store.visibleReceipt(actor)?.retainedFences == 3 && store.completion?.action == "delete")
        let completed = try journal.read(actor)
        #expect(completed == nil)
    }

    @Test func selectedStoreCreatesExactPrivateFileOnlyAfterValidatedBundleAndClearsOnSuspend() async throws {
        let v = try fixture(), root = temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let store = NativeCoverageProgressStore(vault: CoverageProgressTestVault(), file: .init(root: root, now: { wall }, uptime: { 10 }), now: { wall }, uptime: { 10 })
        var delivered: Data?
        let client = NativeCoverageProgressClient(current: { actor }, request: { data, _ in
            let command = try NativeCoverageProgressCommand(body: data)
            if command.action == "list" { return try bytes(v, "list") }
            let key = command.action == "preview" ? "preview" : "bundle"
            let result = try changed(v, key) {
                $0["requestId"] = command.requestID; $0["objectIds"] = command.objectIDs
                if command.action == "export" { $0["requestDigest"] = NativeCoverageProgressWire.digest(data) }
            }
            if command.action == "export" { delivered = result }
            return result
        })
        await store.load(client: client)
        for row in store.visibleObjects(actor) { store.toggle(row, actor: actor) }
        #expect(store.completion == nil && store.exportURL(actor) == nil)
        await store.review(client: client)
        let reviewed = try #require(store.visiblePreview(actor))
        #expect(store.completion == nil)
        await store.execute(action: "export", reviewed: reviewed.binding, client: client)
        let path = try #require(store.exportURL(actor)), persisted = try Data(contentsOf: path)
        #expect(persisted == delivered && store.completion?.objectIDs.count == 3)
        store.suspend()
        #expect(store.exportURL(actor) == nil && store.completion == nil)
        #expect(try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).isEmpty)
    }

    @Test func lateOwnerEpochAndSuspendedForegroundCannotPublish() async throws {
        let v = try fixture(), root = temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        var current: NativeCommunitySafetyActor? = actor
        let store = NativeCoverageProgressStore(vault: CoverageProgressTestVault(), file: .init(root: root), now: { wall }, uptime: { 10 })
        await store.load(client: .init(current: { current }, request: { _, _ in
            current = .init(scope: .init(endpoint: actor.scope.endpoint, subject: actor.scope.subject, mobileEpoch: 3, generation: 2), sessionID: actor.sessionID)
            return try bytes(v, "list")
        }))
        #expect(store.visibleObjects(current).isEmpty && store.completion == nil)
        current = actor
        await store.load(client: .init(current: { current }, request: { _, _ in store.suspend(); return try bytes(v, "list") }))
        #expect(store.visibleObjects(actor).isEmpty && store.exportURL(actor) == nil)
    }

    @Test func actualSessionRequiresOriginalJournalAndUnknownAckDoesNotRetryBeforeLogoutCleanup() async throws {
        let domain = "vpj58.coverage-progress-session." + UUID().uuidString
        let defaults = try #require(UserDefaults(suiteName: domain))
        defer { defaults.removePersistentDomain(forName: domain) }
        let vault = CoverageProgressTestVault(), configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [CoverageProgressSessionProtocol.self]
        CoverageProgressSessionProtocol.calls.reset()
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", actor.scope.endpoint], defaults: defaults,
            configuration: configuration, bundleConfiguration: [:], vault: vault)
        await session.login(email: "coverage-progress@example.invalid", password: "synthetic-only")
        let current = try session.communitySafetyActor(), v = try fixture(), original = try command(v, "eraseBytes")
        do {
            _ = try await session.coverageProgressRequest(body: original.body, actor: current)
            Issue.record("Unretained erase reached the transport")
        } catch NativeDataError.staleSessionResponse { }
        #expect(CoverageProgressSessionProtocol.calls.count == 0)
        let journal = NativeCoverageProgressJournal(vault: vault, validateErase: NativeCoverageProgressCommand.validateErase)
        let saved = try journal.retain(original.body, actor: current)
        do {
            _ = try await session.coverageProgressRequest(body: original.body, actor: current)
            Issue.record("Unknown erase ACK was accepted as a response")
        } catch NativeDataError.server(let code) { #expect(code == "COVERAGE_PROGRESS_ACK_UNKNOWN") }
        let unresolved = try journal.read(current)
        #expect(unresolved == saved && CoverageProgressSessionProtocol.calls.count == 1)
        #expect(session.dataScope == current.scope)
        let bytes = try await session.coverageProgressRequest(body: original.recovery().body, actor: current)
        #expect(try NativeCoverageProgressProtocol.erased(bytes, command: original.recovery(), actor: current, now: Date()) == nil)
        #expect(CoverageProgressSessionProtocol.calls.count == 2)
        let stillOriginal = try journal.read(current)
        #expect(stillOriginal == saved)
        await session.logout()
        #expect(session.status == "signedOut")
        let cleaned = try journal.read(current)
        #expect(cleaned == nil)
    }
    private func temporaryRoot() -> URL { FileManager.default.temporaryDirectory.appendingPathComponent("coverage-progress-test-" + UUID().uuidString) }
}

/// Synthetic unsigned transport for the actual NativeSession boundary. No server,
/// credential scope, real owner data or target permission is created.
nonisolated private final class CoverageProgressSessionProtocol: URLProtocol, @unchecked Sendable {
    static let calls = CoverageProgressRequestCounter()
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "127.0.0.1" && request.url?.port == 65160 }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}
    override func startLoading() {
        let owner = "00000000-0000-4000-8000-000000000001", session = "00000000-0000-4000-8000-000000000002"
        let path = request.url?.path ?? ""
        var status = 200
        let value: [String: Any]
        if path.hasSuffix("/credentials") {
            let claims = try! JSONSerialization.data(withJSONObject: ["sub": owner, "session_id": session]).base64EncodedString()
                .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
            value = ["subject": owner, "accessToken": "synthetic." + claims + ".unsigned-fixture", "refreshToken": "synthetic-only", "expiresAt": Date().timeIntervalSince1970 + 3600]
        } else if path.hasSuffix("/login") { value = ["subject": owner, "mobileEpoch": 2] }
        else if path.hasSuffix("/profile") { value = ["subject": owner, "displayName": "Synthetic"] }
        else if path.hasSuffix("/logout") { value = [:] }
        else if path == "/api/privacy/native/v1/coverage-progress", request.httpMethod == "POST",
                request.value(forHTTPHeaderField: "Cookie") == nil, request.value(forHTTPHeaderField: "Origin") == nil,
                request.value(forHTTPHeaderField: "Authorization")?.hasPrefix("Bearer synthetic.") == true,
                let bytes = body(), let input = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any] {
            Self.calls.increment()
            if input["action"] as? String == "erase" { status = 503; value = ["error": ["code": "COVERAGE_PROGRESS_ACK_UNKNOWN"]] }
            else if input["action"] as? String == "recover", let original = input["mutationBytes"] as? String {
                let digest = SHA256.hash(data: Data(original.utf8)).map { String(format: "%02x", $0) }.joined()
                value = ["data": ["schemaVersion": "coverage-progress-data/1", "kind": "unknown", "scope": "coverage-progress-data/1",
                    "requestId": input["requestId"]!, "objectIds": input["objectIds"]!, "ownerId": owner, "sessionId": session,
                    "mobileEpoch": 2, "requestDigest": digest, "allUserDataCompleted": false]]
            } else { status = 400; value = ["error": ["code": "INVALID_FIXTURE_COMMAND"]] }
        } else { status = 400; value = ["error": ["code": "INVALID_FIXTURE_TRANSPORT"]] }
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: try! JSONSerialization.data(withJSONObject: value)); client?.urlProtocolDidFinishLoading(self)
    }
    private func body() -> Data? {
        if let bytes = request.httpBody { return bytes }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open(); defer { stream.close() }
        var bytes = Data(), buffer = [UInt8](repeating: 0, count: 2048)
        while true {
            let n = stream.read(&buffer, maxLength: buffer.count)
            if n < 0 { return nil }; if n == 0 { return bytes }
            bytes.append(contentsOf: buffer.prefix(n))
        }
    }
}
nonisolated private final class CoverageProgressRequestCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var total = 0
    var count: Int { lock.withLock { total } }
    func reset() { lock.withLock { total = 0 } }
    func increment() { lock.withLock { total += 1 } }
}

private final class CoverageProgressFixtureAnchor: NSObject {}
@MainActor private final class CoverageProgressTestVault: NativeCredentialVault {
    private var values: [String: Data] = [:]
    func read(service: String, owner: String) -> (OSStatus, Data?) { values[service + owner].map { (errSecSuccess, $0) } ?? (errSecItemNotFound, nil) }
    func write(_ data: Data, service: String, owner: String) -> OSStatus { values[service + owner] = data; return errSecSuccess }
    func remove(service: String, owner: String) -> OSStatus { values.removeValue(forKey: service + owner); return errSecSuccess }
}

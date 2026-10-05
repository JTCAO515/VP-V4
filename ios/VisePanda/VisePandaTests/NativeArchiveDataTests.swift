import Foundation
import CryptoKit
import Security
import Testing
import XCTest
@testable import VisePanda

@MainActor struct NativeArchiveDataTests {
    private func fixture() throws -> [String: Any] {
        let url = try #require(Bundle(for: ArchiveDataFixtureAnchor.self).url(forResource: "producer", withExtension: "json", subdirectory: "ArchiveData"))
        return try #require(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }
    private func actor(_ v: [String: Any]) throws -> NativeCommunitySafetyActor {
        let a = try #require(v["actor"] as? [String: Any])
        return .init(scope: .init(endpoint: "http://127.0.0.1:65160", subject: try #require(a["ownerId"] as? String),
            mobileEpoch: try #require(a["mobileEpoch"] as? Int), generation: 1), sessionID: try #require(a["sessionId"] as? String))
    }
    private func wall(_ v: [String: Any]) throws -> Date { Date(timeIntervalSince1970: Double(try #require(v["now"] as? Int)) / 1000) }
    private func bytes(_ v: [String: Any], _ key: String) throws -> Data { try JSONSerialization.data(withJSONObject: #require(v[key])) }
    private func command(_ v: [String: Any], _ key: String) throws -> NativeArchiveDataCommand { try .init(body: Data(#require(v[key] as? String).utf8)) }
    private func changed(_ v: [String: Any], _ key: String, modify: (inout [String: Any]) throws -> Void) throws -> Data {
        var outer = try #require(v[key] as? [String: Any]), value = try #require(outer["data"] as? [String: Any])
        try modify(&value); outer["data"] = value; return try JSONSerialization.data(withJSONObject: outer)
    }

    @Test func soleProducerStoredArchiveAndProgressDecodeWithExactBytesAndCompleteProof() throws {
        let v = try fixture(), current = try actor(v), now = try wall(v)
        for prefix in ["trip", "progress"] {
            let list = try command(v, prefix + "ListBytes"), preview = try command(v, prefix + "PreviewBytes"), export = try command(v, prefix + "ExportBytes")
            let rows = try NativeArchiveDataProtocol.list(bytes(v, prefix + "List"), command: list, actor: current, now: now)
            #expect(!rows.objects.isEmpty)
            let review = try NativeArchiveDataProtocol.preview(bytes(v, prefix + "Preview"), command: preview, actor: current, now: now)
            let binding = try NativeArchiveDataProtocol.bundle(bytes(v, prefix + "Bundle"), command: export, reviewed: review, actor: current, now: now)
            #expect(binding == review.binding)
            try NativeArchiveDataProtocol.validated(bytes(v, prefix + "Validated"), command: export.validation(), original: export, binding: binding, actor: current, now: now)
            let normalized = try NativeArchiveDataCommand(body: NativeCommunityWire.bytes(#require(JSONSerialization.jsonObject(with: export.body) as? [String: Any])))
            if normalized.body != export.body {
                #expect(throws: (any Error).self) { try NativeArchiveDataProtocol.bundle(bytes(v, prefix + "Bundle"), command: normalized, reviewed: review, actor: current, now: now) }
            }
        }
        let archive = try command(v, "tripPreviewBytes")
        #expect(throws: (any Error).self) { try archive.confirmed(action: "erase", digest: String(repeating: "a", count: 64)) }
    }
    @Test func rejectedExtraFieldsMissingHeadPartialProofForeignOwnerAndExpiredReview() throws {
        let v = try fixture(), current = try actor(v), now = try wall(v)
        let preview = try command(v, "tripPreviewBytes"), export = try command(v, "tripExportBytes")
        let reviewed = try NativeArchiveDataProtocol.preview(bytes(v, "tripPreview"), command: preview, actor: current, now: now)
        let partial = try changed(v, "tripBundle") { $0["proof"] = ["coverage": "partial", "pages": 3, "rows": 3] }
        #expect(throws: (any Error).self) { try NativeArchiveDataProtocol.bundle(partial, command: export, reviewed: reviewed, actor: current, now: now) }
        let missing = try changed(v, "tripBundle") {
            var sections = try #require($0["sections"] as? [[String: Any]]), rows = try #require(sections[1]["items"] as? [[String: Any]])
            rows.removeLast(); sections[1]["items"] = rows; $0["sections"] = sections
        }
        #expect(throws: (any Error).self) { try NativeArchiveDataProtocol.bundle(missing, command: export, reviewed: reviewed, actor: current, now: now) }
        let extra = try changed(v, "tripBundle") {
            var sections = try #require($0["sections"] as? [[String: Any]]), rows = try #require(sections[0]["items"] as? [[String: Any]])
            rows[0]["rawPDF"] = "hidden"; sections[0]["items"] = rows; $0["sections"] = sections
        }
        #expect(throws: (any Error).self) { try NativeArchiveDataProtocol.bundle(extra, command: export, reviewed: reviewed, actor: current, now: now) }
        let foreign = try changed(v, "tripPreview") { $0["ownerId"] = "99999999-9999-4999-8999-999999999999" }
        #expect(throws: (any Error).self) { try NativeArchiveDataProtocol.preview(foreign, command: preview, actor: current, now: now) }
        #expect(throws: (any Error).self) { try NativeArchiveDataProtocol.preview(bytes(v, "tripPreview"), command: preview, actor: current, now: now.addingTimeInterval(30)) }
    }
    @Test func actualPrivateFileRequiresLiveValidationAndRevocationPurgesBeforeSharing() async throws {
        let v = try fixture(), current = try actor(v), now = try wall(v), root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = NativeArchiveDataStore(scope: .trip, vault: ArchiveDataTestVault(), file: .init(root: root, now: { now }, uptime: { 10 }), now: { now }, uptime: { 10 })
        var original: NativeArchiveDataCommand?, delivered: Data?, revoked = false, validations = 0
        let client = NativeArchiveDataClient(current: { current }, request: { data, _ in
            let input = try NativeArchiveDataCommand(body: data)
            if input.action == "list" { return try bytes(v, "tripList") }
            if input.action == "validate" {
                validations += 1
                if revoked { throw NativeDataError.server(code: "ARCHIVE_SOURCE_CHANGED") }
                return try changed(v, "tripValidated") { $0["requestId"] = input.requestID; $0["requestDigest"] = NativeArchiveDataWire.digest(try #require(original).body) }
            }
            let key = input.action == "preview" ? "tripPreview" : "tripBundle"
            let response = try changed(v, key) {
                $0["requestId"] = input.requestID
                if input.action == "export" { $0["requestDigest"] = NativeArchiveDataWire.digest(data) }
            }
            if input.action == "export" { original = input; delivered = response }
            return response
        })
        await store.load(client: client)
        #expect(store.selected.isEmpty && store.completion == nil)
        let trip = try #require(store.visibleObjects(current).first); store.toggle(trip, actor: current)
        await store.review(client: client)
        let reviewed = try #require(store.visiblePreview(current))
        #expect(store.completion == nil)
        await store.execute(action: "export", reviewed: reviewed.binding, client: client)
        #expect(store.completion?.binding.tripID == trip.id && validations == 1)
        let path = try #require(await store.share(client: client)), readback = try Data(contentsOf: path)
        #expect(readback == delivered && validations == 2)
        revoked = true
        #expect(await store.share(client: client) == nil)
        #expect(store.completion == nil && !FileManager.default.fileExists(atPath: path.path))
        #expect(try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).isEmpty)
    }
    @Test func unknownEraseAckRetainsOriginalBytesAndOnlyOriginalTerminalRecoversPastTTL() async throws {
        let v = try fixture(), current = try actor(v), now = try wall(v), original = try command(v, "progressEraseBytes")
        let root = temporaryRoot(), vault = ArchiveDataTestVault()
        defer { try? FileManager.default.removeItem(at: root) }
        let journal = NativeArchiveDataJournal(vault: vault, validateConfirmation: NativeArchiveDataCommand.validateConfirmation)
        _ = try journal.retain(original.body, actor: current)
        let store = NativeArchiveDataStore(scope: .progress, vault: vault, file: .init(root: root), now: { now.addingTimeInterval(60) }, uptime: { 10 })
        await store.resolve(client: .init(current: { current }, request: { data, _ in
            let recovery = try NativeArchiveDataCommand(body: data)
            #expect(recovery.action == "recover" && recovery.mutationBytes == original.body)
            return try bytes(v, "progressUnknown")
        }))
        #expect(try journal.read(current)?.body == original.body && store.completion == nil)
        let late = try changed(v, "progressReceipt") { $0["decidedAt"] = Int(now.addingTimeInterval(30).timeIntervalSince1970 * 1000) }
        #expect(throws: (any Error).self) { try NativeArchiveDataProtocol.erased(late, command: original.recovery(), actor: current, now: now.addingTimeInterval(60)) }
        await store.resolve(client: .init(current: { current }, request: { data, _ in
            #expect(try NativeArchiveDataCommand(body: data).mutationBytes == original.body)
            return try bytes(v, "progressReceipt")
        }))
        #expect(store.completion?.binding.scope == .progress && store.visibleReceipt(current)?.retainedFences == original.objectIDs.count)
        #expect(try journal.read(current) == nil)
    }
    @Test func lateSessionOrBackgroundResponseCannotPopulateOrSelectTrip() async throws {
        let v = try fixture(), current = try actor(v), now = try wall(v), root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        var live: NativeCommunitySafetyActor? = current
        let store = NativeArchiveDataStore(scope: .trip, vault: ArchiveDataTestVault(), file: .init(root: root), now: { now }, uptime: { 10 })
        await store.load(client: .init(current: { live }, request: { _, _ in
            live = .init(scope: current.scope, sessionID: "99999999-9999-4999-8999-999999999999")
            return try bytes(v, "tripList")
        }))
        #expect(store.visibleObjects(live).isEmpty && store.selected.isEmpty && store.completion == nil)
        live = current; store.bind(current)
        await store.load(client: .init(current: { live }, request: { _, _ in store.suspend(); return try bytes(v, "tripList") }))
        #expect(store.visibleObjects(current).isEmpty && store.deletionSelection(current) == nil)
    }
    private func temporaryRoot() -> URL { FileManager.default.temporaryDirectory.appendingPathComponent("archive-data-test-" + UUID().uuidString) }
}
private final class ArchiveDataFixtureAnchor: NSObject {}
@MainActor private final class ArchiveDataTestVault: NativeCredentialVault {
    private var values: [String: Data] = [:]
    func read(service: String, owner: String) -> (OSStatus, Data?) { values[service + owner].map { (errSecSuccess, $0) } ?? (errSecItemNotFound, nil) }
    func write(_ data: Data, service: String, owner: String) -> OSStatus { values[service + owner] = data; return errSecSuccess }
    func remove(service: String, owner: String) -> OSStatus { values.removeValue(forKey: service + owner); return errSecSuccess }
}

/// Actual Session consumer with an unsigned, synthetic loopback transport.
/// No real user credentials, grants or server data are used.
@MainActor final class NativeArchiveDataSessionTests: XCTestCase {
    func testJournalGateUnknownAckRecoveryHeadersAndLogoutCleanup() async throws {
        let domain = "vpj58.archive-session." + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: domain))
        defer { defaults.removePersistentDomain(forName: domain) }
        let vault = ArchiveDataTestVault(), configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ArchiveDataSessionProtocol.self]
        ArchiveDataSessionProtocol.calls.reset()
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", "http://127.0.0.1:65160"], defaults: defaults,
            configuration: configuration, bundleConfiguration: [:], vault: vault)
        await session.login(email: "archive@example.invalid", password: "synthetic-only")
        let current = try session.communitySafetyActor()
        let url = try XCTUnwrap(Bundle(for: ArchiveDataFixtureAnchor.self).url(forResource: "producer", withExtension: "json", subdirectory: "ArchiveData"))
        let fixture = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        let original = try NativeArchiveDataCommand(body: Data(try XCTUnwrap(fixture["progressEraseBytes"] as? String).utf8))
        do { _ = try await session.archiveDataRequest(body: original.body, actor: current); XCTFail("Unretained command reached transport") }
        catch NativeDataError.staleSessionResponse { }
        XCTAssertEqual(ArchiveDataSessionProtocol.calls.count, 0)
        let journal = NativeArchiveDataJournal(vault: vault, validateConfirmation: NativeArchiveDataCommand.validateConfirmation)
        let saved = try journal.retain(original.body, actor: current)
        do { _ = try await session.archiveDataRequest(body: original.body, actor: current); XCTFail("Unknown ACK was accepted") }
        catch NativeDataError.server(let code) { XCTAssertEqual(code, "ARCHIVE_ACK_UNKNOWN") }
        XCTAssertEqual(try journal.read(current), saved)
        XCTAssertEqual(ArchiveDataSessionProtocol.calls.count, 1)
        let recovery = try original.recovery()
        let result = try await session.archiveDataRequest(body: recovery.body, actor: current)
        XCTAssertNil(try NativeArchiveDataProtocol.erased(result, command: recovery, actor: current, now: Date()))
        XCTAssertEqual(ArchiveDataSessionProtocol.calls.count, 2)
        XCTAssertEqual(try journal.read(current), saved)
        await session.logout()
        XCTAssertEqual(session.status, "signedOut")
        XCTAssertNil(try journal.read(current))
    }
}
nonisolated private final class ArchiveDataSessionProtocol: URLProtocol, @unchecked Sendable {
    static let calls = ArchiveDataRequestCounter()
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "127.0.0.1" && request.url?.port == 65160 }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}
    override func startLoading() {
        let owner = "22222222-2222-4222-8222-222222222222", session = "33333333-3333-4333-8333-333333333333"
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
        else if path == "/api/privacy/native/v1/archive-data", request.httpMethod == "POST",
                request.value(forHTTPHeaderField: "Cookie") == nil, request.value(forHTTPHeaderField: "Origin") == nil,
                request.value(forHTTPHeaderField: "Authorization")?.hasPrefix("Bearer synthetic.") == true,
                let bytes = body(), let input = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any] {
            Self.calls.increment()
            if input["action"] as? String == "erase" { status = 503; value = ["error": ["code": "ARCHIVE_ACK_UNKNOWN"]] }
            else if input["action"] as? String == "recover", let original = input["mutationBytes"] as? String {
                let digest = NativeArchiveSessionFixtureHash.digest(Data(original.utf8))
                value = ["data": ["schemaVersion": "archive-data/1", "kind": "unknown", "scope": "archive-export-progress/1",
                    "requestId": input["requestId"]!, "tripId": NSNull(), "tripVersion": NSNull(), "objectIds": input["objectIds"]!,
                    "ownerId": owner, "sessionId": session, "mobileEpoch": 2, "requestDigest": digest, "allUserDataCompleted": false]]
            } else { status = 400; value = ["error": ["code": "INVALID_FIXTURE_COMMAND"]] }
        } else { status = 400; value = ["error": ["code": "INVALID_FIXTURE_TRANSPORT"]] }
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "application/json", "Cache-Control": "private, no-store", "Vary": "Authorization", "X-Content-Type-Options": "nosniff"])!
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
            if n < 0 { return nil }; if n == 0 { return bytes }; bytes.append(contentsOf: buffer.prefix(n))
        }
    }
}
nonisolated private final class ArchiveDataRequestCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var total = 0
    var count: Int { lock.withLock { total } }
    func reset() { lock.withLock { total = 0 } }
    func increment() { lock.withLock { total += 1 } }
}

nonisolated private enum NativeArchiveSessionFixtureHash {
    static func digest(_ bytes: Data) -> String { SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined() }
}

import Foundation
import Security
import Testing
@testable import VisePanda

@MainActor @Suite(.serialized) struct NativeJournalDataTests {
    private func fixture(_ name: String) throws -> Data {
        let url = try #require(Bundle(for: JournalDataFixtureAnchor.self).url(forResource: name, withExtension: "json", subdirectory: "ResultData"))
        return try Data(contentsOf: url)
    }
    private func command() throws -> NativeResultDataCommand {
        let fields = try #require(JSONSerialization.jsonObject(with: fixture("commands")) as? [String: Any])
        return try .init(body: Data(try #require(fields["eraseBytes"] as? String).utf8))
    }
    private func fixtureDate() throws -> Date {
        let fields = try #require(JSONSerialization.jsonObject(with: fixture("commands")) as? [String: Any])
        return try NativeResultDataWire.time(fields["now"]).addingTimeInterval(40)
    }
    private func makeSession(vault: any NativeCredentialVault, port: Int = 65080) async throws -> (NativeSession, String) {
        let suite = "journal-data-session-" + UUID().uuidString
        let defaults = try #require(UserDefaults(suiteName: suite))
        let configuration = URLSessionConfiguration.ephemeral; configuration.protocolClasses = [JournalDataAuthFixtureProtocol.self]
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", "http://127.0.0.1:\(port)"], defaults: defaults,
                                    configuration: configuration, bundleConfiguration: [:], vault: vault)
        await session.login(email: "synthetic-journal@example.invalid", password: "SYNTHETIC_ONLY")
        #expect(session.status == "active")
        _ = try session.communitySafetyActor()
        return (session, suite)
    }
    private func root() -> URL { FileManager.default.temporaryDirectory.appendingPathComponent("journal-data-test-" + UUID().uuidString, isDirectory: true) }
    private func cleanup(vault: any NativeCredentialVault, actor: NativeCommunitySafetyActor, suite: String) {
        // Exact synthetic endpoint services only. Never enumerate Keychain or clear another owner.
        for service in [NativeResultDataJournal.service(actor.scope.endpoint), NativeNotificationJournal.service(actor.scope.endpoint),
                        "com.visepanda.native.local-session.v2.place-guide-operation." + actor.scope.endpoint,
                        "com.visepanda.native.local-session.v2.trip-deletion." + actor.scope.endpoint,
                        "com.visepanda.native.local-session.v2." + actor.scope.endpoint] {
            let removed = vault.remove(service: service, owner: actor.scope.subject)
            #expect(removed == errSecSuccess || removed == errSecItemNotFound)
            #expect(vault.read(service: service, owner: actor.scope.subject).0 == errSecItemNotFound)
        }
        UserDefaults.standard.removePersistentDomain(forName: suite)
    }
    @Test func actualSessionOriginalVaultProtectedExportOriginalReceiptProjectionCompleteAndReadback() async throws {
        let vault = NativeKeychainVault()
        let (session, suite) = try await makeSession(vault: vault)
        let actor = try session.communitySafetyActor(), folder = root()
        defer { cleanup(vault: vault, actor: actor, suite: suite); try? FileManager.default.removeItem(at: folder) }
        let original = try command()
        let journal = NativeResultDataJournal(vault: vault, validateConfirmation: NativeResultDataCommand.validateConfirmation)
        _ = try journal.retain(original.body, actor: actor)
        let source = session.journalDataSource(), exported = NativeJournalDataStore(source: source, root: folder.appendingPathComponent("export"))
        exported.load(current: actor); #expect(exported.rows.count == 29)
        exported.select(current: actor); #expect(exported.export(current: actor))
        let url = try #require(exported.exportURL(current: actor)), id = try #require(exported.exportOperationID)
        let bytes = try Data(contentsOf: url), text = try #require(String(data: bytes, encoding: .utf8))
        #expect(bytes.count <= 1_000_000 && !text.contains(JournalDataAuthFixtureProtocol.token))
        #expect(!text.contains("REFRESH_SECRET_SENTINEL") && !text.contains("\"accessToken\"") && !text.contains("\"password\""))
        let document = try #require(JSONSerialization.jsonObject(with: bytes) as? [String: Any])
        let records = try #require(document["records"] as? [[String: Any]])
        let result = try #require(records.first { $0["source"] as? String == "result" })
        #expect(Data(base64Encoded: try #require(result["originalOperationBytes"] as? String)) == original.body)
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        #expect((attributes[.posixPermissions] as? NSNumber)?.intValue == 0o600)
        #expect(try url.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true)
        #if targetEnvironment(simulator)
        print("DEVICE_UNRUN: physical Complete protection/lock state; Simulator verifies POSIX, backup exclusion and exact bytes only")
        #else
        #expect(attributes[.protectionKey] as? FileProtectionType == .complete)
        #endif
        #expect(!exported.handedOff(operation: id, current: actor, completed: false, failed: false) && exported.delivery == "cancelled")
        #expect(!exported.handedOff(operation: id, current: actor, completed: true, failed: true) && exported.delivery == "failed")
        #expect(exported.handedOff(operation: id, current: actor, completed: true, failed: false))
        let receiptFile = NativeResultDataReceiptFile(root: folder.appendingPathComponent("original-receipt"))
        let receiptClock = try fixtureDate()
        let originalStore = NativeResultDataStore(scope: .sensitive, vault: vault, privateFile: receiptFile, now: { receiptClock }, uptime: { 100 })
        originalStore.journalObservation = session.journalDataObservation(.result)
        var requests = 0
        let response = try fixture("receipt")
        let client = NativeResultDataClient(current: { try? session.communitySafetyActor() }, request: { body, current in
            requests += 1
            let recovery = try NativeResultDataCommand(body: body)
            #expect(recovery.action == "recover" && recovery.mutationBytes == original.body && current == actor)
            return response // Sole producer's explicitly synthetic immutable receipt; no HTTP/Auth/provider claim.
        }, consumeReceipt: session.resultDataClient.consumeReceipt)
        originalStore.bind(actor); await originalStore.resolve(client: client)
        #expect(requests == 1 && originalStore.pending == nil && originalStore.visibleReceipt(actor) != nil)
        #expect(!session.resultDataPermitsResult(try #require(original.rootID)))
        #expect(vault.read(service: NativeResultDataJournal.service(actor.scope.endpoint), owner: actor.scope.subject).0 == errSecItemNotFound)
        let receipt = try #require(exported.inspectCompletion(source: .result, current: actor))
        #expect(receipt.physicalPendingAbsent && receipt.originalReceiptIdentity == original.requestID)
        #expect(!FileManager.default.fileExists(atPath: url.path))
        #expect(exported.exportReceipt(receipt, current: actor))
        let minimal = try Data(contentsOf: try #require(exported.exportURL(current: actor)))
        #expect(minimal.range(of: original.body) == nil && !String(decoding: minimal, as: UTF8.self).contains("originalOperationBytes"))
        exported.clear(); #expect(try FileManager.default.contentsOfDirectory(at: folder.appendingPathComponent("export"), includingPropertiesForKeys: nil).isEmpty)
    }
    @Test func originalRemoveFailurePreservesExactBytesAndNoLocalCompletion() async throws {
        let vault = JournalDataMemoryVault(), (session, suite) = try await makeSession(vault: vault, port: 65081)
        let actor = try session.communitySafetyActor(), folder = root()
        defer { vault.failRemove = false; cleanup(vault: vault, actor: actor, suite: suite); try? FileManager.default.removeItem(at: folder) }
        let original = try command(), journal = NativeResultDataJournal(vault: vault, validateConfirmation: NativeResultDataCommand.validateConfirmation)
        _ = try journal.retain(original.body, actor: actor)
        let key = NativeResultDataJournal.service(actor.scope.endpoint), before = vault.read(service: key, owner: actor.scope.subject).1
        let exported = NativeJournalDataStore(source: session.journalDataSource(), root: folder.appendingPathComponent("export"))
        exported.load(current: actor); exported.select(current: actor)
        let date = try fixtureDate(), response = try fixture("receipt")
        let originalStore = NativeResultDataStore(scope: .sensitive, vault: vault,
            privateFile: .init(root: folder.appendingPathComponent("receipt")), now: { date }, uptime: { 100 })
        originalStore.journalObservation = session.journalDataObservation(.result)
        vault.failRemove = true
        let client = NativeResultDataClient(current: { try? session.communitySafetyActor() }, request: { _, _ in response },
            consumeReceipt: session.resultDataClient.consumeReceipt)
        originalStore.bind(actor); await originalStore.resolve(client: client)
        #expect(vault.read(service: key, owner: actor.scope.subject).1 == before)
        #expect(try journal.read(actor)?.body == original.body && originalStore.pending?.body == original.body)
        #expect(exported.inspectCompletion(source: .result, current: actor) == nil && exported.receipts.isEmpty)
    }
    @Test func notificationSecretAskCredentialAndOldEpochAreNeverExportedOrCountedEmpty() async throws {
        let vault = JournalDataMemoryVault(), (session, suite) = try await makeSession(vault: vault, port: 65082)
        let actor = try session.communitySafetyActor(), folder = root()
        defer { cleanup(vault: vault, actor: actor, suite: suite); try? FileManager.default.removeItem(at: folder) }
        let token = String(repeating: "c1", count: 32)
        let notification = try NativeNoticeCommand(tripId: UUID().uuidString, action: "register_device", input: [
            "operationId": UUID().uuidString, "deviceId": UUID().uuidString, "token": token,
            "environment": "sandbox", "permission": "authorized", "timeZone": "Asia/Shanghai"])
        _ = try NativeNotificationJournal(vault: vault).retain(notification, scope: actor.scope)
        let old = NativeCommunitySafetyPending(schemaVersion: 1, endpoint: actor.scope.endpoint, owner: actor.scope.subject,
            epoch: actor.scope.mobileEpoch + 1, sessionID: actor.sessionID, body: try command().body)
        let oldBytes = try JSONEncoder().encode(old)
        _ = vault.write(oldBytes, service: NativeResultDataJournal.service(actor.scope.endpoint), owner: actor.scope.subject)
        let policy = NativeTextPolicy(id: UUID().uuidString, provider: "qwen", recipient: "synthetic",
            sourceRegion: "synthetic", processingRegion: "synthetic", storageRegion: "synthetic", termsVersion: "fixture/1",
            noticeVersion: "fixture/1", noticeHash: String(repeating: "a", count: 64), noticeZh: "合成", noticeEn: "Synthetic",
            retention: "retain_after_hide_v1", expiresAt: Date().addingTimeInterval(3600).ISO8601Format(), consentState: .accepted)
        let ask = NativeTextSubmission(threadId: UUID().uuidString, turnId: UUID().uuidString, idempotencyKey: UUID().uuidString,
            policyId: policy.id, locale: "en", text: "USER_OR_LICENSED_BODY_SENTINEL", serviceTask: nil)
        _ = try session.retainPendingAsk(ask, policy: policy, mode: .currentInput)
        let trip = UUID().uuidString, place = UUID().uuidString, canonical = UUID().uuidString
        let guideFields: [String: Any] = ["action": "follow_up", "expectedTripVersion": 0, "placeReferenceId": place,
            "locale": "en", "interest": "address", "operationId": UUID().uuidString, "expectedDigest": String(repeating: "b", count: 64),
            "completedSegmentIds": [String](), "question": "EXPIRED_GUIDE_ORIGINAL_BODY", "threadId": UUID().uuidString,
            "turnId": UUID().uuidString, "policyId": policy.id,
            "serviceTask": ["id": UUID().uuidString, "scopeVersion": 1, "relationship": "new_goal", "parentTurnId": NSNull()]]
        let guide = NativePlaceGuidePending(endpoint: actor.scope.endpoint, owner: actor.scope.subject, mobileEpoch: actor.scope.mobileEpoch,
            canonicalPoiID: canonical, tripID: trip, tripVersion: 0, placeReferenceID: place, locale: "en", interest: .address,
            noticeHash: policy.noticeHash, expiresAt: Date().addingTimeInterval(-1), body: try JSONSerialization.data(withJSONObject: guideFields))
        let guideBytes = try JSONEncoder().encode(guide), guideKey = "com.visepanda.native.local-session.v2.place-guide-operation." + actor.scope.endpoint
        _ = vault.write(guideBytes, service: guideKey, owner: actor.scope.subject)
        let legacy = NativePendingTripDeletion(owner: actor.scope.subject, tripID: trip, requestID: UUID().uuidString, expectedVersion: 0)
        let legacyBytes = try JSONEncoder().encode(legacy), legacyKey = "com.visepanda.native.local-session.v2.trip-deletion." + actor.scope.endpoint
        _ = vault.write(legacyBytes, service: legacyKey, owner: actor.scope.subject)
        let source = session.journalDataSource(), exported = NativeJournalDataStore(source: source, root: folder)
        exported.load(current: actor)
        #expect(exported.rows.first { $0.record.source == .guide }?.record.state == .unavailable)
        #expect(exported.rows.first { $0.record.source == .tripDelete }?.record.state == .unavailable)
        #expect(vault.read(service: guideKey, owner: actor.scope.subject).1 == guideBytes)
        #expect(vault.read(service: legacyKey, owner: actor.scope.subject).1 == legacyBytes)
        #expect(exported.rows.first { $0.record.source == .ask }?.record.state == .pending)
        #expect(exported.rows.first { $0.record.source == .result }?.record.state == .unavailable)
        #expect(exported.rows.first { $0.record.source == .notification }?.record.kind == .metadataOnly)
        exported.select(current: actor); #expect(exported.export(current: actor))
        let bytes = try Data(contentsOf: try #require(exported.exportURL(current: actor))), text = String(decoding: bytes, as: UTF8.self)
        #expect(!text.contains(token) && !text.contains(notification.body.base64EncodedString()))
        #expect(!text.contains(JournalDataAuthFixtureProtocol.token) && !text.contains("REFRESH_SECRET_SENTINEL") && !text.contains(ask.text) && !text.contains("EXPIRED_GUIDE_ORIGINAL_BODY"))
        #expect(text.contains("qualification_unconfirmed") && text.contains("secret_request_device_token_and_reason_excluded"))
        #expect(vault.read(service: NativeResultDataJournal.service(actor.scope.endpoint), owner: actor.scope.subject).1 == oldBytes)
    }
    @Test func vanishedSourceWithoutOriginalReceiptNeverCreatesSuccess() async throws {
        let vault = JournalDataMemoryVault(), (session, suite) = try await makeSession(vault: vault, port: 65083)
        let actor = try session.communitySafetyActor(), folder = root()
        defer { cleanup(vault: vault, actor: actor, suite: suite); try? FileManager.default.removeItem(at: folder) }
        _ = try NativeResultDataJournal(vault: vault, validateConfirmation: NativeResultDataCommand.validateConfirmation).retain(command().body, actor: actor)
        let exported = NativeJournalDataStore(source: session.journalDataSource(), root: folder)
        exported.load(current: actor); exported.select(current: actor)
        _ = vault.remove(service: NativeResultDataJournal.service(actor.scope.endpoint), owner: actor.scope.subject)
        #expect(exported.inspectCompletion(source: .result, current: actor) == nil && exported.receipts.isEmpty)
        #expect(!exported.export(current: actor))
    }
    @Test func fixedDualClockSourceCASAndLateHandoffRejectDriftWithoutRewritingPending() async throws {
        let vault = JournalDataMemoryVault(), (session, suite) = try await makeSession(vault: vault, port: 65084)
        let actor = try session.communitySafetyActor(), folder = root()
        defer { cleanup(vault: vault, actor: actor, suite: suite); try? FileManager.default.removeItem(at: folder) }
        let journal = NativeResultDataJournal(vault: vault, validateConfirmation: NativeResultDataCommand.validateConfirmation)
        _ = try journal.retain(command().body, actor: actor)
        let key = NativeResultDataJournal.service(actor.scope.endpoint), original = vault.read(service: key, owner: actor.scope.subject).1
        let base = Date(); var wall = base, monotonic: TimeInterval = 100
        let exported = NativeJournalDataStore(source: session.journalDataSource(), root: folder, now: { wall }, uptime: { monotonic })
        exported.load(current: actor); exported.select(current: actor); #expect(exported.export(current: actor))
        let operation = try #require(exported.exportOperationID), url = try #require(exported.exportURL(current: actor))
        wall = base.addingTimeInterval(31); monotonic = 131
        exported.tick(current: actor)
        #expect(!exported.handedOff(operation: operation, current: actor, completed: true, failed: false))
        #expect(!FileManager.default.fileExists(atPath: url.path) && vault.read(service: key, owner: actor.scope.subject).1 == original)
        wall = base; monotonic = 200; exported.load(current: actor); exported.select(current: actor)
        #expect(exported.export(current: actor))
        let oldShare = NativeJournalDataShareSelection(id: try #require(exported.exportOperationID), actor: actor,
            url: try #require(exported.exportURL(current: actor)))
        exported.select(current: actor); #expect(exported.export(current: actor))
        let newShare = NativeJournalDataShareSelection(id: try #require(exported.exportOperationID), actor: actor,
            url: try #require(exported.exportURL(current: actor)))
        #expect(!newShare.matches(oldShare, currentActor: actor, registered: true, operationID: exported.exportOperationID, currentURL: exported.exportURL(current: actor)))
        #expect(newShare.matches(newShare, currentActor: actor, registered: true, operationID: exported.exportOperationID, currentURL: exported.exportURL(current: actor)))
        #expect(!exported.handedOff(operation: oldShare.id, current: actor, completed: true, failed: false))
        #expect(exported.exportOperationID == newShare.id && exported.delivery == "prepared")
        wall = base.addingTimeInterval(-1); #expect(!exported.export(current: actor))
        wall = base; exported.load(current: actor); exported.select(current: actor)
        monotonic = 199; #expect(!exported.export(current: actor))
        monotonic = 300; exported.load(current: actor); exported.select(current: actor)
        _ = vault.write(Data("corrupt-current-source".utf8), service: key, owner: actor.scope.subject)
        #expect(!exported.export(current: actor) && vault.read(service: key, owner: actor.scope.subject).1 == Data("corrupt-current-source".utf8))
    }
    @Test func physicalSourceCASDetectsChangeBetweenOriginalQualifiedReads() async throws {
        let vault = JournalDataMemoryVault(), (session, suite) = try await makeSession(vault: vault, port: 65085)
        let actor = try session.communitySafetyActor()
        defer { cleanup(vault: vault, actor: actor, suite: suite) }
        let key = NativeResultDataJournal.service(actor.scope.endpoint)
        _ = try NativeResultDataJournal(vault: vault, validateConfirmation: NativeResultDataCommand.validateConfirmation).retain(command().body, actor: actor)
        vault.readCount = 0
        vault.driftService = key
        let source = session.journalDataSource()
        #expect(try source.snapshot(source: .result, actor: actor)?.record.state == .unavailable)
        #expect(vault.read(service: key, owner: actor.scope.subject).1 == Data("source-changed".utf8))
    }
    @Test func newExplicitWriteRemainsLegalAndCannotReuseOldReceiptOrActor() async throws {
        let vault = JournalDataMemoryVault(), (session, suite) = try await makeSession(vault: vault, port: 65086)
        let actor = try session.communitySafetyActor(), folder = root()
        defer { cleanup(vault: vault, actor: actor, suite: suite); try? FileManager.default.removeItem(at: folder) }
        let original = try command(), journal = NativeResultDataJournal(vault: vault, validateConfirmation: NativeResultDataCommand.validateConfirmation)
        let pending = try journal.retain(original.body, actor: actor)
        let exported = NativeJournalDataStore(source: session.journalDataSource(), root: folder)
        exported.load(current: actor); exported.select(current: actor)
        let observation = session.journalDataObservation(.result), ticket = observation.begin()
        try journal.complete(pending, actor: actor)
        observation.finish(ticket, UUID().uuidString) // Wrong original operation cannot make a proof.
        #expect(exported.inspectCompletion(source: .result, current: actor) == nil)
        let fresh = try NativeResultDataCommand.preview(root: .artifact, id: try #require(original.rootID)).confirmed(sourceDigest: original.sourceDigest!, previewDigest: original.previewDigest!)
        let second = try journal.retain(fresh.body, actor: actor)
        #expect(second.body == fresh.body && fresh.requestID != original.requestID)
        observation.finish(ticket, original.requestID!)
        #expect(exported.inspectCompletion(source: .result, current: actor) == nil)
        let replacement = NativeCommunitySafetyActor(scope: .init(endpoint: actor.scope.endpoint, subject: actor.scope.subject,
            mobileEpoch: actor.scope.mobileEpoch, generation: actor.scope.generation + 1), sessionID: actor.sessionID)
        #expect(exported.exportURL(current: replacement) == nil)
        exported.tick(current: replacement); #expect(exported.selection == nil && exported.rows.isEmpty)
        #expect(try journal.read(actor)?.body == fresh.body)
    }
    @Test func ownCleanupFailureFencesFileDeliveryAndPreservesEveryOriginalRequest() async throws {
        let vault = JournalDataMemoryVault(), (session, suite) = try await makeSession(vault: vault, port: 65087)
        let actor = try session.communitySafetyActor(), folder = root()
        defer { cleanup(vault: vault, actor: actor, suite: suite); try? FileManager.default.removeItem(at: folder) }
        _ = try NativeResultDataJournal(vault: vault, validateConfirmation: NativeResultDataCommand.validateConfirmation).retain(command().body, actor: actor)
        let key = NativeResultDataJournal.service(actor.scope.endpoint), before = vault.read(service: key, owner: actor.scope.subject).1
        var refuse = false
        let exported = NativeJournalDataStore(source: session.journalDataSource(), root: folder, remove: { url in
            if refuse { throw NativeDataError.sessionUnavailable }; try FileManager.default.removeItem(at: url)
        })
        exported.load(current: actor); exported.select(current: actor); #expect(exported.export(current: actor))
        refuse = true; exported.clear()
        #expect(!exported.storageReady && exported.exportURL(current: actor) == nil && exported.receipts.isEmpty)
        #expect(vault.read(service: key, owner: actor.scope.subject).1 == before)
        refuse = false; exported.clear(); #expect(exported.storageReady)
    }
}

private final class JournalDataFixtureAnchor: NSObject {}

@MainActor private final class JournalDataMemoryVault: NativeCredentialVault {
    private var bytes: [String: Data] = [:]
    var failRemove = false
    var readCount = 0
    var driftService: String?
    private func key(_ service: String, _ owner: String) -> String { service + "\n" + owner }
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        if service == driftService {
            readCount += 1
            if readCount == 4 { bytes[key(service, owner)] = Data("source-changed".utf8); driftService = nil }
        }
        guard let value = bytes[key(service, owner)] else { return (errSecItemNotFound, nil) }
        return (errSecSuccess, value)
    }
    func write(_ value: Data, service: String, owner: String) -> OSStatus { bytes[key(service, owner)] = value; return errSecSuccess }
    func remove(service: String, owner: String) -> OSStatus {
        if failRemove { return errSecInteractionNotAllowed }; bytes[key(service, owner)] = nil; return errSecSuccess
    }
}

/// Completely intercepted fixture login. These are synthetic sentinels, never live credentials.
nonisolated private final class JournalDataAuthFixtureProtocol: URLProtocol, @unchecked Sendable {
    static let owner = "00000000-0000-4000-8000-000000000001"
    static let sessionID = "00000000-0000-4000-8000-000000000002"
    static let token: String = {
        let payload = try! JSONSerialization.data(withJSONObject: ["sub": owner, "session_id": sessionID]).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        return "SYNTHETIC_ACCESS_SENTINEL." + payload + ".SYNTHETIC_SIGNATURE"
    }()
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}
    override func startLoading() {
        guard let url = request.url, url.host == "127.0.0.1" else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL)); return
        }
        let fields: [String: Any]
        if url.path.hasSuffix("/profile") { fields = ["subject": Self.owner, "displayName": "SYNTHETIC_PRIVATE_PROFILE"] }
        else if url.path.hasSuffix("/login") { fields = ["subject": Self.owner, "mobileEpoch": 3] }
        else if url.path.hasSuffix("/credentials") || url.path.hasSuffix("/refresh") {
            fields = ["subject": Self.owner, "accessToken": Self.token, "refreshToken": "REFRESH_SECRET_SENTINEL",
                      "expiresAt": Date().addingTimeInterval(3600).timeIntervalSince1970, "mobileEpoch": 3]
        } else { client?.urlProtocol(self, didFailWithError: URLError(.unsupportedURL)); return }
        let data = try! JSONSerialization.data(withJSONObject: fields)
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data); client?.urlProtocolDidFinishLoading(self)
    }
}

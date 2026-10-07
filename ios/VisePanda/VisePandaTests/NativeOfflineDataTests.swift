import XCTest
import CryptoKit
import Security
@testable import VisePanda

@MainActor private final class OfflineDataVault: NativeCredentialVault {
    var values: [String: Data] = [:]
    func write(_ data: Data, service: String, owner: String) -> OSStatus { values[service + owner] = data; return errSecSuccess }
    func read(service: String, owner: String) -> (OSStatus, Data?) { values[service + owner].map { (errSecSuccess, $0) } ?? (errSecItemNotFound, nil) }
    func remove(service: String, owner: String) -> OSStatus { values.removeValue(forKey: service + owner); return errSecSuccess }
}
@MainActor private final class OfflineDataFixture {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent("offline-data-" + UUID().uuidString)
    let vault = OfflineDataVault()
    let defaults = UserDefaults(suiteName: "offline-data-" + UUID().uuidString)!
    let scope = NativeDataScope(endpoint: "http://127.0.0.1:63251", subject: "12345678-1234-4234-8234-123456789abc", mobileEpoch: 1, generation: 1)
    let trip = "22345678-1234-4234-8234-123456789abc"
    let otherTrip = "32345678-1234-4234-8234-123456789abc"
    let signer = Curve25519.Signing.PrivateKey()
    var stamp = NativeKnowledgeRead.date("2026-10-07T00:00:00.000Z")!
    var time: TimeInterval = 10
    var boot = "synthetic-boot-A"
    var denyRemove = false
    lazy var namespace = try! NativeOfflineTripNamespace(scope: scope, tripID: trip)
    var actor: NativeCommunitySafetyActor { .init(scope: scope, sessionID: "42345678-1234-4234-8234-123456789abc") }
    var verifier: NativeOfflinePermitVerifier { .init(trustedKeys: [NativeOfflinePermitVerifier.keyID(signer.publicKey.rawRepresentation): signer.publicKey.rawRepresentation]) }
    func original(failing: Bool = false) -> NativeOfflineTripStore {
        NativeOfflineTripStore(root: root.appendingPathComponent("original"), vault: vault, defaults: defaults,
            removeOfflineFile: failing ? { [self] url in
                if denyRemove && url.lastPathComponent.hasSuffix(".confirmed.aesgcm") { throw NativeOfflineTripError.storageUnavailable }
                try FileManager.default.removeItem(at: url)
            } : nil)
    }
    func consumer(_ original: NativeOfflineTripStore, trusted: Bool = true) -> NativeOfflineDataStore {
        NativeOfflineDataStore(original: original, root: root.appendingPathComponent("export"), verifier: trusted ? verifier : .init(),
                               uptime: { self.time }, now: { self.stamp }, boot: { self.boot })
    }
    func draft(_ id: String? = nil, title: String = "private user change") throws -> NativeOfflineTripDraft {
        try .init(namespace: .init(scope: scope, tripID: id ?? trip), baseVersion: 2, operations: [.init(kind: .setTitle, title: title)], now: stamp)
    }
    func lodging() -> NativeLodgingLocalRecord {
        .init(schemaVersion: "native-lodging-local/1", namespace: namespace, revision: 1, tripVersion: 2, intent: .deferred,
              city: "shanghai", checkIn: nil, checkOut: nil, adults: nil, children: nil, rooms: nil, bedType: nil, budget: nil,
              candidateChoices: [], selected: nil, updatedAt: stamp)
    }
    func permit(_ ticket: NativeOfflineDataWriteTicket) throws -> NativeVerifiedOfflinePermit {
        func iso(_ value: Date) -> String {
            let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            return formatter.string(from: value)
        }
        let payload: [String: Any] = ["days": [["id": "Day_A", "date": "2026-10-08", "items": [["id": "Item_1", "title": "permitted private text"]]]]]
        var wire: [String: Any] = ["kind": "offline_trip_read/1", "subject": scope.subject, "sessionEpoch": 1,
            "tripId": trip, "headVersion": 2, "policyId": "synthetic-policy", "policyRevision": 1,
            "issuedAt": iso(stamp.addingTimeInterval(-1)), "expiresAt": iso(stamp.addingTimeInterval(120)), "serverTime": iso(stamp),
            "requestNonce": ticket.nonce, "coverage": "partial", "sourceSemantics": "controlled_user_text_submission", "generation": 0,
            "fieldAllowlist": ["days.date", "days.items.title"], "snapshotDigest": NativeOfflineTripNamespace.digest(try NativeOfflineCanonicalJSON.data(payload)), "payload": payload]
        let signature = try signer.signature(for: NativeOfflineCanonicalJSON.data(wire)).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        wire["proof"] = ["algorithm": "Ed25519", "keyId": NativeOfflinePermitVerifier.keyID(signer.publicKey.rawRepresentation), "signature": signature]
        return try verifier.verify(JSONSerialization.data(withJSONObject: wire), namespace: namespace, headVersion: 2, nonce: ticket.nonce)
    }
    @discardableResult func populate(_ original: NativeOfflineTripStore) throws -> NativeVerifiedOfflinePermit {
        let ticket = try original.beginOfflineDataWrite(namespace, scope: scope, uptime: time)
        try original.saveUserDraft(draft(), scope: scope, ticket: ticket)
        try original.saveLodging(lodging(), expectedRevision: nil, scope: scope, ticket: ticket)
        let permit = try permit(ticket)
        try original.saveConfirmedText(permit, scope: scope, ticket: ticket, now: stamp, uptime: time, bootIdentity: boot)
        return permit
    }
    func dispose() { try? FileManager.default.removeItem(at: root) }
}

nonisolated final class NativeOfflineDataTests: XCTestCase {
    @MainActor func testOriginalThreeSourceExportPreservesWireAndLeavesOtherTripAndCommands() throws {
        let f = OfflineDataFixture(); defer { f.dispose() }
        let original = f.original(), permit = try f.populate(original)
        let other = try f.draft(f.otherTrip)
        try original.saveUserDraft(other, scope: f.scope, ticket: try original.beginOfflineDataWrite(other.namespace, scope: f.scope))
        let pending = Data("unchanged-pending-command".utf8)
        f.vault.values["original-pending-journal"] = pending
        let store = f.consumer(original); store.load(current: f.actor); store.select(f.trip, current: f.actor)
        XCTAssertEqual(store.receipts.map(\.state), [.included, .included, .included])
        XCTAssertTrue(store.export(current: f.actor)); XCTAssertTrue(store.exportComplete)
        let url = try XCTUnwrap(store.exportURL(current: f.actor)), bytes = try Data(contentsOf: url)
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: bytes) as? [String: Any])
        XCTAssertEqual(Data(base64Encoded: try XCTUnwrap(body["confirmedPermitWire"] as? String)), permit.wire)
        XCTAssertNotNil(body["draft"]); XCTAssertNotNil(body["lodging"]); XCTAssertLessThanOrEqual(bytes.count, 1_000_000)
        let receipt = try XCTUnwrap(store.clean(current: f.actor))
        XCTAssertEqual(receipt.absentSources, NativeOfflineDataSource.allCases)
        XCTAssertNil(store.exportURL(current: f.actor)); XCTAssertFalse(FileManager.default.fileExists(atPath: url.path))
        XCTAssertEqual(try original.readUserDraft(other.namespace, scope: f.scope), other)
        XCTAssertEqual(f.vault.values["original-pending-journal"], pending)
        XCTAssertEqual(try original.offlineDataCleanupReceipt(f.namespace, scope: f.scope), receipt)
    }
    @MainActor func testUntrustedAndExpiredPermitIsBlockedWithoutContentButCiphertextCanBeCleaned() throws {
        for trusted in [false, true] {
            let f = OfflineDataFixture(); defer { f.dispose() }
            let original = f.original(); try f.populate(original)
            if trusted { f.time += 120; f.stamp = f.stamp.addingTimeInterval(120) }
            let store = f.consumer(original, trusted: trusted); store.load(current: f.actor); store.select(f.trip, current: f.actor)
            XCTAssertEqual(store.receipts.first { $0.source == .confirmedText }?.state, .blocked)
            XCTAssertTrue(store.export(current: f.actor)); XCTAssertFalse(store.exportComplete)
            let bytes = try Data(contentsOf: XCTUnwrap(store.exportURL(current: f.actor)))
            XCTAssertFalse(String(decoding: bytes, as: UTF8.self).contains("permitted private text"))
            let body = try XCTUnwrap(JSONSerialization.jsonObject(with: bytes) as? [String: Any])
            XCTAssertNil(body["confirmedPermitWire"])
            XCTAssertNotNil(store.clean(current: f.actor))
            let physical = try original.offlineDataInventory(f.namespace, scope: f.scope)
            XCTAssertTrue(physical.sources.isEmpty); XCTAssertFalse(physical.indexed)
        }
    }
    @MainActor func testPersistedGenerationRejectsLateWritersButExplicitNewWritesStayLegal() throws {
        let f = OfflineDataFixture(); defer { f.dispose() }
        let first = f.original(); let old = try first.beginOfflineDataWrite(f.namespace, scope: f.scope, uptime: f.time)
        let oldPermit = try f.permit(old); try f.populate(first)
        let consumer = f.consumer(first); consumer.load(current: f.actor); consumer.select(f.trip, current: f.actor)
        XCTAssertNotNil(consumer.clean(current: f.actor))
        let reopened = f.original()
        XCTAssertThrowsError(try reopened.saveUserDraft(f.draft(), scope: f.scope, ticket: old))
        XCTAssertThrowsError(try reopened.saveLodging(f.lodging(), expectedRevision: nil, scope: f.scope, ticket: old))
        XCTAssertThrowsError(try reopened.saveConfirmedText(oldPermit, scope: f.scope, ticket: old, now: f.stamp, uptime: f.time, bootIdentity: f.boot))
        let fresh = try reopened.beginOfflineDataWrite(f.namespace, scope: f.scope, uptime: f.time)
        XCTAssertGreaterThan(fresh.generation, old.generation)
        XCTAssertThrowsError(try reopened.saveConfirmedText(oldPermit, scope: f.scope, ticket: fresh, now: f.stamp, uptime: f.time, bootIdentity: f.boot))
        let draft = try f.draft(title: "explicit new user edit")
        try reopened.saveUserDraft(draft, scope: f.scope, ticket: fresh)
        XCTAssertEqual(try reopened.readUserDraft(f.namespace, scope: f.scope), draft)
        let newPermit = try f.permit(fresh)
        try reopened.saveConfirmedText(newPermit, scope: f.scope, ticket: fresh, now: f.stamp, uptime: f.time, bootIdentity: f.boot)
        XCTAssertEqual(try reopened.readConfirmedText(f.namespace, scope: f.scope, verifier: f.verifier, now: f.stamp, uptime: f.time, bootIdentity: f.boot)?.0.wire, newPermit.wire)
    }
    @MainActor func testFailedCleanerRetainsAdmissionAndCanOnlyResumeSameOperation() throws {
        let f = OfflineDataFixture(); defer { f.dispose() }
        let original = f.original(failing: true); try f.populate(original)
        let before = try original.offlineDataInventory(f.namespace, scope: f.scope), operation = UUID().uuidString.lowercased()
        f.denyRemove = true
        XCTAssertThrowsError(try original.cleanupOfflineData(f.namespace, scope: f.scope, expectedFingerprint: before.fingerprint, operationID: operation, now: f.stamp))
        let reopened = f.original(failing: true)
        let pending = try XCTUnwrap(reopened.offlineDataPendingCleanup(f.namespace, scope: f.scope))
        XCTAssertEqual(pending.operationID, operation)
        XCTAssertThrowsError(try reopened.readLodging(f.namespace, scope: f.scope))
        XCTAssertThrowsError(try reopened.beginOfflineDataWrite(f.namespace, scope: f.scope))
        XCTAssertNil(try reopened.offlineDataCleanupReceipt(f.namespace, scope: f.scope))
        XCTAssertThrowsError(try reopened.cleanupOfflineData(f.namespace, scope: f.scope, expectedFingerprint: before.fingerprint, operationID: UUID().uuidString.lowercased()))
        f.denyRemove = false
        let store = f.consumer(reopened); store.load(current: f.actor); store.select(f.trip, current: f.actor)
        XCTAssertEqual(store.pendingCleanup?.operationID, operation)
        let receipt = try XCTUnwrap(store.clean(current: f.actor))
        XCTAssertEqual(receipt.operationID, operation)
        let retry = try reopened.cleanupOfflineData(f.namespace, scope: f.scope, expectedFingerprint: "old", operationID: operation, now: f.stamp.addingTimeInterval(20))
        XCTAssertEqual(retry, receipt, "Same operation cannot regenerate an immutable receipt")
    }
    @MainActor func testLostIndexAfterPhysicalEraseStillOffersOriginalRecovery() throws {
        let f = OfflineDataFixture(); defer { f.dispose() }
        let original = f.original(); try f.populate(original)
        let before = try original.offlineDataInventory(f.namespace, scope: f.scope), operation = UUID().uuidString.lowercased()
        _ = try original.cleanupOfflineData(f.namespace, scope: f.scope, expectedFingerprint: before.fingerprint, operationID: operation, now: f.stamp)
        // Synthetic interruption: final receipt was not durable; admission remains exact.
        let receiptPath = f.root.appendingPathComponent("original").appendingPathComponent(f.namespace.accountKey)
            .appendingPathComponent(f.namespace.tripKey + ".cleanup-receipt.aesgcm")
        try FileManager.default.removeItem(at: receiptPath)
        XCTAssertFalse(try original.savedTripIDs(scope: f.scope).contains(f.trip))
        let store = f.consumer(f.original()); store.load(current: f.actor)
        XCTAssertTrue(store.ids.contains(f.trip)); store.select(f.trip, current: f.actor)
        XCTAssertEqual(store.pendingCleanup?.operationID, operation)
        XCTAssertEqual(store.clean(current: f.actor)?.operationID, operation)
    }
    @MainActor func testChangedPreviewCannotExportOrEraseNewData() throws {
        let f = OfflineDataFixture(); defer { f.dispose() }
        let original = f.original(); try f.populate(original)
        let store = f.consumer(original); store.load(current: f.actor); store.select(f.trip, current: f.actor)
        let changed = try f.draft(title: "newer explicit change")
        try f.original().saveUserDraft(changed, scope: f.scope, ticket: try original.beginOfflineDataWrite(f.namespace, scope: f.scope))
        XCTAssertFalse(store.export(current: f.actor)); XCTAssertNil(store.clean(current: f.actor))
        XCTAssertEqual(try original.readUserDraft(f.namespace, scope: f.scope), changed)
        store.tick(current: f.actor); XCTAssertNil(store.selected)
    }
    @MainActor func testActorEpochSessionAndBackgroundInvalidatePrivateExport() throws {
        let f = OfflineDataFixture(); defer { f.dispose() }
        let original = f.original(); try f.populate(original)
        let store = f.consumer(original); store.load(current: f.actor); store.select(f.trip, current: f.actor)
        XCTAssertTrue(store.export(current: f.actor)); let url = try XCTUnwrap(store.exportURL(current: f.actor))
        let changedSession = NativeCommunitySafetyActor(scope: f.scope, sessionID: UUID().uuidString.lowercased())
        XCTAssertNil(store.exportURL(current: changedSession)); XCTAssertNil(store.clean(current: changedSession))
        store.tick(current: changedSession); XCTAssertFalse(FileManager.default.fileExists(atPath: url.path))
        let foreign = NativeDataScope(endpoint: f.scope.endpoint, subject: "92345678-1234-4234-8234-123456789abc", mobileEpoch: 1, generation: 1)
        let newerEpoch = NativeDataScope(endpoint: f.scope.endpoint, subject: f.scope.subject, mobileEpoch: 2, generation: 1)
        for scope in [foreign, newerEpoch] { XCTAssertThrowsError(try original.readUserDraft(f.namespace, scope: scope)) }
        store.load(current: f.actor); store.select(f.trip, current: f.actor); XCTAssertTrue(store.export(current: f.actor))
        let secondURL = try XCTUnwrap(store.exportURL(current: f.actor)); store.tick(current: nil)
        XCTAssertFalse(FileManager.default.fileExists(atPath: secondURL.path)); XCTAssertNil(store.selected)
    }
    @MainActor func testPrivateFileTTLClockRollbackRebootAndOriginalSourceInvalidation() throws {
        for mode in ["expiry", "wallRollback", "reboot", "source"] {
            let f = OfflineDataFixture(); defer { f.dispose() }
            let original = f.original(); try f.populate(original)
            let store = f.consumer(original); store.load(current: f.actor); store.select(f.trip, current: f.actor)
            XCTAssertTrue(store.export(current: f.actor)); let url = try XCTUnwrap(store.exportURL(current: f.actor))
            switch mode {
            case "expiry": f.time += 30; f.stamp = f.stamp.addingTimeInterval(30)
            case "wallRollback": f.stamp = f.stamp.addingTimeInterval(-1)
            case "reboot": f.boot = "synthetic-boot-B"
            default: try original.removeConfirmedText(f.namespace, scope: f.scope)
            }
            XCTAssertNil(store.exportURL(current: f.actor)); store.tick(current: f.actor)
            XCTAssertFalse(FileManager.default.fileExists(atPath: url.path))
        }
    }
    @MainActor func testUnknownSelectedFileAndSymlinkFailClosedWithoutDeletingForeignTargets() throws {
        let f = OfflineDataFixture(); defer { f.dispose() }
        let original = f.original(); try f.populate(original)
        let folder = f.root.appendingPathComponent("original").appendingPathComponent(f.namespace.accountKey)
        let unknown = folder.appendingPathComponent(f.namespace.tripKey + ".unknown.aesgcm")
        try Data("foreign bytes".utf8).write(to: unknown)
        XCTAssertThrowsError(try original.offlineDataInventory(f.namespace, scope: f.scope))
        XCTAssertThrowsError(try original.removeTrip(f.namespace, scope: f.scope))
        try FileManager.default.removeItem(at: unknown)
        let path = folder.appendingPathComponent(f.namespace.tripKey + ".draft.aesgcm")
        try FileManager.default.removeItem(at: path)
        let foreign = f.root.appendingPathComponent("outside")
        try Data("foreign bytes".utf8).write(to: foreign)
        try FileManager.default.createSymbolicLink(at: path, withDestinationURL: foreign)
        XCTAssertThrowsError(try original.offlineDataInventory(f.namespace, scope: f.scope))
        XCTAssertThrowsError(try original.removeTrip(f.namespace, scope: f.scope))
        XCTAssertEqual(try Data(contentsOf: foreign), Data("foreign bytes".utf8))
    }
    @MainActor func testOriginalFullAndSingleSourceCleanerRejectLateTickets() throws {
        let f = OfflineDataFixture(); defer { f.dispose() }
        let original = f.original(); try f.populate(original)
        var old = try original.beginOfflineDataWrite(f.namespace, scope: f.scope)
        try original.removeLodging(f.namespace, scope: f.scope)
        XCTAssertThrowsError(try original.saveLodging(f.lodging(), expectedRevision: nil, scope: f.scope, ticket: old))
        old = try original.beginOfflineDataWrite(f.namespace, scope: f.scope)
        try original.removeTrip(f.namespace, scope: f.scope)
        XCTAssertThrowsError(try original.saveUserDraft(f.draft(), scope: f.scope, ticket: old))
        XCTAssertTrue(try original.offlineDataInventory(f.namespace, scope: f.scope).sources.isEmpty)
    }
}

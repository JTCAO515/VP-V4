import Foundation
import Security
import Testing
@testable import VisePanda

@MainActor struct NativeNotificationDataTests {
    private let actor = NativeCommunitySafetyActor(scope: .init(endpoint: "http://127.0.0.1:65159",
        subject: "22222222-2222-4222-8222-222222222222", mobileEpoch: 2, generation: 1),
        sessionID: "33333333-3333-4333-8333-333333333333")
    private let object = "44444444-4444-4444-8444-444444444444"
    private let hash = String(repeating: "a", count: 64)
    private let wall = Date(timeIntervalSince1970: 1000)

    @Test func exactOriginalEraseJournalSurvivesUnknownAndRejectsReplacementOrOtherSession() throws {
        let vault = NotificationDataTestVault(), journal = NativeNotificationDataJournal(vault: vault)
        let preview = try NativeNotificationDataCommand.preview(scope: .trip, objectIDs: [object])
        let mutation = try preview.confirmed(action: "erase", previewDigest: hash)
        let saved = try journal.retain(validatedEraseBytes: mutation.body, actor: actor)
        let restarted = NativeNotificationDataJournal(vault: vault)
        let persisted = try restarted.read(actor)
        #expect(persisted?.body == mutation.body)
        let recovery = try mutation.recovery()
        #expect(recovery.mutationBytes == mutation.body && recovery.requestID == mutation.requestID)
        let other = try NativeNotificationDataCommand.preview(scope: .trip, objectIDs: [object]).confirmed(action: "erase", previewDigest: hash)
        #expect(throws: (any Error).self) { try restarted.retain(validatedEraseBytes: other.body, actor: actor) }
        let changed = NativeCommunitySafetyActor(scope: actor.scope, sessionID: "55555555-5555-4555-8555-555555555555")
        #expect(throws: (any Error).self) { try restarted.read(changed) }
        var altered = try #require(JSONSerialization.jsonObject(with: recovery.body) as? [String: Any])
        altered["scope"] = NativeNotificationDataScope.device.rawValue
        #expect(throws: (any Error).self) { try NativeNotificationDataCommand(body: NativeCommunityWire.bytes(altered)) }
        altered = try #require(JSONSerialization.jsonObject(with: mutation.body) as? [String: Any])
        altered["ownerId"] = actor.scope.subject
        #expect(throws: (any Error).self) { try NativeNotificationDataCommand(body: NativeCommunityWire.bytes(altered)) }
        vault.failErase = true
        #expect(throws: (any Error).self) { try restarted.complete(saved, actor: actor) }
        let unresolved = try restarted.read(actor)
        #expect(unresolved == saved)
        vault.failErase = false; try restarted.complete(saved, actor: actor)
        let removed = try restarted.read(actor)
        #expect(removed == nil)
    }

    @Test func currentEpochAndForegroundGenerationRejectLateListWithoutPublishing() async throws {
        var current: NativeCommunitySafetyActor? = actor
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = NativeNotificationDataStore(scope: .trip, vault: NotificationDataTestVault(),
            file: NativeNotificationDataExportFile(root: root), now: { wall }, uptime: { 10 })
        let reply = try listReply()
        let client = NativeNotificationDataClient(current: { current }, request: { _, _ in
            current = NativeCommunitySafetyActor(scope: .init(endpoint: actor.scope.endpoint, subject: actor.scope.subject,
                mobileEpoch: actor.scope.mobileEpoch + 1, generation: 2), sessionID: actor.sessionID)
            return reply
        })
        await store.load(client: client)
        #expect(store.visibleObjects(current).isEmpty && store.completion == nil)
        current = actor
        await store.load(client: .init(current: { current }, request: { _, _ in store.suspend(); return reply }))
        #expect(store.visibleObjects(actor).isEmpty && store.completion == nil)
    }

    @Test func requestStartTTLAndFileCleanupFailurePreventExpiredDeliveryAndNewWrites() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        var uptime: TimeInterval = 10, failCleanup = false
        let generation = UUID()
        let file = NativeNotificationDataExportFile(root: root, remove: {
            if failCleanup { throw NativeDataError.sessionUnavailable }; try FileManager.default.removeItem(at: $0)
        }, uptime: { uptime }, now: { wall })
        let bytes = Data("{\"synthetic_private_notification_data\":true}".utf8)
        try file.write(bytes, actor: actor, generation: generation, started: 10, expiresAt: wall.addingTimeInterval(30), current: { actor }, currentGeneration: { generation })
        let path = try #require(file.visible(current: actor, generation: generation))
        let stored = try Data(contentsOf: path)
        #expect(stored == bytes && file.visible(current: actor, generation: UUID()) == nil)
        uptime = 40; failCleanup = true
        #expect(file.visible(current: actor, generation: generation) == nil)
        #expect(throws: (any Error).self) { try file.tick(current: actor, generation: generation) }
        #expect(!file.ready)
        #expect(throws: (any Error).self) {
            try file.write(bytes, actor: actor, generation: generation, started: 40, expiresAt: wall.addingTimeInterval(30), current: { actor }, currentGeneration: { generation })
        }
        failCleanup = false; try file.clear()
        let children = try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)
        #expect(children.isEmpty)
        #expect(throws: (any Error).self) { try NativeNotificationDataLease(started: 10, received: 40, now: wall, expiresAt: wall.addingTimeInterval(30)) }
    }

    @Test func completeDeviceColumnPreviewRejectsForeignOwnerMissingTokenAndBrokenAttemptEdges() throws {
        let command = try NativeNotificationDataCommand.preview(scope: .device, objectIDs: [object])
        var binding = try bound(command)
        let device: [String: Any] = ["id": object, "owner_id": actor.scope.subject, "session_id": actor.sessionID, "epoch": 2,
            "revision": 1, "token": "aabbccdd", "environment": "sandbox", "topic": "com.visepanda.fixture", "permission": "authorized",
            "time_zone": "Asia/Shanghai", "active": true, "updated_at": "1970-01-01T00:16:40.000Z"]
        var item: [String: Any] = ["objectId": object, "device": device, "outbox": [], "attempts": [], "fences": []]
        binding["kind"] = "preview"; binding["items"] = [item]; binding["requiresExplicitConfirmation"] = true
        let valid = try NativeNotificationDataProtocol.preview(envelope(binding), command: command, actor: actor, now: wall)
        #expect(valid.items.first?.fields.first(where: { $0.name == "device" })?.value.contains("aabbccdd") == true)
        var foreign = device; foreign["owner_id"] = "55555555-5555-4555-8555-555555555555"
        item["device"] = foreign; binding["items"] = [item]
        #expect(throws: (any Error).self) { try NativeNotificationDataProtocol.preview(envelope(binding), command: command, actor: actor, now: wall) }
        var missing = device; missing.removeValue(forKey: "token")
        item["device"] = missing; binding["items"] = [item]
        #expect(throws: (any Error).self) { try NativeNotificationDataProtocol.preview(envelope(binding), command: command, actor: actor, now: wall) }
        item["device"] = device
        item["attempts"] = [["notification_id": "66666666-6666-4666-8666-666666666666", "attempt_id": "77777777-7777-4777-8777-777777777777",
            "device_id": object, "device_revision": 1, "state": "unknown", "outcome": ["kind": "unknown", "code": "ACK_UNKNOWN"],
            "authorized_at": "1970-01-01T00:16:40.000Z", "lease_expires_at": "1970-01-01T00:16:45.000Z"]]
        binding["items"] = [item]
        #expect(throws: (any Error).self) { try NativeNotificationDataProtocol.preview(envelope(binding), command: command, actor: actor, now: wall) }
    }

    @Test func unknownRecoveryRetainsBytesAndTerminalReceiptRejectsRecallOrLateDecisionClaims() async throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let vault = NotificationDataTestVault()
        let original = try NativeNotificationDataCommand.preview(scope: .trip, objectIDs: [object]).confirmed(action: "erase", previewDigest: hash)
        _ = try NativeNotificationDataJournal(vault: vault).retain(validatedEraseBytes: original.body, actor: actor)
        let store = NativeNotificationDataStore(scope: .trip, vault: vault, file: NativeNotificationDataExportFile(root: root), now: { wall.addingTimeInterval(60) }, uptime: { 10 })
        var eraseDispatches = 0
        let unknown: [String: Any] = ["schemaVersion": NativeNotificationDataWire.schema, "kind": "unknown", "scope": original.scope.rawValue,
            "requestId": original.requestID!, "objectIds": original.objectIDs, "ownerId": actor.scope.subject, "sessionId": actor.sessionID,
            "mobileEpoch": actor.scope.mobileEpoch, "requestDigest": NativeNotificationDataProtocol.digest(original.body), "allUserDataCompleted": false]
        await store.recover(client: .init(current: { actor }, request: { bytes, _ in
            let command = try NativeNotificationDataCommand(body: bytes)
            if command.action == "erase" { eraseDispatches += 1 }
            #expect(command.action == "recover" && command.mutationBytes == original.body)
            return try envelope(unknown)
        }))
        let stillPending = try NativeNotificationDataJournal(vault: vault).read(actor)
        #expect(eraseDispatches == 0 && stillPending?.body == original.body && store.completion == nil)
        let receipt = try erasedReply(original)
        let recovery = try original.recovery()
        var altered = receipt
        var effects = try #require(altered["effects"] as? [String: Any]); effects["providerCopies"] = "recalled"; altered["effects"] = effects
        #expect(throws: (any Error).self) { try NativeNotificationDataProtocol.erased(envelope(altered), command: recovery, actor: actor, now: wall.addingTimeInterval(60)) }
        altered = receipt; altered["decidedAt"] = 1_030_000
        #expect(throws: (any Error).self) { try NativeNotificationDataProtocol.erased(envelope(altered), command: recovery, actor: actor, now: wall.addingTimeInterval(60)) }
        await store.recover(client: .init(current: { actor }, request: { bytes, _ in
            let command = try NativeNotificationDataCommand(body: bytes)
            #expect(command.action == "recover" && command.mutationBytes == original.body)
            return try envelope(receipt)
        }))
        #expect(store.visibleReceipt(actor)?.binding.requestID == original.requestID)
        #expect(store.completion?.action == "delete" && eraseDispatches == 0)
        let completed = try NativeNotificationDataJournal(vault: vault).read(actor)
        #expect(completed == nil)
    }

    private func temporaryRoot() -> URL { FileManager.default.temporaryDirectory.appendingPathComponent("vpj58-notification-data-fixture-" + UUID().uuidString) }
    private func envelope(_ value: [String: Any]) throws -> Data { try NativeCommunityWire.bytes(["data": value]) }
    private func bound(_ command: NativeNotificationDataCommand) throws -> [String: Any] {
        let b = NativeNotificationDataBoundaries.expected(command.scope)
        return ["schemaVersion": NativeNotificationDataWire.schema, "scope": command.scope.rawValue, "requestId": command.requestID!,
            "objectIds": command.objectIDs, "ownerId": actor.scope.subject, "sessionId": actor.sessionID, "mobileEpoch": actor.scope.mobileEpoch,
            "sourceDigest": hash, "previewDigest": hash, "capturedAt": 1_000_000, "expiresAt": 1_030_000,
            "boundaries": ["exportFields": b.exportFields, "eraseFields": b.eraseFields, "retained": b.retained, "missing": b.missing], "allUserDataCompleted": false]
    }
    private func listReply() throws -> Data {
        try envelope(["schemaVersion": NativeNotificationDataWire.schema, "kind": "list", "scope": NativeNotificationDataScope.trip.rawValue,
            "ownerId": actor.scope.subject, "sessionId": actor.sessionID, "mobileEpoch": actor.scope.mobileEpoch, "sourceDigest": hash,
            "capturedAt": 1_000_000, "expiresAt": 1_030_000, "items": [["objectId": object, "label": "Synthetic archived Trip", "state": "archived", "rows": 1]],
            "hasMore": false, "nextCursor": NSNull(), "allUserDataCompleted": false])
    }
    private func erasedReply(_ command: NativeNotificationDataCommand) throws -> [String: Any] {
        var v = try bound(command)
        var effects: [String: Any] = Dictionary(uniqueKeysWithValues: NativeNotificationDataProtocol.countNames.map { ($0, 0 as Any) })
        effects["fences"] = 1; effects["providerUnknown"] = 1; effects["drainedThrough"] = 1_001_000
        effects["tripMutation"] = "none"; effects["businessResults"] = "not_modified"; effects["providerCopies"] = "not_recalled"; effects["deviceCopies"] = "not_erased"
        v["kind"] = "receipt"; v["state"] = "erased"; v["requestDigest"] = NativeNotificationDataProtocol.digest(command.body)
        v["decidedAt"] = 1_001_000; v["effects"] = effects
        return v
    }
}

@MainActor private final class NotificationDataTestVault: NativeCredentialVault {
    private var values: [String: Data] = [:]
    var failErase = false
    private func key(_ service: String, _ owner: String) -> String { service + "|" + owner }
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        guard let bytes = values[key(service, owner)] else { return (errSecItemNotFound, nil) }
        return (errSecSuccess, bytes)
    }
    func write(_ bytes: Data, service: String, owner: String) -> OSStatus { values[key(service, owner)] = bytes; return errSecSuccess }
    func remove(service: String, owner: String) -> OSStatus {
        if failErase, service == NativeNotificationDataJournal.service("http://127.0.0.1:65159") { return errSecInteractionNotAllowed }
        values.removeValue(forKey: key(service, owner)); return errSecSuccess
    }
}

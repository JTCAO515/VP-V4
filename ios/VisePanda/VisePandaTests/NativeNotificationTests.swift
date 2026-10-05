import Foundation
import Security
import Testing
#if canImport(VisePanda)
@testable import VisePanda
#else
@testable import NotificationHost
#endif

@MainActor private final class NotificationTestVault: NativeCredentialVault {
    var records: [String: Data] = [:]
    var locked = false
    func write(_ data: Data, service: String, owner: String) -> OSStatus {
        guard !locked else { return errSecInteractionNotAllowed }
        records[service + owner] = data; return errSecSuccess
    }
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        if locked { return (errSecInteractionNotAllowed, nil) }
        if let data = records[service + owner] { return (errSecSuccess, data) }
        return (errSecItemNotFound, nil)
    }
    func remove(service: String, owner: String) -> OSStatus {
        guard !locked else { return errSecInteractionNotAllowed }
        records.removeValue(forKey: service + owner); return errSecSuccess
    }
}

@MainActor private enum NotificationFixture {
    static let trip = "10000000-0000-0000-0000-000000000004"
    static let id = "10000000-0000-0000-0000-000000000002"
    static let op = "10000000-0000-0000-0000-000000000001"
    static let actor = NativeDataScope(endpoint: "http://127.0.0.1:9999", subject: "10000000-0000-0000-0000-000000000005", mobileEpoch: 1, generation: 1)
    static let source = NativeNoticeSource(kind: "current_trip", sourceId: "10000000-0000-0000-0000-000000000003", revision: 0, contentDigest: String(repeating: "a", count: 64))
    static func command() throws -> NativeNoticeCommand {
        try .init(tripId: trip, action: "cancel", input: ["operationId": op, "id": id])
    }
    static func raw(command: NativeNoticeCommand?, outcome: String = "applied") -> [String: Any] {
        var value: [String: Any] = ["version": 2, "tripId": trip, "tripVersion": 0, "transport": "disabled", "watchAvailability": "qualified_only", "nextSteps": [], "reminders": [], "watches": [], "device": NSNull(), "complete": true, "mutationReceipt": NSNull()]
        if let command {
            value["mutationReceipt"] = ["operationId": command.operationId, "action": command.action,
                "requestDigest": command.requestDigest, "resultId": command.resultId, "revision": 1, "terminal": true, "outcome": outcome]
        }
        return value
    }
    static func bytes(_ object: [String: Any]) throws -> Data { try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys, .withoutEscapingSlashes]) }
    static func perform(_ store: NativeNoticeStore, _ journal: NativeNotificationJournal, command: NativeNoticeCommand?, abandon: Bool = false,
                        request: (String, String, Data?) async throws -> Data) async {
        await store.perform(command: command, scope: actor, abandon: abandon, current: { actor }, read: { try journal.read(actor) },
            retain: { try journal.retain($0, scope: actor) }, complete: { pending, _ in try journal.complete(pending, scope: actor) }, request: request)
    }
}

@MainActor struct NativeNotificationTests {
    @Test func partialCoverageKeepsQualifiedTripSourceAndReminderUsable() async throws {
        let source = NativeNoticeSource(kind: "current_trip", sourceId: NotificationFixture.trip, revision: 0, contentDigest: String(repeating: "a", count: 64))
        let now = Date()
        let expiry = now.addingTimeInterval(7200)
        let command = try NativeNoticeCommand.schedule(tripId: NotificationFixture.trip, version: 0, source: source,
            reason: "My travel reminder", due: now.addingTimeInterval(60), expiry: expiry, timeZone: "Asia/Shanghai",
            quietHours: .init(startMinute: 1320, endMinute: 420))
        var raw = NotificationFixture.raw(command: nil)
        raw["complete"] = false
        raw["nextSteps"] = [["id": NotificationFixture.id, "source": try NativeNoticeCommand.sourceObject(source),
            "reasonCode": "review_trip", "reason": NSNull(), "expiresAt": expiry.ISO8601Format()]]
        raw["reminders"] = [["id": command.resultId, "operationId": command.operationId, "baseVersion": 0, "purpose": "user_set_travel",
            "source": try NativeNoticeCommand.sourceObject(source), "reason": "My travel reminder", "dueAt": now.addingTimeInterval(60).ISO8601Format(),
            "expiresAt": expiry.ISO8601Format(), "timeZone": "Asia/Shanghai", "quietHours": ["startMinute": 1320, "endMinute": 420],
            "status": "saved", "deliveryState": "scheduled", "outcome": NSNull()]]
        let view = try NativeNoticeView.decode(NotificationFixture.bytes(raw), tripId: NotificationFixture.trip)
        #expect(!view.complete)
        #expect(view.currentSources(expectedVersion: 0, now: now).map(\.source) == [source])
        #expect(view.hasRetainedConsentedPurpose(now: now))
        #expect(view.currentSources(expectedVersion: 1, now: now).isEmpty)
        #expect(view.currentSources(expectedVersion: 0, now: expiry).isEmpty)
        #expect(!view.hasRetainedConsentedPurpose(now: expiry))
        #expect(!view.currentSources(expectedVersion: 0, now: now).contains { $0.source.kind == "qualified_watch" })
        var dismissed = raw; dismissed["nextSteps"] = []
        let retained = try NativeNoticeView.decode(NotificationFixture.bytes(dismissed), tripId: NotificationFixture.trip)
        #expect(retained.currentSources(expectedVersion: 0, now: now).isEmpty)
        #expect(retained.hasRetainedConsentedPurpose(now: now))
        var changed = dismissed; changed["tripVersion"] = 1
        let drifted = try NativeNoticeView.decode(NotificationFixture.bytes(changed), tripId: NotificationFixture.trip)
        #expect(!drifted.hasRetainedConsentedPurpose(now: now))
        let journal = NativeNotificationJournal(vault: NotificationTestVault()), store = NativeNoticeStore()
        store.bind(scope: NotificationFixture.actor, tripId: NotificationFixture.trip)
        var ack = raw
        ack["mutationReceipt"] = NotificationFixture.raw(command: command)["mutationReceipt"]
        await NotificationFixture.perform(store, journal, command: command) { _, _, body in
            #expect(body == command.body)
            return try NotificationFixture.bytes(ack)
        }
        #expect(store.pending == nil && store.view?.complete == false)
        #expect(store.view?.hasRetainedConsentedPurpose(now: now) == true)
    }
    @Test func manualRevocationPreservesActualPermissionAndRejectsUnknown() throws {
        let command = try NativeNoticeCommand.revokeDevice(tripId: NotificationFixture.trip, deviceId: NotificationFixture.id, permission: .authorized)
        #expect(command.action == "revoke_device" && command.input["permission"] as? String == "authorized")
        #expect(throws: (any Error).self) { try NativeNoticeCommand.revokeDevice(tripId: NotificationFixture.trip, deviceId: NotificationFixture.id, permission: .unknown) }
    }
    @Test func unknownAckPersistsExactRequestAcrossReopenAndGetDoesNotClear() async throws {
        let vault = NotificationTestVault(), journal = NativeNotificationJournal(vault: vault), command = try NotificationFixture.command()
        let store = NativeNoticeStore(); store.bind(scope: NotificationFixture.actor, tripId: NotificationFixture.trip)
        await NotificationFixture.perform(store, journal, command: command) { _, _, body in
            #expect(try journal.read(NotificationFixture.actor)?.command.body == body)
            throw URLError(.timedOut)
        }
        #expect(store.pending?.command == command)
        let reopened = NativeNoticeStore(); reopened.bind(scope: NotificationFixture.actor, tripId: NotificationFixture.trip)
        await reopened.load(scope: NotificationFixture.actor, current: { NotificationFixture.actor }, read: { try journal.read(NotificationFixture.actor) }) { _, method, body in
            #expect(method == "GET" && body == nil)
            return try NotificationFixture.bytes(NotificationFixture.raw(command: nil))
        }
        #expect(reopened.pending?.command == command)
        await NotificationFixture.perform(reopened, journal, command: nil) { _, _, body in
            #expect(body == command.body)
            return try NotificationFixture.bytes(NotificationFixture.raw(command: command))
        }
        #expect(reopened.pending == nil)
        #expect(try journal.read(NotificationFixture.actor) == nil)
    }

    @Test func wrongMutationTupleNeverConsumesPending() async throws {
        let journal = NativeNotificationJournal(vault: NotificationTestVault()), command = try NotificationFixture.command()
        let store = NativeNoticeStore(); store.bind(scope: NotificationFixture.actor, tripId: NotificationFixture.trip)
        await NotificationFixture.perform(store, journal, command: command) { _, _, _ in
            var raw = NotificationFixture.raw(command: command)
            var receipt = raw["mutationReceipt"] as! [String: Any]; receipt["requestDigest"] = String(repeating: "b", count: 64)
            raw["mutationReceipt"] = receipt
            return try NotificationFixture.bytes(raw)
        }
        #expect(store.notice == "INVALID_RESPONSE")
        #expect(try journal.read(NotificationFixture.actor)?.command == command)
    }

    @Test func abandonKeepsOriginalTupleAndDistinguishesAlreadyApplied() async throws {
        let journal = NativeNotificationJournal(vault: NotificationTestVault()), command = try NotificationFixture.command()
        _ = try journal.retain(command, scope: NotificationFixture.actor)
        let store = NativeNoticeStore(); store.bind(scope: NotificationFixture.actor, tripId: NotificationFixture.trip)
        await NotificationFixture.perform(store, journal, command: nil, abandon: true) { _, _, body in
            let root = try JSONSerialization.jsonObject(with: #require(body)) as! [String: Any]
            #expect(root["action"] as? String == "abandon")
            let original = (root["input"] as! [String: Any])["command"] as! [String: Any]
            #expect(try NotificationFixture.bytes(original) == command.body)
            return try NotificationFixture.bytes(NotificationFixture.raw(command: command, outcome: "cancelled"))
        }
        #expect(store.notice == "REMINDER_OPERATION_CANCELLED" && store.pending == nil)
        _ = try journal.retain(command, scope: NotificationFixture.actor)
        await NotificationFixture.perform(store, journal, command: nil, abandon: true) { _, _, _ in
            try NotificationFixture.bytes(NotificationFixture.raw(command: command, outcome: "applied"))
        }
        #expect(store.notice == "REMINDER_OPERATION_CONFIRMED")
    }

    @Test func responseAfterActorChangeCannotPublishOrClearOldJournal() async throws {
        let journal = NativeNotificationJournal(vault: NotificationTestVault()), command = try NotificationFixture.command()
        let store = NativeNoticeStore(); store.bind(scope: NotificationFixture.actor, tripId: NotificationFixture.trip)
        var current: NativeDataScope? = NotificationFixture.actor
        await store.perform(command: command, scope: NotificationFixture.actor, current: { current }, read: { try journal.read(NotificationFixture.actor) },
            retain: { try journal.retain($0, scope: NotificationFixture.actor) }, complete: { pending, _ in try journal.complete(pending, scope: NotificationFixture.actor) }) { _, _, _ in
            current = nil; store.bind(scope: nil, tripId: NotificationFixture.trip)
            return try NotificationFixture.bytes(NotificationFixture.raw(command: command))
        }
        #expect(store.view == nil && store.pending == nil && !store.busy)
        #expect(try journal.read(NotificationFixture.actor)?.command == command)
    }

    @Test func lockedVaultAndEpochReplacementDenyConsumption() throws {
        let vault = NotificationTestVault(), journal = NativeNotificationJournal(vault: vault)
        _ = try journal.retain(NotificationFixture.command(), scope: NotificationFixture.actor)
        let changed = NativeDataScope(endpoint: NotificationFixture.actor.endpoint, subject: NotificationFixture.actor.subject, mobileEpoch: 2, generation: 1)
        #expect(throws: (any Error).self) { try journal.read(changed) }
        vault.locked = true
        #expect(throws: (any Error).self) { try journal.read(NotificationFixture.actor) }
        #expect(throws: (any Error).self) { try NativeNotificationJournal.erase(endpoint: NotificationFixture.actor.endpoint, owner: NotificationFixture.actor.subject, vault: vault) }
        vault.locked = false
        #expect(try journal.read(NotificationFixture.actor) != nil)
    }

    @Test func tokenIsExcludedFromExportAndBindingThenErasedAtMatchingAck() throws {
        let vault = NotificationTestVault(), journal = NativeNotificationJournal(vault: vault)
        let command = try NativeNoticeCommand(tripId: NotificationFixture.trip, action: "register_device", input:
            ["operationId": NotificationFixture.op, "deviceId": NotificationFixture.id, "token": "aabb0011", "environment": "sandbox", "permission": "authorized", "timeZone": "Asia/Shanghai"])
        let pending = try journal.retain(command, scope: NotificationFixture.actor)
        let metadata = String(data: try pending.exportMetadata(), encoding: .utf8)!
        #expect(!metadata.contains("aabb0011") && !metadata.contains("token") && !metadata.contains("body"))
        let response = try NativeNoticeView.decode(NotificationFixture.bytes(NotificationFixture.raw(command: command)), tripId: NotificationFixture.trip)
        try journal.acknowledgeDevice(pending, receipt: #require(response.mutationReceipt), scope: NotificationFixture.actor)
        try journal.complete(pending, scope: NotificationFixture.actor)
        #expect(try journal.binding(NotificationFixture.actor)?.deviceId == NotificationFixture.id)
        let savedBinding = try journal.binding(NotificationFixture.actor)
        let binding = try #require(savedBinding)
        #expect(!String(data: try binding.exportMetadata(), encoding: .utf8)!.contains("aabb0011"))
        #expect(!vault.records.values.contains { String(data: $0, encoding: .utf8)?.contains("aabb0011") == true })
        try NativeNotificationJournal.eraseBinding(endpoint: NotificationFixture.actor.endpoint, owner: NotificationFixture.actor.subject, vault: vault)
        #expect(try journal.binding(NotificationFixture.actor) == nil)
    }

    @Test func nativeDigestMatchesActualTypeScriptUnicodeSlashFixture() throws {
        let command = try NativeNoticeCommand(tripId: NotificationFixture.trip, action: "schedule", input:
            ["operationId": NotificationFixture.op, "id": NotificationFixture.id, "baseVersion": 0, "purpose": "user_set_travel",
             "source": NativeNoticeCommand.sourceObject(NotificationFixture.source), "reason": "广州/出发 \"带证件\"\\查\n资料",
             "dueAt": "2026-10-05T10:00:00Z", "expiresAt": "2026-10-05T11:00:00Z", "timeZone": "Asia/Shanghai",
             "quietHours": ["startMinute": 1320, "endMinute": 420], "consent": true])
        #expect(command.requestDigest == "6568d888e1a1cc52c55dba06e6ca59e8ef3f82bd1c76c23c45fc3909def7f37b")
    }

    @Test func malformedAuthorityAndUnsupportedSourceFailClosed() throws {
        var raw = NotificationFixture.raw(command: nil); raw["tripVersion"] = true
        #expect(throws: (any Error).self) { try NativeNoticeView.decode(NotificationFixture.bytes(raw), tripId: NotificationFixture.trip) }
        #expect(NativeNotificationWire.date("2026-02-30T10:00:00Z") == nil)
        #expect(NativeNotificationWire.date("2026-10-05T10:00:00") == nil)
        #expect(NativeNotificationWire.date("2026-10-05T10:00:00+14:01") == nil)
        #expect(NativeNotificationWire.date("2026-10-05T10:00:00+08:00") != nil)
        #expect(throws: (any Error).self) {
            try NativeNoticeCommand(tripId: NotificationFixture.trip, action: "watch", input:
                ["operationId": NotificationFixture.op, "id": NotificationFixture.id, "baseVersion": 0,
                 "source": NativeNoticeCommand.sourceObject(NotificationFixture.source), "expiresAt": "2026-10-05T11:00:00Z",
                 "timeZone": "Asia/Shanghai", "quietHours": ["startMinute": 1320, "endMinute": 420], "consent": true])
        }
    }

    @Test func lockScreenPayloadCannotSupplyPrivateNavigation() {
        #expect(NativeNotificationWire.opaqueReference(["aps": ["alert": "generic"], "notificationRef": NotificationFixture.id]) == NotificationFixture.id)
        #expect(NativeNotificationWire.opaqueReference(["notificationRef": NotificationFixture.id, "tripId": NotificationFixture.trip]) == nil)
        #expect(NativeNotificationWire.opaqueReference(["notificationRef": "https://private/trip"]) == nil)
        #expect(NativeNotificationWire.opaqueReference(URL(string: "visepanda://notifications/" + NotificationFixture.id)!) == NotificationFixture.id)
        #expect(NativeNotificationWire.opaqueReference(URL(string: "visepanda://notifications/" + NotificationFixture.id + "?tripId=" + NotificationFixture.trip)!) == nil)
        #expect(NativeNotificationWire.opaqueReference(URL(string: "https://notifications/" + NotificationFixture.id)!) == nil)
    }
    @Test func resolutionRejectsExpiryWrongReferenceAndChangedQualification() throws {
        let source = try NativeNoticeCommand.sourceObject(NotificationFixture.source)
        var raw: [String: Any] = ["version": 2, "kind": "resolved", "notificationId": NotificationFixture.id,
            "tripId": NotificationFixture.trip, "tripVersion": 0, "source": source,
            "expiresAt": "2026-10-05T11:00:00Z", "current": true]
        let now = try #require(NativeNotificationWire.date("2026-10-05T10:00:00Z"))
        let result = try NativeNotificationResolution.decode(NotificationFixture.bytes(raw), reference: NotificationFixture.id, now: now)
        #expect(result.source == NotificationFixture.source && result.tripVersion == 0)
        #expect(throws: (any Error).self) { try NativeNotificationResolution.decode(NotificationFixture.bytes(raw), reference: NotificationFixture.op, now: now) }
        #expect(throws: (any Error).self) { try NativeNotificationResolution.decode(NotificationFixture.bytes(raw), reference: NotificationFixture.id, now: now.addingTimeInterval(3600)) }
        raw["current"] = false
        #expect(throws: (any Error).self) { try NativeNotificationResolution.decode(NotificationFixture.bytes(raw), reference: NotificationFixture.id, now: now) }
    }
}

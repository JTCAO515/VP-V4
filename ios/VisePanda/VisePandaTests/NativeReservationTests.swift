import Foundation
import Security
import Testing
@testable import VisePanda

@MainActor struct NativeReservationTests {
    private let actor = NativeDataScope(endpoint: "http://127.0.0.1:63224", subject: "11111111-1111-4111-8111-111111111111", mobileEpoch: 1, generation: 0)
    private let trip = "22222222-2222-4222-8222-222222222222"
    private let reference = "33333333-3333-4333-8333-333333333333"
    private let digest = String(repeating: "a", count: 64)
    private var fields: NativeReservationFields {
        .init(kind: "lodging", supplier: "booking", externalReference: "Case-Preserving-1", title: "Synthetic reservation",
              startsAt: "2026-10-04T15:00:00+08:00", endsAt: "2026-10-05T12:00:00+08:00", timeZone: "Asia/Shanghai",
              address: "Synthetic address", terms: "User reports original conditions", status: "reserved")
    }
    private func command(revision: Int = 0) -> NativeReservationCommand {
        .init(operationId: "44444444-4444-4444-8444-444444444444", referenceId: reference, expectedTripVersion: 3,
              expectedRevision: revision, fields: fields, source: .init(localContentHash: digest, locator: "title:L1; address:L3"), explicitlyConfirmed: true)
    }
    private func current(_ command: NativeReservationCommand, revision: Int? = nil, version: Int? = nil) -> [String: Any] {
        ["kind": "reservation_reference/1", "referenceId": command.referenceId, "tripId": trip,
         "tripVersion": version ?? command.expectedTripVersion, "revision": revision ?? command.expectedRevision + 1,
         "fields": command.fields.object, "evidenceTier": "user_reported", "source": command.source.object,
         "sourceQualification": "untrusted", "confirmedBy": "explicit_user", "confirmedAt": "2026-10-04T04:00:00.000Z",
         "contentDigest": digest, "sourceVersion": NSNull(), "planningUse": "confirmed_reference_only", "tripMutation": "none"]
    }
    private func ack(_ command: NativeReservationCommand) -> [String: Any] {
        ["kind": "reservation_confirmation/1", "operationId": command.operationId, "tripId": trip,
         "referenceId": command.referenceId, "resultRevision": command.expectedRevision + 1,
         "commandDigest": digest, "command": command.object, "receipt": current(command)]
    }
    private func operation(_ command: NativeReservationCommand, superseded: Bool = false) -> [String: Any] {
        var latest = current(command, revision: superseded ? command.expectedRevision + 2 : nil, version: 4)
        if superseded { var amended = fields; amended.title = "Current replacement"; latest["fields"] = amended.object }
        return ["kind": "reservation_operation/1", "operationId": command.operationId, "tripId": trip,
                "referenceId": command.referenceId, "appliedRevision": command.expectedRevision + 1,
                "currentRevision": superseded ? command.expectedRevision + 2 : command.expectedRevision + 1,
                "commandDigest": digest, "command": superseded ? NSNull() : command.object,
                "result": superseded ? "superseded" : "applied", "receipt": superseded ? NSNull() : current(command),
                "current": latest, "tripMutation": "none"]
    }
    private func bytes(_ value: Any) throws -> Data { try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) }
    private func envelope(_ value: Any) throws -> Data { try bytes(["data": value]) }
    private func preview(_ command: NativeReservationCommand) -> [String: Any] {
        ["kind": "reservation_preview/1", "tripId": trip, "tripVersion": command.expectedTripVersion,
         "referenceId": command.referenceId, "relation": "new", "matches": [],
         "fields": NativeReservationFields.keys.map { ["field": $0, "before": NSNull(), "after": command.fields.object[$0]!, "state": "added"] },
         "originalLocator": command.source.locator as Any? ?? NSNull(), "sourceClaim": "user_reported", "evidenceTier": "user_reported",
         "sourceAvailability": "user_reported_only", "requiresExplicitConfirmation": true, "tripMutation": "none"]
    }
    private func page(items: [[String: Any]] = [], more: Bool = false, cursor: Any = NSNull()) -> [String: Any] {
        ["kind": "reservation_references/1", "tripId": trip, "tripVersion": 3, "items": items,
         "hasMore": more, "nextCursor": cursor, "planningConstraints": items.map { row in
            let f = row["fields"] as! [String: Any]
            return ["referenceId": row["referenceId"]!, "revision": row["revision"]!, "status": f["status"]!, "evidenceTier": "user_reported",
                    "applies": true, "startsAt": f["startsAt"]!, "endsAt": f["endsAt"]!, "timeZone": f["timeZone"]!,
                    "address": f["address"]!, "terms": f["terms"]!, "sourceQualification": "untrusted", "supplierVerified": false, "tripMutation": "none"]
         }]
    }
    private func rejected(_ body: () throws -> Void) -> Bool { do { try body(); return false } catch { return true } }

    @Test func closedInputUTF16AndOriginalUnicode() throws {
        let input = command(); let raw = try JSONSerialization.jsonObject(with: input.body(operation: "confirm")) as! [String: Any]
        #expect(try NativeReservationWire.command(raw["input"]!).valid)
        let nullable = NativeReservationFields(title: "Minimal")
        #expect(nullable.object.keys.count == 10 && nullable.object["address"] is NSNull)
        var tooLong = fields; tooLong.title = String(repeating: "😀", count: 81); #expect(!tooLong.valid)
        tooLong.title = "\u{00a0}"; #expect(!tooLong.valid)
        tooLong.title = "Valid"; tooLong.endsAt = "bad"; #expect(!tooLong.valid)
        var extra = input.object; extra["unexpected"] = true
        #expect(rejected { _ = try NativeReservationWire.command(extra) })
        #expect(!NativeReservationWire.equal("é", "e\u{301}"))
        #expect(!NativeReservationWire.equal(true, 1))
        var trusted = current(input); trusted["evidenceTier"] = "provider_verified"
        #expect(rejected { _ = try NativeReservationWire.current(trusted) })
    }
    @Test func ackBindsFullOriginalCommandAndExactReceipt() throws {
        let input = command(); let valid = ack(input)
        #expect(try NativeReservationWire.confirmation(envelope(valid), trip: trip, input: input).revision == 1)
        for key in ["operationId", "tripId", "referenceId", "commandDigest"] {
            var bad = valid; bad[key] = "wrong"
            #expect(rejected { _ = try NativeReservationWire.confirmation(envelope(bad), trip: trip, input: input) })
        }
        var bad = valid; var echoed = input.object; var changed = fields; changed.startsAt = "2026-10-04T07:00:00Z"
        echoed["fields"] = changed.object; bad["command"] = echoed
        #expect(rejected { _ = try NativeReservationWire.confirmation(envelope(bad), trip: trip, input: input) })
        bad = valid; bad["resultRevision"] = 2
        #expect(rejected { _ = try NativeReservationWire.confirmation(envelope(bad), trip: trip, input: input) })
        bad = valid; bad["resultRevision"] = true
        #expect(rejected { _ = try NativeReservationWire.confirmation(envelope(bad), trip: trip, input: input) })
        bad = valid; var receipt = current(input); receipt["tripVersion"] = 4; bad["receipt"] = receipt
        #expect(rejected { _ = try NativeReservationWire.confirmation(envelope(bad), trip: trip, input: input) })
        bad = valid; bad["extra"] = NSNull()
        #expect(rejected { _ = try NativeReservationWire.confirmation(envelope(bad), trip: trip, input: input) })
    }
    @Test func operationSupersededHasOnlyCurrentFields() throws {
        let input = command(); let applied = try NativeReservationWire.operation(envelope(operation(input)), trip: trip, input: input)
        #expect(!applied.superseded && applied.current.tripVersion == 4)
        let raw = operation(input, superseded: true)
        let replaced = try NativeReservationWire.operation(envelope(raw), trip: trip, input: input)
        #expect(replaced.superseded && replaced.current.fields.title == "Current replacement")
        var bad = raw; bad["command"] = input.object
        #expect(rejected { _ = try NativeReservationWire.operation(envelope(bad), trip: trip, input: input) })
        bad = raw; bad["appliedRevision"] = 3
        #expect(rejected { _ = try NativeReservationWire.operation(envelope(bad), trip: trip, input: input) })
        bad = raw; bad["receipt"] = current(input)
        #expect(rejected { _ = try NativeReservationWire.operation(envelope(bad), trip: trip, input: input) })
    }
    @Test func pageRequiresOrderedOwnedCursorAndMatchingConstraints() throws {
        let row = current(command()), valid = page(items: [row])
        #expect(try NativeReservationWire.page(envelope(valid), trip: trip, version: 3, after: nil).items.count == 1)
        #expect(rejected { _ = try NativeReservationWire.page(envelope(valid), trip: trip, version: 3, after: reference) })
        #expect(rejected { _ = try NativeReservationWire.page(envelope(page(items: [row, row])), trip: trip, version: 3, after: nil) })
        #expect(rejected { _ = try NativeReservationWire.page(envelope(page(items: [row], more: true, cursor: reference)), trip: trip, version: 3, after: nil) })
        var bad = valid; var constraints = bad["planningConstraints"] as! [[String: Any]]; constraints[0]["supplierVerified"] = true; bad["planningConstraints"] = constraints
        #expect(rejected { _ = try NativeReservationWire.page(envelope(bad), trip: trip, version: 3, after: nil) })
        bad = valid; bad["hasMore"] = 0
        #expect(rejected { _ = try NativeReservationWire.page(envelope(bad), trip: trip, version: 3, after: nil) })
        #expect(rejected { _ = try NativeReservationWire.page(envelope(valid), trip: trip, version: 4, after: nil) })
    }
    private func boot(_ store: NativeReservationStore, current: @escaping () -> NativeDataScope?, request: @escaping NativeReservationStore.Request) async {
        await store.loadTrips(current: current, request: request)
        if let first = store.trips.first { await store.select(first, current: current, request: request) }
    }
    private func initialResponse(_ path: String, _ body: Data?) throws -> Data? {
        if body == nil {
            let summary: [String: Any] = ["id": trip, "title": "Synthetic Trip", "headVersion": 3, "updatedAt": "2026-10-04T00:00:00Z"]
            return try path.hasSuffix(trip)
                ? bytes(["version": 2, "trip": summary, "content": ["days": []], "hardLocks": "not_enabled", "externalOrderStatus": "not_connected"])
                : bytes(["version": 2, "trips": [summary], "currentTripId": trip])
        }
        let raw = try JSONSerialization.jsonObject(with: body!) as! [String: Any]
        if raw["operation"] as? String == "read" { return try envelope(page()) }
        if raw["operation"] as? String == "preview" { return try envelope(preview(NativeReservationWire.command(raw["input"]!))) }
        return nil
    }
    @Test func persistenceFailureSendsZeroAndPreviewExpiryBlocksConfirm() async throws {
        let vault = ReservationTestVault(); var now = 0.0; let store = NativeReservationStore(vault: vault, uptime: { now })
        var confirms = 0
        let request: NativeReservationStore.Request = { path, _, body in
            if let bytes = try initialResponse(path, body) { return bytes }; confirms += 1; throw NativeDataError.server(code: "RESERVATION_RECEIPT_UNKNOWN")
        }
        await boot(store, current: { actor }, request: request)
        await store.makePreview(fields: fields, source: .init(), reference: nil, current: { actor }, request: request)
        #expect(store.canConfirm)
        now = 31; await store.confirm(current: { actor }, request: request); #expect(confirms == 0)
        now = 32; await store.makePreview(fields: fields, source: .init(), reference: nil, current: { actor }, request: request)
        vault.writeFailure = true
        await store.confirm(current: { actor }, request: request)
        #expect(confirms == 0 && store.pending == nil && !store.canConfirm)
    }
    @Test func lostAckReloadReadBeforeExactByteRetryAndNoNewOperation() async throws {
        let vault = ReservationTestVault(); let store = NativeReservationStore(vault: vault)
        var sent: [Data] = []; var order: [String] = []; var accept = false
        let request: NativeReservationStore.Request = { path, _, body in
            if let bytes = try initialResponse(path, body) { return bytes }
            let raw = try JSONSerialization.jsonObject(with: body!) as! [String: Any], operation = raw["operation"] as! String
            order.append(operation)
            if operation == "receipt" { throw NativeDataError.server(code: "RESERVATION_UNAVAILABLE") }
            sent.append(body!)
            if !accept { throw NativeDataError.server(code: "RESERVATION_RECEIPT_UNKNOWN") }
            return try envelope(ack(NativeReservationWire.command(raw["input"]!)))
        }
        await boot(store, current: { actor }, request: request)
        await store.makePreview(fields: fields, source: .init(), reference: nil, current: { actor }, request: request)
        await store.confirm(current: { actor }, request: request)
        let pending = try #require(store.pending)
        #expect(!store.canConfirm && sent.count == 1)
        await store.makePreview(fields: fields, source: .init(), reference: nil, current: { actor }, request: request)
        #expect(store.preview == nil)
        let reloaded = NativeReservationStore(vault: vault)
        await reloaded.loadTrips(current: { actor }, request: request)
        #expect(reloaded.pending?.body == pending.body)
        await reloaded.recover(retryOriginal: false, current: { actor }, request: request)
        #expect(sent.count == 1 && reloaded.pending != nil)
        accept = true
        await reloaded.recover(retryOriginal: true, current: { actor }, request: request)
        #expect(order == ["confirm", "receipt", "receipt", "confirm"] && sent.count == 2 && sent[0] == sent[1])
        let cleared = try NativeReservationJournalVault(vault: vault).read(actor)
        #expect(reloaded.pending == nil && cleared == nil)
    }
    @Test func supersededRecoveryNeverRetriesOldBodyAndCleanupFailureStaysFrozen() async throws {
        let vault = ReservationTestVault(); let journal = NativeReservationJournalVault(vault: vault)
        let saved = try journal.retain(command(), trip: trip, scope: actor)
        let store = NativeReservationStore(vault: vault); var sends = 0
        let request: NativeReservationStore.Request = { _, _, _ in sends += 1; return try envelope(operation(command(), superseded: true)) }
        vault.removeFailure = true
        await store.recover(retryOriginal: true, current: { actor }, request: request)
        #expect(store.pending?.body == saved.body && store.items.isEmpty && sends == 1)
        vault.removeFailure = false
        await store.recover(retryOriginal: true, current: { actor }, request: request)
        #expect(store.pending == nil && store.items.first?.fields.title == "Current replacement" && sends == 2)
        #expect(!store.pageCurrent && store.notice == "SUPERSEDED_RELOAD_CURRENT")
    }
    @Test func firstConflictCanCorrectButPriorUnknown409CannotClear() async throws {
        let vault = ReservationTestVault(); let store = NativeReservationStore(vault: vault)
        let request: NativeReservationStore.Request = { path, _, body in
            if let bytes = try initialResponse(path, body) { return bytes }; throw NativeDataError.server(code: "RESERVATION_CONFLICT")
        }
        await boot(store, current: { actor }, request: request)
        await store.makePreview(fields: fields, source: .init(), reference: nil, current: { actor }, request: request)
        await store.confirm(current: { actor }, request: request)
        #expect(store.pending == nil && store.notice == "RESERVATION_CONFLICT")
        let saved = try NativeReservationJournalVault(vault: vault).retain(command(), trip: trip, scope: actor)
        await store.recover(retryOriginal: true, current: { actor }, request: request)
        #expect(store.pending?.body == saved.body)
    }
    @Test func actorChangeLateReplyAndEpochNeverExposeOrResend() async throws {
        let vault = ReservationTestVault(); let store = NativeReservationStore(vault: vault)
        var live: NativeDataScope? = actor
        let changed = NativeDataScope(endpoint: actor.endpoint, subject: "55555555-5555-4555-8555-555555555555", mobileEpoch: 1, generation: 1)
        let request: NativeReservationStore.Request = { path, _, body in
            if let bytes = try initialResponse(path, body) { return bytes }
            let raw = try JSONSerialization.jsonObject(with: body!) as! [String: Any]
            live = changed
            return try envelope(ack(NativeReservationWire.command(raw["input"]!)))
        }
        await boot(store, current: { live }, request: request)
        await store.makePreview(fields: fields, source: .init(), reference: nil, current: { live }, request: request)
        await store.confirm(current: { live }, request: request)
        #expect(store.pending == nil && store.items.isEmpty && store.scope == changed)
        #expect(try NativeReservationJournalVault(vault: vault).read(actor) != nil)
        #expect(try NativeReservationJournalVault(vault: vault).read(changed) == nil)
        let replaced = NativeDataScope(endpoint: actor.endpoint, subject: actor.subject, mobileEpoch: 2, generation: 2)
        #expect(rejected { _ = try NativeReservationJournalVault(vault: vault).read(replaced) })
    }
    @Test func lostAckThen403KeepsOriginalJournalAndExplicitCleanupReportsFailure() async throws {
        let vault = ReservationTestVault(); let journal = NativeReservationJournalVault(vault: vault)
        let original = try journal.retain(command(), trip: trip, scope: actor)
        let store = NativeReservationStore(vault: vault)
        await store.recover(retryOriginal: true, current: { actor }) { _, _, _ in throw NativeDataError.server(code: "FORBIDDEN") }
        let retained = try journal.read(actor)
        #expect(store.pending?.body == original.body && store.items.isEmpty && retained == original)
        vault.removeFailure = true
        #expect(rejected { try NativeReservationJournalVault.remove(endpoint: actor.endpoint, owner: actor.subject, vault: vault) })
        #expect(try journal.read(actor) != nil)
        vault.removeFailure = false
        try NativeReservationJournalVault.remove(endpoint: actor.endpoint, owner: actor.subject, vault: vault)
        #expect(try journal.read(actor) == nil)
    }
}

@MainActor private final class ReservationTestVault: NativeCredentialVault {
    private var values: [String: Data] = [:]
    var writeFailure = false
    var removeFailure = false
    func write(_ data: Data, service: String, owner: String) -> OSStatus {
        if writeFailure { return errSecInteractionNotAllowed }; values[service + "/" + owner] = data; return errSecSuccess
    }
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        let value = values[service + "/" + owner]; return (value == nil ? errSecItemNotFound : errSecSuccess, value)
    }
    func remove(service: String, owner: String) -> OSStatus {
        if removeFailure { return errSecInteractionNotAllowed }; values.removeValue(forKey: service + "/" + owner); return errSecSuccess
    }
}

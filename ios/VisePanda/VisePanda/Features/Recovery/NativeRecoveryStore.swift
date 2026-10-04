import Foundation
import Observation

@MainActor
@Observable
final class NativeRecoveryStore {
    private(set) var scope: NativeDataScope?
    private(set) var detail: NativeTripDetail?
    private(set) var reservations: [NativeRecoveryReservation] = []
    private(set) var reservationComplete = false
    private(set) var preview: NativeRecoveryPreview?
    private(set) var outcome: NativeRecoveryOutcome?
    private(set) var pending: NativeRecoveryPending?
    private(set) var busy = false
    private(set) var notice: String?
    private(set) var readAttempted = false
    private var previewInput: NativeRecoveryPreparation?
    private var generation = UUID()
    private let journal: NativeRecoveryJournal
    init(journal: NativeRecoveryJournal = NativeRecoveryJournal()) { self.journal = journal }

    func bind(_ scope: NativeDataScope?) {
        guard self.scope != scope else { return }
        self.scope = scope; generation = UUID(); busy = false
        detail = nil; reservations = []; reservationComplete = false; preview = nil; previewInput = nil
        outcome = nil; pending = nil; readAttempted = false; notice = nil
    }
    func suspend() {
        generation = UUID(); busy = false; detail = nil; reservations = []; reservationComplete = false
        preview = nil; previewInput = nil; outcome = nil; readAttempted = false
    }
    func clearPreview() { preview = nil; previewInput = nil }
    private func current(_ actor: NativeDataScope, _ token: UUID, _ get: () -> NativeDataScope?) -> Bool {
        actor == scope && get() == actor && token == generation && !Task.isCancelled
    }
    private func hideDenied(_ error: Error) {
        if case NativeDataError.server(let code) = error, ["FORBIDDEN", "UNAUTHENTICATED", "SESSION_REPLACED"].contains(code) {
            detail = nil; reservations = []; reservationComplete = false; clearPreview(); outcome = nil
        }
    }

    func refresh(tripID: String, current get: () -> NativeDataScope?,
                 request: (String, String, Data?) async throws -> Data) async {
        guard !busy, let actor = scope, get() == actor else { return }
        let token = generation; busy = true; detail = nil; preview = nil; previewInput = nil; outcome = nil
        reservations = []; reservationComplete = false
        defer { if token == generation { busy = false } }
        do {
            pending = try journal.read(scope: actor)
            if let pending, pending.tripID != tripID { notice = "OTHER_TRIP_OPERATION_PENDING"; return }
            let bytes = try await request("api/trips/native/v2/\(tripID)", "GET", nil)
            guard current(actor, token, get) else { return }
            guard bytes.count <= 512000 else { throw NativeDataError.invalidResponse }
            let detail = try JSONDecoder().decode(NativeTripDetail.self, from: bytes)
            guard detail.trip.id == tripID, detail.confirmationState == "confirmed",
                  (0...999999999).contains(detail.trip.headVersion), detail.content.days.flatMap(\.items).count <= 500
            else { throw NativeDataError.invalidResponse }
            self.detail = detail; notice = pending == nil ? nil : "RECOVERY_RECEIPT_UNKNOWN"
            // Read installed ordinary #214 capability. A 404/missing reader stays pending.
            var cursor: String?; var refs: [NativeRecoveryReservation] = []
            for _ in 0..<5 {
                let body = try NativeRecoveryWire.encode(["operation": "read", "expectedTripVersion": detail.trip.headVersion,
                                                        "afterReferenceId": cursor as Any? ?? NSNull(), "limit": 20])
                let bytes = try await request("api/trips/native/v2/\(tripID)/reservations", "POST", body)
                guard current(actor, token, get) else { return }
                let page = try Self.reservationPage(bytes, tripID: tripID, version: detail.trip.headVersion, after: cursor)
                refs += page.items
                if !page.more { reservationComplete = true; break }; cursor = page.cursor
            }
            guard current(actor, token, get) else { return }
            guard reservationComplete else { throw NativeDataError.server(code: "RESERVATION_SCOPE_INCOMPLETE") }
            reservations = refs
            if refs.contains(where: { $0.status == "unknown" }) { notice = "RESERVATION_STATUS_UNKNOWN" }
        } catch {
            guard current(actor, token, get) else { return }
            hideDenied(error)
            reservations = []; reservationComplete = false
            notice = detail == nil ? "CURRENT_TRIP_UNAVAILABLE" : "RESERVATION_READER_PENDING"
        }
    }

    func prepare(input: NativeRecoveryInput, current get: () -> NativeDataScope?,
                 post: (Data) async throws -> Data) async {
        await prepare(input: .report(input), current: get, post: post)
    }
    func prepare(input: NativeRecoveryPreparation, current get: () -> NativeDataScope?,
                 post: (Data) async throws -> Data) async {
        guard !busy, pending == nil, let actor = scope, get() == actor, let detail else { return }
        let token = generation; busy = true; preview = nil; outcome = nil; readAttempted = false
        defer { if token == generation { busy = false } }
        do {
            let record = NativeRecoveryPending(scope: actor, tripID: detail.trip.id, baseVersion: input.expectedHeadVersion,
                                               operationID: input.operationId, stage: input.stage, body: try input.body())
            try journal.save(record, scope: actor); pending = record
            let bytes = try await post(record.body)
            guard current(actor, token, get) else { return }
            try installPreview(bytes, record: record, detail: detail, actor: actor)
        } catch { if current(actor, token, get) { hideDenied(error); preview = nil; notice = pending == nil ? "JOURNAL_UNAVAILABLE" : "RECOVERY_RECEIPT_UNKNOWN" } }
    }
    private func installPreview(_ bytes: Data, record: NativeRecoveryPending, detail: NativeTripDetail, actor: NativeDataScope) throws {
        let input = try record.preparation()
        let value = try NativeRecoveryPreview.decode(bytes, preparation: input)
        try value.validate(input: input, detail: detail, now: Date())
        try journal.remove(record, scope: actor); pending = nil; readAttempted = false
        preview = value; previewInput = input; notice = value.reason
    }
    func visiblePreview(current: NativeDataScope?, foreground: Bool, now: Date) -> NativeRecoveryPreview? {
        guard current != nil, current == scope, foreground, let preview else { return nil }
        if preview.status == "candidates", preview.expiresAt.flatMap(NativeRecoveryWire.date).map({ $0 > now }) != true { return nil }
        return preview
    }
    func select(candidateID: String, current get: () -> NativeDataScope?, post: (Data) async throws -> Data) async {
        guard !busy, pending == nil, let actor = scope, get() == actor,
              let preview = visiblePreview(current: actor, foreground: true, now: Date()), let input = previewInput,
              let detail, let contextID = preview.contextId, let digest = preview.contextDigest,
              let candidate = preview.candidates.first(where: { $0.id == candidateID }) else { return }
        let token = generation; busy = true; outcome = nil; readAttempted = false
        defer { if token == generation { busy = false } }
        do {
            try preview.validate(input: input, detail: detail, now: Date())
            let selection = NativeRecoverySelection(operationId: UUID().uuidString.lowercased(), contextId: contextID,
                                                   contextDigest: digest, candidateId: candidateID)
            let record = NativeRecoveryPending(scope: actor, tripID: detail.trip.id, baseVersion: preview.baseVersion,
                                               operationID: selection.operationId, stage: "select", body: try selection.body(), expectedPatch: candidate.patch, transportReference: input.transportReference)
            try journal.save(record, scope: actor); pending = record; self.preview = nil; previewInput = nil
            let bytes = try await post(record.body)
            guard current(actor, token, get) else { return }; try installOutcome(bytes, record: record)
        } catch { if current(actor, token, get) { hideDenied(error); outcome = nil; notice = pending == nil ? "JOURNAL_UNAVAILABLE" : "RECOVERY_RECEIPT_UNKNOWN" } }
    }
    private func installOutcome(_ bytes: Data, record: NativeRecoveryPending) throws {
        guard let scope else { throw NativeDataError.sessionUnavailable }
        let value = try NativeRecoveryWire.decode(NativeRecoveryOutcome.self, NativeRecoveryWire.root(bytes))
        try value.validate(pending: record, now: Date())
        pending = try journal.acknowledge(record, outcome: value, scope: scope)
        outcome = value; notice = nil
    }
    func recover(current get: () -> NativeDataScope?, post: (Data) async throws -> Data) async {
        guard !busy, let actor = scope, get() == actor, let pending else { return }
        let token = generation; busy = true; outcome = nil
        defer { if token == generation { busy = false } }
        do {
            guard try journal.read(scope: actor) == pending else { throw NativeDataError.sessionUnavailable }
            let bytes = try await post(NativeRecoveryWire.encode(["operation": "receipt", "operationId": pending.operationID]))
            guard current(actor, token, get) else { return }
            readAttempted = true
            if pending.stage == "select" { try installOutcome(bytes, record: pending) }
            else { notice = "PREPARATION_ACK_UNKNOWN" }
        } catch {
            if current(actor, token, get) {
                hideDenied(error); readAttempted = true; notice = "RECOVERY_RECEIPT_UNKNOWN"
            }
        }
    }
    /// Called only by the separate explicit replay action. Failed reads NEVER authorize it.
    /// Fresh actual session verification, original journal readback and another read attempt
    /// precede replay. Unknown remains unknown; idempotence comes from the original SQL command.
    func replayOriginal(current get: () -> NativeDataScope?, verify: () async throws -> NativeDataScope?,
                        post: (Data) async throws -> Data) async {
        guard !busy, outcome == nil, let actor = scope, get() == actor, let pending else { return }
        let token = generation; busy = true; readAttempted = false
        defer { if token == generation { busy = false } }
        do {
            guard try await verify() == actor, current(actor, token, get) else { return }
            guard try journal.read(scope: actor) == pending else { throw NativeDataError.sessionUnavailable }
            do {
                let read = try await post(NativeRecoveryWire.encode(["operation": "receipt", "operationId": pending.operationID]))
                guard current(actor, token, get) else { return }; readAttempted = true
                if pending.stage == "select" { try installOutcome(read, record: pending); return }
                // The installed operation reader cannot prove the state of a preparation.
                throw NativeDataError.invalidResponse
            } catch {
                guard current(actor, token, get) else { return }; readAttempted = true
                hideDenied(error)
                let unknown: Bool
                if case NativeDataError.server(let code) = error {
                    unknown = ["RECOVERY_RECEIPT_UNKNOWN", "RECOVERY_UNAVAILABLE"].contains(code)
                } else { unknown = error is URLError }
                guard unknown else { notice = "RECOVERY_RECEIPT_UNKNOWN"; return }
            }
            guard current(actor, token, get), try journal.read(scope: actor) == pending else { return }
            let bytes = try await post(pending.body)
            guard current(actor, token, get) else { return }
            if pending.stage == "select" { try installOutcome(bytes, record: pending) }
            else if let detail { try installPreview(bytes, record: pending, detail: detail, actor: actor) }
            else { throw NativeDataError.invalidResponse }
        } catch { if current(actor, token, get) { hideDenied(error); notice = "RECOVERY_RECEIPT_UNKNOWN" } }
    }
    func finishTerminal(current: NativeDataScope?) throws {
        guard !busy, let current, current == scope, let pending, let outcome,
              ["applied", "rejected", "expired", "stale"].contains(outcome.operation.state)
        else { throw NativeDataError.invalidResponse }
        try journal.remove(pending, scope: current); self.pending = nil; self.outcome = nil; readAttempted = false
        clearPreview(); notice = nil
    }
    var reviewReference: String? {
        guard let outcome, outcome.operation.state == "pending",
              NativeRecoveryWire.date(outcome.operation.receipt.expiresAt).map({ $0 > Date() }) == true else { return nil }
        return outcome.proposalReference
    }

    private static func reservationPage(_ data: Data, tripID: String, version: Int, after: String?) throws
    -> (items: [NativeRecoveryReservation], more: Bool, cursor: String?) {
        let page = try NativeRecoveryWire.root(data)
        _ = try NativeRecoveryWire.exact(page, ["kind", "tripId", "tripVersion", "items", "hasMore", "nextCursor", "planningConstraints"])
        guard page["kind"] as? String == "reservation_references/1", page["tripId"] as? String == tripID,
              NativeRecoveryWire.integer(page["tripVersion"]) == version,
              let rows = page["items"] as? [[String: Any]], rows.count <= 20,
              let more = NativeRecoveryWire.boolean(page["hasMore"]) else { throw NativeDataError.invalidResponse }
        var previous = after; var items: [NativeRecoveryReservation] = []
        for row in rows {
            guard row["kind"] as? String == "reservation_reference/1", row["tripId"] as? String == tripID,
                  NativeRecoveryWire.integer(row["tripVersion"]) == version, let id = row["referenceId"] as? String,
                  NativeRecoveryWire.uuid(id), previous == nil || id > previous!,
                  let revision = NativeRecoveryWire.integer(row["revision"]), revision > 0,
                  row["evidenceTier"] as? String == "user_reported", row["sourceQualification"] as? String == "untrusted",
                  row["confirmedBy"] as? String == "explicit_user", row["tripMutation"] as? String == "none",
                  let fields = row["fields"] as? [String: Any], let title = fields["title"] as? String, title.utf16.count <= 160,
                  let status = fields["status"] as? String, ["reserved", "amended", "cancelled", "unknown"].contains(status)
            else { throw NativeDataError.invalidResponse }
            items.append(.init(id: id, revision: revision, title: title, status: status, evidenceTier: "user_reported",
                               startsAt: fields["startsAt"] as? String, endsAt: fields["endsAt"] as? String)); previous = id
        }
        let cursor = page["nextCursor"] as? String
        guard more ? rows.count == 20 && cursor == previous && cursor != nil : page["nextCursor"] is NSNull
        else { throw NativeDataError.invalidResponse }
        return (items, more, cursor)
    }
}

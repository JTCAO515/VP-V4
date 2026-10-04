import Foundation
import Observation

@MainActor @Observable final class NativeReservationStore {
    typealias Request = (_ path: String, _ method: String, _ body: Data?) async throws -> Data
    private(set) var scope: NativeDataScope?
    private(set) var trips: [NativeTripSummary] = []
    private(set) var selected: NativeTripSummary?
    private(set) var items: [NativeReservationCurrent] = []
    private(set) var nextCursor: String?
    private(set) var pageLoaded = false
    private(set) var preview: NativeReservationPreview?
    private(set) var previewCommand: NativeReservationCommand?
    private(set) var pending: NativeReservationJournal?
    private(set) var busy = false
    private(set) var notice: String?
    private(set) var recoveryChecked = false
    private var generation = UUID()
    private var previewDeadline: TimeInterval = 0
    private var pageDeadline: TimeInterval = 0
    private let uptime: () -> TimeInterval
    private let journal: NativeReservationJournalVault
    private let base = "api/trips/native/v2"
    init(vault: any NativeCredentialVault = NativeKeychainVault(), uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        journal = .init(vault: vault); self.uptime = uptime
    }
    var canConfirm: Bool {
        pending == nil && recoveryChecked && !busy && preview != nil && previewCommand != nil
        && preview?.relation != "conflict" && uptime() < previewDeadline
        && preview?.matches.allSatisfy({ $0.referenceId == previewCommand?.referenceId }) == true
    }
    var pageCurrent: Bool { pageLoaded && uptime() < pageDeadline }
    func invalidatePreview() { preview = nil; previewCommand = nil; previewDeadline = 0 }
    func hide() { generation = UUID(); trips = []; selected = nil; items = []; nextCursor = nil; pageLoaded = false; pending = nil; recoveryChecked = false; notice = nil; busy = false; invalidatePreview() }
    func reset(_ value: NativeDataScope?) { guard scope != value else { return }; hide(); scope = value }
    private func check(_ actor: NativeDataScope, _ own: UUID, _ current: () -> NativeDataScope?) throws {
        guard actor == scope, actor == current(), generation == own, !Task.isCancelled else { throw NativeDataError.staleSessionResponse }
    }
    private func run(current: @escaping () -> NativeDataScope?, action: (NativeDataScope, UUID) async throws -> Void) async {
        reset(current()); guard let actor = scope, !busy else { return }
        let own = generation; busy = true; notice = nil
        defer { if own == generation { busy = false } }
        do { try await action(actor, own) }
        catch {
            guard own == generation, current() == actor else { reset(current()); return }
            // No status alone clears a possibly applied operation.
            switch error {
            case NativeDataError.server(let code): notice = code
            case NativeDataError.sessionUnavailable: notice = "STORAGE_OR_SESSION_UNAVAILABLE"
            default: notice = pending == nil ? "RESERVATION_UNAVAILABLE" : "RESERVATION_RECEIPT_UNKNOWN"
            }
        }
    }
    func loadTrips(current: @escaping () -> NativeDataScope?, request: @escaping Request) async {
        await run(current: current) { actor, own in
            self.trips = []; self.selected = nil; self.items = []; self.pageLoaded = false; self.invalidatePreview()
            self.recoveryChecked = false
            self.pending = try self.journal.read(actor); self.recoveryChecked = true
            let bytes = try await request(self.base, "GET", nil)
            try self.check(actor, own, current)
            guard bytes.count <= 512000 else { throw NativeDataError.invalidResponse }
            let list = try JSONDecoder().decode(NativeTripList.self, from: bytes)
            guard list.version == 2, list.trips.allSatisfy({ NativeReservationWire.uuid($0.id) && (0...999999999).contains($0.headVersion) }),
                  Set(list.trips.map(\.id)).count == list.trips.count else { throw NativeDataError.invalidResponse }
            self.trips = list.trips
            // Missing from a bounded Trip list is not deletion proof; retain the journal.
            if let pending = self.pending { self.selected = list.trips.first { $0.id == pending.tripId } }
        }
    }
    func select(_ trip: NativeTripSummary, current: @escaping () -> NativeDataScope?, request: @escaping Request) async {
        guard pending == nil || pending?.tripId == trip.id else { notice = "RESOLVE_ORIGINAL_OPERATION"; return }
        await run(current: current) { actor, own in
            self.selected = nil; self.items = []; self.nextCursor = nil; self.pageLoaded = false; self.invalidatePreview()
            let bytes = try await request(self.base + "/" + trip.id, "GET", nil)
            try self.check(actor, own, current)
            guard bytes.count <= 512000 else { throw NativeDataError.invalidResponse }
            let detail = try JSONDecoder().decode(NativeTripDetail.self, from: bytes)
            guard detail.version == 2, detail.trip.id == trip.id, (0...999999999).contains(detail.trip.headVersion) else { throw NativeDataError.invalidResponse }
            self.selected = detail.trip
            try await self.loadPage(after: nil, trip: detail.trip, actor: actor, own: own, current: current, request: request)
        }
    }
    private func loadPage(after: String?, trip: NativeTripSummary, actor: NativeDataScope, own: UUID,
                          current: () -> NativeDataScope?, request: Request) async throws {
        self.pageLoaded = false; self.items = []; self.nextCursor = nil
        let started = uptime()
        let body = try NativeReservationWire.encode(["operation": "read", "expectedTripVersion": trip.headVersion,
                                                     "afterReferenceId": after as Any? ?? NSNull(), "limit": 20])
        let bytes = try await request(base + "/" + trip.id + "/reservations", "POST", body)
        try check(actor, own, current)
        guard uptime() - started < 30 else { throw NativeDataError.invalidResponse }
        let page = try NativeReservationWire.page(bytes, trip: trip.id, version: trip.headVersion, after: after)
        items = page.items; nextCursor = page.next; pageLoaded = true; pageDeadline = started + 30
    }
    func next(current: @escaping () -> NativeDataScope?, request: @escaping Request) async {
        guard pageCurrent, let nextCursor, let trip = selected else { return }
        invalidatePreview()
        await run(current: current) { actor, own in try await self.loadPage(after: nextCursor, trip: trip, actor: actor, own: own, current: current, request: request) }
    }
    func makePreview(fields: NativeReservationFields, source: NativeReservationSource, reference: NativeReservationTarget?,
                     current: @escaping () -> NativeDataScope?, request: @escaping Request) async {
        guard pending == nil, recoveryChecked, let trip = selected else { return }
        invalidatePreview()
        await run(current: current) { actor, own in
            let command = NativeReservationCommand(operationId: UUID().uuidString.lowercased(), referenceId: reference?.referenceId ?? UUID().uuidString.lowercased(),
                expectedTripVersion: trip.headVersion, expectedRevision: reference?.revision ?? 0, fields: fields, source: source, explicitlyConfirmed: true)
            let body = try command.body(operation: "preview"), started = self.uptime()
            let bytes = try await request(self.base + "/" + trip.id + "/reservations", "POST", body)
            try self.check(actor, own, current)
            guard self.uptime() - started < 30 else { throw NativeDataError.invalidResponse }
            self.preview = try NativeReservationWire.preview(bytes, trip: trip.id, command: command)
            self.previewCommand = command; self.previewDeadline = started + 30
        }
    }
    func confirm(current: @escaping () -> NativeDataScope?, request: @escaping Request) async {
        guard canConfirm, let command = previewCommand, let trip = selected else { return }
        await run(current: current) { actor, own in
            try self.check(actor, own, current)
            self.recoveryChecked = false
            defer { self.invalidatePreview() }
            self.pending = try self.journal.retain(command, trip: trip.id, scope: actor)
            self.recoveryChecked = true
            self.invalidatePreview()
            guard let pending = self.pending else { throw NativeDataError.invalidResponse }
            try await self.dispatch(pending, firstSend: true, actor: actor, own: own, current: current, request: request)
        }
    }
    private func dispatch(_ pending: NativeReservationJournal, firstSend: Bool = false, actor: NativeDataScope, own: UUID,
                          current: () -> NativeDataScope?, request: Request) async throws {
        try check(actor, own, current)
        guard try journal.read(actor) == pending else { throw NativeDataError.sessionUnavailable }
        let command = try pending.command()
        let bytes: Data
        do { bytes = try await request(base + "/" + pending.tripId + "/reservations", "POST", pending.body) }
        catch {
            try check(actor, own, current)
            if case NativeDataError.server(let code) = error {
                if code == "FORBIDDEN" {
                    // A lost ACK followed by loss of Trip access proves no rollback.
                    // Hide personal projections, retain the original operation until recovery or explicit sign-out cleanup.
                    items = []; selected = nil; pageLoaded = false
                } else if firstSend, ["RESERVATION_CONFLICT", "STALE_TRIP_VERSION", "INVALID_INPUT", "RESERVATION_SOURCE_UNAVAILABLE"].contains(code) {
                    // A first dispatch's explicit pre-write denial is not a lost ACK.
                    // Retried unknown operations never take this branch.
                    let rejected = try journal.recordRejection(pending, code: code, scope: actor); self.pending = rejected
                    try journal.complete(rejected, scope: actor); self.pending = nil
                }
            }
            throw error
        }
        try check(actor, own, current)
        let receipt = try NativeReservationWire.confirmation(bytes, trip: pending.tripId, input: command)
        try journal.complete(pending, scope: actor)
        self.pending = nil; recoveryChecked = true; items = [receipt]; pageLoaded = false
        notice = "CONFIRMED_RELOAD_REQUIRED"
    }
    func recover(retryOriginal: Bool, current: @escaping () -> NativeDataScope?, request: @escaping Request) async {
        await run(current: current) { actor, own in
            let saved = try self.journal.read(actor); self.pending = saved; self.recoveryChecked = true
            guard let saved else { return }
            if let rejected = saved.rejectionCode {
                try self.journal.complete(saved, scope: actor); self.pending = nil; self.notice = rejected; return
            }
            let command = try saved.command()
            let body = try NativeReservationWire.encode(["operation": "receipt", "operationId": command.operationId])
            do {
                let bytes = try await request(self.base + "/" + saved.tripId + "/reservations", "POST", body)
                try self.check(actor, own, current)
                let result = try NativeReservationWire.operation(bytes, trip: saved.tripId, input: command)
                try self.journal.complete(saved, scope: actor)
                self.pending = nil; self.items = [result.current]; self.pageLoaded = false; self.invalidatePreview()
                self.notice = result.superseded ? "SUPERSEDED_RELOAD_CURRENT" : "CONFIRMED_RELOAD_REQUIRED"
            } catch {
                try self.check(actor, own, current)
                if case NativeDataError.server(let code) = error, code == "FORBIDDEN" {
                    self.items = []; self.selected = nil; self.pageLoaded = false; self.invalidatePreview()
                    self.notice = "FORBIDDEN"; return
                }
                // Only the actual unavailable operation response permits explicit original-body retry.
                // Auth, malformed ACK, storage, CAS and transport failures remain frozen.
                guard retryOriginal, case NativeDataError.server(let code) = error,
                      code == "RESERVATION_UNAVAILABLE" else { throw error }
                try await self.dispatch(saved, actor: actor, own: own, current: current, request: request)
            }
        }
    }
}

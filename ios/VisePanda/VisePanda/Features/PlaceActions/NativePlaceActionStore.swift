import Foundation
import Observation

@MainActor @Observable final class NativePlaceActionStore {
    var journalObservation: NativeJournalDataObservation?

    private(set) var context: NativePlaceActionContext?
    private(set) var receipt: NativePlaceActionReceipt?
    private(set) var pending: NativePlaceActionPending?
    private(set) var scope: NativeDataScope?
    private(set) var busy = false
    private(set) var notice: String?
    private(set) var receiptAbsent = false
    private(set) var cancelled: NativePlaceActionCancelled?
    private var generation = UUID()
    private var deadline: TimeInterval = 0
    private(set) var rememberedSaved: (target: NativePlaceActionSelection, saved: NativePlaceActionContext.Saved)?
    private let uptime: () -> TimeInterval
    init(uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) { self.uptime = uptime }
    func clear() { generation = UUID(); context = nil; receipt = nil; pending = nil; scope = nil; deadline = 0; busy = false; notice = nil; receiptAbsent = false; rememberedSaved = nil; cancelled = nil }
    func invalidateContext() { generation = UUID(); context = nil; deadline = 0; busy = false }
    func visible(_ target: NativePlaceActionSelection?, now: Date = Date()) -> NativePlaceActionContext? {
        guard let target, let context, target.scope == scope, context.selection == target.place,
              target.tripId == context.tripId, target.baseVersion == context.tripVersion,
              uptime() < deadline, now < context.expiresAt else { return nil }; return context
    }
    func restore(scope: NativeDataScope, read: () throws -> NativePlaceActionPending?) {
        if self.scope != scope { clear() } else { invalidateContext(); notice = nil; receiptAbsent = false }
        self.scope = scope
        do { pending = try read(); if pending != nil { notice = "PLACE_ACTION_RECOVERY_REQUIRED" } }
        catch { notice = "PLACE_ACTION_STORAGE_UNAVAILABLE" }
    }
    func load(target: NativePlaceActionSelection, locale: String, current: () -> NativePlaceActionSelection?, request: (Data) async throws -> Data) async {
        guard !busy, target.valid, current() == target, scope == target.scope else { return }
        invalidateContext(); notice = nil
        let own = generation, started = uptime(); busy = true
        defer { if generation == own { busy = false } }
        do {
            let body = try NativePlaceActionWire.bytes(["action": "context", "expectedTripVersion": target.baseVersion, "selection": NativePlaceActionWire.place(target.place), "locale": locale])
            let bytes = try await request(body)
            guard own == generation, current() == target, !Task.isCancelled else { return }
            guard uptime() - started < 30 else { throw NativeDataError.invalidResponse }
            context = try NativePlaceActionContext.decode(bytes, expected: target); deadline = started + 30
            if let saved = context?.saved, saved.status == "saved" { rememberedSaved = (target, saved) }
            else { rememberedSaved = nil }
        } catch { if own == generation { context = nil; deadline = 0; notice = Self.code(error) } }
    }
    func command(target: NativePlaceActionSelection, action: String, dayId: String? = nil, startsAt: Date? = nil, endsAt: Date? = nil, locale: String) throws -> NativePlaceActionCommand {
        guard pending == nil, !busy, let context = visible(target) else { throw NativeDataError.server(code: "PLACE_ACTION_RECHECK_REQUIRED") }
        var value: [String: Any] = ["action": action, "operationId": UUID().uuidString.lowercased(), "expectedTripVersion": target.baseVersion,
                                    "selection": NativePlaceActionWire.place(target.place), "expectedMappingDigest": context.mappingDigest]
        if action == "save" { value["expectedSaveRevision"] = context.saved?.revision ?? 0 }
        else if action == "unsave" {
            guard let saved = context.saved, saved.status == "saved" else { throw NativeDataError.invalidResponse }
            value["referenceId"] = saved.referenceId; value["expectedSaveRevision"] = saved.revision; value["expectedMappingDigest"] = saved.mappingDigest
        } else if action == "add" {
            guard let dayId, context.days.contains(where: { $0.id == dayId }), let startsAt, let endsAt else { throw NativeDataError.invalidResponse }
            value["dayId"] = dayId; value["itemId"] = UUID().uuidString.lowercased()
            value["startsAt"] = ISO8601DateFormatter().string(from: startsAt); value["endsAt"] = ISO8601DateFormatter().string(from: endsAt); value["locale"] = locale
        } else { throw NativeDataError.invalidResponse }
        let command = NativePlaceActionCommand(tripId: target.tripId, body: try NativePlaceActionWire.bytes(value)); try command.validate(); return command
    }
    func rememberSaved(_ row: NativeSavedPlaceRow, target: NativePlaceActionSelection) {
        guard scope == target.scope, target.valid, target.place == row.selection else { return }
        rememberedSaved = (target, .init(referenceId: row.referenceId, revision: row.revision, status: "saved", mappingDigest: row.mappingDigest))
    }
    func forgetRemembered(scope: NativeDataScope) throws -> NativePlaceActionCommand {
        guard self.scope == scope, pending == nil, !busy, let rememberedSaved, rememberedSaved.target.scope == scope else { throw NativeDataError.invalidResponse }
        let target = rememberedSaved.target, saved = rememberedSaved.saved
        return .init(tripId: target.tripId, body: try NativePlaceActionWire.bytes(["action": "unsave", "operationId": UUID().uuidString.lowercased(),
                     "expectedTripVersion": target.baseVersion, "selection": NativePlaceActionWire.place(target.place), "expectedMappingDigest": saved.mappingDigest,
                     "referenceId": saved.referenceId, "expectedSaveRevision": saved.revision]))
    }
    func forgetCommand(from receipt: NativePlaceActionReceipt, scope: NativeDataScope) throws -> NativePlaceActionCommand {
        guard self.scope == scope, pending == nil, !busy, receipt.savedStatus == "saved", let revision = receipt.savedRevision else { throw NativeDataError.invalidResponse }
        let body = try NativePlaceActionWire.bytes(["action": "unsave", "operationId": UUID().uuidString.lowercased(), "expectedTripVersion": receipt.tripVersion,
                                                   "selection": NativePlaceActionWire.place(receipt.place), "expectedMappingDigest": receipt.mappingDigest,
                                                   "referenceId": receipt.referenceId, "expectedSaveRevision": revision])
        return .init(tripId: receipt.tripId, body: body)
    }
    func perform(command: NativePlaceActionCommand?, scope: NativeDataScope, recover: Bool, retryOriginal: Bool = false, abandon: Bool = false,
                 current: () -> NativeDataScope?, read: () throws -> NativePlaceActionPending?,
                 retain: (NativePlaceActionCommand) throws -> NativePlaceActionPending,
                 complete: (NativePlaceActionPending) throws -> Void, request: (String, Data) async throws -> Data) async {
        guard !busy, current() == scope, self.scope == scope else { return }
        let own = generation; busy = true; notice = nil
        defer { if generation == own { busy = false } }
        do {
            let value: NativePlaceActionPending
            if recover {
                guard let original = try read() else { throw NativeDataError.invalidResponse }; value = original
                guard !retryOriginal || receiptAbsent && pending == original else { throw NativeDataError.invalidResponse }
            } else {
                guard pending == nil, let command else { throw NativeDataError.invalidResponse }
                value = try retain(command) // Durable exact bytes before the first write request.
            }
            pending = value; receiptAbsent = false
            let body: Data
            if abandon { body = try NativePlaceActionWire.bytes(["action": "abandon", "request": value.command.object]) }
            else { body = try recover && !retryOriginal ? value.command.recoveryBody() : value.command.body }
            let bytes = try await request(value.command.tripId, body)
            guard own == generation, current() == scope, !Task.isCancelled else { return }
            if let cancelled = try NativePlaceActionCancelled.decode(bytes, pending: value) {
                let journalTicket = journalObservation?.begin()
                try complete(value); pending = nil; receipt = nil; self.cancelled = cancelled; receiptAbsent = false
                journalObservation?.finish(journalTicket, try value.command.operationId)
                context = nil; deadline = 0; notice = "PLACE_ACTION_CANCELLED"; return
            }
            guard let result = try NativePlaceActionReceipt.decode(bytes, pending: value) else { receiptAbsent = true; notice = "PLACE_ACTION_RECEIPT_ABSENT"; return }
            let journalTicket = journalObservation?.begin()
            try complete(value); pending = nil; receipt = result; cancelled = nil; if result.action == "unsave" { rememberedSaved = nil }; context = nil; deadline = 0
            journalObservation?.finish(journalTicket, try value.command.operationId)
            notice = "PLACE_ACTION_RELOAD_REQUIRED"
        } catch { if own == generation, current() == scope { notice = Self.code(error) } }
    }
    func ask(target: NativePlaceActionSelection, locale: String, current: () -> NativePlaceActionSelection?, request: (Data) async throws -> Data) async -> NativeExploreAskHandoff? {
        guard !busy, pending == nil, let basis = visible(target) else { return nil }
        let own = generation, started = uptime(); busy = true
        defer { if own == generation { busy = false } }
        do {
            let body = try NativePlaceActionWire.bytes(["action": "ask", "expectedTripVersion": target.baseVersion, "selection": NativePlaceActionWire.place(target.place), "expectedMappingDigest": basis.mappingDigest, "locale": locale])
            let bytes = try await request(body)
            guard own == generation, current() == target, !Task.isCancelled, uptime() - started < 30, visible(target) != nil else { return nil }
            let value = try NativePlaceActionWire.object(bytes)
            _ = try NativePlaceActionWire.exact(value, ["kind", "tripId", "tripVersion", "selection", "mappingDigest", "contextDigest", "referenceId", "selectedSources", "currentInput", "readyForProvider", "purpose", "expiresAt", "handoff"])
            guard value["kind"] as? String == "place_ask_context", value["tripId"] as? String == target.tripId,
                  NativePlaceActionWire.integer(value["tripVersion"]) == target.baseVersion,
                  try NativePlaceActionWire.selection(value["selection"] as Any) == target.place,
                  value["mappingDigest"] as? String == basis.mappingDigest, value["contextDigest"] as? String == basis.contextDigest,
                  (value["referenceId"] is NSNull || NativePlaceActionWire.id(value["referenceId"]) != nil), NativePlaceActionWire.boolean(value["readyForProvider"]) == false,
                  value["purpose"] as? String == "first_party_reference_only",
                  let expires = (value["expiresAt"] as? String).flatMap(NativeKnowledgeRead.date), expires > Date(), expires.timeIntervalSinceNow <= 30 else { throw NativeDataError.invalidResponse }
            if !(value["handoff"] is NSNull) {
                let handoff = try NativePlaceActionWire.exact(value["handoff"] as Any, ["kind", "href", "poiId", "readiness"])
                guard handoff["kind"] as? String == "ask_ready", handoff["poiId"] as? String == target.place.canonicalPoiId,
                      handoff["readiness"] as? String == "recheck_required", value["referenceId"] is String else { throw NativeDataError.invalidResponse }
            }
            let input = try NativePlaceActionWire.selection(value["currentInput"] as Any)
            let sources = try NativePlaceActionWire.exact(value["selectedSources"] as Any, ["artifact", "trip", "evidence"])
            let trip = try NativePlaceActionWire.exact(sources["trip"] as Any, ["tripId", "headVersion"])
            guard input == target.place, sources["artifact"] is NSNull, (sources["evidence"] as? [Any])?.isEmpty == true,
                  trip["tripId"] as? String == target.tripId, NativePlaceActionWire.integer(trip["headVersion"]) == target.baseVersion else { throw NativeDataError.invalidResponse }
            return .init(scope: target.scope, tripID: target.tripId, tripVersion: target.baseVersion, poiID: target.place.canonicalPoiId,
                         provider: target.place.provider, providerPoiID: target.place.providerPoiId, name: basis.title)
        } catch { if own == generation { notice = Self.code(error) }; return nil }
    }
    func fail(_ error: Error) { notice = Self.code(error) }
    private static func code(_ error: Error) -> String {
        if case NativeDataError.server(let code) = error, ["INVALID_INPUT", "UNAUTHENTICATED", "FORBIDDEN", "STALE_TRIP_VERSION", "MAPPING_CHANGED", "CAS_CONFLICT", "IDEMPOTENCY_KEY_REUSE", "PLACE_ACTION_UNAVAILABLE", "PLACE_ACTION_RECOVERY_REQUIRED"].contains(code) { return code }
        return "PLACE_ACTION_UNAVAILABLE"
    }
}

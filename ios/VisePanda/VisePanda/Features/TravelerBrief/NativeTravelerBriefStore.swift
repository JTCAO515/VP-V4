import Foundation
import Observation

@MainActor @Observable final class NativeTravelerBriefStore {
    var journalObservation: NativeJournalDataObservation?

    private(set) var scope: NativeDataScope?
    private(set) var preview: NativeTravelerBriefSnapshot?
    private(set) var brief: NativeTravelerBriefSnapshot?
    private(set) var options: NativeTravelerBriefSources?
    private(set) var audit: NativeTravelerBriefAudit?
    private(set) var auditUnavailable = false
    private(set) var ownerState: NativeTravelerBriefOwnerState?
    private(set) var selection: NativeTravelerBriefSelection?
    private(set) var pending: NativeTravelerBriefPending?
    private(set) var receipt: NativeTravelerBriefReceipt?
    private(set) var busy = false
    private(set) var notice: String?
    private(set) var receiptAbsent = false
    private(set) var erased = false
    private var generation = UUID()
    private var deadline = 0.0
    private var optionsDeadline = 0.0
    private var auditDeadline = 0.0
    private var ownerStateDeadline = 0.0
    private var briefDeadline = 0.0
    private let uptime: () -> Double
    init(uptime: @escaping () -> Double = { ProcessInfo.processInfo.systemUptime }) { self.uptime = uptime }

    func bind(_ next: NativeDataScope?) {
        guard scope != next else { return }
        invalidate(); scope = next; pending = nil; receipt = nil; notice = nil; receiptAbsent = false; erased = false
    }
    func invalidate() { generation = UUID(); preview = nil; brief = nil; selection = nil; options = nil; audit = nil; auditUnavailable = false; ownerState = nil; deadline = 0; optionsDeadline = 0; auditDeadline = 0; ownerStateDeadline = 0; briefDeadline = 0; busy = false }
    func cleanupBinding(_ actor: NativeDataScope?) -> (NativeTravelerBriefOwnerState, Int)? {
        guard actor != nil, actor == scope, uptime() < ownerStateDeadline, let ownerState,
              ownerState.recipientID != nil else { return nil }
        return (ownerState, ownerState.briefRevision)
    }
    func loadOwnerState(actor: NativeDataScope, caseID: String, current: () -> NativeDataScope?, request: (Data) async throws -> Data) async {
        guard !busy, scope == actor, current() == actor else { return }
        let own = generation, started = uptime(); ownerState = nil; ownerStateDeadline = 0; busy = true
        defer { if own == generation { busy = false } }
        do {
            let body = try NativeTravelerBriefWire.bytes(["action": "owner_state", "caseId": caseID])
            let bytes = try await request(body)
            guard own == generation, current() == actor, !Task.isCancelled, uptime() - started < 30 else { return }
            ownerState = try NativeTravelerBriefOwnerState(raw: NativeTravelerBriefWire.payload(bytes), actor: actor, caseID: caseID)
            ownerStateDeadline = started + 30
        } catch { if own == generation { ownerState = nil; notice = Self.code(error) } }
    }
    func loadShared(actor: NativeDataScope, caseID: String, current: () -> NativeDataScope?, request: (Data) async throws -> Data) async {
        guard !busy, scope == actor, current() == actor else { return }
        let own = generation, started = uptime(); brief = nil; briefDeadline = 0; busy = true
        defer { if own == generation { busy = false } }
        do {
            let bytes = try await request(NativeTravelerBriefWire.bytes(["action": "locate", "caseId": caseID]))
            guard own == generation, current() == actor, !Task.isCancelled else { return }
            let w = NativeTravelerBriefWire.self
            let v = try w.object(w.payload(bytes), keys: ["schemaVersion", "kind", "caseId", "ownerId", "recipientId", "grantRevision", "purpose", "category", "revision", "expiresAt"])
            guard v["schemaVersion"] as? String == w.version, v["kind"] as? String == "locator", try w.uuid(v["caseId"]) == caseID,
                  try w.uuid(v["ownerId"]) == actor.subject.lowercased(), v["purpose"] as? String == "case_assistance",
                  let category = v["category"] as? String, ["transport", "accommodation", "on_trip", "general"].contains(category),
                  try w.timestamp(v["expiresAt"]) > Date().timeIntervalSince1970 * 1000 else { throw NativeDataError.invalidResponse }
            let recipient = try w.uuid(v["recipientId"]), grant = try w.integer(v["grantRevision"]), revision = try w.integer(v["revision"])
            guard recipient != actor.subject.lowercased() else { throw NativeDataError.invalidResponse }
            let read = try w.bytes(["action": "read", "caseId": caseID, "recipientId": recipient, "grantRevision": grant, "expectedRevision": revision])
            let readBytes = try await request(read)
            guard own == generation, current() == actor, !Task.isCancelled, uptime() - started < 30 else { return }
            let shared = try NativeTravelerBriefSnapshot(raw: w.payload(readBytes), actor: actor, caseID: caseID)
            guard shared.kind == "brief", shared.recipientID == recipient, shared.grantRevision == grant, shared.revision == revision else { throw NativeDataError.invalidResponse }
            brief = shared; briefDeadline = started + 30
        } catch { if own == generation { brief = nil; briefDeadline = 0 } }
    }
    func visibleOptions(_ actor: NativeDataScope?, now: Date = Date()) -> NativeTravelerBriefSources? {
        guard actor != nil, actor == scope, uptime() < optionsDeadline, let options,
              now.timeIntervalSince1970 * 1000 < options.expiresAt else { return nil }; return options
    }
    func visibleAudit(_ actor: NativeDataScope?) -> NativeTravelerBriefAudit? {
        guard actor != nil, actor == scope, uptime() < auditDeadline else { return nil }; return audit
    }
    func loadOptions(actor: NativeDataScope, caseID: String, current: () -> NativeDataScope?, request: (Data) async throws -> Data) async {
        guard !busy, scope == actor, current() == actor else { return }
        invalidate(); let own = generation, started = uptime(); busy = true
        defer { if own == generation { busy = false } }
        do {
            let body = try NativeTravelerBriefWire.bytes(["action": "source_options", "caseId": caseID])
            let bytes = try await request(body)
            guard own == generation, current() == actor, !Task.isCancelled else { return }
            let value = try NativeTravelerBriefSources(raw: NativeTravelerBriefWire.payload(bytes), actor: actor, caseID: caseID)
            guard uptime() - started < 30, value.expiresAt > Date().timeIntervalSince1970 * 1000 else { throw NativeDataError.invalidResponse }
            options = value; optionsDeadline = started + 30; notice = pending == nil ? nil : "RECOVERY_REQUIRED"
        } catch { if own == generation { notice = Self.code(error) } }
    }
    func loadAudit(actor: NativeDataScope, caseID: String, current: () -> NativeDataScope?, request: (Data) async throws -> Data) async {
        guard !busy, scope == actor, current() == actor else { return }
        let own = generation, started = uptime(); audit = nil; auditUnavailable = false; auditDeadline = 0; busy = true
        defer { if own == generation { busy = false } }
        do {
            let body = try NativeTravelerBriefWire.bytes(["action": "audit", "caseId": caseID])
            let bytes = try await request(body)
            guard own == generation, current() == actor, !Task.isCancelled, uptime() - started < 30 else { return }
            audit = try NativeTravelerBriefAudit(raw: NativeTravelerBriefWire.payload(bytes), actor: actor, caseID: caseID); auditDeadline = started + 30
        } catch { if own == generation { audit = nil; auditUnavailable = true } }
    }
    func visible(_ actor: NativeDataScope?, now: Date = Date()) -> NativeTravelerBriefSnapshot? {
        guard actor != nil, actor == scope, uptime() < deadline, let preview,
              now.timeIntervalSince1970 * 1000 < preview.expiresAt else { return nil }; return preview
    }
    func shared(_ actor: NativeDataScope?, now: Date = Date()) -> NativeTravelerBriefSnapshot? {
        guard actor != nil, actor == scope, uptime() < briefDeadline, let brief, now.timeIntervalSince1970 * 1000 < brief.expiresAt else { return nil }; return brief
    }
    func restore(actor: NativeDataScope, read: () throws -> NativeTravelerBriefPending?) {
        bind(actor)
        do { pending = try read(); if pending != nil { notice = "RECOVERY_REQUIRED" } }
        catch { notice = "STORAGE_UNAVAILABLE" }
    }
    func select(_ key: String, include: Bool, actor: NativeDataScope?) {
        guard !busy, pending == nil, visible(actor) != nil else { return }; selection?.select(key, include: include)
    }
    func confirm(actor: NativeDataScope?) { guard !busy, pending == nil, visible(actor) != nil else { return }; selection?.confirm() }

    func loadPreview(body: Data, actor: NativeDataScope, caseID: String, recipientID: String, grantRevision: Int,
                     current: () -> NativeDataScope?, request: (Data) async throws -> Data) async {
        guard !busy, scope == actor, current() == actor else { return }
        invalidate(); let own = generation, started = uptime(); busy = true
        defer { if own == generation { busy = false } }
        do {
            let bytes = try await request(body)
            guard generation == own, current() == actor, !Task.isCancelled else { return }
            let value = try NativeTravelerBriefSnapshot(raw: NativeTravelerBriefWire.payload(bytes), actor: actor, caseID: caseID)
            guard value.kind == "preview", value.recipientID == recipientID, value.grantRevision == grantRevision,
                  uptime() - started < 30, abs(Date().timeIntervalSince1970 * 1000 - value.updatedAt) <= 30_000,
                  value.expiresAt > Date().timeIntervalSince1970 * 1000 else { throw NativeDataError.invalidResponse }
            preview = value; selection = .init(boundary: value.boundary(actor: actor), availableKeys: Set(value.fields.filter(\.available).map(\.key)))
            deadline = started + 30; notice = pending == nil ? nil : "RECOVERY_REQUIRED"
            if value.revision > 0 {
                let readBody = try NativeTravelerBriefWire.bytes(["action": "read", "caseId": caseID, "recipientId": recipientID,
                                                                 "grantRevision": grantRevision, "expectedRevision": value.revision])
                do {
                    let readBytes = try await request(readBody)
                    guard generation == own, current() == actor, !Task.isCancelled else { return }
                    let shared = try NativeTravelerBriefSnapshot(raw: NativeTravelerBriefWire.payload(readBytes), actor: actor, caseID: caseID)
                    guard shared.kind == "brief", shared.recipientID == recipientID, shared.grantRevision == grantRevision,
                          shared.revision == value.revision else { throw NativeDataError.invalidResponse }
                    brief = shared; briefDeadline = started + 30
                } catch { if own == generation { brief = nil } }
            }
        } catch { if own == generation { preview = nil; brief = nil; selection = nil; deadline = 0; notice = Self.code(error) } }
    }

    enum Recovery { case read, retry, abandon }
    func perform(command: NativeTravelerBriefCommand?, recovery: Recovery? = nil, actor: NativeDataScope,
                 current: () -> NativeDataScope?, read: () throws -> NativeTravelerBriefPending?,
                 retain: (NativeTravelerBriefCommand) throws -> NativeTravelerBriefPending,
                 complete: (NativeTravelerBriefPending) throws -> Void,
                 request: (Data) async throws -> Data) async {
        guard !busy, scope == actor, current() == actor else { return }
        let own = generation; busy = true; receipt = nil; receiptAbsent = false
        defer { if own == generation { busy = false } }
        do {
            let original: NativeTravelerBriefPending
            if let recovery {
                guard let stored = try read(), stored == pending, stored.matches(actor), recovery != .retry || !erased else { throw NativeDataError.staleSessionResponse }
                original = stored
            } else {
                guard pending == nil, let command else { throw NativeDataError.staleSessionResponse }
                if command.action == "share" {
                    guard let fresh = visible(actor), command.caseID == fresh.caseID, command.recipientID == fresh.recipientID,
                          command.grantRevision == fresh.grantRevision, command.expectedRevision == fresh.revision,
                          command.previewID == fresh.previewID, command.sourceDigest == fresh.sourceDigest,
                          let selection, try selection.authorizedKeys(current: fresh.boundary(actor: actor)) == command.selectedKeys else { throw NativeDataError.staleSessionResponse }
                } else {
                    guard let (binding, revision) = cleanupBinding(actor), command.caseID == binding.caseID, command.recipientID == binding.recipientID,
                          command.grantRevision == binding.grantRevision, command.expectedRevision == revision else { throw NativeDataError.staleSessionResponse }
                }
                original = try retain(command); pending = original
            }
            let frozen = try NativeTravelerBriefCommand(body: original.body)
            let body: Data
            switch recovery {
            case .read: body = try frozen.recoveryBody()
            case .abandon: body = try frozen.recoveryBody(abandon: true)
            default: body = original.body
            }
            // Remove readable fields before a mutation/retry; the server rechecks every authority.
            preview = nil; brief = nil; selection = nil; options = nil; audit = nil; ownerState = nil; deadline = 0; optionsDeadline = 0; auditDeadline = 0; ownerStateDeadline = 0; briefDeadline = 0
            let bytes = try await request(body)
            guard own == generation, current() == actor, !Task.isCancelled else { return }
            var value: Any = try NativeTravelerBriefWire.payload(bytes)
            if recovery == .read {
                let result = try NativeTravelerBriefWire.object(value, keys: ["receipt"])
                if result["receipt"] is NSNull { receiptAbsent = true; notice = "RECEIPT_ABSENT"; return }
                value = result["receipt"] as Any
            }
            let result = try NativeTravelerBriefReceipt(raw: value, command: frozen)
            let journalTicket = journalObservation?.begin()
            try complete(original); pending = nil; receipt = result; notice = nil; erased = false
            journalObservation?.finish(journalTicket, frozen.operationID)
        } catch { if own == generation { notice = Self.code(error); if notice == "BRIEF_OPERATION_ERASED" { erased = true } } }
    }
    /// Explicit device cleanup after server erasure has no outcome/Undo proof.
    func stopErasedRecovery(actor: NativeDataScope, current: () -> NativeDataScope?, read: () throws -> NativeTravelerBriefPending?, complete: (NativeTravelerBriefPending) throws -> Void) {
        guard !busy, erased, scope == actor, current() == actor else { return }
        do {
            guard let pending, try read() == pending else { throw NativeDataError.staleSessionResponse }
            try complete(pending); self.pending = nil; erased = false; notice = "ERASED_OUTCOME_UNKNOWN"
        } catch { notice = Self.code(error) }
    }
    private static func code(_ error: Error) -> String {
        if case NativeDataError.server(let code) = error { return code }; return "UNAVAILABLE"
    }
}

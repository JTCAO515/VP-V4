import Foundation
import Observation

@MainActor @Observable final class NativeScopedTripEditStore {
    private(set) var candidates: NativeScopedTripCandidates?
    private var candidatesJournal: NativeScopedTripJournal?
    private(set) var bindingRequired: NativeScopedTripBindingRequired?
    private var resolvedJournal: NativeScopedTripJournal?
    private(set) var context: NativeScopedTripContext?
    private(set) var receipt: NativeScopedTripProposalReceipt?
    private(set) var journal: NativeScopedTripJournal?
    private(set) var busy = false
    private(set) var notice: String?
    private var generation = UUID()

    func suspend() { generation = UUID(); context = nil; receipt = nil; candidates = nil; candidatesJournal = nil; bindingRequired = nil; resolvedJournal = nil; busy = false }

    func load(selection: NativeScopedTripSelection, session: NativeSession, locale: String,
              bindings: [NativeScopedTripReservationBinding] = [], current: () -> Bool) async {
        guard !busy, current(), session.dataScope == selection.actor else { suspend(); return }
        busy = true; notice = nil
        let token = generation; let start = Date()
        defer { if token == generation { busy = false } }
        do {
            journal = try session.scopedTripEditRecovery()
            if let journal, journal.tripID != selection.tripID { notice = "otherPendingTrip"; return }
            let bytes = try await session.scopedTripEditRequest(tripID: selection.tripID,
                body: NativeScopedTripContext.request(selection, locale: locale, bindings: bindings))
            guard token == generation, current(), session.dataScope == selection.actor, !Task.isCancelled else { return }
            if let raw = try JSONSerialization.jsonObject(with: bytes) as? [String: Any], raw["kind"] as? String == "scoped_edit_binding_required/1" {
                bindingRequired = try NativeScopedTripBindingRequired.decode(bytes, selection: selection); context = nil; receipt = nil; return
            }
            bindingRequired = nil
            let fresh = try NativeScopedTripContext.decode(bytes, selection: selection, startedAt: start)
            if let context, context.basis != fresh.basis { receipt = nil; resolvedJournal = nil; candidates = nil; candidatesJournal = nil }
            context = fresh
        } catch { if token == generation { context = nil; receipt = nil; notice = errorCode(error) } }
    }

    func send(action: String, fields: [String: Any], selection: NativeScopedTripSelection,
              session: NativeSession, current: () -> Bool) async {
        guard !busy, journal == nil, let context, context.current,
              context.selection == selection, current(), session.dataScope == selection.actor else { notice = "refreshRequired"; return }
        busy = true; notice = nil; receipt = nil
        let token = generation
        defer { if token == generation { busy = false } }
        do {
            var object = fields
            object["action"] = action; object["operationId"] = UUID().uuidString.lowercased(); object["basis"] = context.basis.object
            let command = try NativeScopedTripCommand(object: object)
            let saved = try session.rememberScopedTripEdit(command, selection: selection, actor: selection.actor)
            journal = saved
            let bytes = try await session.scopedTripEditRequest(tripID: selection.tripID, body: saved.bytes)
            guard token == generation, current(), session.dataScope == selection.actor else { return }
            try consume(bytes, journal: saved, session: session, actor: selection.actor)
        } catch { if token == generation { notice = errorCode(error) } }
    }

    /// Recovery first reads the same operation. Explicit retry dispatches the
    /// exact saved bytes; only abandon asks the server to fence late execution.
    func recover(mode: String, selection: NativeScopedTripSelection, session: NativeSession,
                 current: () -> Bool) async {
        await recover(mode: mode, tripID: selection.tripID, actor: selection.actor, session: session, current: current)
    }

    func recover(mode: String, tripID: String, actor: NativeDataScope, session: NativeSession, current: () -> Bool) async {
        guard !busy, current(), session.dataScope == actor else { return }
        busy = true; notice = nil
        let token = generation
        defer { if token == generation { busy = false } }
        do {
            guard let saved = try session.scopedTripEditRecovery(), saved.tripID == tripID else { notice = "otherPendingTrip"; return }
            journal = saved
            let command = try saved.command()
            let body: Data
            switch mode {
            case "retry": body = saved.bytes
            case "abandon": body = try command.abandoning()
            default: body = try JSONSerialization.data(withJSONObject: ["action": "read_operation", "operationId": command.operationID])
            }
            let bytes = try await session.scopedTripEditRequest(tripID: saved.tripID, body: body)
            guard token == generation, current(), session.dataScope == actor else { return }
            try consume(bytes, journal: saved, session: session, actor: actor)
        } catch { if token == generation { notice = errorCode(error) } }
    }

    func selectCandidate(_ candidateID: String, selection: NativeScopedTripSelection, session: NativeSession, current: () -> Bool) async {
        guard !busy, journal == nil, current(), session.dataScope == selection.actor,
              let ready = candidates, ready.current, let saved = candidatesJournal,
              let context, context.current, context.basis == ready.basis,
              ready.candidates.contains(where: { $0.id == candidateID }) else { notice = "refreshRequired"; return }
        busy = true; let token = generation
        defer { if token == generation { busy = false } }
        do {
            let bytes = try await session.scopedTripEditRequest(tripID: selection.tripID,
                body: JSONSerialization.data(withJSONObject: ["action": "read_operation", "operationId": ready.askOperationID]))
            guard token == generation, current(), session.dataScope == selection.actor else { return }
            let raw = try NativeScopedTripWire.exact(bytes, keys: ["kind", "operationId", "tripId", "mutation", "receipt", "state", "resultingVersion"])
            guard raw["kind"] as? String == "scoped_edit_operation/1", raw["state"] as? String == "pending",
                  raw["tripId"] as? String == selection.tripID, raw["operationId"] as? String == ready.askOperationID,
                  raw["resultingVersion"] is NSNull, let mutation = raw["mutation"] as? [String: Any],
                  NSDictionary(dictionary: mutation).isEqual(to: try JSONSerialization.jsonObject(with: saved.bytes) as! [String: Any]),
                  let candidateRaw = raw["receipt"] as? [String: Any] else { throw NativeDataError.staleSessionResponse }
            let fresh = try NativeScopedTripCandidates.decode(JSONSerialization.data(withJSONObject: candidateRaw), journal: saved, context: context)
            guard fresh.current, fresh.basis == ready.basis, fresh.candidates.contains(where: { $0.id == candidateID }) else { throw NativeDataError.staleSessionResponse }
            candidates = nil; candidatesJournal = nil; busy = false
            await send(action: "select_candidate", fields: ["askOperationId": ready.askOperationID, "candidateId": candidateID], selection: selection, session: session, current: current)
        } catch { if token == generation { busy = false; candidates = nil; candidatesJournal = nil; notice = "refreshRequired" } }
    }

    func revalidateCandidate(selection: NativeScopedTripSelection, session: NativeSession, current: () -> Bool) async -> Bool {
        guard !busy, current(), session.dataScope == selection.actor, let original = receipt,
              let resolvedJournal, let context, context.current, original.proposal.current else { return false }
        busy = true; let token = generation
        defer { if token == generation { busy = false } }
        do {
            let command = try resolvedJournal.command()
            let bytes = try await session.scopedTripEditRequest(tripID: selection.tripID,
                body: JSONSerialization.data(withJSONObject: ["action": "read_operation", "operationId": command.operationID]))
            guard token == generation, current(), session.dataScope == selection.actor else { return false }
            let raw = try NativeScopedTripWire.exact(bytes, keys: ["kind", "operationId", "tripId", "mutation", "receipt", "state", "resultingVersion"])
            guard raw["kind"] as? String == "scoped_edit_operation/1", raw["state"] as? String == "pending",
                  raw["resultingVersion"] is NSNull, raw["operationId"] as? String == command.operationID,
                  raw["tripId"] as? String == selection.tripID,
                  let mutation = raw["mutation"] as? [String: Any],
                  NSDictionary(dictionary: mutation).isEqual(to: try JSONSerialization.jsonObject(with: command.bytes) as! [String: Any]),
                  let candidateRaw = raw["receipt"] as? [String: Any] else { receipt = nil; notice = "refreshRequired"; return false }
            let candidate = try NativeScopedTripProposalReceipt.decode(JSONSerialization.data(withJSONObject: candidateRaw), journal: resolvedJournal, context: context)
            guard candidate.proposal == original.proposal, candidate.returnScope == original.returnScope else { throw NativeDataError.invalidResponse }
            return true
        } catch { if token == generation { receipt = nil; notice = errorCode(error) }; return false }
    }

    private func consume(_ bytes: Data, journal saved: NativeScopedTripJournal, session: NativeSession, actor: NativeDataScope) throws {
        guard let raw = try JSONSerialization.jsonObject(with: bytes) as? [String: Any], let kind = raw["kind"] as? String else { throw NativeDataError.invalidResponse }
        let command = try saved.command()
        let mutation = try JSONSerialization.jsonObject(with: command.bytes) as! [String: Any]
        let basis = mutation["basis"] as! [String: Any]
        if kind == "unavailable" {
            _ = try NativeScopedTripWire.exact(raw, keys: ["kind", "reason"])
            guard let reason = raw["reason"] as? String,
                  ["stale_basis", "invalid_scope", "protected_item", "cancelled", "unsupported", "provider_unavailable"].contains(reason) else { throw NativeDataError.invalidResponse }
            notice = reason; return // Admission response alone never erases unknown work.
        }
        guard raw["operationId"] as? String == command.operationID, raw["tripId"] as? String == saved.tripID else { throw NativeDataError.invalidResponse }
        switch kind {
        case "scoped_edit_candidates/1":
            let ready = try NativeScopedTripCandidates.decode(bytes, journal: saved, context: context)
            try session.completeScopedTripEdit(saved, actor: actor); journal = nil
            if let context, context.current, ready.current, context.basis == ready.basis {
                candidates = ready; candidatesJournal = saved; notice = "candidatesReady"
            } else { candidates = nil; candidatesJournal = nil; notice = "refreshRequired" }
        case "scoped_edit_proposal/1":
            guard command.action != "lock" else { throw NativeDataError.invalidResponse }
            let candidate = try NativeScopedTripProposalReceipt.decode(bytes, journal: saved, context: context)
            try session.completeScopedTripEdit(saved, actor: actor); journal = nil; resolvedJournal = saved
            if let context, context.current, candidate.returnScope == context.scope,
               context.basis.contextDigest == basis["contextDigest"] as? String,
               candidate.proposal.current { receipt = candidate; notice = "reviewRequired" }
            else { receipt = nil; notice = "refreshRequired" }
        case "scoped_edit_lock/1":
            _ = try NativeScopedTripWire.exact(raw, keys: ["kind", "operationId", "tripId", "baseVersion", "lockRevision", "itemId", "locked", "reused"])
            guard command.action == "lock", raw["itemId"] as? String == mutation["itemId"] as? String,
                  NativeScopedTripWire.integer(raw["baseVersion"]) == NativeScopedTripWire.integer(basis["baseVersion"]),
                  NativeScopedTripWire.integer(raw["lockRevision"]) != nil,
                  NativeScopedTripWire.bool(raw["locked"]) == NativeScopedTripWire.bool(mutation["locked"]),
                  NativeScopedTripWire.bool(raw["reused"]) != nil else { throw NativeDataError.invalidResponse }
            try session.completeScopedTripEdit(saved, actor: actor); journal = nil; context = nil; receipt = nil; notice = "lockSaved"
        case "scoped_edit_pending/1":
            _ = try NativeScopedTripWire.exact(raw, keys: ["kind", "operationId", "tripId", "contextId", "contextDigest", "baseVersion", "reason", "reused"])
            guard command.action == "ask", raw["contextId"] as? String == basis["contextId"] as? String,
                  raw["contextDigest"] as? String == basis["contextDigest"] as? String,
                  NativeScopedTripWire.integer(raw["baseVersion"]) == NativeScopedTripWire.integer(basis["baseVersion"]),
                  let reason = raw["reason"] as? String, ["queued", "provider_unavailable"].contains(reason),
                  NativeScopedTripWire.bool(raw["reused"]) != nil else { throw NativeDataError.invalidResponse }
            notice = reason
        case "scoped_edit_operation/1":
            _ = try NativeScopedTripWire.exact(raw, keys: ["kind", "operationId", "tripId", "mutation", "receipt", "state", "resultingVersion"])
            guard let state = raw["state"] as? String, ["pending", "applied", "rejected", "cancelled", "expired", "stale", "unknown"].contains(state),
                  raw["resultingVersion"] is NSNull || NativeScopedTripWire.integer(raw["resultingVersion"]) != nil,
                  (state == "applied") == (NativeScopedTripWire.integer(raw["resultingVersion"]) != nil),
                  state != "applied" || (NativeScopedTripWire.integer(raw["resultingVersion"]) ?? 0) > 0 else { throw NativeDataError.invalidResponse }
            if state == "unknown" {
                guard raw["mutation"] is NSNull, raw["receipt"] is NSNull else { throw NativeDataError.invalidResponse }
                notice = "unknown"; return
            }
            guard let original = raw["mutation"] as? [String: Any],
                  NSDictionary(dictionary: original).isEqual(to: mutation) else { throw NativeDataError.invalidResponse }
            if ["rejected", "cancelled", "expired", "stale", "applied"].contains(state) {
                try session.completeScopedTripEdit(saved, actor: actor); journal = nil; receipt = nil; candidates = nil; candidatesJournal = nil; notice = state; return
            }
            if let receipt = raw["receipt"] as? [String: Any], let nestedKind = receipt["kind"] as? String,
               ["scoped_edit_proposal/1", "scoped_edit_lock/1", "scoped_edit_pending/1", "scoped_edit_candidates/1"].contains(nestedKind) {
                try consume(JSONSerialization.data(withJSONObject: receipt), journal: saved, session: session, actor: actor)
            } else if ["rejected", "cancelled", "expired", "stale"].contains(state), raw["receipt"] is NSNull {
                try session.completeScopedTripEdit(saved, actor: actor); journal = nil; receipt = nil; notice = state
            } else { throw NativeDataError.invalidResponse }
        case "scoped_edit_abandon/1":
            _ = try NativeScopedTripWire.exact(raw, keys: ["kind", "operationId", "tripId", "state", "receipt"])
            if raw["state"] as? String == "cancelled", raw["receipt"] is NSNull {
                try session.completeScopedTripEdit(saved, actor: actor); journal = nil; receipt = nil; notice = "cancelled"
            } else if raw["state"] as? String == "committed", let receipt = raw["receipt"] as? [String: Any],
                      let nestedKind = receipt["kind"] as? String, ["scoped_edit_proposal/1", "scoped_edit_lock/1", "scoped_edit_pending/1", "scoped_edit_candidates/1"].contains(nestedKind) {
                try consume(JSONSerialization.data(withJSONObject: receipt), journal: saved, session: session, actor: actor)
            } else { throw NativeDataError.invalidResponse }
        default: throw NativeDataError.invalidResponse
        }
    }

    private func errorCode(_ error: Error) -> String {
        if case NativeDataError.server(let code) = error { return code }
        if case NativeDataError.invalidResponse = error { return "invalidResponse" }
        return "unknown"
    }
}

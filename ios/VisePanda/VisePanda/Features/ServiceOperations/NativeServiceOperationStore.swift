import Foundation
import Observation
import CoreFoundation

@MainActor @Observable final class NativeServiceOperationStore {
    private(set) var cases: [NativeServiceProjection] = []
    private(set) var capacity: NativeServiceCapacity?
    private(set) var pending: NativeServiceOperationPending?
    private(set) var receipt: NativeServiceOperationReceipt?
    private(set) var scope: NativeDataScope?
    private(set) var busy = false
    private(set) var notice: String?
    private(set) var receiptAbsent = false
    private(set) var erased = false
    private var generation = UUID()
    private var deadline = 0.0
    private let uptime: () -> Double
    init(uptime: @escaping () -> Double = { ProcessInfo.processInfo.systemUptime }) { self.uptime = uptime }
    func clear() { generation = UUID(); cases = []; capacity = nil; scope = nil; pending = nil; receipt = nil; busy = false; notice = nil; deadline = 0; receiptAbsent = false; erased = false }
    func invalidate() { generation = UUID(); cases = []; capacity = nil; deadline = 0; busy = false }
    func isFresh(_ actor: NativeDataScope?, now: Date = Date()) -> Bool {
        guard actor == scope, actor != nil, let capacity, uptime() < deadline,
              now.timeIntervalSince1970 * 1000 < capacity.checkedAt + 30_000 else { return false }; return true
    }
    func visible(caseId: String, actor: NativeDataScope?, now: Date = Date()) -> NativeServiceProjection? {
        guard isFresh(actor, now: now), let value = cases.first(where: { $0.id == caseId }) else { return nil }
        if let expiry = value.expiresAt, value.grantState == "active", now.timeIntervalSince1970 * 1000 >= expiry { return nil }
        return value
    }
    func restore(actor: NativeDataScope, read: () throws -> NativeServiceOperationPending?) {
        if scope != actor { clear() }
        scope = actor
        do { pending = try read(); if pending != nil { notice = "RECOVERY_REQUIRED" } }
        catch { notice = "STORAGE_UNAVAILABLE" }
    }
    func load(actor: NativeDataScope, current: () -> NativeDataScope?, request: (Data) async throws -> Data) async {
        guard !busy, scope == actor, current() == actor else { return }
        invalidate(); let own = generation, started = uptime(); busy = true
        defer { if generation == own { busy = false } }
        do {
            let bytes = try await request(NativeServiceOperationWire.bytes(["action": "workspace"]))
            guard own == generation, current() == actor, !Task.isCancelled else { return }
            let value = try NativeServiceOperationWire.object(NativeServiceOperationWire.response(bytes), keys: ["actorId", "surface", "cases", "capacity", "complete"])
            guard try NativeServiceOperationWire.identifier(value["actorId"]) == actor.subject.lowercased(),
                  value["surface"] as? String == "owner", let complete = value["complete"] as? NSNumber,
                  CFGetTypeID(complete) == CFBooleanGetTypeID(), complete.boolValue,
                  let rows = value["cases"] as? [Any], rows.count <= 50 else { throw NativeDataError.invalidResponse }
            let decoded = try rows.map(NativeServiceProjection.decode), capacity = try NativeServiceProjection.capacity(value["capacity"])
            guard Set(decoded.map(\.id)).count == decoded.count, uptime() - started < 30,
                  abs(Date().timeIntervalSince1970 * 1000 - capacity.checkedAt) <= 30_000 else { throw NativeDataError.invalidResponse }
            self.cases = decoded; self.capacity = capacity; deadline = started + 30
            if pending == nil { notice = nil }
        } catch { if own == generation { cases = []; capacity = nil; deadline = 0; notice = Self.code(error) } }
    }
    enum Recovery { case read, retry, abandon }
    func perform(command: NativeServiceOperationCommand?, recovery: Recovery? = nil, actor: NativeDataScope,
                 current: () -> NativeDataScope?, read: () throws -> NativeServiceOperationPending?,
                 retain: (NativeServiceOperationCommand) throws -> NativeServiceOperationPending,
                 complete: (NativeServiceOperationPending) throws -> Void,
                 request: (Data) async throws -> Data) async {
        guard !busy, scope == actor, current() == actor else { return }
        let own = generation; busy = true; receipt = nil; receiptAbsent = false
        defer { if generation == own { busy = false } }
        do {
            let original: NativeServiceOperationPending
            if let recovery {
                guard let stored = try read(), stored == pending, stored.matches(actor) else { throw NativeDataError.staleSessionResponse }
                if recovery == .retry { guard !erased, isFresh(actor) else { throw NativeDataError.server(code: "RECHECK_REQUIRED") } }
                original = stored
            } else {
                guard pending == nil, let command, isFresh(actor) else { throw NativeDataError.server(code: "RECHECK_REQUIRED") }
                original = try retain(command); pending = original
            }
            let frozen = NativeServiceOperationCommand(body: original.body); try frozen.validate()
            let body: Data
            switch recovery {
            case .read: body = try frozen.recoveryBody()
            case .abandon: body = try frozen.recoveryBody(abandon: true)
            default: body = original.body
            }
            let bytes = try await request(body)
            guard own == generation, current() == actor, !Task.isCancelled else { return }
            var value: Any = try NativeServiceOperationWire.response(bytes)
            if recovery == .read {
                let result = try NativeServiceOperationWire.object(value, keys: ["receipt"])
                if result["receipt"] is NSNull { receiptAbsent = true; notice = "RECEIPT_ABSENT"; return }
                value = result["receipt"] as Any
            }
            let result = try NativeServiceOperationReceipt.decode(value, command: frozen)
            try complete(original); pending = nil; receipt = result; notice = nil
            cases = []; capacity = nil; deadline = 0
        } catch { if own == generation { notice = Self.code(error); if notice == "CASE_OPERATION_ERASED" { erased = true } } }
    }
    /// Explicitly stops device recovery only. Server erasure provides no outcome or Undo proof.
    func stopErasedRecovery(actor: NativeDataScope, current: () -> NativeDataScope?, read: () throws -> NativeServiceOperationPending?, complete: (NativeServiceOperationPending) throws -> Void) {
        guard !busy, erased, scope == actor, current() == actor else { return }
        do {
            guard let pending, try read() == pending else { throw NativeDataError.staleSessionResponse }
            try complete(pending); self.pending = nil; erased = false; notice = "ERASED_OUTCOME_UNKNOWN"
        } catch { notice = Self.code(error) }
    }
    private static func code(_ error: Error) -> String {
        if case NativeDataError.server(let code) = error { return code }
        return "UNAVAILABLE"
    }
}

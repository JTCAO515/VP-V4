import Foundation
import Observation

@MainActor @Observable final class NativeCommunityStore {
    typealias Request = (Data) async throws -> Data
    private(set) var actor: NativeCommunityActor?
    private(set) var items: [NativeCommunityItem] = []
    private(set) var selected: NativeCommunityItem?
    private(set) var nextCursor: String?
    private(set) var complete = false
    private(set) var pending: NativeCommunityPending?
    private(set) var busy = false
    private(set) var notice: String?
    private(set) var storageReady = false
    private(set) var receiptAbsent = false
    private(set) var fileURL: URL?
    private var journalReady = true
    private var generation = UUID()
    private var deadline = 0.0
    private var absentDeadline = 0.0
    private var fileDeadline = 0.0
    private let uptime: () -> Double
    private let files: NativeCommunityExportFile
    init(files: NativeCommunityExportFile? = nil, uptime: @escaping () -> Double = { ProcessInfo.processInfo.systemUptime }) {
        self.files = files ?? NativeCommunityExportFile(); self.uptime = uptime; storageReady = self.files.ready
    }
    func bind(_ next: NativeCommunityActor?) {
        guard actor != next else { return }
        clearVisible(); generation = UUID(); actor = next; pending = nil; busy = false; receiptAbsent = false; notice = nil
    }
    func restore(_ next: NativeCommunityActor, read: () throws -> NativeCommunityPending?) {
        bind(next)
        do {
            pending = try read()
            journalReady = true; storageReady = files.ready
            guard pending == nil || pending?.matches(next.scope, sessionID: next.sessionID) == true else { throw NativeDataError.staleSessionResponse }
            notice = pending == nil ? nil : "RECOVERY_REQUIRED"
        } catch { journalReady = false; storageReady = false; notice = "STORAGE_UNAVAILABLE" }
    }
    /// Hide private text on background/offline/failure. The protected exact pending op is never auto-sent.
    func suspend() { generation = UUID(); clearVisible(); busy = false; receiptAbsent = false; absentDeadline = 0 }
    func clearVisible() {
        items = []; selected = nil; nextCursor = nil; complete = false; deadline = 0; fileURL = nil; fileDeadline = 0
        do { try files.clear(); storageReady = files.ready && journalReady } catch { storageReady = false; notice = "STORAGE_CLEANUP_REQUIRED" }
    }
    func isFresh(_ current: NativeCommunityActor?) -> Bool { current != nil && current == actor && uptime() < deadline }
    func visibleItems(_ current: NativeCommunityActor?) -> [NativeCommunityItem] { isFresh(current) ? items : [] }
    func visibleItem(_ current: NativeCommunityActor?) -> NativeCommunityItem? { isFresh(current) ? selected : nil }
    func exportURL(_ current: NativeCommunityActor?) -> URL? {
        guard storageReady, current != nil, current == actor, uptime() < fileDeadline else {
            if fileURL != nil { clearVisible() }; return nil
        }; return fileURL
    }
    func canRetry(_ current: NativeCommunityActor?) -> Bool { current != nil && current == actor && receiptAbsent && uptime() < absentDeadline && storageReady }
    func page(cursor: String? = nil, current: () -> NativeCommunityActor?, request: Request) async {
        guard let actor, current() == actor, !busy else { return }
        clearVisible(); let own = generation, started = uptime(); busy = true
        defer { if generation == own { busy = false } }
        do {
            let bytes = try await request(NativeCommunityWire.bytes(["action": "mine", "cursor": cursor as Any? ?? NSNull()]))
            guard generation == own, current() == actor, !Task.isCancelled, uptime() - started < 30 else { return }
            guard case .page(let items, let next, let complete) = try NativeCommunityOutcome.decode(bytes, actor: actor),
                  cursor == nil || items.allSatisfy({ $0.id > cursor! }) else { throw NativeDataError.invalidResponse }
            self.items = items; nextCursor = next; self.complete = complete; deadline = started + 30
            notice = pending == nil ? nil : "RECOVERY_REQUIRED"
        } catch { fail(error, own: own) }
    }
    func read(id: String, current: () -> NativeCommunityActor?, request: Request) async {
        guard let actor, current() == actor, !busy else { return }
        clearVisible(); let own = generation, started = uptime(); busy = true
        defer { if generation == own { busy = false } }
        do {
            let bytes = try await request(NativeCommunityWire.bytes(["action": "read", "submissionId": id]))
            guard generation == own, current() == actor, !Task.isCancelled, uptime() - started < 30 else { return }
            guard case .item(let item) = try NativeCommunityOutcome.decode(bytes, actor: actor), item.id == id else { throw NativeDataError.invalidResponse }
            selected = item; deadline = started + 30; notice = pending == nil ? nil : "RECOVERY_REQUIRED"
        } catch { fail(error, own: own) }
    }
    func perform(_ command: NativeCommunityCommand, current: () -> NativeCommunityActor?, read: () throws -> NativeCommunityPending?,
                 retain: (Data) throws -> NativeCommunityPending, complete: (NativeCommunityPending) throws -> Void, request: Request) async {
        guard let actor, current() == actor, !busy, storageReady, pending == nil else { return }
        if command.action == "withdraw" {
            guard isFresh(actor), let item = selected, item.id == command.submissionID,
                  let input = try? JSONSerialization.jsonObject(with: command.body) as? [String: Any], input["expectedVersion"] as? Int == item.version else { return }
        }
        let own = generation; busy = true
        defer { if generation == own { busy = false } }
        do {
            let durable: NativeCommunityPending
            do {
                if let existing = try read() { pending = existing; throw NativeDataError.server(code: "RECOVERY_REQUIRED") }
                durable = try retain(command.body)
            } catch { journalReady = false; storageReady = false; throw error }
            guard durable.body == command.body, durable.matches(actor.scope, sessionID: actor.sessionID), try read() == durable else { throw NativeDataError.sessionUnavailable }
            pending = durable; receiptAbsent = false; clearVisible()
            guard storageReady else { throw NativeDataError.sessionUnavailable }
            let bytes = try await request(command.body)
            guard generation == own, current() == actor, !Task.isCancelled else { return }
            let outcome = try NativeCommunityOutcome.decode(bytes, actor: actor)
            guard try outcome.terminal(for: command, recovery: false) else { throw NativeDataError.invalidResponse }
            do { try complete(durable) } catch { journalReady = false; storageReady = false; throw error }; pending = nil; apply(outcome, command: command)
        } catch { fail(error, own: own) }
    }
    func recover(abandon: Bool = false, current: () -> NativeCommunityActor?, complete: (NativeCommunityPending) throws -> Void, request: Request) async {
        guard let actor, current() == actor, !busy, storageReady, let pending else { return }
        let own = generation; busy = true; clearVisible(); receiptAbsent = false
        defer { if generation == own { busy = false } }
        do {
            guard storageReady else { throw NativeDataError.sessionUnavailable }
            let command = try NativeCommunityCommand(body: pending.body)
            let bytes = try await request(command.recovery(abandon: abandon))
            guard generation == own, current() == actor, !Task.isCancelled else { return }
            let outcome = try NativeCommunityOutcome.decode(bytes, actor: actor)
            if try outcome.terminal(for: command, recovery: true) {
                do { try complete(pending) } catch { journalReady = false; storageReady = false; throw error }; self.pending = nil; apply(outcome, command: command)
            } else {
                guard !abandon, case .operation(_, "absent", nil) = outcome else { throw NativeDataError.invalidResponse }
                receiptAbsent = true; absentDeadline = uptime() + 30; notice = "ABSENT_EXACT_RETRY_OR_ABANDON"
            }
        } catch { fail(error, own: own) }
    }
    func retry(current: () -> NativeCommunityActor?, read: () throws -> NativeCommunityPending?, complete: (NativeCommunityPending) throws -> Void, request: Request) async {
        guard let actor, canRetry(current()), !busy, let pending else { return }
        let own = generation; busy = true; receiptAbsent = false; clearVisible()
        defer { if generation == own { busy = false } }
        do {
            guard storageReady else { throw NativeDataError.sessionUnavailable }
            guard try read() == pending else { throw NativeDataError.sessionUnavailable }
            let command = try NativeCommunityCommand(body: pending.body)
            let bytes = try await request(pending.body)
            guard generation == own, current() == actor, !Task.isCancelled else { return }
            let outcome = try NativeCommunityOutcome.decode(bytes, actor: actor)
            guard try outcome.terminal(for: command, recovery: false) else { throw NativeDataError.invalidResponse }
            do { try complete(pending) } catch { journalReady = false; storageReady = false; throw error }; self.pending = nil; apply(outcome, command: command)
        } catch { fail(error, own: own) }
    }
    func export(current: () -> NativeCommunityActor?, request: Request) async {
        guard let actor, current() == actor, !busy, storageReady else { return }
        let own = generation, started = uptime(); busy = true; clearVisible()
        defer { if generation == own { busy = false } }
        do {
            guard storageReady else { throw NativeDataError.sessionUnavailable }
            let bytes = try await request(NativeCommunityWire.bytes(["action": "export"]))
            guard generation == own, current() == actor, !Task.isCancelled, uptime() - started < 30 else { return }
            guard case .export(let artifact) = try NativeCommunityOutcome.decode(bytes, actor: actor) else { throw NativeDataError.invalidResponse }
            fileURL = try files.write(artifact); fileDeadline = started + 30; notice = "COMMUNITY_ONLY_EXPORT"
        } catch { fail(error, own: own) }
    }
    private func apply(_ outcome: NativeCommunityOutcome, command: NativeCommunityCommand) {
        if case .operation(_, let state, let item) = outcome {
            selected = item; deadline = uptime() + 30
            notice = state == "abandoned" ? "OPERATION_ABANDONED" : command.action == "delete" ? "COMMUNITY_ONLY_DELETED" : "ACKNOWLEDGED"
        } else if case .deleted = outcome { notice = "COMMUNITY_ONLY_DELETED" }
    }
    private func fail(_ error: Error, own: UUID) {
        guard own == generation else { return }
        clearVisible(); receiptAbsent = false
        guard storageReady else { notice = "STORAGE_CLEANUP_REQUIRED"; return }
        if case NativeDataError.server(let code) = error { notice = code }
        else { notice = pending == nil ? "COMMUNITY_UNAVAILABLE" : "COMMUNITY_ACK_UNKNOWN" }
    }
}

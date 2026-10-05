import Foundation
import Observation

@MainActor struct NativeDataCoverageClient {
    let current: () -> NativeCommunitySafetyActor?
    let request: (String, Data?, NativeCommunitySafetyActor) async throws -> Data
    let saved: (NativeCommunitySafetyActor) throws -> NativeDataCoveragePending?
    let retain: (Data, NativeCommunitySafetyActor) throws -> NativeDataCoveragePending
    let complete: (NativeDataCoveragePending, NativeCommunitySafetyActor) throws -> Void
    let retainOriginal: (NativeDataCoverageCommand, NativeCommunitySafetyActor) throws -> Void
    let completeOriginal: (NativeDataCoverageCommand, NativeDataCoverageReceipt, NativeCommunitySafetyActor) throws -> Void

    init(session: NativeSession, active: @escaping () -> Bool) {
        current = { active() ? try? session.communitySafetyActor() : nil }
        request = { try await session.dataCoverageRequest(method: $0, body: $1, actor: $2) }
        saved = { try session.dataCoverageRecovery(actor: $0) }
        retain = { try session.rememberDataCoverage(body: $0, actor: $1) }
        complete = { try session.completeDataCoverage($0, actor: $1) }
        retainOriginal = { try NativeDataCoverageOriginal.retain($0, using: session, actor: $1) }
        completeOriginal = { try NativeDataCoverageOriginal.complete($0, reply: $1, using: session, actor: $2) }
    }
    init(current: @escaping () -> NativeCommunitySafetyActor?, request: @escaping (String, Data?, NativeCommunitySafetyActor) async throws -> Data,
         saved: @escaping (NativeCommunitySafetyActor) throws -> NativeDataCoveragePending?, retain: @escaping (Data, NativeCommunitySafetyActor) throws -> NativeDataCoveragePending,
         complete: @escaping (NativeDataCoveragePending, NativeCommunitySafetyActor) throws -> Void,
         retainOriginal: @escaping (NativeDataCoverageCommand, NativeCommunitySafetyActor) throws -> Void,
         completeOriginal: @escaping (NativeDataCoverageCommand, NativeDataCoverageReceipt, NativeCommunitySafetyActor) throws -> Void) {
        self.current = current; self.request = request; self.saved = saved; self.retain = retain; self.complete = complete
        self.retainOriginal = retainOriginal; self.completeOriginal = completeOriginal
    }
}

struct NativeDataCoverageRow: Identifiable {
    var id: String { moduleID + "/" + action.rawValue }
    let moduleID: String
    let moduleVersion: String
    let action: NativeDataCoverageAction
    let state: NativeDataCoverageState
    let reason: String
    let operationID: String
    let selection: String
}

@MainActor @Observable final class NativeDataCoverageStore {
    private(set) var actor: NativeCommunitySafetyActor?
    private(set) var modules: [NativeDataCoverageModule] = []
    private(set) var rows: [NativeDataCoverageRow] = []
    private(set) var pending: NativeDataCoveragePending?
    private(set) var busy = false
    private(set) var storageReady = false
    private(set) var notice: String?
    private let files: NativeDataCoverageExportFile
    private let uptime: () -> TimeInterval
    private let now: () -> Date
    private var lifetime = NativeDataCoverageLifetime()
    private var generation: UUID { lifetime.generation }
    private var deadline: TimeInterval = 0
    private var journalReady = true
    private var exportedRow: String?

    init(files: NativeDataCoverageExportFile, uptime: @escaping () -> TimeInterval, now: @escaping () -> Date) {
        self.files = files; self.uptime = uptime; self.now = now; storageReady = files.ready
    }
    convenience init() { self.init(files: NativeDataCoverageExportFile(), uptime: { ProcessInfo.processInfo.systemUptime }, now: Date.init) }

    func bind(_ next: NativeCommunitySafetyActor?) {
        if next != actor { suspend(); actor = next; pending = nil; journalReady = true; storageReady = files.ready }
        lifetime.bind(next?.scope, active: next != nil)
    }
    func suspend() {
        lifetime.invalidate(); modules = []; rows = []; deadline = 0; busy = false; exportedRow = nil
        do { try files.clear(); storageReady = files.ready && journalReady } catch { storageReady = false; notice = "CLEANUP_REQUIRED" }
    }
    func tick(_ client: NativeDataCoverageClient) {
        if client.current() != actor { bind(client.current()); return }
        do { try files.tick(current: client.current()); storageReady = files.ready && journalReady }
        catch { storageReady = false; notice = "CLEANUP_REQUIRED" }
        // Immutable operation summaries can survive a foreground catalog refresh. No source body or authority is retained.
        if uptime() >= deadline { modules = []; deadline = 0; exportedRow = nil }
    }
    func visibleModules(_ current: NativeCommunitySafetyActor?) -> [NativeDataCoverageModule] {
        lifetime.active && current != nil && current == actor && uptime() < deadline ? modules : []
    }
    func visibleRows(_ current: NativeCommunitySafetyActor?) -> [NativeDataCoverageRow] {
        lifetime.active && current != nil && current == actor && uptime() < deadline ? rows : []
    }
    func exportURL(moduleID: String, current: NativeCommunitySafetyActor?) -> URL? {
        guard storageReady, exportedRow == moduleID else { return nil }; return files.visible(current: current)
    }
    func load(_ client: NativeDataCoverageClient) async {
        bind(client.current()); guard !busy, storageReady, let actor else { return }
        let own = generation, start = uptime(); busy = true; modules = []; deadline = 0
        defer { if own == generation { busy = false } }
        do {
            pending = try client.saved(actor)
            let bytes = try await client.request("GET", nil, actor)
            guard valid(own: own, actor: actor, start: start, client: client) else { return }
            let catalog = try NativeDataCoverageCatalog(bytes: bytes, actor: actor)
            rows.removeAll { row in !catalog.modules.contains(where: { $0.id == row.moduleID && $0.version == row.moduleVersion }) }
            modules = catalog.modules; deadline = start + 30; notice = pending == nil ? nil : "RECOVERY_REQUIRED"
        } catch { failed(error, own: own, client: client) }
    }

    func perform(_ command: NativeDataCoverageCommand, selection: String, guide: NativePlaceGuideSelection? = nil,
                 client: NativeDataCoverageClient) async {
        guard !busy, storageReady, let actor, command.matches(actor), client.current() == actor,
              command.phase != .recover, visibleModules(actor).contains(where: { $0.id == command.moduleID && $0.version == command.moduleVersion }) else { return }
        if command.action == .delete && command.phase == .execute {
            do {
                guard pending == nil, try client.saved(actor) == nil else { notice = "RECOVERY_REQUIRED"; return }
                // Freeze the outer bytes first. If an original module journal blocks dispatch, no write follows.
                pending = try client.retain(command.body, actor)
                guard pending?.body == command.body, try client.saved(actor) == pending else { throw NativeDataError.sessionUnavailable }
            } catch { journalReady = false; storageReady = false; notice = "JOURNAL_UNAVAILABLE"; return }
            do { try client.retainOriginal(command, actor) }
            catch { notice = "ORIGINAL_RECOVERY_REQUIRED"; return }
        }
        await send(command, original: command, selection: selection, guide: guide, client: client)
    }

    func recover(_ client: NativeDataCoverageClient) async {
        guard !busy, storageReady, let actor, client.current() == actor else { return }
        do {
            guard let saved = try client.saved(actor), saved == pending else { throw NativeDataError.sessionUnavailable }
            let original = try NativeDataCoverageCommand(body: saved.body)
            guard original.matches(actor), original.action == .delete, original.phase == .execute else { throw NativeDataError.invalidResponse }
            if original.moduleID == "guide" { notice = "GUIDE_OUTCOME_UNKNOWN"; return }
            await send(try original.recovery(), original: original, selection: original.tripID ?? original.moduleID, guide: nil, client: client)
        } catch { notice = "RECOVERY_REQUIRED" }
    }

    /// Explicitly retries frozen bytes only. It never chooses or creates another operation.
    func retry(_ client: NativeDataCoverageClient) async {
        guard !busy, storageReady, let actor, client.current() == actor else { return }
        do {
            guard let saved = try client.saved(actor), saved == pending else { throw NativeDataError.sessionUnavailable }
            let original = try NativeDataCoverageCommand(body: saved.body)
            guard original.matches(actor), original.action == .delete, original.phase == .execute,
                  original.moduleID != "guide", visibleModules(actor).contains(where: { $0.id == original.moduleID && $0.version == original.moduleVersion }) else { throw NativeDataError.invalidResponse }
            try client.retainOriginal(original, actor)
            await send(original, original: original, selection: original.tripID ?? original.moduleID, guide: nil, client: client)
        } catch { notice = "RECOVERY_REQUIRED" }
    }

    /// Stops only this module's protected recovery bytes. Original module journals and server outcomes are unchanged.
    func stopRecovery(_ client: NativeDataCoverageClient) {
        guard !busy, let actor, client.current() == actor else { return }
        do {
            guard let saved = try client.saved(actor), saved == pending else { throw NativeDataError.sessionUnavailable }
            try client.complete(saved, actor); pending = nil; journalReady = true; storageReady = files.ready; notice = "STOPPED_OUTCOME_UNKNOWN"
        } catch { journalReady = false; storageReady = false; notice = "JOURNAL_UNAVAILABLE" }
    }
    func retryCleanup(_ client: NativeDataCoverageClient) {
        guard !busy, let actor, client.current() == actor else { return }
        do {
            try files.clear(); pending = try client.saved(actor)
            journalReady = true; storageReady = files.ready; notice = pending == nil ? nil : "RECOVERY_REQUIRED"
        } catch { storageReady = false; notice = "CLEANUP_REQUIRED" }
    }

    private func send(_ command: NativeDataCoverageCommand, original: NativeDataCoverageCommand, selection: String,
                      guide: NativePlaceGuideSelection?, client: NativeDataCoverageClient) async {
        guard let actor, client.current() == actor, command.matches(actor) else { return }
        let own = generation, start = uptime(); busy = true; notice = nil
        defer { if own == generation { busy = false } }
        do {
            try files.clear(); exportedRow = nil
            let bytes = try await client.request("POST", command.body, actor)
            guard valid(own: own, actor: actor, start: start, client: client) else { return }
            let reply = try NativeDataCoverageReceipt(bytes: bytes, actor: actor, command: command)
            if reply.state == .preview {
                // Selection-specific original stores consume previews. A preview is never a completed row.
                record(reply, state: .preview, selection: selection); return
            }
            let verified = try NativeDataCoverageOriginal.verify(reply, original: original, actor: actor, guide: guide)
            if command.action == .export, let artifact = verified.artifact, let expiry = verified.expiresAt {
                try files.write(artifact, actor: actor, started: start, expiresAt: expiry, current: client.current)
                guard files.visible(current: actor) != nil else { throw NativeDataError.sessionUnavailable }
                exportedRow = command.moduleID
            }
            if command.action == .delete, verified.terminal, let pending {
                try client.completeOriginal(original, reply, actor)
                try client.complete(pending, actor); self.pending = nil
            }
            record(reply, state: verified.state, selection: selection)
            storageReady = files.ready && journalReady
        } catch { failed(error, own: own, client: client) }
    }

    func recordCore(_ receipt: NativeCoreExportReceipt, delivered: Bool, current: NativeCommunitySafetyActor?) {
        guard delivered, current == actor, current != nil, uptime() < deadline else { return }
        for module in receipt.modules {
            guard let catalogModule = modules.first(where: { $0.id == module.module && $0.exportHandler == "core" }) else { continue }
            replace(.init(moduleID: module.module, moduleVersion: catalogModule.version, action: .export, state: module.status == "complete" ? .scopedComplete : .partial,
                          reason: module.reason, operationID: receipt.requestId, selection: "core-export-d2/1"))
        }
    }
    func recordDevice(moduleID: String, action: NativeDataCoverageAction, operationID: String, selection: String, state: NativeDataCoverageState = .scopedComplete,
                      current: NativeCommunitySafetyActor?) {
        guard current == actor, current != nil, uptime() < deadline,
              let module = modules.first(where: { $0.id == moduleID && $0.location == .device }) else { return }
        replace(.init(moduleID: moduleID, moduleVersion: module.version, action: action, state: state, reason: state == .scopedComplete ? "LOCAL_SELECTED_SCOPE_ONLY" : moduleID == "materials" && action == .export ? "SYSTEM_HANDOFF_UNKNOWN" : "LOCAL_PARTIAL_PROOF", operationID: operationID, selection: selection))
    }
    func recordLegacy(module: NativeDataCoverageModule, action: NativeDataCoverageAction, operationID: String,
                      selection: String, state: NativeDataCoverageState, current: NativeCommunitySafetyActor?) {
        guard current == actor, current != nil, visibleModules(current).contains(module) else { return }
        replace(.init(moduleID: module.id, moduleVersion: module.version, action: action, state: state,
                      reason: state == .scopedComplete ? "NONE" : "ORIGINAL_JOB_PENDING", operationID: operationID, selection: selection))
    }
    private func record(_ reply: NativeDataCoverageReceipt, state: NativeDataCoverageState, selection: String) {
        replace(.init(moduleID: reply.moduleID, moduleVersion: reply.moduleVersion, action: reply.action, state: state, reason: reply.reason, operationID: reply.operationID, selection: selection))
    }
    private func replace(_ row: NativeDataCoverageRow) { rows.removeAll { $0.id == row.id }; rows.append(row) }
    private func valid(own: UUID, actor: NativeCommunitySafetyActor, start: TimeInterval, client: NativeDataCoverageClient) -> Bool {
        lifetime.accepts(own, scope: actor.scope, current: client.current()?.scope) && client.current() == actor && !Task.isCancelled && uptime() >= start && uptime() - start < 30
    }
    private func failed(_ error: Error, own: UUID, client: NativeDataCoverageClient) {
        guard own == generation else { return }
        if client.current() != actor { bind(client.current()); return }
        do { try files.clear() } catch { storageReady = false }
        exportedRow = nil; rows = []; notice = pending == nil ? "UNAVAILABLE" : "OUTCOME_UNKNOWN"
    }
}

import Foundation
import Observation

@MainActor struct NativeProfileDataClient {
    let current: () -> NativeCommunitySafetyActor?
    let request: (Data, NativeCommunitySafetyActor) async throws -> Data
    let consumeReceipt: (NativeProfileDataReceipt, NativeCommunitySafetyActor) throws -> Void

    init(current: @escaping () -> NativeCommunitySafetyActor?,
         request: @escaping (Data, NativeCommunitySafetyActor) async throws -> Data,
         consumeReceipt: @escaping (NativeProfileDataReceipt, NativeCommunitySafetyActor) throws -> Void) {
        self.current = current; self.request = request; self.consumeReceipt = consumeReceipt
    }
}

struct NativeProfileDataCompletion: Identifiable {
    let id = UUID()
    let receipt: NativeProfileDataReceipt
}

@MainActor @Observable final class NativeProfileDataStore {
    let scope: NativeProfileDataScope
    private(set) var objects: [NativeProfileDataObject] = []
    private(set) var selected = Set<String>()
    private(set) var next: NativeProfileDataCursor?
    private(set) var preview: NativeProfileDataPreview?
    private(set) var receipt: NativeProfileDataReceipt?
    private var receiptInventory: String?
    private(set) var completion: NativeProfileDataCompletion?
    private(set) var pending: NativeCommunitySafetyPending?
    private(set) var busy = false
    private(set) var storageReady = true
    private(set) var message: String?
    private var lifetime = NativeProfileDataLifetime()
    private var listLease: NativeProfileDataLease?
    private var previewLease: NativeProfileDataLease?
    private var receiptLease: NativeProfileDataLease?
    private var previewCommand: NativeProfileDataCommand?
    private var resendLease: NativeProfileDataLease?
    private let privateFile: NativeProfileDataReceiptFile
    private let journal: NativeProfileDataJournal
    private let now: () -> Date
    private let uptime: () -> TimeInterval

    init(scope: NativeProfileDataScope, vault: any NativeCredentialVault, privateFile: NativeProfileDataReceiptFile? = nil, now: @escaping () -> Date = Date.init,
         uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        self.scope = scope
        self.privateFile = privateFile ?? NativeProfileDataReceiptFile()
        journal = .init(vault: vault, validateConfirmation: NativeProfileDataCommand.validateConfirmation)
        self.now = now; self.uptime = uptime
    }

    func bind(_ actor: NativeCommunitySafetyActor?) {
        guard lifetime.bind(actor) else { return }
        storageReady = true; message = nil; clearVisible(); pending = nil; busy = false
        guard let actor else { return }
        do {
            pending = try journal.read(actor)
        }
        catch { storageReady = false; message = "storage" }
    }
    func suspend() { lifetime.suspend(); clearVisible(); pending = nil; busy = false }
    private func valid(_ actor: NativeCommunitySafetyActor?) -> Bool {
        actor.map { lifetime.accepts($0, generation: lifetime.generation) } ?? false
    }
    func visibleObjects(_ actor: NativeCommunitySafetyActor?) -> [NativeProfileDataObject] {
        valid(actor) && listLease?.valid(now: now(), uptime: uptime()) == true ? objects : []
    }
    func visiblePreview(_ actor: NativeCommunitySafetyActor?) -> NativeProfileDataPreview? {
        valid(actor) && previewLease?.valid(now: now(), uptime: uptime()) == true ? preview : nil
    }
    func visibleReceipt(_ actor: NativeCommunitySafetyActor?) -> NativeProfileDataReceipt? {
        valid(actor) && receiptLease?.valid(now: now(), uptime: uptime()) == true ? receipt : nil
    }
    func visibleReceiptInventory(_ actor: NativeCommunitySafetyActor?) -> String? {
        visibleReceipt(actor) == nil ? nil : receiptInventory
    }
    func pendingCommand(_ actor: NativeCommunitySafetyActor?) -> NativeProfileDataCommand? {
        guard valid(actor), let actor, let pending, pending.matches(actor.scope, sessionID: actor.sessionID) else { return nil }
        return try? .init(body: pending.body)
    }
    func pendingInventory(_ actor: NativeCommunitySafetyActor?) -> String? {
        guard pendingCommand(actor) != nil, let pending, let original = String(data: pending.body, encoding: .utf8) else { return nil }
        let fields: [String: Any] = ["schemaVersion": pending.schemaVersion, "endpoint": pending.endpoint,
            "owner": pending.owner, "epoch": pending.epoch, "sessionID": pending.sessionID, "body": original]
        guard let bytes = try? JSONSerialization.data(withJSONObject: fields, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]) else { return nil }
        return String(data: bytes, encoding: .utf8)
    }
    func visibleReceiptFile(_ actor: NativeCommunitySafetyActor?) -> URL? {
        visibleReceipt(actor) != nil && privateFile.ready ? privateFile.url : nil
    }
    private func clearFile() {
        do { try privateFile.clear() } catch { storageReady = false; message = "storage" }
    }
    func canResend(_ actor: NativeCommunitySafetyActor?) -> Bool {
        valid(actor) && pendingCommand(actor)?.scope == scope && resendLease?.valid(now: now(), uptime: uptime()) == true
    }
    func toggle(_ object: NativeProfileDataObject, actor: NativeCommunitySafetyActor?) {
        guard !busy, storageReady, pending == nil, visibleObjects(actor).contains(object) else { return }
        clearPreview()
        if selected.contains(object.id) { selected.remove(object.id) }
        else if scope == .sensitive { selected = [object.id] }
        else if selected.count < 20 { selected.insert(object.id) }
    }
    func load(nextPage: Bool = false, client: NativeProfileDataClient) async {
        bind(client.current())
        guard !busy, storageReady, pending == nil, let actor = client.current(), valid(actor), !Task.isCancelled else { return }
        let cursor = nextPage ? next : nil
        if nextPage && (cursor == nil || visibleObjects(actor).isEmpty) { return }
        lifetime.invalidate(); clearVisible()
        guard storageReady else { return }
        let generation = lifetime.generation, started = uptime(); busy = true
        defer { if lifetime.generation == generation { busy = false } }
        do {
            let command = try NativeProfileDataCommand.list(scope: scope, cursor: cursor)
            let bytes = try await client.request(command.body, actor); try check(generation, actor: actor, client: client)
            let page = try NativeProfileDataProtocol.list(bytes, command: command, actor: actor, now: now())
            listLease = try lease(start: started, expiresAt: page.expiresAt)
            objects = page.objects; next = page.next; message = nil
        } catch { failed(generation, actor: actor, client: client) }
    }
    func review(client: NativeProfileDataClient) async {
        guard !busy, storageReady, pending == nil, let actor = client.current(), !selected.isEmpty,
              selected.isSubset(of: Set(visibleObjects(actor).map(\.id))), !Task.isCancelled else { return }
        lifetime.invalidate(); clearPreview()
        guard storageReady else { return }
        let generation = lifetime.generation, started = uptime(); busy = true
        defer { if lifetime.generation == generation { busy = false } }
        do {
            let command: NativeProfileDataCommand
            if scope == .sensitive {
                guard selected.count == 1, let id = selected.first else { throw NativeDataError.invalidResponse }
                command = try .preview(profileID: id)
            } else { command = try .preview(ids: selected) }
            let bytes = try await client.request(command.body, actor); try check(generation, actor: actor, client: client)
            let result = try NativeProfileDataProtocol.preview(bytes, command: command, actor: actor, now: now())
            previewLease = try lease(start: started, expiresAt: result.binding.expiresAt)
            preview = result; previewCommand = command; message = result.eligible ? nil : "blocked"
        } catch { failed(generation, actor: actor, client: client) }
    }
    func erase(reviewed: NativeProfileDataBinding, client: NativeProfileDataClient) async {
        guard !busy, storageReady, pending == nil, let actor = client.current(),
              let value = visiblePreview(actor), value.eligible, value.binding == reviewed,
              let original = previewCommand, !Task.isCancelled else { return }
        do {
            let command = try original.confirmed(sourceDigest: reviewed.sourceDigest, previewDigest: reviewed.previewDigest)
            pending = try journal.retain(command.body, actor: actor)
            await send(command, reviewed: value, client: client)
        } catch { storageReady = false; message = "storage" }
    }
    /// A recovery is a read. A user retry requires a fresh authoritative unknown response.
    /// Transport, auth and malformed responses never make a pending write retryable.
    func resolve(client: NativeProfileDataClient, resend: Bool = false) async {
        bind(client.current())
        guard !busy, storageReady, let actor = client.current(), valid(actor), let pending,
              let command = pendingCommand(actor), command.scope == scope, !Task.isCancelled,
              !resend || canResend(actor) else { return }
        do {
            guard try journal.read(actor) == pending else { throw NativeDataError.staleSessionResponse }
            let command = try resend ? command : command.recovery()
            resendLease = nil
            await send(command, reviewed: nil, client: client)
        } catch { message = "unknown"; resendLease = nil }
    }
    private func send(_ command: NativeProfileDataCommand, reviewed: NativeProfileDataPreview?, client: NativeProfileDataClient) async {
        guard !busy, let actor = client.current(), valid(actor), let pending else { return }
        let generation = lifetime.generation, started = uptime(); busy = true; completion = nil; resendLease = nil
        defer { if lifetime.generation == generation { busy = false } }
        do {
            guard try journal.read(actor)?.body == (command.mutationBytes ?? command.body) else { throw NativeDataError.staleSessionResponse }
            let bytes = try await client.request(command.body, actor); try check(generation, actor: actor, client: client)
            guard let result = try NativeProfileDataProtocol.receipt(bytes, command: command, actor: actor, now: now()) else {
                guard command.action == "recover" else { throw NativeDataError.invalidResponse }
                clearPreview()
                resendLease = try lease(start: started, expiresAt: now().addingTimeInterval(30))
                message = "unknown"; return
            }
            if let reviewed {
                guard result.binding == reviewed.binding else { throw NativeDataError.invalidResponse }
                if scope == .sensitive {
                    guard result.decision.beforeProfileRevision == reviewed.summary?.profileRevision,
                          result.decision.beforePaceRevision == reviewed.summary?.paceRevision else { throw NativeDataError.invalidResponse }
                    for key in ["scopedEditContexts", "scopedEditWork", "recoveryContexts", "coreExports"] {
                        guard result.decision.retainedCopies.ids[key] == reviewed.copies.ids[key] else { throw NativeDataError.invalidResponse }
                    }
                }
            }
            let displayLease = try lease(start: started, expiresAt: now().addingTimeInterval(30))
            let inventory = try JSONSerialization.data(withJSONObject: NativeProfileDataWire.root(bytes), options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
            guard let inventoryText = String(data: inventory, encoding: .utf8) else { throw NativeDataError.invalidResponse }
            _ = try privateFile.write(bytes)
            try client.consumeReceipt(result, actor)
            try check(generation, actor: actor, client: client)
            try journal.complete(pending, actor: actor)
            self.pending = nil; clearVisible(keepFile: true)
            receiptInventory = inventoryText
            receipt = result; receiptLease = displayLease; completion = .init(receipt: result); message = "erased"
        } catch { failed(generation, actor: actor, client: client) }
    }
    func tick(client: NativeProfileDataClient) {
        bind(client.current())
        if listLease?.valid(now: now(), uptime: uptime()) != true { objects = []; selected = []; next = nil }
        if previewLease?.valid(now: now(), uptime: uptime()) != true { preview = nil; previewCommand = nil }
        if receiptLease?.valid(now: now(), uptime: uptime()) != true { receipt = nil; receiptInventory = nil; completion = nil; clearFile() }
        if resendLease?.valid(now: now(), uptime: uptime()) != true { resendLease = nil }
    }
    private func lease(start: TimeInterval, expiresAt: Date) throws -> NativeProfileDataLease {
        try .init(start: start, received: uptime(), now: now(), expiresAt: expiresAt)
    }
    private func check(_ generation: UUID, actor: NativeCommunitySafetyActor, client: NativeProfileDataClient) throws {
        guard !Task.isCancelled, lifetime.accepts(actor, generation: generation), client.current() == actor else { throw NativeDataError.staleSessionResponse }
    }
    private func failed(_ generation: UUID, actor: NativeCommunitySafetyActor, client: NativeProfileDataClient) {
        guard lifetime.accepts(actor, generation: generation), client.current() == actor else { return }
        clearPreview(); message = pending == nil ? "unavailable" : "unknown"
    }
    private func clearPreview(keepFile: Bool = false) {
        if !keepFile { clearFile() }
        preview = nil; previewCommand = nil; previewLease = nil; receipt = nil; receiptInventory = nil; receiptLease = nil; completion = nil; resendLease = nil
    }
    private func clearVisible(keepFile: Bool = false) { clearPreview(keepFile: keepFile); objects = []; selected = []; next = nil; listLease = nil }
}

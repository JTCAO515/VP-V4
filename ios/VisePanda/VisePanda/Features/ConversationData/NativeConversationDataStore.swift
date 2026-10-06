import Foundation
import Observation

@MainActor struct NativeConversationDataClient {
    let current: () -> NativeCommunitySafetyActor?
    let request: (Data, NativeCommunitySafetyActor) async throws -> Data
    let consumeReceipt: (NativeConversationDataReceipt, NativeCommunitySafetyActor) throws -> Void

    init(current: @escaping () -> NativeCommunitySafetyActor?,
         request: @escaping (Data, NativeCommunitySafetyActor) async throws -> Data,
         consumeReceipt: @escaping (NativeConversationDataReceipt, NativeCommunitySafetyActor) throws -> Void) {
        self.current = current; self.request = request; self.consumeReceipt = consumeReceipt
    }
}

struct NativeConversationDataCompletion: Identifiable {
    let id = UUID()
    let receipt: NativeConversationDataReceipt
}

@MainActor @Observable final class NativeConversationDataStore {
    let scope: NativeConversationDataScope
    private(set) var rootKind: NativeConversationDataRoot?
    private(set) var objects: [NativeConversationDataObject] = []
    private(set) var selected = Set<String>()
    private(set) var next: NativeConversationDataCursor?
    private(set) var preview: NativeConversationDataPreview?
    private(set) var receipt: NativeConversationDataReceipt?
    private var receiptInventory: String?
    private(set) var completion: NativeConversationDataCompletion?
    private(set) var pending: NativeCommunitySafetyPending?
    private(set) var busy = false
    private(set) var storageReady = true
    private(set) var message: String?
    private var lifetime = NativeConversationDataLifetime()
    private var listLease: NativeConversationDataLease?
    private var previewLease: NativeConversationDataLease?
    private var receiptLease: NativeConversationDataLease?
    private var previewCommand: NativeConversationDataCommand?
    private var resendLease: NativeConversationDataLease?
    private let journal: NativeConversationDataJournal
    private let now: () -> Date
    private let uptime: () -> TimeInterval

    init(scope: NativeConversationDataScope, vault: any NativeCredentialVault, now: @escaping () -> Date = Date.init,
         uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        self.scope = scope; rootKind = scope == .sensitive ? .conversation : nil
        journal = .init(vault: vault, validateConfirmation: NativeConversationDataCommand.validateConfirmation)
        self.now = now; self.uptime = uptime
    }

    func bind(_ actor: NativeCommunitySafetyActor?) {
        guard lifetime.bind(actor) else { return }
        clearVisible(); pending = nil; busy = false; message = nil; storageReady = true
        guard let actor else { return }
        do {
            pending = try journal.read(actor)
            if scope == .sensitive, let pending,
               let original = try? NativeConversationDataCommand(body: pending.body), original.scope == scope {
                rootKind = original.rootKind
            }
        }
        catch { storageReady = false; message = "storage" }
    }
    func suspend() { lifetime.suspend(); clearVisible(); pending = nil; busy = false; message = nil }
    private func valid(_ actor: NativeCommunitySafetyActor?) -> Bool {
        lifetime.accepts(actor: actor, generation: lifetime.generation)
    }
    func visibleObjects(_ actor: NativeCommunitySafetyActor?) -> [NativeConversationDataObject] {
        valid(actor) && listLease?.valid(now: now(), uptime: uptime()) == true ? objects : []
    }
    func visiblePreview(_ actor: NativeCommunitySafetyActor?) -> NativeConversationDataPreview? {
        valid(actor) && previewLease?.valid(now: now(), uptime: uptime()) == true ? preview : nil
    }
    func visibleReceipt(_ actor: NativeCommunitySafetyActor?) -> NativeConversationDataReceipt? {
        valid(actor) && receiptLease?.valid(now: now(), uptime: uptime()) == true ? receipt : nil
    }
    func visibleReceiptInventory(_ actor: NativeCommunitySafetyActor?) -> String? {
        visibleReceipt(actor) == nil ? nil : receiptInventory
    }
    func pendingCommand(_ actor: NativeCommunitySafetyActor?) -> NativeConversationDataCommand? {
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
    func canResend(_ actor: NativeCommunitySafetyActor?) -> Bool {
        valid(actor) && pendingCommand(actor)?.scope == scope && resendLease?.valid(now: now(), uptime: uptime()) == true
    }
    func selectRoot(_ root: NativeConversationDataRoot, actor: NativeCommunitySafetyActor?) {
        guard scope == .sensitive, valid(actor), storageReady, !busy, pending == nil, rootKind != root else { return }
        rootKind = root; lifetime.invalidate(); clearVisible()
    }
    func toggle(_ object: NativeConversationDataObject, actor: NativeCommunitySafetyActor?) {
        guard !busy, storageReady, pending == nil, visibleObjects(actor).contains(object) else { return }
        clearPreview()
        if selected.contains(object.id) { selected.remove(object.id) }
        else if scope == .sensitive { selected = [object.id] }
        else if selected.count < 20 { selected.insert(object.id) }
    }
    func load(nextPage: Bool = false, client: NativeConversationDataClient) async {
        bind(client.current())
        guard !busy, storageReady, pending == nil, let actor = client.current(), valid(actor), !Task.isCancelled else { return }
        let cursor = nextPage ? next : nil
        if nextPage && (cursor == nil || visibleObjects(actor).isEmpty) { return }
        lifetime.invalidate(); clearVisible()
        let generation = lifetime.generation, started = uptime(); busy = true
        defer { if lifetime.generation == generation { busy = false } }
        do {
            let command = try NativeConversationDataCommand.list(scope: scope, root: rootKind, cursor: cursor)
            let bytes = try await client.request(command.body, actor); try check(generation, actor: actor, client: client)
            let page = try NativeConversationDataProtocol.list(bytes, command: command, actor: actor, now: now())
            listLease = try lease(start: started, expiresAt: page.expiresAt)
            objects = page.objects; next = page.next; message = nil
        } catch { failed(generation, actor: actor, client: client) }
    }
    func review(client: NativeConversationDataClient) async {
        guard !busy, storageReady, pending == nil, let actor = client.current(), !selected.isEmpty,
              selected.isSubset(of: Set(visibleObjects(actor).map(\.id))), !Task.isCancelled else { return }
        lifetime.invalidate(); clearPreview()
        let generation = lifetime.generation, started = uptime(); busy = true
        defer { if lifetime.generation == generation { busy = false } }
        do {
            let command: NativeConversationDataCommand
            if scope == .sensitive {
                guard selected.count == 1, let rootKind, let id = selected.first else { throw NativeDataError.invalidResponse }
                command = try .preview(root: rootKind, id: id)
            } else { command = try .preview(ids: selected) }
            let bytes = try await client.request(command.body, actor); try check(generation, actor: actor, client: client)
            let result = try NativeConversationDataProtocol.preview(bytes, command: command, actor: actor, now: now())
            previewLease = try lease(start: started, expiresAt: result.binding.expiresAt)
            preview = result; previewCommand = command; message = result.eligible ? nil : "blocked"
        } catch { failed(generation, actor: actor, client: client) }
    }
    func erase(reviewed: NativeConversationDataBinding, client: NativeConversationDataClient) async {
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
    func resolve(client: NativeConversationDataClient, resend: Bool = false) async {
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
    private func send(_ command: NativeConversationDataCommand, reviewed: NativeConversationDataPreview?, client: NativeConversationDataClient) async {
        guard !busy, let actor = client.current(), valid(actor), let pending else { return }
        let generation = lifetime.generation, started = uptime(); busy = true; completion = nil; resendLease = nil
        defer { if lifetime.generation == generation { busy = false } }
        do {
            guard try journal.read(actor)?.body == (command.mutationBytes ?? command.body) else { throw NativeDataError.staleSessionResponse }
            let bytes = try await client.request(command.body, actor); try check(generation, actor: actor, client: client)
            guard let result = try NativeConversationDataProtocol.receipt(bytes, command: command, actor: actor, now: now()) else {
                guard command.action == "recover" else { throw NativeDataError.invalidResponse }
                clearPreview()
                resendLease = try lease(start: started, expiresAt: now().addingTimeInterval(NativeConversationDataWire.lifetime))
                message = "unknown"; return
            }
            if let reviewed {
                guard result.binding == reviewed.binding, result.graph == reviewed.graph,
                      result.erased == reviewed.erased, result.redacted == reviewed.redacted, result.retained == reviewed.retained else { throw NativeDataError.invalidResponse }
            }
            let displayLease = try lease(start: started, expiresAt: now().addingTimeInterval(NativeConversationDataWire.lifetime))
            let inventory = try JSONSerialization.data(withJSONObject: NativeConversationDataWire.root(bytes), options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
            guard let inventoryText = String(data: inventory, encoding: .utf8) else { throw NativeDataError.invalidResponse }
            try client.consumeReceipt(result, actor)
            try check(generation, actor: actor, client: client)
            try journal.complete(pending, actor: actor)
            self.pending = nil; clearVisible()
            receiptInventory = inventoryText
            receipt = result; receiptLease = displayLease; completion = .init(receipt: result); message = "erased"
        } catch { failed(generation, actor: actor, client: client) }
    }
    func tick(client: NativeConversationDataClient) {
        bind(client.current())
        if listLease?.valid(now: now(), uptime: uptime()) != true { objects = []; selected = []; next = nil }
        if previewLease?.valid(now: now(), uptime: uptime()) != true { preview = nil; previewCommand = nil }
        if receiptLease?.valid(now: now(), uptime: uptime()) != true { receipt = nil; receiptInventory = nil; completion = nil }
        if resendLease?.valid(now: now(), uptime: uptime()) != true { resendLease = nil }
    }
    private func lease(start: TimeInterval, expiresAt: Date) throws -> NativeConversationDataLease {
        try .init(start: start, received: uptime(), now: now(), expiresAt: expiresAt, maximumAge: NativeConversationDataWire.lifetime)
    }
    private func check(_ generation: UUID, actor: NativeCommunitySafetyActor, client: NativeConversationDataClient) throws {
        guard !Task.isCancelled, lifetime.accepts(actor: actor, generation: generation), client.current() == actor else { throw NativeDataError.staleSessionResponse }
    }
    private func failed(_ generation: UUID, actor: NativeCommunitySafetyActor, client: NativeConversationDataClient) {
        guard lifetime.accepts(actor: actor, generation: generation), client.current() == actor else { return }
        clearPreview(); message = pending == nil ? "unavailable" : "unknown"
    }
    private func clearPreview() {
        preview = nil; previewCommand = nil; previewLease = nil; receipt = nil; receiptInventory = nil; receiptLease = nil; completion = nil; resendLease = nil
    }
    private func clearVisible() { clearPreview(); objects = []; selected = []; next = nil; listLease = nil }
}

import Foundation
import Observation

@MainActor struct NativeCoverageProgressClient {
    let current: () -> NativeCommunitySafetyActor?
    let request: (Data, NativeCommunitySafetyActor) async throws -> Data
}
struct NativeCoverageProgressCompletion: Identifiable {
    let id = UUID()
    let requestID: String
    let objectIDs: [String]
    let action: String
}

@MainActor @Observable final class NativeCoverageProgressStore {
    private(set) var objects: [NativeCoverageProgressObject] = []
    private(set) var next: NativeCoverageProgressCursor?
    private(set) var selected = Set<String>()
    private(set) var preview: NativeCoverageProgressPreview?
    private(set) var pending: NativeCommunitySafetyPending?
    private(set) var receipt: NativeCoverageProgressReceipt?
    private(set) var completion: NativeCoverageProgressCompletion?
    private(set) var busy = false
    private(set) var storageReady = false
    private(set) var message: String?
    private var lifetime = NativeCoverageProgressLifetime()
    private var listLease: NativeCoverageProgressLease?
    private var previewLease: NativeCoverageProgressLease?
    private var receiptLease: NativeCoverageProgressLease?
    private var previewCommand: NativeCoverageProgressCommand?
    private let journal: NativeCoverageProgressJournal
    private let file: NativeCoverageProgressExportFile
    private let now: () -> Date
    private let uptime: () -> TimeInterval

    init(vault: any NativeCredentialVault = NativeKeychainVault(), file: NativeCoverageProgressExportFile? = nil,
         now: @escaping () -> Date = Date.init, uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        journal = .init(vault: vault, validateErase: NativeCoverageProgressCommand.validateErase)
        self.file = file ?? .init(now: now, uptime: uptime)
        self.now = now; self.uptime = uptime
        storageReady = self.file.ready
    }

    func bind(_ actor: NativeCommunitySafetyActor?) {
        guard lifetime.bind(actor) else { return }
        clearVisible(); pending = nil; busy = false
        guard let actor, storageReady else { return }
        do { pending = try journal.read(actor) }
        catch { storageReady = false; message = "storage" }
    }
    func suspend() { lifetime.suspend(); clearVisible(); pending = nil; busy = false }
    private func valid(_ actor: NativeCommunitySafetyActor?) -> Bool { lifetime.accepts(actor: actor, generation: lifetime.generation) }
    func visibleObjects(_ actor: NativeCommunitySafetyActor?) -> [NativeCoverageProgressObject] {
        valid(actor) && listLease?.valid(now: now(), uptime: uptime()) == true ? objects : []
    }
    func visiblePreview(_ actor: NativeCommunitySafetyActor?) -> NativeCoverageProgressPreview? {
        valid(actor) && previewLease?.valid(now: now(), uptime: uptime()) == true ? preview : nil
    }
    func visibleReceipt(_ actor: NativeCommunitySafetyActor?) -> NativeCoverageProgressReceipt? {
        valid(actor) && receiptLease?.valid(now: now(), uptime: uptime()) == true ? receipt : nil
    }
    func exportURL(_ actor: NativeCommunitySafetyActor?) -> URL? {
        valid(actor) ? file.visible(actor: actor, generation: lifetime.generation) : nil
    }
    func pendingCommand(_ actor: NativeCommunitySafetyActor?) -> NativeCoverageProgressCommand? {
        guard valid(actor), let actor, let pending, pending.matches(actor.scope, sessionID: actor.sessionID) else { return nil }
        return try? .init(body: pending.body)
    }
    func tick(_ client: NativeCoverageProgressClient) {
        bind(client.current())
        do { try file.tick(actor: client.current(), generation: lifetime.generation) }
        catch { storageReady = false; completion = nil; message = "storage" }
        if listLease?.valid(now: now(), uptime: uptime()) != true { objects = []; next = nil; selected = [] }
        if previewLease?.valid(now: now(), uptime: uptime()) != true { preview = nil; previewCommand = nil }
        if receiptLease?.valid(now: now(), uptime: uptime()) != true { receipt = nil }
    }
    func toggle(_ object: NativeCoverageProgressObject, actor: NativeCommunitySafetyActor?) {
        guard !busy, storageReady, pending == nil, visibleObjects(actor).contains(object) else { return }
        clearPreview()
        guard storageReady else { return }
        if selected.contains(object.id) { selected.remove(object.id) }
        else if selected.count < 20 { selected.insert(object.id) }
    }
    func load(nextPage: Bool = false, client: NativeCoverageProgressClient) async {
        bind(client.current())
        guard !busy, storageReady, let actor = client.current(), valid(actor), !Task.isCancelled else { return }
        let cursor = nextPage ? next : nil
        if nextPage && (cursor == nil || visibleObjects(actor).isEmpty) { return }
        lifetime.invalidate(); clearVisible()
        guard storageReady else { return }
        let generation = lifetime.generation, started = uptime()
        busy = true
        defer { if lifetime.generation == generation { busy = false } }
        do {
            let command = try NativeCoverageProgressCommand.list(cursor: cursor)
            let bytes = try await client.request(command.body, actor)
            try check(generation, actor: actor, client: client)
            let page = try NativeCoverageProgressProtocol.list(bytes, command: command, actor: actor, now: now())
            listLease = try .init(start: started, received: uptime(), now: now(), expiry: page.expiry)
            objects = page.objects; next = page.next; message = nil
        } catch { failed(generation, actor: actor, client: client) }
    }
    func review(client: NativeCoverageProgressClient) async {
        guard !busy, storageReady, pending == nil, let actor = client.current(), !selected.isEmpty,
              selected.isSubset(of: Set(visibleObjects(actor).map(\.id))), !Task.isCancelled else { return }
        lifetime.invalidate(); clearPreview()
        guard storageReady else { return }
        let generation = lifetime.generation, started = uptime()
        busy = true
        defer { if lifetime.generation == generation { busy = false } }
        do {
            let command = try NativeCoverageProgressCommand.preview(selected)
            let bytes = try await client.request(command.body, actor)
            try check(generation, actor: actor, client: client)
            let value = try NativeCoverageProgressProtocol.preview(bytes, command: command, actor: actor, now: now())
            previewLease = try .init(start: started, received: uptime(), now: now(), expiry: value.binding.expiresAt)
            preview = value; previewCommand = command; message = nil
        } catch { failed(generation, actor: actor, client: client) }
    }
    func execute(action: String, reviewed: NativeCoverageProgressBinding, client: NativeCoverageProgressClient) async {
        guard !busy, storageReady, pending == nil, let actor = client.current(),
              visiblePreview(actor)?.binding == reviewed, let original = previewCommand,
              ["export", "erase"].contains(action), !Task.isCancelled else { return }
        let generation = lifetime.generation, started = uptime()
        busy = true; completion = nil
        defer { if lifetime.generation == generation { busy = false } }
        do {
            let command = try original.confirmed(action: action, digest: reviewed.previewDigest)
            if action == "erase" { pending = try journal.retain(command.body, actor: actor) }
            let bytes = try await client.request(command.body, actor)
            try check(generation, actor: actor, client: client)
            if action == "export" {
                let binding = try NativeCoverageProgressProtocol.bundle(bytes, command: command, reviewed: reviewed, actor: actor, now: now())
                try file.write(bytes, actor: actor, generation: generation, started: started, expiry: binding.expiresAt,
                    current: client.current, currentGeneration: { self.lifetime.generation })
                guard exportURL(actor) != nil else { throw NativeDataError.staleSessionResponse }
                preview = nil; previewLease = nil; previewCommand = nil
                publish(binding, action: "export"); message = "file"
            } else { try accept(bytes, command: command, actor: actor, started: started) }
        } catch { failed(generation, actor: actor, client: client) }
    }
    func recover(client: NativeCoverageProgressClient) async {
        bind(client.current())
        guard !busy, storageReady, let actor = client.current(), valid(actor), let pending, !Task.isCancelled else { return }
        lifetime.invalidate(); clearVisible()
        guard storageReady else { return }
        let generation = lifetime.generation, started = uptime()
        busy = true
        defer { if lifetime.generation == generation { busy = false } }
        do {
            let command = try NativeCoverageProgressCommand(body: pending.body).recovery()
            let bytes = try await client.request(command.body, actor)
            try check(generation, actor: actor, client: client)
            try accept(bytes, command: command, actor: actor, started: started)
        } catch { failed(generation, actor: actor, client: client) }
    }
    private func accept(_ bytes: Data, command: NativeCoverageProgressCommand, actor: NativeCommunitySafetyActor, started: TimeInterval) throws {
        let wall = now()
        guard let result = try NativeCoverageProgressProtocol.erased(bytes, command: command, actor: actor, now: wall) else {
            message = "unknown"; return
        }
        let lease = try NativeCoverageProgressLease(start: started, received: uptime(), now: wall, expiry: wall.addingTimeInterval(30))
        guard let pending else { throw NativeDataError.invalidResponse }
        clearVisible()
        guard storageReady else { throw NativeDataError.sessionUnavailable }
        try journal.complete(pending, actor: actor)
        self.pending = nil; receipt = result; receiptLease = lease
        publish(result.binding, action: "delete"); message = "erased"
    }
    private func publish(_ binding: NativeCoverageProgressBinding, action: String) {
        completion = .init(requestID: binding.requestID, objectIDs: binding.objectIDs, action: action)
    }
    private func check(_ generation: UUID, actor: NativeCommunitySafetyActor, client: NativeCoverageProgressClient) throws {
        guard !Task.isCancelled, lifetime.accepts(actor: actor, generation: generation), client.current() == actor else {
            throw NativeDataError.staleSessionResponse
        }
    }
    private func failed(_ generation: UUID, actor: NativeCommunitySafetyActor, client: NativeCoverageProgressClient) {
        guard lifetime.accepts(actor: actor, generation: generation), client.current() == actor else { return }
        clearPreview(); receipt = nil; receiptLease = nil; completion = nil
        message = pending == nil ? "unavailable" : "unknown"
    }
    private func clearPreview() {
        preview = nil; previewCommand = nil; previewLease = nil; receipt = nil; receiptLease = nil; completion = nil
        do { try file.clear(); storageReady = file.ready } catch { storageReady = false; message = "storage" }
    }
    private func clearVisible() {
        objects = []; next = nil; selected = []; listLease = nil
        clearPreview()
    }
}

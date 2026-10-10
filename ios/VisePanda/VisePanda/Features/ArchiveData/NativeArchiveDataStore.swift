import Foundation
import Observation

@MainActor struct NativeArchiveDataClient {
    let current: () -> NativeCommunitySafetyActor?
    let request: (Data, NativeCommunitySafetyActor) async throws -> Data
}
struct NativeArchiveDataCompletion: Identifiable {
    let id = UUID()
    let binding: NativeArchiveDataBinding
    let action: String
}

@MainActor @Observable final class NativeArchiveDataStore {
    var journalObservation: NativeJournalDataObservation?

    let scope: NativeArchiveDataScope
    private(set) var objects: [NativeArchiveDataObject] = []
    private(set) var next: NativeArchiveDataCursor?
    private(set) var selected = Set<String>()
    private(set) var preview: NativeArchiveDataPreview?
    private(set) var pending: NativeCommunitySafetyPending?
    private(set) var receipt: NativeArchiveDataReceipt?
    private(set) var completion: NativeArchiveDataCompletion?
    private(set) var busy = false
    private(set) var storageReady = false
    private(set) var message: String?
    private var lifetime = NativeArchiveDataLifetime()
    private var listLease: NativeArchiveDataLease?
    private var previewLease: NativeArchiveDataLease?
    private var receiptLease: NativeArchiveDataLease?
    private var previewCommand: NativeArchiveDataCommand?
    private var exportCommand: NativeArchiveDataCommand?
    private var exportBinding: NativeArchiveDataBinding?
    private let journal: NativeArchiveDataJournal
    private let file: NativeArchiveDataExportFile
    private let now: () -> Date
    private let uptime: () -> TimeInterval

    init(scope: NativeArchiveDataScope, vault: any NativeCredentialVault = NativeKeychainVault(), file: NativeArchiveDataExportFile? = nil,
         now: @escaping () -> Date = Date.init, uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        self.scope = scope; journal = .init(vault: vault, validateConfirmation: NativeArchiveDataCommand.validateConfirmation)
        self.file = file ?? .init(now: now, uptime: uptime); self.now = now; self.uptime = uptime
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
    func visibleObjects(_ actor: NativeCommunitySafetyActor?) -> [NativeArchiveDataObject] {
        valid(actor) && listLease?.valid(now: now(), uptime: uptime()) == true ? objects : []
    }
    func visiblePreview(_ actor: NativeCommunitySafetyActor?) -> NativeArchiveDataPreview? {
        valid(actor) && previewLease?.valid(now: now(), uptime: uptime()) == true ? preview : nil
    }
    func visibleReceipt(_ actor: NativeCommunitySafetyActor?) -> NativeArchiveDataReceipt? {
        valid(actor) && receiptLease?.valid(now: now(), uptime: uptime()) == true ? receipt : nil
    }
    func pendingCommand(_ actor: NativeCommunitySafetyActor?) -> NativeArchiveDataCommand? {
        guard valid(actor), let actor, let pending, pending.matches(actor.scope, sessionID: actor.sessionID) else { return nil }
        return try? .init(body: pending.body)
    }
    func deletionSelection(_ actor: NativeCommunitySafetyActor?) -> NativeLinkedTripDeleteSelection? {
        guard scope == .trip, !busy, pending == nil, let actor, let trip = visibleObjects(actor).first(where: { selected.contains($0.id) })?.trip else { return nil }
        return .init(scope: actor.scope, tripID: trip.id, headVersion: trip.headVersion)
    }
    func toggle(_ object: NativeArchiveDataObject, actor: NativeCommunitySafetyActor?) {
        guard !busy, storageReady, pending == nil, visibleObjects(actor).contains(object) else { return }
        clearPreview(); guard storageReady else { return }
        if selected.contains(object.id) { selected.remove(object.id) }
        else if scope == .trip { selected = [object.id] }
        else if selected.count < 20 { selected.insert(object.id) }
    }
    func load(nextPage: Bool = false, client: NativeArchiveDataClient) async {
        bind(client.current())
        guard !busy, storageReady, pending == nil, let actor = client.current(), valid(actor), !Task.isCancelled else { return }
        let cursor = nextPage ? next : nil
        if nextPage && (cursor == nil || visibleObjects(actor).isEmpty) { return }
        lifetime.invalidate(); clearVisible(); guard storageReady else { return }
        let generation = lifetime.generation, started = uptime(); busy = true
        defer { if lifetime.generation == generation { busy = false } }
        do {
            let command = try NativeArchiveDataCommand.list(scope: scope, cursor: cursor)
            let bytes = try await client.request(command.body, actor); try check(generation, actor: actor, client: client)
            let page = try NativeArchiveDataProtocol.list(bytes, command: command, actor: actor, now: now())
            listLease = try .init(start: started, received: uptime(), now: now(), expiry: page.expiry)
            objects = page.objects; next = page.next; message = nil
        } catch { failed(generation, actor: actor, client: client) }
    }
    func review(client: NativeArchiveDataClient) async {
        guard !busy, storageReady, pending == nil, let actor = client.current(), !selected.isEmpty,
              selected.isSubset(of: Set(visibleObjects(actor).map(\.id))), !Task.isCancelled else { return }
        lifetime.invalidate(); clearPreview(); guard storageReady else { return }
        let generation = lifetime.generation, started = uptime(); busy = true
        defer { if lifetime.generation == generation { busy = false } }
        do {
            let command: NativeArchiveDataCommand
            if scope == .trip {
                guard selected.count == 1, let trip = objects.first(where: { selected.contains($0.id) })?.trip else { throw NativeDataError.invalidResponse }
                command = try .preview(trip: trip)
            } else { command = try .preview(ids: selected) }
            let bytes = try await client.request(command.body, actor); try check(generation, actor: actor, client: client)
            let value = try NativeArchiveDataProtocol.preview(bytes, command: command, actor: actor, now: now())
            previewLease = try .init(start: started, received: uptime(), now: now(), expiry: value.binding.expiresAt)
            preview = value; previewCommand = command; message = nil
        } catch { failed(generation, actor: actor, client: client) }
    }
    func execute(action: String, reviewed: NativeArchiveDataBinding, client: NativeArchiveDataClient) async {
        guard !busy, storageReady, pending == nil, let actor = client.current(),
              visiblePreview(actor)?.binding == reviewed, let original = previewCommand,
              action == "export" || action == "erase" && scope == .progress, !Task.isCancelled else { return }
        do {
            let command = try original.confirmed(action: action, digest: reviewed.previewDigest)
            pending = try journal.retain(command.body, actor: actor)
            await send(command, reviewed: preview, client: client)
        } catch { message = "storage" }
    }
    /// Export retries resend the original bytes only after the user's explicit action.
    /// Progress recovery is read-only and embeds the exact original erase body.
    func resolve(client: NativeArchiveDataClient, resend: Bool = false) async {
        bind(client.current())
        guard !busy, storageReady, let actor = client.current(), valid(actor), let pending, !Task.isCancelled else { return }
        do {
            let original = try NativeArchiveDataCommand(body: pending.body)
            guard original.scope == scope, original.action == "erase" || resend else { return }
            let command = try resend ? original : original.recovery()
            await send(command, reviewed: nil, client: client)
        } catch { message = "unknown" }
    }
    private func send(_ command: NativeArchiveDataCommand, reviewed: NativeArchiveDataPreview?, client: NativeArchiveDataClient) async {
        guard !busy, let actor = client.current(), valid(actor), let pending else { return }
        let generation = lifetime.generation, started = uptime(); busy = true; completion = nil
        defer { if lifetime.generation == generation { busy = false } }
        do {
            let bytes = try await client.request(command.body, actor); try check(generation, actor: actor, client: client)
            if command.action == "export" {
                let binding = try NativeArchiveDataProtocol.bundle(bytes, command: command, reviewed: reviewed, actor: actor, now: now())
                try file.write(bytes, actor: actor, generation: generation, started: started, expiry: binding.expiresAt,
                    current: client.current, currentGeneration: { self.lifetime.generation })
                exportCommand = command; exportBinding = binding
                guard try await validate(client: client, actor: actor, generation: generation) != nil else { throw NativeDataError.staleSessionResponse }
                let journalTicket = journalObservation?.begin()
                try journal.complete(pending, actor: actor); self.pending = nil
                journalObservation?.finish(journalTicket, binding.requestID)
                preview = nil; previewLease = nil; previewCommand = nil
                completion = .init(binding: binding, action: "export"); message = "file"
            } else {
                guard let result = try NativeArchiveDataProtocol.erased(bytes, command: command, actor: actor, now: now()) else { message = "unknown"; return }
                let lease = try NativeArchiveDataLease(start: started, received: uptime(), now: now(), expiry: now().addingTimeInterval(30))
                clearVisible(); guard storageReady else { throw NativeDataError.sessionUnavailable }
                let journalTicket = journalObservation?.begin()
                try journal.complete(pending, actor: actor); self.pending = nil
                journalObservation?.finish(journalTicket, result.binding.requestID)
                receipt = result; receiptLease = lease; completion = .init(binding: result.binding, action: "delete"); message = "erased"
            }
        } catch { failed(generation, actor: actor, client: client) }
    }
    /// Every display tick and every share/reopen passes the server's live CAS.
    /// A cached path alone never authorizes opening the private file.
    func share(client: NativeArchiveDataClient) async -> URL? {
        guard !busy, let actor = client.current(), valid(actor) else { return nil }
        let generation = lifetime.generation; busy = true
        defer { if lifetime.generation == generation { busy = false } }
        do { return try await validate(client: client, actor: actor, generation: generation) }
        catch { failed(generation, actor: actor, client: client); return nil }
    }
    func tick(client: NativeArchiveDataClient) async {
        bind(client.current())
        do { try file.tick(actor: client.current(), generation: lifetime.generation) }
        catch { storageReady = false; completion = nil; message = "storage" }
        if listLease?.valid(now: now(), uptime: uptime()) != true { objects = []; next = nil; selected = [] }
        if previewLease?.valid(now: now(), uptime: uptime()) != true { preview = nil; previewCommand = nil }
        if receiptLease?.valid(now: now(), uptime: uptime()) != true { receipt = nil }
        if !busy, exportCommand != nil { _ = await share(client: client) }
    }
    private func validate(client: NativeArchiveDataClient, actor: NativeCommunitySafetyActor, generation: UUID) async throws -> URL? {
        guard let original = exportCommand, let binding = exportBinding,
              file.visible(actor: actor, generation: generation) != nil else { throw NativeDataError.staleSessionResponse }
        let command = try original.validation(), started = uptime()
        let bytes = try await client.request(command.body, actor); try check(generation, actor: actor, client: client)
        guard uptime() - started < 30 else { throw NativeDataError.staleSessionResponse }
        try NativeArchiveDataProtocol.validated(bytes, command: command, original: original, binding: binding, actor: actor, now: now())
        return file.visible(actor: actor, generation: generation)
    }
    func discardUncertainExport(actor: NativeCommunitySafetyActor?) {
        guard !busy, let actor, valid(actor), let pending,
              (try? NativeArchiveDataCommand(body: pending.body).action) == "export" else { return }
        do { try journal.complete(pending, actor: actor); self.pending = nil; lifetime.invalidate(); clearVisible(); message = nil }
        catch { storageReady = false; message = "storage" }
    }
    private func check(_ generation: UUID, actor: NativeCommunitySafetyActor, client: NativeArchiveDataClient) throws {
        guard !Task.isCancelled, lifetime.accepts(actor: actor, generation: generation), client.current() == actor else { throw NativeDataError.staleSessionResponse }
    }
    private func failed(_ generation: UUID, actor: NativeCommunitySafetyActor, client: NativeArchiveDataClient) {
        guard lifetime.accepts(actor: actor, generation: generation), client.current() == actor else { return }
        clearPreview(); message = pending == nil ? "unavailable" : "unknown"
    }
    private func clearPreview() {
        preview = nil; previewCommand = nil; previewLease = nil; receipt = nil; receiptLease = nil; completion = nil
        exportCommand = nil; exportBinding = nil
        do { try file.clear(); storageReady = file.ready } catch { storageReady = false; message = "storage" }
    }
    private func clearVisible() { objects = []; next = nil; selected = []; listLease = nil; clearPreview() }
}

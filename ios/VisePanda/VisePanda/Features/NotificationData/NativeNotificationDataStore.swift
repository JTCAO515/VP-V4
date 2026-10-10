import Foundation
import Observation

@MainActor struct NativeNotificationDataClient {
    let current: () -> NativeCommunitySafetyActor?
    let request: (Data, NativeCommunitySafetyActor) async throws -> Data
}

struct NativeNotificationDataCompletion: Identifiable {
    let id = UUID()
    let scope: NativeNotificationDataScope
    let requestID: String
    let objectIDs: [String]
    let action: String
}

/// Selection, preview, dispatch and recovery all use one original actor and
/// generation. Journals survive hiding; sensitive previews and files do not.
@MainActor @Observable final class NativeNotificationDataStore {
    var journalObservation: NativeJournalDataObservation?

    private(set) var objects: [NativeNotificationDataObject] = []
    private(set) var next: NativeNotificationDataCursor?
    private(set) var selectedIDs = Set<String>()
    private(set) var preview: NativeNotificationDataPreview?
    private(set) var pending: NativeNotificationDataPending?
    private(set) var receipt: NativeNotificationDataReceipt?
    private(set) var completion: NativeNotificationDataCompletion?
    private(set) var busy = false
    private(set) var message: String?
    private(set) var storageReady = false
    private(set) var scope: NativeNotificationDataScope
    private var lifetime = NativeNotificationDataLifetime()
    private var listLease: NativeNotificationDataLease?
    private var previewLease: NativeNotificationDataLease?
    private var receiptLease: NativeNotificationDataLease?
    private var previewCommand: NativeNotificationDataCommand?
    private let journal: NativeNotificationDataJournal
    private let file: NativeNotificationDataExportFile
    private let now: () -> Date
    private let uptime: () -> TimeInterval

    init(scope: NativeNotificationDataScope, vault: any NativeCredentialVault = NativeKeychainVault(),
         file: NativeNotificationDataExportFile? = nil,
         now: @escaping () -> Date = Date.init,
         uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        self.scope = scope; self.journal = .init(vault: vault)
        self.file = file ?? NativeNotificationDataExportFile(uptime: uptime, now: now)
        self.now = now; self.uptime = uptime
    }

    func bind(_ actor: NativeCommunitySafetyActor?) {
        guard lifetime.actor != actor || lifetime.active != (actor != nil) else { return }
        lifetime.bind(actor, active: actor != nil)
        clearVisible(); pending = nil; busy = false
        guard let actor, storageReady else { return }
        do { pending = try journal.read(actor) } catch { storageReady = false; message = "storageOrSession" }
    }

    func suspend() {
        lifetime.suspend(); clearVisible(); pending = nil; busy = false
    }

    func clearSelection() {
        guard !busy else { return }
        lifetime.advance(); clearVisible()
    }

    func visibleObjects(_ actor: NativeCommunitySafetyActor?) -> [NativeNotificationDataObject] {
        valid(actor) && listLease?.valid(uptime: uptime(), now: now()) == true ? objects : []
    }
    func visiblePreview(_ actor: NativeCommunitySafetyActor?) -> NativeNotificationDataPreview? {
        valid(actor) && previewLease?.valid(uptime: uptime(), now: now()) == true ? preview : nil
    }
    func visibleReceipt(_ actor: NativeCommunitySafetyActor?) -> NativeNotificationDataReceipt? {
        valid(actor) && receiptLease?.valid(uptime: uptime(), now: now()) == true ? receipt : nil
    }
    func exportURL(_ actor: NativeCommunitySafetyActor?) -> URL? {
        guard valid(actor) else { return nil }
        return file.visible(current: actor, generation: lifetime.generation)
    }
    func pendingCommand(_ actor: NativeCommunitySafetyActor?) -> NativeNotificationDataCommand? {
        guard valid(actor), let actor, let pending, pending.matches(actor.scope, sessionID: actor.sessionID) else { return nil }
        return try? NativeNotificationDataCommand(body: pending.body)
    }

    func tick(_ client: NativeNotificationDataClient) {
        bind(client.current())
        do { try file.tick(current: client.current(), generation: lifetime.generation) }
        catch { storageReady = false; message = "cleanupRequired"; completion = nil }
        if listLease?.valid(uptime: uptime(), now: now()) != true { objects = []; next = nil; selectedIDs = [] }
        if previewLease?.valid(uptime: uptime(), now: now()) != true { preview = nil; previewCommand = nil }
        if receiptLease?.valid(uptime: uptime(), now: now()) != true { receipt = nil }
    }

    func load(nextPage: Bool = false, client: NativeNotificationDataClient) async {
        bind(client.current())
        guard !busy, storageReady, let actor = client.current(), valid(actor), !Task.isCancelled else { return }
        let cursor = nextPage ? next : nil
        if nextPage && (cursor == nil || visibleObjects(actor).isEmpty) { return }
        lifetime.advance(); clearVisible()
        guard storageReady else { return }
        let own = lifetime.generation, started = uptime()
        busy = true
        defer { if lifetime.generation == own { busy = false } }
        do {
            let command = try NativeNotificationDataCommand.list(scope: scope, cursor: cursor)
            let bytes = try await client.request(command.body, actor)
            try check(own, actor: actor, client: client)
            let page = try NativeNotificationDataProtocol.list(bytes, command: command, actor: actor, now: now())
            listLease = try .init(started: started, received: uptime(), now: now(), expiresAt: page.expiresAt)
            objects = page.objects; next = page.next; message = nil
        } catch { failed(error, own: own, actor: actor, client: client) }
    }

    func toggle(_ object: NativeNotificationDataObject, actor: NativeCommunitySafetyActor?) {
        guard !busy, pending == nil, storageReady, visibleObjects(actor).contains(object) else { return }
        clearPreviewAndFile()
        if selectedIDs.contains(object.id) { selectedIDs.remove(object.id) }
        else if selectedIDs.count < 20 { selectedIDs.insert(object.id) }
    }

    func review(client: NativeNotificationDataClient) async {
        guard !busy, storageReady, pending == nil, let actor = client.current(),
              !selectedIDs.isEmpty, selectedIDs.isSubset(of: Set(visibleObjects(actor).map(\.id))) else { return }
        lifetime.advance(); clearPreviewAndFile()
        guard storageReady else { return }
        let own = lifetime.generation, started = uptime()
        busy = true
        defer { if lifetime.generation == own { busy = false } }
        do {
            let command = try NativeNotificationDataCommand.preview(scope: scope, objectIDs: Array(selectedIDs))
            let bytes = try await client.request(command.body, actor)
            try check(own, actor: actor, client: client)
            let value = try NativeNotificationDataProtocol.preview(bytes, command: command, actor: actor, now: now())
            previewLease = try .init(started: started, received: uptime(), now: now(), expiresAt: value.binding.expiresAt)
            preview = value; previewCommand = command; message = nil
        } catch { failed(error, own: own, actor: actor, client: client) }
    }

    func execute(action: String, reviewed: NativeNotificationDataBinding, client: NativeNotificationDataClient) async {
        guard !busy, storageReady, pending == nil, let actor = client.current(),
              let visible = visiblePreview(actor), visible.binding == reviewed, let original = previewCommand,
              ["export", "erase"].contains(action), !Task.isCancelled else { return }
        let own = lifetime.generation, started = uptime()
        busy = true; completion = nil
        defer { if lifetime.generation == own { busy = false } }
        do {
            let command = try original.confirmed(action: action, previewDigest: reviewed.previewDigest)
            if action == "erase" { pending = try journal.retain(validatedEraseBytes: command.body, actor: actor) }
            let bytes = try await client.request(command.body, actor)
            try check(own, actor: actor, client: client)
            if action == "export" {
                let binding = try NativeNotificationDataProtocol.bundle(bytes, command: command, preview: reviewed, actor: actor, now: now())
                try file.write(bytes, actor: actor, generation: own, started: started, expiresAt: binding.expiresAt,
                    current: client.current, currentGeneration: { self.lifetime.generation })
                guard file.visible(current: client.current(), generation: own) != nil else { throw NativeDataError.staleSessionResponse }
                preview = nil; previewCommand = nil; previewLease = nil
                publish(binding, action: "export"); message = "fileReady"
            } else { try accept(bytes, command: command, actor: actor, started: started) }
        } catch { failed(error, own: own, actor: actor, client: client) }
    }

    func recover(client: NativeNotificationDataClient) async {
        bind(client.current())
        guard !busy, storageReady, let actor = client.current(), valid(actor), let pending, !Task.isCancelled else { return }
        lifetime.advance(); clearVisible()
        guard storageReady else { return }
        let own = lifetime.generation, started = uptime()
        busy = true
        defer { if lifetime.generation == own { busy = false } }
        do {
            let command = try NativeNotificationDataCommand(body: pending.body).recovery()
            let bytes = try await client.request(command.body, actor)
            try check(own, actor: actor, client: client)
            try accept(bytes, command: command, actor: actor, started: started)
        } catch { failed(error, own: own, actor: actor, client: client) }
    }

    private func accept(_ bytes: Data, command: NativeNotificationDataCommand,
                        actor: NativeCommunitySafetyActor, started: TimeInterval) throws {
        let received = uptime(), wall = now()
        switch try NativeNotificationDataProtocol.erased(bytes, command: command, actor: actor, now: wall) {
        case .unknown: message = "receiptUnknown" // Keep the durable journal and original operation.
        case .erased(let receipt):
            let lease = try NativeNotificationDataLease(started: started, received: received, now: wall, expiresAt: wall.addingTimeInterval(30))
            guard let pending else { throw NativeDataError.invalidResponse }
            clearVisible()
            guard storageReady else { throw NativeDataError.sessionUnavailable }
            let journalTicket = journalObservation?.begin()
            try journal.complete(pending, actor: actor)
            journalObservation?.finish(journalTicket, receipt.binding.requestID)
            self.pending = nil
            self.receipt = receipt; receiptLease = lease
            publish(receipt.binding, action: "delete"); message = "erased"
        }
    }

    func retryCleanup(_ client: NativeNotificationDataClient) {
        guard !busy, let actor = client.current(), valid(actor) else { return }
        clearVisible()
        guard storageReady else { return }
        do { pending = try journal.read(actor); message = pending == nil ? nil : "receiptUnknown" }
        catch { storageReady = false; message = "storageOrSession" }
    }

    private func publish(_ binding: NativeNotificationDataBinding, action: String) {
        completion = .init(scope: binding.scope, requestID: binding.requestID, objectIDs: binding.objectIDs, action: action)
    }
    private func valid(_ actor: NativeCommunitySafetyActor?) -> Bool {
        guard let actor else { return false }
        return lifetime.accepts(lifetime.generation, actor: actor, current: actor)
    }
    private func check(_ own: UUID, actor: NativeCommunitySafetyActor, client: NativeNotificationDataClient) throws {
        guard lifetime.accepts(own, actor: actor, current: client.current()), !Task.isCancelled else { throw NativeDataError.staleSessionResponse }
    }
    private func clearPreviewAndFile() {
        preview = nil; previewCommand = nil; previewLease = nil; receipt = nil; receiptLease = nil; completion = nil
        do { try file.clear(); storageReady = true } catch { storageReady = false; message = "cleanupRequired" }
    }
    private func clearVisible() { objects = []; next = nil; selectedIDs = []; listLease = nil; clearPreviewAndFile() }
    private func failed(_ error: Error, own: UUID, actor: NativeCommunitySafetyActor, client: NativeNotificationDataClient) {
        guard lifetime.generation == own else { return }
        if client.current() != actor { bind(client.current()); return }
        clearPreviewAndFile()
        message = pending == nil ? "unavailable" : "receiptUnknown"
    }
}

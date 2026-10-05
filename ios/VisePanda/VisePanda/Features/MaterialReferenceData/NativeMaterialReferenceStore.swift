import Foundation
import Observation

@MainActor struct NativeMaterialReferenceClient {
    let current: () -> NativeCommunitySafetyActor?
    let request: (Data, NativeCommunitySafetyActor) async throws -> Data
}

struct NativeMaterialReferenceCompletion: Identifiable {
    let id = UUID()
    let scope: NativeMaterialReferenceScope
    let requestID: String
    let tripID: String
    let objectIDs: [String]
    let action: String
}

/// Selection, preview, dispatch and recovery all use one original actor and
/// generation. Journals survive hiding; sensitive previews and files do not.
@MainActor @Observable final class NativeMaterialReferenceStore {
    private(set) var objects: [NativeMaterialReferenceObject] = []
    private(set) var next: NativeMaterialReferenceCursor?
    private(set) var selectedIDs = Set<String>()
    private(set) var preview: NativeMaterialReferencePreview?
    private(set) var pending: NativeMaterialReferencePending?
    private(set) var receipt: NativeMaterialReferenceReceipt?
    private(set) var completion: NativeMaterialReferenceCompletion?
    private(set) var busy = false
    private(set) var message: String?
    private(set) var storageReady = false
    private(set) var scope: NativeMaterialReferenceScope
    private var trip: NativeMaterialReferenceTrip?
    private var lifetime = NativeMaterialReferenceLifetime()
    private var listLease: NativeMaterialReferenceLease?
    private var previewLease: NativeMaterialReferenceLease?
    private var receiptLease: NativeMaterialReferenceLease?
    private var previewCommand: NativeMaterialReferenceCommand?
    private let journal: NativeMaterialReferenceJournal
    private let file: NativeMaterialReferenceExportFile
    private let now: () -> Date
    private let uptime: () -> TimeInterval

    init(scope: NativeMaterialReferenceScope, vault: any NativeCredentialVault = NativeKeychainVault(),
         file: NativeMaterialReferenceExportFile? = nil,
         now: @escaping () -> Date = Date.init,
         uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        self.scope = scope; self.journal = .init(vault: vault)
        self.file = file ?? NativeMaterialReferenceExportFile(uptime: uptime, now: now)
        self.now = now; self.uptime = uptime
    }

    func bind(_ actor: NativeCommunitySafetyActor?) {
        guard lifetime.actor != actor || lifetime.active != (actor != nil) else { return }
        lifetime.bind(actor, active: actor != nil)
        clearVisible(); pending = nil; trip = nil; busy = false
        guard let actor, storageReady else { return }
        do { pending = try journal.read(actor) } catch { storageReady = false; message = "storageOrSession" }
    }

    func suspend() {
        lifetime.invalidate(); clearVisible(); pending = nil; trip = nil; busy = false
    }

    func clearSelection() {
        guard !busy else { return }
        lifetime.advance(); clearVisible(); trip = nil
    }

    func visibleObjects(_ actor: NativeCommunitySafetyActor?) -> [NativeMaterialReferenceObject] {
        valid(actor) && listLease?.valid(uptime: uptime(), now: now()) == true ? objects : []
    }
    func visiblePreview(_ actor: NativeCommunitySafetyActor?) -> NativeMaterialReferencePreview? {
        valid(actor) && previewLease?.valid(uptime: uptime(), now: now()) == true ? preview : nil
    }
    func visibleReceipt(_ actor: NativeCommunitySafetyActor?) -> NativeMaterialReferenceReceipt? {
        valid(actor) && receiptLease?.valid(uptime: uptime(), now: now()) == true ? receipt : nil
    }
    func exportURL(_ actor: NativeCommunitySafetyActor?) -> URL? {
        guard valid(actor) else { return nil }
        return file.visible(current: actor, generation: lifetime.generation)
    }
    func pendingCommand(_ actor: NativeCommunitySafetyActor?) -> NativeMaterialReferenceCommand? {
        guard valid(actor), let actor, let pending, pending.matches(actor.scope, sessionID: actor.sessionID) else { return nil }
        return try? NativeMaterialReferenceCommand(body: pending.body)
    }

    func tick(_ client: NativeMaterialReferenceClient) {
        bind(client.current())
        do { try file.tick(current: client.current(), generation: lifetime.generation) }
        catch { storageReady = false; message = "cleanupRequired"; completion = nil }
        if listLease?.valid(uptime: uptime(), now: now()) != true { objects = []; next = nil; selectedIDs = [] }
        if previewLease?.valid(uptime: uptime(), now: now()) != true { preview = nil; previewCommand = nil }
        if receiptLease?.valid(uptime: uptime(), now: now()) != true { receipt = nil }
    }

    func load(trip: NativeMaterialReferenceTrip, nextPage: Bool = false, client: NativeMaterialReferenceClient) async {
        bind(client.current())
        guard !busy, storageReady, let actor = client.current(), valid(actor), !Task.isCancelled else { return }
        let cursor = nextPage ? next : nil
        if nextPage && (self.trip?.id != trip.id || cursor == nil || visibleObjects(actor).isEmpty) { return }
        lifetime.advance(); clearVisible(); self.trip = trip
        guard storageReady else { return }
        let own = lifetime.generation, started = uptime()
        busy = true
        defer { if lifetime.generation == own { busy = false } }
        do {
            let command = try NativeMaterialReferenceCommand.list(scope: scope, tripID: trip.id, cursor: cursor)
            let bytes = try await client.request(command.body, actor)
            try check(own, actor: actor, client: client)
            let page = try NativeMaterialReferenceProtocol.list(bytes, command: command, actor: actor, now: now())
            listLease = try .init(started: started, received: uptime(), now: now(), expiresAt: page.expiresAt)
            objects = page.objects; next = page.next; message = nil
        } catch { failed(error, own: own, actor: actor, client: client) }
    }

    func toggle(_ object: NativeMaterialReferenceObject, actor: NativeCommunitySafetyActor?) {
        guard !busy, pending == nil, storageReady, visibleObjects(actor).contains(object) else { return }
        clearPreviewAndFile()
        if selectedIDs.contains(object.id) { selectedIDs.remove(object.id) }
        else if selectedIDs.count < 20 { selectedIDs.insert(object.id) }
    }

    func review(client: NativeMaterialReferenceClient) async {
        guard !busy, storageReady, pending == nil, let actor = client.current(), let trip,
              !selectedIDs.isEmpty, selectedIDs.isSubset(of: Set(visibleObjects(actor).map(\.id))) else { return }
        lifetime.advance(); clearPreviewAndFile()
        guard storageReady else { return }
        let own = lifetime.generation, started = uptime()
        busy = true
        defer { if lifetime.generation == own { busy = false } }
        do {
            let command = try NativeMaterialReferenceCommand.preview(scope: scope, tripID: trip.id, objectIDs: Array(selectedIDs))
            let bytes = try await client.request(command.body, actor)
            try check(own, actor: actor, client: client)
            let value = try NativeMaterialReferenceProtocol.preview(bytes, command: command, actor: actor, now: now())
            guard ["deleted", "retained"].contains(trip.state) || value.binding.tripVersion == trip.headVersion else { throw NativeDataError.staleSessionResponse }
            previewLease = try .init(started: started, received: uptime(), now: now(), expiresAt: value.binding.expiresAt)
            preview = value; previewCommand = command; message = nil
        } catch { failed(error, own: own, actor: actor, client: client) }
    }

    func execute(action: String, reviewed: NativeMaterialReferenceBinding, client: NativeMaterialReferenceClient) async {
        guard !busy, storageReady, pending == nil, let actor = client.current(),
              let visible = visiblePreview(actor), visible.binding == reviewed, let original = previewCommand,
              ["export", "erase"].contains(action), !Task.isCancelled else { return }
        let own = lifetime.generation, started = uptime()
        busy = true; completion = nil
        defer { if lifetime.generation == own { busy = false } }
        do {
            let command = try original.confirmed(action: action, previewDigest: reviewed.previewDigest)
            if action == "erase" { pending = try journal.retain(command, actor: actor) }
            let bytes = try await client.request(command.body, actor)
            try check(own, actor: actor, client: client)
            if action == "export" {
                let binding = try NativeMaterialReferenceProtocol.bundle(bytes, command: command, preview: reviewed, actor: actor, now: now())
                try file.write(bytes, actor: actor, generation: own, started: started, expiresAt: binding.expiresAt,
                    current: client.current, currentGeneration: { self.lifetime.generation })
                guard file.visible(current: client.current(), generation: own) != nil else { throw NativeDataError.staleSessionResponse }
                preview = nil; previewCommand = nil; previewLease = nil
                publish(binding, action: "export"); message = "fileReady"
            } else { try accept(bytes, command: command, actor: actor, started: started) }
        } catch { failed(error, own: own, actor: actor, client: client) }
    }

    func recover(client: NativeMaterialReferenceClient) async {
        bind(client.current())
        guard !busy, storageReady, let actor = client.current(), valid(actor), let pending, !Task.isCancelled else { return }
        lifetime.advance(); clearVisible()
        guard storageReady else { return }
        let own = lifetime.generation, started = uptime()
        busy = true
        defer { if lifetime.generation == own { busy = false } }
        do {
            let command = try NativeMaterialReferenceCommand(body: pending.body).recovery()
            let bytes = try await client.request(command.body, actor)
            try check(own, actor: actor, client: client)
            try accept(bytes, command: command, actor: actor, started: started)
        } catch { failed(error, own: own, actor: actor, client: client) }
    }

    private func accept(_ bytes: Data, command: NativeMaterialReferenceCommand,
                        actor: NativeCommunitySafetyActor, started: TimeInterval) throws {
        let received = uptime(), wall = now()
        switch try NativeMaterialReferenceProtocol.erased(bytes, command: command, actor: actor, now: wall) {
        case .unknown: message = "receiptUnknown" // Keep the durable journal and original operation.
        case .erased(let receipt):
            let lease = try NativeMaterialReferenceLease(started: started, received: received, now: wall, expiresAt: wall.addingTimeInterval(30))
            guard let pending else { throw NativeDataError.invalidResponse }
            clearVisible()
            guard storageReady else { throw NativeDataError.sessionUnavailable }
            try journal.complete(pending, actor: actor)
            self.pending = nil
            self.receipt = receipt; receiptLease = lease
            publish(receipt.binding, action: "delete"); message = "erased"
        }
    }

    func retryCleanup(_ client: NativeMaterialReferenceClient) {
        guard !busy, let actor = client.current(), valid(actor) else { return }
        clearVisible()
        guard storageReady else { return }
        do { pending = try journal.read(actor); message = pending == nil ? nil : "receiptUnknown" }
        catch { storageReady = false; message = "storageOrSession" }
    }

    private func publish(_ binding: NativeMaterialReferenceBinding, action: String) {
        completion = .init(scope: binding.scope, requestID: binding.requestID, tripID: binding.tripID, objectIDs: binding.objectIDs, action: action)
    }
    private func valid(_ actor: NativeCommunitySafetyActor?) -> Bool {
        guard let actor else { return false }
        return lifetime.accepts(lifetime.generation, actor: actor, current: actor)
    }
    private func check(_ own: UUID, actor: NativeCommunitySafetyActor, client: NativeMaterialReferenceClient) throws {
        guard lifetime.accepts(own, actor: actor, current: client.current()), !Task.isCancelled else { throw NativeDataError.staleSessionResponse }
    }
    private func clearPreviewAndFile() {
        preview = nil; previewCommand = nil; previewLease = nil; receipt = nil; receiptLease = nil; completion = nil
        do { try file.clear(); storageReady = true } catch { storageReady = false; message = "cleanupRequired" }
    }
    private func clearVisible() { objects = []; next = nil; selectedIDs = []; listLease = nil; clearPreviewAndFile() }
    private func failed(_ error: Error, own: UUID, actor: NativeCommunitySafetyActor, client: NativeMaterialReferenceClient) {
        guard lifetime.generation == own else { return }
        if client.current() != actor { bind(client.current()); return }
        clearPreviewAndFile()
        message = pending == nil ? "unavailable" : "receiptUnknown"
    }
}

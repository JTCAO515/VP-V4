import Foundation
import Observation

@MainActor @Observable final class NativeOfflineDataStore {
    private(set) var loaded = false
    private(set) var ids: [String] = []
    private(set) var selected: String?
    private(set) var receipts: [NativeOfflineDataSourceReceipt] = []
    private(set) var cleanupReceipt: NativeOfflineDataCleanupReceipt?
    private(set) var pendingCleanup: NativeOfflineDataFence?
    private(set) var notice: String?
    private(set) var storageReady = false
    private let original: NativeOfflineTripStore
    private let files: NativeExperienceExportFile
    private let verifier: NativeOfflinePermitVerifier
    private let uptime: () -> TimeInterval
    private let now: () -> Date
    private let boot: () -> String?
    private var actor: NativeCommunitySafetyActor?
    private var inventory: NativeOfflineDataInventory?
    private var lifetime: NativeExperienceLifetime?
    private var draft: NativeOfflineTripDraft?
    private var lodging: NativeLodgingLocalRecord?
    private var cache: NativeOfflineCachedText?
    @ObservationIgnored private var lastNow: Date?
    @ObservationIgnored private var lastUptime: TimeInterval?
    private var selectionStarted: TimeInterval = 0
    private var expiresAt: Date?
    private(set) var exportOperationID: String?
    private(set) var exportComplete = false
    static var exportRoot: URL { FileManager.default.temporaryDirectory.appendingPathComponent("NativeOfflineDataExport", isDirectory: true) }

    init(original: NativeOfflineTripStore, root: URL? = nil, verifier: NativeOfflinePermitVerifier = .installed,
         remove: ((URL) throws -> Void)? = nil,
         uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime },
         now: @escaping () -> Date = Date.init, boot: @escaping () -> String? = NativeOfflineBootIdentity.current) {
        self.original = original; self.verifier = verifier; self.uptime = uptime; self.now = now; self.boot = boot
        files = NativeExperienceExportFile(root: root ?? Self.exportRoot, remove: remove, uptime: uptime, now: now)
        storageReady = files.ready
    }
    static func eraseExports() throws { try NativeExperienceExportFile(root: exportRoot).clear() }

    func clear() {
        actor = nil; loaded = false; ids = []; invalidateSelection(); notice = nil
        do { try files.clear(); storageReady = true } catch { storageReady = false; notice = "STORAGE_UNAVAILABLE" }
    }
    func load(current: NativeCommunitySafetyActor?) {
        clear(); guard storageReady, let current else { return }
        do { ids = try original.offlineDataSelectionIDs(scope: current.scope); actor = current; loaded = true }
        catch { notice = "STORAGE_UNAVAILABLE" }
    }
    func select(_ id: String, current: NativeCommunitySafetyActor?) {
        invalidateSelection()
        do {
            try files.clear(); storageReady = true
            guard let current, current == actor, ids.contains(id),
                  try original.offlineDataSelectionIDs(scope: current.scope).contains(id) else { throw NativeDataError.staleSessionResponse }
            let namespace = try NativeOfflineTripNamespace(scope: current.scope, tripID: id)
            let start = uptime(), stamp = now()
            var physical = try original.offlineDataInventory(namespace, scope: current.scope)
            pendingCleanup = try original.offlineDataPendingCleanup(namespace, scope: current.scope)
            cleanupReceipt = try original.offlineDataCleanupReceipt(namespace, scope: current.scope)
            if physical.fenced {
                receipts = NativeOfflineDataSource.allCases.map { .init(source: $0, state: physical.sources.contains($0) ? .blocked : .absent,
                    reason: "CLEANUP_PENDING", sourceDigest: nil) }
            } else {
                do { draft = try original.readUserDraft(namespace, scope: current.scope) } catch { draft = nil }
                do { lodging = try original.readLodging(namespace, scope: current.scope) } catch { lodging = nil }
                if physical.sources.contains(.confirmedText) {
                    do { cache = try original.readConfirmedText(namespace, scope: current.scope, verifier: verifier,
                                now: stamp, uptime: start, bootIdentity: boot())?.0 }
                    catch { cache = nil }
                    // A present unreadable source stays blocked; physical inventory still permits explicit erasure.
                }
                receipts = [source(.userDraft, present: physical.sources.contains(.userDraft), bytes: try draft.map { try JSONEncoder().encode($0) }),
                            source(.confirmedText, present: physical.sources.contains(.confirmedText), bytes: cache?.wire),
                            source(.lodging, present: physical.sources.contains(.lodging), bytes: try lodging.map { try JSONEncoder().encode($0) })]
                // Original confirmed read records clock observations; bind CAS to those resulting bytes.
                physical = try original.offlineDataInventory(namespace, scope: current.scope)
            }
            let expiry = min(stamp.addingTimeInterval(30), cache?.expiresAt ?? stamp.addingTimeInterval(30),
                             stamp.addingTimeInterval((cache?.deadlineUptime ?? start + 30) - start))
            lifetime = try NativeExperienceLifetime(started: start, received: uptime(), now: stamp, expiresAt: expiry)
            selected = id; inventory = physical; selectionStarted = start; expiresAt = expiry
            lastNow = stamp; lastUptime = start
        } catch { failed(error) }
    }
    private func source(_ source: NativeOfflineDataSource, present: Bool, bytes: Data?) -> NativeOfflineDataSourceReceipt {
        .init(source: source, state: bytes != nil ? .included : present ? .blocked : .absent,
              reason: bytes != nil ? "ORIGINAL_LOCAL_SOURCE" : present ? (source == .confirmedText ? "ORIGINAL_PERMIT_OR_SOURCE_UNAVAILABLE" : "ORIGINAL_SOURCE_UNREADABLE") : "PHYSICALLY_ABSENT",
              sourceDigest: bytes.map(NativeOfflineTripNamespace.digest))
    }
    func currentSelection(_ current: NativeCommunitySafetyActor?) -> Bool {
        let stamp = now(), time = uptime()
        guard current != nil, actor == current, let inventory, let lifetime, let lastNow, let lastUptime,
              stamp >= lastNow, time >= lastUptime, lifetime.valid(uptime: time, now: stamp),
              (try? original.offlineDataInventory(inventory.namespace, scope: current!.scope)) == inventory else { return false }
        if let cache {
            guard (try? cache.currentPayload(verifier: verifier, scope: current!.scope, now: stamp, uptime: time, bootIdentity: boot())) != nil else { return false }
        }
        self.lastNow = stamp; self.lastUptime = time
        return true
    }
    func tick(current: NativeCommunitySafetyActor?) {
        if actor != current { clear(); return }
        if selected != nil && !currentSelection(current) {
            invalidateSelection(); notice = "SELECTION_EXPIRED_OR_CHANGED"
            do { try files.clear() } catch { storageReady = false; notice = "STORAGE_UNAVAILABLE" }
        }
        do { try files.tick(current: current) } catch { storageReady = false; notice = "STORAGE_UNAVAILABLE" }
    }
    func export(current: NativeCommunitySafetyActor?) -> Bool {
        guard currentSelection(current), let current, let inventory, !inventory.fenced, let expiresAt else { return false }
        do {
            let operation = UUID().uuidString.lowercased()
            let value = NativeOfflineDataExport(namespace: inventory.namespace, operationID: operation, createdAt: now(), expiresAt: expiresAt,
                                               receipts: receipts, draft: draft, confirmedPermitWire: cache?.wire, lodging: lodging)
            let bytes = try JSONEncoder().encode(value)
            guard bytes.count <= 1_000_000 else { throw NativeDataError.invalidResponse }
            try files.write(bytes, actor: current, started: selectionStarted, expiresAt: expiresAt, current: { self.currentSelection(current) ? current : nil })
            exportOperationID = operation; exportComplete = !receipts.contains { $0.state == .blocked }
            return true
        } catch { failed(error); return false }
    }
    func exportURL(current: NativeCommunitySafetyActor?) -> URL? {
        guard currentSelection(current) else { return nil }
        return files.visible(current: current)
    }
    /// Explicit confirmation calls this once. On failure the original admission is retained.
    func clean(current: NativeCommunitySafetyActor?) -> NativeOfflineDataCleanupReceipt? {
        guard currentSelection(current), let current, let inventory else { return nil }
        do {
            try files.clear() // No app-owned plaintext export survives selected-source cleanup.
            let operation = pendingCleanup?.operationID ?? UUID().uuidString.lowercased()
            let receipt = try original.cleanupOfflineData(inventory.namespace, scope: current.scope,
                expectedFingerprint: inventory.fingerprint, operationID: operation, now: now())
            let after = try original.offlineDataInventory(inventory.namespace, scope: current.scope)
            guard !after.indexed, after.sources.isEmpty, !after.fenced,
                  try original.offlineDataCleanupReceipt(inventory.namespace, scope: current.scope) == receipt else { throw NativeDataError.invalidResponse }
            invalidateSelection(); cleanupReceipt = receipt; notice = "SELECTED_DEVICE_SCOPE_CLEANED"
            ids = try original.offlineDataSelectionIDs(scope: current.scope)
            return receipt
        } catch { failed(error); return nil }
    }
    private func failed(_ error: Error) {
        invalidateSelection()
        do { try files.clear() } catch { storageReady = false }
        notice = "STORAGE_OR_SOURCE_UNAVAILABLE"
    }
    private func invalidateSelection() {
        selected = nil; receipts = []; cleanupReceipt = nil; pendingCleanup = nil; inventory = nil; lifetime = nil
        draft = nil; lodging = nil; cache = nil; expiresAt = nil; lastNow = nil; lastUptime = nil
        exportOperationID = nil; exportComplete = false
    }
}

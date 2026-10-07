import Foundation
import CryptoKit
import Observation

@MainActor @Observable final class NativeGuideCacheDataStore {
    private(set) var loaded = false
    private(set) var available: [NativeGuideCacheDataSnapshot] = []
    private(set) var preview: NativeGuideCacheDataPreview?
    private(set) var receipt: NativeGuideCacheDataReceipt?
    private(set) var notice: String?
    private(set) var exportOperationID: UUID?
    private(set) var delivery: String?
    private let sources: [any NativeGuideCacheDataSource]
    private let renderer: any NativeGuideCacheDataRenderer
    private let files: NativeExperienceExportFile
    private let now: () -> Date
    private let uptime: () -> TimeInterval
    private var receiptActor: NativeCommunitySafetyActor?
    private var exportActor: NativeCommunitySafetyActor?
    private var exportPreview: NativeGuideCacheDataPreview?
    private var lastNow: Date?
    private var lastUptime: TimeInterval?
    var storageReady: Bool { files.ready }
    static var exportRoot: URL { FileManager.default.temporaryDirectory.appendingPathComponent("NativeGuideCacheDataExport", isDirectory: true) }

    init(sources: [any NativeGuideCacheDataSource], renderer: any NativeGuideCacheDataRenderer,
         root: URL? = nil, remove: ((URL) throws -> Void)? = nil,
         now: @escaping () -> Date = Date.init,
         uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        self.sources = sources; self.renderer = renderer; self.now = now; self.uptime = uptime
        files = NativeExperienceExportFile(root: root ?? Self.exportRoot, remove: remove, uptime: uptime, now: now)
    }
    static func eraseExports() throws { try NativeExperienceExportFile(root: exportRoot).clear() }

    func clear() {
        preview = nil; available = []; loaded = false; receipt = nil; receiptActor = nil
        exportActor = nil; exportPreview = nil; exportOperationID = nil; delivery = nil
        lastNow = nil; lastUptime = nil
        do { try files.clear(); notice = nil } catch { notice = "STORAGE_UNAVAILABLE" }
    }
    private func snapshots(_ actor: NativeCommunitySafetyActor) throws -> [NativeGuideCacheDataSnapshot] {
        guard sources.count <= 16, Set(sources.map(\.guideCacheInstanceID)).count == sources.count else { throw NativeDataError.invalidResponse }
        let rows = sources.compactMap { $0.guideCacheSnapshot(current: actor.scope) }
        guard rows.allSatisfy({ $0.valid && $0.selection.scope == actor.scope }) else { throw NativeDataError.invalidResponse }
        return rows.sorted { $0.instanceID.uuidString < $1.instanceID.uuidString }
    }
    func load(current: NativeCommunitySafetyActor?) {
        preview = nil; available = []; loaded = false
        do {
            try discardExport()
            guard let current else { throw NativeDataError.sessionUnavailable }
            available = try snapshots(current); loaded = true; notice = nil
            if receiptActor != current { receipt = nil; receiptActor = nil }
        } catch { notice = "UNAVAILABLE" }
    }
    /// Explicitly selects every actual owner-matching instance listed by this feature's source set.
    func select(current: NativeCommunitySafetyActor?) {
        preview = nil
        do {
            try discardExport()
            guard loaded, let current, let render = renderer.guideCacheRendererState(current: current.scope) else { throw NativeDataError.sessionUnavailable }
            let rows = try snapshots(current)
            guard rows == available, !rows.isEmpty else { throw NativeDataError.staleSessionResponse }
            let stamp = now(), time = uptime()
            preview = .init(id: UUID(), actor: current, createdAt: stamp, uptime: time, snapshots: rows, renderer: render)
            lastNow = stamp; lastUptime = time; notice = nil
        } catch { notice = "SELECTION_CHANGED_OR_UNAVAILABLE" }
    }
    private func accepts(_ selection: NativeGuideCacheDataPreview, current: NativeCommunitySafetyActor?) -> Bool {
        let stamp = now(), time = uptime()
        guard selection.valid(current: current, now: stamp, uptime: time),
              let lastNow, let lastUptime, stamp >= lastNow, time >= lastUptime,
              (try? snapshots(selection.actor)) == selection.snapshots,
              renderer.guideCacheRendererState(current: selection.actor.scope) == selection.renderer else { return false }
        self.lastNow = stamp; self.lastUptime = time
        return true
    }
    func currentSelection(_ current: NativeCommunitySafetyActor?) -> Bool {
        guard let preview else { return false }; return accepts(preview, current: current)
    }
    @discardableResult func export(current: NativeCommunitySafetyActor?) -> Bool {
        do {
            guard let preview, accepts(preview, current: current) else { throw NativeDataError.staleSessionResponse }
            let operation = UUID()
            let records: [[String: Any]] = preview.snapshots.map { row in
                ["instanceId": row.instanceID.uuidString, "tripId": row.selection.tripID,
                 "tripVersion": row.selection.tripVersion, "placeReferenceId": row.selection.placeReferenceID,
                 "canonicalPoiId": row.selection.canonicalPoiID, "locale": row.selection.locale,
                 "interest": row.selection.interest.rawValue, "digest": row.digest as Any? ?? NSNull(),
                 "rightsRevision": row.rightsRevision as Any? ?? NSNull(), "cacheAllowed": row.cacheAllowed,
                 "sourceIdentifiers": row.sourceIdentifiers, "completedSegmentIds": row.completedSegmentIDs,
                 "progressSegmentId": row.progressSegmentID as Any? ?? NSNull(), "progressCharacters": row.progressCharacters,
                 "readyInMemory": row.hasReady, "sourceExpiresAt": row.sourceExpiresAt.map { ISO8601DateFormatter().string(from: $0) } as Any? ?? NSNull()]
            }
            let bytes = try JSONSerialization.data(withJSONObject: ["schemaVersion": "native-guide-cache-metadata/1",
                "operationId": operation.uuidString, "scope": "actual_owner_device_guide_instances",
                "records": records, "excluded": ["published_text", "narration", "source_body", "audio", "pending_requests", "credentials"],
                "contentExportRight": "not_granted", "serverData": "unchanged"], options: [.sortedKeys, .prettyPrinted])
            guard bytes.count <= 65_536 else { throw NativeDataError.invalidResponse }
            try files.write(bytes, actor: preview.actor, started: preview.uptime,
                expiresAt: preview.createdAt.addingTimeInterval(30), current: { current })
            exportActor = preview.actor; exportPreview = preview; exportOperationID = operation; delivery = "prepared"; notice = nil
            return true
        } catch { try? discardExport(); notice = "EXPORT_UNAVAILABLE"; return false }
    }
    @discardableResult func clean(current: NativeCommunitySafetyActor?) -> NativeGuideCacheDataReceipt? {
        do {
            guard let preview, accepts(preview, current: current) else { throw NativeDataError.staleSessionResponse }
            // Owned exported bytes must be physically removed before source mutation.
            try discardExport()
            guard accepts(preview, current: current) else { throw NativeDataError.staleSessionResponse }
            var inspected = 0
            guard renderer.clearGuideCacheRenderer(expected: preview.renderer, current: preview.actor.scope),
                  renderer.guideCacheRendererIsEmpty(current: preview.actor.scope) else { throw NativeDataError.invalidResponse }
            for row in preview.snapshots {
                guard let source = sources.first(where: { $0.guideCacheInstanceID == row.instanceID }),
                      source.clearGuideCache(expected: row, current: preview.actor.scope),
                      source.guideCacheIsEmpty(current: preview.actor.scope) else { throw NativeDataError.invalidResponse }
                inspected += 1
            }
            guard inspected == preview.snapshots.count, renderer.guideCacheRendererIsEmpty(current: preview.actor.scope),
                  preview.valid(current: current, now: now(), uptime: uptime()),
                  now() >= (lastNow ?? preview.createdAt), uptime() >= (lastUptime ?? preview.uptime) else { throw NativeDataError.invalidResponse }
            let binding = [preview.actor.scope.endpoint, preview.actor.scope.subject, String(preview.actor.scope.mobileEpoch),
                           String(preview.actor.scope.generation), preview.actor.sessionID].joined(separator: "\n")
            let result = NativeGuideCacheDataReceipt(version: 1, operationID: preview.id, completedAt: now(),
                instanceCount: inspected, inspectedEmptyCount: inspected, rendererStopped: true,
                scope: "actual_owner_device_guide_instances", serverData: "unchanged", pendingRequests: "unchanged",
                externalCopies: "not_recalled", actorBinding: SHA256.hash(data: Data(binding.utf8)).map { String(format: "%02x", $0) }.joined())
            receipt = result; receiptActor = preview.actor; self.preview = nil; available = []; loaded = false; notice = nil
            return result
        } catch { self.preview = nil; notice = "CLEANUP_UNCONFIRMED_OR_PARTIAL"; return nil }
    }
    func visibleReceipt(current: NativeCommunitySafetyActor?) -> NativeGuideCacheDataReceipt? {
        current != nil && current == receiptActor ? receipt : nil
    }
    @discardableResult func exportReceipt(current: NativeCommunitySafetyActor?) -> Bool {
        do {
            guard let current, let receipt = visibleReceipt(current: current) else { throw NativeDataError.sessionUnavailable }
            let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .prettyPrinted]; encoder.dateEncodingStrategy = .iso8601
            let stamp = now(), time = uptime()
            try files.write(encoder.encode(receipt), actor: current, started: time, expiresAt: stamp.addingTimeInterval(30), current: { current })
            exportActor = current; exportPreview = nil; exportOperationID = receipt.operationID; delivery = "prepared"; notice = nil
            return true
        } catch { try? discardExport(); notice = "EXPORT_UNAVAILABLE"; return false }
    }
    func exportURL(current: NativeCommunitySafetyActor?) -> URL? {
        guard current != nil, current == exportActor else { return nil }
        if let exportPreview, !accepts(exportPreview, current: current) { return nil }
        return files.visible(current: current)
    }
    func handedOff(operation: UUID, current: NativeCommunitySafetyActor?, completed: Bool, failed: Bool) -> Bool {
        guard operation == exportOperationID, exportURL(current: current) != nil else { return false }
        delivery = failed ? "failed" : completed ? "completed" : "cancelled"
        return completed && !failed
    }
    private func discardExport() throws {
        exportActor = nil; exportPreview = nil; exportOperationID = nil; delivery = nil
        try files.clear()
    }
    func tick(current: NativeCommunitySafetyActor?) {
        if receiptActor != nil && receiptActor != current { clear(); return }
        do {
            if let preview, !accepts(preview, current: current) { self.preview = nil; notice = "SELECTION_CHANGED_OR_EXPIRED" }
            if exportActor != nil && exportURL(current: current) == nil { try discardExport() }
            try files.tick(current: current)
        } catch { notice = "STORAGE_UNAVAILABLE" }
    }
}

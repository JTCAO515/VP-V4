import Foundation
import Observation

@MainActor @Observable final class NativeJournalDataStore {
    private(set) var rows: [NativeJournalDataSnapshot] = []
    private(set) var selection: NativeJournalDataSelection?
    private(set) var receipts: [NativeJournalDataReceipt] = []
    private(set) var notice: String?
    private(set) var delivery: String?
    private(set) var exportOperationID: UUID?
    private let source: any NativeJournalDataSource
    private let files: NativeExperienceExportFile
    private let now: () -> Date
    private let uptime: () -> TimeInterval
    private var bound: NativeCommunitySafetyActor?
    private var exportSelection: NativeJournalDataSelection?
    private var exportActor: NativeCommunitySafetyActor?
    private var lastNow: Date?
    private var lastUptime: TimeInterval?
    static var exportRoot: URL { FileManager.default.temporaryDirectory.appendingPathComponent("NativeJournalDataExport", isDirectory: true) }
    var storageReady: Bool { files.ready }

    init(source: any NativeJournalDataSource, root: URL? = nil, remove: ((URL) throws -> Void)? = nil,
         now: @escaping () -> Date = Date.init,
         uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        self.source = source; self.now = now; self.uptime = uptime
        files = NativeExperienceExportFile(root: root ?? Self.exportRoot, remove: remove, uptime: uptime, now: now)
    }
    static func eraseExports() throws { try NativeExperienceExportFile(root: exportRoot).clear() }
    func clear() {
        rows = []; selection = nil; receipts = []; bound = nil; lastNow = nil; lastUptime = nil
        do { try discardExport(); notice = nil } catch { notice = "STORAGE_UNAVAILABLE" }
    }
    private func read(_ actor: NativeCommunitySafetyActor) throws -> [NativeJournalDataSnapshot] {
        let values = try source.read(actor)
        guard values.count <= 10_000, values.allSatisfy(\.valid),
              Set(values.map { $0.record.source }) == Set(NativeJournalDataSourceID.allCases) else {
            throw NativeDataError.invalidResponse
        }
        return values.sorted { $0.record.source.rawValue < $1.record.source.rawValue }
    }
    func load(current: NativeCommunitySafetyActor?) {
        selection = nil; rows = []
        do {
            try discardExport()
            guard let current else { throw NativeDataError.sessionUnavailable }
            if bound != current { receipts = [] }; bound = current
            rows = try read(current); notice = nil
        } catch { notice = "READ_UNAVAILABLE" }
    }
    func select(current: NativeCommunitySafetyActor?) {
        selection = nil
        do {
            try discardExport()
            guard let current, bound == current, !rows.isEmpty, try read(current) == rows else {
                throw NativeDataError.staleSessionResponse
            }
            let stamp = now(), time = uptime()
            selection = .init(id: UUID(), actor: current, createdAt: stamp, uptime: time, snapshots: rows)
            lastNow = stamp; lastUptime = time; notice = nil
        } catch { notice = "SOURCE_CHANGED_OR_UNAVAILABLE" }
    }
    private func accepts(_ selected: NativeJournalDataSelection, current: NativeCommunitySafetyActor?) -> Bool {
        let stamp = now(), time = uptime()
        guard selected.valid(current: current, now: stamp, uptime: time),
              let lastNow, let lastUptime, stamp >= lastNow, time >= lastUptime,
              (try? read(selected.actor)) == selected.snapshots else { return false }
        self.lastNow = stamp; self.lastUptime = time; return true
    }
    func canReturnToOriginal(_ source: NativeJournalDataSourceID, current: NativeCommunitySafetyActor?) -> Bool {
        guard let selection, accepts(selection, current: current) else { return false }
        return selection.snapshots.contains { $0.record.source == source && $0.record.state == .pending }
    }
    func visibleReceipts(current: NativeCommunitySafetyActor?) -> [NativeJournalDataReceipt] {
        current != nil && bound == current ? receipts : []
    }
    @discardableResult func exportReceipt(_ receipt: NativeJournalDataReceipt, current: NativeCommunitySafetyActor?) -> Bool {
        do {
            guard let current, visibleReceipts(current: current).contains(receipt) else { throw NativeDataError.staleSessionResponse }
            let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .prettyPrinted]; encoder.dateEncodingStrategy = .iso8601
            let stamp = now(), time = uptime()
            try files.write(encoder.encode(receipt), actor: current, started: time, expiresAt: stamp.addingTimeInterval(30), current: { current })
            exportSelection = nil; exportActor = current; exportOperationID = receipt.id; delivery = "prepared"; notice = nil; return true
        } catch { try? discardExport(); notice = "EXPORT_UNAVAILABLE"; return false }
    }
    @discardableResult func export(current: NativeCommunitySafetyActor?) -> Bool {
        do {
            guard let selection, accepts(selection, current: current) else { throw NativeDataError.staleSessionResponse }
            let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .prettyPrinted]
            let document = Export(schemaVersion: "native-owner-journals/1", operationID: selection.id,
                actorBinding: nativeJournalDataActorBinding(selection.actor), records: selection.snapshots.map(\.record),
                completeSourceRead: !selection.snapshots.contains { $0.record.state == .unavailable },
                credentials: "excluded", acknowledgements: "not_inferred", serverData: "unchanged", externalCopies: "not_recalled")
            let bytes = try encoder.encode(document)
            guard bytes.count <= 1_000_000 else { throw NativeDataError.invalidResponse }
            try files.write(bytes, actor: selection.actor, started: selection.uptime,
                expiresAt: selection.createdAt.addingTimeInterval(30), current: { current })
            guard accepts(selection, current: current) else { throw NativeDataError.staleSessionResponse }
            exportSelection = selection; exportActor = selection.actor; exportOperationID = selection.id
            delivery = "prepared"; notice = nil; return true
        } catch { try? discardExport(); notice = "EXPORT_UNAVAILABLE"; return false }
    }
    /// The user returns from the original module. No network or source mutation occurs here.
    @discardableResult func inspectCompletion(source id: NativeJournalDataSourceID, current: NativeCommunitySafetyActor?) -> NativeJournalDataReceipt? {
        do {
            guard let selected = selection, let current, bound == current,
                  selected.valid(current: current, now: now(), uptime: uptime()),
                  now() >= (lastNow ?? selected.createdAt), uptime() >= (lastUptime ?? selected.uptime),
                  let original = selected.snapshots.first(where: { $0.record.source == id && $0.record.state == .pending }),
                  let completion = source.completion(source: id, actor: current), completion.actor == current,
                  completion.originalIdentity == original.originalIdentity, !completion.receiptIdentity.isEmpty,
                  completion.completedAt >= selected.createdAt,
                  try source.physicallyAbsent(source: id, actor: current) else { throw NativeDataError.staleSessionResponse }
            try discardExport()
            let receipt = NativeJournalDataReceipt(id: UUID(), source: id, completedAt: completion.completedAt,
                originalReceiptIdentity: completion.receiptIdentity, actorBinding: nativeJournalDataActorBinding(current),
                physicalPendingAbsent: true, scope: "selected_original_module_pending", serverData: "original_receipt_only",
                externalCopies: "not_recalled")
            receipts.removeAll { $0.source == id }; receipts.append(receipt); notice = nil; return receipt
        } catch { notice = "ORIGINAL_COMPLETION_UNCONFIRMED"; return nil }
    }
    func exportURL(current: NativeCommunitySafetyActor?) -> URL? {
        guard current != nil, current == exportActor else { return nil }
        if let exportSelection, !accepts(exportSelection, current: current) { return nil }
        return files.visible(current: current)
    }
    func handedOff(operation: UUID, current: NativeCommunitySafetyActor?, completed: Bool, failed: Bool) -> Bool {
        guard operation == exportOperationID, exportURL(current: current) != nil else { return false }
        delivery = failed ? "failed" : completed ? "completed" : "cancelled"; return completed && !failed
    }
    private func discardExport() throws {
        exportActor = nil; exportSelection = nil; exportOperationID = nil; delivery = nil; try files.clear()
    }
    func tick(current: NativeCommunitySafetyActor?) {
        if bound != current { clear(); return }
        do {
            if let selection, !selection.valid(current: current, now: now(), uptime: uptime())
                || now() < (lastNow ?? selection.createdAt) || uptime() < (lastUptime ?? selection.uptime) {
                self.selection = nil; notice = "SELECTION_EXPIRED"
            }
            if exportActor != nil && exportURL(current: current) == nil { try discardExport() }
            try files.tick(current: current)
        } catch { notice = "STORAGE_UNAVAILABLE" }
    }
    private struct Export: Encodable {
        let schemaVersion: String
        let operationID: UUID
        let actorBinding: String
        let records: [NativeJournalDataExportRecord]
        let completeSourceRead: Bool
        let credentials: String
        let acknowledgements: String
        let serverData: String
        let externalCopies: String
    }
}

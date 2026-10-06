import Foundation

/// Uses the accepted protected writer with a module-owned root and exact-byte
/// readback. Cleanup failure closes publication and subsequent writes.
@MainActor final class NativeCoverageProgressExportFile {
    private struct Delivery {
        let actor: NativeCommunitySafetyActor
        let generation: UUID
        let lease: NativeCoverageProgressLease
        let url: URL
    }
    private let protected: NativeCommunitySafetyExportFile
    private var delivery: Delivery?
    private let now: () -> Date
    private let uptime: () -> TimeInterval
    var ready: Bool { protected.ready }

    static var defaultRoot: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("NativeCoverageProgressDataExport", isDirectory: true)
    }

    init(root: URL? = nil, remove: ((URL) throws -> Void)? = nil,
         now: @escaping () -> Date = Date.init,
         uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        protected = NativeCommunitySafetyExportFile(root: root ?? Self.defaultRoot, remove: remove)
        self.now = now; self.uptime = uptime
    }

    static func eraseAll() throws { try NativeCoverageProgressExportFile().clear() }

    func clear() throws {
        delivery = nil
        try protected.clear()
    }

    func write(_ bytes: Data, actor: NativeCommunitySafetyActor, generation: UUID,
               started: TimeInterval, expiry: Date, current: () -> NativeCommunitySafetyActor?,
               currentGeneration: () -> UUID) throws {
        try clear()
        guard current() == actor, currentGeneration() == generation, !Task.isCancelled else {
            throw NativeDataError.staleSessionResponse
        }
        let lease = try NativeCoverageProgressLease(start: started, received: uptime(), now: now(), expiry: expiry)
        do {
            let temporary = try protected.write(bytes)
            let path = temporary.deletingLastPathComponent().appendingPathComponent("coverage-progress-data.json")
            try FileManager.default.moveItem(at: temporary, to: path)
            guard try Data(contentsOf: path) == bytes else { throw NativeDataError.sessionUnavailable }
            guard current() == actor, currentGeneration() == generation, !Task.isCancelled,
                  lease.valid(now: now(), uptime: uptime()) else { throw NativeDataError.staleSessionResponse }
            delivery = .init(actor: actor, generation: generation, lease: lease, url: path)
        } catch { try clear(); throw error }
    }

    func visible(actor: NativeCommunitySafetyActor?, generation: UUID) -> URL? {
        guard ready, let delivery, delivery.actor == actor, delivery.generation == generation,
              delivery.lease.valid(now: now(), uptime: uptime()) else { return nil }
        return delivery.url
    }

    func tick(actor: NativeCommunitySafetyActor?, generation: UUID) throws {
        if delivery != nil && visible(actor: actor, generation: generation) == nil { try clear() }
    }
}

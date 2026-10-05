import Foundation

/// The accepted protected writer owns permissions and cleanup in a separate
/// notification-data directory. A validated export retains its original TTL.
@MainActor final class NativeNotificationDataExportFile {
    private let file: NativeCommunitySafetyExportFile
    private let uptime: () -> TimeInterval
    private let now: () -> Date
    private var actor: NativeCommunitySafetyActor?
    private var generation: UUID?
    private var lease: NativeNotificationDataLease?
    private var url: URL?
    var ready: Bool { file.ready }

    static var defaultRoot: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("NativeNotificationDataExport", isDirectory: true)
    }

    init(root: URL? = nil, remove: ((URL) throws -> Void)? = nil,
         uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime },
         now: @escaping () -> Date = Date.init) {
        file = NativeCommunitySafetyExportFile(root: root ?? Self.defaultRoot, remove: remove)
        self.uptime = uptime
        self.now = now
    }

    static func eraseAll() throws { try NativeNotificationDataExportFile().clear() }

    func clear() throws {
        actor = nil; generation = nil; lease = nil; url = nil
        try file.clear()
    }

    func write(_ bytes: Data, actor: NativeCommunitySafetyActor, generation: UUID,
               started: TimeInterval, expiresAt: Date,
               current: () -> NativeCommunitySafetyActor?, currentGeneration: () -> UUID) throws {
        try clear()
        guard current() == actor, currentGeneration() == generation else {
            throw NativeDataError.staleSessionResponse
        }
        let lease = try NativeNotificationDataLease(started: started, received: uptime(), now: now(), expiresAt: expiresAt)
        do {
            let protected = try file.write(bytes)
            let named = protected.deletingLastPathComponent().appendingPathComponent("notification-data.json")
            try FileManager.default.moveItem(at: protected, to: named)
            guard try Data(contentsOf: named) == bytes else { throw NativeDataError.sessionUnavailable }
            guard current() == actor, currentGeneration() == generation,
                  lease.valid(uptime: uptime(), now: now()) else {
                throw NativeDataError.staleSessionResponse
            }
            self.actor = actor; self.generation = generation; self.lease = lease; url = named
        } catch { try clear(); throw error }
    }

    func visible(current: NativeCommunitySafetyActor?, generation: UUID) -> URL? {
        guard ready, current != nil, actor == current, self.generation == generation,
              let lease, lease.valid(uptime: uptime(), now: now()) else { return nil }
        return url
    }

    func tick(current: NativeCommunitySafetyActor?, generation: UUID) throws {
        if url != nil && visible(current: current, generation: generation) == nil { try clear() }
    }
}

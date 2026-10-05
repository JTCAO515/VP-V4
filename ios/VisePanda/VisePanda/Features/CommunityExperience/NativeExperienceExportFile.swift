import Foundation

/// Reuses the accepted private export implementation with a distinct owned root.
@MainActor final class NativeExperienceExportFile {
    private let file: NativeCommunitySafetyExportFile
    private var actor: NativeCommunitySafetyActor?
    private var lifetime: NativeExperienceLifetime?
    private let uptime: () -> TimeInterval
    private let now: () -> Date
    var ready: Bool { file.ready }
    static var defaultRoot: URL { FileManager.default.temporaryDirectory.appendingPathComponent("NativeCommunityExperienceExport", isDirectory: true) }

    init(root: URL? = nil, remove: ((URL) throws -> Void)? = nil,
         uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }, now: @escaping () -> Date = Date.init) {
        file = NativeCommunitySafetyExportFile(root: root ?? Self.defaultRoot, remove: remove)
        self.uptime = uptime; self.now = now
    }

    static func eraseAll() throws { try NativeExperienceExportFile().clear() }

    func clear() throws {
        actor = nil; lifetime = nil
        try file.clear()
    }

    func write(_ bytes: Data, actor: NativeCommunitySafetyActor, started: TimeInterval, expiresAt: Date,
               current: () -> NativeCommunitySafetyActor?) throws {
        try clear()
        guard current() == actor else { throw NativeDataError.staleSessionResponse }
        let lease = try NativeExperienceLifetime(started: started, received: uptime(), now: now(), expiresAt: expiresAt)
        do {
            _ = try file.write(bytes)
            guard current() == actor, lease.valid(uptime: uptime(), now: now()) else { throw NativeDataError.staleSessionResponse }
            self.actor = actor; lifetime = lease
        } catch { try clear(); throw error }
    }

    func visible(current: NativeCommunitySafetyActor?) -> URL? {
        guard ready, current != nil, actor == current, let lifetime,
              lifetime.valid(uptime: uptime(), now: now()) else { return nil }
        return file.url
    }

    /// Call from the scene/account/expiry path; cleanup failures fence further writes.
    func tick(current: NativeCommunitySafetyActor?) throws {
        if file.url != nil && visible(current: current) == nil { try clear() }
    }
}

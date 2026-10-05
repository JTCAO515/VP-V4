import Foundation

/// Reuses verified private files and request-start expiry from the existing scoped export consumer.
@MainActor final class NativeDataCoverageExportFile {
    static var root: URL { FileManager.default.temporaryDirectory.appendingPathComponent("NativeDataCoverageExport", isDirectory: true) }
    private let file: NativeExperienceExportFile
    var ready: Bool { file.ready }

    init(root: URL? = nil, remove: ((URL) throws -> Void)? = nil,
         uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }, now: @escaping () -> Date = Date.init) {
        file = NativeExperienceExportFile(root: root ?? Self.root, remove: remove, uptime: uptime, now: now)
    }
    static func eraseAll() throws { try NativeDataCoverageExportFile().clear() }
    func clear() throws { try file.clear() }
    func write(_ bytes: Data, actor: NativeCommunitySafetyActor, started: TimeInterval, expiresAt: Date,
               current: () -> NativeCommunitySafetyActor?) throws {
        try file.write(bytes, actor: actor, started: started, expiresAt: expiresAt, current: current)
    }
    func visible(current: NativeCommunitySafetyActor?) -> URL? { file.visible(current: current) }
    func tick(current: NativeCommunitySafetyActor?) throws { try file.tick(current: current) }
}

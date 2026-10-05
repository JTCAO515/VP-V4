import Foundation
import CryptoKit

/// A downloaded companion is a separate artifact. Its file digest is not the source lease digest.
struct NativeServiceExportFile: Identifiable {
    @MainActor private static var active = Set<UUID>()
    let id: UUID
    let url: URL
    let artifactDigest: String
    let owner: NativeDataScope
    let expiresAt: Date
    let deadline: TimeInterval
    func current(actor: NativeDataScope?, now: Date = Date(), uptime: TimeInterval = ProcessInfo.processInfo.systemUptime) -> Bool {
        actor == owner && now < expiresAt && uptime < deadline && FileManager.default.fileExists(atPath: url.path)
    }
    @MainActor static func create(bundle: NativeServiceDataBundle, actor: NativeDataScope, started: TimeInterval,
                       directoryRoot: URL = FileManager.default.temporaryDirectory, now: Date = Date(), uptime: TimeInterval = ProcessInfo.processInfo.systemUptime) throws -> Self {
        guard bundle.ownerId == actor.subject, bundle.expiresAt > now, uptime >= started, uptime - started < 30 else { throw NativeDataError.invalidResponse }
        let id = UUID(), directory = directoryRoot.appendingPathComponent("vp-service-export-" + id.uuidString, isDirectory: true)
        let url = directory.appendingPathComponent("service-data.json")
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
            var excluded = URLResourceValues(); excluded.isExcludedFromBackup = true
            var protectedDirectory = directory; try protectedDirectory.setResourceValues(excluded)
            var options: Data.WritingOptions = [.atomic]
            #if os(iOS)
            options.insert(.completeFileProtection)
            #endif
            try bundle.bytes.write(to: url, options: options)
            guard try Data(contentsOf: url) == bundle.bytes else { throw NativeDataError.sessionUnavailable }
            active.insert(id)
            return .init(id: id, url: url, artifactDigest: SHA256.hash(data: bundle.bytes).map { String(format: "%02x", $0) }.joined(), owner: actor, expiresAt: bundle.expiresAt, deadline: min(started + 30, uptime + bundle.expiresAt.timeIntervalSince(now)))
        } catch {
            try? FileManager.default.removeItem(at: directory)
            throw error
        }
    }
    @MainActor static func erase(_ file: Self) throws {
        guard file.url.lastPathComponent == "service-data.json", file.url.deletingLastPathComponent().lastPathComponent == "vp-service-export-" + file.id.uuidString else { throw NativeDataError.invalidResponse }
        active.remove(file.id)
        if FileManager.default.fileExists(atPath: file.url.path) { try FileManager.default.removeItem(at: file.url) }
        guard !FileManager.default.fileExists(atPath: file.url.path) else { throw NativeDataError.sessionUnavailable }
        let directory = file.url.deletingLastPathComponent()
        if FileManager.default.fileExists(atPath: directory.path) { try FileManager.default.removeItem(at: directory) }
    }
    /// A restart has no active IDs, so an interrupted export is removed before another is prepared.
    @MainActor static func sweepOrphans(directoryRoot: URL = FileManager.default.temporaryDirectory) throws {
        for url in try FileManager.default.contentsOfDirectory(at: directoryRoot, includingPropertiesForKeys: nil) {
            let prefix = "vp-service-export-", name = url.lastPathComponent
            guard name.hasPrefix(prefix), let id = UUID(uuidString: String(name.dropFirst(prefix.count))), !active.contains(id) else { continue }
            try FileManager.default.removeItem(at: url)
        }
    }

}

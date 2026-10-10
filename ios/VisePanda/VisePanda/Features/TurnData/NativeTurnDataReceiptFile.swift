import Foundation
import Darwin

/// Short-lived verified receipt inventory. All contents of the module-owned root are purged and verified.
@MainActor final class NativeTurnDataReceiptFile {
    private var url: URL?
    private(set) var ready = false
    private var fileDigest: String?
    private var fileBytes: Int?
    private var actor: NativeCommunitySafetyActor?
    private var deadline: Date?
    private var uptimeDeadline: TimeInterval?
    private var capturedUptime: TimeInterval?
    let root: URL
    private let remove: (URL) throws -> Void

    init(root: URL? = nil, remove: ((URL) throws -> Void)? = nil) {
        self.root = (root ?? Self.defaultRoot).standardizedFileURL
        self.remove = remove ?? { try FileManager.default.removeItem(at: $0) }
        do { try clear() } catch { ready = false }
    }
    static var defaultRoot: URL { FileManager.default.temporaryDirectory.appendingPathComponent("NativeTurnDataReceipt", isDirectory: true) }
    static func eraseAll() throws { try NativeTurnDataReceiptFile().clear() }

    private func checkedRoot() throws {
        guard root.isFileURL else { throw NativeDataError.invalidResponse }
        var info = stat()
        if lstat(root.path, &info) == 0 {
            guard info.st_mode & S_IFMT == S_IFDIR else { throw NativeDataError.invalidResponse }
        } else if errno == ENOENT {
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete, .posixPermissions: 0o700])
            guard lstat(root.path, &info) == 0, info.st_mode & S_IFMT == S_IFDIR else { throw NativeDataError.invalidResponse }
        } else { throw NativeDataError.invalidResponse }
    }
    func clear() throws {
        url = nil; ready = false; fileDigest = nil; fileBytes = nil; actor = nil; deadline = nil; uptimeDeadline = nil; capturedUptime = nil
        try checkedRoot()
        for path in try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) {
            guard path.standardizedFileURL.deletingLastPathComponent().path == root.path else { throw NativeDataError.invalidResponse }
            // removeItem removes a symlink itself; it does not follow its target.
            try remove(path)
        }
        guard try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).isEmpty else { throw NativeDataError.sessionUnavailable }
        ready = true
    }
    func selectedFile(_ current: NativeCommunitySafetyActor?, now: Date = Date(),
                      uptime: TimeInterval = ProcessInfo.processInfo.systemUptime) throws -> URL? {
        guard let url else { return nil }
        guard ready, current != nil, actor == current, now.timeIntervalSince1970.isFinite,
              uptime.isFinite, let deadline, let uptimeDeadline, let capturedUptime,
              now < deadline, uptime >= capturedUptime, uptime < uptimeDeadline else {
            try clear(); return nil
        }
        try checkedRoot()
        var folder = stat(), file = stat()
        guard lstat(url.deletingLastPathComponent().path, &folder) == 0, folder.st_mode & S_IFMT == S_IFDIR,
              lstat(url.path, &file) == 0, file.st_mode & S_IFMT == S_IFREG,
              file.st_size == fileBytes.map(Int64.init), let fileDigest,
              NativeTurnDataWire.digest(try Data(contentsOf: url)) == fileDigest else {
            try clear(); return nil
        }
        return url
    }
    /// Only a verified immutable receipt is eligible. Preparation is never a completed user action.
    func write(_ bytes: Data, actor: NativeCommunitySafetyActor,
               now: Date = Date(), uptime: TimeInterval = ProcessInfo.processInfo.systemUptime) throws -> URL {
        try clear()
        guard now.timeIntervalSince1970.isFinite, uptime.isFinite, uptime >= 0,
              !bytes.isEmpty, bytes.count <= 1_000_000 else { throw NativeDataError.invalidResponse }
        let folder = root.appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false, attributes: [.protectionKey: FileProtectionType.complete, .posixPermissions: 0o700])
            var resource = URLResourceValues(); resource.isExcludedFromBackup = true
            var excluded = folder; try excluded.setResourceValues(resource)
            let path = folder.appendingPathComponent("turn-data-receipt.json")
            try bytes.write(to: path, options: [.atomic, .completeFileProtection])
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: path.path)
            excluded = path; try excluded.setResourceValues(resource)
            guard try Data(contentsOf: path) == bytes else { throw NativeDataError.sessionUnavailable }
            fileDigest = NativeTurnDataWire.digest(bytes); fileBytes = bytes.count
            self.actor = actor; deadline = now.addingTimeInterval(30)
            capturedUptime = uptime; uptimeDeadline = uptime + 30
            url = path
            return path
        } catch { try clear(); throw error }
    }
}

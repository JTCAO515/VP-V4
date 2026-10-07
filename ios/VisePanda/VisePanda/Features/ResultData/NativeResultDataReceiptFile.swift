import Foundation
import Darwin

/// Short-lived verified receipt inventory. All contents of the module-owned root are purged and verified.
@MainActor final class NativeResultDataReceiptFile {
    private(set) var url: URL?
    private(set) var ready = false
    let root: URL
    private let remove: (URL) throws -> Void

    init(root: URL? = nil, remove: ((URL) throws -> Void)? = nil) {
        self.root = (root ?? Self.defaultRoot).standardizedFileURL
        self.remove = remove ?? { try FileManager.default.removeItem(at: $0) }
        do { try clear() } catch { ready = false }
    }
    static var defaultRoot: URL { FileManager.default.temporaryDirectory.appendingPathComponent("NativeResultDataReceipt", isDirectory: true) }
    static func eraseAll() throws { try NativeResultDataReceiptFile().clear() }

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
        url = nil; ready = false
        try checkedRoot()
        for path in try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) {
            guard path.standardizedFileURL.deletingLastPathComponent().path == root.path else { throw NativeDataError.invalidResponse }
            // removeItem removes a symlink itself; it does not follow its target.
            try remove(path)
        }
        guard try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).isEmpty else { throw NativeDataError.sessionUnavailable }
        ready = true
    }
    func write(_ bytes: Data) throws -> URL {
        try clear()
        guard !bytes.isEmpty, bytes.count <= 1_000_000 else { throw NativeDataError.invalidResponse }
        let folder = root.appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false, attributes: [.protectionKey: FileProtectionType.complete, .posixPermissions: 0o700])
            var resource = URLResourceValues(); resource.isExcludedFromBackup = true
            var excluded = folder; try excluded.setResourceValues(resource)
            let path = folder.appendingPathComponent("result-data-receipt.json")
            try bytes.write(to: path, options: [.atomic, .completeFileProtection])
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: path.path)
            excluded = path; try excluded.setResourceValues(resource)
            guard try Data(contentsOf: path) == bytes else { throw NativeDataError.sessionUnavailable }
            url = path
            return path
        } catch { try clear(); throw error }
    }
}

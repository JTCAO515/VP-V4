import CryptoKit
import Foundation
import ImageIO

/// A device-only, owner-scoped inbox. Raw screenshots never enter Trip or a
/// server request; the caller must delete the receipt after review/cancel.
nonisolated struct NativeScreenshotInbox: Sendable {
    struct Receipt: Equatable, Sendable {
        let digest: String
        let duplicate: Bool
        let expiresAt: Date
    }

    private let root: URL
    private let lifetime: TimeInterval

    init(root: URL? = nil, lifetime: TimeInterval = 86_400) {
        self.root = root ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("ScreenshotInbox", isDirectory: true)
        self.lifetime = lifetime
    }

    func receive(_ data: Data, owner: String, now: Date = Date()) throws -> Receipt {
        guard UUID(uuidString: owner) != nil, !data.isEmpty, data.count <= 12_000_000,
              lifetime > 0, lifetime <= 86_400, Self.acceptsImage(data) else { throw InboxError.invalidInput }
        try purge(owner: owner, now: now)
        let digest = Self.digest(data)
        let folder = ownerFolder(owner)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true,
                                                attributes: [.protectionKey: FileProtectionType.complete])
        try excludeFromBackup(folder)
        let target = folder.appendingPathComponent(digest + ".image")
        // A new import supersedes any abandoned receipt from a crashed review.
        for previous in try FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)
        where previous != target {
            try FileManager.default.removeItem(at: previous)
        }
        if let created = try? target.resourceValues(forKeys: [.creationDateKey]).creationDate,
           created.addingTimeInterval(lifetime) > now {
            return Receipt(digest: digest, duplicate: true, expiresAt: created.addingTimeInterval(lifetime))
        }
        try data.write(to: target, options: [.atomic, .completeFileProtection])
        try excludeFromBackup(target)
        return Receipt(digest: digest, duplicate: false, expiresAt: now.addingTimeInterval(lifetime))
    }

    func read(_ digest: String, owner: String, now: Date = Date()) throws -> Data {
        guard UUID(uuidString: owner) != nil, Self.validDigest(digest) else { throw InboxError.invalidInput }
        let target = ownerFolder(owner).appendingPathComponent(digest + ".image")
        guard let created = try target.resourceValues(forKeys: [.creationDateKey]).creationDate,
              created.addingTimeInterval(lifetime) > now else { throw InboxError.expired }
        let size = try target.resourceValues(forKeys: [.fileSizeKey]).fileSize
        guard let size, size > 0, size <= 12_000_000 else { throw InboxError.invalidInput }
        let data = try Data(contentsOf: target)
        guard Self.digest(data) == digest else { throw InboxError.invalidInput }
        return data
    }

    func delete(_ digest: String, owner: String) throws {
        guard UUID(uuidString: owner) != nil, Self.validDigest(digest) else { throw InboxError.invalidInput }
        let target = ownerFolder(owner).appendingPathComponent(digest + ".image")
        if FileManager.default.fileExists(atPath: target.path) { try FileManager.default.removeItem(at: target) }
    }

    /// Account replacement/logout invalidates every locally retained receipt.
    /// `root` is always an app-owned child of Application Support (or an
    /// explicit narrow test directory), never a workspace/home directory.
    func deleteAll() throws {
        if FileManager.default.fileExists(atPath: root.path) {
            try FileManager.default.removeItem(at: root)
        }
    }

    func purge(owner: String, now: Date = Date()) throws {
        guard UUID(uuidString: owner) != nil else { throw InboxError.invalidInput }
        let folder = ownerFolder(owner)
        guard FileManager.default.fileExists(atPath: folder.path) else { return }
        for file in try FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: [.creationDateKey]) {
            guard file.pathExtension == "image", Self.validDigest(file.deletingPathExtension().lastPathComponent),
                  let created = try? file.resourceValues(forKeys: [.creationDateKey]).creationDate,
                  created.addingTimeInterval(lifetime) > now else {
                try FileManager.default.removeItem(at: file)
                continue
            }
        }
    }

    private func ownerFolder(_ owner: String) -> URL {
        let key = Self.digest(Data(owner.lowercased().utf8))
        return root.appendingPathComponent(key, isDirectory: true)
    }

    private func excludeFromBackup(_ url: URL) throws {
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var target = url
        try target.setResourceValues(values)
    }

    private static func validDigest(_ value: String) -> Bool {
        value.count == 64 && value.unicodeScalars.allSatisfy { ("0"..."9").contains(String($0)) || ("a"..."f").contains(String($0)) }
    }

    private static func digest(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    private static func acceptsImage(_ data: Data) -> Bool {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let type = CGImageSourceGetType(source) as String?,
              ["public.png", "public.jpeg", "public.heic", "public.heif"].contains(type),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [String: Any],
              let width = properties[kCGImagePropertyPixelWidth as String] as? Int,
              let height = properties[kCGImagePropertyPixelHeight as String] as? Int,
              width > 0, height > 0, width <= 8_192, height <= 8_192,
              width <= 16_000_000 / height else { return false }
        return true
    }
}

enum InboxError: Error { case invalidInput, expired }

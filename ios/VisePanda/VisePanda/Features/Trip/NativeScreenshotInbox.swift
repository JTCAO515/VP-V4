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

    func receipts(owner: String, now: Date = Date()) throws -> [Receipt] {
        try purge(owner: owner, now: now)
        let folder = ownerFolder(owner)
        guard FileManager.default.fileExists(atPath: folder.path) else { return [] }
        return try FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: [.creationDateKey]).sorted { $0.lastPathComponent < $1.lastPathComponent }.map { file in
            let digest = file.deletingPathExtension().lastPathComponent
            _ = try read(digest, owner: owner, now: now)
            guard let created = try file.resourceValues(forKeys: [.creationDateKey]).creationDate else { throw InboxError.invalidInput }
            return Receipt(digest: digest, duplicate: false, expiresAt: created.addingTimeInterval(lifetime))
        }
    }

    struct FileSelection: Codable, Equatable, Sendable {
        let digest: String
        let fileIdentity: String
        let bytes: Int
        var valid: Bool { NativeScreenshotInbox.validDigest(digest) && NativeScreenshotInbox.validDigest(fileIdentity) && (1...12_000_000).contains(bytes) }
    }
    func selections(owner:String) throws -> [FileSelection] {
        let receipts=try receipts(owner:owner)
        guard receipts.count<=100 else { throw InboxError.invalidInput }
        return try receipts.map { receipt in
            guard let selection=try selection(receipt.digest,owner:owner) else { throw InboxError.invalidInput }
            return selection
        }
    }
    func selection(_ digest:String,owner:String) throws -> FileSelection? {
        guard UUID(uuidString:owner) != nil,Self.validDigest(digest) else { throw InboxError.invalidInput }
        let file=ownerFolder(owner).appendingPathComponent(digest+".image")
        let attributes:[FileAttributeKey:Any]
        do { attributes=try FileManager.default.attributesOfItem(atPath:file.path) }
        catch let error as NSError {
            if error.domain==NSCocoaErrorDomain && error.code==NSFileReadNoSuchFileError { return nil }
            throw error // Permission/locked storage is not absence.
        }
        guard attributes[.type] as? FileAttributeType == .typeRegular,
              let inode=attributes[.systemFileNumber] as? NSNumber,let device=attributes[.systemNumber] as? NSNumber,
              let created=attributes[.creationDate] as? Date,let size=attributes[.size] as? NSNumber,(1...12_000_000).contains(size.intValue) else { throw InboxError.invalidInput }
        let data=try Data(contentsOf:file)
        guard data.count==size.intValue,Self.digest(data)==digest else { throw InboxError.invalidInput }
        let identity=Self.digest(Data("\(device.uint64Value):\(inode.uint64Value):\(created.timeIntervalSince1970.bitPattern)".utf8))
        return FileSelection(digest:digest,fileIdentity:identity,bytes:data.count)
    }
    func validate(_ files:[FileSelection],owner:String) throws {
        guard (1...100).contains(files.count),Set(files.map(\.digest)).count==files.count,files.allSatisfy(\.valid) else { throw InboxError.invalidInput }
        for file in files { guard try selection(file.digest,owner:owner)==file else { throw InboxError.invalidInput } }
    }
    func deleteSelected(_ file:FileSelection,owner:String) throws {
        guard file.valid else { throw InboxError.invalidInput }
        if let current=try selection(file.digest,owner:owner) {
            guard current==file else { throw InboxError.invalidInput } // A replacement file is outside this request.
            try delete(file.digest,owner:owner)
        }
        guard try selection(file.digest,owner:owner)==nil else { throw InboxError.invalidInput }
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

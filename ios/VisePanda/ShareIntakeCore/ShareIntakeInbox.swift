import CoreGraphics
import CryptoKit
import Darwin
import Foundation

nonisolated enum ShareIntakeError: Error, Equatable {
    case unavailable, format, size, pages, encrypted, expired, scope, integrity, full, cancelled
}

/// Shared codec compiled into the app and extension. It holds no credentials or Trip authority.
nonisolated struct ShareIntakeInbox: Sendable {
    nonisolated struct Receipt: Codable, Equatable, Sendable, Identifiable {
        let version: Int
        let id: UUID
        let digest: String
        let byteCount: Int
        let pageCount: Int
        let createdAt: Date
        let expiresAt: Date
        let ownerNamespace: String?
        let fileIdentity: String
    }

    static let maximumBytes = 20_000_000
    static let maximumPages = 10
    static let maximumEntries = 8
    static let maximumLifetime: TimeInterval = 86_400
    static let configurationKey = "VPShareIntakeAppGroupIdentifier"
    private let container: URL
    private let lifetime: TimeInterval
    private var root: URL { container.appendingPathComponent("ShareIntake-v1", isDirectory: true) }

    /// A real container is used only when an identifier is explicitly configured and entitled.
    static func configured(bundle: Bundle = .main) throws -> Self {
        guard let identifier = bundle.object(forInfoDictionaryKey: configurationKey) as? String,
              !identifier.isEmpty, identifier.hasPrefix("group."), !identifier.contains("$("),
              identifier.rangeOfCharacter(from: .whitespacesAndNewlines) == nil,
              let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: identifier) else {
            throw ShareIntakeError.unavailable
        }
        return try Self(container: container)
    }

    /// Injection is for an owned synthetic container, never a fallback for missing entitlements.
    init(container: URL, lifetime: TimeInterval = maximumLifetime) throws {
        guard container.isFileURL, lifetime > 0, lifetime <= Self.maximumLifetime else { throw ShareIntakeError.scope }
        self.container = container
        self.lifetime = lifetime
    }

    /// No text extraction, filename retention, owner inference, or external work in the extension.
    func receive(fileAt url: URL, now: Date = Date(), cancelled: () -> Bool = { false }) throws -> Receipt {
        guard url.isFileURL, url.pathExtension.lowercased() == "pdf" else { throw ShareIntakeError.format }
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        let data = try Self.boundedRead(url, limit: Self.maximumBytes, cancelled: cancelled)
        let pages = try Self.pdfPageCount(data)
        return try locked {
            try purgeLocked(now: now)
            guard try entriesLocked().count < Self.maximumEntries else { throw ShareIntakeError.full }
            guard !cancelled() else { throw ShareIntakeError.cancelled }
            let id = UUID()
            let stage = root.appendingPathComponent(".stage-" + id.uuidString, isDirectory: true)
            let destination = folder(id: id, namespace: nil)
            do {
                try privateDirectory(stage)
                let source = stage.appendingPathComponent("source.pdf")
                try privateWrite(data, to: source)
                let receipt = Receipt(version: 1, id: id, digest: Self.digest(data), byteCount: data.count,
                    pageCount: pages, createdAt: now, expiresAt: now.addingTimeInterval(lifetime),
                    ownerNamespace: nil, fileIdentity: try Self.identity(source))
                try privateWrite(JSONEncoder().encode(receipt), to: stage.appendingPathComponent("receipt.json"))
                guard !cancelled() else { throw ShareIntakeError.cancelled }
                try privateDirectory(destination.deletingLastPathComponent())
                try FileManager.default.moveItem(at: stage, to: destination)
                return receipt
            } catch {
                try? FileManager.default.removeItem(at: stage)
                throw error
            }
        }
    }

    /// Unclaimed rows contain metadata only. Reading bytes requires an explicit claim first.
    func available(namespace: String, now: Date = Date()) throws -> [Receipt] {
        guard Self.validNamespace(namespace) else { throw ShareIntakeError.scope }
        return try locked {
            try purgeLocked(now: now)
            return try entriesLocked().filter { $0.ownerNamespace == nil || $0.ownerNamespace == namespace }
                .sorted { $0.createdAt < $1.createdAt }
        }
    }

    /// Signed-out manual selection reveals anonymous metadata only, never other accounts' rows/counts.
    func unclaimed(now: Date = Date()) throws -> [Receipt] {
        try locked {
            try purgeLocked(now: now)
            let anonymous = try entriesLocked().filter { $0.ownerNamespace == nil }.sorted { $0.createdAt < $1.createdAt }
            for receipt in anonymous { _ = try validateLocked(receipt, namespace: nil, now: now) }
            return anonymous
        }
    }

    /// Validates one anonymous ID for initial-login preservation, without exposing its bytes or inferring an owner.
    func unclaimedReceipt(id: UUID, now: Date = Date()) throws -> Receipt {
        try locked {
            let receipt = try metadata(folder(id: id, namespace: nil))
            guard receipt.id == id, receipt.ownerNamespace == nil else { throw ShareIntakeError.scope }
            _ = try validateLocked(receipt, namespace: nil, now: now)
            return receipt
        }
    }

    /// Caller must revalidate its authenticated account/endpoint/epoch immediately before this synchronous call.
    /// A link, item provider or login alone never confirms ownership of an unclaimed material.
    func claim(_ receipt: Receipt, namespace: String, userConfirmed: Bool, now: Date = Date()) throws -> Receipt {
        guard userConfirmed, Self.validNamespace(namespace),
              receipt.ownerNamespace == nil || receipt.ownerNamespace == namespace else { throw ShareIntakeError.scope }
        return try locked {
            _ = try validateLocked(receipt, namespace: receipt.ownerNamespace, now: now)
            if let owner = receipt.ownerNamespace {
                guard owner == namespace else { throw ShareIntakeError.scope }
                return receipt
            }
            let claimed = Receipt(version: receipt.version, id: receipt.id, digest: receipt.digest,
                byteCount: receipt.byteCount, pageCount: receipt.pageCount, createdAt: receipt.createdAt,
                expiresAt: receipt.expiresAt, ownerNamespace: namespace, fileIdentity: receipt.fileIdentity)
            let original = folder(id: receipt.id, namespace: nil)
            let destination = folder(id: receipt.id, namespace: namespace)
            let stage = root.appendingPathComponent(".stage-" + UUID().uuidString, isDirectory: true)
            try privateDirectory(destination.deletingLastPathComponent())
            // A crash during claim leaves only a disposable stage, never mismatched visible ownership.
            do {
                try FileManager.default.moveItem(at: original, to: stage)
                try privateWrite(JSONEncoder().encode(claimed), to: stage.appendingPathComponent("receipt.json"))
                try FileManager.default.moveItem(at: stage, to: destination)
            } catch {
                try? FileManager.default.removeItem(at: stage)
                throw error
            }
            return claimed
        }
    }

    func read(_ receipt: Receipt, namespace: String, now: Date = Date()) throws -> Data {
        guard Self.validNamespace(namespace), receipt.ownerNamespace == namespace else { throw ShareIntakeError.scope }
        return try locked {
            try validateLocked(receipt, namespace: namespace, now: now)
        }
    }

    /// F1 owns extraction/field correction/Proposal. URL is private, short lived, and must never enter a link/log.
    func sourceURL(_ receipt: Receipt, namespace: String, now: Date = Date()) throws -> URL {
        guard Self.validNamespace(namespace), receipt.ownerNamespace == namespace else { throw ShareIntakeError.scope }
        return try locked {
            _ = try validateLocked(receipt, namespace: namespace, now: now)
            return folder(id: receipt.id, namespace: namespace).appendingPathComponent("source.pdf")
        }
    }

    /// Unclaimed deletion is an explicit dismiss/cancel only. Owned records require their current namespace.
    func delete(_ receipt: Receipt, namespace: String?, now: Date = Date()) throws {
        guard receipt.ownerNamespace == namespace, namespace.map(Self.validNamespace) ?? true else { throw ShareIntakeError.scope }
        try locked {
            let location = folder(id: receipt.id, namespace: namespace)
            guard FileManager.default.fileExists(atPath: location.path) else { return }
            guard try metadata(location) == receipt else { throw ShareIntakeError.integrity }
            try FileManager.default.removeItem(at: location)
        }
    }

    /// Logout/account transition/deletion must call before permitting new imports. Failure fences the app flow.
    /// Removes pending material too, so a subsequent account cannot inherit an earlier unclaimed selection.
    /// Only the credential-free initial-login flow may preserve a selected, validated anonymous ID.
    /// Every signout, owner/endpoint/epoch transition, denial and privacy deletion passes nil.
    func eraseAll(preservingUnclaimedID: UUID? = nil, now: Date = Date()) throws {
        try locked {
            if let id = preservingUnclaimedID {
                let pending = folder(id: id, namespace: nil)
                let receipt = try metadata(pending)
                guard receipt.id == id, receipt.ownerNamespace == nil else { throw ShareIntakeError.scope }
                _ = try validateLocked(receipt, namespace: nil, now: now)
                for item in try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) {
                    if item.lastPathComponent == "unclaimed" {
                        try regularDirectory(item)
                        for entry in try FileManager.default.contentsOfDirectory(at: item, includingPropertiesForKeys: nil) where entry.lastPathComponent != id.uuidString {
                            try FileManager.default.removeItem(at: entry)
                        }
                    } else {
                        try FileManager.default.removeItem(at: item)
                    }
                }
                guard try entriesLocked() == [receipt] else { throw ShareIntakeError.integrity }
            } else {
                try FileManager.default.removeItem(at: root)
                guard !FileManager.default.fileExists(atPath: root.path) else { throw ShareIntakeError.integrity }
            }
        }
    }

    func purge(now: Date = Date()) throws { try locked { try purgeLocked(now: now) } }

    static func validNamespace(_ namespace: String) -> Bool {
        namespace.utf8.count == 64 && namespace.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) }
    }

    static func digest(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }

    private func folder(id: UUID, namespace: String?) -> URL {
        root.appendingPathComponent(namespace ?? "unclaimed", isDirectory: true).appendingPathComponent(id.uuidString, isDirectory: true)
    }

    private func validateLocked(_ receipt: Receipt, namespace: String?, now: Date) throws -> Data {
        guard receipt.version == 1, receipt.ownerNamespace == namespace,
              namespace.map(Self.validNamespace) ?? true, Self.validNamespace(receipt.digest),
              receipt.createdAt <= now, receipt.expiresAt > receipt.createdAt,
              receipt.expiresAt.timeIntervalSince(receipt.createdAt) <= Self.maximumLifetime else { throw ShareIntakeError.scope }
        guard receipt.expiresAt > now else { throw ShareIntakeError.expired }
        let location = folder(id: receipt.id, namespace: namespace)
        guard try metadata(location) == receipt else { throw ShareIntakeError.integrity }
        let url = location.appendingPathComponent("source.pdf")
        let data = try Self.boundedRead(url, limit: Self.maximumBytes)
        guard data.count == receipt.byteCount, Self.digest(data) == receipt.digest,
              try Self.identity(url) == receipt.fileIdentity,
              (1...Self.maximumPages).contains(receipt.pageCount) else { throw ShareIntakeError.integrity }
        return data
    }

    private func metadata(_ location: URL) throws -> Receipt {
        try regularDirectory(location.deletingLastPathComponent())
        try regularDirectory(location)
        let bytes = try Self.boundedRead(location.appendingPathComponent("receipt.json"), limit: 2048)
        return try JSONDecoder().decode(Receipt.self, from: bytes)
    }

    private func entriesLocked() throws -> [Receipt] {
        var result: [Receipt] = []
        for directory in try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) {
            let name = directory.lastPathComponent
            guard name == "unclaimed" || Self.validNamespace(name) else { throw ShareIntakeError.integrity }
            try regularDirectory(directory)
            for item in try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) {
                guard let id = UUID(uuidString: item.lastPathComponent) else { throw ShareIntakeError.integrity }
                let receipt = try metadata(item)
                guard receipt.id == id, receipt.ownerNamespace == (name == "unclaimed" ? nil : name),
                      receipt.version == 1, Self.validNamespace(receipt.digest), Self.validNamespace(receipt.fileIdentity),
                      (1...Self.maximumBytes).contains(receipt.byteCount), (1...Self.maximumPages).contains(receipt.pageCount),
                      receipt.expiresAt > receipt.createdAt,
                      receipt.expiresAt.timeIntervalSince(receipt.createdAt) <= Self.maximumLifetime else { throw ShareIntakeError.integrity }
                guard result.count < Self.maximumEntries else { throw ShareIntakeError.integrity }
                result.append(receipt)
            }
        }
        return result
    }

    private func purgeLocked(now: Date) throws {
        // A killed producer can leave a private staging folder, never a visible receipt.
        for item in try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) where item.lastPathComponent.hasPrefix(".stage-") {
            try FileManager.default.removeItem(at: item)
        }
        for receipt in try entriesLocked() where receipt.expiresAt <= now || receipt.createdAt > now {
            try FileManager.default.removeItem(at: folder(id: receipt.id, namespace: receipt.ownerNamespace))
        }
    }

    /// This is the only mutable shared resource. flock serializes extension/app across processes.
    private func locked<T>(_ body: () throws -> T) throws -> T {
        try regularDirectory(container)
        let path = container.appendingPathComponent("ShareIntake-v1.lock").path
        let descriptor = Darwin.open(path, O_CREAT | O_RDWR | O_NOFOLLOW | O_CLOEXEC, S_IRUSR | S_IWUSR)
        guard descriptor >= 0 else { throw ShareIntakeError.unavailable }
        defer { Darwin.close(descriptor) }
        guard flock(descriptor, LOCK_EX) == 0 else { throw ShareIntakeError.unavailable }
        defer { _ = flock(descriptor, LOCK_UN) }
        try privateDirectory(root)
        return try body()
    }

    private func regularDirectory(_ url: URL) throws {
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        guard attributes[.type] as? FileAttributeType == .typeDirectory else { throw ShareIntakeError.integrity }
    }

    private func privateDirectory(_ url: URL) throws {
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        try regularDirectory(url)
        #if os(iOS)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: url.path)
        #endif
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        var writable = url; try writable.setResourceValues(values)
    }

    private func privateWrite(_ data: Data, to url: URL) throws {
        #if os(iOS)
        try data.write(to: url, options: [.atomic, .completeFileProtection])
        #else
        try data.write(to: url, options: .atomic)
        #endif
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }

    private static func boundedRead(_ url: URL, limit: Int, cancelled: () -> Bool = { false }) throws -> Data {
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        guard attributes[.type] as? FileAttributeType == .typeRegular else { throw ShareIntakeError.format }
        guard let size = attributes[.size] as? NSNumber, size.intValue > 0, size.intValue <= limit else { throw ShareIntakeError.size }
        let descriptor = Darwin.open(url.path, O_RDONLY | O_NOFOLLOW | O_CLOEXEC)
        guard descriptor >= 0 else { throw ShareIntakeError.format }
        let file = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
        defer { try? file.close() }
        var bytes = Data()
        while let chunk = try file.read(upToCount: min(65_536, limit + 1 - bytes.count)), !chunk.isEmpty {
            guard !cancelled() else { throw ShareIntakeError.cancelled }
            bytes.append(chunk)
            guard bytes.count <= limit else { throw ShareIntakeError.size }
        }
        guard !bytes.isEmpty else { throw ShareIntakeError.format }
        return bytes
    }

    private static func pdfPageCount(_ data: Data) throws -> Int {
        guard data.starts(with: Data("%PDF-".utf8)), let provider = CGDataProvider(data: data as CFData),
              let pdf = CGPDFDocument(provider) else { throw ShareIntakeError.format }
        guard !pdf.isEncrypted else { throw ShareIntakeError.encrypted }
        guard (1...maximumPages).contains(pdf.numberOfPages) else { throw ShareIntakeError.pages }
        return pdf.numberOfPages
    }

    private static func identity(_ url: URL) throws -> String {
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        guard attributes[.type] as? FileAttributeType == .typeRegular,
              let inode = attributes[.systemFileNumber] as? NSNumber, let device = attributes[.systemNumber] as? NSNumber,
              let created = attributes[.creationDate] as? Date else { throw ShareIntakeError.integrity }
        return digest(Data("\(device.uint64Value):\(inode.uint64Value):\(created.timeIntervalSince1970.bitPattern)".utf8))
    }
}

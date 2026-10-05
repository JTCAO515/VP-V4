import Foundation

/// App-owned copies only. The selected Files URL is never retained, modified or deleted.
nonisolated struct NativePDFInbox: Sendable {
    struct Receipt: Codable, Sendable, Equatable {
        let id: UUID
        let namespace: String
        let digest: String
        let fileIdentity: String
        let expiresAt: Date
    }
    private let root: URL
    private let lifetime: TimeInterval
    init(root: URL? = nil, lifetime: TimeInterval = 86_400) {
        self.root = root ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("PDFIntake", isDirectory: true)
        self.lifetime = lifetime
    }
    func receive(_ data: Data, namespace: String, now: Date = Date()) throws -> (Receipt, NativePDFDocument) {
        guard valid(namespace), lifetime > 0, lifetime <= 86_400 else { throw NativePDFError.scope }
        let document = try NativePDFDocument.extract(data)
        return (try receiveValidated(data, document: document, namespace: namespace, now: now), document)
    }
    func receiveValidated(_ data: Data, document: NativePDFDocument, namespace: String, now: Date = Date()) throws -> Receipt {
        guard valid(namespace), lifetime > 0, lifetime <= 86_400, document.digest == NativePDFDocument.digest(data),
              document.bytes == data.count, (1...NativePDFDocument.maximumBytes).contains(data.count),
              (1...NativePDFDocument.maximumPages).contains(document.pages.count) else { throw NativePDFError.format }
        try purge(now: now)
        let id = UUID()
        let folder = root.appendingPathComponent(namespace, isDirectory: true).appendingPathComponent(id.uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true,
                                                    attributes: [.protectionKey: FileProtectionType.complete])
            var excluded = URLResourceValues(); excluded.isExcludedFromBackup = true
            var writable = root; try writable.setResourceValues(excluded)
            try data.write(to: folder.appendingPathComponent("source.pdf"), options: [.atomic, .completeFileProtection])
            let receipt = Receipt(id: id, namespace: namespace, digest: document.digest, fileIdentity: try identity(folder.appendingPathComponent("source.pdf")), expiresAt: now.addingTimeInterval(lifetime))
            try JSONEncoder().encode(receipt).write(to: folder.appendingPathComponent("receipt.json"), options: [.atomic, .completeFileProtection])
            return receipt
        } catch {
            try? FileManager.default.removeItem(at: folder)
            throw error
        }
    }
    func validate(_ receipt: Receipt, namespace: String, now: Date = Date()) throws {
        guard valid(namespace), receipt.namespace == namespace, valid(receipt.digest) else { throw NativePDFError.scope }
        guard receipt.expiresAt > now else { throw NativePDFError.expired }
        let folder = location(receipt)
        let metadata = try Data(contentsOf: folder.appendingPathComponent("receipt.json"))
        guard metadata.count <= 2048, try JSONDecoder().decode(Receipt.self, from: metadata) == receipt else { throw NativePDFError.scope }
        let data = try NativePDFDocument.readSelectedURL(folder.appendingPathComponent("source.pdf"))
        guard NativePDFDocument.digest(data) == receipt.digest, try identity(folder.appendingPathComponent("source.pdf")) == receipt.fileIdentity else { throw NativePDFError.format }
    }
    func delete(_ receipt: Receipt) throws {
        guard valid(receipt.namespace), valid(receipt.digest) else { throw NativePDFError.scope }
        let folder = location(receipt)
        if FileManager.default.fileExists(atPath: folder.path) {
            let bytes = try Data(contentsOf: folder.appendingPathComponent("receipt.json"))
            guard bytes.count <= 2048, try JSONDecoder().decode(Receipt.self, from: bytes) == receipt,
                  try identity(folder.appendingPathComponent("source.pdf")) == receipt.fileIdentity else { throw NativePDFError.scope }
            try FileManager.default.removeItem(at: folder)
        }
        guard !FileManager.default.fileExists(atPath: folder.path) else { throw NativePDFError.scope }
    }
    func eraseAll() throws {
        if FileManager.default.fileExists(atPath: root.path) { try FileManager.default.removeItem(at: root) }
        guard !FileManager.default.fileExists(atPath: root.path) else { throw NativePDFError.scope }
    }
    func purge(now: Date = Date()) throws {
        guard FileManager.default.fileExists(atPath: root.path) else { return }
        for namespace in try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) {
            guard valid(namespace.lastPathComponent) else { throw NativePDFError.scope }
            for folder in try FileManager.default.contentsOfDirectory(at: namespace, includingPropertiesForKeys: nil) {
                guard UUID(uuidString: folder.lastPathComponent) != nil else { throw NativePDFError.scope }
                let data = try Data(contentsOf: folder.appendingPathComponent("receipt.json"))
                guard data.count <= 2048 else { throw NativePDFError.format }
                let receipt = try JSONDecoder().decode(Receipt.self, from: data)
                guard receipt.namespace == namespace.lastPathComponent, receipt.id.uuidString == folder.lastPathComponent else { throw NativePDFError.scope }
                if receipt.expiresAt <= now { try delete(receipt) }
            }
        }
    }
    private func location(_ receipt: Receipt) -> URL {
        root.appendingPathComponent(receipt.namespace, isDirectory: true).appendingPathComponent(receipt.id.uuidString, isDirectory: true)
    }
    private func identity(_ url: URL) throws -> String {
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        guard attributes[.type] as? FileAttributeType == .typeRegular,
              let inode = attributes[.systemFileNumber] as? NSNumber, let device = attributes[.systemNumber] as? NSNumber,
              let created = attributes[.creationDate] as? Date else { throw NativePDFError.scope }
        return NativePDFDocument.digest(Data("\(device.uint64Value):\(inode.uint64Value):\(created.timeIntervalSince1970.bitPattern)".utf8))
    }
    private func valid(_ value: String) -> Bool {
        value.count == 64 && value.allSatisfy { ("0"..."9").contains(String($0)) || ("a"..."f").contains(String($0)) }
    }
}

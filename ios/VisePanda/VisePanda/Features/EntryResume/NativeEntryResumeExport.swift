import Foundation
import Observation

/// Explicit local-only export. Share UI receives independent protected temporary files, never the shared container.
@MainActor
@Observable
final class NativeEntryResumeExport {
    struct Copy: Identifiable {
        let id: UUID
        let entryID: UUID
        let scope: NativeDataScope
        let expiresAt: Date
        let files: [URL]
    }
    private(set) var copy: Copy?
    private let root: URL
    init(root: URL = FileManager.default.temporaryDirectory.appendingPathComponent("EntryResumeExports-v1", isDirectory: true)) { self.root = root }

    func prepare(_ bytes: Data, receipt: ShareIntakeInbox.Receipt, scope: NativeDataScope, now: Date = Date()) throws {
        guard receipt.ownerNamespace == NativePDFWire.namespace(scope), receipt.expiresAt > now,
              receipt.expiresAt.timeIntervalSince1970.isFinite, bytes.count == receipt.byteCount,
              ShareIntakeInbox.digest(bytes) == receipt.digest else { throw ShareIntakeError.scope }
        try eraseAll()
        let id = UUID(); let folder = root.appendingPathComponent(id.uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            #if os(iOS)
            try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: folder.path)
            #endif
            var excluded = URLResourceValues(); excluded.isExcludedFromBackup = true
            var writable = root; try writable.setResourceValues(excluded)
            let expiry = min(receipt.expiresAt, now.addingTimeInterval(300))
            let pdf = folder.appendingPathComponent("material.pdf")
            let manifest = folder.appendingPathComponent("manifest.json")
            let metadata = try JSONSerialization.data(withJSONObject: [
                "kind": "native_local_shared_pdf_export/1", "entryID": receipt.id.uuidString.lowercased(),
                "sha256": receipt.digest, "byteCount": receipt.byteCount,
                "originalExpiresAt": NativePDFWire.instant(receipt.expiresAt), "copyExpiresAt": NativePDFWire.instant(expiry),
                "coverage": "local_original_shared_pdf_only"
            ], options: [.sortedKeys])
            try write(bytes, to: pdf); try write(metadata, to: manifest)
            copy = .init(id: id, entryID: receipt.id, scope: scope, expiresAt: expiry, files: [pdf, manifest])
        } catch {
            try eraseAll()
            throw error
        }
    }
    func current(scope: NativeDataScope?, now: Date = Date()) -> Copy? {
        guard let copy, copy.scope == scope, copy.expiresAt > now else { return nil }
        return copy
    }
    func eraseAll() throws {
        copy = nil // Fence before attempting disk cleanup; failure never reports success.
        if FileManager.default.fileExists(atPath: root.path) { try FileManager.default.removeItem(at: root) }
        guard !FileManager.default.fileExists(atPath: root.path) else { throw ShareIntakeError.integrity }
    }
    private func write(_ bytes: Data, to url: URL) throws {
        #if os(iOS)
        try bytes.write(to: url, options: [.atomic, .completeFileProtection])
        #else
        try bytes.write(to: url, options: .atomic)
        #endif
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }
}

import Foundation
import Security

struct NativePDFJournal: Codable, Equatable {
    let endpoint: String
    let owner: String
    let epoch: Int
    let tripID: String
    let command: NativePDFCommand
    let previewDigest: String
    let bytes: Data
    var requestDigest: String { NativePDFDocument.digest(bytes) }
    private var validBytes: Bool {
        guard bytes.count <= 8192,
              let object = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              Set(object.keys) == ["command", "reviewedPreviewDigest"], object["reviewedPreviewDigest"] as? String == previewDigest,
              let raw = object["command"], let data = try? JSONSerialization.data(withJSONObject: raw),
              let decoded = try? JSONDecoder().decode(NativePDFCommand.self, from: data), decoded == command,
              let canonical = try? JSONSerialization.data(withJSONObject: raw, options: [.sortedKeys, .withoutEscapingSlashes]),
              NativePDFDocument.digest(canonical) == command.digest else { return false }
        return true
    }
    func matches(_ actor: NativeDataScope) -> Bool {
        endpoint == actor.endpoint && owner == actor.subject && epoch == actor.mobileEpoch
        && NativePDFWire.uuid(tripID) && command.valid && NativePDFWire.hash(previewDigest) && validBytes
    }
}

/// An unknown ACK retains the original request. Neither a timeout nor an empty view releases it.
@MainActor struct NativePDFJournalVault {
    let vault: any NativeCredentialVault
    static func service(_ endpoint: String) -> String { "com.visepanda.native.local-session.v2.pdf-intake." + endpoint }
    func read(_ actor: NativeDataScope) throws -> NativePDFJournal? {
        let (status, bytes) = vault.read(service: Self.service(actor.endpoint), owner: actor.subject)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let bytes, bytes.count <= 32_000 else { throw NativeDataError.sessionUnavailable }
        let journal = try JSONDecoder().decode(NativePDFJournal.self, from: bytes)
        guard journal.matches(actor) else { throw NativeDataError.staleSessionResponse }
        return journal
    }
    func remember(_ journal: NativePDFJournal, actor: NativeDataScope) throws {
        guard journal.matches(actor), journal.bytes.count <= 8192 else { throw NativeDataError.invalidResponse }
        if let existing = try read(actor), existing != journal { throw NativeDataError.server(code: "PDF_RECOVERY_REQUIRED") }
        let bytes = try JSONEncoder().encode(journal)
        guard bytes.count <= 32_000, vault.write(bytes, service: Self.service(actor.endpoint), owner: actor.subject) == errSecSuccess else { throw NativeDataError.sessionUnavailable }
    }
    func complete(_ journal: NativePDFJournal, actor: NativeDataScope) throws {
        guard try read(actor) == journal else { throw NativeDataError.staleSessionResponse }
        try Self.erase(endpoint: actor.endpoint, owner: actor.subject, vault: vault)
    }
    static func erase(endpoint: String, owner: String, vault: any NativeCredentialVault) throws {
        let result = vault.remove(service: service(endpoint), owner: owner)
        guard result == errSecSuccess || result == errSecItemNotFound else { throw NativeDataError.sessionUnavailable }
    }
}

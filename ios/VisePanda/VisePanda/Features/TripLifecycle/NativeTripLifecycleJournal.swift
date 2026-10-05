import Foundation
import Security

struct NativeTripLifecycleJournal: Codable, Equatable {
    let schemaVersion: Int
    let endpoint: String
    let owner: String
    let epoch: Int
    let bytes: Data

    func matches(_ actor: NativeDataScope) -> Bool {
        schemaVersion == 1 && endpoint == actor.endpoint && owner == actor.subject && epoch == actor.mobileEpoch
    }
    func command() throws -> NativeTripLifecycleCommand {
        guard schemaVersion == 1 else { throw NativeDataError.invalidResponse }
        return try NativeTripLifecycleCommand(bytes: bytes)
    }
}

/// Device-only write-before-send storage. Never overwrites an unresolved operation.
@MainActor struct NativeTripLifecycleJournalVault {
    let vault: any NativeCredentialVault
    static func service(_ endpoint: String) -> String { "com.visepanda.native.local-session.v2.trip-lifecycle." + endpoint }
    func read(_ actor: NativeDataScope) throws -> NativeTripLifecycleJournal? {
        let (status, bytes) = vault.read(service: Self.service(actor.endpoint), owner: actor.subject)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let bytes, bytes.count <= 64_000 else { throw NativeDataError.sessionUnavailable }
        let value = try JSONDecoder().decode(NativeTripLifecycleJournal.self, from: bytes)
        guard value.matches(actor) else { throw NativeDataError.staleSessionResponse }
        _ = try value.command()
        return value
    }
    func remember(_ command: NativeTripLifecycleCommand, actor: NativeDataScope) throws -> NativeTripLifecycleJournal {
        if let existing = try read(actor) {
            guard existing.bytes == command.bytes else { throw NativeDataError.staleSessionResponse }
            return existing
        }
        let value = NativeTripLifecycleJournal(schemaVersion: 1, endpoint: actor.endpoint, owner: actor.subject,
                                               epoch: actor.mobileEpoch, bytes: command.bytes)
        let bytes = try JSONEncoder().encode(value)
        guard bytes.count <= 64_000, vault.write(bytes, service: Self.service(actor.endpoint), owner: actor.subject) == errSecSuccess,
              try read(actor) == value else { throw NativeDataError.sessionUnavailable }
        return value
    }
    func complete(_ journal: NativeTripLifecycleJournal, actor: NativeDataScope) throws {
        guard journal.matches(actor), try read(actor) == journal else { throw NativeDataError.staleSessionResponse }
        try Self.erase(endpoint: actor.endpoint, owner: actor.subject, vault: vault)
    }
    static func erase(endpoint: String, owner: String, vault: any NativeCredentialVault) throws {
        let status = vault.remove(service: service(endpoint), owner: owner)
        guard status == errSecSuccess || status == errSecItemNotFound,
              vault.read(service: service(endpoint), owner: owner).0 == errSecItemNotFound else { throw NativeDataError.sessionUnavailable }
    }
}

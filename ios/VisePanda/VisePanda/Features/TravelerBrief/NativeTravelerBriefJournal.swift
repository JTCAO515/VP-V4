import Foundation
import Security

struct NativeTravelerBriefPending: Codable, Equatable {
    let schemaVersion: Int
    let endpoint: String
    let owner: String
    let epoch: Int
    let body: Data

    func matches(_ actor: NativeDataScope) -> Bool {
        schemaVersion == 1 && endpoint == actor.endpoint && owner == actor.subject && epoch == actor.mobileEpoch
    }
}

/// Retains only the original write bytes, in the actor's device Keychain namespace.
/// A lost ACK is unresolved until an exact receipt or explicit server abandon is returned.
@MainActor struct NativeTravelerBriefJournal {
    let vault: any NativeCredentialVault
    static func service(_ endpoint: String) -> String { "com.visepanda.native.traveler-brief.v1." + endpoint }

    func read(_ actor: NativeDataScope) throws -> NativeTravelerBriefPending? {
        let (status, bytes) = vault.read(service: Self.service(actor.endpoint), owner: actor.subject)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let bytes, bytes.count <= 64_000 else { throw NativeDataError.sessionUnavailable }
        let value = try JSONDecoder().decode(NativeTravelerBriefPending.self, from: bytes)
        guard value.matches(actor) else { throw NativeDataError.staleSessionResponse }
        _ = try NativeTravelerBriefCommand(body: value.body)
        return value
    }

    func retain(_ command: NativeTravelerBriefCommand, actor: NativeDataScope) throws -> NativeTravelerBriefPending {
        if let existing = try read(actor) {
            guard existing.body == command.body else { throw NativeDataError.staleSessionResponse }
            return existing
        }
        let value = NativeTravelerBriefPending(schemaVersion: 1, endpoint: actor.endpoint, owner: actor.subject,
                                              epoch: actor.mobileEpoch, body: command.body)
        let bytes = try JSONEncoder().encode(value)
        guard bytes.count <= 64_000,
              vault.write(bytes, service: Self.service(actor.endpoint), owner: actor.subject) == errSecSuccess,
              try read(actor) == value else { throw NativeDataError.sessionUnavailable }
        return value
    }

    func complete(_ value: NativeTravelerBriefPending, actor: NativeDataScope) throws {
        guard value.matches(actor), try read(actor) == value else { throw NativeDataError.staleSessionResponse }
        try Self.erase(endpoint: actor.endpoint, owner: actor.subject, vault: vault)
    }

    static func erase(endpoint: String, owner: String, vault: any NativeCredentialVault) throws {
        let status = vault.remove(service: service(endpoint), owner: owner)
        guard status == errSecSuccess || status == errSecItemNotFound,
              vault.read(service: service(endpoint), owner: owner).0 == errSecItemNotFound else {
            throw NativeDataError.sessionUnavailable
        }
    }
}

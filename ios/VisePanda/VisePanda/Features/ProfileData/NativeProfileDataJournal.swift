import Foundation
import Security

/// Persists only original mutation bytes. The sole TS closed command decoder is injected.
@MainActor struct NativeProfileDataJournal {
    let vault: any NativeCredentialVault
    let validateConfirmation: (Data) throws -> Void
    static func service(_ endpoint: String) -> String { "com.visepanda.native.profile-data.v1." + endpoint }

    func read(_ actor: NativeCommunitySafetyActor) throws -> NativeCommunitySafetyPending? {
        let (status, bytes) = vault.read(service: Self.service(actor.scope.endpoint), owner: actor.scope.subject)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let bytes, bytes.count <= 49_152 else { throw NativeDataError.sessionUnavailable }
        let value = try JSONDecoder().decode(NativeCommunitySafetyPending.self, from: bytes)
        guard value.matches(actor.scope, sessionID: actor.sessionID) else { throw NativeDataError.staleSessionResponse }
        guard !value.body.isEmpty, value.body.count <= 8192 else { throw NativeDataError.invalidResponse }
        try validateConfirmation(value.body)
        return value
    }
    func retain(_ original: Data, actor: NativeCommunitySafetyActor) throws -> NativeCommunitySafetyPending {
        guard !original.isEmpty, original.count <= 8192 else { throw NativeDataError.invalidResponse }
        try validateConfirmation(original)
        if let previous = try read(actor) {
            guard previous.body == original else { throw NativeDataError.staleSessionResponse }
            return previous
        }
        let pending = NativeCommunitySafetyPending(schemaVersion: 1, endpoint: actor.scope.endpoint,
            owner: actor.scope.subject, epoch: actor.scope.mobileEpoch, sessionID: actor.sessionID, body: original)
        let encoded = try JSONEncoder().encode(pending)
        guard encoded.count <= 49_152,
              vault.write(encoded, service: Self.service(actor.scope.endpoint), owner: actor.scope.subject) == errSecSuccess,
              try read(actor) == pending else { throw NativeDataError.sessionUnavailable }
        return pending
    }
    /// Invoke only after a verified immutable receipt and synchronous projection invalidation.
    /// Unknown ACK, auth/transport failure, expiry and backgrounding preserve the exact operation.
    func complete(_ pending: NativeCommunitySafetyPending, actor: NativeCommunitySafetyActor) throws {
        guard pending.matches(actor.scope, sessionID: actor.sessionID), try read(actor) == pending else {
            throw NativeDataError.staleSessionResponse
        }
        try Self.erase(endpoint: actor.scope.endpoint, owner: actor.scope.subject, vault: vault)
    }
    static func erase(endpoint: String, owner: String, vault: any NativeCredentialVault) throws {
        let key = service(endpoint), status = vault.read(service: service(endpoint), owner: owner).0
        if status == errSecItemNotFound { return }
        guard status == errSecSuccess else { throw NativeDataError.sessionUnavailable }
        let removed = vault.remove(service: key, owner: owner)
        guard removed == errSecSuccess || removed == errSecItemNotFound,
              vault.read(service: key, owner: owner).0 == errSecItemNotFound else { throw NativeDataError.sessionUnavailable }
    }
}

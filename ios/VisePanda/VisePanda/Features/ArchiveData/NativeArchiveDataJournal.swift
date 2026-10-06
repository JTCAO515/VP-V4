import Foundation
import Security

/// Only the consumer of the closed producer confirmation command supplies validation.
/// This layer stores exact confirmation bytes, never preview rows or source bodies.
@MainActor struct NativeArchiveDataJournal {
    let vault: any NativeCredentialVault
    let validateConfirmation: (Data) throws -> Void

    static func service(_ endpoint: String) -> String {
        "com.visepanda.native.archive-data.v1." + endpoint
    }

    func read(_ actor: NativeCommunitySafetyActor) throws -> NativeCommunitySafetyPending? {
        let (status, bytes) = vault.read(service: Self.service(actor.scope.endpoint), owner: actor.scope.subject)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let bytes, bytes.count <= 49_152 else { throw NativeDataError.sessionUnavailable }
        let pending = try JSONDecoder().decode(NativeCommunitySafetyPending.self, from: bytes)
        guard pending.matches(actor.scope, sessionID: actor.sessionID) else { throw NativeDataError.staleSessionResponse }
        guard !pending.body.isEmpty, pending.body.count <= 8192 else { throw NativeDataError.invalidResponse }
        try validateConfirmation(pending.body)
        return pending
    }

    func retain(_ bytes: Data, actor: NativeCommunitySafetyActor) throws -> NativeCommunitySafetyPending {
        guard !bytes.isEmpty, bytes.count <= 8192 else { throw NativeDataError.invalidResponse }
        try validateConfirmation(bytes)
        if let previous = try read(actor) {
            guard previous.body == bytes else { throw NativeDataError.staleSessionResponse }
            return previous
        }
        let pending = NativeCommunitySafetyPending(schemaVersion: 1, endpoint: actor.scope.endpoint,
            owner: actor.scope.subject, epoch: actor.scope.mobileEpoch, sessionID: actor.sessionID, body: bytes)
        let envelope = try JSONEncoder().encode(pending)
        guard envelope.count <= 49_152,
              vault.write(envelope, service: Self.service(actor.scope.endpoint), owner: actor.scope.subject) == errSecSuccess,
              try read(actor) == pending else { throw NativeDataError.sessionUnavailable }
        return pending
    }

    /// Call after verifying the terminal receipt for the saved operation.
    /// Missing ACK, expiry, unknown receipts and transport errors retain it.
    func complete(_ pending: NativeCommunitySafetyPending, actor: NativeCommunitySafetyActor) throws {
        guard pending.matches(actor.scope, sessionID: actor.sessionID), try read(actor) == pending else {
            throw NativeDataError.staleSessionResponse
        }
        try Self.erase(endpoint: actor.scope.endpoint, owner: actor.scope.subject, vault: vault)
    }

    static func erase(endpoint: String, owner: String, vault: any NativeCredentialVault) throws {
        let key = service(endpoint)
        let before = vault.read(service: key, owner: owner).0
        if before == errSecItemNotFound { return }
        guard before == errSecSuccess else { throw NativeDataError.sessionUnavailable }
        let status = vault.remove(service: key, owner: owner)
        guard status == errSecSuccess || status == errSecItemNotFound,
              vault.read(service: key, owner: owner).0 == errSecItemNotFound else { throw NativeDataError.sessionUnavailable }
    }
}

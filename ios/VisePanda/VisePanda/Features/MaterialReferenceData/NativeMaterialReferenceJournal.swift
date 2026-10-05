import Foundation
import Security

typealias NativeMaterialReferencePending = NativeCommunitySafetyPending

/// An unresolved erase is retained before dispatch. Unknown/expired/absent ACKs
/// never clear it or authorize replacing its request ID or original bytes.
@MainActor struct NativeMaterialReferenceJournal {
    let vault: any NativeCredentialVault
    static func service(_ endpoint: String) -> String { "com.visepanda.native.material-reference-data.v1." + endpoint }

    func read(_ actor: NativeCommunitySafetyActor) throws -> NativeMaterialReferencePending? {
        let (status, bytes) = vault.read(service: Self.service(actor.scope.endpoint), owner: actor.scope.subject)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let bytes, bytes.count <= 49_152 else { throw NativeDataError.sessionUnavailable }
        let pending = try JSONDecoder().decode(NativeMaterialReferencePending.self, from: bytes)
        guard pending.matches(actor.scope, sessionID: actor.sessionID) else { throw NativeDataError.staleSessionResponse }
        guard try NativeMaterialReferenceCommand(body: pending.body).action == "erase" else { throw NativeDataError.invalidResponse }
        return pending
    }

    func retain(_ command: NativeMaterialReferenceCommand, actor: NativeCommunitySafetyActor) throws -> NativeMaterialReferencePending {
        guard command.action == "erase" else { throw NativeDataError.invalidResponse }
        if let existing = try read(actor) {
            guard existing.body == command.body else { throw NativeDataError.staleSessionResponse }
            return existing
        }
        let pending = NativeMaterialReferencePending(schemaVersion: 1, endpoint: actor.scope.endpoint,
            owner: actor.scope.subject, epoch: actor.scope.mobileEpoch, sessionID: actor.sessionID, body: command.body)
        let bytes = try JSONEncoder().encode(pending)
        guard bytes.count <= 49_152,
              vault.write(bytes, service: Self.service(actor.scope.endpoint), owner: actor.scope.subject) == errSecSuccess,
              try read(actor) == pending else { throw NativeDataError.sessionUnavailable }
        return pending
    }

    func complete(_ pending: NativeMaterialReferencePending, actor: NativeCommunitySafetyActor) throws {
        guard pending.matches(actor.scope, sessionID: actor.sessionID), try read(actor) == pending else { throw NativeDataError.staleSessionResponse }
        try Self.erase(endpoint: actor.scope.endpoint, owner: actor.scope.subject, vault: vault)
    }

    static func erase(endpoint: String, owner: String, vault: any NativeCredentialVault) throws {
        let status = vault.read(service: service(endpoint), owner: owner).0
        if status == errSecItemNotFound { return }
        guard status == errSecSuccess else { throw NativeDataError.sessionUnavailable }
        let removed = vault.remove(service: service(endpoint), owner: owner)
        guard removed == errSecSuccess || removed == errSecItemNotFound,
              vault.read(service: service(endpoint), owner: owner).0 == errSecItemNotFound else { throw NativeDataError.sessionUnavailable }
    }
}

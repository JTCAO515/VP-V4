import Foundation
import Security

typealias NativeExperiencePending = NativeCommunitySafetyPending

/// Exact mutation bytes only. Recovery never restores readable content or permission.
@MainActor struct NativeExperienceJournal {
    let vault: any NativeCredentialVault
    let validate: (Data) throws -> Void
    static func service(_ endpoint: String) -> String { "com.visepanda.native.community-experience.v1." + endpoint }

    func read(_ actor: NativeCommunitySafetyActor) throws -> NativeExperiencePending? {
        let (status, bytes) = vault.read(service: Self.service(actor.scope.endpoint), owner: actor.scope.subject)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let bytes, bytes.count <= 64_000 else { throw NativeDataError.sessionUnavailable }
        let pending = try JSONDecoder().decode(NativeExperiencePending.self, from: bytes)
        guard pending.matches(actor.scope, sessionID: actor.sessionID) else { throw NativeDataError.staleSessionResponse }
        try validate(pending.body)
        return pending
    }

    func retain(_ body: Data, actor: NativeCommunitySafetyActor) throws -> NativeExperiencePending {
        try validate(body)
        if let existing = try read(actor) {
            guard existing.body == body else { throw NativeDataError.staleSessionResponse }
            return existing
        }
        let pending = NativeExperiencePending(schemaVersion: 1, endpoint: actor.scope.endpoint, owner: actor.scope.subject,
                                              epoch: actor.scope.mobileEpoch, sessionID: actor.sessionID, body: body)
        let bytes = try JSONEncoder().encode(pending)
        guard bytes.count <= 64_000,
              vault.write(bytes, service: Self.service(actor.scope.endpoint), owner: actor.scope.subject) == errSecSuccess,
              try read(actor) == pending else { throw NativeDataError.sessionUnavailable }
        return pending
    }

    func complete(_ pending: NativeExperiencePending, actor: NativeCommunitySafetyActor) throws {
        guard pending.matches(actor.scope, sessionID: actor.sessionID), try read(actor) == pending else { throw NativeDataError.staleSessionResponse }
        try Self.erase(endpoint: actor.scope.endpoint, owner: actor.scope.subject, vault: vault)
    }

    static func erase(endpoint: String, owner: String, vault: any NativeCredentialVault) throws {
        let before = vault.read(service: service(endpoint), owner: owner).0
        if before == errSecItemNotFound { return }
        guard before == errSecSuccess else { throw NativeDataError.sessionUnavailable }
        let removed = vault.remove(service: service(endpoint), owner: owner)
        guard removed == errSecSuccess || removed == errSecItemNotFound,
              vault.read(service: service(endpoint), owner: owner).0 == errSecItemNotFound else { throw NativeDataError.sessionUnavailable }
    }
}

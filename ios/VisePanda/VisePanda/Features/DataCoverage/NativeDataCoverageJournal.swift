import Foundation
import Security

/// Uses the accepted pending-byte envelope; the coverage command validator is supplied by this module.
typealias NativeDataCoveragePending = NativeCommunitySafetyPending

@MainActor struct NativeDataCoverageJournal {
    let vault: any NativeCredentialVault
    let validate: (Data) throws -> Void
    static func service(_ endpoint: String) -> String { "com.visepanda.native.data-coverage.v1." + endpoint }

    func read(_ actor: NativeCommunitySafetyActor) throws -> NativeDataCoveragePending? {
        let (status, bytes) = vault.read(service: Self.service(actor.scope.endpoint), owner: actor.scope.subject)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let bytes, bytes.count <= 262_144 else { throw NativeDataError.sessionUnavailable }
        let pending = try JSONDecoder().decode(NativeDataCoveragePending.self, from: bytes)
        guard pending.matches(actor.scope, sessionID: actor.sessionID) else { throw NativeDataError.staleSessionResponse }
        try validate(pending.body)
        return pending
    }

    func retain(_ body: Data, actor: NativeCommunitySafetyActor) throws -> NativeDataCoveragePending {
        try validate(body)
        if let existing = try read(actor) {
            guard existing.body == body else { throw NativeDataError.staleSessionResponse }; return existing
        }
        let pending = NativeDataCoveragePending(schemaVersion: 1, endpoint: actor.scope.endpoint, owner: actor.scope.subject,
                                               epoch: actor.scope.mobileEpoch, sessionID: actor.sessionID, body: body)
        let bytes = try JSONEncoder().encode(pending)
        guard bytes.count <= 262_144,
              vault.write(bytes, service: Self.service(actor.scope.endpoint), owner: actor.scope.subject) == errSecSuccess,
              try read(actor) == pending else { throw NativeDataError.sessionUnavailable }
        return pending
    }

    func complete(_ pending: NativeDataCoveragePending, actor: NativeCommunitySafetyActor) throws {
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

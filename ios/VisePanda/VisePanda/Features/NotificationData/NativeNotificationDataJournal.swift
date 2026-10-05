import Foundation
import Security

typealias NativeNotificationDataPending = NativeCommunitySafetyPending

/// Keeps exact, already validated erase bytes before dispatch. The consumer
/// alone validates the sole producer's closed command; this storage layer does
/// not create a second wire protocol or persist notification payload fields.
@MainActor struct NativeNotificationDataJournal {
    let vault: any NativeCredentialVault

    static func service(_ endpoint: String) -> String {
        "com.visepanda.native.notification-data.v1." + endpoint
    }

    func read(_ actor: NativeCommunitySafetyActor) throws -> NativeNotificationDataPending? {
        let (status, bytes) = vault.read(service: Self.service(actor.scope.endpoint), owner: actor.scope.subject)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let bytes, bytes.count <= 49_152 else {
            throw NativeDataError.sessionUnavailable
        }
        let pending = try JSONDecoder().decode(NativeNotificationDataPending.self, from: bytes)
        guard pending.matches(actor.scope, sessionID: actor.sessionID),
              !pending.body.isEmpty, pending.body.count <= 8192 else {
            throw NativeDataError.staleSessionResponse
        }
        return pending
    }

    func retain(validatedEraseBytes body: Data, actor: NativeCommunitySafetyActor) throws -> NativeNotificationDataPending {
        guard !body.isEmpty, body.count <= 8192 else { throw NativeDataError.invalidResponse }
        if let existing = try read(actor) {
            guard existing.body == body else { throw NativeDataError.staleSessionResponse }
            return existing
        }
        let pending = NativeNotificationDataPending(schemaVersion: 1, endpoint: actor.scope.endpoint,
            owner: actor.scope.subject, epoch: actor.scope.mobileEpoch, sessionID: actor.sessionID, body: body)
        let bytes = try JSONEncoder().encode(pending)
        guard bytes.count <= 49_152,
              vault.write(bytes, service: Self.service(actor.scope.endpoint), owner: actor.scope.subject) == errSecSuccess,
              try read(actor) == pending else { throw NativeDataError.sessionUnavailable }
        return pending
    }

    /// Called only after a verified terminal receipt for this exact operation.
    /// Unknown ACK, absence, expiry and transport failure retain original bytes.
    func complete(_ pending: NativeNotificationDataPending, actor: NativeCommunitySafetyActor) throws {
        guard pending.matches(actor.scope, sessionID: actor.sessionID), try read(actor) == pending else {
            throw NativeDataError.staleSessionResponse
        }
        try Self.erase(endpoint: actor.scope.endpoint, owner: actor.scope.subject, vault: vault)
    }

    static func erase(endpoint: String, owner: String, vault: any NativeCredentialVault) throws {
        let status = vault.read(service: service(endpoint), owner: owner).0
        if status == errSecItemNotFound { return }
        guard status == errSecSuccess else { throw NativeDataError.sessionUnavailable }
        let removed = vault.remove(service: service(endpoint), owner: owner)
        guard removed == errSecSuccess || removed == errSecItemNotFound,
              vault.read(service: service(endpoint), owner: owner).0 == errSecItemNotFound else {
            throw NativeDataError.sessionUnavailable
        }
    }
}

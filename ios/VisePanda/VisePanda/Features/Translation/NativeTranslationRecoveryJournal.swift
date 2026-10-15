import Foundation
import Security

struct NativeTranslationRecoveryRecord: Equatable, Sendable {
    let identity: NativeTranslationRecoveryIdentity
    let endpoint: String
    let subject: String
    let mobileEpoch: Int
    /// Exact physical bytes form the compare-and-remove token. No generation is persisted.
    let bytes: Data
    func matches(_ scope: NativeDataScope) -> Bool {
        endpoint == scope.endpoint && subject == scope.subject && mobileEpoch == scope.mobileEpoch
    }
}

@MainActor protocol NativeTranslationRecoveryPersistence {
    func read(_ scope: NativeDataScope) throws -> NativeTranslationRecoveryRecord?
    /// New record only: success grants write-before-send durability for ONE initial POST.
    /// An existing record, including the same identity, must use GET recovery instead.
    func retain(_ identity: NativeTranslationRecoveryIdentity, scope: NativeDataScope) throws -> NativeTranslationRecoveryRecord
    func complete(_ original: NativeTranslationRecoveryRecord, verifiedReceipt: NativeTranslationRecoveryReceipt, scope: NativeDataScope) throws
    /// Explicit user confirmation only. Local abandonment is neither server cancel nor undo.
    func abandonLocally(_ original: NativeTranslationRecoveryRecord, scope: NativeDataScope) throws
}

/// Synchronous MainActor transactions contain no suspension points. The Session factory
/// must inject its existing vault; no extra credential, access group or entitlement.
@MainActor struct NativeTranslationRecoveryJournal: NativeTranslationRecoveryPersistence {
    let vault: any NativeCredentialVault
    init(vault: any NativeCredentialVault) { self.vault = vault }
    static func service(_ endpoint: String) -> String { "com.visepanda.native.local-session.v2.translation-recovery." + endpoint }
    static let maximumBytes = 4096

    /// Explicit logout/account cleanup hook, owned by Session. This deliberately
    /// removes the exact fixed service even when its old epoch or payload is corrupt.
    /// Never use for transient auth/network errors or as a completion/abandon shortcut.
    static func erase(endpoint: String, owner: String, vault: any NativeCredentialVault) throws {
        let status = vault.remove(service: service(endpoint), owner: owner)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw NativeTranslationRecoveryError.storageFailure
        }
        let (readStatus, bytes) = vault.read(service: service(endpoint), owner: owner)
        guard readStatus == errSecItemNotFound, bytes == nil else { throw NativeTranslationRecoveryError.storageFailure }
    }

    private func validate(_ scope: NativeDataScope) throws {
        guard NativeTranslationRecoveryIdentity.canonicalUUID(scope.subject), scope.mobileEpoch > 0,
              scope.mobileEpoch <= 9_007_199_254_740_991, scope.endpoint.utf8.count <= 2048,
              let url = URL(string: scope.endpoint), ["http", "https"].contains(url.scheme),
              url.host != nil, url.user == nil, url.password == nil, url.query == nil, url.fragment == nil else {
            throw NativeTranslationRecoveryError.invalidScope
        }
    }
    func read(_ scope: NativeDataScope) throws -> NativeTranslationRecoveryRecord? {
        try validate(scope)
        let (status, bytes) = vault.read(service: Self.service(scope.endpoint), owner: scope.subject)
        if status == errSecItemNotFound {
            guard bytes == nil else { throw NativeTranslationRecoveryError.storageFailure }
            return nil
        }
        guard status == errSecSuccess, let bytes else { throw NativeTranslationRecoveryError.storageFailure }
        let v = try NativeTranslationRecoveryJSON.object(NativeTranslationRecoveryJSON.parse(bytes, limit: Self.maximumBytes),
                                                         keys: ["version", "schema", "endpoint", "subject", "mobileEpoch", "identity"])
        guard try NativeTranslationRecoveryJSON.integer(v["version"]) == 1,
              v["schema"] as? String == "translation-recovery/1", let endpoint = v["endpoint"] as? String,
              let subject = v["subject"] as? String else { throw NativeTranslationRecoveryError.corruptRecord }
        let epoch = try NativeTranslationRecoveryJSON.integer(v["mobileEpoch"])
        // Validate the stored owner binding before deciding whether this epoch is hidden.
        guard endpoint == scope.endpoint, subject == scope.subject, epoch > 0 else { throw NativeTranslationRecoveryError.corruptRecord }
        let identity = try NativeTranslationRecoveryIdentity.decode(v["identity"])
        guard epoch == scope.mobileEpoch else { throw NativeTranslationRecoveryError.compareFailed }
        return .init(identity: identity, endpoint: endpoint, subject: subject, mobileEpoch: epoch, bytes: bytes)
    }
    func retain(_ identity: NativeTranslationRecoveryIdentity, scope: NativeDataScope) throws -> NativeTranslationRecoveryRecord {
        guard try read(scope) == nil else { throw NativeTranslationRecoveryError.pendingRecord }
        let identityBytes = try JSONEncoder().encode(identity)
        let object: [String: Any] = ["version": 1, "schema": "translation-recovery/1", "endpoint": scope.endpoint,
                                   "subject": scope.subject, "mobileEpoch": scope.mobileEpoch,
                                   "identity": try JSONSerialization.jsonObject(with: identityBytes)]
        let bytes = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys, .withoutEscapingSlashes])
        guard bytes.count <= Self.maximumBytes else { throw NativeTranslationRecoveryError.corruptRecord }
        guard vault.write(bytes, service: Self.service(scope.endpoint), owner: scope.subject) == errSecSuccess else {
            throw NativeTranslationRecoveryError.storageFailure
        }
        guard let physical = try read(scope), physical.bytes == bytes else { throw NativeTranslationRecoveryError.storageFailure }
        return physical
    }
    func complete(_ original: NativeTranslationRecoveryRecord, verifiedReceipt: NativeTranslationRecoveryReceipt, scope: NativeDataScope) throws {
        guard verifiedReceipt.identity == original.identity, verifiedReceipt.permitsCompletion else { throw NativeTranslationRecoveryError.invalidReceipt }
        try removeOriginal(original, scope: scope)
    }
    func abandonLocally(_ original: NativeTranslationRecoveryRecord, scope: NativeDataScope) throws {
        try removeOriginal(original, scope: scope)
    }
    private func removeOriginal(_ original: NativeTranslationRecoveryRecord, scope: NativeDataScope) throws {
        guard original.matches(scope), try read(scope) == original else { throw NativeTranslationRecoveryError.compareFailed }
        // Missing is not success here: a terminal/abandon operation must CAS a present original.
        guard vault.remove(service: Self.service(scope.endpoint), owner: scope.subject) == errSecSuccess else {
            throw NativeTranslationRecoveryError.storageFailure
        }
        let (status, bytes) = vault.read(service: Self.service(scope.endpoint), owner: scope.subject)
        guard status == errSecItemNotFound, bytes == nil else { throw NativeTranslationRecoveryError.storageFailure }
    }
}

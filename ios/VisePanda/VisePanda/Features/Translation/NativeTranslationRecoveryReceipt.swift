import Foundation

/// Closed DTO avoids coupling the persistence boundary to Store/UI models.
/// This value is transient and must never be encoded into the recovery journal.
struct NativeTranslationRecoveryPhrase: Equatable, Sendable {
    let turnId: String
    let sourceLocale: String
    let targetLocale: String
    let original: String
    let state: String
    let translation: String?
    let backTranslation: String?
}

struct NativeTranslationRecoveryReceipt: Equatable, Sendable {
    enum State: String, Sendable { case unknown, pending, translated, cancelled, unavailable, needs_review }
    let identity: NativeTranslationRecoveryIdentity
    let state: State
    let phrase: NativeTranslationRecoveryPhrase?
    /// Terminal proof requires a source phrase with the exact original input hash.
    var permitsCompletion: Bool { state != .unknown && state != .pending && phrase != nil }

    private init(identity: NativeTranslationRecoveryIdentity, state: State, phrase: NativeTranslationRecoveryPhrase?) {
        self.identity = identity; self.state = state; self.phrase = phrase
    }

    /// Call only for the current authenticated GET recovery response. HTTP failure,
    /// generic cancel acknowledgements and null terminal projections are never proof.
    static func verify(_ bytes: Data, original: NativeTranslationRecoveryIdentity, httpStatus: Int = 200) throws -> Self {
        guard httpStatus == 200 else { throw NativeTranslationRecoveryError.invalidReceipt }
        let v = try NativeTranslationRecoveryJSON.object(NativeTranslationRecoveryJSON.parse(bytes, limit: 32_768),
                                                        keys: ["version", "kind", "identity", "state", "phrase"])
        guard try NativeTranslationRecoveryJSON.integer(v["version"]) == 1,
              v["kind"] as? String == "translation_recovery",
              try NativeTranslationRecoveryIdentity.decode(v["identity"]) == original,
              let stateName = v["state"] as? String, let state = State(rawValue: stateName) else {
            throw NativeTranslationRecoveryError.invalidReceipt
        }
        if v["phrase"] is NSNull {
            guard state != .translated else { throw NativeTranslationRecoveryError.invalidReceipt }
            return .init(identity: original, state: state, phrase: nil)
        }
        guard state != .unknown else { throw NativeTranslationRecoveryError.invalidReceipt }
        let baseKeys: Set<String> = ["turnId", "sourceLocale", "targetLocale", "original", "state"]
        let fullKeys = baseKeys.union(["translation", "backTranslation"])
        guard let rawPhrase = v["phrase"] as? [String: Any] else { throw NativeTranslationRecoveryError.invalidReceipt }
        // Existing NativeTranslationPhrase optionals are omitted by the server for
        // nontranslated states. Explicit null is equivalent, private text is not.
        let expectedKeys = state != .translated && Set(rawPhrase.keys) == baseKeys ? baseKeys : fullKeys
        let p = try NativeTranslationRecoveryJSON.object(rawPhrase, keys: expectedKeys)
        guard p["turnId"] as? String == original.turnId,
              p["sourceLocale"] as? String == original.sourceLocale, p["targetLocale"] as? String == original.targetLocale,
              p["state"] as? String == state.rawValue, let text = p["original"] as? String,
              !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, text.utf16.count <= 600,
              NativeTranslationRecoveryIdentity.hashInput(text) == original.inputHash else { throw NativeTranslationRecoveryError.invalidReceipt }
        var translation: String?, backTranslation: String?
        if state == .translated {
            guard let t = p["translation"] as? String, let b = p["backTranslation"] as? String,
                  [t, b].allSatisfy({ !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && $0.utf16.count <= 2400 }) else {
                throw NativeTranslationRecoveryError.invalidReceipt
            }
            translation = t; backTranslation = b
        } else {
            guard (p["translation"] == nil || p["translation"] is NSNull),
                  (p["backTranslation"] == nil || p["backTranslation"] is NSNull) else { throw NativeTranslationRecoveryError.invalidReceipt }
        }
        return .init(identity: original, state: state,
                     phrase: .init(turnId: original.turnId, sourceLocale: original.sourceLocale, targetLocale: original.targetLocale,
                                   original: text, state: state.rawValue, translation: translation, backTranslation: backTranslation))
    }
}

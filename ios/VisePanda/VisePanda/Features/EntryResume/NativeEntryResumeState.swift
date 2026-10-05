import Foundation

/// Keeps one visible intent through initial authentication; never retargets an owned intent to a new account.
struct NativeEntryResumeState: Equatable {
    struct Identity: Equatable {
        let endpoint: String
        let owner: String
        let epoch: Int
        let generation: Int
    }
    struct Intent: Equatable {
        let entryID: UUID
        let receivedAt: Date
        let expiresAt: Date
        var identity: Identity?
    }
    enum Failure: Equatable { case unavailable, expired, accountChanged, cleanupRequired }
    private(set) var intent: Intent?
    private(set) var failure: Failure?

    mutating func receive(_ entryID: UUID, identity: Identity?, now: Date = Date()) {
        // A second link must not silently replace the original visible selection.
        guard intent == nil, failure != .cleanupRequired else { return }
        intent = .init(entryID: entryID, receivedAt: now, expiresAt: now.addingTimeInterval(15 * 60), identity: identity)
        failure = nil
    }
    mutating func authenticate(_ identity: Identity?, now: Date = Date()) {
        guard let intent else { return }
        guard intent.expiresAt > now else { self.intent = nil; failure = .expired; return }
        // Login from an anonymous initial share is allowed. A previously verified account or epoch is fixed.
        if let original = intent.identity, original != identity {
            self.intent = nil; failure = .accountChanged
        }
    }
    mutating func bind(_ identity: Identity, entryExpiry: Date, now: Date = Date()) -> Bool {
        guard var value = intent, failure != .cleanupRequired,
              value.expiresAt > now, entryExpiry > now,
              value.identity == nil || value.identity == identity else { return false }
        value.identity = identity
        // Neither login nor a subsequent lookup extends the original entry or intent lifetime.
        intent = .init(entryID: value.entryID, receivedAt: value.receivedAt,
                       expiresAt: min(value.expiresAt, entryExpiry), identity: identity)
        return true
    }
    func current(_ identity: Identity, now: Date = Date()) -> Intent? {
        guard let intent, intent.identity == identity, intent.expiresAt > now,
              failure == nil else { return nil }
        return intent
    }
    mutating func unavailable() { intent = nil; failure = .unavailable }
    mutating func clear(cleanupSucceeded: Bool) {
        intent = nil
        failure = cleanupSucceeded ? nil : .cleanupRequired
    }
}

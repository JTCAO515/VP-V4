import Foundation

/// Main-frozen pre-result report discriminators. No local_import/no-Trip case.
enum NativeJourneyMeasurementAdmission {
    enum Material: String { case pdf, screenshot }
    struct Goal: Equatable {
        let conversationID: UUID
        let goalID: UUID
        let goalVersion: Int
        let parentMessageID: UUID
        let inputSequence: Int
        var valid: Bool { (1...10000).contains(goalVersion) && (1...1000000).contains(inputSequence) }
    }
    enum Anchor: Equatable {
        case task(UUID)
        case nativeEntry(trip: UUID, version: Int, material: Material)
        case goal(Goal)
        var valid: Bool {
            switch self {
            case .task: return true
            case .nativeEntry(_, let version, _): return (0...Int(Int32.max)).contains(version)
            case .goal(let value): return value.valid
            }
        }
    }
    struct Attempt: Equatable {
        let operationID: UUID
        let logicalID: UUID
        let anchor: Anchor
        let process: UUID
        let nativeStart: TimeInterval?
        // Authenticated report receipt is separate and not synthesized here.
        // Native-entry admittedAt is null; no Goal.created_at/ACK clock claim.
    }
    struct Scope<Actor: Equatable> {
        private var actor: Actor?
        private var consentID: UUID?
        private var materialSelection: UUID?
        private(set) var attempt: Attempt?
        mutating func bind(actor next: Actor?, consent nextConsent: UUID?) {
            guard actor != next || consentID != nextConsent else { return }
            actor = next; consentID = nextConsent; materialSelection = nil; attempt = nil
        }
        /// Only explicit new file/photo selection rotates E2. Not loadID,
        /// cancellation nonce, raw content digest or a successful operation ID.
        mutating func selectMaterial() { materialSelection = UUID(); attempt = nil }
        mutating func clear() { actor = nil; consentID = nil; materialSelection = nil; attempt = nil }
        mutating func guardedStart(_ anchor: Anchor, actor expected: Actor, consent expectedConsent: UUID,
                                   active: Bool, qualifiedOwnerAnchor: Bool,
                                   process: UUID, nativeStart: TimeInterval?) -> Attempt? {
            guard actor == expected, consentID == expectedConsent, active, qualifiedOwnerAnchor, anchor.valid else { return nil }
            if let attempt, attempt.anchor == anchor { return attempt } // exact immutable bytes/retry origin
            let logicalID: UUID
            switch anchor {
            case .task(let id): logicalID = id
            case .goal(let goal): logicalID = goal.goalID
            case .nativeEntry:
                guard let materialSelection, attempt == nil else { return nil }
                logicalID = materialSelection
            }
            let start = nativeStart.flatMap { $0.isFinite && $0 >= 0 ? $0 : nil }
            let value = Attempt(operationID: UUID(), logicalID: logicalID, anchor: anchor, process: process, nativeStart: start)
            attempt = value; return value
        }
    }
}

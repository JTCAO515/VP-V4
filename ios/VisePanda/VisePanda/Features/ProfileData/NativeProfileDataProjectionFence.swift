import Foundation

/// A transient receipt-driven cache boundary. Permanent replay prevention belongs to SQL.
struct NativeProfileDataProjectionFence {
    struct Ticket: Equatable {
        let actor: NativeCommunitySafetyActor
        let generation: UUID
    }
    private(set) var actor: NativeCommunitySafetyActor?
    private(set) var generation = UUID()
    private(set) var profileFloor = 0
    private(set) var paceFloor = 0

    mutating func bind(_ next: NativeCommunitySafetyActor?) {
        guard actor != next else { return }
        actor = next; generation = UUID(); profileFloor = 0; paceFloor = 0
    }
    func capture(_ actor: NativeCommunitySafetyActor) throws -> Ticket {
        guard self.actor == actor else { throw NativeDataError.staleSessionResponse }
        return .init(actor: actor, generation: generation)
    }
    func accepts(_ ticket: Ticket) -> Bool { ticket.actor == actor && ticket.generation == generation }
    @discardableResult mutating func record(_ receipt: NativeProfileDataReceipt, actor: NativeCommunitySafetyActor) throws -> Bool {
        guard self.actor == actor, receipt.binding.actor == actor, receipt.binding.scope == .sensitive,
              let profile = receipt.decision.afterProfileRevision, let pace = receipt.decision.afterPaceRevision else { throw NativeDataError.invalidResponse }
        guard profile > profileFloor || pace > paceFloor else { return false }
        profileFloor = max(profileFloor, profile); paceFloor = max(paceFloor, pace); generation = UUID()
        return true
    }
}

struct NativeProfileDataErasure: Identifiable {
    let id = UUID()
    let actor: NativeCommunitySafetyActor
    let profileFloor: Int
    let paceFloor: Int
    let briefCaseIDs: Set<String>

    init(receipt: NativeProfileDataReceipt, actor: NativeCommunitySafetyActor) throws {
        guard receipt.binding.actor == actor, receipt.binding.scope == .sensitive,
              let profile = receipt.decision.afterProfileRevision, let pace = receipt.decision.afterPaceRevision else { throw NativeDataError.invalidResponse }
        self.actor = actor; profileFloor = profile; paceFloor = pace
        briefCaseIDs = Set(receipt.decision.briefCasesInvalidated)
    }
}

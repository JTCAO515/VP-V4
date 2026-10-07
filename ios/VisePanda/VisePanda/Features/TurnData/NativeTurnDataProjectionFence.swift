import Foundation

/// Read authority for existing Turn projections only. Source writers remain server-owned.
/// Captured tickets expire on erasure. Fresh reads may return the server-redacted Turn identity.
struct NativeTurnDataProjectionFence {
    struct Ticket: Equatable {
        let actor: NativeCommunitySafetyActor
        let generation: UUID
        let turnID: String?
    }
    private(set) var actor: NativeCommunitySafetyActor?
    private(set) var generation = UUID()
    private(set) var turnIDs = Set<String>()
    private var actorGeneration = UUID()
    private var turnGenerations: [String: UUID] = [:]

    mutating func bind(_ next: NativeCommunitySafetyActor?) {
        guard actor != next else { return }
        actor = next; turnIDs = []; generation = UUID(); actorGeneration = UUID(); turnGenerations = [:]
    }
    func capture(_ current: NativeCommunitySafetyActor, turnID: String? = nil) throws -> Ticket {
        guard actor == current else { throw NativeDataError.staleSessionResponse }
        guard turnID == nil || UUID(uuidString: turnID ?? "")?.uuidString.lowercased() == turnID else { throw NativeDataError.invalidResponse }
        return .init(actor: current, generation: turnID.map { turnGenerations[$0] ?? actorGeneration } ?? generation, turnID: turnID)
    }
    func accepts(_ ticket: Ticket) -> Bool {
        actor == ticket.actor && (ticket.turnID.map { turnGenerations[$0] ?? actorGeneration } ?? generation) == ticket.generation
    }
    /// Called synchronously only with source IDs from a fully verified immutable receipt.
    /// Does not invalidate pending Ask mutations, Task/Conversation identities or Trip confirmation.
    mutating func recordVerifiedErasure(turnIDs affected: Set<String>, actor current: NativeCommunitySafetyActor) throws {
        guard actor == current, !affected.isEmpty, affected.count <= 1000,
              affected.allSatisfy({ UUID(uuidString: $0)?.uuidString.lowercased() == $0 }) else {
            throw NativeDataError.staleSessionResponse
        }
        turnIDs.formUnion(affected); generation = UUID()
        for id in affected { turnGenerations[id] = UUID() }
    }
}

/// Minimal local notification from the actual verified Turn receipt; no parent IDs are erased.
struct NativeTurnDataErasure: Identifiable {
    let id = UUID()
    let actor: NativeCommunitySafetyActor
    var scope: NativeDataScope { actor.scope }
    let turnIDs: Set<String>
    let messageIDs: Set<String>
    let artifactIDs: Set<String>
    init(receipt: NativeTurnDataReceipt, actor: NativeCommunitySafetyActor) throws {
        guard receipt.binding.actor == actor, receipt.binding.scope == .sensitive,
              let turnID = receipt.binding.turnID, receipt.graph.ids["turnIds"] == [turnID] else {
            throw NativeDataError.staleSessionResponse
        }
        self.actor = actor
        turnIDs = Set(receipt.graph.ids["turnIds"] ?? [])
        messageIDs = Set(receipt.graph.ids["messageIds"] ?? [])
        artifactIDs = Set(receipt.graph.ids["artifactIds"] ?? [])
    }
}

extension NativeResultDataErasure {
    /// Reuses existing Result/Library/Trip projection consumers for the exact exclusive
    /// artifacts independently erased by the verified Turn decision.
    init(turnErasure: NativeTurnDataErasure, previouslyErased: Set<String>) {
        actor = turnErasure.actor
        artifactIDs = previouslyErased.union(turnErasure.artifactIDs)
    }
}

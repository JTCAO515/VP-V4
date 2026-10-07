import Foundation

/// A synchronous local cache boundary. Only the verified receipt consumer may record an erasure.
/// The server remains the permanent identity/parent-fence authority after an app restart.
struct NativeResultDataProjectionFence {
    struct Ticket: Equatable {
        let actor: NativeCommunitySafetyActor
        let generation: UUID
    }
    private(set) var actor: NativeCommunitySafetyActor?
    private(set) var generation = UUID()
    private(set) var artifactIDs = Set<String>()

    mutating func bind(_ next: NativeCommunitySafetyActor?) {
        guard actor != next else { return }
        actor = next; artifactIDs = []; generation = UUID()
    }
    func capture(_ current: NativeCommunitySafetyActor) throws -> Ticket {
        guard actor == current else { throw NativeDataError.staleSessionResponse }
        return .init(actor: current, generation: generation)
    }
    func accepts(_ ticket: Ticket, artifactID: String? = nil) -> Bool {
        guard actor == ticket.actor, generation == ticket.generation else { return false }
        return artifactID.map { !artifactIDs.contains($0) } ?? true
    }
    func permits(_ artifactID: String, actor current: NativeCommunitySafetyActor) -> Bool {
        actor == current && !artifactIDs.contains(artifactID)
    }
    /// Does not delete source/domain values. An old list/search response loses its ticket;
    /// exact readers can retain an unselected projection under the same current actor.
    mutating func recordVerifiedErasure(artifactID: String, actor current: NativeCommunitySafetyActor) throws {
        guard actor == current, let id = UUID(uuidString: artifactID), id.uuidString.lowercased() == artifactID else {
            throw NativeDataError.staleSessionResponse
        }
        artifactIDs.insert(artifactID); generation = UUID()
    }
}

struct NativeResultDataErasure: Identifiable {
    let id = UUID()
    let actor: NativeCommunitySafetyActor
    var scope: NativeDataScope { actor.scope }
    let artifactIDs: Set<String>
    init(receipt: NativeResultDataReceipt, actor: NativeCommunitySafetyActor, previouslyErased: Set<String> = []) throws {
        guard receipt.binding.actor == actor, receipt.binding.scope == .sensitive,
              let root = receipt.binding.rootID, receipt.graph.ids["artifactIds"] == [root],
              !receipt.graph.revisions.isEmpty, receipt.graph.revisions == Array(1...receipt.graph.revisions.count) else {
            throw NativeDataError.staleSessionResponse
        }
        self.actor = actor; artifactIDs = previouslyErased.union([root])
    }
}

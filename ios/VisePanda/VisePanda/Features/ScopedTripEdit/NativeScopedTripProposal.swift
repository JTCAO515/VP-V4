import Foundation

struct NativeScopedTripProposal: Equatable {
    let proposalID: String
    let revision: Int
    let digest: String
    let baseVersion: Int
    let expiresAt: String
    var reference: String { "\(proposalID):\(revision):\(digest)" }
    var current: Bool { NativeScopedTripCommand.date(expiresAt).map { $0 > Date() } == true }

    static func hasCompleteOrderDiff(_ pending: NativeTripPending) -> Bool {
        pending.proposal.patch.operations.allSatisfy { operation in
            guard operation.kind == .reorderItems else { return operation.itemIds == nil }
            guard let dayID = operation.dayId, NativeScopedTripSelection.validObjectID(dayID),
                  let ids = operation.itemIds, !ids.isEmpty, ids.count <= 500,
                  Set(ids).count == ids.count, ids.allSatisfy(NativeScopedTripSelection.validObjectID),
                  operation.title == nil, operation.date == nil, operation.timeZone == nil,
                  operation.itemId == nil, operation.startsAt == nil, operation.endsAt == nil,
                  let after = pending.proposal.after?.days.first(where: { $0.id == dayID }) else { return false }
            return after.items.map(\.id) == ids
        }
    }

    func matches(_ pending: NativeTripPending, selection: NativeScopedTripSelection) -> Bool {
        pending.trip.id == selection.tripID && pending.trip.headVersion == baseVersion && baseVersion == selection.headVersion
        && pending.proposal.id == proposalID && pending.proposal.revision == revision && pending.proposal.digest == digest
        && pending.proposal.baseTripVersion == baseVersion && NativeScopedTripCommand.date(pending.proposal.expiresAt) == NativeScopedTripCommand.date(expiresAt)
        && pending.proposal.status == "pending" && !pending.proposal.stale && current
    }
}

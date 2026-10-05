import Foundation

struct NativeScopedTripDiff: Decodable {
    struct Change: Decodable, Identifiable {
        let kind: String
        let itemId: String
        let before: NativeTripItem?
        let after: NativeTripItem?
        var id: String { itemId + ":" + kind }
    }
    let changes: [Change]
    let preservedItemIds: [String]
    let transferImpact: String
    let walkingImprovement: String
    let externalOrderEffect: String
    static func decode(_ raw: Any, context: NativeScopedTripContext?) throws -> Self {
        let diffRaw = try NativeScopedTripWire.exact(raw, keys: ["changes", "preservedItemIds", "transferImpact", "walkingImprovement", "externalOrderEffect"])
        guard let changes = diffRaw["changes"] as? [Any] else { throw NativeDataError.invalidResponse }
        for value in changes {
            let change = try NativeScopedTripWire.exact(value, keys: ["kind", "itemId", "before", "after"])
            for key in ["before", "after"] where !(change[key] is NSNull) { try NativeScopedTripWire.validateItem(change[key]!) }
        }
        let diff = try NativeScopedTripWire.decode(NativeScopedTripDiff.self, diffRaw)
        guard !diff.changes.isEmpty, diff.changes.count <= 500, Set(diff.changes.map(\.itemId)).count == diff.changes.count,
              diff.transferImpact == "pending", diff.walkingImprovement == "unverified", diff.externalOrderEffect == "none",
              diff.changes.allSatisfy({ ["added", "removed", "moved", "changed", "replaced", "reordered"].contains($0.kind)
                  && NativeScopedTripSelection.validObjectID($0.itemId)
                  && ($0.before == nil || $0.before?.id == $0.itemId)
                  && ($0.after == nil || $0.after?.id == $0.itemId) }),
              Set(diff.preservedItemIds).count == diff.preservedItemIds.count,
              diff.preservedItemIds.allSatisfy(NativeScopedTripSelection.validObjectID) else { throw NativeDataError.invalidResponse }
        if let context {
            let baseIDs = Set(context.snapshot.days.flatMap(\.items).map(\.id))
            let changedIDs = Set(diff.changes.map(\.itemId))
            let originalItems = Dictionary(uniqueKeysWithValues: context.snapshot.days.flatMap(\.items).map { ($0.id, $0) })
            guard diff.changes.allSatisfy({ change in
                if let before = change.before { return originalItems[change.itemId] == before }
                return change.kind == "added" && change.after.map { context.scope.dayIds.contains($0.dayId) } == true
            }) else { throw NativeDataError.invalidResponse }
            guard changedIDs.intersection(baseIDs).isSubset(of: context.editableItemIDs),
                  baseIDs.subtracting(context.editableItemIDs).isSubset(of: Set(diff.preservedItemIds)) else { throw NativeDataError.invalidResponse }
        }
        return diff
    }

}

struct NativeScopedTripProposalReceipt {
    let proposal: NativeScopedTripProposal
    let diff: NativeScopedTripDiff
    let returnScope: NativeScopedTripScope
    static func decode(_ data: Data, journal: NativeScopedTripJournal, context: NativeScopedTripContext?) throws -> Self {
        let raw = try NativeScopedTripWire.exact(data, keys: ["kind", "operationId", "tripId", "contextId", "contextDigest", "proposalId", "proposalRevision", "proposalDigest", "baseVersion", "expiresAt", "returnScope", "diff", "reused"])
        let command = try journal.command()
        let original = try JSONSerialization.jsonObject(with: command.bytes) as! [String: Any]
        let basis = original["basis"] as! [String: Any]
        guard raw["kind"] as? String == "scoped_edit_proposal/1", raw["operationId"] as? String == command.operationID,
              raw["tripId"] as? String == journal.tripID, raw["contextId"] as? String == basis["contextId"] as? String,
              raw["contextDigest"] as? String == basis["contextDigest"] as? String,
              NativeScopedTripWire.integer(raw["baseVersion"]) == NativeScopedTripWire.integer(basis["baseVersion"]),
              let id = raw["proposalId"] as? String, NativeScopedTripWire.uuid(id),
              let revision = NativeScopedTripWire.integer(raw["proposalRevision"]), revision > 0,
              let digest = raw["proposalDigest"] as? String, digest.hasPrefix("trip-v2:") && NativeScopedTripWire.digest(String(digest.dropFirst(8))),
              let expiry = raw["expiresAt"] as? String, NativeScopedTripCommand.date(expiry) != nil,
              NativeScopedTripWire.bool(raw["reused"]) != nil else { throw NativeDataError.invalidResponse }
        let scopeRaw = try NativeScopedTripWire.exact(raw["returnScope"]!, keys: ["dayIds", "itemIds"])
        let returnScope = try NativeScopedTripWire.decode(NativeScopedTripScope.self, scopeRaw)
        let diff = try NativeScopedTripDiff.decode(raw["diff"]!, context: context)
        if let context { guard context.selection.tripID == journal.tripID, returnScope == context.scope else { throw NativeDataError.invalidResponse } }
        return .init(proposal: .init(proposalID: id, revision: revision, digest: digest,
            baseVersion: NativeScopedTripWire.integer(raw["baseVersion"])!, expiresAt: expiry), diff: diff, returnScope: returnScope)
    }
}

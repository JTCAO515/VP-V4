import Foundation

/// A projection of the original Proposal's authoritative before/after content, never a patch writer.
enum NativeTripAddressReview {
    struct Location: Hashable { let dayID: String; let itemID: String }
    struct Item: Equatable {
        let location: Location
        let title: String
        let address: NativeUserProvidedAddress?
    }
    struct Change: Equatable, Identifiable {
        enum Kind: Equatable { case added, removed, changed, moved }
        let kind: Kind
        let before: Item?
        let after: Item?
        var id: String {
            let first = before?.location, last = after?.location
            return "\(first?.dayID ?? "")/\(first?.itemID ?? "")->\(last?.dayID ?? "")/\(last?.itemID ?? "")"
        }
    }
    struct Result: Equatable {
        let canConfirm: Bool
        let changes: [Change]
        static let unavailable = Self(canConfirm: false, changes: [])
    }

    static func evaluate(before: NativeTripDetail?, pending: NativeTripPending) -> Result {
        guard let before, before.confirmationState == "confirmed", before.trip.id == pending.trip.id,
              before.trip.headVersion == pending.proposal.baseTripVersion,
              pending.proposal.patch.expectedVersion == pending.proposal.baseTripVersion,
              let old = index(before.content) else { return .unavailable }
        guard let after = pending.proposal.after else {
            // Ordinary same-item upserts preserve address. A missing after-snapshot cannot attest
            // deletion/rebuild, new-item restoration, or an explicit address operation.
            let possible = pending.proposal.patch.operations.contains { operation in
                switch operation.kind {
                case .setChineseAddress: return true
                case .deleteDay: return old.values.contains { $0.location.dayID == operation.dayId && $0.address != nil }
                case .deleteItem: return old.values.contains { $0.location.dayID == operation.dayId && $0.location.itemID == operation.itemId && $0.address != nil }
                case .upsertItem:
                    guard let day = operation.dayId, let item = operation.itemId else { return true }
                    return old[.init(dayID: day, itemID: item)] == nil
                case .setTitle, .upsertDay, .reorderItems: return false
                }
            }
            return .init(canConfirm: !possible, changes: [])
        }
        guard let new = index(after) else { return .unavailable }
        var changes: [Change] = []
        var removed = old.keys.filter { new[$0] == nil }
        var added = new.keys.filter { old[$0] == nil }
        // Only unambiguous identities are grouped as a move. Ambiguous duplicates stay separate.
        for from in removed.sorted(by: order) {
            let destinations = added.filter { $0.itemID == from.itemID }
            guard removed.filter({ $0.itemID == from.itemID }).count == 1, destinations.count == 1,
                  let to = destinations.first, let previous = old[from], let next = new[to] else { continue }
            if previous.address != nil || next.address != nil {
                changes.append(.init(kind: .moved, before: previous, after: next))
            }
            removed.removeAll { $0 == from }; added.removeAll { $0 == to }
        }
        for key in removed.sorted(by: order) where old[key]?.address != nil {
            changes.append(.init(kind: .removed, before: old[key], after: nil))
        }
        for key in added.sorted(by: order) where new[key]?.address != nil {
            changes.append(.init(kind: .added, before: nil, after: new[key]))
        }
        for key in old.keys.filter({ new[$0] != nil }).sorted(by: order) {
            guard let previous = old[key], let next = new[key], previous.address != next.address else { continue }
            changes.append(.init(kind: .changed, before: previous, after: next))
        }
        return .init(canConfirm: true, changes: changes)
    }

    private static func order(_ lhs: Location, _ rhs: Location) -> Bool {
        lhs.dayID == rhs.dayID ? lhs.itemID < rhs.itemID : lhs.dayID < rhs.dayID
    }
    private static func index(_ content: NativeTripContent) -> [Location: Item]? {
        var result: [Location: Item] = [:]
        var dayIDs = Set<String>()
        for day in content.days {
            guard dayIDs.insert(day.id).inserted else { return nil }
            for item in day.items {
                let key = Location(dayID: day.id, itemID: item.id)
                guard item.dayId == day.id, result[key] == nil else { return nil }
                result[key] = .init(location: key, title: item.title, address: item.userAddress)
            }
        }
        return result
    }
}

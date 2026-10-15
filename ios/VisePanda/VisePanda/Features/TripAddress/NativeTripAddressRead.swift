import Foundation

/// Only a current exact server read can provide address references. No title/country inference.
enum NativeTripAddressRead {
    static func references(_ read: NativeTripSupportRead?, target: NativeTripSupportTarget,
                           current: NativeDataScope?, now: Date = Date()) -> [NativeTripSupportRead.Entry]? {
        guard current == target.actor, target.valid, let read,
              read.tripId == target.tripID, read.tripVersion == target.tripVersion,
              read.dayId == target.dayID, read.itemId == target.itemID else { return nil }
        return read.entries.filter { entry in
            guard entry.scope == .address, entry.status == .current, entry.applicability == .matched,
                  !entry.sourceRefs.isEmpty, let claim = entry.claim, claim.claimType == "address",
                  claim.value.lines != nil, !claim.evidence.isEmpty else { return false }
            return claim.evidence.allSatisfy { fact in
                fact.kind == "fact" && NativeKnowledgeRead.date(fact.expiresAt).map { $0 > now } == true
            }
        }
    }
}

/// A receipt's exact confirmed projection is required; a later version cannot attest this proposal.
enum NativeTripAddressConfirmation {
    static func matches(_ detail: NativeTripDetail, proposal: NativeTripPending.Proposal, resultingVersion: Int) -> Bool {
        guard detail.confirmationState == "confirmed", detail.trip.headVersion == resultingVersion,
              resultingVersion == proposal.baseTripVersion + 1 else { return false }
        return proposal.patch.operations.filter { $0.kind == .setChineseAddress }.allSatisfy { operation in
            guard let day = detail.content.days.first(where: { $0.id == operation.dayId }),
                  let item = day.items.first(where: { $0.id == operation.itemId }) else { return false }
            switch operation.addressText {
            case .set(let text): return item.userAddress?.text == text
            case .clear: return item.userAddress == nil
            case nil: return false
            }
        }
    }
}

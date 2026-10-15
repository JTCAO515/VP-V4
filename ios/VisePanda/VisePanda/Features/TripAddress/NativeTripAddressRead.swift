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

import Foundation

/// A review of existing, explicitly consented preferences. Never derives Memory from Trip text.
struct NativeTripPreferenceReview: Equatable {
    struct Reference: Codable, Equatable {
        let memoryID: String
        let revision: Int
        let sourceReceiptID: String
        let consentID: String
        enum CodingKeys: String, CodingKey {
            case memoryID = "memoryId", revision, sourceReceiptID = "sourceReceiptId", consentID = "consentId"
        }
    }

    let tripID: String
    let headVersion: Int
    let actor: NativeDataScope
    let candidates: [NativeMemoryProfile]
    private(set) var selectedIDs: Set<String> = []

    init(tripID: String, headVersion: Int, actor: NativeDataScope, profiles: [NativeMemoryProfile]) throws {
        guard NativeMemoryWire.uuid(tripID), headVersion >= 0,
              Set(profiles.map(\.id)).count == profiles.count,
              profiles.allSatisfy(\.valid) else { throw NativeDataError.invalidResponse }
        self.tripID = tripID
        self.headVersion = headVersion
        self.actor = actor
        candidates = profiles.filter { $0.eligible && $0.constraintKind == "preference" }
    }

    mutating func select(_ id: String, keep: Bool) {
        guard candidates.contains(where: { $0.id == id }) else { return }
        if keep { selectedIDs.insert(id) } else { selectedIDs.remove(id) }
    }

    /// Caller supplies a fresh owner/session read; a changed/revoked row requires a new review.
    func references(currentActor: NativeDataScope?, tripID: String, headVersion: Int,
                    profiles: [NativeMemoryProfile]) throws -> [Reference] {
        guard currentActor == actor, self.tripID == tripID, self.headVersion == headVersion,
              Set(profiles.map(\.id)).count == profiles.count else { throw NativeDataError.staleSessionResponse }
        return try candidates.filter { selectedIDs.contains($0.id) }.map { candidate in
            guard profiles.contains(candidate), candidate.valid, candidate.eligible,
                  candidate.constraintKind == "preference" else { throw NativeDataError.staleSessionResponse }
            return Reference(memoryID: candidate.id, revision: candidate.revision,
                             sourceReceiptID: candidate.sourceReceiptId, consentID: candidate.consentId)
        }
    }
}

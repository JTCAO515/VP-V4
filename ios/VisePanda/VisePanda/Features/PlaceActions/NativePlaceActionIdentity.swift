import Foundation

/// A selected provider row is never promoted to a canonical place by a local hash.
/// Every action retains both identities; current mapping is checked by the server.
struct NativePlaceActionIdentity: Codable, Equatable, Sendable {
    let canonicalPoiId: String
    let provider: NativePlaceProvider
    let providerPoiId: String

    init(candidate: NativePlaceCandidate) throws {
        guard candidate.valid(), candidate.providerPoiId.utf16.count <= 128,
              candidate.providerPoiId == candidate.providerPoiId.trimmingCharacters(in: .whitespacesAndNewlines), let canonical = candidate.matchedCanonicalPoiId,
              let uuid = UUID(uuidString: canonical) else { throw NativeDataError.invalidResponse }
        canonicalPoiId = uuid.uuidString.lowercased()
        provider = candidate.provider
        providerPoiId = candidate.providerPoiId
    }

    func matches(_ candidate: NativePlaceCandidate) -> Bool {
        candidate.matchedCanonicalPoiId?.lowercased() == canonicalPoiId &&
        candidate.provider == provider && candidate.providerPoiId == providerPoiId
    }
}

/// Scope includes the mobile epoch. A response from a prior actor, selected place,
/// Trip or base version cannot become the current action's receipt.
struct NativePlaceActionSelection: Equatable {
    let scope: NativeDataScope
    let place: NativePlaceActionIdentity
    let tripId: String
    let baseVersion: Int

    var valid: Bool { UUID(uuidString: tripId) != nil && baseVersion >= 0 }
}

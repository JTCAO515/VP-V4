import Foundation

/// Interests are chosen on this screen. No inferred profile or permission projection is added.
enum NativePlaceGuideInterest: String, CaseIterable, Codable, Sendable {
    case history, architecture, culture, practical
    var en: String {
        switch self { case .history: "History"; case .architecture: "Architecture"; case .culture: "Culture"; case .practical: "Visiting basics" }
    }
    var zh: String {
        switch self { case .history: "历史"; case .architecture: "建筑"; case .culture: "文化"; case .practical: "游览须知" }
    }
}

struct NativePlaceGuideSelection: Equatable, Sendable {
    let scope: NativeDataScope
    let canonicalPoiID: String
    let tripID: String
    let tripVersion: Int
    let locale: String
    let interests: [NativePlaceGuideInterest]

    var valid: Bool {
        UUID(uuidString: canonicalPoiID) != nil && UUID(uuidString: tripID) != nil
        && tripVersion >= 0 && ["en", "zh"].contains(locale)
        && interests.count <= NativePlaceGuideInterest.allCases.count
        && Set(interests).count == interests.count
    }
}

/// Native-only binding for source changes and cache isolation; wire decoding lives with the producer DTO.
struct NativePlaceGuideSourceBinding: Equatable, Sendable {
    let sourceID: String
    let revision: String
    let rightsRevision: String
    let expiresAt: Date
    let cacheAllowed: Bool
    let speechAllowed: Bool
}

import Foundation

/// Interests are chosen on this screen. No inferred profile or permission projection is added.
enum NativePlaceGuideInterest: String, CaseIterable, Codable, Sendable {
    case general, address, openingHours = "opening_hours"
    var en: String {
        switch self { case .general: "Visiting basics"; case .address: "Address"; case .openingHours: "Published opening window" }
    }
    var zh: String {
        switch self { case .general: "游览须知"; case .address: "地址"; case .openingHours: "已发布开放时段" }
    }
}

struct NativePlaceGuideSelection: Equatable, Sendable {
    let scope: NativeDataScope
    let canonicalPoiID: String
    let placeReferenceID: String
    let tripID: String
    let tripVersion: Int
    let locale: String
    let interest: NativePlaceGuideInterest

    var valid: Bool {
        UUID(uuidString: canonicalPoiID) != nil && UUID(uuidString: placeReferenceID) != nil
        && UUID(uuidString: tripID) != nil && tripVersion > 0 && ["en", "zh"].contains(locale)
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

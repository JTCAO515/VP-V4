import Foundation

/// A short-lived, server-checked navigation reference. Never provider or fact authority.
struct NativeCanonicalPlaceAskCapture: Equatable {
    let scope: NativeDataScope
    let expectation: Expectation
    let title: String
    let expiresAt: Date
    let receivedUptime: TimeInterval
    let lifetime: TimeInterval
    let purpose = "first_party_reference_only"
    let readyForProvider = false
    var currentInput: NativePlaceActionIdentity { expectation.selection }
    // Exact validated closed source set; never a latest-source lookup or a grant.
    var selectedSources: NativeSelectedSources {
        .init(artifact: nil, trip: .init(tripId: expectation.tripId, headVersion: expectation.headVersion), evidence: [])
    }

    struct Expectation: Equatable {
        let tripId: String
        let headVersion: Int
        let selection: NativePlaceActionIdentity
        let mappingDigest: String
        let contextDigest: String
        let referenceId: String?
        let locale: String
    }

    func current(scope: NativeDataScope?, locale: String, now: Date = Date(),
                 uptime: TimeInterval = ProcessInfo.processInfo.systemUptime) -> Bool {
        lifetime.isFinite && lifetime > 0 && lifetime <= 30 && receivedUptime.isFinite && uptime.isFinite
            && self.scope == scope && expectation.locale == locale && now < expiresAt
            && uptime >= receivedUptime && uptime - receivedUptime < lifetime
    }

    static func decode(_ bytes: Data, context: NativePlaceActionContext,
                       target: NativePlaceActionSelection, locale: String,
                       started: TimeInterval, now: Date = Date(),
                       uptime: TimeInterval = ProcessInfo.processInfo.systemUptime) throws -> Self {
        guard target.valid, context.selection == target.place, context.tripId == target.tripId,
              context.tripVersion == target.baseVersion, ["zh", "en"].contains(locale),
              started <= uptime, uptime - started < 30, context.expiresAt > now else { throw NativeDataError.invalidResponse }
        let value = try NativePlaceActionWire.object(bytes)
        _ = try NativePlaceActionWire.exact(value, ["kind", "tripId", "tripVersion", "selection", "mappingDigest", "contextDigest", "referenceId", "selectedSources", "currentInput", "readyForProvider", "purpose", "expiresAt", "handoff"])
        guard value["kind"] as? String == "place_ask_context", value["tripId"] as? String == target.tripId,
              NativePlaceActionWire.integer(value["tripVersion"]) == target.baseVersion,
              try NativePlaceActionWire.selection(value["selection"] as Any) == target.place,
              try NativePlaceActionWire.selection(value["currentInput"] as Any) == target.place,
              value["mappingDigest"] as? String == context.mappingDigest,
              value["contextDigest"] as? String == context.contextDigest,
              value["referenceId"] is NSNull || NativePlaceActionWire.id(value["referenceId"]) != nil,
              NativePlaceActionWire.boolean(value["readyForProvider"]) == false,
              value["purpose"] as? String == "first_party_reference_only",
              let expires = (value["expiresAt"] as? String).flatMap(NativeKnowledgeRead.date),
              expires > now, expires.timeIntervalSince(now) <= 30 else { throw NativeDataError.invalidResponse }
        let sources = try NativePlaceActionWire.exact(value["selectedSources"] as Any, ["artifact", "trip", "evidence"])
        let trip = try NativePlaceActionWire.exact(sources["trip"] as Any, ["tripId", "headVersion"])
        guard sources["artifact"] is NSNull, (sources["evidence"] as? [Any])?.isEmpty == true,
              trip["tripId"] as? String == target.tripId,
              NativePlaceActionWire.integer(trip["headVersion"]) == target.baseVersion else { throw NativeDataError.invalidResponse }
        let reference = value["referenceId"] as? String
        if !(value["handoff"] is NSNull) {
            let handoff = try NativePlaceActionWire.exact(value["handoff"] as Any, ["kind", "href", "poiId", "readiness"])
            guard handoff["kind"] as? String == "ask_ready", handoff["poiId"] as? String == target.place.canonicalPoiId,
                  handoff["readiness"] as? String == "recheck_required", reference != nil else { throw NativeDataError.invalidResponse }
        }
        let boundExpiry = min(expires, context.expiresAt)
        let remaining = min(30 - (uptime - started), boundExpiry.timeIntervalSince(now))
        guard remaining > 0 else { throw NativeDataError.invalidResponse }
        return .init(scope: target.scope,
                     expectation: .init(tripId: target.tripId, headVersion: target.baseVersion, selection: target.place,
                                        mappingDigest: context.mappingDigest, contextDigest: context.contextDigest,
                                        referenceId: reference, locale: locale),
                     title: context.title, expiresAt: boundExpiry, receivedUptime: uptime, lifetime: remaining)
    }
}

/// Local composer fence only; the server still derives the authoritative root.
struct NativeCanonicalPlaceAskRoot: Equatable {
    let conversationID: String?
    let goalID: String?
    let goalVersion: Int?
    let parentMessageID: String?
    let relationship: String
    let locale: String
    let policyID: String?
}

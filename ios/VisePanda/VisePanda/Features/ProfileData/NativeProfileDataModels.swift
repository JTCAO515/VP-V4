import Foundation
import CryptoKit

/// Closed constants mirror the sole ProfileData TS producer, never a second service contract.
enum NativeProfileDataWire {
    static let schema = "profile-data/1"
    static let fields = ["display_name", "travel_pace", "locale", "currency", "distance_unit", "temperature_unit", "default_departure_time", "pace_notice", "pace_operation", "pace_request", "pace_undo"]
    static let copyKeys = ["briefPreviews", "sharedBriefs", "scopedEditContexts", "scopedEditWork", "recoveryContexts", "coreExports"]
    static let conflicts = ["SCOPE_TOO_LARGE", "ACTIVE_PROFILE_USE", "CORE_EXPORT_COPY", "OTHER_DELETE_PENDING", "SOURCE_UNSUPPORTED"]
    static let bindingKeys: Set<String> = ["schemaVersion", "scope", "requestId", "profileId", "objectIds", "ownerId", "sessionId", "mobileEpoch", "sourceDigest", "previewDigest", "capturedAt", "expiresAt", "boundaries", "allUserDataCompleted"]
    static let boundaries: [NativeProfileDataScope: [String: [String]]] = [
        .sensitive: ["eraseFields": fields,
            "retained": ["account_auth_sessions", "profile_owner_identity_created_at_monotonic_revisions", "system_fallbacks_without_pace_consent", "explicit_memory_trip_history_financial_provider_and_other_modules", "mixed_domain_copies_under_original_controls", "immutable_minimal_decisions_operation_replay_fences"],
            "missing": ["external_provider_downloaded_export_backup_and_old_device_copies_not_recalled", "mixed_domain_copies_not_cascade_erased", "target_backup_and_old_device_acceptance_unverified"]],
        .progress: ["eraseFields": ["selected_transient_preview_counts_conflicts_copy_references"],
            "retained": ["actor_selection_hash_time_operation_fences", "immutable_minimal_decisions", "profile_owner_identity_monotonic_revision_erasure_floor"],
            "missing": ["profile_source_not_modified", "unselected_progress", "external_copies", "target_backup_and_old_device_acceptance_unverified"]],
    ]
    static func digest(_ bytes: Data) -> String { SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined() }
    static func root(_ bytes: Data) throws -> [String: Any] {
        guard !bytes.isEmpty, bytes.count <= 1_000_000 else { throw NativeDataError.invalidResponse }
        let outer = try NativeCommunityWire.object(JSONSerialization.jsonObject(with: bytes), ["data"])
        guard let value = outer["data"] as? [String: Any] else { throw NativeDataError.invalidResponse }
        return value
    }
    static func integer(_ raw: Any?, minimum: Int = 0, maximum: Int = 9_007_199_254_740_991) throws -> Int {
        try NativeCommunityWire.integer(raw, max: maximum, minimum: minimum)
    }
    static func time(_ raw: Any?) throws -> Date { Date(timeIntervalSince1970: Double(try integer(raw, minimum: 1)) / 1000) }
    static func actor(_ value: [String: Any], _ actor: NativeCommunitySafetyActor, scope: NativeProfileDataScope) throws {
        guard value["schemaVersion"] as? String == schema, value["scope"] as? String == scope.rawValue,
              try NativeProfileDataCommand.id(value["ownerId"]) == actor.scope.subject.lowercased(),
              try NativeProfileDataCommand.id(value["sessionId"]) == actor.sessionID,
              try integer(value["mobileEpoch"], minimum: 1) == actor.scope.mobileEpoch,
              try !NativeCommunityWire.bool(value["allUserDataCompleted"]) else { throw NativeDataError.invalidResponse }
    }
    static func ordered(_ raw: Any?, allowed: [String]) throws -> [String] {
        guard let values = raw as? [String], values.count <= allowed.count else { throw NativeDataError.invalidResponse }
        var previous = -1
        for value in values {
            guard let index = allowed.firstIndex(of: value), index > previous else { throw NativeDataError.invalidResponse }
            previous = index
        }
        return values
    }
    static func inventory(_ object: Any) throws -> String {
        let bytes = try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
        guard let value = String(data: bytes, encoding: .utf8) else { throw NativeDataError.invalidResponse }
        return value
    }
}

struct NativeProfileDataSummary: Equatable {
    let profileRevision: Int
    let paceRevision: Int
    let profileErasureFloor: Int
    let paceErasureFloor: Int
    let paceState: String
    let presentFields: [String]
    let hasPaceRequest: Bool
    let hasPaceUndo: Bool
    init(_ raw: Any) throws {
        let w = NativeCommunityWire.self, s = NativeProfileDataWire.self
        let v = try w.object(raw, ["profileRevision", "paceRevision", "profileErasureFloor", "paceErasureFloor", "paceState", "presentFields", "hasPaceRequest", "hasPaceUndo"])
        profileRevision = try s.integer(v["profileRevision"], maximum: 9_007_199_254_740_990); paceRevision = try s.integer(v["paceRevision"], maximum: 9_007_199_254_740_990)
        profileErasureFloor = try s.integer(v["profileErasureFloor"], maximum: profileRevision)
        paceErasureFloor = try s.integer(v["paceErasureFloor"], maximum: paceRevision)
        paceState = try w.text(v["paceState"], max: 8)
        guard ["unset", "explicit", "paused", "revoked"].contains(paceState) else { throw NativeDataError.invalidResponse }
        presentFields = try s.ordered(v["presentFields"], allowed: s.fields)
        hasPaceRequest = try w.bool(v["hasPaceRequest"]); hasPaceUndo = try w.bool(v["hasPaceUndo"])
    }
}

struct NativeProfileDataFields: Equatable {
    let values: [String: String]
    let paceNotice: String?
    let hasPaceRequest: Bool
    let hasPaceUndo: Bool
    let paceOperation: String?
    let paceRequestOperation: String?
    let paceRequestRevision: Int?
    let paceRequestAction: String?
    let historyInventory: String
    init(_ raw: Any) throws {
        let w = NativeCommunityWire.self
        let v = try w.object(raw, ["displayName", "travelPace", "locale", "currency", "distanceUnit", "temperatureUnit", "defaultDepartureTime", "paceNotice", "paceOperation", "paceRequest", "paceUndo"])
        var fields: [String: String] = [:]
        // PostgreSQL char_length counts Unicode scalars, not UTF-16 units or graphemes.
        // Preserve valid existing values verbatim; trimming would reject legal old rows.
        if let name = try w.optional(v["displayName"], { raw -> String in
            guard let name = raw as? String, (1...80).contains(name.unicodeScalars.count),
                  !name.contains("\0") else { throw NativeDataError.invalidResponse }
            return name
        }) { fields["displayName"] = name }
        for (key, options) in ["travelPace": ["relaxed", "balanced", "packed"], "locale": ["zh", "en", "es", "ru", "ar"], "currency": ["CNY", "USD", "EUR", "RUB", "SAR"], "distanceUnit": ["kilometre", "mile"], "temperatureUnit": ["celsius", "fahrenheit"]] {
            guard let value = v[key] as? String, options.contains(value) else { throw NativeDataError.invalidResponse }
            fields[key] = value
        }
        let departure = try w.text(v["defaultDepartureTime"], max: 15)
        guard departure.range(of: "^([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d{1,6})?$", options: .regularExpression) != nil else { throw NativeDataError.invalidResponse }
        fields["defaultDepartureTime"] = departure; values = fields
        paceNotice = try w.optional(v["paceNotice"], { try w.text($0, max: 40) })
        guard paceNotice == nil || paceNotice == "local-planning-cross-trip-v1" else { throw NativeDataError.invalidResponse }
        paceOperation = try w.optional(v["paceOperation"], NativeProfileDataCommand.id)
        hasPaceRequest = !(v["paceRequest"] is NSNull); hasPaceUndo = !(v["paceUndo"] is NSNull)
        if hasPaceRequest {
            guard let request = v["paceRequest"] as? [String: Any], let action = request["action"] as? String else { throw NativeDataError.invalidResponse }
            let keys: Set<String> = ["action", "operationId", "expectedRevision"]
            _ = try w.object(request, action == "save" ? keys.union(["travelPace", "noticeVersion"]) : keys)
            paceRequestOperation = try w.id(request["operationId"])
            paceRequestRevision = try NativeProfileDataWire.integer(request["expectedRevision"], maximum: 9_007_199_254_740_990)
            paceRequestAction = action
            if action == "save" {
                guard request["noticeVersion"] as? String == "local-planning-cross-trip-v1", let pace = request["travelPace"] as? String, ["relaxed", "balanced", "packed"].contains(pace) else { throw NativeDataError.invalidResponse }
            } else { guard ["pause", "revoke", "undo"].contains(action) else { throw NativeDataError.invalidResponse } }
        } else { paceRequestOperation = nil; paceRequestRevision = nil; paceRequestAction = nil }
        if hasPaceUndo {
            let undo = try w.object(v["paceUndo"] as Any, ["travelPace", "state", "noticeVersion"])
            guard let pace = undo["travelPace"] as? String, ["relaxed", "balanced", "packed"].contains(pace),
                  let state = undo["state"] as? String, ["unset", "explicit", "paused", "revoked"].contains(state) else { throw NativeDataError.invalidResponse }
            let notice = try w.optional(undo["noticeVersion"], { try w.text($0, max: 40) })
            guard notice == nil || notice == "local-planning-cross-trip-v1",
                  !["explicit", "paused"].contains(state) || notice == "local-planning-cross-trip-v1" else { throw NativeDataError.invalidResponse }
        }
        historyInventory = try NativeProfileDataWire.inventory(["paceNotice": v["paceNotice"] as Any, "paceOperation": v["paceOperation"] as Any, "paceRequest": v["paceRequest"] as Any, "paceUndo": v["paceUndo"] as Any])
    }
}

struct NativeProfileDataCopies: Equatable {
    let ids: [String: [String]]
    var empty: Bool { ids.values.allSatisfy(\.isEmpty) }
    init(_ raw: Any) throws {
        let v = try NativeCommunityWire.object(raw, Set(NativeProfileDataWire.copyKeys))
        ids = try v.mapValues { try NativeProfileDataCommand.ids($0) }
        guard ids.values.reduce(0, { $0 + $1.count }) <= 10000 else { throw NativeDataError.invalidResponse }
    }
}

struct NativeProfileDataBinding: Equatable {
    let scope: NativeProfileDataScope
    let requestID: String
    let profileID: String?
    let objectIDs: [String]
    let actor: NativeCommunitySafetyActor
    let sourceDigest: String
    let previewDigest: String
    let capturedAt: Date
    let expiresAt: Date
    init(_ v: [String: Any], command: NativeProfileDataCommand, actor: NativeCommunitySafetyActor, now: Date, decided: Bool = false) throws {
        let w = NativeCommunityWire.self, s = NativeProfileDataWire.self
        try s.actor(v, actor, scope: command.scope)
        scope = command.scope; self.actor = actor; requestID = try NativeProfileDataCommand.id(v["requestId"])
        profileID = try w.optional(v["profileId"], NativeProfileDataCommand.id)
        objectIDs = try NativeProfileDataCommand.ids(v["objectIds"], maximum: 20)
        sourceDigest = try w.hash(v["sourceDigest"]); previewDigest = try w.hash(v["previewDigest"])
        let capture = try s.integer(v["capturedAt"], minimum: 1), expiry = try s.integer(v["expiresAt"], minimum: 1)
        capturedAt = try s.time(capture); expiresAt = try s.time(expiry)
        guard now.timeIntervalSince1970.isFinite, capture <= 9_007_199_254_740_991 - 30000,
              requestID == command.requestID, profileID == command.profileID, objectIDs == command.objectIDs,
              scope != .sensitive || profileID == actor.scope.subject.lowercased(),
              command.sourceDigest == nil || sourceDigest == command.sourceDigest,
              command.previewDigest == nil || previewDigest == command.previewDigest,
              capturedAt <= now, expiry == capture + 30000, decided || now < expiresAt else { throw NativeDataError.invalidResponse }
        let boundaries = try w.object(v["boundaries"] as Any, ["eraseFields", "retained", "missing"])
        for (key, expected) in s.boundaries[scope] ?? [:] {
            guard boundaries[key] as? [String] == expected else { throw NativeDataError.invalidResponse }
        }
    }
}

struct NativeProfileDataPreview: Equatable {
    let binding: NativeProfileDataBinding
    let profile: NativeProfileDataFields?
    let summary: NativeProfileDataSummary?
    let copies: NativeProfileDataCopies
    let conflicts: [String]
    let eligible: Bool
    let progressCount: Int
}

struct NativeProfileDataDecision: Equatable {
    let requestDigest: String
    let decidedAt: Date
    let beforeProfileRevision: Int?
    let afterProfileRevision: Int?
    let beforePaceRevision: Int?
    let afterPaceRevision: Int?
    let erasedFields: [String]
    let briefCasesInvalidated: [String]
    let retainedCopies: NativeProfileDataCopies
    let clearedPreviews: Int
    let retainedFences: Int
}

struct NativeProfileDataObject: Identifiable, Equatable {
    let id: String
    let summary: NativeProfileDataSummary?
    let operationInventory: String?
}

struct NativeProfileDataPage {
    let objects: [NativeProfileDataObject]
    let next: NativeProfileDataCursor?
    let expiresAt: Date
}

struct NativeProfileDataReceipt: Equatable {
    let binding: NativeProfileDataBinding
    let decision: NativeProfileDataDecision
    var requestDigest: String { decision.requestDigest }
}

import Foundation

struct NativeMaterialReferenceObject: Identifiable, Equatable {
    let id: String
    let revision: Int?
    let label: String?
    let expiresAt: Date?
    let sourceState: String
    init(_ raw: Any, scope: NativeMaterialReferenceScope) throws {
        let w = NativeCommunityWire.self
        let v = try w.object(raw, ["objectId", "revision", "label", "materialExpiresAt", "sourceState"])
        id = try NativeMaterialReferenceCommand.id(v["objectId"])
        revision = try w.optional(v["revision"], { try w.integer($0, max: 9_007_199_254_740_991) })
        label = try w.optional(v["label"], { try w.text($0, max: 160, empty: true) })
        expiresAt = try w.optional(v["materialExpiresAt"], NativeMaterialReferenceWire.time)
        sourceState = try w.text(v["sourceState"], max: 9)
        guard ["active", "pending", "confirmed", "rejected", "cancelled", "expired", "erased", "retained", "unknown"].contains(sourceState),
              scope == .reservations || label == nil && revision == nil else { throw NativeDataError.invalidResponse }
    }
}

struct NativeMaterialReferenceBoundaries: Equatable {
    let exportFields: [String]
    let eraseFields: [String]
    let retained: [String]
    let missing: [String]

    static func expected(_ scope: NativeMaterialReferenceScope) -> Self {
        switch scope {
        case .reservations:
            return .init(exportFields: ["current_reference", "reference_events", "reference_operation_metadata"],
                eraseFields: ["selected_current_reference", "selected_reference_events", "selected_reference_operations"],
                retained: ["nonreplayable_object_operation_fences", "original_trip_content", "financial_records"],
                missing: ["original_local_material_bytes", "external_order_copies", "external_order_cancel_refund", "provider_verification"])
        case .pdf:
            return .init(exportFields: ["live_corrected_fields", "original_locator_hashes", "minimal_pdf_operation_metadata"],
                eraseFields: ["temporary_input_bytes", "temporary_command_fields", "unapplied_pdf_proposal_patch"],
                retained: ["pdf_operation_replay_fences", "applied_trip_proposal_history", "confirmation_event", "financial_records"],
                missing: ["original_pdf_bytes", "full_page_text", "device_appgroup_copies", "external_files", "scheduled_target_retention"])
        case .progress:
            return .init(exportFields: ["selected_exit_request_metadata", "selected_exit_page_progress", "retained_exit_fence_metadata"],
                eraseFields: ["selected_transient_exit_page_progress"],
                retained: ["nonreplayable_request_object_operation_fences", "selected_object_ids", "request_source_preview_hashes", "minimal_erasure_receipt"],
                missing: ["other_unselected_exit_requests"])
        }
    }

    init(exportFields: [String], eraseFields: [String], retained: [String], missing: [String]) {
        self.exportFields = exportFields; self.eraseFields = eraseFields; self.retained = retained; self.missing = missing
    }
    init(_ raw: Any, scope: NativeMaterialReferenceScope) throws {
        let v = try NativeCommunityWire.object(raw, ["exportFields", "eraseFields", "retained", "missing"])
        guard let exportFields = v["exportFields"] as? [String], let eraseFields = v["eraseFields"] as? [String],
              let retained = v["retained"] as? [String], let missing = v["missing"] as? [String] else { throw NativeDataError.invalidResponse }
        self.init(exportFields: exportFields, eraseFields: eraseFields, retained: retained, missing: missing)
        guard self == Self.expected(scope) else { throw NativeDataError.invalidResponse }
    }
}

struct NativeMaterialReferenceBinding: Equatable {
    let scope: NativeMaterialReferenceScope
    let requestID: String
    let tripID: String
    let objectIDs: [String]
    let ownerID: String
    let sessionID: String
    let epoch: Int
    let sourceDigest: String
    let previewDigest: String
    let capturedAt: Date
    let expiresAt: Date
    let tripVersion: Int
    let boundaries: NativeMaterialReferenceBoundaries

    init(_ v: [String: Any], command: NativeMaterialReferenceCommand,
         actor: NativeCommunitySafetyActor, now: Date, allowExpired: Bool = false) throws {
        let w = NativeCommunityWire.self
        guard v["schemaVersion"] as? String == NativeMaterialReferenceWire.schema,
              let scope = NativeMaterialReferenceScope(rawValue: v["scope"] as? String ?? ""),
              try !w.bool(v["allUserDataCompleted"]), let ids = v["objectIds"] as? [String] else { throw NativeDataError.invalidResponse }
        self.scope = scope; objectIDs = ids
        requestID = try NativeMaterialReferenceCommand.id(v["requestId"])
        tripID = try NativeMaterialReferenceCommand.id(v["tripId"])
        ownerID = try NativeMaterialReferenceCommand.id(v["ownerId"])
        sessionID = try NativeMaterialReferenceCommand.id(v["sessionId"])
        epoch = try w.integer(v["mobileEpoch"], max: 9_007_199_254_740_991)
        sourceDigest = try w.hash(v["sourceDigest"]); previewDigest = try w.hash(v["previewDigest"])
        let capturedMS = try w.integer(v["capturedAt"], max: 9_007_199_254_740_991)
        let expiresMS = try w.integer(v["expiresAt"], max: 9_007_199_254_740_991)
        capturedAt = Date(timeIntervalSince1970: Double(capturedMS) / 1000)
        expiresAt = Date(timeIntervalSince1970: Double(expiresMS) / 1000)
        tripVersion = try w.integer(v["tripVersion"], max: 9_007_199_254_740_991, minimum: 0)
        boundaries = try .init(v["boundaries"] as Any, scope: scope)
        guard scope == command.scope, requestID == command.requestID, tripID == command.tripID,
              ids == command.objectIDs, ownerID == actor.scope.subject.lowercased(), sessionID == actor.sessionID,
              epoch == actor.scope.mobileEpoch, capturedAt <= now, expiresAt > capturedAt,
              expiresMS - capturedMS <= 30_000, allowExpired || expiresAt > now else { throw NativeDataError.invalidResponse }
        if let expected = command.previewDigest, expected != previewDigest { throw NativeDataError.invalidResponse }
    }
}

struct NativeMaterialReferenceField: Identifiable {
    let name: String
    let value: String
    var id: String { name }
}

struct NativeMaterialReferenceItem: Identifiable {
    let id: String
    let fields: [NativeMaterialReferenceField]
}

enum NativeMaterialReferenceWire {
    static let schema = "material-reference-data/1"
    static let bindingKeys: Set<String> = ["schemaVersion", "scope", "requestId", "tripId", "objectIds", "ownerId",
        "sessionId", "mobileEpoch", "sourceDigest", "previewDigest", "capturedAt", "expiresAt", "tripVersion", "boundaries", "allUserDataCompleted"]
    static func time(_ raw: Any) throws -> Date {
        Date(timeIntervalSince1970: Double(try NativeCommunityWire.integer(raw, max: 9_007_199_254_740_991)) / 1000)
    }
    static func root(_ bytes: Data) throws -> [String: Any] {
        guard bytes.count <= 1_000_000 else { throw NativeDataError.invalidResponse }
        let outer = try NativeCommunityWire.object(JSONSerialization.jsonObject(with: bytes), ["data"])
        guard let value = outer["data"] as? [String: Any] else { throw NativeDataError.invalidResponse }
        return value
    }
}

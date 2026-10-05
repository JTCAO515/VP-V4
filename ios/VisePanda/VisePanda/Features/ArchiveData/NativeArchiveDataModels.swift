import Foundation
import CryptoKit

enum NativeArchiveDataWire {
    static let schema = "archive-data/1"
    static let bindingKeys: Set<String> = ["schemaVersion", "scope", "requestId", "tripId", "tripVersion", "objectIds", "ownerId", "sessionId", "mobileEpoch", "sourceDigest", "previewDigest", "capturedAt", "expiresAt", "boundaries", "allUserDataCompleted"]
    static let boundaries: [NativeArchiveDataScope: [String: [String]]] = [
        .trip: [
            "exportFields": ["archived_trip_id_title_head_confirmation_lifecycle", "head_snapshot_safe_days_items", "all_available_snapshot_versions_titles_timestamps_safe_content", "selected_trip_lifecycle_operation_receipts"],
            "eraseFields": [],
            "retained": ["original_archive_terminal_business_state", "confirmed_trip_proposal_history", "original_selected_trip_deletion_receipt", "financial_records", "operation_fences"],
            "missing": ["snapshot_versions_never_stored", "fields_outside_original_safe_content_projection", "other_domains_use_existing_module_handlers", "raw_pdf_attachment_device_bytes", "external_orders_payments_copies", "backup_restore_target_acceptance"],
        ],
        .progress: [
            "exportFields": ["selected_request_all_binding_fields", "selected_request_page_progress", "selected_request_minimal_erasure_receipt"],
            "eraseFields": ["selected_transient_page_progress"],
            "retained": ["nonreplayable_request_owner_session_epoch_scope_selection_source_preview_request_hash_time_fences", "immutable_minimal_erasure_receipt", "original_session_account_cascade_semantics"],
            "missing": ["unselected_requests", "source_trip_data_separate_original_delete_handler", "external_files_copies", "backup_restore_target_acceptance"],
        ],
    ]
    static func catalog(_ module: NativeDataCoverageModule) -> Bool {
        module.id == "archive" && module.location == .server && module.version == schema && module.scope == schema
            && module.selection == "trip" && module.exportHandler == "archive_data" && module.deleteHandler == "archive_data"
    }
    static func digest(_ bytes: Data) -> String { SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined() }
    static func integer(_ raw: Any?, max: Int = 9_007_199_254_740_991, minimum: Int = 1) throws -> Int {
        try NativeCommunityWire.integer(raw, max: max, minimum: minimum)
    }
    static func time(_ raw: Any?) throws -> Date { Date(timeIntervalSince1970: Double(try integer(raw)) / 1000) }
    static func root(_ bytes: Data) throws -> [String: Any] {
        guard !bytes.isEmpty, bytes.count <= 1_000_000 else { throw NativeDataError.invalidResponse }
        let outer = try NativeCommunityWire.object(JSONSerialization.jsonObject(with: bytes), ["data"])
        guard let value = outer["data"] as? [String: Any] else { throw NativeDataError.invalidResponse }; return value
    }
    static func actor(_ v: [String: Any], _ actor: NativeCommunitySafetyActor, scope: NativeArchiveDataScope) throws {
        guard v["schemaVersion"] as? String == schema, v["scope"] as? String == scope.rawValue,
              try NativeArchiveDataCommand.id(v["ownerId"]) == actor.scope.subject.lowercased(),
              try NativeArchiveDataCommand.id(v["sessionId"]) == actor.sessionID,
              try integer(v["mobileEpoch"]) == actor.scope.mobileEpoch,
              try !NativeCommunityWire.bool(v["allUserDataCompleted"]) else { throw NativeDataError.invalidResponse }
    }
}

struct NativeArchiveDataBinding: Equatable {
    let scope: NativeArchiveDataScope
    let requestID: String
    let tripID: String?
    let tripVersion: Int?
    let objectIDs: [String]
    let sourceDigest: String
    let previewDigest: String
    let capturedAt: Date
    let expiresAt: Date
    let ownerID: String
    let sessionID: String
    let epoch: Int
    init(_ v: [String: Any], command: NativeArchiveDataCommand, actor: NativeCommunitySafetyActor,
         now: Date, expiredReceipt: Bool = false) throws {
        let w = NativeCommunityWire.self, s = NativeArchiveDataWire.self
        scope = command.scope; try s.actor(v, actor, scope: scope)
        let selection = try NativeArchiveDataCommand(body: w.bytes(["action": "preview", "scope": scope.rawValue,
            "requestId": v["requestId"] as Any, "tripId": v["tripId"] as Any, "tripVersion": v["tripVersion"] as Any,
            "objectIds": v["objectIds"] as Any]))
        guard let id = selection.requestID, id == command.requestID, selection.tripID == command.tripID,
              selection.tripVersion == command.tripVersion, selection.objectIDs == command.objectIDs else { throw NativeDataError.invalidResponse }
        requestID = id; tripID = selection.tripID; tripVersion = selection.tripVersion; objectIDs = selection.objectIDs
        ownerID = try NativeArchiveDataCommand.id(v["ownerId"]); sessionID = try NativeArchiveDataCommand.id(v["sessionId"])
        epoch = try s.integer(v["mobileEpoch"]); sourceDigest = try w.hash(v["sourceDigest"]); previewDigest = try w.hash(v["previewDigest"])
        let capture = try s.integer(v["capturedAt"]), expiry = try s.integer(v["expiresAt"])
        capturedAt = try s.time(capture); expiresAt = try s.time(expiry)
        let expected = s.boundaries[scope] ?? [:], bounds = try w.object(v["boundaries"] as Any, Set(expected.keys))
        for (key, codes) in expected { guard bounds[key] as? [String] == codes else { throw NativeDataError.invalidResponse } }
        guard expiry == capture + 30_000, capturedAt <= now, expiredReceipt || expiresAt > now,
              command.previewDigest == nil || command.previewDigest == previewDigest else { throw NativeDataError.invalidResponse }
    }
}

struct NativeArchiveDataObject: Identifiable, Equatable {
    let id: String
    let trip: NativeTripLifecycleTrip?
    let originalScope: NativeArchiveDataScope?
    let originalTripID: String?
    let originalTripVersion: Int?
    let state: String
    let progressErased: Bool
}
struct NativeArchiveDataPreview {
    let binding: NativeArchiveDataBinding
    let counts: [String: Int]
    let snapshotVersionGaps: Int
}
struct NativeArchiveDataReceipt {
    let binding: NativeArchiveDataBinding
    let requestDigest: String
    let decidedAt: Date
    let clearedProgress: Int
    let retainedFences: Int
}

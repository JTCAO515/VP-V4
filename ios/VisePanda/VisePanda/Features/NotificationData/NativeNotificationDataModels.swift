import Foundation

struct NativeNotificationDataBoundaries: Equatable {
    let exportFields: [String]
    let eraseFields: [String]
    let retained: [String]
    let missing: [String]
    init(exportFields: [String], eraseFields: [String], retained: [String], missing: [String]) {
        self.exportFields = exportFields; self.eraseFields = eraseFields
        self.retained = retained; self.missing = missing
    }
    static func expected(_ scope: NativeNotificationDataScope) -> Self {
        switch scope {
        case .trip: return .init(exportFields: ["reminders_all_fields", "watches_all_fields", "dismissals_all_fields", "outbox_all_fields", "attempts_all_fields", "operations_all_fields", "travel_reminders_all_fields", "retained_object_operation_dispatch_fences"],
            eraseFields: ["selected_trip_notification_rows", "selected_trip_user_reminder_rows"],
            retained: ["nonreplayable_object_operation_dispatch_fences", "minimal_exit_receipts", "original_trip_and_business_results", "device_bindings"],
            missing: ["provider_accepted_copies_not_recallable", "provider_ack_unknown", "device_delivered_notifications", "device_local_journals", "external_export_files", "backup_restore_target_acceptance"])
        case .device: return .init(exportFields: ["devices_all_fields_including_push_token", "associated_outbox_all_fields", "associated_attempts_all_fields", "retained_device_dispatch_fences"],
            eraseFields: ["selected_device_bindings", "associated_attempt_rows", "associated_outbox_rows"],
            retained: ["nonreplayable_device_dispatch_fences", "minimal_exit_receipts", "trip_reminder_watch_source_rows"],
            missing: ["provider_accepted_copies_not_recallable", "provider_ack_unknown", "device_os_permission", "device_push_token_system_copy", "device_delivered_notifications", "device_local_journals", "external_export_files", "backup_restore_target_acceptance"])
        case .progress: return .init(exportFields: ["selected_exit_request_metadata", "selected_exit_page_progress", "minimal_exit_receipts", "retained_object_operation_device_dispatch_fences"],
            eraseFields: ["selected_transient_page_progress"],
            retained: ["nonreplayable_request_object_operation_device_dispatch_fences", "source_preview_request_digests", "minimal_exit_receipts"],
            missing: ["other_unselected_exit_requests", "external_export_files", "backup_restore_target_acceptance"])
        }
    }
    init(_ raw: Any, scope: NativeNotificationDataScope) throws {
        let v = try NativeCommunityWire.object(raw, ["exportFields", "eraseFields", "retained", "missing"])
        guard let a = v["exportFields"] as? [String], let b = v["eraseFields"] as? [String],
              let c = v["retained"] as? [String], let d = v["missing"] as? [String] else {
            throw NativeDataError.invalidResponse
        }
        self.init(exportFields: a, eraseFields: b, retained: c, missing: d)
        guard self == Self.expected(scope) else { throw NativeDataError.invalidResponse }
    }
}

struct NativeNotificationDataBinding: Equatable {
    let scope: NativeNotificationDataScope
    let requestID: String
    let objectIDs: [String]
    let ownerID: String
    let sessionID: String
    let epoch: Int
    let sourceDigest: String
    let previewDigest: String
    let capturedAt: Date
    let expiresAt: Date
    let boundaries: NativeNotificationDataBoundaries

    init(_ v: [String: Any], command: NativeNotificationDataCommand,
         actor: NativeCommunitySafetyActor, now: Date, allowExpired: Bool = false) throws {
        let w = NativeCommunityWire.self
        guard v["schemaVersion"] as? String == NativeNotificationDataWire.schema,
              let scope = NativeNotificationDataScope(rawValue: v["scope"] as? String ?? ""),
              try !w.bool(v["allUserDataCompleted"]), let ids = v["objectIds"] as? [String] else {
            throw NativeDataError.invalidResponse
        }
        self.scope = scope; objectIDs = ids
        requestID = try NativeNotificationDataCommand.id(v["requestId"])
        ownerID = try NativeNotificationDataCommand.id(v["ownerId"])
        sessionID = try NativeNotificationDataCommand.id(v["sessionId"])
        epoch = try w.integer(v["mobileEpoch"], max: 9_007_199_254_740_991)
        sourceDigest = try w.hash(v["sourceDigest"]); previewDigest = try w.hash(v["previewDigest"])
        let captured = try w.integer(v["capturedAt"], max: 9_007_199_254_740_991)
        let expiry = try w.integer(v["expiresAt"], max: 9_007_199_254_740_991)
        capturedAt = Date(timeIntervalSince1970: Double(captured) / 1000)
        expiresAt = Date(timeIntervalSince1970: Double(expiry) / 1000)
        boundaries = try .init(v["boundaries"] as Any, scope: scope)
        guard scope == command.scope, requestID == command.requestID, ids == command.objectIDs,
              ownerID == actor.scope.subject.lowercased(), sessionID == actor.sessionID,
              epoch == actor.scope.mobileEpoch, capturedAt <= now, expiry == captured + 30_000,
              allowExpired || expiresAt > now else { throw NativeDataError.invalidResponse }
        if let expected = command.previewDigest, expected != previewDigest { throw NativeDataError.invalidResponse }
    }
}

struct NativeNotificationDataField: Identifiable {
    let name: String
    let value: String
    var id: String { name }
}
struct NativeNotificationDataItem: Identifiable {
    let id: String
    let fields: [NativeNotificationDataField]
}

enum NativeNotificationDataWire {
    static let schema = "notification-data/1"
    static let bindingKeys: Set<String> = ["schemaVersion", "scope", "requestId", "objectIds", "ownerId",
        "sessionId", "mobileEpoch", "sourceDigest", "previewDigest", "capturedAt", "expiresAt", "boundaries", "allUserDataCompleted"]
    static func time(_ raw: Any?) throws -> Date {
        Date(timeIntervalSince1970: Double(try NativeCommunityWire.integer(raw, max: 9_007_199_254_740_991)) / 1000)
    }
    static func root(_ bytes: Data) throws -> [String: Any] {
        guard bytes.count <= 1_000_000 else { throw NativeDataError.invalidResponse }
        let outer = try NativeCommunityWire.object(JSONSerialization.jsonObject(with: bytes), ["data"])
        guard let v = outer["data"] as? [String: Any] else { throw NativeDataError.invalidResponse }
        return v
    }
}

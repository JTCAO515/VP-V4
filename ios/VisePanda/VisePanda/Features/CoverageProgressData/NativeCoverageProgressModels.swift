import Foundation
import CryptoKit

enum NativeCoverageProgressWire {
    static let schema = "coverage-progress-data/1"
    static let bindingKeys: Set<String> = ["schemaVersion", "scope", "requestId", "objectIds", "ownerId", "sessionId", "mobileEpoch",
        "sourceDigest", "previewDigest", "capturedAt", "expiresAt", "boundaries", "allUserDataCompleted"]
    static let boundaries: [String: [String]] = [
        "exportFields": ["selected_collector_all_request_fields", "selected_collector_all_section_fields", "selected_collector_all_fence_fields", "selected_exit_all_request_fields", "selected_exit_all_page_fields", "minimal_exit_receipt"],
        "eraseFields": ["selected_collector_transient_requests_and_sections", "selected_exit_transient_page_progress"],
        "retained": ["original_request_id_owner_session_scope_expiry_fences", "nonreplayable_exit_bindings_selection_digests_decision_receipts", "original_session_account_cascade_semantics"],
        "missing": ["unselected_progress_records", "source_data_in_separate_domains", "external_export_files", "backup_restore_target_acceptance"]]
    static func digest(_ bytes: Data) -> String { SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined() }
    static func integer(_ raw: Any?, max: Int = 9_007_199_254_740_991, minimum: Int = 1) throws -> Int {
        try NativeCommunityWire.integer(raw, max: max, minimum: minimum)
    }
    static func time(_ raw: Any?) throws -> Date {
        Date(timeIntervalSince1970: Double(try integer(raw)) / 1000)
    }
    static func root(_ bytes: Data) throws -> [String: Any] {
        guard !bytes.isEmpty, bytes.count <= 1_000_000 else { throw NativeDataError.invalidResponse }
        let outer = try NativeCommunityWire.object(JSONSerialization.jsonObject(with: bytes), ["data"])
        guard let v = outer["data"] as? [String: Any] else { throw NativeDataError.invalidResponse }
        return v
    }
    static func actor(_ v: [String: Any], _ actor: NativeCommunitySafetyActor) throws {
        guard v["schemaVersion"] as? String == schema, v["scope"] as? String == schema,
              try NativeCoverageProgressCommand.id(v["ownerId"]) == actor.scope.subject.lowercased(),
              try NativeCoverageProgressCommand.id(v["sessionId"]) == actor.sessionID,
              try integer(v["mobileEpoch"]) == actor.scope.mobileEpoch,
              try !NativeCommunityWire.bool(v["allUserDataCompleted"]) else { throw NativeDataError.invalidResponse }
    }
    static func catalog(_ module: NativeDataCoverageModule) -> Bool {
        module.id == "coverage_progress" && module.location == .server && module.version == schema && module.scope == schema
            && module.selection == "coverage_records"
            && module.exportHandler == "coverage_progress" && module.deleteHandler == "coverage_progress"
    }
}

struct NativeCoverageProgressBinding: Equatable {
    let requestID: String
    let objectIDs: [String]
    let sourceDigest: String
    let previewDigest: String
    let capturedAt: Date
    let expiresAt: Date
    let ownerID: String
    let sessionID: String
    let epoch: Int
    init(_ v: [String: Any], command: NativeCoverageProgressCommand, actor: NativeCommunitySafetyActor,
         now: Date, expiredReceipt: Bool = false) throws {
        let w = NativeCommunityWire.self, s = NativeCoverageProgressWire.self
        try s.actor(v, actor)
        requestID = try NativeCoverageProgressCommand.id(v["requestId"])
        objectIDs = try NativeCoverageProgressCommand.ids(v["objectIds"])
        ownerID = try NativeCoverageProgressCommand.id(v["ownerId"])
        sessionID = try NativeCoverageProgressCommand.id(v["sessionId"])
        epoch = try s.integer(v["mobileEpoch"])
        sourceDigest = try w.hash(v["sourceDigest"]); previewDigest = try w.hash(v["previewDigest"])
        let capture = try s.integer(v["capturedAt"]), expiry = try s.integer(v["expiresAt"])
        capturedAt = try s.time(capture); expiresAt = try s.time(expiry)
        let bounds = try w.object(v["boundaries"] as Any, Set(s.boundaries.keys))
        for (key, expected) in s.boundaries {
            guard bounds[key] as? [String] == expected else { throw NativeDataError.invalidResponse }
        }
        guard requestID == command.requestID, objectIDs == command.objectIDs, !objectIDs.contains(requestID),
              expiry == capture + 30_000, capturedAt <= now, expiredReceipt || expiresAt > now,
              command.previewDigest == nil || command.previewDigest == previewDigest else { throw NativeDataError.invalidResponse }
    }
}

struct NativeCoverageProgressObject: Identifiable, Equatable {
    let id: String
    let domain: String
    let state: String
    let rows: Int
}
struct NativeCoverageProgressItem: Identifiable {
    let id: String
    let domain: String
    let fields: String
}
struct NativeCoverageProgressPreview {
    let binding: NativeCoverageProgressBinding
    let items: [NativeCoverageProgressItem]
}
struct NativeCoverageProgressReceipt {
    let binding: NativeCoverageProgressBinding
    let collectorRequests: Int
    let collectorSections: Int
    let exitPages: Int
    let retainedFences: Int
}

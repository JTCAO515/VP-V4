import Foundation
import CryptoKit

enum NativeTurnDataWire {
    static let schema = "turn-data/1"
    static let lifetime: TimeInterval = 30
    static let bindingKeys: Set<String> = ["schemaVersion", "scope", "requestId", "turnId", "objectIds", "ownerId", "sessionId", "mobileEpoch", "sourceDigest", "previewDigest", "sourceAuthorities", "capturedAt", "expiresAt", "boundaries", "allUserDataCompleted"]
    static let graphKeys = ["turnIds", "messageIds", "artifactIds"]
    static let referenceKeys = ["taskIds", "threadIds", "conversationIds", "goalIds", "tripIds", "memoryIds"]
    static let erasedKeys = ["events", "idempotency", "feedback", "artifacts", "revisions", "resultEvents", "sourceReceipts", "intakes", "intakeBindings", "planning", "actionReceipts", "observations", "modelDispatches", "checkpoints", "attemptBindings", "localJournals", "executionRuns", "callWindows", "collectorOrigins", "collectorOutputs", "resultClaims", "completionProofs", "completedReceipts", "grounded", "assistJobs", "work", "memoryConsumers"]
    static let retainedKeys = ["turns", "messages", "tasks", "taskTurns", "capacity", "budgetAttempts", "textDispatches", "threads", "conversations", "goals"]
    static let conflicts = ["SCOPE_TOO_LARGE", "ACTIVE_WORK", "SHARED_OR_FOREIGN_SCOPE", "CROSS_TURN_REFERENCE", "PROPOSAL_REFERENCE", "READINESS_REFERENCE", "GUIDE_REFERENCE", "SCOPED_EDIT_REFERENCE", "NOTIFICATION_REFERENCE", "BRIEF_REFERENCE", "CORE_EXPORT_COPY", "OTHER_DELETE_PENDING", "SOURCE_UNSUPPORTED"]
    static let redactedKeys = ["textBodies", "messageBodies", "taskDigests"]
    static let boundaries: [NativeTurnDataScope: [String: [String]]] = [
        .sensitive: [
            "eraseFields": ["selected_turn_events_feedback_idempotency", "exclusive_result_revisions_events", "selected_intakes_source_receipts", "selected_grounded_planning_worker_sensitive_copies", "selected_memory_consumer_references"],
            "redactFields": ["selected_text_input_output_permanently_hidden", "selected_message_input_fixed_deleted_marker", "selected_root_task_digest_fixed_deleted_marker"],
            "retained": ["turn_message_task_thread_conversation_goal_identity", "other_turns_and_parent_contents_except_selected_root_task_digest", "confirmed_trip_content_history_proposals", "explicit_memory_profiles_receipts_consents", "capacity_budget_dispatch_financial_metadata", "permanent_identity_operation_fences", "original_policy_consent_authority_ids"],
            "missing": ["active_shared_cross_turn_and_mixed_result_references_blocked", "guide_brief_proposal_knowledge_source_references_require_original_flow", "mixed_core_export_copies_require_original_cleanup", "provider_external_copies_not_erased", "backup_restore_old_device_acceptance_unverified"],
        ],
        .progress: [
            "eraseFields": ["selected_transient_preview_graph_counts_references_conflicts"],
            "redactFields": [],
            "retained": ["original_selection_actor_epoch_hash_time_operation_fences", "immutable_minimal_decisions", "original_policy_consent_authority_ids"],
            "missing": ["source_turn_data_not_erased", "unselected_operations", "external_copies", "backup_restore_old_device_acceptance_unverified"],
        ],
    ]
    static func digest(_ bytes: Data) -> String { SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined() }
    static func root(_ bytes: Data) throws -> [String: Any] {
        guard !bytes.isEmpty, bytes.count <= 1_000_000 else { throw NativeDataError.invalidResponse }
        let outer = try NativeCommunityWire.object(JSONSerialization.jsonObject(with: bytes), ["data"])
        guard let value = outer["data"] as? [String: Any] else { throw NativeDataError.invalidResponse }
        return value
    }
    static func integer(_ raw: Any?, maximum: Int = 9_007_199_254_740_991, minimum: Int = 1) throws -> Int {
        try NativeCommunityWire.integer(raw, max: maximum, minimum: minimum)
    }
    static func time(_ raw: Any?) throws -> Date {
        Date(timeIntervalSince1970: Double(try integer(raw)) / 1000)
    }
    static func actor(_ v: [String: Any], _ actor: NativeCommunitySafetyActor, scope: NativeTurnDataScope) throws {
        guard v["schemaVersion"] as? String == schema, v["scope"] as? String == scope.rawValue,
              try NativeTurnDataCommand.id(v["ownerId"]) == actor.scope.subject.lowercased(),
              try NativeTurnDataCommand.id(v["sessionId"]) == actor.sessionID,
              try integer(v["mobileEpoch"]) == actor.scope.mobileEpoch,
              try !NativeCommunityWire.bool(v["allUserDataCompleted"]) else { throw NativeDataError.invalidResponse }
    }
    static func counts(_ raw: Any?, keys: [String]) throws -> [String: Int] {
        let v = try NativeCommunityWire.object(raw as Any, Set(keys))
        return try v.mapValues { try integer($0, maximum: 10000, minimum: 0) }
    }
}

struct NativeTurnDataSourceAuthority: Equatable {
    let policyID: String
    let consentID: String

    static func parse(_ raw: Any?) throws -> [Self] {
        guard let values = raw as? [[String: Any]], values.count <= 100 else { throw NativeDataError.invalidResponse }
        var previous: Self?
        return try values.map { value in
            _ = try NativeCommunityWire.object(value, ["policyId", "consentId"])
            let next = try Self(policyID: NativeTurnDataCommand.id(value["policyId"]), consentID: NativeTurnDataCommand.id(value["consentId"]))
            if let previous {
                guard previous.policyID < next.policyID || previous.policyID == next.policyID && previous.consentID < next.consentID else { throw NativeDataError.invalidResponse }
            }
            previous = next; return next
        }
    }
}

struct NativeTurnDataBinding: Equatable {
    let scope: NativeTurnDataScope
    let requestID: String
    let turnID: String?
    let objectIDs: [String]
    let actor: NativeCommunitySafetyActor
    let sourceDigest: String
    let previewDigest: String
    let sourceAuthorities: [NativeTurnDataSourceAuthority]
    let capturedAt: Date
    let expiresAt: Date

    init(_ v: [String: Any], command: NativeTurnDataCommand, actor: NativeCommunitySafetyActor, now: Date, decided: Bool = false) throws {
        let w = NativeCommunityWire.self, s = NativeTurnDataWire.self
        try s.actor(v, actor, scope: command.scope)
        scope = command.scope; self.actor = actor; requestID = try NativeTurnDataCommand.id(v["requestId"])
        turnID = try w.optional(v["turnId"], NativeTurnDataCommand.id)
        objectIDs = try NativeTurnDataCommand.ids(v["objectIds"], maximum: 20)
        sourceDigest = try w.hash(v["sourceDigest"]); previewDigest = try w.hash(v["previewDigest"])
        sourceAuthorities = try NativeTurnDataSourceAuthority.parse(v["sourceAuthorities"])
        let capture = try s.integer(v["capturedAt"]), expiry = try s.integer(v["expiresAt"])
        capturedAt = try s.time(capture); expiresAt = try s.time(expiry)
        guard now.timeIntervalSince1970.isFinite, capture <= 9_007_199_254_740_991 - 30_000,
              requestID == command.requestID, turnID == command.turnID, objectIDs == command.objectIDs,
              scope != .sensitive || !sourceAuthorities.isEmpty,
              command.sourceDigest == nil || sourceDigest == command.sourceDigest,
              command.previewDigest == nil || previewDigest == command.previewDigest,
              capturedAt <= now, expiry == capture + 30_000, decided || now < expiresAt else { throw NativeDataError.invalidResponse }
        let boundary = try w.object(v["boundaries"] as Any, ["eraseFields", "redactFields", "retained", "missing"])
        for (key, expected) in s.boundaries[scope] ?? [:] {
            guard boundary[key] as? [String] == expected else { throw NativeDataError.invalidResponse }
        }
    }
}

struct NativeTurnDataGraph: Equatable {
    let ids: [String: [String]]
    var size: Int { ids.values.reduce(0) { $0 + $1.count } }
    var empty: Bool { size == 0 }
    var fenceCount: Int { size }
    init(_ raw: Any?) throws {
        let v = try NativeCommunityWire.object(raw as Any, Set(NativeTurnDataWire.graphKeys))
        ids = try v.mapValues { try NativeTurnDataCommand.ids($0) }
        guard size <= 4100 else { throw NativeDataError.invalidResponse }
    }
}
struct NativeTurnDataReferences: Equatable {
    let ids: [String: [String]]
    var empty: Bool { ids.values.allSatisfy(\.isEmpty) }
    init(_ raw: Any?) throws {
        let v = try NativeCommunityWire.object(raw as Any, Set(NativeTurnDataWire.referenceKeys))
        ids = try v.mapValues { try NativeTurnDataCommand.ids($0) }
    }
}

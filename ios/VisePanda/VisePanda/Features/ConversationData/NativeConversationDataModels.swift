import Foundation
import CryptoKit

enum NativeConversationDataWire {
    static let schema = "conversation-data/1"
    static let lifetime: TimeInterval = 30
    static let bindingKeys: Set<String> = ["schemaVersion", "scope", "requestId", "rootKind", "rootId", "objectIds", "ownerId", "sessionId", "mobileEpoch", "sourceDigest", "previewDigest", "sourceAuthorities", "capturedAt", "expiresAt", "boundaries", "allUserDataCompleted"]
    static let graphKeys = ["conversationIds", "threadIds", "turnIds", "taskIds", "goalIds", "messageIds", "artifactIds"]
    static let erasedKeys = ["conversations", "goals", "messages", "threads", "turns", "events", "idempotency", "feedback", "artifacts", "revisions", "resultEvents", "sourceReceipts", "intakes", "intakeBindings", "planning", "actionReceipts", "observations", "modelDispatches", "checkpoints", "attemptBindings", "localJournals", "executionRuns", "callWindows", "collectorOrigins", "collectorOutputs", "resultClaims", "completionProofs", "completedReceipts", "grounded", "assistJobs", "work", "memoryConsumers", "goalLinks"]
    static let redactedKeys = ["textBodies", "taskDigests"]
    static let retainedKeys = ["tasks", "taskTurns", "capacity", "budgetAttempts", "textDispatches", "goalTripReceipts"]
    static let conflicts = ["SCOPE_TOO_LARGE", "ACTIVE_WORK", "SHARED_OR_FOREIGN_SCOPE", "CROSS_SCOPE_REFERENCE", "PROPOSAL_REFERENCE", "READINESS_REFERENCE", "GUIDE_REFERENCE", "SCOPED_EDIT_REFERENCE", "NOTIFICATION_REFERENCE", "BRIEF_REFERENCE", "CORE_EXPORT_COPY", "OTHER_DELETE_PENDING", "SOURCE_UNSUPPORTED"]
    static let boundaries: [NativeConversationDataScope: [String: [String]]] = [
        .sensitive: [
            "eraseFields": ["selected_conversation_goals_messages_intakes_source_receipts", "exclusive_threads_turns_events_feedback", "exclusive_results_all_revisions_events", "closed_planning_grounded_worker_copies", "selected_turn_memory_consumer_references"],
            "redactFields": ["selected_private_text_input_output_permanently_hidden", "selected_task_goal_digest_fixed_deleted_marker"],
            "retained": ["confirmed_trip_content_history_proposals", "explicit_memory_profiles_receipts_consents", "other_conversations_and_domains", "minimal_task_capacity_budget_dispatch_link_receipts", "permanent_entity_identity_and_operation_fences", "original_source_policy_consent_authority_ids"],
            "missing": ["applied_or_unapplied_proposal_source_requires_original_flow", "shared_cross_scope_or_active_work_rejected", "readiness_guide_scoped_edit_notification_brief_links_rejected", "existing_core_export_copies_require_original_cleanup", "provider_and_external_copies_not_erased", "backup_restore_and_old_device_acceptance_unverified"]
        ],
        .progress: [
            "eraseFields": ["selected_transient_preview_graph_conflicts_references"], "redactFields": [],
            "retained": ["root_selection_actor_epoch_hash_time_operation_fences", "immutable_minimal_decisions_and_entity_tombstones", "original_source_policy_consent_authority_ids"],
            "missing": ["source_conversation_data_not_erased", "unselected_operations", "external_copies", "backup_restore_and_old_device_acceptance_unverified"]
        ]
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
    static func actor(_ v: [String: Any], _ actor: NativeCommunitySafetyActor, scope: NativeConversationDataScope) throws {
        guard v["schemaVersion"] as? String == schema, v["scope"] as? String == scope.rawValue,
              try NativeConversationDataCommand.id(v["ownerId"]) == actor.scope.subject.lowercased(),
              try NativeConversationDataCommand.id(v["sessionId"]) == actor.sessionID,
              try integer(v["mobileEpoch"]) == actor.scope.mobileEpoch,
              try !NativeCommunityWire.bool(v["allUserDataCompleted"]) else { throw NativeDataError.invalidResponse }
    }
    static func counts(_ raw: Any?, keys: [String]) throws -> [String: Int] {
        let v = try NativeCommunityWire.object(raw as Any, Set(keys))
        return try v.mapValues { try integer($0, maximum: 10000, minimum: 0) }
    }
}

struct NativeConversationDataSourceAuthority: Equatable {
    let policyID: String
    let consentID: String

    static func parse(_ raw: Any?) throws -> [Self] {
        guard let values = raw as? [[String: Any]], values.count <= 100 else { throw NativeDataError.invalidResponse }
        var previous: Self?
        return try values.map { value in
            _ = try NativeCommunityWire.object(value, ["policyId", "consentId"])
            let next = try Self(policyID: NativeConversationDataCommand.id(value["policyId"]), consentID: NativeConversationDataCommand.id(value["consentId"]))
            if let previous {
                guard previous.policyID < next.policyID || previous.policyID == next.policyID && previous.consentID < next.consentID else { throw NativeDataError.invalidResponse }
            }
            previous = next; return next
        }
    }
}

struct NativeConversationDataBinding: Equatable {
    let scope: NativeConversationDataScope
    let requestID: String
    let rootKind: NativeConversationDataRoot?
    let rootID: String?
    let objectIDs: [String]
    let actor: NativeCommunitySafetyActor
    let sourceDigest: String
    let previewDigest: String
    let sourceAuthorities: [NativeConversationDataSourceAuthority]
    let capturedAt: Date
    let expiresAt: Date

    init(_ v: [String: Any], command: NativeConversationDataCommand, actor: NativeCommunitySafetyActor, now: Date, decided: Bool = false) throws {
        let w = NativeCommunityWire.self, s = NativeConversationDataWire.self
        try s.actor(v, actor, scope: command.scope)
        scope = command.scope; self.actor = actor; requestID = try NativeConversationDataCommand.id(v["requestId"])
        rootKind = try w.optional(v["rootKind"]) { value in
            guard let text = value as? String, let kind = NativeConversationDataRoot(rawValue: text) else { throw NativeDataError.invalidResponse }
            return kind
        }
        rootID = try w.optional(v["rootId"], NativeConversationDataCommand.id)
        objectIDs = try NativeConversationDataCommand.ids(v["objectIds"], maximum: 20)
        sourceDigest = try w.hash(v["sourceDigest"]); previewDigest = try w.hash(v["previewDigest"])
        sourceAuthorities = try NativeConversationDataSourceAuthority.parse(v["sourceAuthorities"])
        let capture = try s.integer(v["capturedAt"]), expiry = try s.integer(v["expiresAt"])
        capturedAt = try s.time(capture); expiresAt = try s.time(expiry)
        guard now.timeIntervalSince1970.isFinite, capture <= 9_007_199_254_740_991 - 30_000,
              requestID == command.requestID, rootKind == command.rootKind, rootID == command.rootID, objectIDs == command.objectIDs,
              rootKind != .conversation || !sourceAuthorities.isEmpty,
              command.sourceDigest == nil || sourceDigest == command.sourceDigest,
              command.previewDigest == nil || previewDigest == command.previewDigest,
              capturedAt <= now, expiry == capture + 30_000, decided || now < expiresAt else { throw NativeDataError.invalidResponse }
        let boundary = try w.object(v["boundaries"] as Any, ["eraseFields", "redactFields", "retained", "missing"])
        for (key, expected) in s.boundaries[scope] ?? [:] {
            guard boundary[key] as? [String] == expected else { throw NativeDataError.invalidResponse }
        }
    }
}

struct NativeConversationDataGraph: Equatable {
    let ids: [String: [String]]
    init(_ raw: Any?) throws {
        let v = try NativeCommunityWire.object(raw as Any, Set(NativeConversationDataWire.graphKeys))
        ids = try v.mapValues { try NativeConversationDataCommand.ids($0) }
        guard ids.values.reduce(0, { $0 + $1.count }) <= 4100 else { throw NativeDataError.invalidResponse }
    }
}

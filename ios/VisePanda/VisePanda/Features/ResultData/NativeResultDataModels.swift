import Foundation
import CryptoKit

enum NativeResultDataWire {
    static let schema = "result-data/1"
    static let lifetime: TimeInterval = 30
    static let bindingKeys: Set<String> = ["schemaVersion", "scope", "requestId", "rootKind", "rootId", "objectIds", "ownerId", "sessionId", "mobileEpoch", "sourceDigest", "previewDigest", "sourceAuthorities", "capturedAt", "expiresAt", "boundaries", "allUserDataCompleted"]
    static let uuidKeys = ["artifactIds", "executionIds", "journalIds", "publicationKeys"]
    static let graphKeys = ["artifactIds", "executionIds", "journalIds", "publicationKeys", "revisions", "eventIds"]
    static let referenceKeys = ["conversationIds", "goalIds", "messageIds", "taskIds", "turnIds", "threadIds", "tripIds", "memoryIds", "sourceArtifactIds", "proposalIds"]
    static let erasedKeys = ["artifacts", "revisions", "resultEvents", "executionRuns", "callWindows", "collectorOrigins", "collectorOutputs", "resultClaims", "completionProofs", "completedReceipts", "localJournals"]
    static let retainedKeys = ["conversations", "goals", "messages", "tasks", "turns", "threads", "trips", "memories", "sourceArtifacts", "proposals", "budgetAttempts", "planningSources"]
    static let conflicts = ["SCOPE_TOO_LARGE", "ACTIVE_WORK", "SHARED_OR_FOREIGN_SCOPE", "CROSS_RESULT_REFERENCE", "CONVERSATION_SOURCE_REFERENCE", "PROPOSAL_REFERENCE", "DECISION_REFERENCE", "READINESS_REFERENCE", "GUIDE_REFERENCE", "SCOPED_EDIT_REFERENCE", "NOTIFICATION_REFERENCE", "BRIEF_REFERENCE", "KNOWLEDGE_MIXED_COPY", "CORE_EXPORT_COPY", "OTHER_DELETE_PENDING", "SOURCE_UNSUPPORTED"]
    static let boundaries: [NativeResultDataScope: [String: [String]]] = [
        .sensitive: [
            "eraseFields": ["one_selected_artifact_all_revisions_and_events", "proven_exclusive_completed_planning_result_copies"],
            "retained": ["original_conversations_goals_messages_tasks_turns_threads", "confirmed_trip_content_history_proposals", "explicit_memory_profiles_receipts_consents", "original_source_results_and_evidence", "financial_budget_dispatch_and_source_records", "permanent_artifact_publication_execution_journal_and_operation_fences", "original_source_policy_consent_authority_ids"],
            "missing": ["cross_result_or_conversation_source_dependents_rejected", "applied_or_unapplied_proposal_and_decision_dependencies_rejected", "active_shared_or_unqualified_copies_rejected", "brief_guide_notification_knowledge_and_core_export_copies_rejected", "provider_and_external_copies_not_erased", "backup_restore_and_old_device_acceptance_unverified"],
        ],
        .progress: [
            "eraseFields": ["selected_transient_preview_graph_counts_references_conflicts"],
            "retained": ["selection_actor_epoch_hash_time_operation_fences", "immutable_minimal_decisions_and_identity_tombstones", "original_source_policy_consent_authority_ids"],
            "missing": ["source_results_not_erased", "unselected_operations", "external_copies", "backup_restore_and_old_device_acceptance_unverified"],
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
    static func actor(_ v: [String: Any], _ actor: NativeCommunitySafetyActor, scope: NativeResultDataScope) throws {
        guard v["schemaVersion"] as? String == schema, v["scope"] as? String == scope.rawValue,
              try NativeResultDataCommand.id(v["ownerId"]) == actor.scope.subject.lowercased(),
              try NativeResultDataCommand.id(v["sessionId"]) == actor.sessionID,
              try integer(v["mobileEpoch"]) == actor.scope.mobileEpoch,
              try !NativeCommunityWire.bool(v["allUserDataCompleted"]) else { throw NativeDataError.invalidResponse }
    }
    static func counts(_ raw: Any?, keys: [String]) throws -> [String: Int] {
        let v = try NativeCommunityWire.object(raw as Any, Set(keys))
        return try v.mapValues { try integer($0, maximum: 10000, minimum: 0) }
    }
}

struct NativeResultDataSourceAuthority: Equatable {
    let policyID: String
    let consentID: String

    static func parse(_ raw: Any?) throws -> [Self] {
        guard let values = raw as? [[String: Any]], values.count <= 100 else { throw NativeDataError.invalidResponse }
        var previous: Self?
        return try values.map { value in
            _ = try NativeCommunityWire.object(value, ["policyId", "consentId"])
            let next = try Self(policyID: NativeResultDataCommand.id(value["policyId"]), consentID: NativeResultDataCommand.id(value["consentId"]))
            if let previous {
                guard previous.policyID < next.policyID || previous.policyID == next.policyID && previous.consentID < next.consentID else { throw NativeDataError.invalidResponse }
            }
            previous = next; return next
        }
    }
}

struct NativeResultDataBinding: Equatable {
    let scope: NativeResultDataScope
    let requestID: String
    let rootKind: NativeResultDataRoot?
    let rootID: String?
    let objectIDs: [String]
    let actor: NativeCommunitySafetyActor
    let sourceDigest: String
    let previewDigest: String
    let sourceAuthorities: [NativeResultDataSourceAuthority]
    let capturedAt: Date
    let expiresAt: Date

    init(_ v: [String: Any], command: NativeResultDataCommand, actor: NativeCommunitySafetyActor, now: Date, decided: Bool = false) throws {
        let w = NativeCommunityWire.self, s = NativeResultDataWire.self
        try s.actor(v, actor, scope: command.scope)
        scope = command.scope; self.actor = actor; requestID = try NativeResultDataCommand.id(v["requestId"])
        rootKind = try w.optional(v["rootKind"]) { value in
            guard let text = value as? String, let kind = NativeResultDataRoot(rawValue: text) else { throw NativeDataError.invalidResponse }
            return kind
        }
        rootID = try w.optional(v["rootId"], NativeResultDataCommand.id)
        objectIDs = try NativeResultDataCommand.ids(v["objectIds"], maximum: 20)
        sourceDigest = try w.hash(v["sourceDigest"]); previewDigest = try w.hash(v["previewDigest"])
        sourceAuthorities = try NativeResultDataSourceAuthority.parse(v["sourceAuthorities"])
        let capture = try s.integer(v["capturedAt"]), expiry = try s.integer(v["expiresAt"])
        capturedAt = try s.time(capture); expiresAt = try s.time(expiry)
        guard now.timeIntervalSince1970.isFinite, capture <= 9_007_199_254_740_991 - 30_000,
              requestID == command.requestID, rootKind == command.rootKind, rootID == command.rootID, objectIDs == command.objectIDs,
              scope != .sensitive || !sourceAuthorities.isEmpty,
              command.sourceDigest == nil || sourceDigest == command.sourceDigest,
              command.previewDigest == nil || previewDigest == command.previewDigest,
              capturedAt <= now, expiry == capture + 30_000, decided || now < expiresAt else { throw NativeDataError.invalidResponse }
        let boundary = try w.object(v["boundaries"] as Any, ["eraseFields", "retained", "missing"])
        for (key, expected) in s.boundaries[scope] ?? [:] {
            guard boundary[key] as? [String] == expected else { throw NativeDataError.invalidResponse }
        }
    }
}

struct NativeResultDataGraph: Equatable {
    let ids: [String: [String]]
    let revisions: [Int]
    let eventIDs: [String]
    var size: Int { ids.values.reduce(0) { $0 + $1.count } + revisions.count + eventIDs.count }
    var empty: Bool { size == 0 }
    var fenceCount: Int { ids.values.reduce(0) { $0 + $1.count } }
    init(_ raw: Any?) throws {
        let v = try NativeCommunityWire.object(raw as Any, Set(NativeResultDataWire.graphKeys))
        var parsed: [String: [String]] = [:]
        for key in NativeResultDataWire.uuidKeys { parsed[key] = try NativeResultDataCommand.ids(v[key]) }
        ids = parsed
        guard let rows = v["revisions"] as? [Any], rows.count <= 1000,
              let events = v["eventIds"] as? [String], events.count <= 3000 else { throw NativeDataError.invalidResponse }
        revisions = try rows.map { try NativeResultDataWire.integer($0, maximum: 1000) }
        guard revisions == revisions.sorted(), Set(revisions).count == revisions.count else { throw NativeDataError.invalidResponse }
        var previous: UInt64 = 0
        for event in events {
            guard event.range(of: "^[1-9][0-9]{0,18}$", options: .regularExpression) != nil,
                  let number = UInt64(event), number <= UInt64(Int64.max), number > previous else { throw NativeDataError.invalidResponse }
            previous = number
        }
        eventIDs = events
        guard size <= 4100 else { throw NativeDataError.invalidResponse }
    }
}
struct NativeResultDataReferences: Equatable {
    let ids: [String: [String]]
    var empty: Bool { ids.values.allSatisfy(\.isEmpty) }
    init(_ raw: Any?) throws {
        let v = try NativeCommunityWire.object(raw as Any, Set(NativeResultDataWire.referenceKeys))
        ids = try v.mapValues { try NativeResultDataCommand.ids($0) }
        guard ids.values.reduce(0, { $0 + $1.count }) <= 4100 else { throw NativeDataError.invalidResponse }
    }
}

import Foundation

/// A caller-owned snapshot, not a policy HTTP envelope or an authority inferred from history.
struct NativeQualifiedDelegationPolicy: Equatable {
    let id: String
    let scope: NativeDataScope
    let textPolicyID: String
    let consentAccepted: Bool
    let current: Bool
}
struct NativeQualifiedDelegationContext: Equatable {
    let selection: NativeTravelIntakeSelection
    let basisScope: NativeDataScope
    let basis: NativeTravelIntakeBasis
    let planningPolicy: NativeQualifiedDelegationPolicy
    var qualified: Bool {
        selection.valid && basisScope == selection.scope && planningPolicy.scope == selection.scope && planningPolicy.current && planningPolicy.consentAccepted
        && UUID(uuidString: planningPolicy.id) != nil && planningPolicy.textPolicyID == selection.policyID
        && basis.conversationId == selection.conversationID && basis.goalId == selection.goalID
        && basis.goalVersion == selection.goalVersion && basis.messageId == selection.parentMessageID
        && (1...999_999).contains(basis.messageSequence) && (1...999).contains(basis.intakeRevision)
        && basis.version == 5 && basis.kind == "travel_intake" && basis.sourceKind == "explicit_current_input"
        && basis.schemaVersion == "assistant-travel-current-basis/1" && basis.intake.valid
        && basis.intake.city == "shanghai" && basis.intake.comparisonTarget == "area_transport"
        && basis.readiness.kind == "ready" && basis.readiness.scope == "transport_screening" && !basis.readyForProvider
        && NativeQualifiedDelegationRPC.digest(basis.contextDigest)
        && basis.memoryBasis.count <= 3 && Set(basis.memoryBasis.compactMap { UUID(uuidString: $0.id) }).count == basis.memoryBasis.count
        && basis.memoryBasis.allSatisfy { UUID(uuidString: $0.id) != nil && (1...999_999_999_999_999).contains($0.revision) }
    }
}

/// Exactly the frozen 20 RPC parameters. This is not the unfrozen HTTP request envelope.
struct NativeQualifiedDelegationRPC: Encodable, Equatable {
    let conversationID: String; let goalID: String; let expectedGoalVersion: Int; let parentMessageID: String
    let messageID: String; let messageKey: String; let threadID: String; let turnID: String; let taskID: String; let taskKey: String
    let textPolicyID: String; let planningPolicyID: String; let locale: String; let text: String
    let memoryBasis: [NativeTravelMemoryReference]
    let expectedIntakeMessageID: String; let expectedSourceSequence: Int; let expectedIntakeRevision: Int
    let expectedIntakeDigest: String; let intake: NativeTravelIntake
    enum CodingKeys: String, CodingKey, CaseIterable {
        case conversationID = "p_conversation_id", goalID = "p_goal_id", expectedGoalVersion = "p_expected_goal_version", parentMessageID = "p_parent_message_id"
        case messageID = "p_message_id", messageKey = "p_message_key", threadID = "p_thread_id", turnID = "p_turn_id", taskID = "p_task_id", taskKey = "p_task_key"
        case textPolicyID = "p_text_policy_id", planningPolicyID = "p_planning_policy_id", locale = "p_locale", text = "p_text", memoryBasis = "p_memory_basis"
        case expectedIntakeMessageID = "p_expected_intake_message_id", expectedSourceSequence = "p_expected_source_sequence", expectedIntakeRevision = "p_expected_intake_revision"
        case expectedIntakeDigest = "p_expected_intake_digest", intake = "p_intake"
    }
    init(context: NativeQualifiedDelegationContext, locale: String, text: String) throws {
        guard context.qualified, ["zh", "en"].contains(locale), NativeTravelIntake.text(text, max: 4000) else { throw NativeDataError.invalidResponse }
        let selected = context.selection, current = context.basis
        conversationID = selected.conversationID; goalID = selected.goalID; expectedGoalVersion = selected.goalVersion
        parentMessageID = current.messageId; expectedIntakeMessageID = current.messageId
        expectedSourceSequence = current.messageSequence; expectedIntakeRevision = current.intakeRevision; expectedIntakeDigest = current.contextDigest
        messageID = UUID().uuidString.lowercased(); messageKey = UUID().uuidString.lowercased()
        threadID = UUID().uuidString.lowercased(); turnID = UUID().uuidString.lowercased(); taskID = UUID().uuidString.lowercased(); taskKey = UUID().uuidString.lowercased()
        textPolicyID = selected.policyID; planningPolicyID = context.planningPolicy.id
        self.locale = locale; self.text = text; intake = current.intake
        memoryBasis = current.memoryBasis.map { NativeTravelMemoryReference(id: UUID(uuidString: $0.id)!.uuidString.lowercased(), revision: $0.revision) }.sorted { $0.id < $1.id }
    }
    static func digest(_ value: String) -> Bool { value.count == 64 && value.allSatisfy { "0123456789abcdef".contains($0) } }
}

/// Closed RPC receipt from #624; no version/kind additions are guessed for HTTP.
struct NativeQualifiedDelegationRPCReceipt: Decodable, Equatable {
    let kind: String; let reused: Bool; let taskId: String; let turnId: String; let artifactId: String
    let conversationId: String; let goalId: String; let goalVersion: Int; let messageId: String
    let messageSequence: Int; let intakeRevision: Int; let current: Bool
    let readyForProvider: Bool; let executionAvailable: Bool
    let intakeContextDigest: String?; let planningContextDigest: String?
    static func decode(_ bytes: Data) throws -> Self {
        guard bytes.count <= 12_000, let root = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              let current = root["current"] as? Bool else { throw NativeDataError.invalidResponse }
        let keys = ["kind", "reused", "taskId", "turnId", "artifactId", "conversationId", "goalId", "goalVersion", "messageId", "messageSequence", "intakeRevision", "current", "readyForProvider", "executionAvailable"]
        guard Set(root.keys) == Set(keys + (current ? ["intakeContextDigest", "planningContextDigest"] : [])) else { throw NativeDataError.invalidResponse }
        let value = try JSONDecoder().decode(Self.self, from: bytes)
        guard value.kind == "accepted", !value.readyForProvider, !value.executionAvailable,
              [value.taskId, value.turnId, value.artifactId, value.conversationId, value.goalId, value.messageId].allSatisfy({ UUID(uuidString: $0) != nil }),
              (1...10_000).contains(value.goalVersion), (1...1_000_000).contains(value.messageSequence), (2...1_000).contains(value.intakeRevision) else { throw NativeDataError.invalidResponse }
        if current {
            guard let intake = value.intakeContextDigest, let planning = value.planningContextDigest,
                  NativeQualifiedDelegationRPC.digest(intake), NativeQualifiedDelegationRPC.digest(planning), intake != planning else { throw NativeDataError.invalidResponse }
        }
        return value
    }
    func matches(_ request: NativeQualifiedDelegationRPC) -> Bool {
        conversationId == request.conversationID && goalId == request.goalID && goalVersion == request.expectedGoalVersion
        && messageId == request.messageID && taskId == request.taskID && turnId == request.turnID
        && messageSequence > request.expectedSourceSequence && intakeRevision == request.expectedIntakeRevision + 1
        && (!current || intakeContextDigest != request.expectedIntakeDigest)
    }
    func sameIdentity(as other: Self) -> Bool {
        taskId == other.taskId && turnId == other.turnId && artifactId == other.artifactId && conversationId == other.conversationId
        && goalId == other.goalId && goalVersion == other.goalVersion && messageId == other.messageId
        && messageSequence == other.messageSequence && intakeRevision == other.intakeRevision
    }
}

/// Main-frozen HTTP response wrapper; request keys are intentionally not implemented yet.
enum NativeQualifiedDelegationHTTPReceipt {
    static func decode(_ bytes: Data) throws -> NativeQualifiedDelegationRPCReceipt {
        guard bytes.count <= 12_000, var root = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              root.removeValue(forKey: "version") as? Int == 2 else { throw NativeDataError.invalidResponse }
        return try NativeQualifiedDelegationRPCReceipt.decode(JSONSerialization.data(withJSONObject: root))
    }
}

struct NativeQualifiedDelegationHTTPRequest: Encodable {
    let rpc: NativeQualifiedDelegationRPC
    enum CodingKeys: String, CodingKey, CaseIterable {
        case conversationId, goalId, expectedGoalVersion, parentMessageId, messageId, messageKey, threadId, turnId, taskId, taskKey
        case planningPolicyId, locale, text, memoryBasis, expectedIntakeMessageId, expectedSourceSequence, expectedIntakeRevision, expectedIntakeDigest, intake
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(rpc.conversationID, forKey: .conversationId); try c.encode(rpc.goalID, forKey: .goalId)
        try c.encode(rpc.expectedGoalVersion, forKey: .expectedGoalVersion); try c.encode(rpc.parentMessageID, forKey: .parentMessageId)
        try c.encode(rpc.messageID, forKey: .messageId); try c.encode(rpc.messageKey, forKey: .messageKey)
        try c.encode(rpc.threadID, forKey: .threadId); try c.encode(rpc.turnID, forKey: .turnId)
        try c.encode(rpc.taskID, forKey: .taskId); try c.encode(rpc.taskKey, forKey: .taskKey)
        try c.encode(rpc.planningPolicyID, forKey: .planningPolicyId); try c.encode(rpc.locale, forKey: .locale)
        try c.encode(rpc.text, forKey: .text); try c.encode(rpc.memoryBasis, forKey: .memoryBasis)
        try c.encode(rpc.expectedIntakeMessageID, forKey: .expectedIntakeMessageId); try c.encode(rpc.expectedSourceSequence, forKey: .expectedSourceSequence)
        try c.encode(rpc.expectedIntakeRevision, forKey: .expectedIntakeRevision); try c.encode(rpc.expectedIntakeDigest, forKey: .expectedIntakeDigest)
        try c.encode(rpc.intake, forKey: .intake)
    }
    func bytes() throws -> Data {
        let bytes = try JSONEncoder().encode(self)
        guard bytes.count <= 16_000 else { throw NativeDataError.invalidResponse }
        return bytes
    }
}

/// Immutable recovery identity only; it carries no source projection, text, digest or consent grant.
struct NativeQualifiedDelegationPendingIdentity: Equatable {
    let scope: NativeDataScope
    let conversationID: String; let goalID: String; let messageID: String; let messageKey: String
    let threadID: String; let turnID: String; let taskID: String; let taskKey: String
    init(scope: NativeDataScope, request: NativeQualifiedDelegationRPC) {
        self.scope = scope; conversationID = request.conversationID; goalID = request.goalID
        messageID = request.messageID; messageKey = request.messageKey; threadID = request.threadID
        turnID = request.turnID; taskID = request.taskID; taskKey = request.taskKey
    }
}

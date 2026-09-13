import Foundation

struct NativeTextPolicy: Decodable, Equatable {
    enum Consent: String, Decodable { case notAccepted = "not_accepted", accepted, withdrawn }
    let id: String
    let provider: String
    let recipient: String
    let sourceRegion: String
    let processingRegion: String
    let storageRegion: String
    let termsVersion: String
    let noticeVersion: String
    let noticeHash: String
    let noticeZh: String
    let noticeEn: String
    let retention: String
    let expiresAt: String
    let consentState: Consent

    var valid: Bool {
        UUID(uuidString: id) != nil && ["qwen", "glm", "deepseek"].contains(provider)
        && noticeHash.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil
        && !noticeZh.isEmpty && !noticeEn.isEmpty && !recipient.isEmpty
        && noticeZh.utf16.count <= 8000 && noticeEn.utf16.count <= 8000
        && retention == "retain_after_hide_v1"
    }
}

struct NativeTextTurn: Decodable, Identifiable, Equatable {
    enum Outcome: String, Decodable { case answered, partial, clarification, blocked, technicalFailure = "technical_failure" }
    let turnId: String
    let threadId: String
    let locale: String
    let input: String
    let outcome: Outcome?
    let output: String?
    let status: String
    let createdAt: String
    var serviceTaskId: String? = nil
    var scopeVersion: Int? = nil
    var relationship: String? = nil
    var parentTurnId: String? = nil
    var result: NativeGroundedResult? = nil
    var id: String { turnId }
    var validTask: Bool {
        guard let serviceTaskId, UUID(uuidString: serviceTaskId) != nil,
              scopeVersion == 1 else { return false }
        if relationship == "new_goal" { return parentTurnId == nil }
        return ["clarification", "repair"].contains(relationship ?? "")
            && parentTurnId.flatMap(UUID.init(uuidString:)) != nil
    }
    var waiting: Bool { ["accepted", "planning", "retrieving", "generating", "validating"].contains(status) }
    private var consistentOutcome: Bool {
        switch outcome {
        case .answered, .partial, .clarification: return status == "completed"
        case .blocked: return status == "unavailable"
        case .technicalFailure: return status == "failed"
        case nil: return waiting || status == "cancelled" || status == "failed"
        }
    }
    var valid: Bool {
        consistentOutcome && UUID(uuidString: turnId) != nil && UUID(uuidString: threadId) != nil
        && ["zh", "en", "es", "ru", "ar"].contains(locale)
        && !input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && input.utf16.count <= 4000
        && (output == nil || (!(output?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true) && (output?.utf16.count ?? 0) <= 8000))
        && ((outcome == nil) == (output == nil))
        && ["accepted", "planning", "retrieving", "generating", "validating", "completed", "unavailable", "failed", "cancelled"].contains(status)
    }
}
struct NativeTextPolicyReply: Decodable { let version: Int; let kind: String; let policy: NativeTextPolicy }
struct NativeTextHistory: Decodable { let version: Int; let kind: String; let turns: [NativeTextTurn] }
struct NativeTextAccepted: Decodable {
    let version: Int; let kind: String; let turnId: String; let reused: Bool
    var serviceTaskId: String? = nil
    var scopeVersion: Int? = nil
    var relationship: String? = nil
    var parentTurnId: String? = nil
    func matches(_ request: NativeTextSubmission, version: Int) -> Bool {
        self.version == version && kind == "accepted" && turnId == request.turnId
        && (version == 1 || (serviceTaskId == request.serviceTask?.id
            && scopeVersion == request.serviceTask?.scopeVersion
            && relationship == request.serviceTask?.relationship
            && parentTurnId == request.serviceTask?.parentTurnId))
    }
}
struct NativeTextAction: Decodable { let version: Int; let kind: String }

struct NativeTextSubmission: Codable, Equatable {
    let threadId: String
    let turnId: String
    let idempotencyKey: String
    let policyId: String
    let locale: String
    let text: String
    var serviceTask: NativeServiceTaskLink? = nil
    var city: String? = nil
    func matches(_ turn: NativeTextTurn) -> Bool {
        turnId == turn.turnId && threadId == turn.threadId && locale == turn.locale && text == turn.input
        && city == turn.result?.city
        && (serviceTask == nil || (serviceTask?.id == turn.serviceTaskId
            && serviceTask?.scopeVersion == turn.scopeVersion && serviceTask?.relationship == turn.relationship
            && serviceTask?.parentTurnId == turn.parentTurnId))
    }
}

struct NativeServiceTaskLink: Codable, Equatable {
    let id: String
    let scopeVersion: Int
    let relationship: String
    let parentTurnId: String?
    // Root parent is an explicit null in the closed request schema.
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id); try c.encode(scopeVersion, forKey: .scopeVersion)
        try c.encode(relationship, forKey: .relationship)
        try c.encode(parentTurnId, forKey: .parentTurnId)
    }
    private enum CodingKeys: String, CodingKey { case id, scopeVersion, relationship, parentTurnId }
}

enum NativeAskMode: String, Codable {
    case currentInput = "", taskContext = "task_history_v1", grounded = "knowledge_intent_v1", unavailable
    var usesTask: Bool { self == .taskContext || self == .grounded }
    var version: Int { self == .grounded ? 4 : self == .taskContext ? 3 : 1 }
    var base: String { "api/chat/native/v\(version)" }
}

/// One submitted request, not an unsent draft or a conversation cache. Stored
/// inside the endpoint/owner Keychain credential and bound to its mobile epoch.
struct NativePendingAsk: Codable, Equatable {
    let schemaVersion: Int
    var acknowledged: Bool = false
    let mobileEpoch: Int
    let mode: NativeAskMode
    let noticeVersion: String
    let noticeHash: String
    let request: NativeTextSubmission

    var noticeIdentity: String { "\(mode.rawValue):\(request.policyId):\(noticeVersion):\(noticeHash)" }
    var valid: Bool {
        guard schemaVersion == 1, mobileEpoch > 0, mode != .unavailable,
              !noticeVersion.isEmpty, noticeVersion.utf16.count <= 256,
              noticeHash.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
              [request.threadId, request.turnId, request.idempotencyKey, request.policyId].allSatisfy({ UUID(uuidString: $0) != nil }),
              ["zh", "en", "es", "ru", "ar"].contains(request.locale),
              !request.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              request.text.utf16.count <= 4000, !request.text.contains("\u{0000}") else { return false }
        if mode == .grounded {
            guard request.city.map(NativeKnowledgeSelection.cities.contains) == true, ["zh", "en"].contains(request.locale) else { return false }
        } else if request.city != nil { return false }
        if mode == .currentInput { return request.serviceTask == nil }
        guard let task = request.serviceTask, UUID(uuidString: task.id) != nil, task.scopeVersion == 1 else { return false }
        if task.relationship == "new_goal" { return task.parentTurnId == nil }
        return ["clarification", "repair"].contains(task.relationship)
            && task.parentTurnId.flatMap(UUID.init(uuidString:)) != nil
            && task.parentTurnId != request.turnId
    }
}

/// A bounded response window is not proof that a task's entire chain is present.
struct NativeTaskChain {
    let turns: [NativeTextTurn]
    init?(containing latest: NativeTextTurn, history: [NativeTextTurn]) {
        guard latest.validTask else { return nil }
        let members = history.filter { $0.serviceTaskId == latest.serviceTaskId }
        guard !members.isEmpty, members.count <= 4, members.allSatisfy({ $0.valid && $0.validTask && $0.threadId == latest.threadId }),
              Set(members.map(\.id)).count == members.count,
              members.filter({ $0.relationship == "new_goal" }).count == 1,
              let root = members.first(where: { $0.relationship == "new_goal" }) else { return nil }
        var ordered = [root]
        while ordered.count < members.count {
            guard let previous = ordered.last else { return nil }
            let children = members.filter { $0.parentTurnId == previous.id }
            guard children.count == 1, let next = children.first,
                  !ordered.contains(where: { $0.id == next.id }),
                  (next.relationship == "clarification" && previous.outcome == .clarification)
                    || (next.relationship == "repair" && previous.outcome == .technicalFailure) else { return nil }
            ordered.append(next)
        }
        guard ordered.last?.id == latest.id else { return nil }
        turns = ordered
    }
}


/// The saved task outcome is immutable; factual projection is revalidated on each read.
struct NativeGroundedResult: Decodable, Equatable {
    let type: String
    let city: String
    let intent: String?
    let requestScope: String?
    let unansweredNeeds: [String]?
    let placeSubjectId: String?
    let placeName: String?
    let placeResolution: String?
    let originalOutcome: String?
    let completedAt: String?
    let projection: String
    let knowledge: NativeKnowledgeRead?

    func lifetime(for turn: NativeTextTurn, elapsed: TimeInterval) throws -> TimeInterval {
        guard type == "reviewed_answer", NativeKnowledgeSelection.cities.contains(city),
              ["zh", "en"].contains(turn.locale), turn.validTask,
              originalOutcome == turn.outcome?.rawValue, elapsed.isFinite, elapsed >= 0, elapsed < 30 else {
            throw NativeDataError.invalidResponse
        }
        if placeSubjectId != nil || placeName != nil || placeResolution != nil {
            guard let placeName, !placeName.isEmpty, placeName.utf16.count <= 160, turn.input.contains(placeName), completedAt != nil else { throw NativeDataError.invalidResponse }
            if placeResolution == "matched" {
                guard let intent, NativeKnowledgeAnswer.isPlace(intent), NativeKnowledgeAnswer.definition(intent, subjectId: placeSubjectId) != nil else { throw NativeDataError.invalidResponse }
            } else {
                guard placeSubjectId == nil, (placeResolution == "ambiguous" && intent == "clarification") || (placeResolution == "unavailable" && intent == "unsupported") else { throw NativeDataError.invalidResponse }
            }
        }
        if let unansweredNeeds {
            guard completedAt != nil, unansweredNeeds.count <= 6,
                  Set(unansweredNeeds).count == unansweredNeeds.count,
                  (requestScope == "additional_needs") == !unansweredNeeds.isEmpty,
                  unansweredNeeds.allSatisfy({ !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                      && $0.unicodeScalars.count <= 240 && !$0.contains("\0") && turn.input.contains($0) }) else {
                throw NativeDataError.invalidResponse
            }
        }
        if completedAt == nil {
            guard intent == nil, requestScope == nil, originalOutcome == nil, knowledge == nil,
                  projection == "pending", turn.output == nil else { throw NativeDataError.invalidResponse }
            return 30 - elapsed
        }
        guard completedAt.flatMap(NativeKnowledgeRead.date) != nil, turn.output == "reviewed-answer-v1",
              ["current", "unavailable"].contains(projection) else { throw NativeDataError.invalidResponse }
        if let intent, let definition = NativeKnowledgeAnswer.definition(intent, subjectId: placeSubjectId) {
            guard ["single", "additional_needs"].contains(requestScope ?? ""),
                  ["answered", "partial", "blocked"].contains(originalOutcome ?? ""),
                  requestScope != "additional_needs" || originalOutcome != "answered" else { throw NativeDataError.invalidResponse }
            if projection == "unavailable" {
                guard knowledge == nil else { throw NativeDataError.invalidResponse }
                return 30 - elapsed
            }
            guard let knowledge, !NativeKnowledgeAnswer.isPlace(intent) || placeResolution == "matched" else { throw NativeDataError.invalidResponse }
            return try knowledge.lifetime(for: .init(city: city, scene: definition.scene, locale: turn.locale), elapsed: elapsed, question: true, questionId: intent, subjectId: placeSubjectId)
        }
        let expected = intent == "clarification" ? "clarification" : intent == "technical_failure" ? "technical_failure" : "blocked"
        guard ["clarification", "unsupported", "technical_failure", "blocked"].contains(intent ?? ""),
              requestScope == "unknown", originalOutcome == expected, knowledge == nil,
              projection == "current" else { throw NativeDataError.invalidResponse }
        return 30 - elapsed
    }
}

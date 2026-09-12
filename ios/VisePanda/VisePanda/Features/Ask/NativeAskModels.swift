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

struct NativeTextSubmission: Encodable {
    let threadId: String
    let turnId: String
    let idempotencyKey: String
    let policyId: String
    let locale: String
    let text: String
    var serviceTask: NativeServiceTaskLink? = nil
    func matches(_ turn: NativeTextTurn) -> Bool {
        turnId == turn.turnId && threadId == turn.threadId && locale == turn.locale && text == turn.input
        && (serviceTask == nil || (serviceTask?.id == turn.serviceTaskId
            && serviceTask?.scopeVersion == turn.scopeVersion && serviceTask?.relationship == turn.relationship
            && serviceTask?.parentTurnId == turn.parentTurnId))
    }
}

struct NativeServiceTaskLink: Encodable, Equatable {
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

enum NativeAskMode: String {
    case currentInput = "", taskContext = "task_history_v1", unavailable
    var version: Int { self == .taskContext ? 3 : 1 }
    var base: String { "api/chat/native/v\(version)" }
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

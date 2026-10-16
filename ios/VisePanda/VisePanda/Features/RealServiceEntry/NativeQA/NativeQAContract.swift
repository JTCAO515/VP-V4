import Foundation

struct NativeQASession: Decodable, Identifiable, Equatable {
    let id: String
    let label: String
    let createdAt: String
    let updatedAt: String
    var valid: Bool { NativeQAWire.uuid(id) && !createdAt.isEmpty && !updatedAt.isEmpty && label.utf16.count <= 200 }
}

struct NativeQAPolicy: Decodable, Equatable {
    enum Consent: String, Decodable { case notAccepted = "not_accepted", accepted, withdrawn }
    let id: String
    let noticeHash: String
    let noticeZh: String
    let noticeEn: String
    let provider: String
    let recipient: String
    let consentState: Consent
    let contextMode: String
    let maxTurns: Int?
    var valid: Bool {
        NativeQAWire.uuid(id) && NativeQAWire.hash(noticeHash)
        && [noticeZh, noticeEn, provider, recipient].allSatisfy { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && $0.utf16.count <= 16000 }
        && (contextMode == "qa_session_history_v1" ? maxTurns == 8 : contextMode == "current_input_v1" && maxTurns == nil)
    }
}

struct NativeQAMessage: Decodable, Identifiable, Equatable {
    enum Status: String, Decodable {
        case pending, reconciliationRequired = "reconciliation_required", answered, partial, clarification, blocked
        case technicalFailure = "technical_failure"
        var waiting: Bool { self == .pending || self == .reconciliationRequired }
    }
    let requestId: String
    let turnId: String
    let sessionId: String
    let input: String
    let text: String?
    let status: Status
    let createdAt: String
    var id: String { requestId }
    func valid(sessionID: String) -> Bool {
        guard NativeQAWire.uuid(requestId), turnId == requestId, sessionId == sessionID,
              !input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, input.utf16.count <= 4000,
              !createdAt.isEmpty else { return false }
        if let text, text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || text.utf16.count > 8000 { return false }
        if status.waiting { return text == nil }
        if [.answered, .partial, .clarification].contains(status) { return text != nil }
        return true
    }
}

/// Immutable command data only. Persistence is supplied by the original session/journal owner.
struct NativeQAPending: Codable, Equatable {
    let schemaVersion: Int
    let endpoint: String
    let subject: String
    let mobileEpoch: Int
    let sessionID: String
    let requestID: String
    let policyID: String
    let noticeHash: String
    let body: Data

    init(scope: NativeDataScope, sessionID: String, policy: NativeQAPolicy, text: String) throws {
        let requestID = UUID().uuidString.lowercased()
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        body = try encoder.encode(Submission(requestId: requestID, text: text))
        schemaVersion = 1; endpoint = scope.endpoint; subject = scope.subject; mobileEpoch = scope.mobileEpoch
        self.sessionID = sessionID; self.requestID = requestID; policyID = policy.id; noticeHash = policy.noticeHash
        guard valid else { throw NativeQAError.invalidResponse }
    }
    private struct Submission: Codable { let requestId: String; let text: String }
    var originalText: String? { try? JSONDecoder().decode(Submission.self, from: body).text }
    var valid: Bool {
        guard schemaVersion == 1, mobileEpoch > 0, !endpoint.isEmpty, !subject.isEmpty,
              NativeQAWire.uuid(sessionID), NativeQAWire.uuid(requestID), NativeQAWire.uuid(policyID), NativeQAWire.hash(noticeHash),
              body.count <= 32768,
              let value = try? JSONDecoder().decode(Submission.self, from: body), value.requestId == requestID,
              let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any], Set(object.keys) == ["requestId", "text"] else { return false }
        return !value.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && value.text.utf16.count <= 4000
    }
    func matches(_ scope: NativeDataScope) -> Bool {
        valid && endpoint == scope.endpoint && subject == scope.subject && mobileEpoch == scope.mobileEpoch
    }
}

struct NativeQAHTTPResponse { let status: Int; let body: Data }

enum NativeQARequest {
    case policy, sessions, createSession
    case consent(policyID: String, noticeHash: String)
    case history(sessionID: String)
    case recover(sessionID: String, requestID: String)
    case submit(NativeQAPending)

    var method: String {
        switch self { case .consent, .createSession, .submit: "POST"; default: "GET" }
    }
    var path: String {
        get throws {
            let base = "api/qa-agent/native/v1"
            func session(_ id: String) throws -> String {
                guard NativeQAWire.uuid(id) else { throw NativeQAError.invalidResponse }
                return base + "/sessions/" + id
            }
            switch self {
            case .policy: return base + "/policy"
            case .consent: return base + "/consent"
            case .sessions, .createSession: return base + "/sessions"
            case .history(let id): return try session(id)
            case .recover(let id, let request):
                guard NativeQAWire.uuid(request) else { throw NativeQAError.invalidResponse }
                return try session(id) + "/messages/" + request
            case .submit(let pending):
                guard pending.valid else { throw NativeQAError.invalidResponse }
                return try session(pending.sessionID) + "/messages"
            }
        }
    }
    var body: Data? {
        get throws {
            switch self {
            case .createSession: return Data("{}".utf8)
            case .consent(let id, let hash):
                guard NativeQAWire.uuid(id), NativeQAWire.hash(hash) else { throw NativeQAError.invalidResponse }
                return try JSONSerialization.data(withJSONObject: ["policyId": id, "noticeHash": hash], options: [.sortedKeys])
            case .submit(let pending):
                guard pending.valid else { throw NativeQAError.invalidResponse }
                return pending.body
            default: return nil
            }
        }
    }
}

@MainActor
protocol NativeQATransport {
    var scope: NativeDataScope? { get }
    /// Main supplies original cookie-disabled Bearer transport; check scope before/after every await.
    func request(_ request: NativeQARequest, scope: NativeDataScope) async throws -> NativeQAHTTPResponse
    /// Original authority must persist and physically read back exact bytes before returning.
    func loadPending(scope: NativeDataScope) throws -> NativeQAPending?
    func retainPending(_ pending: NativeQAPending, scope: NativeDataScope) throws
    /// Compare exact command bytes/identity before clearing. Never clear on absent history or 403.
    func clearPending(_ pending: NativeQAPending, scope: NativeDataScope) throws
}

enum NativeQAError: Error {
    case invalidResponse, stale, journalUnavailable
    case server(code: String, ack: String)
}

enum NativeQAWire {
    static func uuid(_ value: String) -> Bool {
        value.range(of: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$", options: .regularExpression) != nil
    }
    static func hash(_ value: String) -> Bool { value.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil }
    static func decode<T: Decodable>(_ type: T.Type, response: NativeQAHTTPResponse) throws -> T {
        guard response.body.count <= 1_000_000 else { throw NativeQAError.invalidResponse }
        let decoder = JSONDecoder()
        let envelope = try decoder.decode(Version.self, from: response.body)
        guard envelope.version == "qa-agent/1" else { throw NativeQAError.invalidResponse }
        if !(200..<300).contains(response.status) {
            let failure = try decoder.decode(Failure.self, from: response.body)
            guard ["INVALID_INPUT", "UNAUTHENTICATED", "FORBIDDEN", "DATA_POLICY_BLOCKED", "IDEMPOTENCY_KEY_REUSE", "QA_CONTEXT_LIMIT", "PROVIDER_UNAVAILABLE"].contains(failure.error.code),
                  ["unknown", "not_submitted"].contains(failure.error.ack) else { throw NativeQAError.invalidResponse }
            throw NativeQAError.server(code: failure.error.code, ack: failure.error.ack)
        }
        return try decoder.decode(type, from: response.body)
    }
    private struct Version: Decodable { let version: String }
    private struct Failure: Decodable {
        struct Detail: Decodable { let code: String; let ack: String }
        let error: Detail
    }
    struct Policy: Decodable { let policy: NativeQAPolicy }
    struct Sessions: Decodable { let sessions: [NativeQASession] }
    struct Created: Decodable { let session: NativeQASession }
    struct History: Decodable { let session: NativeQASession; let messages: [NativeQAMessage]; let historyLimit: Int; let policy: NativeQAPolicy }
    struct Message: Decodable { let message: NativeQAMessage }
    struct Accepted: Decodable { let requestId: String; let turnId: String; let sessionId: String; let status: String; let reused: Bool }
}

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
    var id: String { turnId }
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
struct NativeTextAccepted: Decodable { let version: Int; let kind: String; let turnId: String; let reused: Bool }
struct NativeTextAction: Decodable { let version: Int; let kind: String }

struct NativeTextSubmission: Encodable {
    let threadId: String
    let turnId: String
    let idempotencyKey: String
    let policyId: String
    let locale: String
    let text: String
}

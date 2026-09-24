import Foundation
import Observation

struct NativeTranslationSubmission: Encodable, Equatable {
    let threadId: String
    let turnId: String
    let idempotencyKey: String
    let policyId: String
    let sourceLocale: String
    let targetLocale: String
    let text: String
}

struct NativeTranslationPhrase: Decodable, Identifiable, Equatable {
    let turnId: String
    let sourceLocale: String
    let targetLocale: String
    let original: String
    let state: String
    let translation: String?
    let backTranslation: String?
    var id: String { turnId }
    var valid: Bool {
        UUID(uuidString: turnId) != nil && ["zh", "en"].contains(sourceLocale)
        && ["zh", "en"].contains(targetLocale) && sourceLocale != targetLocale
        && !original.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && original.utf16.count <= 600
        && ["pending", "cancelled", "unavailable", "needs_review", "translated"].contains(state)
        && (state == "translated"
            ? [translation, backTranslation].allSatisfy { value in
                guard let value else { return false }
                return !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && value.utf16.count <= 2400
            }
            : translation == nil && backTranslation == nil)
    }
}
private struct NativeTranslationHistory: Decodable {
    let version: Int
    let kind: String
    let phrases: [NativeTranslationPhrase]
}

/// Only the active actor's last server-read phrases are kept in memory. No private
/// history is used as model context; loading saved results never requests a model.
@MainActor @Observable
final class NativeTranslationStore {
    typealias Request = (_ path: String, _ method: String, _ body: Data?) async throws -> Data
    private(set) var scope: NativeDataScope?
    private(set) var policy: NativeTextPolicy?
    private(set) var phrases: [NativeTranslationPhrase] = []
    private(set) var pending: NativeTranslationSubmission?
    private(set) var busy = false
    private(set) var errorCode: String?
    private var generation = UUID()
    private var pendingNotice: String?

    func clear() {
        generation = UUID(); scope = nil; policy = nil; phrases = []; pending = nil
        pendingNotice = nil; busy = false; errorCode = nil
    }

    func load(scope: NativeDataScope?, request: Request) async {
        if self.scope != scope { clear(); self.scope = scope }
        guard scope != nil, !busy else { return }
        let own = generation
        busy = true; errorCode = nil
        defer { if own == generation { busy = false } }
        do { try await refresh(own: own, request: request) }
        catch { failed(error, own: own) }
    }

    func consent(accept: Bool, request: Request) async {
        guard scope != nil, !busy, let policy else { return }
        let own = generation
        busy = true; errorCode = nil
        defer { if own == generation { busy = false } }
        // Hide cached text immediately when the user withdraws its governing consent.
        if !accept { phrases = []; pending = nil; pendingNotice = nil; self.policy = nil }
        do {
            let body = accept ? ["policyId": policy.id, "noticeHash": policy.noticeHash] : ["policyId": policy.id]
            _ = try await request("api/translate/consent", accept ? "POST" : "DELETE", JSONEncoder().encode(body))
            try await refresh(own: own, request: request)
        } catch { failed(error, own: own) }
    }

    func submit(text: String, sourceLocale: String, request: Request) async {
        guard scope != nil, !busy, let policy, policy.valid, policy.consentState == .accepted,
              ["zh", "en"].contains(sourceLocale), !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              text.utf16.count <= 600 else { return }
        let own = generation
        let submission = pending ?? NativeTranslationSubmission(threadId: UUID().uuidString.lowercased(), turnId: UUID().uuidString.lowercased(),
            idempotencyKey: UUID().uuidString.lowercased(), policyId: policy.id, sourceLocale: sourceLocale,
            targetLocale: sourceLocale == "zh" ? "en" : "zh", text: text)
        guard submission.text == text, submission.sourceLocale == sourceLocale, submission.policyId == policy.id,
              pending == nil || pendingNotice == policy.noticeHash else { errorCode = "PENDING_REQUEST"; return }
        pending = submission; pendingNotice = policy.noticeHash
        busy = true; errorCode = nil
        defer { if own == generation { busy = false } }
        do {
            let data = try await request("api/translate", "POST", JSONEncoder().encode(submission))
            try check(own)
            let accepted = try JSONDecoder().decode(NativeTextAccepted.self, from: data)
            guard accepted.version == 1, accepted.kind == "accepted", accepted.turnId == submission.turnId else { throw NativeDataError.invalidResponse }
            try await refresh(own: own, request: request)
        } catch { failed(error, own: own) }
    }

    func cancel(request: Request) async {
        guard scope != nil, !busy, let pending else { return }
        let own = generation
        busy = true; errorCode = nil
        defer { if own == generation { busy = false } }
        do {
            _ = try await request("api/translate/turns/\(pending.turnId)/cancel", "POST", Data("{}".utf8))
            try check(own)
            self.pending = nil; pendingNotice = nil
            try await refresh(own: own, request: request)
        } catch { failed(error, own: own) }
    }

    private func refresh(own: UUID, request: Request) async throws {
        let data = try await request("api/translate/policy", "GET", nil)
        try check(own)
        let reply = try JSONDecoder().decode(NativeTextPolicyReply.self, from: data)
        guard reply.version == 1, reply.kind == "policy", reply.policy.valid else { throw NativeDataError.invalidResponse }
        if policy?.id != reply.policy.id || policy?.noticeHash != reply.policy.noticeHash { phrases = [] }
        policy = reply.policy
        if let pending, pending.policyId != reply.policy.id || pendingNotice != reply.policy.noticeHash {
            self.pending = nil; pendingNotice = nil
        }
        guard reply.policy.consentState == .accepted else { phrases = []; pending = nil; pendingNotice = nil; return }
        let historyData = try await request("api/translate", "GET", nil)
        try check(own)
        let history = try JSONDecoder().decode(NativeTranslationHistory.self, from: historyData)
        guard history.version == 1, history.kind == "translations", history.phrases.count <= 20,
              history.phrases.allSatisfy(\.valid), Set(history.phrases.map(\.id)).count == history.phrases.count else { throw NativeDataError.invalidResponse }
        phrases = history.phrases
        if let pending, let phrase = phrases.first(where: { $0.id == pending.turnId }), phrase.state != "pending" {
            self.pending = nil; pendingNotice = nil
        }
    }
    private func check(_ own: UUID) throws {
        guard own == generation, !Task.isCancelled else { throw CancellationError() }
    }
    private func failed(_ error: Error, own: UUID) {
        guard own == generation, !Task.isCancelled else { return }
        if case NativeDataError.server(let code) = error {
            errorCode = code
            if code == "INVALID_INPUT" { pending = nil; pendingNotice = nil }
            if ["DATA_POLICY_BLOCKED", "UNAUTHENTICATED", "FORBIDDEN"].contains(code) { policy = nil; phrases = []; pending = nil; pendingNotice = nil }
        } else { errorCode = "PROVIDER_UNAVAILABLE" }
    }
}

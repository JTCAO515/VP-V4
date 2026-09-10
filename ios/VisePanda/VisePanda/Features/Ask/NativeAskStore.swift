import Foundation
import Observation

@MainActor
@Observable
final class NativeAskStore {
    private(set) var policy: NativeTextPolicy?
    private(set) var turns: [NativeTextTurn] = []
    private(set) var busy = false
    private(set) var notice: String?
    private(set) var scope: NativeDataScope?
    private(set) var pending: NativeTextSubmission?
    var draft = ""
    private var operation: UUID?
    private let base = "api/chat/native/v1"
    private struct Context { let scope: NativeDataScope; let token: UUID }

    var pollKey: String { turns.filter(\.waiting).map(\.id).sorted().joined(separator: ":") }
    var canSend: Bool {
        policy?.consentState == .accepted && !busy
        && !(pending?.text ?? draft).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        && (pending?.text ?? draft).utf16.count <= 4000
    }

    func reset(for next: NativeDataScope?) {
        guard scope != next else { return }
        scope = next; operation = nil; policy = nil; turns = []; pending = nil; draft = ""; busy = false; notice = nil
    }

    /// Hide read results and invalidate in-flight operations without discarding
    /// a same-account unsent draft during temporary authentication loss.
    func suspendReads() {
        operation = nil; busy = false; policy = nil; turns = []; notice = nil
    }

    func reload(using session: NativeSession) async {
        await perform(session) { current in try await self.load(session, current) }
    }

    func accept(reviewed: NativeTextPolicy, using session: NativeSession) async {
        guard reviewed == policy, reviewed.consentState == .notAccepted else { return }
        await perform(session) { current in
            guard self.policy == reviewed else { throw NativeDataError.staleSessionResponse }
            let reply: NativeTextAction = try await self.call(session, current, suffix: "/consent", method: "POST", body: ["policyId": reviewed.id, "noticeHash": reviewed.noticeHash])
            guard reply.version == 1 && reply.kind == "accepted" else { throw NativeDataError.invalidResponse }
            try await self.load(session, current)
        }
    }

    func withdraw(using session: NativeSession) async {
        guard let policy else { return }
        await perform(session) { current in
            guard self.policy == policy else { throw NativeDataError.staleSessionResponse }
            let reply: NativeTextAction = try await self.call(session, current, suffix: "/consent", method: "DELETE", body: ["policyId": policy.id])
            guard reply.version == 1 && reply.kind == "withdrawn" else { throw NativeDataError.invalidResponse }
            self.turns = []; self.pending = nil; self.draft = ""
            try await self.load(session, current)
        }
    }

    func send(locale: String, using session: NativeSession) async {
        guard canSend, let policy else { return }
        await perform(session) { current in
            guard self.policy == policy else { throw NativeDataError.staleSessionResponse }
            if self.pending == nil {
                self.pending = NativeTextSubmission(threadId: UUID().uuidString.lowercased(), turnId: UUID().uuidString.lowercased(), idempotencyKey: UUID().uuidString.lowercased(), policyId: policy.id, locale: locale, text: self.draft)
            }
            guard let pending = self.pending, pending.policyId == policy.id else { throw NativeDataError.invalidResponse }
            let body = try JSONEncoder().encode(pending)
            let data = try await session.askRequest(path: self.base + "/turns", method: "POST", body: body)
            try self.ensure(session, current)
            let accepted = try JSONDecoder().decode(NativeTextAccepted.self, from: data)
            guard accepted.version == 1 && accepted.kind == "accepted" && accepted.turnId == pending.turnId else { throw NativeDataError.invalidResponse }
            self.pending = nil; self.draft = ""
            try await self.load(session, current)
        }
    }

    func cancel(_ turn: NativeTextTurn, using session: NativeSession) async {
        guard turns.contains(where: { $0.id == turn.id && $0.waiting }) else { return }
        await perform(session) { current in
            guard self.turns.contains(where: { $0.id == turn.id && $0.waiting }) else { throw NativeDataError.staleSessionResponse }
            let reply: NativeTextAction = try await self.call(session, current, suffix: "/turns/" + turn.id + "/cancel", method: "POST", body: [:])
            guard reply.version == 1 && reply.kind == "cancelled" else { throw NativeDataError.invalidResponse }
            try await self.load(session, current)
        }
    }

    private func load(_ session: NativeSession, _ current: Context) async throws {
        let policy: NativeTextPolicyReply = try await call(session, current, suffix: "/policy", method: "GET")
        guard policy.version == 1 && policy.kind == "policy" && policy.policy.valid else { throw NativeDataError.invalidResponse }
        let history: NativeTextHistory = try await call(session, current, suffix: "/turns", method: "GET")
        guard history.version == 1 && history.kind == "history" && history.turns.count <= 20
            && history.turns.allSatisfy(\.valid) && Set(history.turns.map(\.id)).count == history.turns.count else { throw NativeDataError.invalidResponse }
        try ensure(session, current)
        self.policy = policy.policy
        turns = history.turns
        if let pending, turns.contains(where: { $0.id == pending.turnId }) { self.pending = nil; draft = "" }
    }

    private func call<T: Decodable>(_ session: NativeSession, _ current: Context, suffix: String, method: String, body: [String: String]? = nil) async throws -> T {
        let data = try await session.askRequest(path: base + suffix, method: method, body: body.map { try JSONEncoder().encode($0) })
        try ensure(session, current)
        return try JSONDecoder().decode(T.self, from: data)
    }
    private func ensure(_ session: NativeSession, _ current: Context) throws {
        guard !Task.isCancelled, operation == current.token, scope == current.scope, session.dataScope == current.scope else { throw NativeDataError.staleSessionResponse }
    }
    private func perform(_ session: NativeSession, action: (Context) async throws -> Void) async {
        reset(for: session.retainedDataScope)
        guard session.dataScope != nil else { suspendReads(); return }
        guard !busy, let current = scope, session.dataScope == current else { return }
        let token = UUID(); operation = token; busy = true; notice = nil
        defer { if operation == token { busy = false; operation = nil } }
        do { try await action(Context(scope: current, token: token)) }
        catch {
            guard operation == token, scope == current else { return }
            guard session.dataScope == current else { reset(for: session.retainedDataScope); suspendReads(); return }
            guard !Task.isCancelled else { return }
            // Hide previously returned bodies after any failed policy/session refresh.
            policy = nil; turns = []
            if case NativeDataError.server(let code) = error { notice = code } else { notice = "retry" }
        }
    }
}

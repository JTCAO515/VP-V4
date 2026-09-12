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
    let mode: NativeAskMode
    private var base: String { mode.base }
    enum Intent: Equatable {
        case restoring, newGoal, awaiting(String), continuation(NativeTextTurn), blocked
    }
    private(set) var intent: Intent
    private var boundNotice: String?
    private var pendingNotice: String?
    private var pendingAcknowledged = false
    init(mode: NativeAskMode = .currentInput) {
        self.mode = mode
        intent = mode == .taskContext ? .restoring : .newGoal
    }
    var noticeIdentity: String? {
        policy.map { "\(mode.rawValue):\($0.id):\($0.noticeVersion):\($0.noticeHash)" }
    }
    var canStartNew: Bool {
        guard mode == .taskContext, !busy, pending == nil, policy?.consentState == .accepted else { return false }
        if case .awaiting = intent { return false }
        return intent != .restoring
    }
    var hasObsoletePending: Bool {
        pending != nil && noticeIdentity != nil && pendingNotice != noticeIdentity
    }
    /// Stop the old policy before releasing an uncertain request. Never rebind it.
    func stopPreviousRequest(using session: NativeSession) async {
        guard hasObsoletePending, let pending else { return }
        await perform(session) { current in
            let reply: NativeTextAction = try await self.call(session, current, suffix: "/consent", method: "DELETE", body: ["policyId": pending.policyId])
            guard reply.version == self.mode.version, reply.kind == "withdrawn" else { throw NativeDataError.invalidResponse }
            try session.clearPendingAsk(matching: pending)
            self.pending = nil; self.pendingNotice = nil; self.pendingAcknowledged = false; self.draft = ""; self.intent = .blocked
            try await self.load(session, current)
        }
    }
    func startNewQuestion() {
        guard canStartNew else { return }
        intent = .newGoal; draft = ""
    }
    var intentLabel: String {
        switch intent {
        case .restoring: return "ask.task.restoring"
        case .newGoal: return "ask.task.new"
        case .awaiting: return "ask.local.waiting"
        case .continuation(let turn): return turn.outcome == .clarification ? "ask.task.clarification" : "ask.task.repair"
        case .blocked: return "ask.task.finished"
        }
    }
    private struct Context { let scope: NativeDataScope; let token: UUID }

    var pollKey: String {
        if case .awaiting(let id) = intent { return id }
        return turns.filter(\.waiting).map(\.id).sorted().joined(separator: ":")
    }
    private var permitsSubmission: Bool {
        if mode == .currentInput && pending == nil { return true }
        if pending != nil { return pending?.policyId == policy?.id && pendingNotice == noticeIdentity }
        switch intent { case .newGoal, .continuation: return true; default: return false }
    }
    var canSend: Bool {
        !pendingAcknowledged && mode != .unavailable && permitsSubmission && policy?.consentState == .accepted && !busy
        && !(pending?.text ?? draft).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        && (pending?.text ?? draft).utf16.count <= 4000
    }

    func reset(for next: NativeDataScope?) {
        guard scope != next else { return }
        intent = mode == .taskContext ? .restoring : .newGoal; boundNotice = nil; pendingNotice = nil; pendingAcknowledged = false
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
            guard reply.version == self.mode.version && reply.kind == "accepted" else { throw NativeDataError.invalidResponse }
            try await self.load(session, current)
        }
    }

    func withdraw(using session: NativeSession) async {
        guard let policy else { return }
        await perform(session) { current in
            guard self.policy == policy else { throw NativeDataError.staleSessionResponse }
            let reply: NativeTextAction = try await self.call(session, current, suffix: "/consent", method: "DELETE", body: ["policyId": policy.id])
            guard reply.version == self.mode.version && reply.kind == "withdrawn" else { throw NativeDataError.invalidResponse }
            self.turns = []; self.draft = ""; self.intent = .restoring
            if let pending = self.pending, pending.policyId == policy.id {
                try session.clearPendingAsk(matching: pending)
                self.pending = nil; self.pendingNotice = nil; self.pendingAcknowledged = false
            }
            try await self.load(session, current)
        }
    }

    func send(locale: String, using session: NativeSession) async {
        guard canSend, let policy else { return }
        await perform(session) { current in
            guard self.policy == policy else { throw NativeDataError.staleSessionResponse }
            if self.pending == nil {
                var request = NativeTextSubmission(threadId: UUID().uuidString.lowercased(), turnId: UUID().uuidString.lowercased(), idempotencyKey: UUID().uuidString.lowercased(), policyId: policy.id, locale: locale, text: self.draft)
                if self.mode == .taskContext {
                    switch self.intent {
                    case .newGoal:
                        request.serviceTask = NativeServiceTaskLink(id: UUID().uuidString.lowercased(), scopeVersion: 1, relationship: "new_goal", parentTurnId: nil)
                    case .continuation(let parent):
                        guard let taskID = parent.serviceTaskId,
                              let chain = NativeTaskChain(containing: parent, history: self.turns), chain.turns.count < 4 else { throw NativeDataError.invalidResponse }
                        request = NativeTextSubmission(threadId: parent.threadId, turnId: request.turnId, idempotencyKey: request.idempotencyKey, policyId: policy.id, locale: parent.locale, text: self.draft,
                            serviceTask: NativeServiceTaskLink(id: taskID, scopeVersion: 1, relationship: parent.outcome == .clarification ? "clarification" : "repair", parentTurnId: parent.id))
                    default: throw NativeDataError.invalidResponse
                    }
                }
                let retained = try session.retainPendingAsk(request, policy: policy, mode: self.mode)
                self.pendingNotice = retained.noticeIdentity
                self.pending = request
            }
            guard let pending = self.pending, pending.policyId == policy.id,
                  self.pendingNotice == self.noticeIdentity else { throw NativeDataError.invalidResponse }
            _ = try session.retainPendingAsk(pending, policy: policy, mode: self.mode)
            let body = try JSONEncoder().encode(pending)
            let data = try await session.askRequest(path: self.base + "/turns", method: "POST", body: body)
            try self.ensure(session, current)
            let accepted = try JSONDecoder().decode(NativeTextAccepted.self, from: data)
            guard accepted.matches(pending, version: self.mode.version) else { throw NativeDataError.invalidResponse }
            try session.acknowledgePendingAsk(matching: pending)
            self.pendingAcknowledged = true
            self.intent = .awaiting(pending.turnId)
            self.draft = ""
            try await self.load(session, current)
        }
    }

    func cancel(_ turn: NativeTextTurn, using session: NativeSession) async {
        guard turns.contains(where: { $0.id == turn.id && $0.waiting }) else { return }
        await perform(session) { current in
            guard self.turns.contains(where: { $0.id == turn.id && $0.waiting }) else { throw NativeDataError.staleSessionResponse }
            let data = try await session.askRequest(path: "api/chat/native/v1/turns/" + turn.id + "/cancel", method: "POST", body: Data("{}".utf8))
            try self.ensure(session, current)
            let reply = try JSONDecoder().decode(NativeTextAction.self, from: data)
            guard reply.version == 1 && reply.kind == "cancelled" else { throw NativeDataError.invalidResponse }
            try await self.load(session, current)
        }
    }

    private func load(_ session: NativeSession, _ current: Context) async throws {
        let policy: NativeTextPolicyReply = try await call(session, current, suffix: "/policy", method: "GET")
        guard policy.version == mode.version && policy.kind == "policy" && policy.policy.valid else { throw NativeDataError.invalidResponse }
        let history: NativeTextHistory = try await call(session, current, suffix: "/turns", method: "GET")
        guard history.version == mode.version && history.kind == "history" && history.turns.count <= 20
            && history.turns.allSatisfy(\.valid) && Set(history.turns.map(\.id)).count == history.turns.count else { throw NativeDataError.invalidResponse }
        try ensure(session, current)
        let identity = "\(mode.rawValue):\(policy.policy.id):\(policy.policy.noticeVersion):\(policy.policy.noticeHash)"
        let changed = boundNotice != nil && boundNotice != identity
        self.policy = policy.policy
        boundNotice = identity
        if changed { draft = ""; intent = .blocked }
        if policy.policy.consentState != .accepted {
            turns = []
            if policy.policy.consentState == .withdrawn {
                if let pending, pending.policyId == policy.policy.id {
                    try session.clearPendingAsk(matching: pending)
                    self.pending = nil; pendingNotice = nil; pendingAcknowledged = false
                }
                draft = ""; intent = .blocked
            }
            return
        }
        guard mode != .taskContext || history.turns.allSatisfy(\.validTask) else { throw NativeDataError.invalidResponse }
        turns = history.turns
        if let pending {
            // History is scoped by the current policy RPC, never by turn ID alone.
            guard !changed, pendingNotice == identity, pending.policyId == policy.policy.id else { draft = ""; intent = .blocked; return }
            if let recovered = turns.first(where: { $0.id == pending.turnId }) {
                guard pending.matches(recovered) else { throw NativeDataError.invalidResponse }
                try session.clearPendingAsk(matching: pending)
                self.pending = nil; pendingNotice = nil; pendingAcknowledged = false; draft = ""
                intent = mode == .taskContext ? .awaiting(recovered.id) : .newGoal
            } else {
                draft = pendingAcknowledged ? "" : pending.text
                if pendingAcknowledged { intent = .awaiting(pending.turnId) }
                return
            }
        }
        guard mode == .taskContext else { return }
        // A deliberate new question is not replaced by a late result from an old task.
        if intent == .newGoal || changed { return }
        let latest: NativeTextTurn?
        if case .awaiting(let id) = intent {
            latest = turns.first(where: { $0.id == id })
            guard latest != nil else { return }
        } else {
            latest = turns.max { ($0.createdAt, $0.id) < ($1.createdAt, $1.id) }
        }
        guard let latest else { intent = .newGoal; return }
        guard let chain = NativeTaskChain(containing: latest, history: turns) else { intent = .blocked; return }
        if latest.waiting { intent = .awaiting(latest.id) }
        else if chain.turns.count < 4 && [.clarification, .technicalFailure].contains(latest.outcome) {
            let isNewSelection = intent != .continuation(latest)
            intent = .continuation(latest)
            if isNewSelection && latest.outcome == .technicalFailure { draft = latest.input }
        } else { intent = .blocked }
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
        guard mode == session.askMode, mode != .unavailable else { notice = "unavailable"; return }
        guard session.dataScope != nil else { suspendReads(); return }
        guard !busy, let current = scope, session.dataScope == current else { return }
        let token = UUID(); operation = token; busy = true; notice = nil
        defer { if operation == token { busy = false; operation = nil } }
        do {
            if pending == nil, let retained = try session.retainedPendingAsk() {
                pending = retained.request; pendingNotice = retained.noticeIdentity; pendingAcknowledged = retained.acknowledged
            }
            try await action(Context(scope: current, token: token))
        }
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

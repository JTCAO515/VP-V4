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
    var city = "shanghai"
    private var groundedDeadline: TimeInterval = 0
    var groundedCurrent: Bool { mode != .grounded || ProcessInfo.processInfo.systemUptime < groundedDeadline }
    var groundedRefreshDelay: TimeInterval {
        // Revalidate before the read lease ends so ordinary network latency does
        // not blank a card being read. This never extends its visibility deadline.
        let lead: TimeInterval = policy?.consentState == .accepted ? 5 : 0
        return max(1, groundedDeadline - ProcessInfo.processInfo.systemUptime - lead)
    }
    private var operation: UUID?
    private var eventRead: UUID?
    private var eventCursors: [String: Int] = [:]
    enum AiAssistState: Equatable { case loading, done(NativeAiAssistStatus), error }
    private(set) var aiAssist: [String: AiAssistState] = [:]
    private var aiAssistTokens: [String: UUID] = [:]
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
        intent = mode.usesTask ? .restoring : .newGoal
    }
    var noticeIdentity: String? {
        policy.map { "\(mode.rawValue):\($0.id):\($0.noticeVersion):\($0.noticeHash)" }
    }
    var canStartNew: Bool {
        guard mode.usesTask, !busy, pending == nil, policy?.consentState == .accepted else { return false }
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
    var hasWaitingTurn: Bool { turns.contains(where: \.waiting) }
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
        intent = mode.usesTask ? .restoring : .newGoal; boundNotice = nil; pendingNotice = nil; pendingAcknowledged = false
        groundedDeadline = 0
        eventRead = nil; eventCursors = [:]
        aiAssist = [:]; aiAssistTokens = [:]
        scope = next; operation = nil; policy = nil; turns = []; pending = nil; draft = ""; busy = false; notice = nil
    }

    /// Hide read results and invalidate in-flight operations without discarding
    /// a same-account unsent draft during temporary authentication loss.
    func suspendReads() {
        groundedDeadline = 0
        eventRead = nil
        aiAssist = [:]; aiAssistTokens = [:]
        operation = nil; busy = false; policy = nil; turns = []; notice = nil
    }

    /// Real-time, non-persisted, user-triggered supplement (VPJ-76 slice 9),
    /// offered only under a turn the reviewed resolver itself judged
    /// 'blocked'. Deliberately outside `perform()` -- like `receiveEvents`,
    /// it must not hold the store's single `busy` operation slot for the
    /// several seconds a real agentic search round trip can take, or every
    /// other Ask action (send, cancel, reload) would freeze for its duration.
    /// One in-flight run per turn, fenced by its own token map rather than
    /// `operation`/`ensure()`, exactly like `eventRead` fences `receiveEvents`.
    func runAiAssist(_ turnId: String, using session: NativeSession) async {
        guard mode == .grounded, !busy, UUID(uuidString: turnId) != nil,
              turns.contains(where: { $0.id == turnId }), let current = scope, session.dataScope == current else { return }
        let token = UUID(); aiAssistTokens[turnId] = token
        aiAssist[turnId] = .loading
        for _ in 0..<20 {
            guard !Task.isCancelled, aiAssistTokens[turnId] == token, scope == current, session.dataScope == current else { return }
            do {
                let data = try await session.askRequest(path: base + "/turns/\(turnId)/ai-assist", method: "POST", body: Data("{}".utf8))
                guard aiAssistTokens[turnId] == token, scope == current, session.dataScope == current else { return }
                let reply = try JSONDecoder().decode(NativeAiAssistReply.self, from: data)
                guard reply.data.valid else { aiAssist[turnId] = .error; return }
                if reply.data.status == "pending" {
                    try await Task.sleep(for: .seconds(1.5))
                    continue
                }
                aiAssist[turnId] = .done(reply.data)
                return
            } catch {
                guard !Task.isCancelled, aiAssistTokens[turnId] == token else { return }
                aiAssist[turnId] = .error
                return
            }
        }
        if aiAssistTokens[turnId] == token { aiAssist[turnId] = .error }
    }

    func reload(using session: NativeSession) async {
        await perform(session) { current in try await self.load(session, current) }
    }

    /// Keep foreground waiting answers live without locking the Cancel action.
    /// A state-changing operation invalidates this read before its first await.
    func receiveEvents(using session: NativeSession) async {
        guard mode == .grounded, !busy, policy?.consentState == .accepted,
              let current = scope, session.dataScope == current,
              let selected = turns.first(where: \.waiting), let identity = noticeIdentity else { return }
        let token = UUID(); eventRead = token
        defer { if eventRead == token { eventRead = nil } }
        do {
            try await session.askEvents(turnId: selected.id, after: eventCursors[selected.id] ?? 0) { frame, elapsed in
                guard !Task.isCancelled, self.eventRead == token, !self.busy,
                      self.scope == current, session.dataScope == current, self.noticeIdentity == identity else { throw NativeDataError.staleSessionResponse }
                if frame.name == "unavailable" { throw NativeDataError.server(code: "DATA_POLICY_BLOCKED") }
                if frame.name == "heartbeat" {
                    struct Heartbeat: Decodable { let afterSequence: Int }
                    let value = try JSONDecoder().decode(Heartbeat.self, from: frame.data)
                    guard frame.id == nil, value.afterSequence == (self.eventCursors[selected.id] ?? 0) else { throw NativeDataError.invalidResponse }
                    return
                }
                let value = try JSONDecoder().decode(NativeAskEvent.self, from: frame.data)
                let cursor = try value.validate(frame: frame, expected: selected.id, cursor: self.eventCursors[selected.id] ?? 0)
                if let turn = value.turn {
                    guard turn.valid, turn.validTask, turn.threadId == selected.threadId,
                          turn.serviceTaskId == selected.serviceTaskId, turn.scopeVersion == selected.scopeVersion,
                          turn.relationship == selected.relationship, turn.parentTurnId == selected.parentTurnId,
                          turn.input == selected.input, turn.locale == selected.locale, turn.result?.city == selected.result?.city,
                          let result = turn.result,
                          let index = self.turns.firstIndex(where: { $0.id == turn.id }) else { throw NativeDataError.invalidResponse }
                    let lifetime = try result.lifetime(for: turn, elapsed: elapsed)
                    // A new card never extends the lease of other visible cards.
                    self.groundedDeadline = min(self.groundedDeadline, ProcessInfo.processInfo.systemUptime + lifetime)
                    self.turns[index] = turn
                    self.reconcileIntent(changed: false)
                }
                // Acknowledge only after complete parsing, validation and atomic application.
                self.eventCursors[selected.id] = cursor
            }
        } catch {
            guard !Task.isCancelled, eventRead == token, scope == current, session.dataScope == current else { return }
            groundedDeadline = 0; policy = nil; turns = []; notice = "retry"
        }
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
                if self.mode.usesTask {
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
                if self.mode == .grounded {
                    if case .continuation(let parent) = self.intent { request.city = parent.result?.city }
                    else { request.city = self.city }
                    guard request.city.map(NativeKnowledgeSelection.cities.contains) == true else { throw NativeDataError.invalidResponse }
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
        let started = ProcessInfo.processInfo.systemUptime
        let history: NativeTextHistory = try await call(session, current, suffix: "/turns", method: "GET")
        guard history.version == mode.version && history.kind == (mode == .grounded ? "grounded_history" : "history") && history.turns.count <= 20
            && history.turns.allSatisfy(\.valid) && Set(history.turns.map(\.id)).count == history.turns.count else { throw NativeDataError.invalidResponse }
        try ensure(session, current)
        let identity = "\(mode.rawValue):\(policy.policy.id):\(policy.policy.noticeVersion):\(policy.policy.noticeHash)"
        let changed = boundNotice != nil && boundNotice != identity
        self.policy = policy.policy
        boundNotice = identity
        if changed { draft = ""; intent = .blocked }
        if policy.policy.consentState != .accepted {
            // Consent screens also need a bounded refresh interval. A zero deadline
            // otherwise polls every second and races the user's acceptance tap.
            if mode == .grounded { groundedDeadline = ProcessInfo.processInfo.systemUptime + max(1, 30 - (ProcessInfo.processInfo.systemUptime - started)) }
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
        guard !mode.usesTask || history.turns.allSatisfy(\.validTask) else { throw NativeDataError.invalidResponse }
        if mode == .grounded {
            var lifetime: TimeInterval = 30
            let elapsed = ProcessInfo.processInfo.systemUptime - started
            for turn in history.turns {
                guard let result = turn.result else { throw NativeDataError.invalidResponse }
                lifetime = min(lifetime, try result.lifetime(for: turn, elapsed: elapsed))
            }
            groundedDeadline = ProcessInfo.processInfo.systemUptime + lifetime
        } else if history.turns.contains(where: { $0.result != nil }) { throw NativeDataError.invalidResponse }
        turns = history.turns
        if let pending {
            // History is scoped by the current policy RPC, never by turn ID alone.
            guard !changed, pendingNotice == identity, pending.policyId == policy.policy.id else { draft = ""; intent = .blocked; return }
            if let recovered = turns.first(where: { $0.id == pending.turnId }) {
                guard pending.matches(recovered) else { throw NativeDataError.invalidResponse }
                try session.clearPendingAsk(matching: pending)
                self.pending = nil; pendingNotice = nil; pendingAcknowledged = false; draft = ""
                intent = mode.usesTask ? .awaiting(recovered.id) : .newGoal
            } else {
                draft = pendingAcknowledged ? "" : pending.text
                if pendingAcknowledged { intent = .awaiting(pending.turnId) }
                return
            }
        }
        reconcileIntent(changed: changed)
    }

    private func reconcileIntent(changed: Bool) {
        guard mode.usesTask else { return }
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
        if mode == .grounded, let city = latest.result?.city { self.city = city }
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
        let token = UUID(); eventRead = nil; operation = token; busy = true; notice = nil
        defer { if operation == token { busy = false; operation = nil } }
        do {
            if pending == nil, let retained = try session.retainedPendingAsk() {
                if mode == .grounded, let city = retained.request.city { self.city = city }
                pending = retained.request; pendingNotice = retained.noticeIdentity; pendingAcknowledged = retained.acknowledged
            }
            try await action(Context(scope: current, token: token))
        }
        catch {
            guard operation == token, scope == current else { return }
            guard session.dataScope == current else { reset(for: session.retainedDataScope); suspendReads(); return }
            guard !Task.isCancelled else { return }
            // Hide previously returned bodies after any failed policy/session refresh.
            groundedDeadline = 0
            policy = nil; turns = []
            if case NativeDataError.server(let code) = error { notice = code } else { notice = "retry" }
        }
    }
}

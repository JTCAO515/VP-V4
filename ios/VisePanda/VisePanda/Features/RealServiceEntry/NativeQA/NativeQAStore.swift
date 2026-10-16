import Foundation
import Observation

@MainActor @Observable
final class NativeQAStore {
    enum State: Equatable { case inactive, signedOut, ready, loading, pending, unknown, unavailable, blocked(String) }
    private(set) var state: State = .inactive
    private(set) var policy: NativeQAPolicy?
    private(set) var sessions: [NativeQASession] = []
    private(set) var messages: [NativeQAMessage] = []
    private(set) var selectedID: String?
    private(set) var pending: NativeQAPending?
    var draft = ""
    private let transport: any NativeQATransport
    private var boundScope: NativeDataScope?
    private var active = false
    private var generation = UUID()
    private var work: Task<Void, Never>?
    init(transport: any NativeQATransport) { self.transport = transport }
    var scope: NativeDataScope? { transport.scope }
    var busy: Bool { work != nil }
    var hasReadableProjection: Bool { active && scope != nil && boundScope == scope }
    var canSend: Bool {
        state == .ready && active && boundScope == scope && scope != nil && !busy && pending == nil && selectedID != nil
        && policy?.consentState == .accepted && !messages.contains { $0.status.waiting }
        && !(policy?.maxTurns.map { messages.count >= $0 } ?? false)
        && !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && draft.utf16.count <= 4000
    }

    /// Cancellation targets come only from the original current protected message projection.
    /// Terminal messages remain eligible for receipt GET; only waiting messages permit a fresh stop.
    func cancellationTarget(for requestID: String) -> NativeQACancellationTarget? {
        guard hasReadableProjection, let scope, let selectedID,
              let message = messages.first(where: { $0.requestId == requestID }),
              message.valid(sessionID: selectedID) else { return nil }
        return .init(scope: scope, sessionID: selectedID, requestID: message.requestId, canRequestStop: message.status.waiting)
    }

    /// Cancels local IO/projections; persisted unknown commands are not erased or reauthorized.
    func invalidate() {
        generation = UUID(); work?.cancel(); work = nil
        policy = nil; sessions = []; messages = []; pending = nil; draft = ""
        active = false; state = .inactive
    }
    func activate(_ visible: Bool) async {
        let previous = boundScope
        invalidate()
        if previous != scope { selectedID = nil }
        boundScope = scope; active = visible
        guard visible else { return }
        guard scope != nil else { state = .signedOut; return }
        await refresh()
    }
    func refresh() async {
        await perform { captured, token in
            let retained = try self.transport.loadPending(scope: captured)
            self.pending = retained
            let policy = try await self.readPolicy(captured, token)
            self.policy = policy
            guard policy.consentState == .accepted else { self.messages = []; self.sessions = []; self.state = .blocked("CONSENT_REQUIRED"); return }
            let list: NativeQAWire.Sessions = try await self.call(.sessions, captured, token)
            guard list.sessions.count <= 200, list.sessions.allSatisfy(\.valid), Set(list.sessions.map(\.id)).count == list.sessions.count else { throw NativeQAError.invalidResponse }
            self.sessions = list.sessions
            if let retained {
                guard retained.policyID == policy.id, retained.noticeHash == policy.noticeHash else { self.state = .blocked("PENDING_NOTICE_CHANGED"); return }
                self.selectedID = retained.sessionID
                try await self.recover(retained, captured, token)
            } else if let selected = self.selectedID {
                try await self.history(selected, captured, token)
            } else { self.state = .ready }
        }
    }
    func select(_ id: String) async {
        guard !busy, pending == nil, sessions.contains(where: { $0.id == id }) else { return }
        selectedID = id; messages = []; draft = ""
        await perform { captured, token in try await self.history(id, captured, token) }
    }
    func createSession() async {
        guard !busy, pending == nil, policy?.consentState == .accepted else { return }
        await perform { captured, token in
            let value: NativeQAWire.Created = try await self.call(.createSession, captured, token)
            guard value.session.valid else { throw NativeQAError.invalidResponse }
            self.selectedID = value.session.id; self.messages = []; self.draft = ""
            self.sessions.removeAll { $0.id == value.session.id }; self.sessions.insert(value.session, at: 0)
            self.state = .ready
        }
    }
    func acceptConsent() async {
        guard let reviewed = policy, !busy else { return }
        await perform { captured, token in
            let current = try await self.readPolicy(captured, token)
            guard current.id == reviewed.id, current.noticeHash == reviewed.noticeHash else { self.policy = current; self.state = .blocked("NOTICE_CHANGED"); return }
            let value: NativeQAWire.Policy = try await self.call(.consent(policyID: reviewed.id, noticeHash: reviewed.noticeHash), captured, token)
            guard value.policy.valid, value.policy.id == reviewed.id, value.policy.noticeHash == reviewed.noticeHash, value.policy.consentState == .accepted else { throw NativeQAError.invalidResponse }
            self.policy = value.policy; self.state = .ready
        }
        if policy?.consentState == .accepted { await refresh() }
    }
    func send() async {
        guard canSend, let selected = selectedID, let reviewed = policy else { return }
        let text = draft // Preserve original bytes, including whitespace.
        await perform { captured, token in
            let current = try await self.readPolicy(captured, token)
            self.policy = current
            guard current == reviewed, current.consentState == .accepted else { self.state = .blocked("NOTICE_CHANGED"); return }
            guard try self.transport.loadPending(scope: captured) == nil else { throw NativeQAError.journalUnavailable }
            let command = try NativeQAPending(scope: captured, sessionID: selected, policy: current, text: text)
            try self.transport.retainPending(command, scope: captured)
            self.pending = command
            guard try self.transport.loadPending(scope: captured) == command else { throw NativeQAError.journalUnavailable }
            let accepted: NativeQAWire.Accepted = try await self.call(.submit(command), captured, token)
            guard accepted.requestId == command.requestID, accepted.turnId == command.requestID,
                  accepted.sessionId == selected, accepted.status == "pending" else { throw NativeQAError.invalidResponse }
            self.draft = ""; self.state = .pending
            try await self.recover(command, captured, token)
        }
    }
    private func readPolicy(_ captured: NativeDataScope, _ token: UUID) async throws -> NativeQAPolicy {
        let value: NativeQAWire.Policy = try await call(.policy, captured, token)
        guard value.policy.valid else { throw NativeQAError.invalidResponse }
        return value.policy
    }
    private func history(_ id: String, _ captured: NativeDataScope, _ token: UUID) async throws {
        let value: NativeQAWire.History = try await call(.history(sessionID: id), captured, token)
        guard selectedID == id, value.session.valid, value.session.id == id, value.historyLimit == 20,
              value.policy.valid, value.policy.consentState == .accepted,
              value.policy.id == policy?.id, value.policy.noticeHash == policy?.noticeHash,
              value.messages.count <= (value.policy.maxTurns ?? 20), value.messages.allSatisfy({ $0.valid(sessionID: id) }),
              Set(value.messages.map(\.id)).count == value.messages.count else { throw NativeQAError.invalidResponse }
        messages = value.messages; policy = value.policy
        state = messages.contains { $0.status.waiting } ? .pending : .ready
    }
    private func recover(_ command: NativeQAPending, _ captured: NativeDataScope, _ token: UUID) async throws {
        let value: NativeQAWire.Message = try await call(.recover(sessionID: command.sessionID, requestID: command.requestID), captured, token)
        guard command.matches(captured), value.message.valid(sessionID: command.sessionID),
              value.message.requestId == command.requestID, command.matchesOriginalInputBytes(value.message.input) else { throw NativeQAError.invalidResponse }
        // A protected persisted message, including pending, proves admission. Absent history never does.
        try transport.clearPending(command, scope: captured)
        pending = nil
        try await history(command.sessionID, captured, token)
    }
    private func call<T: Decodable>(_ action: NativeQARequest, _ captured: NativeDataScope, _ token: UUID) async throws -> T {
        try ensure(captured, token)
        let response = try await transport.request(action, scope: captured)
        try ensure(captured, token)
        return try NativeQAWire.decode(T.self, response: response)
    }
    private func ensure(_ captured: NativeDataScope, _ token: UUID) throws {
        guard active, scope == captured, boundScope == captured, generation == token, !Task.isCancelled else { throw NativeQAError.stale }
    }
    private func perform(_ action: @escaping @MainActor (NativeDataScope, UUID) async throws -> Void) async {
        guard active, !busy, let captured = scope, boundScope == captured else { return }
        let token = generation
        state = .loading
        let task = Task { @MainActor in
            do { try await action(captured, token) }
            catch {
                guard self.generation == token, self.active else { return }
                if self.scope != captured { self.invalidate(); self.boundScope = nil; self.selectedID = nil; self.state = .signedOut; return }
                self.messages = []
                if let failure = error as? NativeQAError, case .server(let code, _) = failure,
                   ["UNAUTHENTICATED", "FORBIDDEN", "DATA_POLICY_BLOCKED"].contains(code) {
                    self.policy = nil; self.sessions = []; self.state = .blocked(code)
                } else { self.state = self.pending == nil ? .unavailable : .unknown }
            }
            if self.generation == token { self.work = nil }
        }
        work = task
        await withTaskCancellationHandler { await task.value } onCancel: { task.cancel() }
    }
}

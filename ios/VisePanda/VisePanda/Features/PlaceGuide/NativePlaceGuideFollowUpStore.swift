import Foundation
import Observation

/// Guide qualifies context; original grounded policy, task submission and answers remain authoritative.
@MainActor @Observable final class NativePlaceGuideFollowUpStore {
    private(set) var policy: NativeTextPolicy?
    private(set) var pending: NativePlaceGuidePending?
    private(set) var turn: NativeTextTurn?
    private(set) var busy = false
    private(set) var notice: String?
    var draft = ""
    private var selection: NativePlaceGuideSelection?
    private var submitted: NativePlaceGuideResultReference?
    private var generation = UUID()
    private var answerDeadline: TimeInterval = 0
    private var continuation: NativeTextTurn?
    private var awaiting = false
    var canSend: Bool { !busy && !awaiting && pending?.fencedReference == nil && policy?.consentState == .accepted && (pending != nil || (!draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && draft.utf16.count <= 600)) }

    func bind(_ next: NativePlaceGuideSelection?) {
        guard selection != next else { return }
        clear(); selection = next
    }
    func clear() {
        generation = UUID(); selection = nil; submitted = nil; pending = nil; turn = nil
        policy = nil; draft = ""; busy = false; notice = nil; answerDeadline = 0; continuation = nil; awaiting = false
    }
    /// Hide/fence old renderer requests without changing draft, pending bytes or acknowledgement status.
    func hideForLocalGuideCacheClear() {
        generation = UUID(); turn = nil; policy = nil; busy = false; answerDeadline = 0
    }
    func suspend() { generation = UUID(); turn = nil; policy = nil; busy = false; answerDeadline = 0; draft = "" }
    func visible(scope: NativeDataScope?) -> NativeTextTurn? {
        scope != nil && scope == selection?.scope && ProcessInfo.processInfo.systemUptime < answerDeadline ? turn : nil
    }
    func refresh(using session: NativeSession, guide: NativePlaceGuideStore) async {
        guard !busy, let selection, session.dataScope == selection.scope else { return }
        let own = generation; busy = true
        defer { if own == generation { busy = false } }
        do {
            let data = try await session.placeGuideGroundedRequest(path: "api/chat/native/v4/policy", method: "GET", actor: selection.scope)
            try ensure(own, session, selection)
            let reply = try JSONDecoder().decode(NativeTextPolicyReply.self, from: data)
            guard reply.version == 4, reply.kind == "policy", reply.policy.valid else { throw NativeDataError.invalidResponse }
            policy = reply.policy
            pending = try session.pendingPlaceGuide(actor: selection.scope)
            if let pending, try pending.selection(for: selection.scope) != selection {
                notice = "other_pending"; turn = nil; answerDeadline = 0; return
            }
            guard let selected = try pending.map(NativePlaceGuideResultReference.init) ?? submitted else { return }
            let started = ProcessInfo.processInfo.systemUptime
            let bytes = try await session.placeGuideGroundedRequest(path: "api/chat/native/v4/turns", method: "GET", actor: selection.scope)
            try ensure(own, session, selection)
            let history = try JSONDecoder().decode(NativeTextHistory.self, from: bytes)
            guard history.version == 4, history.kind == "grounded_history", history.turns.count <= 20,
                  history.turns.allSatisfy({ $0.valid && $0.validTask }), Set(history.turns.map(\.id)).count == history.turns.count else { throw NativeDataError.invalidResponse }
            guard let found = history.turns.first(where: { $0.id == selected.turnID }) else {
                turn = nil; answerDeadline = 0; notice = pending == nil ? "result_unavailable" : "ack_unknown"; return
            }
            guard found.threadId == selected.threadID, found.serviceTaskId == selected.taskID,
                  found.locale == selection.locale, found.scopeVersion == 1,
                  found.relationship == selected.relationship, found.parentTurnId == selected.parentTurnID else { throw NativeDataError.invalidResponse }
            awaiting = found.waiting; continuation = nil
            if let chain = NativeTaskChain(containing: found, history: history.turns), chain.turns.count < 4,
               [.clarification, .technicalFailure].contains(found.outcome) { continuation = found }
            // Original history proves acceptance, including a lost Guide HTTP acknowledgement.
            let journalObserver = session.journalDataObservation(.guide)
            let exactOriginalQuestion = pending?.fencedReference == nil && pending != nil
                && (try? pending?.fields()["question"] as? String) == found.input
            let journalTicket = exactOriginalQuestion && reply.policy.consentState == .accepted
                && reply.policy.id == selected.policyID && reply.policy.noticeHash == selected.noticeHash
                && guide.visible(session.dataScope)?.digest == selected.digest ? journalObserver.begin() : nil
            if let pending { try session.completePlaceGuide(pending, actor: selection.scope); submitted = selected; self.pending = nil }
            if !found.waiting { guide.clearUnlicensedProgress() }
            journalObserver.finish(journalTicket, selected.operationID)
            guard reply.policy.consentState == .accepted, reply.policy.noticeHash == selected.noticeHash,
                  reply.policy.id == selected.policyID,
                  let current = guide.visible(session.dataScope), current.digest == selected.digest,
                  current.rights.prompt, let result = found.result else { turn = nil; answerDeadline = 0; return }
            let lifetime = try result.lifetime(for: found, elapsed: ProcessInfo.processInfo.systemUptime - started)
            // A Guide answer may only expose facts from the exact currently qualified statement set.
            if let knowledge = result.knowledge {
                let facts = Set(current.segments.map(\.factId))
                guard knowledge.statements.allSatisfy({ facts.contains($0.factId) }) else { throw NativeDataError.invalidResponse }
            }
            turn = found; answerDeadline = ProcessInfo.processInfo.systemUptime + min(lifetime, current.remaining()); notice = nil
        } catch { if own == generation { turn = nil; policy = nil; answerDeadline = 0; notice = "unavailable" } }
    }

    func consent(accept: Bool, using session: NativeSession) async {
        guard !busy, let selection, session.dataScope == selection.scope, let policy else { return }
        let own = generation; busy = true
        defer { if own == generation { busy = false } }
        if !accept { draft = ""; turn = nil; answerDeadline = 0 }
        do {
            let bytes = try await session.placeGuideGroundedRequest(path: "api/chat/native/v4/consent", method: accept ? "POST" : "DELETE",
                body: NativePlaceActionWire.bytes(accept ? ["policyId": policy.id, "noticeHash": policy.noticeHash] : ["policyId": policy.id]), actor: selection.scope)
            try ensure(own, session, selection)
            let reply = try JSONDecoder().decode(NativeTextAction.self, from: bytes)
            guard reply.version == 4, reply.kind == (accept ? "accepted" : "withdrawn") else { throw NativeDataError.invalidResponse }
            if !accept, let pending { try session.completePlaceGuide(pending, actor: selection.scope); self.pending = nil }
            self.policy = nil
        } catch { if own == generation { self.policy = nil; notice = "consent_unconfirmed" } }
    }

    func send(using session: NativeSession, guide: NativePlaceGuideStore) async {
        guard canSend, let selection, session.dataScope == selection.scope, let policy,
              policy.consentState == .accepted, let ready = guide.visible(session.dataScope), ready.rights.prompt else { return }
        let own = generation; busy = true
        defer { if own == generation { busy = false } }
        do {
            if pending == nil {
                let question = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !question.isEmpty, question.utf16.count <= 600 else { return }
                let task: NativeServiceTaskLink
                let threadID: String
                if let continuation, let taskID = continuation.serviceTaskId,
                   submitted?.digest == ready.digest {
                    task = .init(id: taskID, scopeVersion: 1, relationship: continuation.outcome == .clarification ? "clarification" : "repair", parentTurnId: continuation.id)
                    threadID = continuation.threadId
                } else {
                    task = .init(id: UUID().uuidString.lowercased(), scopeVersion: 1, relationship: "new_goal", parentTurnId: nil)
                    threadID = UUID().uuidString.lowercased()
                }
                let taskObject = try JSONSerialization.jsonObject(with: JSONEncoder().encode(task))
                let body = try selection.command("follow_up", extra: ["operationId": UUID().uuidString.lowercased(), "expectedDigest": ready.digest,
                    "completedSegmentIds": guide.completedForQuestion(current: session.dataScope), "question": question,
                    "threadId": threadID, "turnId": UUID().uuidString.lowercased(), "policyId": policy.id, "serviceTask": taskObject])
                let request = NativePlaceGuidePending(endpoint: selection.scope.endpoint, owner: selection.scope.subject, mobileEpoch: selection.scope.mobileEpoch,
                    canonicalPoiID: selection.canonicalPoiID, tripID: selection.tripID, tripVersion: selection.tripVersion, placeReferenceID: selection.placeReferenceID,
                    locale: selection.locale, interest: selection.interest, noticeHash: policy.noticeHash,
                    expiresAt: ready.playbackExpiresAt ?? Date(), body: body)
                try session.rememberPlaceGuide(request, policy: policy, actor: selection.scope); pending = request
            }
            guard let pending, pending.noticeHash == policy.noticeHash else { throw NativeDataError.invalidResponse }
            let fields = try pending.fields(), task = fields["serviceTask"] as? [String: Any]
            guard fields["policyId"] as? String == policy.id, fields["expectedDigest"] as? String == ready.digest,
                  try pending.selection(for: selection.scope) == selection else { throw NativeDataError.invalidResponse }
            guard let completed = fields["completedSegmentIds"] as? [String], Set(completed).isSubset(of: Set(ready.segments.map(\.id))) else { throw NativeDataError.invalidResponse }
            let bytes = try await session.placeGuideRequest(selection: selection, body: pending.body)
            try ensure(own, session, selection)
            let reply = try NativePlaceActionWire.exact(NativePlaceGuideStore.outcome(bytes), ["kind", "version", "operationId", "tripId", "turnId", "serviceTaskId", "scopeVersion", "relationship", "parentTurnId", "guideDigest", "reused", "generationCost"])
            guard reply["kind"] as? String == "submitted", NativePlaceActionWire.integer(reply["version"]) == 1,
                  reply["operationId"] as? String == fields["operationId"] as? String, reply["tripId"] as? String == selection.tripID,
                  reply["turnId"] as? String == fields["turnId"] as? String, reply["serviceTaskId"] as? String == task?["id"] as? String,
                  NativePlaceActionWire.integer(reply["scopeVersion"]) == 1, reply["relationship"] as? String == task?["relationship"] as? String,
                  reply["parentTurnId"] as? String == task?["parentTurnId"] as? String,
                  reply["guideDigest"] as? String == ready.digest, NativePlaceActionWire.boolean(reply["reused"]) != nil,
                  reply["generationCost"] is NSNull else { throw NativeDataError.invalidResponse }
            let reference = try NativePlaceGuideResultReference(pending)
            try session.completePlaceGuide(pending, actor: selection.scope); submitted = reference; self.pending = nil; draft = ""; turn = nil; answerDeadline = 0
            notice = "submitted"; awaiting = true
        } catch { if own == generation { turn = nil; answerDeadline = 0; notice = "ack_unknown" } }
    }
    func sourceUnavailable(using session: NativeSession) {
        guard let selection, session.dataScope == selection.scope else { return }
        turn = nil; draft = ""; answerDeadline = 0
        do { try session.fencePlaceGuide(actor: selection.scope); pending = try session.pendingPlaceGuide(actor: selection.scope) }
        catch { policy = nil; notice = "cleanup_pending" }
    }
    func forgotten(using session: NativeSession) {
        guard let selection, session.dataScope == selection.scope else { return }
        do {
            if let pending = try session.pendingPlaceGuide(actor: selection.scope) { try session.completePlaceGuide(pending, actor: selection.scope) }
            clear(); bind(selection)
        } catch { sourceUnavailable(using: session); policy = nil; notice = "cleanup_pending" }
    }
    private func ensure(_ own: UUID, _ session: NativeSession, _ selection: NativePlaceGuideSelection) throws {
        guard own == generation, session.dataScope == selection.scope, self.selection == selection, !Task.isCancelled else { throw NativeDataError.staleSessionResponse }
    }
}

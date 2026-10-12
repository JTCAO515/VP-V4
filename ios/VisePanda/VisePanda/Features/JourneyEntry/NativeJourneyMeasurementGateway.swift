import Foundation

/// First-party transport injection only. No default endpoint/configuration.
/// A policy bit or seven-group projection is not a live K1/lifecycle permit.
@MainActor final class NativeJourneyMeasurementGateway<Actor: Equatable> {
    typealias M = NativeJourneyMeasurement
    typealias W = NativeJourneyMeasurementWire
    typealias A = NativeJourneyMeasurementAdmission
    typealias Transport = @MainActor (Actor, Data) async throws -> Data
    let observer: NativeJourneyMeasurementController<Actor>
    private let currentActor: () -> Actor?
    private let wireActor: (Actor) -> W.Actor?
    private let protectedLifecycleReady: () -> Bool
    private let transport: Transport?
    private let wallMilliseconds: () -> Double
    private let uptime: () -> TimeInterval
    private var generation = UUID()
    private var actor: Actor?
    private var policy: W.PolicyRead?
    private var consent: UUID?
    private var entries: [M.Entry] = []
    private var attempt: A.Attempt?
    private var ticket: W.Ticket?
    private var pendingAdmission: Data?
    private var admissionTask: Task<Void, Never>?
    init(observer: NativeJourneyMeasurementController<Actor>, currentActor: @escaping () -> Actor?,
         wireActor: @escaping (Actor) -> W.Actor?, protectedLifecycleReady: @escaping () -> Bool = { false },
         transport: Transport? = nil, wallMilliseconds: @escaping () -> Double = { Date().timeIntervalSince1970 * 1000 },
         uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        self.observer = observer; self.currentActor = currentActor; self.wireActor = wireActor
        self.protectedLifecycleReady = protectedLifecycleReady; self.transport = transport
        self.wallMilliseconds = wallMilliseconds; self.uptime = uptime
    }
    func clear() {
        generation = UUID(); admissionTask?.cancel(); admissionTask = nil
        actor = nil; policy = nil; consent = nil; entries = []; attempt = nil; ticket = nil; pendingAdmission = nil
        observer.stop(); observer.bind(currentActor())
    }
    private func live(_ expected: Actor, own: UUID) -> Bool {
        generation == own && currentActor() == expected && actor == expected && !Task.isCancelled
    }
    func readPolicy() async -> Bool {
        clear()
        guard let expected = currentActor(), let identity = wireActor(expected), let transport else { return false }
        actor = expected; let own = generation, start = uptime()
        do {
            let bytes = try await transport(expected, W.command("policy"))
            guard live(expected, own: own), uptime() >= start, uptime() - start < 20 else { return false }
            let value = try W.policy(bytes, actor: identity, now: wallMilliseconds()); policy = value
            // Explicitly independent live source + all D2/expiry/purge controls.
            // Missing callback keeps collection off even if SQL returns enabled.
            guard value.enabled, protectedLifecycleReady() else { return false }
            let deadline = min(start + 20, uptime() + (value.expiresAt - wallMilliseconds()) / 1000)
            let ready = M.Policy(purpose: M.purpose, schema: M.schema, noticeVersion: M.noticeVersion,
                enabled: true, capabilities: Set(M.Capability.allCases), readStarted: start, readDeadline: deadline)
            observer.configure(ready, actor: expected, sender: { [weak self] actual, envelope in
                guard let self else { throw W.Invalid.wire }; try await self.send(actual, envelope: envelope)
            })
            if let existing = value.consentID {
                // This is authenticated readback of the exact new-purpose
                // explicit opt-in, never grandfathered text/research consent.
                let receipt = M.Consent(id: existing, purpose: M.purpose, noticeVersion: M.noticeVersion, active: true,
                    readStarted: start, readDeadline: deadline)
                guard observer.accept(receipt, actor: expected, receiptActor: expected, explicitlyOptedIn: true) else { return false }
                consent = existing; entries = value.entries
            }
            // No pending old actor/source/consent reports are replayed.
            return true
        } catch { clear(); return false }
    }
    func join(_ selected: [M.Entry], explicitlyOptedIn: Bool) async -> Bool {
        if policy?.expiresAt ?? 0 <= wallMilliseconds() {
            guard await readPolicy() else { return false }
        }
        guard explicitlyOptedIn, protectedLifecycleReady(), policy?.enabled == true,
              let expected = actor, currentActor() == expected, let identity = wireActor(expected), let transport else { return false }
        let own = generation, start = uptime(), op = UUID()
        do {
            let body = try W.command("consent", fields: ["operationId": W.id(op), "noticeVersion": M.noticeVersion, "entries": selected.map(\.rawValue)])
            let bytes = try await transport(expected, body)
            guard live(expected, own: own), protectedLifecycleReady(), uptime() >= start, uptime() - start < 20 else { return false }
            let id = try W.consent(bytes, actor: identity, operation: op, expectedEntries: selected, now: wallMilliseconds())
            let receipt = M.Consent(id: id, purpose: M.purpose, noticeVersion: M.noticeVersion, active: true,
                readStarted: start, readDeadline: start + 20)
            guard observer.accept(receipt, actor: expected, receiptActor: expected, explicitlyOptedIn: true) else { return false }
            consent = id; entries = selected; return true
        } catch { return false }
    }
    /// Fire-and-forget on actual guarded travel acceptance. Missing ACK remains
    /// coverage unknown; travel is never awaited/retried for a measurement ticket.
    func guardedStart(_ value: A.Attempt) {
        guard protectedLifecycleReady(), let consent, entries.contains(W.entry(value)), let expected = actor,
              currentActor() == expected, let identity = wireActor(expected), let transport else { return }
        if attempt == value, ticket != nil { return }
        if attempt != value { pendingAdmission = nil; ticket = nil }
        let bytes: Data
        do { bytes = try pendingAdmission ?? W.admission(value, consentID: consent) } catch { return }
        attempt = value; pendingAdmission = bytes
        admissionTask?.cancel(); let own = generation
        admissionTask = Task { @MainActor [weak self] in
            guard let self, self.live(expected, own: own) else { return }
            do {
                let received = try await transport(expected, bytes)
                guard self.live(expected, own: own), self.attempt == value, self.protectedLifecycleReady() else { return }
                let ticket = try W.ticket(received, actor: identity, attempt: value, consent: consent, now: self.wallMilliseconds())
                self.ticket = ticket
                let source: M.Source
                switch value.anchor {
                case .task(let id): source = .init(kind: .serviceTask, id: id, revision: nil)
                case .nativeEntry(let id, let revision, _): source = .init(kind: .nativeTripEntry, id: id, revision: revision)
                case .goal(let goal): source = .init(kind: .goalRead, id: goal.goalID, revision: goal.goalVersion)
                }
                let point = value.nativeStart.map { M.LocalAdmissionPoint(process: value.process, uptime: $0) }
                self.observer.accepted(.init(id: ticket.id, entry: W.entry(value), source: source), actor: expected,
                    receiptActor: expected, localPoint: point)
            } catch { /* Unknown transport/ACK does not become business failure or precise cohort zero. */ }
        }
    }
    private func send(_ expected: Actor, envelope: M.Envelope) async throws {
        guard protectedLifecycleReady(), currentActor() == expected, actor == expected,
              let identity = wireActor(expected), let transport, let attempt, let ticket,
              envelope.admission.id == ticket.id, envelope.consentID == consent,
              ticket.expiresAt > wallMilliseconds() else { throw W.Invalid.wire }
        // Current SQL explicitly has no original typed question opportunity or
        // PDF/screenshot→result handoff authority. Keep these unobservable,
        // never fabricate proof from a Trip match or a new question UUID.
        switch envelope.signal {
        case .question, .zeroQuestions: return
        default: break
        }
        if case .nativeEntry = attempt.anchor {
            switch envelope.signal {
            case .serverReady, .presented, .writer, .declined: return
            default: break
            }
        }
        let own = generation, body = try W.receive(envelope, attempt: attempt)
        let bytes = try await transport(expected, body)
        guard live(expected, own: own), protectedLifecycleReady(), self.attempt == attempt else { throw W.Invalid.wire }
        try W.received(bytes, actor: identity, envelope: envelope, now: wallMilliseconds())
    }
}

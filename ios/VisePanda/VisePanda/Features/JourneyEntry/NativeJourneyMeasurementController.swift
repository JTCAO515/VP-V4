import Foundation
import Observation

/// Native domain candidates, not an HTTP schema or an installed consent grant.
enum NativeJourneyMeasurement {
    static let purpose = "journey_experience_measurement"
    static let schema = "journey-experience-measurement/1"
    static let noticeVersion = "journey-experience-measurement/2026-10-12"
    enum Entry: String { case e1, e2, e3 }
    enum Outcome: String { case completed, partial, blocked, technicalFailure, unknown }
    enum Capability: CaseIterable { case receive, aggregate, export, erase, restoreFence, purge }
    enum SourceKind { case serviceTask, nativeTripEntry, goalRead }
    struct Policy {
        let purpose: String
        let schema: String
        let noticeVersion: String
        let enabled: Bool
        let capabilities: Set<Capability>
        let readStarted: TimeInterval
        let readDeadline: TimeInterval
        func valid(at now: TimeInterval) -> Bool {
            purpose == NativeJourneyMeasurement.purpose && schema == NativeJourneyMeasurement.schema
                && noticeVersion == NativeJourneyMeasurement.noticeVersion && enabled
                && capabilities == Set(Capability.allCases) && now.isFinite && readStarted.isFinite && readDeadline.isFinite
                && readStarted >= 0 && now >= readStarted && readDeadline > readStarted && readDeadline - readStarted <= 20 && now < readDeadline
        }
    }
    struct Consent {
        let id: UUID
        let purpose: String
        let noticeVersion: String
        let active: Bool
        let readStarted: TimeInterval
        let readDeadline: TimeInterval
        func valid(at now: TimeInterval) -> Bool {
            purpose == NativeJourneyMeasurement.purpose && noticeVersion == NativeJourneyMeasurement.noticeVersion
                && active && now.isFinite && readStarted.isFinite && readDeadline.isFinite
                && readStarted >= 0 && now >= readStarted && readDeadline > readStarted && readDeadline - readStarted <= 20 && now < readDeadline
        }
    }
    struct Source: Equatable {
        let kind: SourceKind
        /// Original authority ID, not a new business Task or activation object.
        let id: UUID
        let revision: Int?
    }
    struct Artifact: Equatable { let id: UUID; let revision: Int; var valid: Bool { (1...1000).contains(revision) } }
    enum Writer: String { case directionsSelected, directionsSaved, decisionChosen, tripConfirmed }
    struct WriterReceipt: Equatable {
        let writer: Writer
        let operationID: UUID
        let artifact: Artifact
    }
    enum DeclineReason: String { case notUseful, changedNeed, other, unspecified }
    enum Field: String { case city, comparisonTarget, durationDays, partySize, interests, pace, lodgingBudget, dates, mobilityConstraints }
    enum QuestionBasis: String { case alreadyKnownApplicable, genuinelyMissing, userChanged, sourceConflict, unknown }
    enum Time: Equatable { case unknown; case nativeElapsedMilliseconds(Int) }
    /// Labeled Native guarded-start claim only, never business admittedAt or
    /// server latency. HTTP ACK/server receive/Goal.created_at are not its origin.
    struct LocalAdmissionPoint { let process: UUID; let uptime: TimeInterval }
    struct Admission: Equatable {
        /// Actual measurement admission receipt supplied by its qualified source
        /// gateway; this never creates a business Task in the client.
        let id: UUID
        let entry: Entry
        let source: Source
    }
    enum Signal: Equatable {
        case accepted
        case serverReady(Artifact)
        case presented(Artifact, Outcome)
        case writer(WriterReceipt)
        case declined(Artifact, DeclineReason)
        case terminal(Outcome)
        case question(Field, QuestionBasis, UUID)
        case zeroQuestions
    }
    struct Envelope {
        let schema = NativeJourneyMeasurement.schema
        let purpose = NativeJourneyMeasurement.purpose
        let consentID: UUID
        let admission: Admission
        let reportID: UUID
        let signal: Signal
        let time: Time
        let processID: UUID
        // Deliberately no actor, raw text/material/error, content digest,
        // client first_value/activated counter, or business mutation.
    }
}

/// Per-session transient observer. Gateway must validate configuration, consent
/// and source receipts; server requalifies sources and derives metrics. No
/// permanent queue, retry, accumulator or source-owning business writer exists.
@MainActor @Observable
final class NativeJourneyMeasurementController<Actor: Equatable> {
    typealias M = NativeJourneyMeasurement
    typealias Sender = @MainActor (Actor, M.Envelope) async throws -> Void
    enum Status { case disabled, notJoined, joined, unavailable }
    private(set) var status = Status.disabled
    private var actor: Actor?
    private var policy: M.Policy?
    private var consent: M.Consent?
    private var admission: M.Admission?
    private var point: M.LocalAdmissionPoint?
    private var presented: M.Artifact?
    private var generation = UUID()
    private var inFlight: [UUID: Task<Void, Never>] = [:]
    private var sender: Sender?
    private let uptime: () -> TimeInterval
    let process: UUID
    init(process: UUID = UUID(), uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        self.process = process; self.uptime = uptime
    }
    func bind(_ next: Actor?) {
        guard actor != next else { return }
        stop(); actor = next; policy = nil; sender = nil; status = .disabled
    }
    func configure(_ value: M.Policy?, actor expected: Actor, sender: Sender?) {
        stop(); policy = nil; self.sender = nil
        guard actor == expected, let value, value.valid(at: uptime()), let sender else { status = .disabled; return }
        policy = value; self.sender = sender; status = .notJoined
    }
    /// Called only after explicit opt-in AND the gateway's current authenticated
    /// consent receipt. A checkbox alone cannot enable collection.
    func accept(_ value: M.Consent, actor expected: Actor, receiptActor: Actor, explicitlyOptedIn: Bool) -> Bool {
        guard actor == expected, receiptActor == expected, policy?.valid(at: uptime()) == true, sender != nil,
              value.valid(at: uptime()), explicitlyOptedIn else { return false }
        consent = value; status = .joined; return true
    }
    func stop() {
        generation = UUID(); inFlight.values.forEach { $0.cancel() }; inFlight = [:]
        consent = nil; admission = nil; point = nil; presented = nil
        status = policy?.valid(at: uptime()) == true ? .notJoined : .disabled
    }
    func hideResult() { presented = nil }
    /// Every qualified admission is eligible, including failures and no result.
    /// The backend denominator must additionally query original authorities; it
    /// must not use only this client's successfully reported/presented records.
    func accepted(_ value: M.Admission, actor expected: Actor, receiptActor: Actor, localPoint: M.LocalAdmissionPoint? = nil) {
        guard eligible(expected), receiptActor == expected else { return }
        if admission?.id == value.id { return } // retry never resets original time
        admission = value; point = localPoint; presented = nil; report(.accepted, actor: expected)
    }
    func serverReady(_ artifact: M.Artifact, actor expected: Actor) {
        guard artifact.valid else { return }; report(.serverReady(artifact), actor: expected)
    }
    func rendered(_ artifact: M.Artifact, outcome: M.Outcome, actor expected: Actor,
                  qualifiedCurrentUseful: Bool, visible: Bool, active: Bool) {
        guard eligible(expected), artifact.valid, qualifiedCurrentUseful, visible, active else { return }
        presented = artifact; report(.presented(artifact, outcome), actor: expected)
    }
    /// Adapter calls only after original persisted writer ACK AND exact-current
    /// revision readback. Metric failure never changes/retries that business act.
    func writerSucceeded(_ receipt: M.WriterReceipt, actor expected: Actor, exactCurrentReadback: Bool) {
        guard exactCurrentReadback, receipt.artifact.valid else { return }
        report(.writer(receipt), actor: expected)
    }
    func explicitlyDeclined(actor expected: Actor, reason: M.DeclineReason = .unspecified) {
        guard let presented else { return }; report(.declined(presented, reason), actor: expected)
    }
    func terminal(_ outcome: M.Outcome, actor expected: Actor) { report(.terminal(outcome), actor: expected) }
    func question(_ field: M.Field, basis: M.QuestionBasis, questionID: UUID, actor expected: Actor) {
        report(.question(field, basis, questionID), actor: expected)
    }
    func zeroQuestions(actor expected: Actor, allOpportunitiesObservable: Bool) {
        guard allOpportunitiesObservable else { return }; report(.zeroQuestions, actor: expected)
    }
    private func eligible(_ expected: Actor) -> Bool {
        actor == expected && policy?.valid(at: uptime()) == true && consent?.valid(at: uptime()) == true && status == .joined && sender != nil
    }
    private func time() -> M.Time {
        guard let point, point.process == process else { return .unknown }
        let now = uptime(), delta = now - point.uptime
        guard point.uptime.isFinite, now.isFinite, delta >= 0, delta * 1000 <= Double(Int32.max) else { return .unknown }
        return .nativeElapsedMilliseconds(Int(delta * 1000))
    }
    private func report(_ signal: M.Signal, actor expected: Actor) {
        guard eligible(expected), inFlight.count < 4, let consent, let admission, let sender else { return }
        let own = generation, id = UUID()
        let envelope = M.Envelope(consentID: consent.id, admission: admission, reportID: id, signal: signal, time: time(), processID: process)
        inFlight[id] = Task { @MainActor in
            defer { if generation == own { inFlight[id] = nil } }
            guard generation == own, eligible(expected), !Task.isCancelled else { return }
            do { try await sender(expected, envelope) }
            catch { if generation == own, eligible(expected) { status = .unavailable } }
            // No retry or business exception propagation. The qualified backend
            // observes failed/uncompleted/unobservable original opportunities.
        }
    }
}

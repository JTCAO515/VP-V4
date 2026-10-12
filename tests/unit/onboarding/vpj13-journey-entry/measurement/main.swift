import Foundation

@main struct MeasurementChecks {
    @MainActor static func main() async {
        typealias M = NativeJourneyMeasurement
        let process = UUID(); var clock: TimeInterval = 100
        let observer = NativeJourneyMeasurementController<Int>(process: process, uptime: { clock })
        var sent: [M.Envelope] = []; var checks = 0
        let source = M.Source(kind: .serviceTask, id: UUID(), revision: nil)
        let admission = M.Admission(id: UUID(), entry: .e1, source: source)
        let artifact = M.Artifact(id: UUID(), revision: 2)
        let policy = M.Policy(purpose: M.purpose, schema: M.schema, noticeVersion: M.noticeVersion, enabled: true,
            capabilities: Set(M.Capability.allCases), readStarted: 100, readDeadline: 120)
        let consent = M.Consent(id: UUID(), purpose: M.purpose, noticeVersion: M.noticeVersion, active: true,
            readStarted: 100, readDeadline: 120)
        func expect(_ value: Bool, _ name: String) { precondition(value, name); checks += 1 }
        func drain() async { for _ in 0..<20 { await Task.yield() } }
        observer.bind(1)
        observer.accepted(admission, actor: 1, receiptActor: 1)
        await drain(); expect(sent.isEmpty, "default no configuration/no consent")
        let incomplete = M.Policy(purpose: M.purpose, schema: M.schema, noticeVersion: M.noticeVersion, enabled: true,
            capabilities: [.receive, .aggregate], readStarted: 100, readDeadline: 120)
        observer.configure(incomplete, actor: 1, sender: { _, e in sent.append(e) })
        expect(!observer.accept(consent, actor: 1, receiptActor: 1, explicitlyOptedIn: true), "missing purge/export/delete/restore rejects before collection")
        let wrongNotice = M.Consent(id: UUID(), purpose: M.purpose, noticeVersion: "old-processing-notice", active: true, readStarted: 100, readDeadline: 120)
        observer.configure(policy, actor: 1, sender: { _, e in sent.append(e) })
        expect(!observer.accept(wrongNotice, actor: 1, receiptActor: 1, explicitlyOptedIn: true), "unlisted notice version rejected")
        let inactive = M.Consent(id: UUID(), purpose: M.purpose, noticeVersion: M.noticeVersion, active: false, readStarted: 100, readDeadline: 120)
        expect(!observer.accept(inactive, actor: 1, receiptActor: 1, explicitlyOptedIn: true), "withdrawn/inactive consent rejected")
        observer.accepted(admission, actor: 1, receiptActor: 1)
        await drain(); expect(sent.isEmpty, "configured but not opted in")
        expect(!observer.accept(consent, actor: 1, receiptActor: 1, explicitlyOptedIn: false), "checkbox/implicit consent insufficient")
        expect(!observer.accept(consent, actor: 1, receiptActor: 2, explicitlyOptedIn: true), "foreign consent receipt rejected")
        let oldConsent = M.Consent(id: UUID(), purpose: "research", noticeVersion: M.noticeVersion, active: true, readStarted: 100, readDeadline: 120)
        expect(!observer.accept(oldConsent, actor: 1, receiptActor: 1, explicitlyOptedIn: true), "research purpose not borrowed")
        expect(observer.accept(consent, actor: 1, receiptActor: 1, explicitlyOptedIn: true), "explicit validated independent consent")
        observer.accepted(admission, actor: 1, receiptActor: 2)
        await drain(); expect(sent.isEmpty, "foreign admission rejected")
        observer.accepted(admission, actor: 1, receiptActor: 1)
        await drain(); expect(sent.count == 1 && sent[0].signal == .accepted, "all eligible admissions report before result")
        observer.serverReady(artifact, actor: 1)
        await drain(); expect(sent.last?.signal == .serverReady(artifact), "ready is not actual presentation")
        let before = sent.count
        observer.rendered(artifact, outcome: .partial, actor: 1, qualifiedCurrentUseful: false, visible: true, active: true)
        observer.rendered(artifact, outcome: .partial, actor: 1, qualifiedCurrentUseful: true, visible: false, active: true)
        observer.rendered(artifact, outcome: .partial, actor: 1, qualifiedCurrentUseful: true, visible: true, active: false)
        await drain(); expect(sent.count == before, "pointer/stale/invisible/inactive do not present")
        observer.explicitlyDeclined(actor: 1)
        await drain(); expect(sent.count == before, "no decline opportunity before actual presentation")
        observer.rendered(artifact, outcome: .partial, actor: 1, qualifiedCurrentUseful: true, visible: true, active: true)
        await drain(); expect(sent.last?.signal == .presented(artifact, .partial), "useful partial remains partial")
        expect(sent.last?.time == .unknown, "missing authoritative admission endpoint gives unknown time")
        observer.explicitlyDeclined(actor: 1)
        await drain(); expect(sent.last?.signal == .declined(artifact, .unspecified), "explicit decline can skip reason")
        observer.hideResult(); let hidden = sent.count
        observer.explicitlyDeclined(actor: 1)
        await drain(); expect(sent.count == hidden, "hidden opportunity cleared")
        let receipt = M.WriterReceipt(writer: .directionsSaved, operationID: UUID(), artifact: artifact)
        observer.writerSucceeded(receipt, actor: 1, exactCurrentReadback: false)
        await drain(); expect(sent.count == hidden, "writer ACK without readback insufficient")
        observer.writerSucceeded(receipt, actor: 1, exactCurrentReadback: true)
        await drain(); expect(sent.last?.signal == .writer(receipt), "original writer/readback ref, no activated event")
        observer.zeroQuestions(actor: 1, allOpportunitiesObservable: false)
        await drain(); let unknownQuestionCount = sent.count
        observer.zeroQuestions(actor: 1, allOpportunitiesObservable: true)
        await drain(); expect(sent.count == unknownQuestionCount + 1 && sent.last?.signal == .zeroQuestions, "zero-question requires observable scope")
        observer.stop(); let stopped = sent.count
        observer.terminal(.technicalFailure, actor: 1)
        await drain(); expect(sent.count == stopped, "withdraw immediately stops collection")
        observer.bind(2); observer.accepted(admission, actor: 1, receiptActor: 1)
        await drain(); expect(sent.count == stopped, "old actor has no queue replay")
        observer.configure(policy, actor: 2, sender: { _, _ in throw TestFailure.metric })
        expect(observer.accept(consent, actor: 2, receiptActor: 2, explicitlyOptedIn: true), "new actor must explicitly opt in")
        observer.accepted(admission, actor: 2, receiptActor: 2)
        await drain(); expect(observer.status == .unavailable, "metric failure isolated, no business exception/retry")
        observer.configure(policy, actor: 2, sender: { _, e in sent.append(e) })
        _ = observer.accept(consent, actor: 2, receiptActor: 2, explicitlyOptedIn: true)
        let timed = M.Admission(id: UUID(), entry: .e2, source: .init(kind: .materialOperation, id: UUID(), revision: nil))
        observer.accepted(timed, actor: 2, receiptActor: 2, localPoint: .init(process: process, uptime: 99))
        await drain(); expect(sent.last?.time == .elapsedMilliseconds(1000), "only same-process local authority endpoint times")
        clock = 101
        observer.accepted(timed, actor: 2, receiptActor: 2, localPoint: .init(process: process, uptime: 101))
        observer.terminal(.technicalFailure, actor: 2)
        await drain(); expect(sent.last?.time == .elapsedMilliseconds(2000), "retry does not reset start; failure preserved")
        clock = 120; let expired = sent.count
        observer.terminal(.completed, actor: 2)
        await drain(); expect(sent.count == expired, "expired policy/consent read lease rejects")
        clock = 100
        observer.configure(policy, actor: 2, sender: { _, e in sent.append(e) })
        _ = observer.accept(consent, actor: 2, receiptActor: 2, explicitlyOptedIn: true)
        let restarted = M.Admission(id: UUID(), entry: .e3, source: .init(kind: .goalRead, id: UUID(), revision: 2))
        observer.accepted(restarted, actor: 2, receiptActor: 2, localPoint: .init(process: UUID(), uptime: 99))
        await drain(); expect(sent.last?.time == .unknown, "cross-process monotonic time unknown")
        clock = 99
        observer.terminal(.completed, actor: 2)
        await drain(); expect(sent.last?.signal == .accepted, "clock rollback invalidates the read lease")
        clock = 100; let queuedCount = sent.count
        observer.configure(policy, actor: 2, sender: { _, e in try await Task.sleep(for: .seconds(1)); sent.append(e) })
        _ = observer.accept(consent, actor: 2, receiptActor: 2, explicitlyOptedIn: true)
        observer.accepted(.init(id: UUID(), entry: .e1, source: source), actor: 2, receiptActor: 2)
        observer.bind(3)
        await drain(); expect(sent.count == queuedCount, "actor replacement cancels queued/in-flight generation")
        print("PASS \(checks) transient measurement domain checks; no wire, consent collection, sink or business runtime claim")
    }
    enum TestFailure: Error { case metric }
}

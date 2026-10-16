import XCTest
@testable import VisePanda

nonisolated final class NativeQACancellationConsumerTests: XCTestCase {
    @MainActor func testSingleStopRetainsExactBodyBeforePostAndSealsObservedTombstone() async throws {
        let f = CancellationFixture(); let store = f.makeStore()
        await store.activate(true); await store.requestStop()
        XCTAssertEqual(f.port.posts, 1); XCTAssertEqual(store.state, .cancelled)
        let record = try XCTUnwrap(f.persistence.records.values.first)
        XCTAssertEqual(record.command.body, Data("{}".utf8)); XCTAssertEqual(record.receipt?.state, .cancelled)
        XCTAssertEqual(f.persistence.finishes, 1); XCTAssertEqual(f.port.generationCalls, 0)
        XCTAssertEqual(f.port.generationClears, 0)
    }
    @MainActor func testLostAckReopenOnlyReadsOriginalTupleWithoutRepeatingStopOrGeneration() async throws {
        let f = CancellationFixture(); f.port.dropAck = true
        let first = f.makeStore(); await first.activate(true); await first.requestStop()
        XCTAssertEqual(first.state, .unknown)
        let original = try XCTUnwrap(f.persistence.records.values.first?.command)
        let reopened = f.makeStore(); await reopened.activate(true); await reopened.requestStop()
        XCTAssertEqual(reopened.state, .cancelled)
        XCTAssertEqual(f.port.posts, 1); XCTAssertEqual(f.port.reads, 1)
        XCTAssertEqual(f.port.lastRead?.sessionID, original.sessionID)
        XCTAssertEqual(f.port.lastRead?.requestID, original.requestID)
        XCTAssertEqual(f.persistence.records.values.first?.command.body, original.body)
        XCTAssertEqual(f.port.generationCalls, 0); XCTAssertEqual(f.port.generationClears, 0)
    }
    @MainActor func testPendingAndNotObservedNeverConfirmStoppedAndRemainReadOnly() async {
        for result in ["pending", "not_observed"] {
            let f = CancellationFixture(); f.port.result = result
            let store = f.makeStore(); await store.activate(true); await store.requestStop()
            XCTAssertEqual(store.state, result == "pending" ? .pending : .unknown)
            XCTAssertFalse(store.canRequestStop); XCTAssertEqual(f.persistence.finishes, 0)
            await store.requestStop(); await store.checkResult()
            XCTAssertEqual(f.port.posts, 1); XCTAssertEqual(f.port.reads, 1)
            XCTAssertNotNil(f.persistence.records.values.first); XCTAssertEqual(f.port.generationCalls, 0)
        }
    }
    @MainActor func testCompletionWinningRaceIsAlreadyTerminalNotStopOrAnswerSuccess() async {
        let f = CancellationFixture(); f.port.result = "terminal"
        let store = f.makeStore(); await store.activate(true); await store.requestStop()
        XCTAssertEqual(store.state, .alreadyTerminal); XCTAssertEqual(store.receipt?.state, .terminal)
        XCTAssertEqual(f.port.generationCalls, 0); XCTAssertEqual(f.port.generationClears, 0)
        XCTAssertEqual(f.persistence.records.values.first?.receipt?.state, .terminal)
    }
    @MainActor func testStorageFailureOrReadbackMismatchPreventsStopPost() async {
        for mismatch in [false, true] {
            let f = CancellationFixture(); f.persistence.failRetain = !mismatch; f.persistence.mismatchReadback = mismatch
            let store = f.makeStore(); await store.activate(true); await store.requestStop()
            XCTAssertEqual(f.port.posts, 0); XCTAssertEqual(f.persistence.finishes, 0)
            XCTAssertNotEqual(store.state, .cancelled); XCTAssertEqual(f.port.generationCalls, 0)
        }
    }
    @MainActor func testFinishReadbackFailureKeepsOriginalIntentAndDoesNotShowStopped() async {
        let f = CancellationFixture(); f.persistence.failFinish = true
        let store = f.makeStore(); await store.activate(true); await store.requestStop()
        XCTAssertEqual(store.state, .unknown); XCTAssertNil(store.receipt)
        XCTAssertNotNil(f.persistence.records.values.first?.command); XCTAssertEqual(f.port.posts, 1)
        await store.checkResult(); XCTAssertEqual(f.port.posts, 1)
    }
    @MainActor func testMalformedForeignOrGenerationReceiptCannotSealCancellation() async {
        for mode in ["foreign", "wrongAck", "extra", "generation", "wrongRequest"] {
            let f = CancellationFixture(); f.port.replyMode = mode
            let store = f.makeStore(); await store.activate(true); await store.requestStop()
            XCTAssertEqual(store.state, .unknown, mode); XCTAssertNil(store.receipt, mode)
            XCTAssertEqual(f.persistence.finishes, 0, mode); XCTAssertNotNil(f.persistence.records.values.first, mode)
        }
    }
    @MainActor func testAuthorityDenialHidesReceiptAndRetainsIntentWithoutFreshConsent() async {
        let f = CancellationFixture(); f.port.status = 403
        let store = f.makeStore(); await store.activate(true); await store.requestStop()
        XCTAssertEqual(store.state, .blocked); XCTAssertNil(store.receipt)
        XCTAssertNotNil(f.persistence.records.values.first); XCTAssertEqual(f.persistence.finishes, 0)
        XCTAssertEqual(f.port.generationCalls, 0)
    }
    @MainActor func testBackgroundCancelsInFlightReadAndDoesNotExposeLateReceipt() async {
        let f = CancellationFixture(); let store = f.makeStore()
        await store.activate(true); f.port.dropAck = true; await store.requestStop()
        f.port.dropAck = false; f.port.holdRead = true
        let read = Task { await store.checkResult() }
        for _ in 0..<1000 { if f.port.readStarted { break }; await Task.yield() }
        XCTAssertTrue(f.port.readStarted)
        store.invalidate(); await read.value
        XCTAssertTrue(f.port.readCancelled); XCTAssertEqual(store.state, .inactive)
        XCTAssertFalse(store.hasCurrentProjection); XCTAssertNil(store.receipt)
        XCTAssertNotNil(f.persistence.records.values.first); XCTAssertEqual(f.persistence.finishes, 0)
    }
    @MainActor func testChangedActorEpochEndpointOrGenerationCannotActOnSuccessor() async {
        for change in 0..<4 {
            let f = CancellationFixture(); let store = f.makeStore(); await store.activate(true)
            let original = f.target!.scope
            let changed = NativeDataScope(endpoint: change == 0 ? "https://other.invalid" : original.endpoint,
                                          subject: change == 1 ? f.otherID : original.subject,
                                          mobileEpoch: change == 2 ? 2 : original.mobileEpoch,
                                          generation: change == 3 ? 2 : original.generation)
            f.port.scope = changed; f.target = .init(scope: changed, sessionID: f.sessionID, requestID: f.requestID, canRequestStop: true)
            XCTAssertFalse(store.hasCurrentProjection)
            await store.requestStop(); await store.checkResult()
            XCTAssertEqual(f.port.posts, 0); XCTAssertEqual(f.port.reads, 0)
        }
    }
    @MainActor func testLateResponseAfterSelectionChangeCannotFinishDifferentTuple() async {
        let f = CancellationFixture(); let store = f.makeStore(); await store.activate(true)
        f.port.onPost = { f.target = .init(scope: f.port.scope!, sessionID: f.sessionID, requestID: f.otherID, canRequestStop: true) }
        await store.requestStop()
        XCTAssertEqual(store.state, .inactive); XCTAssertNil(store.receipt)
        XCTAssertEqual(f.persistence.finishes, 0); XCTAssertEqual(f.port.posts, 1)
    }
    @MainActor func testObservedTombstoneSurvivesReopenAndPreventsAnotherPost() async {
        let f = CancellationFixture(); let first = f.makeStore(); await first.activate(true); await first.requestStop()
        let next = f.makeStore(); await next.activate(true); await next.requestStop(); await next.checkResult()
        XCTAssertEqual(f.port.posts, 1); XCTAssertEqual(f.port.reads, 2)
        XCTAssertEqual(f.persistence.records.count, 1); XCTAssertEqual(next.state, .cancelled)
    }
    @MainActor func testPendingBodyOrIdentityTamperingFailsBeforeTransport() throws {
        let f = CancellationFixture(); let original = try NativeQACancellationPending(target: XCTUnwrap(f.target))
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(original)) as? [String: Any])
        object["body"] = Data("{ }".utf8).base64EncodedString()
        let changed = try JSONDecoder().decode(NativeQACancellationPending.self, from: JSONSerialization.data(withJSONObject: object))
        XCTAssertFalse(changed.valid); XCTAssertThrowsError(try NativeQARequest.requestCancellation(changed).body)
        XCTAssertEqual(try NativeQARequest.requestCancellation(original).body, original.body)
        XCTAssertEqual(try NativeQARequest.readCancellation(sessionID: f.sessionID, requestID: f.requestID).path,
                       "api/qa-agent/native/v1/sessions/\(f.sessionID)/messages/\(f.requestID)/cancellation")
        XCTAssertNil(try NativeQARequest.readCancellation(sessionID: f.sessionID, requestID: f.requestID).body)
    }
    @MainActor func testFreshStopIneligibleStillAllowsExplicitReadonlyReceiptCheck() async {
        let f = CancellationFixture(); f.target = .init(scope: f.port.scope!, sessionID: f.sessionID, requestID: f.requestID, canRequestStop: false)
        f.port.result = "terminal"
        let store = f.makeStore(); await store.activate(true); await store.requestStop(); await store.checkResult()
        XCTAssertEqual(f.port.posts, 0); XCTAssertEqual(f.port.reads, 1)
        XCTAssertEqual(store.state, .alreadyTerminal); XCTAssertTrue(f.persistence.records.isEmpty)
    }
}

/// Synthetic ports only. No HTTP/Auth/SQL/Keychain/provider, refunds, or target acceptance.
@MainActor private final class CancellationFixture {
    let sessionID = "00000000-0000-4000-8000-000000000002"
    let requestID = "00000000-0000-4000-8000-000000000003"
    let otherID = "00000000-0000-4000-8000-000000000004"
    let persistence = CancellationPersistence()
    let port = CancellationTransport()
    var target: NativeQACancellationTarget?
    init() {
        target = .init(scope: port.scope!, sessionID: sessionID, requestID: requestID, canRequestStop: true)
        port.persistence = persistence
    }
    func makeStore() -> NativeQACancellationStore {
        .init(transport: port, persistence: persistence, currentTarget: { self.target })
    }
}
@MainActor private final class CancellationPersistence: NativeQACancellationPersistence {
    var records: [String: NativeQACancellationRecord] = [:]
    var failRetain = false, mismatchReadback = false, failFinish = false
    var finishes = 0
    func key(_ command: NativeQACancellationPending) -> String {
        [command.endpoint, command.subject, String(command.mobileEpoch), command.sessionID, command.requestID].joined(separator: "|")
    }
    func loadCancellation(target: NativeQACancellationTarget) throws -> NativeQACancellationRecord? {
        let command = try NativeQACancellationPending(target: target)
        guard let record = records[key(command)] else { return nil }
        if mismatchReadback { throw NativeQACancellationError.storageUnavailable }
        return record
    }
    func retainCancellation(_ command: NativeQACancellationPending, scope: NativeDataScope) throws {
        if failRetain { throw NativeQACancellationError.storageUnavailable }
        if let original = records[key(command)] { guard original.command == command else { throw NativeQACancellationError.storageUnavailable }; return }
        records[key(command)] = .init(command: command, receipt: nil)
    }
    func finishCancellation(_ command: NativeQACancellationPending, receipt: NativeQACancellationReceipt, scope: NativeDataScope) throws {
        if failFinish { throw NativeQACancellationError.storageUnavailable }
        guard receipt.observed, receipt.matches(command), records[key(command)]?.command == command else { throw NativeQACancellationError.storageUnavailable }
        finishes += 1; records[key(command)] = .init(command: command, receipt: receipt)
    }
}
@MainActor private final class CancellationTransport: NativeQATransport {
    var scope: NativeDataScope? = .init(endpoint: "https://synthetic.invalid", subject: "00000000-0000-4000-8000-000000000001", mobileEpoch: 1, generation: 1)
    var persistence: CancellationPersistence?
    var posts = 0, reads = 0, generationCalls = 0, generationClears = 0
    var dropAck = false, holdRead = false, readStarted = false, readCancelled = false
    var result = "cancelled", replyMode = "exact", status = 200
    var lastRead: NativeQACancellationPending?
    var onPost: (() -> Void)?
    func request(_ request: NativeQARequest, scope: NativeDataScope) async throws -> NativeQAHTTPResponse {
        let command: NativeQACancellationPending
        switch request {
        case .requestCancellation(let original):
            guard persistence?.records.values.contains(where: { $0.command == original }) == true else { throw NativeQACancellationError.storageUnavailable }
            command = original; posts += 1; onPost?()
            if dropAck { throw NativeQACancellationError.server(code: "PROVIDER_UNAVAILABLE", ack: "unknown") }
        case .readCancellation(let sessionID, let requestID):
            command = try .init(target: .init(scope: scope, sessionID: sessionID, requestID: requestID, canRequestStop: false))
            reads += 1; lastRead = command
            if holdRead {
                readStarted = true
                do { try await Task.sleep(for: .seconds(20)) } catch { readCancelled = true }
            }
        default: generationCalls += 1; throw NativeQAError.invalidResponse
        }
        var object: [String: Any] = ["version": "qa-cancellation/1", "sessionId": command.sessionID, "requestId": command.requestID,
                                     "state": result, "ack": ["cancelled", "terminal"].contains(result) ? "observed" : "unknown"]
        if replyMode == "foreign" { object["sessionId"] = "00000000-0000-4000-8000-000000000099" }
        if replyMode == "wrongRequest" { object["requestId"] = "00000000-0000-4000-8000-000000000099" }
        if replyMode == "wrongAck" { object["ack"] = "unknown" }
        if replyMode == "extra" { object["completed"] = true }
        if replyMode == "generation" { object = ["version": "qa-agent/1", "requestId": command.requestID, "status": "pending"] }
        return .init(status: status, body: try JSONSerialization.data(withJSONObject: object))
    }
    func loadPending(scope: NativeDataScope) throws -> NativeQAPending? { generationCalls += 1; throw NativeQAError.invalidResponse }
    func retainPending(_ pending: NativeQAPending, scope: NativeDataScope) throws { generationCalls += 1; throw NativeQAError.invalidResponse }
    func clearPending(_ pending: NativeQAPending, scope: NativeDataScope) throws { generationClears += 1; throw NativeQAError.invalidResponse }
}

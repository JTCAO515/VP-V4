import Foundation
import Security
import Testing
@testable import VisePanda

@MainActor
private final class RecoveryTestVault: NativeCredentialVault {
    var values: [String: Data] = [:]
    var writeCount = 0
    var failReadback = false
    var failErase = false
    var failRecoveryEraseOnly = false
    func key(_ service: String, _ owner: String) -> String { service + "|" + owner }
    func write(_ data: Data, service: String, owner: String) -> OSStatus {
        writeCount += 1; values[key(service, owner)] = data; return errSecSuccess
    }
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        if failReadback, writeCount > 0 { return (errSecInteractionNotAllowed, nil) }
        guard let value = values[key(service, owner)] else { return (errSecItemNotFound, nil) }; return (errSecSuccess, value)
    }
    func remove(service: String, owner: String) -> OSStatus {
        if failErase || failRecoveryEraseOnly && service.hasPrefix("com.visepanda.native.local-recovery.v1.") { return errSecInteractionNotAllowed }
        values.removeValue(forKey: key(service, owner)); return errSecSuccess
    }
}

nonisolated private final class RecoverySessionProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "127.0.0.1" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let path = request.url!.path
        let status: Int, value: [String: Any]
        if path.hasSuffix("/credentials") {
            status = 200; value = ["subject": "22222222-2222-4222-8222-222222222222", "accessToken": "synthetic-only",
                                   "refreshToken": "synthetic-only", "expiresAt": Date().timeIntervalSince1970 + 3600]
        } else if path.hasSuffix("/login") {
            status = 200; value = ["subject": "22222222-2222-4222-8222-222222222222", "mobileEpoch": 3]
        } else if path.hasSuffix("/profile") {
            status = 200; value = ["subject": "22222222-2222-4222-8222-222222222222", "displayName": "Synthetic"]
        } else if path.hasSuffix("/logout") { status = 200; value = [:] }
        else { status = 401; value = ["error": ["code": "UNAUTHENTICATED"]] }
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: try! JSONSerialization.data(withJSONObject: value)); client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@MainActor
private enum RecoveryFixture {
    static let trip = "11111111-1111-4111-8111-111111111111"
    static let owner = "22222222-2222-4222-8222-222222222222"
    static let context = "33333333-3333-4333-8333-333333333333"
    static let op = "44444444-4444-4444-8444-444444444444"
    static let proposal = "55555555-5555-4555-8555-555555555555"
    static let digest = String(repeating: "a", count: 64)
    static let scope = NativeDataScope(endpoint: "http://127.0.0.1:64001", subject: owner, mobileEpoch: 3, generation: 0)
    static func date(_ delta: Double = 0) -> String { ISO8601DateFormatter().string(from: Date().addingTimeInterval(delta)) }
    static func input(fixed: [String] = ["dinner"], selected: [String] = ["optional", "optional2"], kind: NativeRecoveryReport = .fatigue) -> NativeRecoveryInput {
        .init(operationId: op, expectedHeadVersion: 4, dayId: "day", selectedItemIds: selected, fixedItemIds: fixed,
              reservationBindings: [], report: .init(source: "user_report", kind: kind, observedAt: date(-1)), locale: "zh")
    }
    static var detailObject: [String: Any] {
        ["version": 1, "trip": ["id": trip, "title": "Trip", "headVersion": 4, "updatedAt": date()],
         "hardLocks": "not_enabled", "externalOrderStatus": "not_connected", "confirmationState": "confirmed",
         "content": ["days": [["id": "day", "date": "2026-10-04", "timeZone": "Asia/Shanghai", "items": [
            ["id": "optional", "dayId": "day", "title": "Optional"], ["id": "optional2", "dayId": "day", "title": "Optional 2"],
            ["id": "dinner", "dayId": "day", "title": "Dinner"]]]]]]
    }
    static func bytes(_ object: [String: Any], envelope: Bool = true) throws -> Data {
        let value: [String: Any] = envelope ? ["data": object] : object
        return try JSONSerialization.data(withJSONObject: value)
    }
    static func detail() throws -> NativeTripDetail { try JSONDecoder().decode(NativeTripDetail.self, from: bytes(detailObject, envelope: false)) }
    static func preview(_ input: NativeRecoveryInput) throws -> [String: Any] {
        let candidate: [String: Any] = ["candidateId": "omit_one", "disposition": "candidate_only", "action": "omit_explicit_optional_items",
            "omittedItemIds": ["optional"], "patch": ["expectedVersion": 4, "operations": [["kind": "delete_item", "dayId": "day", "itemId": "optional"]]],
            "dayDiffs": [["kind": "changed", "dayId": "day", "date": "2026-10-04", "items": [["kind": "removed", "itemId": "optional", "title": "Optional"]]]],
            "feasibility": ["status": "pending", "lines": [["itemId": "dinner", "constraint": "actual_place", "status": "pending", "reason": "EXACT_PLACE_EVIDENCE_MISSING"]]],
            "fixedItemIds": ["dinner"], "unchangedItemIds": ["optional2", "dinner"], "label": "Omit one optional item"]
        return ["kind": "local_recovery/1", "tripId": trip, "baseVersion": 4, "report": try NativeRecoveryWire.object(input.report),
                "status": "candidates", "reason": NSNull(), "contextId": context, "contextDigest": digest, "expiresAt": date(120),
                "reservationBasis": [], "candidates": [candidate],
                "preferenceContext": ["travelPace": NSNull(), "updatedAt": NSNull(), "status": "unknown", "influence": "soft_reference_only", "explicitInputPriority": "current_explicit_input"],
                "sourceSemantics": "user_report", "tripMutation": "none", "externalOutcome": "unknown", "nextStep": "review_optional_items_and_check_original_supplier",
                "officialChannel": ["status": "unavailable", "reason": "NO_QUALIFIED_OFFICIAL_CHANNEL"],
                "needsManualVerification": ["ONWARD_ROUTE", "OPENING", "RESERVATION", "EXTERNAL_CANCELLATION_REFUND"]]
    }
    static func selectionRecord() throws -> NativeRecoveryPending {
        let input = NativeRecoverySelection(operationId: op, contextId: context, contextDigest: digest, candidateId: "omit_one")
        return .init(scope: scope, tripID: trip, baseVersion: 4, operationID: op, stage: "select", body: try input.body(),
                     expectedPatch: .init(expectedVersion: 4, operations: [.init(kind: .deleteItem, dayId: "day", itemId: "optional")]))
    }
    static func outcome(record: NativeRecoveryPending, state: String = "pending") throws -> [String: Any] {
        let selection = try record.selection(), expiry = date(25)
        let receipt: [String: Any] = ["kind": "local_recovery_proposal/1", "operationId": record.operationID, "contextId": selection.contextId,
            "contextDigest": selection.contextDigest, "candidateId": selection.candidateId, "proposalId": proposal, "proposalRevision": 1,
            "baseVersion": 4, "expiresAt": expiry, "reused": false]
        let operation: [String: Any] = ["kind": "local_recovery_operation/1", "operationId": record.operationID, "tripId": trip,
            "input": try NativeRecoveryWire.object(selection), "receipt": receipt, "state": state, "resultingVersion": state == "applied" ? 5 : NSNull()]
        var value: [String: Any] = ["kind": state == "pending" ? "local_recovery_selected/1" : "local_recovery_recovered/1", "operation": operation,
                                  "tripMutation": state == "applied" ? "original_proposal_applied" : "none"]
        if state == "pending" {
            value["proposal"] = ["id": proposal, "revision": 1, "baseTripVersion": 4, "status": "pending", "createdAt": date(), "expiresAt": expiry,
                "titleDiff": ["before": "Trip", "after": "Trip"], "dayDiffs": [], "patch": try NativeRecoveryWire.object(record.expectedPatch!),
                "digest": digest, "stale": false, "evidence": "User report", "assumptions": "Manual verification required"]
        }
        return value
    }
    static func load(_ store: NativeRecoveryStore, readerMissing: Bool = false) async {
        store.bind(scope)
        await store.refresh(tripID: trip, current: { scope }, request: { _, method, _ in
            if method == "GET" { return try bytes(detailObject, envelope: false) }
            if readerMissing { throw NativeDataError.server(code: "RESERVATION_UNAVAILABLE") }
            return try bytes(["kind": "reservation_references/1", "tripId": trip, "tripVersion": 4, "items": [], "hasMore": false,
                              "nextCursor": NSNull(), "planningConstraints": []])
        })
    }
}

@Suite("Native exact local recovery", .serialized)
@MainActor
struct NativeRecoveryTests {
    @Test func inputScopeDoesNotInventOptionalOrFixedItems() throws {
        try RecoveryFixture.input().validate()
        #expect(throws: (any Error).self) { try RecoveryFixture.input(fixed: ["optional"]).validate() }
        #expect(throws: (any Error).self) { try RecoveryFixture.input(selected: (0..<9).map { "item\($0)" }).validate() }
        #expect(NativeRecoveryWire.integer(true) == nil)
        #expect(NativeRecoveryWire.boolean(1) == nil)
        #expect(NativeRecoveryWire.integer(1.5) == nil)
    }
    @Test func candidateMustPreserveExactFixedAndUnselectedScope() throws {
        let input = RecoveryFixture.input(), detail = try RecoveryFixture.detail()
        let source = try RecoveryFixture.preview(input)
        let good = try NativeRecoveryWire.decode(NativeRecoveryPreview.self, source)
        try good.validate(input: input, detail: detail, now: Date())
        for field in ["fixedItemIds", "unchangedItemIds"] {
            var changed = source; var candidate = (source["candidates"] as! [[String: Any]])[0]
            candidate[field] = []; changed["candidates"] = [candidate]
            let value = try NativeRecoveryWire.decode(NativeRecoveryPreview.self, changed)
            #expect(throws: (any Error).self) { try value.validate(input: input, detail: detail, now: Date()) }
        }
        var expired = source; expired["expiresAt"] = RecoveryFixture.date(-1)
        let expiredValue = try NativeRecoveryWire.decode(NativeRecoveryPreview.self, expired)
        #expect(throws: (any Error).self) { try expiredValue.validate(input: input, detail: detail, now: Date()) }
        var fake = source; fake["report"] = try NativeRecoveryWire.object(RecoveryFixture.input(kind: .highRiskUnwell).report)
        let fakeValue = try NativeRecoveryWire.decode(NativeRecoveryPreview.self, fake)
        #expect(throws: (any Error).self) { try fakeValue.validate(input: RecoveryFixture.input(kind: .highRiskUnwell), detail: detail, now: Date()) }
    }
    @Test func journalReadbackFailurePreventsDispatchAndDoesNotEraseUnknown() async throws {
        let vault = RecoveryTestVault(); vault.failReadback = true
        let store = NativeRecoveryStore(journal: .init(vault: vault)); await RecoveryFixture.load(store)
        var dispatched = 0
        await store.prepare(input: RecoveryFixture.input(), current: { RecoveryFixture.scope }, post: { _ in dispatched += 1; return Data() })
        #expect(dispatched == 0); #expect(vault.writeCount == 1); #expect(!vault.values.isEmpty)
        vault.failReadback = false
        #expect(try NativeRecoveryJournal(vault: vault).read(scope: RecoveryFixture.scope) != nil)
    }
    @Test func journalOwnerEndpointEpochIsolationAndEraseFailure() throws {
        let vault = RecoveryTestVault(), journal = NativeRecoveryJournal(vault: vault), pending = try RecoveryFixture.selectionRecord()
        try journal.save(pending, scope: RecoveryFixture.scope)
        #expect(try journal.read(scope: RecoveryFixture.scope) == pending)
        let other = NativeDataScope(endpoint: RecoveryFixture.scope.endpoint, subject: "other", mobileEpoch: 3, generation: 0)
        #expect(try journal.read(scope: other) == nil)
        let endpoint = NativeDataScope(endpoint: "http://127.0.0.1:64002", subject: RecoveryFixture.owner, mobileEpoch: 3, generation: 0)
        #expect(try journal.read(scope: endpoint) == nil)
        let epoch = NativeDataScope(endpoint: RecoveryFixture.scope.endpoint, subject: RecoveryFixture.owner, mobileEpoch: 4, generation: 0)
        #expect(throws: (any Error).self) { try journal.read(scope: epoch) }
        vault.failErase = true
        #expect(throws: (any Error).self) { try journal.erase(endpoint: pending.endpoint, owner: pending.owner) }
        #expect(try journal.read(scope: RecoveryFixture.scope) == pending)
        vault.failErase = false; try journal.erase(endpoint: pending.endpoint, owner: pending.owner)
        #expect(try journal.read(scope: RecoveryFixture.scope) == nil)
    }
    @Test func lostSelectionAckRestoresAndExplicitReplayVerifiesActorAndReadsBeforeIdenticalBytes() async throws {
        let vault = RecoveryTestVault(), journal = NativeRecoveryJournal(vault: vault)
        let store = NativeRecoveryStore(journal: journal); await RecoveryFixture.load(store)
        let input = RecoveryFixture.input()
        await store.prepare(input: input, current: { RecoveryFixture.scope }, post: { _ in try RecoveryFixture.bytes(RecoveryFixture.preview(input)) })
        var original: Data?
        await store.select(candidateID: "omit_one", current: { RecoveryFixture.scope }, post: { bytes in original = bytes; throw URLError(.networkConnectionLost) })
        let pending = try #require(store.pending); #expect(pending.body == original)
        let reopened = NativeRecoveryStore(journal: journal); await RecoveryFixture.load(reopened)
        var sends = 0
        await reopened.replayOriginal(current: { RecoveryFixture.scope }, verify: { nil }, post: { _ in sends += 1; return Data() })
        #expect(sends == 0)
        await reopened.recover(current: { RecoveryFixture.scope }, post: { bytes in
            let root = try JSONSerialization.jsonObject(with: bytes) as! [String: Any]
            #expect(root["operationId"] as? String == pending.operationID)
            throw NativeDataError.server(code: "RECOVERY_RECEIPT_UNKNOWN")
        })
        #expect(reopened.outcome == nil)
        await reopened.replayOriginal(current: { RecoveryFixture.scope }, verify: { RecoveryFixture.scope }, post: { bytes in
            if let root = try JSONSerialization.jsonObject(with: bytes) as? [String: Any], root["operation"] as? String == "receipt" { throw NativeDataError.server(code: "RECOVERY_RECEIPT_UNKNOWN") }
            sends += 1; #expect(bytes == original); return try RecoveryFixture.bytes(RecoveryFixture.outcome(record: pending))
        })
        #expect(sends == 1); #expect(reopened.outcome?.operation.state == "pending")
        #expect(reopened.reviewReference == RecoveryFixture.proposal + ":1:" + RecoveryFixture.digest)
        let restored = try journal.read(scope: RecoveryFixture.scope)
        let acknowledged = try #require(restored)
        #expect(acknowledged.body == pending.body); #expect(acknowledged.operationID == pending.operationID)
        #expect(acknowledged.originalReceipt?.proposalId == RecoveryFixture.proposal)
        #expect(acknowledged.originalProposalDigest == RecoveryFixture.digest)
        await reopened.recover(current: { RecoveryFixture.scope }, post: { _ in
            var data = try RecoveryFixture.outcome(record: acknowledged, state: "applied")
            var operation = data["operation"] as! [String: Any], receipt = operation["receipt"] as! [String: Any]
            receipt["proposalId"] = RecoveryFixture.context; operation["receipt"] = receipt; data["operation"] = operation
            return try RecoveryFixture.bytes(data)
        })
        #expect(reopened.outcome == nil); #expect(try journal.read(scope: RecoveryFixture.scope) == acknowledged)
    }
    @Test(arguments: ["FORBIDDEN", "UNAUTHENTICATED", "transport", "malformed"])
    func failedReceiptReadNeverAuthorizesResendAndDeniedOrMalformedReplayDoesNotSend(_ failure: String) async throws {
        let vault = RecoveryTestVault(), journal = NativeRecoveryJournal(vault: vault), pending = try RecoveryFixture.selectionRecord()
        try journal.save(pending, scope: RecoveryFixture.scope)
        let store = NativeRecoveryStore(journal: journal); await RecoveryFixture.load(store)
        await store.recover(current: { RecoveryFixture.scope }, post: { _ in
            if failure == "transport" { throw URLError(.timedOut) }
            if failure == "malformed" { return try RecoveryFixture.bytes(["kind": "local_recovery_recovered/1"]) }
            throw NativeDataError.server(code: failure)
        })
        var sends = 0
        await store.replayOriginal(current: { RecoveryFixture.scope }, verify: { RecoveryFixture.scope }, post: { bytes in
            let root = try JSONSerialization.jsonObject(with: bytes) as! [String: Any]
            if root["operation"] as? String == "receipt" {
                if failure == "transport" { throw NativeDataError.invalidResponse }
                if failure == "malformed" { return try RecoveryFixture.bytes(["kind": "local_recovery_recovered/1"]) }
                throw NativeDataError.server(code: failure)
            }
            sends += 1; return Data()
        })
        #expect(sends == 0); #expect(store.outcome == nil)
        #expect(try journal.read(scope: RecoveryFixture.scope) == pending)
        if ["FORBIDDEN", "UNAUTHENTICATED"].contains(failure) { #expect(store.detail == nil) }
    }
    @Test func receiptMustIdentifyOriginalOperationProposalAndAppliedVersion() async throws {
        let pending = try RecoveryFixture.selectionRecord()
        let good = try NativeRecoveryWire.decode(NativeRecoveryOutcome.self, RecoveryFixture.outcome(record: pending, state: "applied"))
        try good.validate(pending: pending, now: Date())
        for field in ["operationId", "resultingVersion"] {
            var data = try RecoveryFixture.outcome(record: pending, state: "applied")
            var operation = data["operation"] as! [String: Any]
            operation[field] = field == "operationId" ? RecoveryFixture.proposal as Any : 99 as Any; data["operation"] = operation
            let value = try NativeRecoveryWire.decode(NativeRecoveryOutcome.self, data)
            #expect(throws: (any Error).self) { try value.validate(pending: pending, now: Date()) }
        }
        var data = try RecoveryFixture.outcome(record: pending)
        var proposal = data["proposal"] as! [String: Any]; proposal["id"] = RecoveryFixture.context; data["proposal"] = proposal
        let child = try NativeRecoveryWire.decode(NativeRecoveryOutcome.self, data)
        #expect(throws: (any Error).self) { try child.validate(pending: pending, now: Date()) }
    }
    @Test func explicitReplayCannotSkipFreshAuthorityOrOverwriteAnUnknownJournal() async throws {
        let vault = RecoveryTestVault(), journal = NativeRecoveryJournal(vault: vault), pending = try RecoveryFixture.selectionRecord()
        try journal.save(pending, scope: RecoveryFixture.scope)
        let store = NativeRecoveryStore(journal: journal); await RecoveryFixture.load(store)
        await store.recover(current: { RecoveryFixture.scope }, post: { _ in throw NativeDataError.server(code: "RECOVERY_RECEIPT_UNKNOWN") })
        var readsOrSends = 0, freshChecks = 0
        await store.replayOriginal(current: { RecoveryFixture.scope }, verify: {
            freshChecks += 1; throw NativeDataError.server(code: "FORBIDDEN")
        }, post: { _ in readsOrSends += 1; return Data() })
        #expect(freshChecks == 1); #expect(readsOrSends == 0)
        #expect(try journal.read(scope: RecoveryFixture.scope) == pending)
        let changed = NativeRecoveryPending(scope: RecoveryFixture.scope, tripID: pending.tripID, baseVersion: pending.baseVersion,
                                             operationID: RecoveryFixture.context, stage: pending.stage, body: pending.body, expectedPatch: pending.expectedPatch)
        #expect(throws: (any Error).self) { try journal.save(changed, scope: RecoveryFixture.scope) }
        #expect(try journal.read(scope: RecoveryFixture.scope) == pending)
    }
    @Test func sessionAndBackgroundDriftDoNotPublishPrivateCompletion() async throws {
        let vault = RecoveryTestVault(), store = NativeRecoveryStore(journal: .init(vault: vault)); await RecoveryFixture.load(store)
        let input = RecoveryFixture.input()
        var current: NativeDataScope? = RecoveryFixture.scope
        await store.prepare(input: input, current: { current }, post: { _ in
            current = nil; store.bind(nil); return try RecoveryFixture.bytes(RecoveryFixture.preview(input))
        })
        #expect(store.preview == nil); #expect(store.detail == nil)
        #expect(try NativeRecoveryJournal(vault: vault).read(scope: RecoveryFixture.scope) != nil)
        store.bind(RecoveryFixture.scope); store.suspend()
        #expect(store.visiblePreview(current: RecoveryFixture.scope, foreground: false, now: Date()) == nil)
    }
    @Test func missingReservationReaderStaysPendingNotEmptyCoverage() async {
        let store = NativeRecoveryStore(journal: .init(vault: RecoveryTestVault()))
        await RecoveryFixture.load(store, readerMissing: true)
        #expect(!store.reservationComplete); #expect(store.reservations.isEmpty); #expect(store.detail != nil)
        #expect(store.notice == "RESERVATION_READER_PENDING"); #expect(store.preview == nil)
    }
    @Test func actualSession401RetainsUnknownJournalButExplicitLogoutErasesIt() async throws {
        let suite = "recovery-session-" + UUID().uuidString, defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let vault = RecoveryTestVault(), config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [RecoverySessionProtocol.self]
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", RecoveryFixture.scope.endpoint], defaults: defaults,
                                    configuration: config, bundleConfiguration: [:], vault: vault)
        await session.login(email: "synthetic@example.invalid", password: "synthetic-only")
        let scope = try #require(session.dataScope), journal = NativeRecoveryJournal(vault: vault)
        let input = RecoveryFixture.input()
        let pending = NativeRecoveryPending(scope: scope, tripID: RecoveryFixture.trip, baseVersion: 4, operationID: input.operationId,
                                             stage: "preview", body: try input.body())
        try journal.save(pending, scope: scope)
        do { _ = try await session.tripRequest(path: "api/trips/native/v2/\(RecoveryFixture.trip)/recovery", method: "POST", body: pending.body) }
        catch { /* Actual dataRequest → handle(denied) → clear(preserveRecoveryJournal:true). */ }
        #expect(session.dataScope == nil); #expect(session.retainedDataScope == nil)
        #expect(session.status == "expiredOrReplaced"); #expect(try journal.read(scope: scope) == pending)
        // The old credential was removed. Explicit sign out must still locate and erase its journal.
        await session.logout()
        #expect(try journal.read(scope: scope) == nil); #expect(session.status == "signedOut")
    }
    @Test func actualSessionExplicitCleanupFailureFencesIdentityAndKeepsJournal() async throws {
        let suite = "recovery-session-" + UUID().uuidString, defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let vault = RecoveryTestVault(), config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [RecoverySessionProtocol.self]
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", RecoveryFixture.scope.endpoint], defaults: defaults,
                                    configuration: config, bundleConfiguration: [:], vault: vault)
        await session.login(email: "synthetic@example.invalid", password: "synthetic-only")
        let scope = try #require(session.dataScope), journal = NativeRecoveryJournal(vault: vault), input = RecoveryFixture.input()
        let pending = NativeRecoveryPending(scope: scope, tripID: RecoveryFixture.trip, baseVersion: 4, operationID: input.operationId,
                                             stage: "preview", body: try input.body())
        try journal.save(pending, scope: scope); vault.failRecoveryEraseOnly = true
        await session.logout()
        #expect(session.dataScope == nil); #expect(session.status == "storageError")
        #expect(session.failureCode == "recoveryJournalCleanupRequired"); #expect(try journal.read(scope: scope) == pending)
    }
}

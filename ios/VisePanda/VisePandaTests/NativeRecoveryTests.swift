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
                "digest": "trip-v2:" + digest, "stale": false, "evidence": "User report", "assumptions": "Manual verification required"]
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
        #expect(reopened.reviewReference == RecoveryFixture.proposal + ":1:trip-v2:" + RecoveryFixture.digest)
        let restored = try journal.read(scope: RecoveryFixture.scope)
        let acknowledged = try #require(restored)
        #expect(acknowledged.body == pending.body); #expect(acknowledged.operationID == pending.operationID)
        #expect(acknowledged.originalReceipt?.proposalId == RecoveryFixture.proposal)
        #expect(acknowledged.originalProposalDigest == "trip-v2:" + RecoveryFixture.digest)
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
        var unprefixed = try RecoveryFixture.outcome(record: pending)
        var wrongDigest = unprefixed["proposal"] as! [String: Any]; wrongDigest["digest"] = RecoveryFixture.digest; unprefixed["proposal"] = wrongDigest
        let badDigest = try NativeRecoveryWire.decode(NativeRecoveryOutcome.self, unprefixed)
        #expect(throws: (any Error).self) { try badDigest.validate(pending: pending, now: Date()) }
        #expect(!NativeRecoveryWire.proposalDigest("trip-v3:" + RecoveryFixture.digest))
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
        let reservations = NativeReservationJournalVault(vault: vault)
        let reservation = try reservations.retain(.init(operationId: UUID().uuidString.lowercased(), referenceId: UUID().uuidString.lowercased(),
            expectedTripVersion: 4, expectedRevision: 0, fields: .init(title: "Synthetic preservation"), source: .init(), explicitlyConfirmed: true), trip: RecoveryFixture.trip, scope: scope)
        do { _ = try await session.tripRequest(path: "api/trips/native/v2/\(RecoveryFixture.trip)/recovery", method: "POST", body: pending.body) }
        catch { /* Actual dataRequest → handle(denied) → clear(preservePendingJournals:true). */ }
        #expect(session.dataScope == nil); #expect(session.retainedDataScope == nil)
        #expect(session.status == "expiredOrReplaced"); #expect(try journal.read(scope: scope) == pending)
        #expect(try reservations.read(scope) == reservation)
        // Simulate the historical recovery-only index after the credential was removed.
        let key = "native.v2.activeSubject." + scope.endpoint
        defaults.removeObject(forKey: key + ".pendingJournalCleanupOwner")
        defaults.set(scope.subject, forKey: key + ".recoveryCleanupOwner")
        let relaunched = NativeSession(arguments: ["-VisePandaNativeAPI", scope.endpoint], defaults: defaults,
            configuration: config, bundleConfiguration: [:], vault: vault)
        await relaunched.logout()
        #expect(try journal.read(scope: scope) == nil); #expect(try reservations.read(scope) == nil)
        #expect(relaunched.status == "signedOut")
        #expect(defaults.object(forKey: key + ".pendingJournalCleanupOwner") == nil)
        #expect(defaults.object(forKey: key + ".recoveryCleanupOwner") == nil)
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

@Suite("Native qualified transport recovery", .serialized)
@MainActor
struct NativeTransportRecoveryTests {
    static let origin = "00000000-0000-4000-8000-000000000031"
    static let destination = "00000000-0000-4000-8000-000000000032"
    static let receiptID = "00000000-0000-4000-8000-000000000033"
    static func scope(mode: String = "driving") -> NativeTransportScope {
        .init(tripId: RecoveryFixture.trip, expectedHeadVersion: 4, dayId: "day", itemId: "optional",
              originPlaceReferenceId: origin, destinationPlaceReferenceId: destination, mode: mode, departure: "now")
    }
    static func input() -> NativeTransportRecoveryInput {
        .init(operationId: RecoveryFixture.op, expectedHeadVersion: 4, dayId: "day", selectedItemIds: ["optional"],
              fixedItemIds: ["dinner"], reservationBindings: [], receiptId: receiptID, scope: scope(), locale: "zh")
    }
    static func preview() throws -> [String: Any] {
        var value = try RecoveryFixture.preview(RecoveryFixture.input())
        value["report"] = NSNull(); value["sourceSemantics"] = "qualified_foreground_transport"
        value["transportReference"] = ["receiptId": receiptID, "scope": try NativeRecoveryWire.object(scope())]
        return value
    }
    static func durable(qualified: Bool = true, mode: String = "driving", expiry: String? = nil) throws -> [String: Any] {
        ["receiptId": receiptID, "dispatchId": RecoveryFixture.context, "scope": try NativeRecoveryWire.object(scope(mode: mode)),
         "stopEpoch": 3, "policyId": RecoveryFixture.proposal, "policyRevision": 1, "sourceVersion": "source_1",
         "fetchedAt": RecoveryFixture.date(-2), "providerObservedAt": NSNull(), "expiresAt": expiry ?? RecoveryFixture.date(100),
         "selected": ["mode": mode, "durationSeconds": 600, "distanceMeters": 3000, "tmc": NSNull()],
         "alternatives": [], "previousReceiptId": NSNull(), "changeKind": "route_estimate_changed", "durationDeltaSeconds": 180,
         "routeChangeCaveat": true, "r2Qualified": qualified]
    }
    static func observation(qualified: Bool = true) throws -> [String: Any] {
        let receipt = try durable(qualified: qualified)
        return ["kind": "foreground_traffic/1", "status": "observed", "receiptId": receiptID,
                "fetchedAt": receipt["fetchedAt"]!, "expiresAt": receipt["expiresAt"]!, "provider": "amap", "mode": "driving",
                "departure": "now", "providerObservedAt": NSNull(), "currentness": "fetch_time_only",
                "traffic": ["status": "uncovered", "meters": NSNull()], "closure": "uncovered", "realtimeTransit": "uncovered",
                "prediction": "unavailable", "selected": receipt["selected"]!,
                "comparison": ["kind": "route_estimate_changed", "durationDeltaSeconds": 180, "caveat": "estimate_not_traffic_event"],
                "alternatives": [], "durableReceipt": receipt, "fallback": "existing_trip_address_and_navigation", "providerCalls": 1,
                "tripMutation": "none", "qualification": ["status": qualified ? "qualified" : "unavailable", "reason": qualified ? NSNull() : "DURABLE_SOURCE_AUTHORITY_UNAVAILABLE" as Any],
                "policy": ["policyId": RecoveryFixture.proposal, "version": 1, "sourceId": "amap_source", "licenceVersion": "licence_1", "expiresAt": RecoveryFixture.date(200)]]
    }
    @Test func transportJournalRequiresNestedExactScopeAndNeverSynthesizesAReport() throws {
        let input = Self.input(), body = try input.body()
        let root = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        #expect(root["operation"] as? String == "transport")
        #expect((root["input"] as? [String: Any])?["report"] == nil)
        let record = NativeRecoveryPending(scope: RecoveryFixture.scope, tripID: RecoveryFixture.trip, baseVersion: 4,
            operationID: input.operationId, stage: "transport", body: body)
        try record.validate(); #expect(try record.transportInput() == input)
        var row = root, changed = root["input"] as! [String: Any]
        var scope = changed["scope"] as! [String: Any]; scope["callerProof"] = "hash"; changed["scope"] = scope; row["input"] = changed
        let bad = NativeRecoveryPending(scope: RecoveryFixture.scope, tripID: RecoveryFixture.trip, baseVersion: 4,
            operationID: input.operationId, stage: "transport", body: try NativeRecoveryWire.encode(row))
        #expect(throws: (any Error).self) { try bad.validate() }
    }
    @Test func sourceUnionRejectsMissingNullReportsChangedScopeReceiptAndUnsupportedClaims() throws {
        let input = Self.input(), source = try Self.preview(), detail = try RecoveryFixture.detail()
        let bytes = try RecoveryFixture.bytes(source)
        let good = try NativeRecoveryPreview.decode(bytes, preparation: .transport(input))
        try good.validate(input: .transport(input), detail: detail, now: Date())
        for key in ["report", "sourceSemantics", "transportReference", "expiresAt", "callerProof"] {
            var bad = source
            if key == "report" { bad.removeValue(forKey: key) }
            if key == "sourceSemantics" { bad[key] = "user_report" }
            if key == "transportReference" { bad[key] = ["receiptId": RecoveryFixture.proposal, "scope": try NativeRecoveryWire.object(Self.scope())] }
            if key == "expiresAt" { bad[key] = RecoveryFixture.date(-1) }
            if key == "callerProof" { bad[key] = "hash" }
            #expect(throws: (any Error).self) {
                let value = try NativeRecoveryPreview.decode(RecoveryFixture.bytes(bad), preparation: .transport(input))
                try value.validate(input: .transport(input), detail: detail, now: Date())
            }
        }
        var pending = source
        pending["tripId"] = NSNull(); pending["status"] = "pending"; pending["reason"] = "RECOVERY_AUTHORITY_UNAVAILABLE"; pending["candidates"] = []
        for key in ["contextId", "contextDigest", "expiresAt", "reservationBasis"] { pending.removeValue(forKey: key) }
        let value = try NativeRecoveryPreview.decode(RecoveryFixture.bytes(pending), preparation: .transport(input))
        try value.validate(input: .transport(input), detail: detail, now: Date())
    }
    @Test func lostTransportPreparationAckPersistsSameBytesAndDeniedRoundSendsNothing() async throws {
        let vault = RecoveryTestVault(), journal = NativeRecoveryJournal(vault: vault), store = NativeRecoveryStore(journal: journal)
        await RecoveryFixture.load(store)
        let input = Self.input(); var original: Data?
        await store.prepare(input: .transport(input), current: { RecoveryFixture.scope }, post: { bytes in original = bytes; throw URLError(.networkConnectionLost) })
        let pending = try #require(store.pending); #expect(pending.stage == "transport"); #expect(pending.body == original)
        let reopened = NativeRecoveryStore(journal: journal); await RecoveryFixture.load(reopened)
        var sends = 0
        await reopened.replayOriginal(current: { RecoveryFixture.scope }, verify: { RecoveryFixture.scope }, post: { bytes in
            let row = try JSONSerialization.jsonObject(with: bytes) as! [String: Any]
            if row["operation"] as? String == "receipt" { throw NativeDataError.server(code: "FORBIDDEN") }
            sends += 1; return Data()
        })
        #expect(sends == 0); #expect(try journal.read(scope: RecoveryFixture.scope) == pending)
        await RecoveryFixture.load(reopened)
        await reopened.replayOriginal(current: { RecoveryFixture.scope }, verify: { RecoveryFixture.scope }, post: { bytes in
            let row = try JSONSerialization.jsonObject(with: bytes) as! [String: Any]
            if row["operation"] as? String == "receipt" { throw NativeDataError.server(code: "RECOVERY_RECEIPT_UNKNOWN") }
            sends += 1; #expect(bytes == original); return try RecoveryFixture.bytes(Self.preview())
        })
        #expect(sends == 1); #expect(reopened.preview?.sourceSemantics == "qualified_foreground_transport"); #expect(reopened.pending == nil)
        await reopened.select(candidateID: "omit_one", current: { RecoveryFixture.scope }, post: { _ in throw URLError(.timedOut) })
        let selection = try #require(reopened.pending)
        #expect(selection.stage == "select"); #expect(selection.expectedPatch?.operations.first?.itemId == "optional")
        #expect(selection.transportReference?.receiptId == Self.receiptID); #expect(selection.transportReference?.scope == Self.scope())
    }
    @Test func qualificationRejectsModeDriftExpiredFutureReceiptAndClientProof() throws {
        let raw = try Self.durable()
        #expect(try NativeTrafficReceipt.decode(raw, scope: Self.scope(), now: Date()).recoveryQualified)
        for key in ["scope", "expiresAt", "fetchedAt", "providerObservedAt", "callerProof"] {
            var bad = raw
            if key == "scope" { bad[key] = try NativeRecoveryWire.object(Self.scope(mode: "transit")) }
            if key == "expiresAt" { bad[key] = RecoveryFixture.date(-1) }
            if key == "fetchedAt" { bad[key] = RecoveryFixture.date(30) }
            if key == "providerObservedAt" { bad[key] = RecoveryFixture.date(-2) }
            if key == "callerProof" { bad[key] = "hash" }
            #expect(throws: (any Error).self) { try NativeTrafficReceipt.decode(bad, scope: Self.scope(), now: Date()) }
        }
        var falseEvent = try Self.observation(); falseEvent["closure"] = "observed"
        #expect(throws: (any Error).self) { try NativeTrafficObservation.decode(RecoveryFixture.bytes(falseEvent), scope: Self.scope(), previous: nil, now: Date()) }
        let good = try NativeTrafficObservation.decode(RecoveryFixture.bytes(Self.observation()), scope: Self.scope(), previous: nil, now: Date())
        #expect(good.durableReceipt?.receiptId == Self.receiptID)
        // SQL UTC formatting differs from the producer ISO representation, but the instant is identical.
        var utc = try Self.observation(), receipt = utc["durableReceipt"] as! [String: Any]
        receipt["fetchedAt"] = (utc["fetchedAt"] as! String).replacingOccurrences(of: "Z", with: "+00:00")
        utc["durableReceipt"] = receipt
        #expect(try NativeTrafficObservation.decode(RecoveryFixture.bytes(utc), scope: Self.scope(), previous: nil, now: Date()).durableReceipt != nil)
    }
    @Test func trafficScopeStopNeedsNoReceiptAndUnknownStopRemainsUnknown() async throws {
        let store = NativeTrafficStore(); store.bind(RecoveryFixture.scope)
        await store.check(scope: Self.scope(), refresh: false, consent: true, current: { RecoveryFixture.scope }, post: { _ in throw URLError(.timedOut) })
        #expect(store.observation == nil); #expect(store.attemptedScope == Self.scope())
        var stops = 0
        await store.stop(current: { RecoveryFixture.scope }, post: { bytes in
            let row = try JSONSerialization.jsonObject(with: bytes) as! [String: Any]
            #expect(row["operation"] as? String == "stop"); #expect(row["expectedStopEpoch"] is NSNull); #expect(row["previousReceiptId"] is NSNull)
            #expect(row["foreground"] as? Bool == false); stops += 1; throw URLError(.timedOut)
        })
        #expect(stops == 1); #expect(store.notice == "DURABLE_STOP_UNAVAILABLE"); #expect(store.attemptedScope != nil)
    }
    @Test func exactReviewExtendsOnlyOriginalScopeAndBackgroundStopDoesNotUndoAppliedOutcome() async throws {
        let store = NativeTrafficStore(); store.bind(RecoveryFixture.scope)
        store.restoreStopScope(Self.scope())
        var pending = try RecoveryFixture.selectionRecord()
        pending.transportReference = .init(receiptId: Self.receiptID, scope: Self.scope())
        let outcome = try NativeRecoveryWire.decode(NativeRecoveryOutcome.self, RecoveryFixture.outcome(record: pending))
        try store.beginReview(pending: pending, outcome: outcome, current: RecoveryFixture.scope)
        #expect(store.reviewReference == RecoveryFixture.proposal + ":1:trip-v2:" + RecoveryFixture.digest)
        await store.check(scope: Self.scope(), refresh: false, consent: true, current: { RecoveryFixture.scope }, post: { _ in
            Issue.record("Frozen exact review must not issue a provider check"); return Data()
        })
        var stops = 0
        await store.stop(current: { RecoveryFixture.scope }, post: { bytes in
            let row = try JSONSerialization.jsonObject(with: bytes) as! [String: Any]
            #expect(row["operation"] as? String == "stop"); #expect(row["expectedStopEpoch"] is NSNull)
            stops += 1
            return try RecoveryFixture.bytes(["kind": "foreground_traffic/1", "status": "stopped", "reason": "FOREGROUND_STOPPED", "tripMutation": "none",
                "providerCalls": 0, "fallback": "existing_trip_address_and_navigation", "qualification": ["status": "unavailable", "reason": "DURABLE_SOURCE_AUTHORITY_UNAVAILABLE"], "scopeStopConfirmed": true])
        })
        #expect(stops == 1); #expect(store.reviewReference == nil); #expect(store.observation == nil)
        #expect(store.notice == "FOREGROUND_STOPPED")
        // Stop is no Trip writer and cannot turn an applied original operation into a cancellation.
        let applied = try NativeRecoveryWire.decode(NativeRecoveryOutcome.self, RecoveryFixture.outcome(record: pending, state: "applied"))
        try applied.validate(pending: pending, now: Date()); #expect(applied.operation.state == "applied")
        var changed = pending; changed.transportReference = .init(receiptId: Self.receiptID, scope: Self.scope(mode: "transit"))
        #expect(throws: (any Error).self) { try store.beginReview(pending: changed, outcome: outcome, current: RecoveryFixture.scope) }
    }
    @Test func currentOwnerContextHasReadableLabelsAndCannotGrantRecoveryQualification() throws {
        let source: [String: Any] = ["kind": "foreground_traffic_context/1", "tripId": RecoveryFixture.trip, "headVersion": 4,
            "dayId": "day", "itemId": "optional", "references": [
                ["referenceId": Self.origin, "canonicalPoiId": RecoveryFixture.context, "referenceStatus": "current", "displayStatus": "current", "association": "explicit_selection_required",
                 "display": ["zh": "起点", "en": "起点", "addressLines": ["已核实地址"], "source": "current_item_support"]],
                ["referenceId": Self.destination, "canonicalPoiId": RecoveryFixture.proposal, "referenceStatus": "current", "displayStatus": "unavailable", "association": "explicit_selection_required", "display": NSNull()]],
            "completeness": ["references": "complete", "labels": "partial", "scannedItems": 2, "totalItems": 2],
            "stop": ["status": "unavailable", "epoch": NSNull(), "stopped": NSNull()], "qualification": "not_granted_by_context", "providerCalls": 0, "tripMutation": "none"]
        let context = try NativeTrafficContext.decode(RecoveryFixture.bytes(source), trip: RecoveryFixture.trip, version: 4, day: "day", item: "optional")
        #expect(context.references.filter { $0.display != nil }.count == 1); #expect(context.stop.epoch == nil)
        var guessed = source; guessed["qualification"] = "qualified"
        #expect(throws: (any Error).self) { try NativeTrafficContext.decode(RecoveryFixture.bytes(guessed), trip: RecoveryFixture.trip, version: 4, day: "day", item: "optional") }
        var wrongHead = source; wrongHead["headVersion"] = 5
        #expect(throws: (any Error).self) { try NativeTrafficContext.decode(RecoveryFixture.bytes(wrongHead), trip: RecoveryFixture.trip, version: 4, day: "day", item: "optional") }
    }
    @Test func foregroundAndConsentScopeDriftHideTrafficAndBlockR2() async throws {
        let store = NativeTrafficStore(); store.bind(RecoveryFixture.scope)
        await store.check(scope: Self.scope(), refresh: false, consent: true, current: { RecoveryFixture.scope }, post: { _ in try RecoveryFixture.bytes(Self.observation()) })
        #expect(store.receipt(scope: Self.scope(), foreground: true, now: Date())?.receiptId == Self.receiptID)
        #expect(store.receipt(scope: Self.scope(mode: "transit"), foreground: true, now: Date()) == nil)
        #expect(store.receipt(scope: Self.scope(), foreground: false, now: Date()) == nil)
        store.invalidate(); #expect(store.receipt(scope: Self.scope(), foreground: true, now: Date()) == nil)
        await store.check(scope: Self.scope(), refresh: false, consent: false, current: { RecoveryFixture.scope }, post: { _ in Issue.record("No consent must not dispatch"); return Data() })
        #expect(store.observation == nil)
    }
}

import Foundation
import Security
import CryptoKit
import Testing
@testable import VisePanda

@MainActor private final class ServiceOperationTestVault: NativeCredentialVault {
    var values: [String: Data] = [:]
    var failWrite = false
    var failErase = false
    var failServiceErase = false
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        guard let bytes = values[service + owner] else { return (errSecItemNotFound, nil) }; return (errSecSuccess, bytes)
    }
    func write(_ bytes: Data, service: String, owner: String) -> OSStatus {
        guard !failWrite else { return errSecInteractionNotAllowed }; values[service + owner] = bytes; return errSecSuccess
    }
    func remove(service: String, owner: String) -> OSStatus {
        guard !failErase, !(failServiceErase && service.hasPrefix("com.visepanda.native.service-operations.v1.")) else { return errSecInteractionNotAllowed }; values.removeValue(forKey: service + owner); return errSecSuccess
    }
}

@MainActor struct NativeServiceOperationTests {
    static let scope = NativeDataScope(endpoint: "http://127.0.0.1:64001", subject: "11111111-1111-4111-8111-111111111111", mobileEpoch: 3, generation: 0)
    static func command(operationId: String = "22222222-2222-4222-8222-222222222222") throws -> NativeServiceOperationCommand {
        .init(body: try NativeServiceOperationWire.bytes(["action": "request", "operationId": operationId, "caseId": "33333333-3333-4333-8333-333333333333", "expectedRevision": 0, "grantRevision": 1, "urgency": "normal", "trip": ["kind": "unknown"]]))
    }
    @Test func frozenBytesSurviveRestartAndAbandonExactly() throws {
        let vault = ServiceOperationTestVault(), journal = NativeServiceOperationJournal(vault: vault), command = try Self.command()
        let original = try journal.retain(command, scope: Self.scope)
        #expect(try journal.read(Self.scope) == original)
        let restarted = NativeServiceOperationJournal(vault: vault)
        #expect(try restarted.read(Self.scope)?.body == command.body)
        let abandon = try JSONSerialization.jsonObject(with: command.recoveryBody(abandon: true)) as! [String: Any]
        #expect(abandon["mutationBytes"] as? String == String(data: command.body, encoding: .utf8))
        #expect(throws: (any Error).self) { try journal.retain(Self.command(operationId: "44444444-4444-4444-8444-444444444444"), scope: Self.scope) }
        var replaced = Self.scope; replaced = NativeDataScope(endpoint: replaced.endpoint, subject: replaced.subject, mobileEpoch: 4, generation: 0)
        #expect(throws: (any Error).self) { try journal.read(replaced) }
    }
    @Test func journalStorageFailureCannotAuthorizeDispatchOrClaimErasure() throws {
        let vault = ServiceOperationTestVault(), journal = NativeServiceOperationJournal(vault: vault), command = try Self.command()
        vault.failWrite = true
        #expect(throws: (any Error).self) { try journal.retain(command, scope: Self.scope) }
        vault.failWrite = false; let value = try journal.retain(command, scope: Self.scope)
        vault.failErase = true
        #expect(throws: (any Error).self) { try journal.complete(value, scope: Self.scope) }
        #expect(try journal.read(Self.scope) == value)
        vault.failErase = false; try journal.complete(value, scope: Self.scope)
        #expect(try journal.read(Self.scope) == nil)
    }
    @Test func userCannotSupplyStaffAuthorityOrInferTrip() throws {
        let command = try Self.command()
        #expect(try command.action == "request")
        var forged = try command.object; forged["action"] = "accept"
        #expect(throws: (any Error).self) { try NativeServiceOperationCommand(body: NativeServiceOperationWire.bytes(forged)).validate() }
        forged = try command.object; forged["trip"] = ["kind": "bound", "tripId": Self.scope.subject, "headVersion": true]
        #expect(throws: (any Error).self) { try NativeServiceOperationCommand(body: NativeServiceOperationWire.bytes(forged)).validate() }
    }

    static func projection(status: String = "queued") -> [String: Any] {
        let now = floor(Date().timeIntervalSince1970 * 1000)
        return ["caseId": "33333333-3333-4333-8333-333333333333", "revision": 1, "grantRevision": 1, "status": status, "category": "general", "problem": "Issue", "grantState": "active", "expiresAt": now + 60000, "updatedAt": now, "urgency": "normal", "capacity": ["state": "unknown", "checkedAt": now], "staff": NSNull(), "brief": ["kind": "unknown"], "sources": ["kind": "unknown"], "trip": ["kind": "unknown"], "evidence": [], "manualMinutes": 0, "manualMinutesScope": "recorded_only", "proposal": NSNull()]
    }
    static func workspace(_ rows: [[String: Any]] = []) throws -> Data {
        try NativeServiceOperationWire.bytes(["data": ["actorId": Self.scope.subject, "surface": "owner", "cases": rows, "capacity": ["state": "unknown", "checkedAt": floor(Date().timeIntervalSince1970 * 1000)], "complete": true]])
    }
    static func receipt(_ command: NativeServiceOperationCommand) throws -> [String: Any] {
        ["operationId": try command.operationId, "requestDigest": SHA256.hash(data: command.body).map { String(format: "%02x", $0) }.joined(), "action": try command.action, "outcome": "applied", "caseId": try command.caseId, "revision": 1, "grantRevision": 1, "createdAt": floor(Date().timeIntervalSince1970 * 1000)]
    }
    @Test func queueCannotInventStaffOrMinutesAndContactCannotResolve() throws {
        var value = Self.projection()
        #expect(try NativeServiceProjection.decode(value).status == .queued)
        value["manualMinutes"] = 1
        #expect(throws: (any Error).self) { try NativeServiceProjection.decode(value) }
        value = Self.projection(status: "resolved")
        let now = floor(Date().timeIntervalSince1970 * 1000)
        value["staff"] = ["actorId": Self.scope.subject, "label": "Staff", "acceptedAt": now - 10000, "shiftEndsAt": now + 10000]
        value["evidence"] = [["kind": "contacted_provider", "note": "Contact sent", "reference": "case receipt", "observedAt": now]]
        #expect(throws: (any Error).self) { try NativeServiceProjection.decode(value) }
        value["evidence"] = [["kind": "external_resolution", "note": "Provider resolved", "reference": "provider receipt", "observedAt": now]]
        #expect(try NativeServiceProjection.decode(value).status == .resolved)
    }
    @Test func proposalMustMatchAuthoritativeTripAndMinutesRemainRecordedOnly() throws {
        var value = Self.projection(status: "cancelled")
        value["proposal"] = ["proposalId": Self.scope.subject, "tripId": Self.scope.subject, "baseVersion": 1]
        #expect(throws: (any Error).self) { try NativeServiceProjection.decode(value) }
        value["trip"] = ["kind": "bound", "tripId": Self.scope.subject, "headVersion": 1]
        #expect(try NativeServiceProjection.decode(value).proposal != nil)
        value["manualMinutesScope"] = "total"
        #expect(throws: (any Error).self) { try NativeServiceProjection.decode(value) }
    }
    @Test func receiptChecksFrozenDigestAndOperationIdentity() throws {
        let command = try Self.command(); var value = try Self.receipt(command)
        #expect(try NativeServiceOperationReceipt.decode(value, command: command).outcome == "applied")
        value["requestDigest"] = String(repeating: "a", count: 64)
        #expect(throws: (any Error).self) { try NativeServiceOperationReceipt.decode(value, command: command) }
        value = try Self.receipt(command); value["operationId"] = Self.scope.subject
        #expect(throws: (any Error).self) { try NativeServiceOperationReceipt.decode(value, command: command) }
    }
    @Test func ttlAndAccountChangesHideWorkspaceAndLateReads() async throws {
        var uptime = 100.0; let store = NativeServiceOperationStore(uptime: { uptime })
        store.restore(actor: Self.scope) { nil }
        await store.load(actor: Self.scope, current: { Self.scope }) { _ in try Self.workspace([Self.projection()]) }
        #expect(store.visible(caseId: try Self.command().caseId, actor: Self.scope) != nil)
        uptime = 131
        #expect(store.visible(caseId: try Self.command().caseId, actor: Self.scope) == nil)
        var current: NativeDataScope? = Self.scope
        await store.load(actor: Self.scope, current: { current }) { _ in current = nil; return try Self.workspace([Self.projection()]) }
        #expect(store.cases.isEmpty)
    }
    @Test func incompleteWorkspaceAndDuplicateRowsAreUnavailable() async throws {
        let store = NativeServiceOperationStore(); store.restore(actor: Self.scope) { nil }
        await store.load(actor: Self.scope, current: { Self.scope }) { _ in try Self.workspace([Self.projection(), Self.projection()]) }
        #expect(!store.isFresh(Self.scope))
        await store.load(actor: Self.scope, current: { Self.scope }) { _ in
            var envelope = try JSONSerialization.jsonObject(with: Self.workspace()) as! [String: Any]
            var data = envelope["data"] as! [String: Any]; data["complete"] = 1; envelope["data"] = data
            return try NativeServiceOperationWire.bytes(envelope)
        }
        #expect(!store.isFresh(Self.scope))
    }
    @Test func unknownAckAndAbsentReceiptKeepOriginalBeforeExactRetry() async throws {
        let vault = ServiceOperationTestVault(), journal = NativeServiceOperationJournal(vault: vault), store = NativeServiceOperationStore(), command = try Self.command()
        store.restore(actor: Self.scope) { try journal.read(Self.scope) }
        await store.load(actor: Self.scope, current: { Self.scope }) { _ in try Self.workspace() }
        await store.perform(command: command, actor: Self.scope, current: { Self.scope }, read: { try journal.read(Self.scope) }, retain: { try journal.retain($0, scope: Self.scope) }, complete: { try journal.complete($0, scope: Self.scope) }) { bytes, _ in
            #expect(try journal.read(Self.scope)?.body == bytes); throw NativeDataError.server(code: "UNAUTHENTICATED")
        }
        #expect(store.pending?.body == command.body)
        let restored = NativeServiceOperationStore(); restored.restore(actor: Self.scope) { try journal.read(Self.scope) }
        await restored.perform(command: nil, recovery: .read, actor: Self.scope, current: { Self.scope }, read: { try journal.read(Self.scope) }, retain: { try journal.retain($0, scope: Self.scope) }, complete: { try journal.complete($0, scope: Self.scope) }) { bytes, _ in
            #expect(bytes == (try command.recoveryBody())); return try NativeServiceOperationWire.bytes(["data": ["receipt": NSNull()]])
        }
        #expect(restored.receiptAbsent && restored.pending != nil)
        await restored.load(actor: Self.scope, current: { Self.scope }) { _ in try Self.workspace() }
        await restored.perform(command: nil, recovery: .retry, actor: Self.scope, current: { Self.scope }, read: { try journal.read(Self.scope) }, retain: { try journal.retain($0, scope: Self.scope) }, complete: { try journal.complete($0, scope: Self.scope) }) { bytes, _ in
            #expect(bytes == command.body); return try NativeServiceOperationWire.bytes(["data": Self.receipt(command)])
        }
        #expect(restored.pending == nil && restored.receipt != nil)
        #expect(try journal.read(Self.scope) == nil)
    }
    @Test func erasedOperationRequiresExplicitLocalStopAndKeepsOutcomeUnknown() async throws {
        let vault = ServiceOperationTestVault(), journal = NativeServiceOperationJournal(vault: vault), command = try Self.command()
        _ = try journal.retain(command, scope: Self.scope)
        let store = NativeServiceOperationStore(); store.restore(actor: Self.scope) { try journal.read(Self.scope) }
        await store.perform(command: nil, recovery: .read, actor: Self.scope, current: { Self.scope }, read: { try journal.read(Self.scope) }, retain: { try journal.retain($0, scope: Self.scope) }, complete: { try journal.complete($0, scope: Self.scope) }) { _, _ in throw NativeDataError.server(code: "CASE_OPERATION_ERASED") }
        #expect(store.erased && store.pending != nil && store.receipt == nil)
        vault.failErase = true
        store.stopErasedRecovery(actor: Self.scope, current: { Self.scope }, read: { try journal.read(Self.scope) }, complete: { try journal.complete($0, scope: Self.scope) })
        #expect(store.pending != nil)
        vault.failErase = false
        store.stopErasedRecovery(actor: Self.scope, current: { Self.scope }, read: { try journal.read(Self.scope) }, complete: { try journal.complete($0, scope: Self.scope) })
        #expect(store.pending == nil && store.notice == "ERASED_OUTCOME_UNKNOWN" && store.receipt == nil)
        #expect(try journal.read(Self.scope) == nil)
    }
    @Test func responseAfterAccountChangeCannotClearDurableUnknownWrite() async throws {
        let vault = ServiceOperationTestVault(), journal = NativeServiceOperationJournal(vault: vault), command = try Self.command(), store = NativeServiceOperationStore()
        var current: NativeDataScope? = Self.scope
        store.restore(actor: Self.scope) { try journal.read(Self.scope) }
        await store.load(actor: Self.scope, current: { current }) { _ in try Self.workspace() }
        await store.perform(command: command, actor: Self.scope, current: { current }, read: { try journal.read(Self.scope) }, retain: { try journal.retain($0, scope: Self.scope) }, complete: { try journal.complete($0, scope: Self.scope) }) { _, _ in
            current = nil; return try NativeServiceOperationWire.bytes(["data": Self.receipt(command)])
        }
        #expect(store.receipt == nil)
        #expect(try journal.read(Self.scope)?.body == command.body)
    }
    static func dataCommand() throws -> NativeServiceOperationCommand {
        .init(body: try NativeServiceOperationWire.bytes(["action": "delete", "operationId": "44444444-4444-4444-8444-444444444444", "caseId": "33333333-3333-4333-8333-333333333333", "grantRevision": 2, "confirmed": true]))
    }
    static func dataReceipt(_ command: NativeServiceOperationCommand, outcome: String = "deleted") throws -> [String: Any] {
        ["schemaVersion": "service-case-data/1", "kind": "receipt", "operationId": try command.operationId, "requestDigest": SHA256.hash(data: command.body).map { String(format: "%02x", $0) }.joined(), "outcome": outcome, "createdAt": floor(Date().timeIntervalSince1970 * 1000), "allUserDataCompleted": false]
    }
    static let exportSession = "55555555-5555-4555-8555-555555555555"
    static let exportRequest = "66666666-6666-4666-8666-666666666666"
    static func bundle() -> [String: Any] {
        let now = floor(Date().timeIntervalSince1970 * 1000)
        var coverage = Dictionary(uniqueKeysWithValues: NativeServiceDataBundle.domains.map { ($0, "complete") })
        coverage["brief"] = "unavailable"; coverage["attachments"] = "unavailable"
        return ["schemaVersion": "service-case-data/1", "kind": "bundle", "requestId": exportRequest, "ownerId": Self.scope.subject, "sessionId": exportSession, "capturedAt": now, "expiresAt": now + 20000, "sourceDigest": String(repeating: "a", count: 64), "corePackageEnrollment": "not_enrolled", "allUserDataCompleted": false, "coverage": coverage, "rows": [["key": "case:1", "domain": "case", "value": ["problem": "Own issue"]]]]
    }
    static func decodeBundle(_ value: [String: Any]) throws -> NativeServiceDataBundle {
        try NativeServiceDataBundle.decode(NativeServiceOperationWire.bytes(["data": value]), actor: Self.scope, sessionId: exportSession, requestId: exportRequest)
    }
    @Test func dataCanonicalInitialTripVersionZeroStaysBoundWithoutMutation() throws {
        var value = Self.projection(status: "cancelled")
        value["trip"] = ["kind": "bound", "tripId": Self.scope.subject, "headVersion": 0]
        value["proposal"] = ["proposalId": Self.exportRequest, "tripId": Self.scope.subject, "baseVersion": 0]
        let result = try NativeServiceProjection.decode(value)
        #expect(result.trip.headVersion == 0 && result.proposal?.baseVersion == 0)
        var command = try Self.command().object; command["trip"] = value["trip"]
        try NativeServiceOperationCommand(body: NativeServiceOperationWire.bytes(command)).validate()
        command = ["action": "select_proposal", "operationId": Self.exportSession, "caseId": result.id, "expectedRevision": result.revision, "grantRevision": result.grantRevision, "proposal": value["proposal"]!]
        try NativeServiceOperationCommand(body: NativeServiceOperationWire.bytes(command)).validate()
        var forged = value["trip"] as! [String: Any]; forged["headVersion"] = false; value["trip"] = forged
        #expect(throws: (any Error).self) { try NativeServiceProjection.decode(value) }
    }
    @Test func dataDeleteRequiresConfirmationAndExactMinimalReceipt() throws {
        let command = try Self.dataCommand(); try command.validate()
        #expect(try command.isData)
        var value = try command.object; value["confirmed"] = 1
        #expect(throws: (any Error).self) { try NativeServiceOperationCommand(body: NativeServiceOperationWire.bytes(value)).validate() }
        value = try Self.dataReceipt(command)
        let receipt = try NativeServiceOperationReceipt.decode(value, command: command)
        #expect(receipt.outcome == "deleted" && receipt.caseId == nil && receipt.action == "delete")
        value["allUserDataCompleted"] = true
        #expect(throws: (any Error).self) { try NativeServiceOperationReceipt.decode(value, command: command) }
        value = try Self.dataReceipt(command); value["caseId"] = try command.caseId
        #expect(throws: (any Error).self) { try NativeServiceOperationReceipt.decode(value, command: command) }
        value = try Self.dataReceipt(command); value["requestDigest"] = String(repeating: "b", count: 64)
        #expect(throws: (any Error).self) { try NativeServiceOperationReceipt.decode(value, command: command) }
    }
    @Test func dataDeleteUnknownAckAndAbsentReceiptRecoverViaDataFamily() async throws {
        let command = try Self.dataCommand(), vault = ServiceOperationTestVault(), journal = NativeServiceOperationJournal(vault: vault), store = NativeServiceOperationStore()
        store.restore(actor: Self.scope) { try journal.read(Self.scope) }
        // Data recovery is independent of operations availability, including a deleted case.
        await store.perform(command: command, actor: Self.scope, current: { Self.scope }, read: { try journal.read(Self.scope) }, retain: { try journal.retain($0, scope: Self.scope) }, complete: { try journal.complete($0, scope: Self.scope) }) { bytes, dataFamily in
            #expect(dataFamily && bytes == command.body); throw NativeDataError.server(code: "CASE_DATA_UNAVAILABLE")
        }
        #expect(store.pending != nil)
        await store.perform(command: nil, recovery: .read, actor: Self.scope, current: { Self.scope }, read: { try journal.read(Self.scope) }, retain: { try journal.retain($0, scope: Self.scope) }, complete: { try journal.complete($0, scope: Self.scope) }) { bytes, dataFamily in
            let expected = try command.recoveryBody(); #expect(dataFamily && bytes == expected); return try NativeServiceOperationWire.bytes(["data": ["receipt": NSNull()]])
        }
        #expect(store.receiptAbsent && store.pending != nil)
        await store.perform(command: nil, recovery: .retry, actor: Self.scope, current: { Self.scope }, read: { try journal.read(Self.scope) }, retain: { try journal.retain($0, scope: Self.scope) }, complete: { try journal.complete($0, scope: Self.scope) }) { bytes, dataFamily in
            #expect(dataFamily && bytes == command.body); return try NativeServiceOperationWire.bytes(["data": Self.dataReceipt(command)])
        }
        #expect(store.receipt?.outcome == "deleted" && store.pending == nil)
        #expect(try journal.read(Self.scope) == nil)
    }
    @Test func dataAbandonUsesOriginalDeleteBytesAndDoesNotClaimDeletion() async throws {
        let command = try Self.dataCommand(), vault = ServiceOperationTestVault(), journal = NativeServiceOperationJournal(vault: vault), store = NativeServiceOperationStore()
        _ = try journal.retain(command, scope: Self.scope); store.restore(actor: Self.scope) { try journal.read(Self.scope) }
        await store.perform(command: nil, recovery: .abandon, actor: Self.scope, current: { Self.scope }, read: { try journal.read(Self.scope) }, retain: { try journal.retain($0, scope: Self.scope) }, complete: { try journal.complete($0, scope: Self.scope) }) { bytes, dataFamily in
            let value = try JSONSerialization.jsonObject(with: bytes) as! [String: Any]
            #expect(dataFamily && value["mutationBytes"] as? String == String(data: command.body, encoding: .utf8))
            return try NativeServiceOperationWire.bytes(["data": Self.dataReceipt(command, outcome: "cancelled")])
        }
        #expect(store.receipt?.outcome == "cancelled" && store.pending == nil)
    }
    @Test func dataExportChecksActorSessionRequestExpiryAndRealCoverage() throws {
        let good = Self.bundle(), bundle = try Self.decodeBundle(good)
        #expect(bundle.rowCount == 1 && bundle.counts["case"] == 1)
        for (key, replacement) in [("ownerId", Self.exportRequest as Any), ("sessionId", Self.exportRequest as Any), ("requestId", Self.exportSession as Any), ("allUserDataCompleted", 0 as Any), ("corePackageEnrollment", "enrolled" as Any), ("expiresAt", 1 as Any)] {
            var value = good; value[key] = replacement
            #expect(throws: (any Error).self) { try Self.decodeBundle(value) }
        }
        var duplicate = good; let rows = good["rows"] as! [[String: Any]]; duplicate["rows"] = rows + rows
        #expect(throws: (any Error).self) { try Self.decodeBundle(duplicate) }
        var coverage = good["coverage"] as! [String: String]; coverage["brief"] = "complete"
        var invalid = good; invalid["coverage"] = coverage
        #expect(throws: (any Error).self) { try Self.decodeBundle(invalid) }
    }
    @Test func dataExportRejectsBytesBeyond512KiB() throws {
        let bytes = try NativeServiceOperationWire.bytes(["data": Self.bundle()])
        let limit = 524_288
        let atLimit = bytes + Data(repeating: 0x20, count: limit - bytes.count)
        #expect(atLimit.count == limit)
        #expect(try NativeServiceDataBundle.decode(atLimit, actor: Self.scope, sessionId: Self.exportSession, requestId: Self.exportRequest).rowCount == 1)
        let oversized = atLimit + Data([0x20])
        #expect(oversized.count == limit + 1)
        #expect(throws: (any Error).self) {
            try NativeServiceDataBundle.decode(oversized, actor: Self.scope, sessionId: Self.exportSession, requestId: Self.exportRequest)
        }
    }
    @Test func dataExportDeliversSeparateArtifactAndCleansOnlyOwnedFiles() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("service-export-test-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let retained = root.appendingPathComponent("unrelated.json"); try Data("keep".utf8).write(to: retained)
        let bundle = try Self.decodeBundle(Self.bundle()), started = ProcessInfo.processInfo.systemUptime
        let file = try NativeServiceExportFile.create(bundle: bundle, actor: Self.scope, started: started, directoryRoot: root)
        #expect(try Data(contentsOf: file.url) == bundle.bytes)
        #expect(file.artifactDigest != bundle.sourceDigest && file.current(actor: Self.scope))
        #expect(!file.current(actor: nil) && !file.current(actor: Self.scope, uptime: file.deadline + 1))
        let orphan = root.appendingPathComponent("vp-service-export-" + UUID().uuidString); try FileManager.default.createDirectory(at: orphan, withIntermediateDirectories: false)
        try NativeServiceExportFile.sweepOrphans(directoryRoot: root)
        #expect(!FileManager.default.fileExists(atPath: orphan.path) && FileManager.default.fileExists(atPath: file.url.path))
        try NativeServiceExportFile.erase(file)
        #expect(!FileManager.default.fileExists(atPath: file.url.path) && FileManager.default.fileExists(atPath: retained.path))
    }
    @Test func grantsAndFutureStatesNeverImplyAcceptance() throws {
        for state in ["active", "revoked", "future_state", "requested", "queued"] {
            let value = try JSONDecoder().decode(NativeServiceOperationStatus.self, from: Data("\"\(state)\"".utf8))
            #expect(!value.mayShowAcceptance)
            #expect(!value.isTerminal)
        }
        #expect(NativeServiceOperationStatus.accepted.mayShowAcceptance)
        #expect(NativeServiceOperationStatus.cancelled.isTerminal)
        #expect(!NativeServiceOperationStatus.cancelled.mayShowAcceptance)
    }
    @Test func wireRejectsBooleanCountersAndOpenShapes() throws {
        #expect(throws: (any Error).self) { try NativeServiceOperationWire.integer(true) }
        #expect(throws: (any Error).self) { try NativeServiceOperationWire.integer(0.5) }
        #expect(throws: (any Error).self) { try NativeServiceOperationWire.integer(-1) }
        #expect(throws: (any Error).self) { try NativeServiceOperationWire.object(["id": "x", "accepted": true], keys: ["id"]) }
        #expect(throws: (any Error).self) { try NativeServiceOperationWire.identifier("local-selection") }
        #expect(try NativeServiceOperationWire.integer(0) == 0)
    }
}

#if !SWIFT_PACKAGE
nonisolated private final class ServiceOperationSessionProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "127.0.0.1" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let path = request.url!.path, owner = "11111111-1111-4111-8111-111111111111"
        let status: Int, value: [String: Any]
        if path.hasSuffix("/credentials") { status = 200; value = ["subject": owner, "accessToken": "synthetic-only", "refreshToken": "synthetic-only", "expiresAt": Date().timeIntervalSince1970 + 3600] }
        else if path.hasSuffix("/login") { status = 200; value = ["subject": owner, "mobileEpoch": 3] }
        else if path.hasSuffix("/profile") { status = 200; value = ["subject": owner, "displayName": "Synthetic"] }
        else if path.hasSuffix("/logout") { status = 200; value = [:] }
        else { status = 401; value = ["error": ["code": "UNAUTHENTICATED"]] }
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: try! JSONSerialization.data(withJSONObject: value)); client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
@MainActor extension NativeServiceOperationTests {
    @Test func actualSessionDenialPreservesBytesAndRelaunchLogoutErasesThem() async throws {
        let name = "service-operation-session-" + UUID().uuidString, defaults = UserDefaults(suiteName: name)!
        defer { defaults.removePersistentDomain(forName: name) }
        let vault = ServiceOperationTestVault(), configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ServiceOperationSessionProtocol.self]
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", Self.scope.endpoint], defaults: defaults, configuration: configuration, bundleConfiguration: [:], vault: vault)
        await session.login(email: "synthetic@example.invalid", password: "synthetic-only")
        let actor = try #require(session.dataScope), command = try Self.command()
        let pending = try session.rememberServiceOperation(command, actor: actor)
        do { _ = try await session.serviceOperationRequest(body: command.body, actor: actor) } catch { }
        #expect(session.dataScope == nil && session.status == "expiredOrReplaced")
        #expect(try NativeServiceOperationJournal(vault: vault).read(actor) == pending)
        let index = "native.v2.activeSubject." + actor.endpoint + ".pendingJournalCleanupOwner"
        #expect(defaults.string(forKey: index) == actor.subject)
        let relaunched = NativeSession(arguments: ["-VisePandaNativeAPI", actor.endpoint], defaults: defaults, configuration: configuration, bundleConfiguration: [:], vault: vault)
        await relaunched.logout()
        #expect(try NativeServiceOperationJournal(vault: vault).read(actor) == nil)
        #expect(relaunched.status == "signedOut" && defaults.object(forKey: index) == nil)
    }
    @Test func actualSessionServiceEraseFailureFencesIdentityAndRetainsRecovery() async throws {
        let name = "service-operation-session-" + UUID().uuidString, defaults = UserDefaults(suiteName: name)!
        defer { defaults.removePersistentDomain(forName: name) }
        let vault = ServiceOperationTestVault(), configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ServiceOperationSessionProtocol.self]
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", Self.scope.endpoint], defaults: defaults, configuration: configuration, bundleConfiguration: [:], vault: vault)
        await session.login(email: "synthetic@example.invalid", password: "synthetic-only")
        let actor = try #require(session.dataScope), pending = try session.rememberServiceOperation(Self.command(), actor: actor)
        vault.failServiceErase = true; await session.logout()
        #expect(session.dataScope == nil && session.status == "storageError" && session.failureCode == "serviceOperationCleanupRequired")
        #expect(try NativeServiceOperationJournal(vault: vault).read(actor) == pending)
    }
}
#endif

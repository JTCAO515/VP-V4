import XCTest
import Security
@testable import VisePanda

nonisolated final class NativeTravelerBriefTests: XCTestCase {
    @MainActor private var actor: NativeDataScope { NativeDataScope(endpoint: "http://127.0.0.1:64820", subject: "12345678-1234-4234-8234-123456789abc", mobileEpoch: 2, generation: 1) }

    @MainActor private func boundary(actor: NativeDataScope? = nil, caseID: String = "case-a", purpose: String = "transport",
                          recipient: String = "staff-a", grant: Int = 1, brief: Int = 0,
                          frontier: String = "source-revision-1") -> NativeTravelerBriefSelection.Boundary {
        .init(actor: actor ?? self.actor, caseID: caseID, purpose: purpose, recipientID: recipient,
              grantRevision: grant, briefRevision: brief, sourceFrontier: frontier)
    }

    @MainActor func testBriefAccessRequiresBothIndividualSelectionAndExplicitConfirmation() throws {
        var selection = NativeTravelerBriefSelection(boundary: boundary(), availableKeys: ["problem", "memory-a"])
        selection.confirm()
        XCTAssertThrowsError(try selection.authorizedKeys(current: boundary()))
        selection.select("memory-not-offered", include: true)
        XCTAssertTrue(selection.selectedKeys.isEmpty)
        selection.select("problem", include: true)
        XCTAssertThrowsError(try selection.authorizedKeys(current: boundary()))
        selection.confirm()
        XCTAssertEqual(try selection.authorizedKeys(current: boundary()), ["problem"])
        selection.select("memory-a", include: true)
        XCTAssertThrowsError(try selection.authorizedKeys(current: boundary()))
        selection.confirm()
        XCTAssertEqual(try selection.authorizedKeys(current: boundary()), ["memory-a", "problem"])
    }

    @MainActor func testOldReviewCannotSurviveCorrectionGrantReplacementCaseOrSessionChange() throws {
        var selection = NativeTravelerBriefSelection(boundary: boundary(), availableKeys: ["memory-a"])
        selection.select("memory-a", include: true)
        selection.confirm()
        let replaced = NativeDataScope(endpoint: actor.endpoint, subject: actor.subject, mobileEpoch: 3, generation: 2)
        let other = NativeDataScope(endpoint: actor.endpoint, subject: "22345678-1234-4234-8234-123456789abc", mobileEpoch: 2, generation: 1)
        for changed in [boundary(actor: replaced), boundary(actor: other), boundary(caseID: "case-b"),
                        boundary(purpose: "accommodation"), boundary(recipient: "staff-b"), boundary(grant: 2),
                        boundary(brief: 1), boundary(frontier: "source-revision-2")] {
            XCTAssertThrowsError(try selection.authorizedKeys(current: changed))
        }
    }

    @MainActor func testRefreshDoesNotCarryForwardPreviouslyAuthorizedFields() throws {
        var old = NativeTravelerBriefSelection(boundary: boundary(), availableKeys: ["problem", "memory-a"])
        old.select("memory-a", include: true)
        old.confirm()
        let fresh = NativeTravelerBriefSelection(boundary: boundary(frontier: "source-revision-2"), availableKeys: ["problem"])
        XCTAssertTrue(fresh.selectedKeys.isEmpty)
        XCTAssertFalse(fresh.confirmed)
        XCTAssertThrowsError(try fresh.authorizedKeys(current: fresh.boundary))
    }

    private let caseID = "32345678-1234-4234-8234-123456789abc"
    private let recipient = "42345678-1234-4234-8234-123456789abc"
    private let operation = "52345678-1234-4234-8234-123456789abc"
    private let digest = String(repeating: "a", count: 64)
    @MainActor private func command() throws -> NativeTravelerBriefCommand {
        try .init(body: NativeTravelerBriefWire.bytes(["action": "withdraw", "operationId": operation, "caseId": caseID,
            "recipientId": recipient, "grantRevision": 1, "expectedRevision": 1, "confirmed": true]))
    }
    @MainActor private func problem() -> [String: Any] {
        ["key": "problem", "field": "problem", "state": "available", "value": "Which official channel handles this issue?", "provenance": "explicit",
         "source": ["kind": "case", "id": caseID, "revision": 1, "updatedAt": Date().timeIntervalSince1970.rounded(.down) * 1000,
                    "receiptId": NSNull(), "consentId": NSNull(), "basisDigest": digest]]
    }
    @MainActor private func snapshot() -> [String: Any] {
        let now = Date().timeIntervalSince1970.rounded(.down) * 1000
        return ["schemaVersion": "traveler-brief/1", "kind": "preview", "caseId": caseID, "ownerId": actor.subject,
                "recipientId": recipient, "grantRevision": 1, "purpose": "case_assistance", "category": "transport", "revision": 1,
                "sourceDigest": digest, "createdAt": now, "expiresAt": now + 60_000, "previewId": "62345678-1234-4234-8234-123456789abc",
                "fields": [problem(), ["key": "budget", "field": "budget", "state": "unknown"]], "noticeVersion": "case-minimal-brief/1"]
    }
    @MainActor private func receipt(_ command: NativeTravelerBriefCommand, outcome: String = "applied") throws -> Data {
        try NativeTravelerBriefWire.bytes(["data": ["schemaVersion": "traveler-brief/1", "kind": "receipt", "operationId": command.operationID,
            "requestDigest": command.digest, "caseId": command.caseID, "action": command.action, "outcome": outcome,
            "revision": 2, "grantRevision": 1, "createdAt": Date().timeIntervalSince1970.rounded(.down) * 1000]])
    }
    @MainActor private func previewBody() throws -> Data {
        try NativeTravelerBriefWire.bytes(["action": "preview", "caseId": caseID, "recipientId": recipient, "grantRevision": 1,
                                          "sources": ["profilePace": false, "memories": [], "intakeMessageId": NSNull()]])
    }
    @MainActor private func load(_ store: NativeTravelerBriefStore, current: () -> NativeDataScope?) async throws {
        store.bind(actor)
        let snapshot = try NativeTravelerBriefWire.bytes(["data": snapshot()])
        await store.loadPreview(body: try previewBody(), actor: actor, caseID: caseID, recipientID: recipient, grantRevision: 1,
                                current: current, request: { body in
            let raw = try JSONSerialization.jsonObject(with: body) as? [String: Any]
            if raw?["action"] as? String == "read" { throw NativeDataError.server(code: "BRIEF_UNAVAILABLE") }
            return snapshot
        })
        await store.loadOwnerCase(actor: actor, caseID: caseID, current: current, request: { _ in
            try NativeTravelerBriefWire.bytes(["data": ["cases": [["caseId": self.caseID, "recipientId": self.recipient, "grantRevision": 1, "grantState": "revoked"]], "staff": []]])
        })
        await store.loadAudit(actor: actor, caseID: caseID, current: current, request: { _ in
            try NativeTravelerBriefWire.bytes(["data": ["schemaVersion": "traveler-brief/1", "kind": "audit", "caseId": self.caseID, "ownerId": self.actor.subject,
                                                       "revision": 1, "events": [], "complete": true]])
        })
    }

    @MainActor func testUnknownCannotCarryValueAndSensitiveInferenceOrWrongCaseSourceIsRejected() throws {
        let value = try NativeTravelerBriefSnapshot(raw: snapshot(), actor: actor, caseID: caseID)
        XCTAssertEqual(value.fields.filter(\.available).map(\.key), ["problem"])
        var unknown: [String: Any] = ["key": "budget", "field": "budget", "state": "unknown", "value": "invented"]
        XCTAssertThrowsError(try NativeTravelerBriefField.decode(unknown))
        unknown = problem(); unknown["provenance"] = "inferred"
        XCTAssertThrowsError(try NativeTravelerBriefField.decode(unknown))
        var forged = snapshot(), field = problem(), source = try XCTUnwrap(field["source"] as? [String: Any])
        source["id"] = "72345678-1234-4234-8234-123456789abc"; field["source"] = source; forged["fields"] = [field]
        XCTAssertThrowsError(try NativeTravelerBriefSnapshot(raw: forged, actor: actor, caseID: caseID))
        forged = snapshot(); forged["revision"] = true
        XCTAssertThrowsError(try NativeTravelerBriefSnapshot(raw: forged, actor: actor, caseID: caseID))
    }

    @MainActor func testLegitimateSharedSubsetUsesItsOwnSourceDigestAndRemainsVisible() async throws {
        let store = NativeTravelerBriefStore(), actor = self.actor
        store.bind(actor)
        let full = snapshot(); var minimal = full
        minimal["kind"] = "brief"; minimal.removeValue(forKey: "previewId"); minimal["updatedAt"] = minimal.removeValue(forKey: "createdAt")
        minimal["sourceDigest"] = String(repeating: "b", count: 64); minimal["fields"] = [problem()]
        let previewBytes = try NativeTravelerBriefWire.bytes(["data": full]), sharedBytes = try NativeTravelerBriefWire.bytes(["data": minimal])
        await store.loadPreview(body: try previewBody(), actor: actor, caseID: caseID, recipientID: recipient, grantRevision: 1,
                                current: { actor }, request: { body in
            let raw = try JSONSerialization.jsonObject(with: body) as? [String: Any]
            return raw?["action"] as? String == "read" ? sharedBytes : previewBytes
        })
        XCTAssertEqual(store.shared(actor)?.fields.map(\.key), ["problem"])
        XCTAssertEqual(store.shared(actor)?.sourceDigest, String(repeating: "b", count: 64))
        XCTAssertEqual(store.visible(actor)?.sourceDigest, digest)
        XCTAssertTrue(store.selection?.selectedKeys.isEmpty == true)
    }

    @MainActor func testShareWriterRejectsUncheckedFieldsAndChangedPreviewDigestBeforeNetwork() async throws {
        let actor = self.actor, store = NativeTravelerBriefStore(), vault = BriefTestVault(), journal = NativeTravelerBriefJournal(vault: vault)
        try await load(store, current: { actor })
        let snapshot = try XCTUnwrap(store.visible(actor))
        store.select("problem", include: true, actor: actor)
        XCTAssertThrowsError(try NativeTravelerBriefCommand(action: "share", snapshot: snapshot, actor: actor, selection: store.selection))
        store.confirm(actor: actor)
        let selected = try NativeTravelerBriefCommand(action: "share", snapshot: snapshot, actor: actor, selection: store.selection)
        XCTAssertEqual(selected.selectedKeys, ["problem"])
        var forged = try XCTUnwrap(JSONSerialization.jsonObject(with: selected.body) as? [String: Any])
        forged["sourceDigest"] = String(repeating: "b", count: 64)
        let wrongDigest = try NativeTravelerBriefCommand(body: NativeTravelerBriefWire.bytes(forged)); var requests = 0
        await store.perform(command: wrongDigest, actor: actor, current: { actor }, read: { try journal.read(actor) }, retain: { try journal.retain($0, actor: actor) },
                            complete: { try journal.complete($0, actor: actor) }, request: { _ in requests += 1; return Data() })
        XCTAssertEqual(requests, 0); XCTAssertNil(try journal.read(actor))
        forged = try XCTUnwrap(JSONSerialization.jsonObject(with: selected.body) as? [String: Any]); forged["selectedKeys"] = ["problem", "budget"]
        let unchecked = try NativeTravelerBriefCommand(body: NativeTravelerBriefWire.bytes(forged))
        await store.perform(command: unchecked, actor: actor, current: { actor }, read: { try journal.read(actor) }, retain: { try journal.retain($0, actor: actor) },
                            complete: { try journal.complete($0, actor: actor) }, request: { _ in requests += 1; return Data() })
        XCTAssertEqual(requests, 0); XCTAssertNil(store.pending)
    }

    @MainActor func testOriginalWhitespaceBytesSurviveRestartAndCannotBeOverwrittenOrReadByOtherEpoch() throws {
        let vault = BriefTestVault(), journal = NativeTravelerBriefJournal(vault: vault), original = try command()
        let padded = try NativeTravelerBriefCommand(body: Data(" \n".utf8) + original.body + Data("\n".utf8))
        XCTAssertNotEqual(original.digest, padded.digest)
        let retained = try journal.retain(padded, actor: actor)
        XCTAssertEqual(try NativeTravelerBriefJournal(vault: vault).read(actor), retained)
        XCTAssertThrowsError(try journal.retain(original, actor: actor))
        let replaced = NativeDataScope(endpoint: actor.endpoint, subject: actor.subject, mobileEpoch: 3, generation: 1)
        XCTAssertThrowsError(try journal.read(replaced))
        let abandon = try XCTUnwrap(JSONSerialization.jsonObject(with: padded.recoveryBody(abandon: true)) as? [String: Any])
        XCTAssertEqual(abandon["mutationBytes"] as? String, String(data: padded.body, encoding: .utf8))
        vault.failErase = true
        XCTAssertThrowsError(try journal.complete(retained, actor: actor))
        XCTAssertEqual(try journal.read(actor), retained)
    }

    @MainActor func testLostACKNullReceiptAndWrongDigestPreserveOriginalOperationUntilMatchedAbandon() async throws {
        let vault = BriefTestVault(), journal = NativeTravelerBriefJournal(vault: vault), store = NativeTravelerBriefStore(), actor = self.actor
        try await load(store, current: { actor })
        let original = try command()
        await store.perform(command: original, actor: actor, current: { actor }, read: { try journal.read(actor) },
                            retain: { try journal.retain($0, actor: actor) }, complete: { try journal.complete($0, actor: actor) },
                            request: { bytes in XCTAssertEqual(bytes, original.body); throw URLError(.networkConnectionLost) })
        let pending = try XCTUnwrap(store.pending)
        XCTAssertNil(store.visible(actor)); XCTAssertNil(store.receipt)
        await store.perform(command: nil, recovery: .read, actor: actor, current: { actor }, read: { try journal.read(actor) },
                            retain: { try journal.retain($0, actor: actor) }, complete: { try journal.complete($0, actor: actor) },
                            request: { _ in try NativeTravelerBriefWire.bytes(["data": ["receipt": NSNull()]]) })
        XCTAssertEqual(store.pending, pending); XCTAssertTrue(store.receiptAbsent)
        var wrong = try XCTUnwrap(NativeTravelerBriefWire.payload(receipt(original)) as? [String: Any]); wrong["requestDigest"] = String(repeating: "b", count: 64)
        let wrongBytes = try NativeTravelerBriefWire.bytes(["data": wrong])
        await store.perform(command: nil, recovery: .retry, actor: actor, current: { actor }, read: { try journal.read(actor) },
                            retain: { try journal.retain($0, actor: actor) }, complete: { try journal.complete($0, actor: actor) }, request: { _ in wrongBytes })
        XCTAssertEqual(store.pending, pending); XCTAssertEqual(try journal.read(actor), pending)
        await store.perform(command: nil, recovery: .abandon, actor: actor, current: { actor }, read: { try journal.read(actor) },
                            retain: { try journal.retain($0, actor: actor) }, complete: { try journal.complete($0, actor: actor) },
                            request: { bytes in
            let raw = try XCTUnwrap(JSONSerialization.jsonObject(with: bytes) as? [String: Any])
            XCTAssertEqual(raw["mutationBytes"] as? String, String(data: pending.body, encoding: .utf8))
            return try self.receipt(original)
        })
        XCTAssertNil(store.pending); XCTAssertNil(try journal.read(actor)); XCTAssertEqual(store.receipt?.outcome, "applied")
    }

    @MainActor func testChangedAccountDuringACKCannotPublishReceiptOrEraseOldOwnersJournal() async throws {
        let vault = BriefTestVault(), journal = NativeTravelerBriefJournal(vault: vault), store = NativeTravelerBriefStore()
        let originalActor = actor; var current: NativeDataScope? = originalActor
        try await load(store, current: { current })
        let command = try command()
        await store.perform(command: command, actor: originalActor, current: { current }, read: { try journal.read(originalActor) },
                            retain: { try journal.retain($0, actor: originalActor) }, complete: { try journal.complete($0, actor: originalActor) }, request: { _ in
            current = NativeDataScope(endpoint: originalActor.endpoint, subject: "82345678-1234-4234-8234-123456789abc", mobileEpoch: 2, generation: 2)
            return try self.receipt(command)
        })
        XCTAssertNil(store.receipt); XCTAssertNotNil(try journal.read(originalActor)); XCTAssertNil(store.visible(current))
        store.bind(current); XCTAssertNil(store.pending)
    }

    @MainActor func testStorageFailurePreventsNetworkAndTTLRemovesAllReadableContent() async throws {
        let vault = BriefTestVault(), journal = NativeTravelerBriefJournal(vault: vault); var now = 100.0
        let store = NativeTravelerBriefStore(uptime: { now }), actor = self.actor
        try await load(store, current: { actor }); XCTAssertNotNil(store.visible(actor))
        vault.failWrite = true; var requests = 0
        await store.perform(command: try command(), actor: actor, current: { actor }, read: { try journal.read(actor) },
                            retain: { try journal.retain($0, actor: actor) }, complete: { try journal.complete($0, actor: actor) }, request: { _ in
            requests += 1; return Data()
        })
        XCTAssertEqual(requests, 0); XCTAssertNil(store.pending)
        now = 131; XCTAssertNil(store.visible(actor)); XCTAssertNil(store.shared(actor))
    }

    @MainActor func testExportRequiresExactOwnerSessionLeaseAndRejectsCopiedSourceValues() throws {
        let request = "92345678-1234-4234-8234-123456789abc", session = "a2345678-1234-4234-8234-123456789abc"
        let now = Date().timeIntervalSince1970.rounded(.down) * 1000
        var bundle: [String: Any] = ["schemaVersion": "traveler-brief-data/1", "kind": "bundle", "requestId": request, "ownerId": actor.subject,
            "sessionId": session, "capturedAt": now, "expiresAt": now + 30_000, "sourceDigest": digest, "corePackageEnrollment": "not_enrolled", "allUserDataCompleted": false,
            "coverage": ["brief": "complete", "previews": "complete", "audit": "complete", "operations": "complete", "sourceValues": "not_copied", "attachments": "unavailable"], "rows": []]
        func bytes() throws -> Data { try NativeTravelerBriefWire.bytes(["data": bundle]) }
        let decoded = try NativeTravelerBriefBundle(bytes: bytes(), actor: actor, sessionID: session, requestID: request)
        XCTAssertEqual(decoded.rowCount, 0)
        XCTAssertThrowsError(try NativeTravelerBriefBundle(bytes: bytes(), actor: actor, sessionID: request, requestID: request))
        bundle["allUserDataCompleted"] = true
        XCTAssertThrowsError(try NativeTravelerBriefBundle(bytes: bytes(), actor: actor, sessionID: session, requestID: request))
        bundle["allUserDataCompleted"] = false; bundle["rows"] = [["key": "memory", "domain": "memory", "value": ["summary": "Copied private value"]]]
        XCTAssertThrowsError(try NativeTravelerBriefBundle(bytes: bytes(), actor: actor, sessionID: session, requestID: request))
        bundle["rows"] = []; bundle["expiresAt"] = now - 1000
        XCTAssertThrowsError(try NativeTravelerBriefBundle(bytes: bytes(), actor: actor, sessionID: session, requestID: request))
        bundle["expiresAt"] = now + 30_000
        var deleted: [String: Any] = ["caseId": caseID, "revision": 2, "recipientId": recipient, "grantRevision": 1, "state": "deleted",
            "selectedKeys": [], "sourceDigest": NSNull(), "sources": NSNull(), "updatedAt": now, "expiresAt": NSNull()]
        bundle["rows"] = [["key": "brief:own", "domain": "brief", "value": deleted]]
        XCTAssertEqual(try NativeTravelerBriefBundle(bytes: bytes(), actor: actor, sessionID: session, requestID: request).rowCount, 1)
        deleted["selectedKeys"] = ["problem"]; bundle["rows"] = [["key": "brief:own", "domain": "brief", "value": deleted]]
        XCTAssertThrowsError(try NativeTravelerBriefBundle(bytes: bytes(), actor: actor, sessionID: session, requestID: request))
    }

    @MainActor func testRevokedGrantOwnerCleanupWorksWithoutAnActivePreview() async throws {
        let actor = self.actor, store = NativeTravelerBriefStore(), vault = BriefTestVault(), journal = NativeTravelerBriefJournal(vault: vault)
        store.bind(actor)
        await store.loadOwnerCase(actor: actor, caseID: caseID, current: { actor }, request: { _ in
            try NativeTravelerBriefWire.bytes(["data": ["cases": [["caseId": self.caseID, "recipientId": self.recipient, "grantRevision": 1, "grantState": "revoked"]], "staff": []]])
        })
        await store.loadAudit(actor: actor, caseID: caseID, current: { actor }, request: { _ in
            try NativeTravelerBriefWire.bytes(["data": ["schemaVersion": "traveler-brief/1", "kind": "audit", "caseId": self.caseID, "ownerId": actor.subject, "revision": 1, "events": [], "complete": true]])
        })
        XCTAssertNil(store.visible(actor)); XCTAssertNotNil(store.cleanupBinding(actor))
        let command = try command()
        await store.perform(command: command, actor: actor, current: { actor }, read: { try journal.read(actor) }, retain: { try journal.retain($0, actor: actor) },
                            complete: { try journal.complete($0, actor: actor) }, request: { _ in try self.receipt(command) })
        XCTAssertEqual(store.receipt?.outcome, "applied"); XCTAssertNil(store.pending)
    }

    @MainActor func testActualSessionDenialPreservesOriginalJournalAndExplicitLogoutErasesIt() async throws {
        let name = "traveler-brief-session-" + UUID().uuidString, defaults = try XCTUnwrap(UserDefaults(suiteName: name))
        defer { defaults.removePersistentDomain(forName: name) }
        let vault = BriefTestVault(), configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [BriefSessionProtocol.self]
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", actor.endpoint], defaults: defaults, configuration: configuration, bundleConfiguration: [:], vault: vault)
        await session.login(email: "synthetic@example.invalid", password: "synthetic-only")
        let scope = try XCTUnwrap(session.dataScope), original = try session.rememberTravelerBrief(command(), actor: scope)
        do { _ = try await session.travelerBriefRequest(body: original.body, actor: scope) } catch { }
        XCTAssertNil(session.dataScope); XCTAssertEqual(session.status, "expiredOrReplaced")
        XCTAssertEqual(try NativeTravelerBriefJournal(vault: vault).read(scope), original)
        let relaunched = NativeSession(arguments: ["-VisePandaNativeAPI", scope.endpoint], defaults: defaults, configuration: configuration, bundleConfiguration: [:], vault: vault)
        await relaunched.logout()
        XCTAssertNil(try NativeTravelerBriefJournal(vault: vault).read(scope)); XCTAssertEqual(relaunched.status, "signedOut")
    }

    @MainActor func testActualSessionBriefEraseFailureFencesIdentityAndDoesNotClaimErasure() async throws {
        let name = "traveler-brief-session-" + UUID().uuidString, defaults = try XCTUnwrap(UserDefaults(suiteName: name))
        defer { defaults.removePersistentDomain(forName: name) }
        let vault = BriefTestVault(), configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [BriefSessionProtocol.self]
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", actor.endpoint], defaults: defaults, configuration: configuration, bundleConfiguration: [:], vault: vault)
        await session.login(email: "synthetic@example.invalid", password: "synthetic-only")
        let scope = try XCTUnwrap(session.dataScope), original = try session.rememberTravelerBrief(command(), actor: scope)
        vault.failBriefErase = true; await session.logout()
        XCTAssertNil(session.dataScope); XCTAssertEqual(session.status, "storageError"); XCTAssertEqual(session.failureCode, "travelerBriefCleanupRequired")
        XCTAssertEqual(try NativeTravelerBriefJournal(vault: vault).read(scope), original)
    }
}

@MainActor private final class BriefTestVault: NativeCredentialVault {
    var values: [String: Data] = [:]
    var failWrite = false
    var failErase = false
    var failBriefErase = false
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        guard let value = values[service + owner] else { return (errSecItemNotFound, nil) }; return (errSecSuccess, value)
    }
    func write(_ bytes: Data, service: String, owner: String) -> OSStatus {
        guard !failWrite else { return errSecInteractionNotAllowed }; values[service + owner] = bytes; return errSecSuccess
    }
    func remove(service: String, owner: String) -> OSStatus {
        guard !failErase, !(failBriefErase && service.hasPrefix("com.visepanda.native.traveler-brief.v1.")) else { return errSecInteractionNotAllowed }; values.removeValue(forKey: service + owner); return errSecSuccess
    }
}

nonisolated private final class BriefSessionProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "127.0.0.1" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let url = request.url else { return }
        let owner = "12345678-1234-4234-8234-123456789abc", status: Int, value: [String: Any]
        if url.path.hasSuffix("/credentials") { status = 200; value = ["subject": owner, "accessToken": "synthetic-only", "refreshToken": "synthetic-only", "expiresAt": Date().timeIntervalSince1970 + 3600] }
        else if url.path.hasSuffix("/login") { status = 200; value = ["subject": owner, "mobileEpoch": 2] }
        else if url.path.hasSuffix("/profile") { status = 200; value = ["subject": owner, "displayName": "Synthetic"] }
        else if url.path.hasSuffix("/logout") { status = 200; value = [:] }
        else { status = 401; value = ["error": ["code": "UNAUTHENTICATED"]] }
        guard let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"]),
              let bytes = try? JSONSerialization.data(withJSONObject: value) else { return }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: bytes); client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

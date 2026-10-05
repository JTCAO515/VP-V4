import Foundation
import Security
import Testing
@testable import VisePanda

@MainActor private final class PlaceActionVault: NativeCredentialVault {
    var values: [String: Data] = [:]
    var failReadback = false
    var failErase = false
    var failPlaceErase = false
    func write(_ data: Data, service: String, owner: String) -> OSStatus { values[service + owner] = data; return errSecSuccess }
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        if failReadback { return (errSecInteractionNotAllowed, nil) }
        guard let data = values[service + owner] else { return (errSecItemNotFound, nil) }; return (errSecSuccess, data)
    }
    func remove(service: String, owner: String) -> OSStatus {
        if failErase || failPlaceErase && service.hasPrefix("com.visepanda.native.place-actions.v1.") { return errSecInteractionNotAllowed }; values.removeValue(forKey: service + owner); return errSecSuccess
    }
}

@MainActor private enum PlaceActionFixture {
    static let trip = "11111111-1111-4111-8111-111111111111"
    static let owner = "22222222-2222-4222-8222-222222222222"
    static let canonical = "33333333-3333-4333-8333-333333333333"
    static let operation = "44444444-4444-4444-8444-444444444444"
    static let reference = "55555555-5555-4555-8555-555555555555"
    static let proposal = "66666666-6666-4666-8666-666666666666"
    static let scope = NativeDataScope(endpoint: "http://127.0.0.1:64001", subject: owner, mobileEpoch: 3, generation: 0)
    static let digest = String(repeating: "a", count: 64)
    static let candidate = NativePlaceCandidate(provider: .amap, providerPoiId: "real-provider-reference", rawName: "Place", matchedCanonicalPoiId: canonical)
    static var target: NativePlaceActionSelection { get throws { .init(scope: scope, place: try .init(candidate: candidate), tripId: trip, baseVersion: 0) } }
    static func date(_ delta: Double = 0) -> String { ISO8601DateFormatter().string(from: Date().addingTimeInterval(delta)) }
    static func context(saved: Bool = false) -> [String: Any] {
        ["kind": "place_action_context", "tripId": trip, "tripVersion": 0, "selection": ["canonicalPoiId": canonical, "provider": "amap", "providerPoiId": candidate.providerPoiId],
         "mappingDigest": digest, "contextDigest": digest, "snapshot": ["version": 0, "title": "Trip", "days": [["id": "day", "date": "2026-10-05", "timeZone": "Asia/Shanghai", "items": []]]],
         "displayTitle": "Current canonical label", "referenceId": saved ? reference as Any : NSNull(), "saved": saved ? ["referenceId": reference, "revision": 1, "status": "saved", "mappingDigest": digest] as Any : NSNull(),
         "sourceCandidatesStatus": "unavailable", "sourceCandidates": [], "evaluatedAt": date(-1), "expiresAt": date(20)]
    }
    static func command(action: String = "save") throws -> NativePlaceActionCommand {
        var value: [String: Any] = ["action": action, "operationId": operation, "expectedTripVersion": 0,
                                   "selection": ["canonicalPoiId": canonical, "provider": "amap", "providerPoiId": candidate.providerPoiId], "expectedMappingDigest": digest]
        if action == "add" { value.merge(["dayId": "day", "itemId": "new-item", "startsAt": date(60), "endsAt": date(3660), "locale": "en"]) { _, new in new } }
        else { value["expectedSaveRevision"] = 0 }
        return .init(tripId: trip, body: try NativePlaceActionWire.bytes(value))
    }
    static func receipt(_ command: NativePlaceActionCommand) throws -> [String: Any] {
        let input = try command.object, add = try command.action == "add"
        return ["kind": "place_action_receipt", "tripId": trip, "operationId": operation, "action": try command.action, "selection": input["selection"]!,
                "tripVersion": 0, "mappingDigest": digest, "requestDigest": digest, "referenceId": reference, "savedRevision": add ? NSNull() : 1,
                "savedStatus": add ? NSNull() : "saved", "proposal": add ? ["proposalId": proposal, "revision": 1, "baseTripVersion": 0] as Any : NSNull(),
                "proposalReview": add ? ["id": proposal, "revision": 1, "digest": "trip-v2:" + digest, "baseVersion": 0] as Any : NSNull(), "preview": NSNull(),
                "historicalOnly": true, "currentEligibilityRequiresRead": true]
    }
}

@MainActor struct NativePlaceActionTests {
    @Test func zeroVersionAndClosedContext() throws {
        let target = try PlaceActionFixture.target
        let bytes = try NativePlaceActionWire.bytes(PlaceActionFixture.context())
        let result = try NativePlaceActionContext.decode(bytes, expected: target)
        #expect(result.tripVersion == 0 && result.saved == nil && result.days.count == 1 && result.sourceCandidatesStatus == "unavailable")
        var invalid = PlaceActionFixture.context(); invalid["qualified"] = true
        #expect(throws: (any Error).self) { try NativePlaceActionContext.decode(NativePlaceActionWire.bytes(invalid), expected: target) }
        invalid = PlaceActionFixture.context(); invalid["tripVersion"] = true
        #expect(throws: (any Error).self) { try NativePlaceActionContext.decode(NativePlaceActionWire.bytes(invalid), expected: target) }
    }
    @Test func unknownMappingCannotBecomeCanonical() throws {
        let unmapped = NativePlaceCandidate(provider: .amap, providerPoiId: "x", rawName: "Place", matchedCanonicalPoiId: nil)
        #expect(throws: (any Error).self) { try NativePlaceActionIdentity(candidate: unmapped) }
        let identity = try NativePlaceActionIdentity(candidate: PlaceActionFixture.candidate)
        #expect(!identity.matches(.init(provider: .tencent, providerPoiId: "x", rawName: "Place", matchedCanonicalPoiId: PlaceActionFixture.canonical)))
    }
    @Test func staleAndExpiredContextHideActions() async throws {
        var uptime = 100.0
        let store = NativePlaceActionStore(uptime: { uptime }), target = try PlaceActionFixture.target
        store.restore(scope: target.scope) { nil }
        await store.load(target: target, locale: "en", current: { target }) { _ in try NativePlaceActionWire.bytes(PlaceActionFixture.context()) }
        #expect(store.visible(target) != nil)
        uptime = 131
        #expect(store.visible(target) == nil)
        var expired = PlaceActionFixture.context(); expired["expiresAt"] = PlaceActionFixture.date(-1)
        #expect(throws: (any Error).self) { try NativePlaceActionContext.decode(NativePlaceActionWire.bytes(expired), expected: target) }
    }
    @Test func responseAfterActorOrSelectionChangeIsDiscarded() async throws {
        let store = NativePlaceActionStore(), target = try PlaceActionFixture.target
        var current: NativePlaceActionSelection? = target
        store.restore(scope: target.scope) { nil }
        await store.load(target: target, locale: "en", current: { current }) { _ in current = nil; return try NativePlaceActionWire.bytes(PlaceActionFixture.context()) }
        #expect(store.context == nil)
    }
    @Test func unknownAckRestoresOnlyOriginalBytes() async throws {
        let vault = PlaceActionVault(), journal = NativePlaceActionJournal(vault: vault), command = try PlaceActionFixture.command(), scope = PlaceActionFixture.scope
        let store = NativePlaceActionStore(); store.restore(scope: scope) { try journal.read(scope) }
        var firstBody: Data?
        await store.perform(command: command, scope: scope, recover: false, current: { scope }, read: { try journal.read(scope) }, retain: { try journal.retain($0, scope: scope) }, complete: { try journal.complete($0, scope: scope) }) { _, body in
            #expect(try journal.read(scope)?.command.body == body); firstBody = body; throw NativeDataError.server(code: "UNAUTHENTICATED")
        }
        #expect(firstBody == command.body && store.pending?.command == command)
        let restored = NativePlaceActionStore(); restored.restore(scope: scope) { try journal.read(scope) }
        await restored.perform(command: nil, scope: scope, recover: true, current: { scope }, read: { try journal.read(scope) }, retain: { try journal.retain($0, scope: scope) }, complete: { try journal.complete($0, scope: scope) }) { _, body in
            #expect(body == (try command.recoveryBody())); return try NativePlaceActionWire.bytes(["kind": "receipt_absent", "tripId": scope.subject == PlaceActionFixture.owner ? PlaceActionFixture.trip : "invalid", "operationId": PlaceActionFixture.operation])
        }
        #expect(restored.receiptAbsent)
        #expect(try journal.read(scope) != nil)
        await restored.perform(command: nil, scope: scope, recover: true, retryOriginal: true, current: { scope }, read: { try journal.read(scope) }, retain: { try journal.retain($0, scope: scope) }, complete: { try journal.complete($0, scope: scope) }) { _, body in
            #expect(body == command.body); return try NativePlaceActionWire.bytes(PlaceActionFixture.receipt(command))
        }
        #expect(restored.receipt?.savedStatus == "saved")
        #expect(try journal.read(scope) == nil)
    }
    @Test func journalCannotOverwriteUnknownOperationOrIgnoreStorageFailure() throws {
        let vault = PlaceActionVault(), journal = NativePlaceActionJournal(vault: vault), scope = PlaceActionFixture.scope, command = try PlaceActionFixture.command()
        let original = try journal.retain(command, scope: scope)
        var different = try command.object; different["operationId"] = UUID().uuidString.lowercased()
        #expect(throws: (any Error).self) { try journal.retain(.init(tripId: command.tripId, body: NativePlaceActionWire.bytes(different)), scope: scope) }
        vault.failErase = true
        #expect(throws: (any Error).self) { try journal.complete(original, scope: scope) }
        #expect(try journal.read(scope) == original)
        vault.failReadback = true
        #expect(throws: (any Error).self) { try journal.read(scope) }
    }
    @Test func receiptRejectsWrongOperationAndCasRevision() throws {
        let command = try PlaceActionFixture.command(), pending = NativePlaceActionPending(scope: PlaceActionFixture.scope, command: command)
        var raw = try PlaceActionFixture.receipt(command); raw["operationId"] = UUID().uuidString.lowercased()
        #expect(throws: (any Error).self) { try NativePlaceActionReceipt.decode(NativePlaceActionWire.bytes(raw), pending: pending) }
        raw = try PlaceActionFixture.receipt(command); raw["savedRevision"] = 2
        #expect(throws: (any Error).self) { try NativePlaceActionReceipt.decode(NativePlaceActionWire.bytes(raw), pending: pending) }
    }
    @Test func originalProposalReferenceUsesRealDigestAndRejectsRevisionChange() throws {
        let command = try PlaceActionFixture.command(action: "add"), pending = NativePlaceActionPending(scope: PlaceActionFixture.scope, command: command)
        var raw = try PlaceActionFixture.receipt(command)
        let receipt = try NativePlaceActionReceipt.decode(NativePlaceActionWire.bytes(raw), pending: pending)
        #expect(receipt?.proposalReview?.id == PlaceActionFixture.proposal + ":1:trip-v2:" + PlaceActionFixture.digest)
        raw["proposalReview"] = ["id": PlaceActionFixture.proposal, "revision": 1, "digest": PlaceActionFixture.digest, "baseVersion": 0]
        #expect(throws: (any Error).self) { try NativePlaceActionReceipt.decode(NativePlaceActionWire.bytes(raw), pending: pending) }
    }
    @Test func withdrawalStillAllowsExactUnsaveAndActorChangeClearsPointer() async throws {
        let store = NativePlaceActionStore(), target = try PlaceActionFixture.target
        store.restore(scope: target.scope) { nil }
        await store.load(target: target, locale: "en", current: { target }) { _ in try NativePlaceActionWire.bytes(PlaceActionFixture.context(saved: true)) }
        store.invalidateContext()
        let forget = try store.forgetRemembered(scope: target.scope); try forget.validate()
        #expect(try forget.object["referenceId"] as? String == PlaceActionFixture.reference)
        #expect(try forget.object["expectedSaveRevision"] as? Int == 1)
        store.restore(scope: .init(endpoint: target.scope.endpoint, subject: UUID().uuidString.lowercased(), mobileEpoch: 4, generation: 1)) { nil }
        #expect(store.rememberedSaved == nil)
    }
}

@MainActor extension NativePlaceActionTests {
    @Test func abandonRequiresBoundPersistedTerminalAndKeepsCommittedSave() async throws {
        let scope = PlaceActionFixture.scope, command = try PlaceActionFixture.command()
        let vault = PlaceActionVault(), journal = NativePlaceActionJournal(vault: vault)
        _ = try journal.retain(command, scope: scope)
        let store = NativePlaceActionStore(); store.restore(scope: scope) { try journal.read(scope) }
        await store.perform(command: nil, scope: scope, recover: true, abandon: true, current: { scope }, read: { try journal.read(scope) }, retain: { try journal.retain($0, scope: scope) }, complete: { try journal.complete($0, scope: scope) }) { _, body in
            let raw = try NativePlaceActionWire.object(body)
            #expect(raw["action"] as? String == "abandon")
            #expect(try NativePlaceActionWire.bytes(raw["request"] as! [String: Any]) == command.body)
            return try NativePlaceActionWire.bytes(PlaceActionFixture.receipt(command))
        }
        #expect(store.cancelled == nil && store.receipt?.savedStatus == "saved")
        #expect(try journal.read(scope) == nil)
        _ = try journal.retain(command, scope: scope); store.restore(scope: scope) { try journal.read(scope) }
        let cancelled: [String: Any] = ["kind": "place_action_cancelled", "tripId": command.tripId, "operationId": PlaceActionFixture.operation,
                                       "action": "save", "selection": try command.object["selection"]!, "tripVersion": 0, "mappingDigest": PlaceActionFixture.digest,
                                       "requestDigest": PlaceActionFixture.digest, "historicalOnly": true, "currentEligibilityRequiresRead": true]
        await store.perform(command: nil, scope: scope, recover: true, abandon: true, current: { scope }, read: { try journal.read(scope) }, retain: { try journal.retain($0, scope: scope) }, complete: { try journal.complete($0, scope: scope) }) { _, _ in try NativePlaceActionWire.bytes(cancelled) }
        #expect(store.cancelled?.operationId == PlaceActionFixture.operation && store.receipt == nil)
        #expect(try journal.read(scope) == nil)
        var wrong = cancelled; wrong["tripVersion"] = 1
        #expect(throws: (any Error).self) { try NativePlaceActionCancelled.decode(NativePlaceActionWire.bytes(wrong), pending: .init(scope: scope, command: command)) }
    }
    @Test func askKeepsValidatedLabelAndRequiresSameTripExplicitDraftOnly() async throws {
        let store = NativePlaceActionStore(), target = try PlaceActionFixture.target
        store.restore(scope: target.scope) { nil }
        await store.load(target: target, locale: "zh", current: { target }) { _ in try NativePlaceActionWire.bytes(PlaceActionFixture.context()) }
        let value = await store.ask(target: target, locale: "zh", current: { target }) { body in
            let raw = try NativePlaceActionWire.object(body); #expect(raw["action"] as? String == "ask")
            return try NativePlaceActionWire.bytes(["kind": "place_ask_context", "tripId": target.tripId, "tripVersion": 0,
                "selection": NativePlaceActionWire.place(target.place), "mappingDigest": PlaceActionFixture.digest, "contextDigest": PlaceActionFixture.digest,
                "referenceId": NSNull(), "selectedSources": ["artifact": NSNull(), "trip": ["tripId": target.tripId, "headVersion": 0], "evidence": []],
                "currentInput": NativePlaceActionWire.place(target.place), "readyForProvider": false, "purpose": "first_party_reference_only", "expiresAt": PlaceActionFixture.date(29), "handoff": NSNull()])
        }
        #expect(value?.name == "Current canonical label" && value?.poiID == PlaceActionFixture.canonical)
        #expect(value?.tripID == target.tripId && value?.readiness == "recheck_required")
        // Return windows are freshly verified by the server, but must still be
        // current and bounded. Neither expiry nor an unbounded lease is accepted.
        for expiry in [PlaceActionFixture.date(-1), PlaceActionFixture.date(60)] {
            let rejected = await store.ask(target: target, locale: "zh", current: { target }) { _ in
                try NativePlaceActionWire.bytes(["kind": "place_ask_context", "tripId": target.tripId, "tripVersion": 0,
                    "selection": NativePlaceActionWire.place(target.place), "mappingDigest": PlaceActionFixture.digest, "contextDigest": PlaceActionFixture.digest,
                    "referenceId": NSNull(), "selectedSources": ["artifact": NSNull(), "trip": ["tripId": target.tripId, "headVersion": 0], "evidence": []],
                    "currentInput": NativePlaceActionWire.place(target.place), "readyForProvider": false, "purpose": "first_party_reference_only", "expiresAt": expiry, "handoff": NSNull()])
            }
            #expect(rejected == nil)
        }
    }
    @Test func interruptedWriteCannotPublishReceiptOrEraseOriginalJournal() async throws {
        let scope = PlaceActionFixture.scope, command = try PlaceActionFixture.command()
        let vault = PlaceActionVault(), journal = NativePlaceActionJournal(vault: vault), store = NativePlaceActionStore()
        var current: NativeDataScope? = scope
        store.restore(scope: scope) { nil }
        await store.perform(command: command, scope: scope, recover: false, current: { current }, read: { try journal.read(scope) }, retain: { try journal.retain($0, scope: scope) }, complete: { try journal.complete($0, scope: scope) }) { _, _ in
            current = nil; store.clear(); return try NativePlaceActionWire.bytes(PlaceActionFixture.receipt(command))
        }
        #expect(store.receipt == nil && store.pending == nil)
        #expect(try journal.read(scope)?.command == command)
    }
}

@MainActor extension NativePlaceActionTests {
    @Test func savedPaginationKeepsWithdrawnOriginalIdentityAndRejectsCursorDrift() async throws {
        let scope = PlaceActionFixture.scope, row: [String: Any] = ["referenceId": PlaceActionFixture.reference, "revision": 2, "status": "saved",
            "selection": ["canonicalPoiId": PlaceActionFixture.canonical, "provider": "amap", "providerPoiId": "saved-original-provider-id"], "mappingDigest": PlaceActionFixture.digest,
            "displayTitle": NSNull(), "mappingStatus": "unavailable"]
        let page: [String: Any] = ["kind": "saved_place_actions", "tripId": PlaceActionFixture.trip, "tripVersion": 0, "contextDigest": PlaceActionFixture.digest,
            "items": [row], "hasMore": true, "nextCursor": ["contextDigest": PlaceActionFixture.digest, "afterCanonicalPoiId": PlaceActionFixture.canonical]]
        let store = NativeSavedPlaceStore()
        await store.load(scope: scope, tripId: PlaceActionFixture.trip, version: 0, locale: "en", current: { true }) { body in
            let input = try NativePlaceActionWire.object(body)
            #expect(input["action"] as? String == "saved" && input["limit"] as? Int == 20)
            return try NativePlaceActionWire.bytes(page)
        }
        let item = try #require(store.visible(scope: scope, tripId: PlaceActionFixture.trip, version: 0)?.first)
        #expect(item.selection.providerPoiId == "saved-original-provider-id")
        #expect(item.label(chinese: true) == "已收藏地点引用（名称暂不可用）")
        let cursor = try #require(store.nextCursor)
        #expect(store.hasMore && cursor.afterCanonicalPoiId == PlaceActionFixture.canonical)
        var changed = page; changed["contextDigest"] = String(repeating: "b", count: 64)
        await store.load(scope: scope, tripId: PlaceActionFixture.trip, version: 0, locale: "en", cursor: cursor, current: { true }) { _ in try NativePlaceActionWire.bytes(changed) }
        #expect(store.unavailable && store.visible(scope: scope, tripId: PlaceActionFixture.trip, version: 0) == nil)
        // Relaunch path seeds only owned saved metadata. Live mapping is not required for Unsave.
        let actions = NativePlaceActionStore(), target = NativePlaceActionSelection(scope: scope, place: item.selection, tripId: PlaceActionFixture.trip, baseVersion: 0)
        actions.restore(scope: scope) { nil }; actions.rememberSaved(item, target: target)
        let command = try actions.forgetRemembered(scope: scope); try command.validate()
        #expect(try command.object["expectedSaveRevision"] as? Int == 2)
        #expect(try NativePlaceActionWire.selection(command.object["selection"] as Any) == item.selection)
    }
}

#if !VP_PLACE_ACTION_HOST
nonisolated private final class PlaceActionSessionProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "127.0.0.1" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let path = request.url!.path, owner = "22222222-2222-4222-8222-222222222222"
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
@MainActor extension NativePlaceActionTests {
    @Test func actualSessionDenialPreservesJournalAndRelaunchLogoutCleansIt() async throws {
        let name = "place-action-session-" + UUID().uuidString, defaults = UserDefaults(suiteName: name)!
        defer { defaults.removePersistentDomain(forName: name) }
        let vault = PlaceActionVault(), config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [PlaceActionSessionProtocol.self]
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", PlaceActionFixture.scope.endpoint], defaults: defaults, configuration: config, bundleConfiguration: [:], vault: vault)
        await session.login(email: "synthetic@example.invalid", password: "synthetic-only")
        let scope = try #require(session.dataScope), command = try PlaceActionFixture.command()
        let pending = try session.rememberPlaceAction(command, actor: scope)
        do { _ = try await session.placeActionRequest(tripId: command.tripId, body: command.body, actor: scope) } catch { }
        #expect(session.dataScope == nil && session.status == "expiredOrReplaced")
        #expect(try NativePlaceActionJournal(vault: vault).read(scope) == pending)
        let index = "native.v2.activeSubject." + scope.endpoint + ".pendingJournalCleanupOwner"
        #expect(defaults.string(forKey: index) == scope.subject)
        let relaunched = NativeSession(arguments: ["-VisePandaNativeAPI", scope.endpoint], defaults: defaults, configuration: config, bundleConfiguration: [:], vault: vault)
        await relaunched.logout()
        #expect(try NativePlaceActionJournal(vault: vault).read(scope) == nil)
        #expect(relaunched.status == "signedOut" && defaults.object(forKey: index) == nil)
    }
    @Test func actualSessionCleanupFailureKeepsIndexAndFencesIdentity() async throws {
        let name = "place-action-session-" + UUID().uuidString, defaults = UserDefaults(suiteName: name)!
        defer { defaults.removePersistentDomain(forName: name) }
        let vault = PlaceActionVault(), config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [PlaceActionSessionProtocol.self]
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", PlaceActionFixture.scope.endpoint], defaults: defaults, configuration: config, bundleConfiguration: [:], vault: vault)
        await session.login(email: "synthetic@example.invalid", password: "synthetic-only")
        let scope = try #require(session.dataScope), pending = try session.rememberPlaceAction(PlaceActionFixture.command(), actor: scope)
        vault.failPlaceErase = true; await session.logout()
        #expect(session.dataScope == nil && session.status == "storageError" && session.failureCode == "placeActionCleanupRequired")
        #expect(try NativePlaceActionJournal(vault: vault).read(scope) == pending)
    }
}
#endif

@MainActor extension NativePlaceActionTests {
    @Test func affectedPreviewDoesNotInventRouteCostOrFeasibility() throws {
        let command = try PlaceActionFixture.command(action: "add"), pending = NativePlaceActionPending(scope: PlaceActionFixture.scope, command: command)
        let item = try #require(command.object["itemId"] as? String)
        var preview: [String: Any] = ["kind": "place_add_preview/1", "tripId": command.tripId, "baseVersion": 0,
            "selection": try command.object["selection"]!, "mappingDigest": PlaceActionFixture.digest, "contextDigest": PlaceActionFixture.digest, "status": "pending",
            "lines": [["itemId": item, "constraint": "stay_duration", "status": "pending", "reason": "USER_WINDOW_NOT_SOURCED_STAY_DURATION"]],
            "affectedDirectedEdges": [["fromItemId": "before", "toItemId": item, "departureAt": PlaceActionFixture.date()], ["fromItemId": item, "toItemId": "after", "departureAt": PlaceActionFixture.date(60)]],
            "removedDirectedEdges": [["fromItemId": "before", "toItemId": "after", "departureAt": PlaceActionFixture.date()]],
            "matrix": ["candidates": 1, "affectedElements": 2, "concurrency": 0, "providerCalls": 0, "billingUnit": "unknown", "cost": "unknown"],
            "routeObservedAt": NSNull(), "sourceExpiresAt": PlaceActionFixture.date(20), "tripMutation": "none", "confirmation": "original_proposal_diff_confirm", "userWindow": "explicit_choice_not_source_evidence"]
        let decoded = try NativePlaceActionPreview.decode(preview, pending: pending)
        let value = try #require(decoded)
        #expect(value.edges.count == 2 && value.removed.count == 1 && value.pendingCount == 1 && value.newItemId == item)
        preview["status"] = "feasible"
        #expect(throws: (any Error).self) { try NativePlaceActionPreview.decode(preview, pending: pending) }
    }
}

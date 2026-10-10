import XCTest
@testable import VisePanda

nonisolated final class NativeAssistantEventsTests: XCTestCase {
    private let conversation = "11111111-1111-4111-8111-111111111111"
    private let task = "22222222-2222-4222-8222-222222222222"
    private let turn = "33333333-3333-4333-8333-333333333333"
    private func stream(_ status: String = "completed") -> Data {
        Data("id: 1\nevent: assistant\ndata: {\"schemaVersion\":\"assistant-events/1\",\"conversationId\":\"\(conversation)\",\"eventId\":\"\(conversation):1\",\"sequence\":1,\"taskId\":\"\(task)\",\"turnId\":\"\(turn)\",\"type\":\"task_status\",\"status\":\"\(status)\"}\n\nretry: 2000\nevent: checkpoint\ndata: {\"schemaVersion\":\"assistant-events/1\",\"conversationId\":\"\(conversation)\",\"afterSequence\":1,\"hasMore\":false}\n\n".utf8)
    }
    @MainActor private var selection: NativeAssistantEventsSelection {
        .init(scope: .init(endpoint: "https://example.invalid", subject: "owner", mobileEpoch: 2, generation: 3),
              sessionID: "session", policyID: "policy", conversationID: conversation, selectionGeneration: UUID())
    }

    @MainActor func testCursorNeedsFreshQualificationAndSameSessionEpochPolicySelection() throws {
        let selected = selection
        let bytes = try NativeAssistantEventsCursor.encode(42, selection: selected)
        XCTAssertEqual(try NativeAssistantEventsCursor.decode(bytes, selection: selected, qualified: true), 42)
        XCTAssertThrowsError(try NativeAssistantEventsCursor.decode(bytes, selection: selected, qualified: false))
        let replacement = NativeAssistantEventsSelection(scope: .init(endpoint: selected.scope.endpoint,
            subject: selected.scope.subject, mobileEpoch: 3, generation: 4), sessionID: selected.sessionID,
            policyID: selected.policyID, conversationID: selected.conversationID, selectionGeneration: UUID())
        XCTAssertThrowsError(try NativeAssistantEventsCursor.decode(bytes, selection: replacement, qualified: true))
        let newSession = NativeAssistantEventsSelection(scope: selected.scope, sessionID: "new-session",
            policyID: selected.policyID, conversationID: selected.conversationID, selectionGeneration: UUID())
        XCTAssertThrowsError(try NativeAssistantEventsCursor.decode(bytes, selection: newSession, qualified: true))
    }

    @MainActor func testPrivacyCursorMetadataIsOwnerBoundAndNeverRawEnvelope() throws {
        let selected = selection, bytes = try NativeAssistantEventsCursor.encode(42, selection: selected)
        let metadata = try NativeAssistantEventsCursor.metadata(bytes, scope: selected.scope, sessionID: selected.sessionID)
        XCTAssertTrue(metadata.valid)
        let exported = try JSONSerialization.jsonObject(with: JSONEncoder().encode(metadata)) as! [String: Any]
        XCTAssertEqual(Set(exported.keys), ["conversationID", "afterSequence"])
        let foreign = NativeDataScope(endpoint: selected.scope.endpoint, subject: "foreign", mobileEpoch: selected.scope.mobileEpoch, generation: selected.scope.generation)
        XCTAssertThrowsError(try NativeAssistantEventsCursor.metadata(bytes, scope: foreign, sessionID: selected.sessionID))
        let oldEpoch = NativeDataScope(endpoint: selected.scope.endpoint, subject: selected.scope.subject, mobileEpoch: 99, generation: selected.scope.generation)
        XCTAssertThrowsError(try NativeAssistantEventsCursor.metadata(bytes, scope: oldEpoch, sessionID: selected.sessionID))
        XCTAssertThrowsError(try NativeAssistantEventsCursor.metadata(bytes, scope: selected.scope, sessionID: "replacement"))
        let endpoint = NativeDataScope(endpoint: "https://foreign.invalid", subject: selected.scope.subject, mobileEpoch: selected.scope.mobileEpoch, generation: selected.scope.generation)
        XCTAssertThrowsError(try NativeAssistantEventsCursor.metadata(bytes, scope: endpoint, sessionID: selected.sessionID))
        var secret = try JSONSerialization.jsonObject(with: bytes) as! [String: Any]
        secret["accessToken"] = "synthetic-excluded-field"
        XCTAssertThrowsError(try NativeAssistantEventsCursor.metadata(JSONSerialization.data(withJSONObject: secret), scope: selected.scope, sessionID: selected.sessionID))
    }

    @MainActor func testPartialDenialAAndReceiptARetainAcknowledgedCursorB() throws {
        let a = selection
        let b = NativeAssistantEventsSelection(scope: a.scope, sessionID: a.sessionID, policyID: a.policyID,
            conversationID: "44444444-4444-4444-8444-444444444444", selectionGeneration: UUID())
        let savedB = try NativeAssistantEventsCursor.encode(12, selection: b)
        XCTAssertFalse(try NativeAssistantEventsCursor.matches(savedB, selection: a))
        XCTAssertTrue(try NativeAssistantEventsCursor.matches(savedB, selection: b))
        XCTAssertFalse(try NativeAssistantEventsCursor.matches(savedB, scope: a.scope, sessionID: a.sessionID, affectedConversationIDs: [a.conversationID]))
        XCTAssertTrue(try NativeAssistantEventsCursor.matches(savedB, scope: a.scope, sessionID: a.sessionID, affectedConversationIDs: [b.conversationID]))
        XCTAssertEqual(try NativeAssistantEventsCursor.decode(savedB, selection: b, qualified: true), 12)
    }
    @MainActor func testPartialCleanupMalformedRecordIsNotDifferentOrAbsent() throws {
        let a = selection
        var broken = try JSONSerialization.jsonObject(with: NativeAssistantEventsCursor.encode(2, selection: a)) as! [String: Any]
        broken["unexpected"] = "synthetic"
        let bytes = try JSONSerialization.data(withJSONObject: broken)
        XCTAssertThrowsError(try NativeAssistantEventsCursor.matches(bytes, selection: a))
        XCTAssertThrowsError(try NativeAssistantEventsCursor.matches(bytes, scope: a.scope, sessionID: a.sessionID, affectedConversationIDs: [a.conversationID]))
        broken.removeValue(forKey: "unexpected"); broken["sequence"] = true
        XCTAssertThrowsError(try NativeAssistantEventsCursor.matches(JSONSerialization.data(withJSONObject: broken), selection: a))
    }

    @MainActor func testFiniteReplayRequiresCompleteCheckpointAndClosedSchema() throws {
        let bytes = stream()
        let page = try NativeAssistantEventsDecoder.decode(bytes, conversationID: conversation, after: 0)
        XCTAssertEqual(page.afterSequence, 1)
        XCTAssertEqual(page.events.count, 1)
        XCTAssertFalse(page.hasMore)
        XCTAssertThrowsError(try NativeAssistantEventsDecoder.decode(Data(bytes.dropLast()), conversationID: conversation, after: 0))
        XCTAssertThrowsError(try NativeAssistantEventsDecoder.decode(stream("future"), conversationID: conversation, after: 0))
        XCTAssertThrowsError(try NativeAssistantEventsDecoder.decode(bytes, conversationID: conversation, after: 1))
        let future = String(decoding: bytes, as: UTF8.self).replacingOccurrences(of: "assistant-events/1", with: "assistant-events/2")
        XCTAssertThrowsError(try NativeAssistantEventsDecoder.decode(Data(future.utf8), conversationID: conversation, after: 0))
    }

    @MainActor func testProgressUnionMatchesOriginalToolReceiptsOnly() throws {
        let wire = String(decoding: stream(), as: UTF8.self).replacingOccurrences(of: "\"type\":\"task_status\",\"status\":\"completed\"", with: "\"type\":\"task_progress\",\"tool\":\"evidence.lookup\",\"state\":\"completed\"")
        let page = try NativeAssistantEventsDecoder.decode(Data(wire.utf8), conversationID: conversation, after: 0)
        XCTAssertEqual(page.events.first?.change, .progress(.evidence, .completed))
        XCTAssertThrowsError(try NativeAssistantEventsDecoder.decode(Data(wire.replacingOccurrences(of: "evidence.lookup", with: "trip.confirm").utf8), conversationID: conversation, after: 0))
    }

    @MainActor func testDedupRollbackAndCursorWriteBeforeAck() async throws {
        let selected = selection, projection = NativeAssistantEventsProjection()
        projection.bind(selected, active: true)
        let reference = NativeAssistantEventsReference(eventID: "\(conversation):1", cursor: "1", object: .artifact(task), revision: 2, invalidated: false)
        var clears = 0, reads = 0, saves = 0
        let first = try await projection.consume(reference, selection: selected, clear: { _ in clears += 1 },
            readCurrent: { _ in reads += 1; return true }, saveCursor: { _, _ in saves += 1 })
        XCTAssertEqual(first, .applied)
        let duplicate = try await projection.consume(reference, selection: selected, clear: { _ in clears += 1 },
            readCurrent: { _ in reads += 1; return true }, saveCursor: { _, _ in saves += 1 })
        XCTAssertEqual(duplicate, .duplicate)
        XCTAssertEqual(clears, 1); XCTAssertEqual(reads, 1); XCTAssertEqual(saves, 1)
        let rollback = NativeAssistantEventsReference(eventID: "\(conversation):2", cursor: "2", object: .artifact(task), revision: 1, invalidated: false)
        do {
            _ = try await projection.consume(rollback, selection: selected, clear: { _ in }, readCurrent: { _ in true }, saveCursor: { _, _ in })
            XCTFail("rollback accepted")
        } catch { }
        let next = NativeAssistantEventsReference(eventID: "\(conversation):3", cursor: "3", object: .artifact(task), revision: 3, invalidated: false)
        do {
            _ = try await projection.consume(next, selection: selected, clear: { _ in }, readCurrent: { _ in true },
                saveCursor: { _, _ in throw NativeDataError.invalidResponse })
            XCTFail("failed persistence acknowledged")
        } catch { }
        XCTAssertEqual(projection.cursor, "1")
    }

    @MainActor func testReplacementDuringReadCannotAcknowledgeOldEvent() async throws {
        let selected = selection, projection = NativeAssistantEventsProjection()
        projection.bind(selected, active: true)
        let reference = NativeAssistantEventsReference(eventID: "\(conversation):1", cursor: "1", object: .task(task), revision: 1, invalidated: false)
        var saves = 0
        let result = try await projection.consume(reference, selection: selected, clear: { _ in },
            readCurrent: { _ in projection.suspend(); return true }, saveCursor: { _, _ in saves += 1 })
        XCTAssertEqual(result, .stale); XCTAssertEqual(saves, 0); XCTAssertNil(projection.cursor)
    }

    @MainActor func testDeniedReadClearsButDoesNotAdvanceCursor() async {
        let selected = selection, store = NativeAssistantEventsStore()
        var clearCount = 0, saved = 0
        store.bind(selected, active: true, clearDisplays: { clearCount += 1 })
        await store.read(selection: selected, current: { selected }, request: { _, _ in self.stream() },
            clear: { _ in clearCount += 1 }, readCurrent: { _ in false },
            saveCursor: { _, _ in saved += 1 }, clearDisplays: { clearCount += 1 })
        XCTAssertEqual(store.state, .unavailable); XCTAssertEqual(store.afterSequence, 0)
        XCTAssertEqual(saved, 0); XCTAssertGreaterThanOrEqual(clearCount, 2)
    }

    private func retiredStream(sequence: Int, retired: Int, extra: String = "") -> Data {
        Data("id: \(sequence)\nevent: assistant\ndata: {\"schemaVersion\":\"assistant-events/1\",\"conversationId\":\"\(conversation)\",\"eventId\":\"\(conversation):\(sequence)\",\"sequence\":\(sequence),\"type\":\"source_retired\",\"retiredSequence\":\(retired)\(extra)}\n\nretry: 2000\nevent: checkpoint\ndata: {\"schemaVersion\":\"assistant-events/1\",\"conversationId\":\"\(conversation)\",\"afterSequence\":\(sequence),\"hasMore\":false}\n\n".utf8)
    }
    @MainActor func testRetirementClosedFieldsAndAlreadyAcknowledgedOrdinal() throws {
        let page = try NativeAssistantEventsDecoder.decode(retiredStream(sequence: 2, retired: 1), conversationID: conversation, after: 1)
        XCTAssertEqual(page.events.first?.change, .retired(sequence: 1))
        XCTAssertNil(page.events.first?.taskID); XCTAssertNil(page.events.first?.turnID)
        XCTAssertNil(page.events.first?.reference)
        XCTAssertThrowsError(try NativeAssistantEventsDecoder.decode(retiredStream(sequence: 2, retired: 3), conversationID: conversation, after: 1))
        XCTAssertThrowsError(try NativeAssistantEventsDecoder.decode(retiredStream(sequence: 2, retired: 0), conversationID: conversation, after: 1))
        XCTAssertThrowsError(try NativeAssistantEventsDecoder.decode(retiredStream(sequence: 2, retired: 1, extra: ",\"taskId\":\"\(task)\""), conversationID: conversation, after: 1))
        XCTAssertThrowsError(try NativeAssistantEventsDecoder.decode(Data(retiredStream(sequence: 2, retired: 1).dropLast()), conversationID: conversation, after: 1))
    }
    @MainActor func testRetirementEvictsKnownHintAndUnknownOrdinalWithoutInventingSource() async throws {
        let selected = selection, projection = NativeAssistantEventsProjection()
        projection.bind(selected, active: true)
        let reference = NativeAssistantEventsReference(eventID: "\(conversation):1", cursor: "1", object: .task(task), revision: 1, invalidated: false)
        _ = try await projection.consume(reference, selection: selected, clear: { _ in }, readCurrent: { _ in true }, saveCursor: { _, _ in })
        var cleared: NativeAssistantEventsReference.Object?, count = 0
        let result = try await projection.consumeRetirement(eventID: "\(conversation):2", sequence: 2, retiredSequence: 1,
            selection: selected, clear: { cleared = $0; count += 1 }, readCurrent: { true }, saveCursor: { _, _ in })
        XCTAssertEqual(result, .applied); XCTAssertEqual(cleared, .task(task)); XCTAssertEqual(projection.cursor, "2")
        let duplicate = try await projection.consumeRetirement(eventID: "\(conversation):2", sequence: 2, retiredSequence: 1,
            selection: selected, clear: { _ in count += 1 }, readCurrent: { XCTFail("duplicate rechecked"); return true }, saveCursor: { _, _ in XCTFail("duplicate ack") })
        XCTAssertEqual(duplicate, .duplicate); XCTAssertEqual(count, 1)
        _ = try await projection.consumeRetirement(eventID: "\(conversation):3", sequence: 3, retiredSequence: 1,
            selection: selected, clear: { XCTAssertNil($0) }, readCurrent: { true }, saveCursor: { _, _ in })
        XCTAssertEqual(projection.cursor, "3"); XCTAssertEqual(projection.lifetime.selection, selected); XCTAssertTrue(projection.lifetime.active)
    }

    @MainActor func testNewerOriginalSourceRejectsOldReadWithoutClearingFreshProjection() async {
        let selected = selection, store = NativeAssistantEventsStore()
        var allClears = 0, saves = 0
        store.bind(selected, active: true, clearDisplays: {})
        await store.read(selection: selected, current: { selected }, request: { _, _ in self.stream() },
            clear: { _ in }, readCurrent: { _ in throw NativeDataError.staleSessionResponse },
            saveCursor: { _, _ in saves += 1 }, clearDisplays: { allClears += 1 })
        XCTAssertEqual(store.state, .ready); XCTAssertFalse(store.hasMore)
        XCTAssertEqual(store.afterSequence, 0); XCTAssertEqual(saves, 0); XCTAssertEqual(allClears, 0)
    }

    @MainActor func testExpiredReadAndTruncatedFrameCannotReachOriginalReader() async {
        let selected = selection
        var clock: TimeInterval = 0, reads = 0, saves = 0
        let store = NativeAssistantEventsStore(uptime: { clock })
        store.bind(selected, active: true, clearDisplays: {})
        await store.read(selection: selected, current: { selected }, request: { _, _ in clock = 31; return self.stream() },
            clear: { _ in }, readCurrent: { _ in reads += 1; return true }, saveCursor: { _, _ in saves += 1 }, clearDisplays: {})
        XCTAssertEqual(reads, 0); XCTAssertEqual(saves, 0); XCTAssertEqual(store.state, .unavailable)
        clock = 0
        await store.read(selection: selected, current: { selected }, request: { _, _ in Data(self.stream().dropLast()) },
            clear: { _ in }, readCurrent: { _ in reads += 1; return true }, saveCursor: { _, _ in saves += 1 }, clearDisplays: {})
        XCTAssertEqual(reads, 0); XCTAssertEqual(saves, 0)
    }
}

#if os(iOS)
import Security

extension NativeAssistantEventsTests {
    @MainActor func testRegisteredFiniteSSEOriginalActivityReadBeforeCursorPersistence() async throws {
        let vault = NativeKeychainVault(), suite = "vpj08-stream-" + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        let configuration = URLSessionConfiguration.ephemeral; configuration.protocolClasses = [AssistantEventsAuthProtocol.self]
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", "http://127.0.0.1:65184", "-VisePandaAssistantConversation"],
            defaults: defaults, configuration: configuration, bundleConfiguration: [:], vault: vault)
        await session.login(email: "vpj08-stream@example.invalid", password: "SYNTHETIC_ONLY")
        let actor = try session.communitySafetyActor()
        let selected = NativeAssistantEventsSelection(scope: actor.scope, sessionID: actor.sessionID,
            policyID: "55555555-5555-4555-8555-555555555555", conversationID: "11111111-1111-4111-8111-111111111111", selectionGeneration: UUID())
        let store = NativeAssistantEventsStore(); store.bind(selected, active: true, clearDisplays: {})
        var qualifiedReads = 0
        await store.read(selection: selected, current: { selected },
            request: { _, after in try await session.assistantEventsRequest(selection: selected, after: after) },
            clear: { _ in }, readCurrent: { event in
                let bytes = try await session.taskActivityRequest(conversationID: selected.conversationID, taskID: event.taskID!)
                let activity = try JSONDecoder().decode(NativeTaskActivity.self, from: bytes)
                qualifiedReads += 1
                return activity.matches(.init(scope: actor.scope, conversationID: selected.conversationID, taskID: event.taskID!, latestTurnID: event.turnID!, eligible: true))
            }, saveCursor: { try session.rememberAssistantEventsCursor(selection: $0, sequence: $1) }, clearDisplays: {})
        XCTAssertEqual(qualifiedReads, 1); XCTAssertEqual(store.afterSequence, 1); XCTAssertEqual(store.state, .ready)
        XCTAssertEqual(try session.assistantEventsCursor(selection: selected, qualified: true), 1)
        await session.logout()
        XCTAssertEqual(vault.read(service: "com.visepanda.native.local-session.v2.assistant-events-cursor." + actor.scope.endpoint, owner: actor.scope.subject).0, errSecItemNotFound)
        UserDefaults.standard.removePersistentDomain(forName: suite)
    }
    @MainActor func testRegisteredSessionCursorJournalExportPartialPurgeAndLogoutPhysicalAbsence() async throws {
        let vault = NativeKeychainVault(), suite = "vpj08-owned-" + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [AssistantEventsAuthProtocol.self]
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", "http://127.0.0.1:65184", "-VisePandaAssistantConversation"],
            defaults: defaults, configuration: configuration, bundleConfiguration: [:], vault: vault)
        await session.login(email: "vpj08-synthetic@example.invalid", password: "SYNTHETIC_ONLY")
        XCTAssertEqual(session.status, "active")
        let actor = try session.communitySafetyActor()
        let service = "com.visepanda.native.local-session.v2.assistant-events-cursor." + actor.scope.endpoint
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("vpj08-private-" + UUID().uuidString)
        defer {
            for key in [service, NativeResultDataJournal.service(actor.scope.endpoint), "com.visepanda.native.local-session.v2." + actor.scope.endpoint] {
                XCTAssertTrue([errSecSuccess, errSecItemNotFound].contains(vault.remove(service: key, owner: actor.scope.subject)))
                XCTAssertEqual(vault.read(service: key, owner: actor.scope.subject).0, errSecItemNotFound)
            }
            UserDefaults.standard.removePersistentDomain(forName: suite)
            try? FileManager.default.removeItem(at: folder)
        }
        func selected(_ id: String) -> NativeAssistantEventsSelection {
            .init(scope: actor.scope, sessionID: actor.sessionID, policyID: "55555555-5555-4555-8555-555555555555",
                  conversationID: id, selectionGeneration: UUID())
        }
        let a = selected("11111111-1111-4111-8111-111111111111")
        let b = selected("44444444-4444-4444-8444-444444444444")
        let fixtureURL = Bundle(for: NativeAssistantEventsTests.self).url(forResource: "commands", withExtension: "json", subdirectory: "ResultData")!
        let fields = try JSONSerialization.jsonObject(with: Data(contentsOf: fixtureURL)) as! [String: Any]
        let command = try NativeResultDataCommand(body: Data((fields["eraseBytes"] as! String).utf8))
        let journal = NativeResultDataJournal(vault: vault, validateConfirmation: NativeResultDataCommand.validateConfirmation)
        _ = try journal.retain(command.body, actor: actor)
        let retained = vault.read(service: NativeResultDataJournal.service(actor.scope.endpoint), owner: actor.scope.subject).1
        try session.rememberAssistantEventsCursor(selection: b, sequence: 12)
        let beforeB = vault.read(service: service, owner: actor.scope.subject).1
        try session.eraseAssistantEventsCursor(selection: a)
        XCTAssertEqual(vault.read(service: service, owner: actor.scope.subject).1, beforeB)
        XCTAssertEqual(vault.read(service: NativeResultDataJournal.service(actor.scope.endpoint), owner: actor.scope.subject).1, retained)
        XCTAssertEqual(try session.assistantEventsCursor(selection: b, qualified: true), 12)
        let store = NativeJournalDataStore(source: session.journalDataSource(), root: folder)
        store.load(current: actor)
        XCTAssertEqual(Set(store.rows.map { $0.record.source }), Set(NativeJournalDataSourceID.allCases))
        XCTAssertEqual(store.rows.filter { $0.record.source != .assistantEventsCursor }.count, 29)
        let cache = store.rows.first { $0.record.source == .assistantEventsCursor }!
        XCTAssertEqual(cache.record.state, .projection); XCTAssertNil(cache.record.originalOperationBytes)
        XCTAssertEqual(cache.record.assistantEventsCursor?.afterSequence, 12)
        store.select(current: actor); XCTAssertTrue(store.export(current: actor))
        let exported = try JSONSerialization.jsonObject(with: Data(contentsOf: store.exportURL(current: actor)!)) as! [String: Any]
        XCTAssertEqual(exported["schemaVersion"] as? String, "native-owner-journals/2")
        let records = exported["records"] as! [[String: Any]]
        let cursor = records.first { $0["source"] as? String == "assistantEventsCursor" }!
        XCTAssertNil(cursor["originalOperationBytes"])
        XCTAssertEqual(Set((cursor["assistantEventsCursor"] as! [String: Any]).keys), ["conversationID", "afterSequence"])
        XCTAssertFalse(store.canReturnToOriginal(.assistantEventsCursor, current: actor))
        XCTAssertNil(store.inspectCompletion(source: .assistantEventsCursor, current: actor))
        try session.eraseAssistantEventsCursor(selection: b)
        XCTAssertEqual(vault.read(service: service, owner: actor.scope.subject).0, errSecItemNotFound)
        XCTAssertTrue(try session.journalDataSource().physicallyAbsent(source: .assistantEventsCursor, actor: actor))
        XCTAssertEqual(vault.read(service: NativeResultDataJournal.service(actor.scope.endpoint), owner: actor.scope.subject).1, retained)
        try session.rememberAssistantEventsCursor(selection: b, sequence: 13)
        await session.logout()
        XCTAssertEqual(session.status, "signedOut")
        XCTAssertEqual(vault.read(service: service, owner: actor.scope.subject).0, errSecItemNotFound)
        XCTAssertNil(vault.read(service: service, owner: actor.scope.subject).1)
    }
}

nonisolated private final class AssistantEventsAuthProtocol: URLProtocol, @unchecked Sendable {
    static let owner = "00000000-0000-4000-8000-000000000001"
    static let sessionID = "00000000-0000-4000-8000-000000000002"
    static let token: String = {
        let payload = try! JSONSerialization.data(withJSONObject: ["sub": owner, "session_id": sessionID]).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        return "SYNTHETIC_ACCESS." + payload + ".SYNTHETIC_SIGNATURE"
    }()
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "127.0.0.1" && request.url?.port == 65184 }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}
    override func startLoading() {
        guard let url = request.url else { return }
        if url.path.contains("/assistant-events/") {
            let conversation = "11111111-1111-4111-8111-111111111111"
            let event: [String: Any] = ["schemaVersion":"assistant-events/1", "conversationId":conversation,
                "eventId":conversation+":1", "sequence":1, "type":"task_status", "taskId":"22222222-2222-4222-8222-222222222222", "turnId":"33333333-3333-4333-8333-333333333333", "status":"completed"]
            let checkpoint: [String: Any] = ["schemaVersion":"assistant-events/1", "conversationId":conversation, "afterSequence":1, "hasMore":false]
            let text = "id: 1\nevent: assistant\ndata: " + String(data: try! JSONSerialization.data(withJSONObject:event), encoding:.utf8)! + "\n\nretry: 2000\nevent: checkpoint\ndata: " + String(data:try! JSONSerialization.data(withJSONObject:checkpoint),encoding:.utf8)! + "\n\n"
            client?.urlProtocol(self,didReceive:HTTPURLResponse(url:url,statusCode:200,httpVersion:nil,headerFields:["Content-Type":"text/event-stream"])!,cacheStoragePolicy:.notAllowed)
            client?.urlProtocol(self,didLoad:Data(text.utf8));client?.urlProtocolDidFinishLoading(self);return
        }
        let fields: [String: Any]
        if url.path.hasSuffix("/activity") {
            fields = ["version":5,"kind":"task_activity","conversationId":"11111111-1111-4111-8111-111111111111","taskId":"22222222-2222-4222-8222-222222222222","turnId":"33333333-3333-4333-8333-333333333333","turnStatus":"completed","limit":4,"recording":"unrecorded","actions":[]]
        }
        else if url.path.hasSuffix("/profile") { fields = ["subject": Self.owner, "displayName": "SYNTHETIC"] }
        else if url.path.hasSuffix("/login") { fields = ["subject": Self.owner, "mobileEpoch": 3] }
        else if url.path.hasSuffix("/logout") { fields = [:] }
        else if url.path.hasSuffix("/credentials") || url.path.hasSuffix("/refresh") {
            fields = ["subject": Self.owner, "accessToken": Self.token, "refreshToken": "SYNTHETIC_REFRESH",
                "expiresAt": Date().addingTimeInterval(3600).timeIntervalSince1970, "mobileEpoch": 3]
        } else { client?.urlProtocol(self, didFailWithError: URLError(.unsupportedURL)); return }
        let data = try! JSONSerialization.data(withJSONObject: fields)
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json", "Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff"])!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data); client?.urlProtocolDidFinishLoading(self)
    }
}
#endif

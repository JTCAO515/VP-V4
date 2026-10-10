import XCTest
@testable import VisePanda

final class NativeAssistantEventsTests: XCTestCase {
    private let conversation = "11111111-1111-4111-8111-111111111111"
    private let task = "22222222-2222-4222-8222-222222222222"
    private let turn = "33333333-3333-4333-8333-333333333333"
    private func stream(_ status: String = "completed") -> Data {
        Data("id: 1\nevent: assistant\ndata: {\"schemaVersion\":\"assistant-events/1\",\"conversationId\":\"\(conversation)\",\"eventId\":\"\(conversation):1\",\"sequence\":1,\"taskId\":\"\(task)\",\"turnId\":\"\(turn)\",\"type\":\"task_status\",\"status\":\"\(status)\"}\n\nretry: 2000\nevent: checkpoint\ndata: {\"schemaVersion\":\"assistant-events/1\",\"conversationId\":\"\(conversation)\",\"afterSequence\":1,\"hasMore\":false}\n\n".utf8)
    }
    private var selection: NativeAssistantEventsSelection {
        .init(scope: .init(endpoint: "https://example.invalid", subject: "owner", mobileEpoch: 2, generation: 3),
              sessionID: "session", policyID: "policy", conversationID: conversation, selectionGeneration: UUID())
    }

    func testCursorNeedsFreshQualificationAndSameSessionEpochPolicySelection() throws {
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

    func testFiniteReplayRequiresCompleteCheckpointAndClosedSchema() throws {
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

    func testProgressUnionMatchesOriginalToolReceiptsOnly() throws {
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

import Foundation
import Security
import Testing
@testable import VisePanda

@MainActor struct NativeConversationDataTests {
    private func id(_ n: Int) -> String { String(format: "00000000-0000-4000-8000-%012d", n) }
    private var wall: Date { Date(timeIntervalSince1970: 1_791_246_000) }
    private var actor: NativeCommunitySafetyActor {
        .init(scope: .init(endpoint: "http://127.0.0.1:65160", subject: id(1), mobileEpoch: 3, generation: 1), sessionID: id(2))
    }
    private func envelope(_ value: [String: Any]) throws -> Data { try NativeCommunityWire.bytes(["data": value]) }
    private var graph: [String: [String]] {
        ["conversationIds": [id(4)], "goalIds": [id(5)], "messageIds": [id(6)], "taskIds": [id(7)], "threadIds": [id(8)], "turnIds": [id(9)], "artifactIds": [id(10)]]
    }
    private var erased: [String: Int] {
        var v = Dictionary(uniqueKeysWithValues: NativeConversationDataWire.erasedKeys.map { ($0, 0) })
        for key in ["conversations", "goals", "messages", "threads", "turns", "artifacts"] { v[key] = 1 }
        return v
    }
    private var redacted: [String: Int] { ["textBodies": 1, "taskDigests": 1] }
    private var retained: [String: Int] {
        var v = Dictionary(uniqueKeysWithValues: NativeConversationDataWire.retainedKeys.map { ($0, 0) })
        for key in ["tasks", "taskTurns", "capacity"] { v[key] = 1 }
        return v
    }
    private func binding(_ command: NativeConversationDataCommand) -> [String: Any] {
        ["schemaVersion": NativeConversationDataWire.schema, "scope": command.scope.rawValue,
         "requestId": command.requestID as Any, "rootKind": command.rootKind?.rawValue as Any? ?? NSNull(),
         "rootId": command.rootID as Any? ?? NSNull(), "objectIds": command.objectIDs,
         "ownerId": actor.scope.subject, "sessionId": actor.sessionID, "mobileEpoch": actor.scope.mobileEpoch,
         "sourceDigest": String(repeating: "a", count: 64), "previewDigest": String(repeating: "b", count: 64),
         "sourceAuthorities": [["policyId": id(18), "consentId": id(19)]],
         "capturedAt": Int(wall.timeIntervalSince1970 * 1000), "expiresAt": Int(wall.timeIntervalSince1970 * 1000) + 30_000,
         "boundaries": NativeConversationDataWire.boundaries[command.scope] as Any, "allUserDataCompleted": false]
    }
    private func preview(_ command: NativeConversationDataCommand) -> [String: Any] {
        var v = binding(command)
        v["kind"] = "preview"; v["graph"] = graph; v["eraseCounts"] = erased; v["redactCounts"] = redacted; v["retainCounts"] = retained
        v["retainedReferences"] = ["tripIds": [id(11)], "memoryIds": [id(12)]]; v["conflicts"] = [String](); v["eligible"] = true; v["progressCount"] = 0
        return v
    }
    private func decision(_ original: NativeConversationDataCommand) -> [String: Any] {
        ["requestDigest": NativeConversationDataWire.digest(original.body), "decidedAt": Int(wall.timeIntervalSince1970 * 1000) + 10,
         "graph": graph, "erasedCounts": erased, "redactedCounts": redacted, "retainedCounts": retained,
         "clearedPreviews": 0, "retainedFences": 7, "sourceConversation": "erased", "sourceTrip": "not_modified",
         "explicitMemory": "not_modified", "externalCopies": "not_erased"]
    }
    private func receipt(_ original: NativeConversationDataCommand) -> [String: Any] {
        var v = binding(original); v["kind"] = "receipt"; v["state"] = "erased"; v["decision"] = decision(original); return v
    }
    private func list(_ command: NativeConversationDataCommand) -> [String: Any] {
        ["schemaVersion": NativeConversationDataWire.schema, "kind": "list", "scope": command.scope.rawValue,
         "rootKind": command.rootKind?.rawValue as Any? ?? NSNull(), "ownerId": actor.scope.subject, "sessionId": actor.sessionID,
         "mobileEpoch": actor.scope.mobileEpoch, "sourceDigest": String(repeating: "a", count: 64),
         "capturedAt": Int(wall.timeIntervalSince1970 * 1000), "expiresAt": Int(wall.timeIntervalSince1970 * 1000) + 30_000,
         "items": [["rootKind": "conversation", "rootId": id(4), "createdAt": Int(wall.timeIntervalSince1970 * 1000) - 1000]],
         "hasMore": false, "nextCursor": NSNull(), "allUserDataCompleted": false]
    }

    @Test func soleFixedTSProducerEnvelopesDecodeWithoutRebuildingOriginalBytes() throws {
        // Fixed sole TS 1b169b22; synthetic protocol fixtures, not Auth/source deletion evidence.
        func bytes(_ file: String) throws -> Data {
            #if SWIFT_PACKAGE
            let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
                .appendingPathComponent("Fixtures/ConversationData/" + file + ".json")
            #else
            let url = try #require(Bundle(for: ConversationDataFixtureAnchor.self)
                .url(forResource: file, withExtension: "json", subdirectory: "ConversationData"))
            #endif
            return try Data(contentsOf: url)
        }
        let commands = try #require(JSONSerialization.jsonObject(with: bytes("commands")) as? [String: Any])
        #expect(commands["syntheticSource"] as? Bool == true)
        let preview = try NativeConversationDataCommand(body: NativeCommunityWire.bytes(try #require(commands["preview"] as? [String: Any])))
        let progress = try NativeConversationDataCommand(body: NativeCommunityWire.bytes(try #require(commands["progressPreview"] as? [String: Any])))
        let erase = try NativeConversationDataCommand(body: Data(try #require(commands["eraseBytes"] as? String).utf8))
        let progressErase = try NativeConversationDataCommand(body: Data(try #require(commands["progressEraseBytes"] as? String).utf8))
        let now = try NativeConversationDataWire.time(commands["now"]), recoveryNow = try NativeConversationDataWire.time(commands["receiptRecoveryNow"])
        #expect(try NativeConversationDataProtocol.list(bytes("conversation-list"), command: .list(scope: .sensitive, root: .conversation), actor: actor, now: now).objects.count == 1)
        #expect(try NativeConversationDataProtocol.list(bytes("thread-list"), command: .list(scope: .sensitive, root: .thread), actor: actor, now: now).objects.count == 1)
        #expect(try NativeConversationDataProtocol.preview(bytes("conversation-preview"), command: preview, actor: actor, now: now).eligible)
        #expect(try !NativeConversationDataProtocol.preview(bytes("conversation-blocked"), command: preview, actor: actor, now: now).eligible)
        #expect(try NativeConversationDataProtocol.receipt(bytes("conversation-receipt"), command: erase.recovery(), actor: actor, now: recoveryNow)?.requestDigest == NativeConversationDataWire.digest(erase.body))
        #expect(try erase.recovery().mutationBytes == erase.body)
        #expect(try NativeConversationDataProtocol.receipt(bytes("conversation-unknown"), command: erase.recovery(), actor: actor, now: recoveryNow) == nil)
        let page = try NativeConversationDataProtocol.list(bytes("progress-list"), command: .list(scope: .progress, root: nil), actor: actor, now: now)
        #expect(page.objects.count == 1 && page.objects.first?.operationFields?.contains("requestDigest") == true)
        #expect(try NativeConversationDataProtocol.preview(bytes("progress-preview"), command: progress, actor: actor, now: now).progressCount == 1)
        #expect(try NativeConversationDataProtocol.receipt(bytes("progress-receipt"), command: progressErase, actor: actor, now: recoveryNow)?.clearedPreviews == 1)
        let tasklessPreview = try NativeConversationDataCommand(body: NativeCommunityWire.bytes(try #require(commands["tasklessPreview"] as? [String: Any])))
        let tasklessErase = try NativeConversationDataCommand(body: Data(try #require(commands["tasklessEraseBytes"] as? String).utf8))
        let taskless = try NativeConversationDataProtocol.preview(bytes("taskless-preview"), command: tasklessPreview, actor: actor, now: now)
        #expect(taskless.graph.ids["taskIds"]?.isEmpty == true && !taskless.binding.sourceAuthorities.isEmpty)
        #expect(try NativeConversationDataProtocol.receipt(bytes("taskless-receipt"), command: tasklessErase.recovery(), actor: actor, now: recoveryNow)?.erased["conversations"] == 1)
    }

    @Test func closedWireRejectsAuthorityScopeAndFalseTerminalPromotion() throws {
        let command = try NativeConversationDataCommand.preview(root: .conversation, id: id(4))
        let parsed = try NativeConversationDataProtocol.preview(envelope(preview(command)), command: command, actor: actor, now: wall.addingTimeInterval(0.02))
        #expect(parsed.eligible && parsed.tripIDs == [id(11)] && parsed.memoryIDs == [id(12)])
        var blocked = preview(command); blocked["conflicts"] = ["ACTIVE_WORK", "PROPOSAL_REFERENCE"]; blocked["eligible"] = false
        #expect(try !NativeConversationDataProtocol.preview(envelope(blocked), command: command, actor: actor, now: wall.addingTimeInterval(0.02)).eligible)
        var overflow = erased; overflow["revisions"] = 4100
        for change: [String: Any] in [["ownerId": id(90)], ["mobileEpoch": 4], ["allUserDataCompleted": true], ["sourceAuthorities": []], ["sourceAuthorities": [["policyId": id(18), "consentId": id(19)], ["policyId": id(18), "consentId": id(19)]]], ["eraseCounts": overflow], ["conflicts": ["PROPOSAL_REFERENCE", "ACTIVE_WORK"], "eligible": false]] {
            var invalid = preview(command); invalid.merge(change) { _, value in value }
            #expect(throws: (any Error).self) { try NativeConversationDataProtocol.preview(envelope(invalid), command: command, actor: actor, now: wall.addingTimeInterval(0.02)) }
        }
        let erase = try command.confirmed(sourceDigest: parsed.binding.sourceDigest, previewDigest: parsed.binding.previewDigest)
        var forbidden = receipt(erase), d = decision(erase); d["sourceTrip"] = "erased"; forbidden["decision"] = d
        #expect(throws: (any Error).self) { try NativeConversationDataProtocol.receipt(envelope(forbidden), command: erase, actor: actor, now: wall.addingTimeInterval(60)) }
        forbidden = receipt(erase); forbidden["state"] = "queued"
        #expect(throws: (any Error).self) { try NativeConversationDataProtocol.receipt(envelope(forbidden), command: erase, actor: actor, now: wall.addingTimeInterval(60)) }
        #expect(try NativeConversationDataProtocol.receipt(envelope(receipt(erase)), command: erase, actor: actor, now: wall.addingTimeInterval(60)) != nil)
    }

    @Test func lostAckRelaunchRecoversOriginalBytesAfterPreviewExpiry() async throws {
        let vault = ConversationDataBehaviorVault()
        var wallTime = wall.addingTimeInterval(0.02), clock: TimeInterval = 10
        var original: Data?, rejectCleanup = true
        let client = NativeConversationDataClient(current: { actor }, request: { bytes, _ in
            let command = try NativeConversationDataCommand(body: bytes)
            switch command.action {
            case "list": return try envelope(list(command))
            case "preview": return try envelope(preview(command))
            case "erase": original = bytes; throw NativeDataError.sessionUnavailable
            case "recover":
                #expect(command.mutationBytes == original)
                return try envelope(receipt(NativeConversationDataCommand(body: try #require(original))))
            default: throw NativeDataError.invalidResponse
            }
        }, consumeReceipt: { _, _ in if rejectCleanup { throw NativeDataError.sessionUnavailable } })
        let first = NativeConversationDataStore(scope: .sensitive, vault: vault, now: { wallTime }, uptime: { clock })
        await first.load(client: client)
        first.toggle(try #require(first.visibleObjects(actor).first), actor: actor)
        await first.review(client: client)
        await first.erase(reviewed: try #require(first.visiblePreview(actor)?.binding), client: client)
        #expect(first.pending?.body == original && first.completion == nil)
        first.suspend(); wallTime = wall.addingTimeInterval(60); clock = 70
        let reopened = NativeConversationDataStore(scope: .sensitive, vault: vault, now: { wallTime }, uptime: { clock })
        reopened.bind(actor)
        #expect(reopened.pending?.body == original && reopened.visiblePreview(actor) == nil)
        await reopened.resolve(client: client)
        #expect(reopened.pending?.body == original && reopened.completion == nil)
        rejectCleanup = false
        await reopened.resolve(client: client)
        let result = try #require(reopened.visibleReceipt(actor))
        #expect(result.binding.expiresAt == wall.addingTimeInterval(30))
        #expect(result.decidedAt == wall.addingTimeInterval(0.01) && result.retainedFences == 7)
        #expect(reopened.pending == nil && reopened.completion != nil)
        #expect(result.retained["tasks"] == 1 && result.graph.ids["conversationIds"] == [id(4)])
    }

    @Test func malformedRecoveryDoesNotPermitResendAndLateReplyCannotPublish() async throws {
        let vault = ConversationDataBehaviorVault()
        let original = try NativeConversationDataCommand.preview(root: .conversation, id: id(4))
            .confirmed(sourceDigest: String(repeating: "a", count: 64), previewDigest: String(repeating: "b", count: 64))
        _ = try NativeConversationDataJournal(vault: vault, validateConfirmation: NativeConversationDataCommand.validateConfirmation).retain(original.body, actor: actor)
        let store = NativeConversationDataStore(scope: .sensitive, vault: vault, now: { wall.addingTimeInterval(0.02) }, uptime: { 10 })
        let malformed = NativeConversationDataClient(current: { actor }, request: { _, _ in try envelope(["kind": "unknown", "allUserDataCompleted": true]) }, consumeReceipt: { _, _ in })
        await store.resolve(client: malformed)
        #expect(!store.canResend(actor) && store.pending?.body == original.body && store.completion == nil)
        var continuation: CheckedContinuation<Data, any Error>?
        let delayed = NativeConversationDataClient(current: { actor }, request: { _, _ in
            try await withCheckedThrowingContinuation { continuation = $0 }
        }, consumeReceipt: { _, _ in })
        let work = Task { @MainActor in await store.resolve(client: delayed) }
        while continuation == nil { await Task.yield() }
        store.suspend(); store.bind(actor)
        try #require(continuation).resume(returning: envelope(receipt(original)))
        await work.value
        #expect(store.visibleReceipt(actor) == nil && store.completion == nil && store.pending?.body == original.body)
    }

    #if !SWIFT_PACKAGE
    @Test func originalAskHistoryGenerationRejectsDeletedLateDataAndPreservesOtherScope() async throws {
        // Local URLProtocol fixture only; no Auth, provider or database claim.
        ConversationProjectionProtocol.reset()
        let defaults = try #require(UserDefaults(suiteName: "vpj58.projection." + UUID().uuidString))
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ConversationProjectionProtocol.self]
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", "http://127.0.0.1:59651"],
            defaults: defaults, configuration: configuration, vault: ConversationDataBehaviorVault())
        await session.login(email: id(1), password: "synthetic-only")
        let scope = try #require(session.dataScope)
        let current = NativeCommunitySafetyActor(scope: scope, sessionID: id(2))
        let original = try NativeConversationDataCommand.preview(root: .conversation, id: id(4))
            .confirmed(sourceDigest: String(repeating: "a", count: 64), previewDigest: String(repeating: "b", count: 64))
        let decodedValue = try NativeConversationDataProtocol.receipt(envelope(receipt(original)), command: original, actor: current, now: wall.addingTimeInterval(60))
        let decoded = try #require(decodedValue)
        let erased = NativeConversationDataErasure(receipt: decoded, actor: current)
        let store = NativeAskStore(mode: .currentInput)
        store.reset(for: scope); store.draft = "Keep this unrelated unsent draft"
        ConversationProjectionProtocol.holdHistory()
        let read = Task { @MainActor in await store.reload(using: session) }
        let deadline = ContinuousClock.now.advanced(by: .seconds(5))
        while !ConversationProjectionProtocol.historyHeld, ContinuousClock.now < deadline { await Task.yield() }
        #expect(ConversationProjectionProtocol.historyHeld && store.turns.isEmpty)
        store.applyConversationErasure(erased)
        ConversationProjectionProtocol.releaseHistory()
        await read.value
        #expect(store.turns.isEmpty && store.draft == "Keep this unrelated unsent draft")
        ConversationProjectionProtocol.setTurn(id: id(93), thread: id(94))
        await store.reload(using: session)
        #expect(store.turns.map(\.turnId) == [id(93)])
        store.applyConversationErasure(erased)
        #expect(store.turns.map(\.turnId) == [id(93)] && store.draft == "Keep this unrelated unsent draft")
        ConversationProjectionProtocol.setTurn(id: id(9), thread: id(8))
        await store.reload(using: session)
        #expect(store.turns.map(\.turnId) == [id(9)])
        store.applyConversationErasure(erased)
        #expect(store.turns.isEmpty)
        var refresh = AssistantConversationRefreshState()
        let token = refresh.begin(); refresh.invalidate()
        #expect(!refresh.owns(token))
        var selection = AssistantConversationSelection()
        selection.select(id(4)); let generation = selection.generation; selection.select(nil)
        #expect(!selection.owns(generation))
    }
    #endif
}

private final class ConversationDataFixtureAnchor: NSObject {}

@MainActor private final class ConversationDataBehaviorVault: NativeCredentialVault {
    private var values: [String: Data] = [:]
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        guard let value = values[service + owner] else { return (errSecItemNotFound, nil) }
        return (errSecSuccess, value)
    }
    func write(_ data: Data, service: String, owner: String) -> OSStatus { values[service + owner] = data; return errSecSuccess }
    func remove(service: String, owner: String) -> OSStatus { values.removeValue(forKey: service + owner); return errSecSuccess }
}

#if !SWIFT_PACKAGE
nonisolated private final class ConversationProjectionProtocol: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var held: ConversationProjectionProtocol?
    nonisolated(unsafe) private static var holding = false
    nonisolated(unsafe) private static var turnID = "00000000-0000-4000-8000-000000000009"
    nonisolated(unsafe) private static var threadID = "00000000-0000-4000-8000-000000000008"
    static var historyHeld: Bool { lock.withLock { held != nil } }
    static func reset() { lock.withLock { held = nil; holding = false } }
    static func holdHistory() { lock.withLock { holding = true } }
    static func setTurn(id: String, thread: String) { lock.withLock { turnID = id; threadID = thread } }
    static func releaseHistory() {
        let pending = lock.withLock { let value = held; held = nil; holding = false; return value }
        pending?.history()
    }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}
    override func startLoading() {
        let path = request.url?.path ?? "", owner = "00000000-0000-4000-8000-000000000001"
        if path.hasSuffix("/credentials") || path.hasSuffix("/refresh") {
            reply(["subject": owner, "accessToken": "synthetic-only", "refreshToken": "synthetic-only",
                "expiresAt": Date().timeIntervalSince1970 + 3600, "mobileEpoch": 3]); return
        }
        if path.hasSuffix("/profile") { reply(["subject": owner, "displayName": "synthetic"]); return }
        if path.hasSuffix("/policy") {
            reply(["version": 1, "kind": "policy", "policy": ["id": owner, "provider": "qwen", "recipient": "synthetic",
                "sourceRegion": "synthetic", "processingRegion": "synthetic", "storageRegion": "synthetic", "termsVersion": "1",
                "noticeVersion": "1", "noticeHash": String(repeating: "a", count: 64), "noticeZh": "测试", "noticeEn": "Synthetic",
                "retention": "retain_after_hide_v1", "expiresAt": "2099-01-01T00:00:00Z", "consentState": "accepted"]]); return
        }
        if path.hasSuffix("/turns") {
            if Self.lock.withLock({ if Self.holding { Self.held = self; return true }; return false }) { return }
            history(); return
        }
        reply(["subject": owner, "mobileEpoch": 3])
    }
    private func history() {
        let ids = Self.lock.withLock { (Self.turnID, Self.threadID) }
        reply(["version": 1, "kind": "history", "turns": [["turnId": ids.0, "threadId": ids.1, "locale": "en",
            "input": "Synthetic private input", "outcome": "answered", "output": "Synthetic output", "status": "completed", "createdAt": "2026-10-06T00:00:00Z"]]])
    }
    private func reply(_ value: [String: Any]) {
        guard let url = request.url, let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil),
              let data = try? JSONSerialization.data(withJSONObject: value) else { return }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data); client?.urlProtocolDidFinishLoading(self)
    }
}
#endif

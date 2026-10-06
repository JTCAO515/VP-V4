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
        // Fixed sole TS 9a91fe36; synthetic protocol fixtures, not Auth/source deletion evidence.
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
    }

    @Test func closedWireRejectsAuthorityScopeAndFalseTerminalPromotion() throws {
        let command = try NativeConversationDataCommand.preview(root: .conversation, id: id(4))
        let parsed = try NativeConversationDataProtocol.preview(envelope(preview(command)), command: command, actor: actor, now: wall.addingTimeInterval(0.02))
        #expect(parsed.eligible && parsed.tripIDs == [id(11)] && parsed.memoryIDs == [id(12)])
        var blocked = preview(command); blocked["conflicts"] = ["ACTIVE_WORK", "PROPOSAL_REFERENCE"]; blocked["eligible"] = false
        #expect(try !NativeConversationDataProtocol.preview(envelope(blocked), command: command, actor: actor, now: wall.addingTimeInterval(0.02)).eligible)
        var overflow = erased; overflow["revisions"] = 4100
        for change: [String: Any] in [["ownerId": id(90)], ["mobileEpoch": 4], ["allUserDataCompleted": true], ["eraseCounts": overflow], ["conflicts": ["PROPOSAL_REFERENCE", "ACTIVE_WORK"], "eligible": false]] {
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

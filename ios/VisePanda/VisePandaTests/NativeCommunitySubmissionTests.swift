import Foundation
import Security
import Testing
@testable import VisePanda

@MainActor struct NativeCommunitySubmissionTests {
    static let actor = NativeDataScope(endpoint: "http://127.0.0.1:65148", subject: "22222222-2222-4222-8222-222222222222", mobileEpoch: 2, generation: 1)

    @Test func previewRequiresExplicitConsentAndCountsUTF16() {
        var draft = NativeCommunityDraft(title: "Experience", content: "Text", consent: false, associationConfirmed: true)
        #expect(!draft.valid)
        draft.consent = true; #expect(draft.valid)
        draft.title = String(repeating: "😀", count: 81); #expect(!draft.valid)
        draft.title = "Experience"; draft.content = String(repeating: "😀", count: 2001); #expect(!draft.valid)
        draft.content = " \n "; #expect(!draft.valid)
    }

    @Test func journalIsExactAndBoundToActorEndpointEpoch() throws {
        let vault = CommunityTestVault(), journal = NativeCommunityJournal(vault: vault)
        let body = try NativeCommunityCommand.submit(.init(title: "Experience", content: "Text", consent: true, associationConfirmed: true)).body
        let stored = try journal.retain(body: body, scope: Self.actor, sessionID: Self.actor.subject)
        #expect(try journal.read(Self.actor, sessionID: Self.actor.subject) == stored)
        #expect(throws: (any Error).self) { try journal.retain(body: try NativeCommunityCommand.submit(.init(title: "Another", content: "Text", consent: true, associationConfirmed: true)).body, scope: Self.actor, sessionID: Self.actor.subject) }
        let epoch = NativeDataScope(endpoint: Self.actor.endpoint, subject: Self.actor.subject, mobileEpoch: 3, generation: 1)
        #expect(throws: (any Error).self) { try journal.read(epoch, sessionID: Self.actor.subject) }
        let endpoint = NativeDataScope(endpoint: "http://127.0.0.1:65149", subject: Self.actor.subject, mobileEpoch: 2, generation: 1)
        #expect(try journal.read(endpoint, sessionID: Self.actor.subject) == nil)
        try journal.complete(stored, scope: Self.actor, sessionID: Self.actor.subject)
        #expect(try journal.read(Self.actor, sessionID: Self.actor.subject) == nil)
    }

    @Test func journalNeverClaimsStoredOrErasedAfterFailure() throws {
        let vault = CommunityTestVault(), journal = NativeCommunityJournal(vault: vault)
        let body = try NativeCommunityCommand.submit(.init(title: "Experience", content: "Text", consent: true, associationConfirmed: true)).body
        vault.failWrite = true
        #expect(throws: (any Error).self) { try journal.retain(body: body, scope: Self.actor, sessionID: Self.actor.subject) }
        vault.failWrite = false
        let pending = try journal.retain(body: body, scope: Self.actor, sessionID: Self.actor.subject)
        vault.failRemove = true
        #expect(throws: (any Error).self) { try journal.complete(pending, scope: Self.actor, sessionID: Self.actor.subject) }
        #expect(try journal.read(Self.actor, sessionID: Self.actor.subject) == pending)
        vault.failRemove = false
        try journal.complete(pending, scope: Self.actor, sessionID: Self.actor.subject)
    }

    @Test func exportPurgesAbandonedCopiesAndFencesFailedDeletion() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("CommunityTest-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        var refuse = false
        let files = NativeCommunityExportFile(root: root, remove: { url in
            if refuse { throw NativeDataError.sessionUnavailable }
            try FileManager.default.removeItem(at: url)
        })
        let first = try files.write(Data("{\"first\":true}".utf8))
        #expect(FileManager.default.fileExists(atPath: first.path))
        let relaunched = NativeCommunityExportFile(root: root)
        #expect(relaunched.ready && !FileManager.default.fileExists(atPath: first.path))
        _ = try files.write(Data("{\"second\":true}".utf8))
        refuse = true
        #expect(throws: (any Error).self) { try files.clear() }
        #expect(!files.ready && files.url == nil)
        refuse = false; try files.clear(); #expect(files.ready)
    }

    @Test func exportRejectsSymlinkRoot() throws {
        let base = FileManager.default.temporaryDirectory.appendingPathComponent("CommunityLinkTest-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: base) }
        let target = base.appendingPathComponent("target"), link = base.appendingPathComponent("link")
        try FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)
        let sentinel = target.appendingPathComponent("keep")
        try Data("private unrelated".utf8).write(to: sentinel)
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: target)
        let files = NativeCommunityExportFile(root: link)
        #expect(!files.ready)
        #expect(throws: (any Error).self) { try files.write(Data("{}".utf8)) }
        #expect(FileManager.default.fileExists(atPath: sentinel.path))
    }

    static var communityActor: NativeCommunityActor { .init(scope: actor, sessionID: actor.subject) }
    static func item(_ id: String, status: String = "pending") -> [String: Any] {
        let erased = ["withdrawn", "deleted"].contains(status)
        let reviewed = ["published", "rejected"].contains(status)
        let version = status == "pending" ? 1 : 2
        return ["id": id, "title": erased ? "" : "Experience", "content": erased ? "" : "Text", "contentKind": "experience",
                "benefitDisclosure": erased ? NSNull() : "", "authorDisclosure": "unknown", "reviewerDisclosure": reviewed ? "official" : NSNull(),
                "status": status, "version": version, "createdAt": "2026-10-05T10:00:00Z", "reviewedAt": reviewed ? "2026-10-05T10:01:00Z" : NSNull(),
                "withdrawnAt": erased ? "2026-10-05T10:02:00Z" : NSNull(), "reviewNote": reviewed ? "Author-visible result" : NSNull(),
                "place": NSNull(), "history": [["action": "submitted", "version": 1, "createdAt": "2026-10-05T10:00:00Z"]],
                "visibility": "internal", "publiclyVisible": false, "retrievalEligible": false]
    }
    static func response(_ value: [String: Any], actor: NativeCommunityActor = communityActor) throws -> Data {
        var data: [String: Any] = ["schemaVersion": NativeCommunityWire.schema, "actorId": actor.scope.subject, "sessionId": actor.sessionID]
        data.merge(value) { _, next in next }
        return try NativeCommunityWire.bytes(["data": data])
    }
    static func operation(_ command: NativeCommunityCommand, state: String, item: [String: Any]? = nil) throws -> Data {
        try response(["kind": "operation", "operationId": command.operationID, "state": state, "submission": item as Any? ?? NSNull()])
    }
    static func submit() throws -> NativeCommunityCommand { try .submit(.init(title: "Experience", content: "Text", consent: true, associationConfirmed: true)) }

    @Test func finalItemRequiresTrustedDisclosureAndRejectsResurrectedText() throws {
        let command = try Self.submit(), id = try #require(command.submissionID)
        let approved = try NativeCommunityItem(Self.item(id, status: "published"))
        #expect(approved.disclosure == "unknown" && approved.reviewerDisclosure == "official" && approved.canWithdraw)
        var bad = Self.item(id, status: "withdrawn"); bad["content"] = "Old receipt must not restore this text"
        #expect(throws: (any Error).self) { try NativeCommunityItem(bad) }
        bad = Self.item(id); bad["authorId"] = Self.actor.subject
        #expect(throws: (any Error).self) { try NativeCommunityItem(bad) }
        bad = Self.item(id); bad.removeValue(forKey: "reviewerDisclosure")
        #expect(throws: (any Error).self) { try NativeCommunityItem(bad) }
        bad = Self.item(id); bad["version"] = true
        #expect(throws: (any Error).self) { try NativeCommunityItem(bad) }
        var rejected = Self.item(id, status: "rejected"); rejected["reviewNote"] = NSNull()
        #expect(try NativeCommunityItem(rejected).reviewNote == nil)
    }

    @Test func closedPlaceCommandFreezesHeadAndDigestAndRejectsAliases() throws {
        var raw = try #require(JSONSerialization.jsonObject(with: Self.submit().body) as? [String: Any])
        let place: [String: Any] = ["tripId": Self.actor.subject, "placeReferenceId": Self.actor.subject, "expectedTripVersion": 0, "mappingDigest": String(repeating: "a", count: 64)]
        raw["place"] = place
        _ = try NativeCommunityCommand(body: NativeCommunityWire.bytes(raw))
        for variant in ["booleanVersion", "negativeVersion", "oldTwoKeys", "callerIdentity"] {
            var altered = raw, p = place
            switch variant {
            case "booleanVersion": p["expectedTripVersion"] = true
            case "negativeVersion": p["expectedTripVersion"] = -1
            case "oldTwoKeys": p.removeValue(forKey: "mappingDigest"); p.removeValue(forKey: "expectedTripVersion")
            default: p["ownerId"] = Self.actor.subject
            }
            altered["place"] = p
            #expect(throws: (any Error).self) { try NativeCommunityCommand(body: NativeCommunityWire.bytes(altered)) }
        }
        let body = try NativeCommunityWire.bytes(raw)
        let path = FileManager.default.temporaryDirectory.appendingPathComponent("vpj48-owned-native-submit.json")
        try body.write(to: path, options: [.atomic, .completeFileProtection])
        print("VPJ48_OWNED_NATIVE_COMMAND_PATH " + path.path)
    }

    @Test func pageMustDeclareCompletionAndForeignOrLateReadsNeverShow() async throws {
        let store = NativeCommunityStore(), id = try #require(Self.submit().submissionID)
        store.restore(Self.communityActor) { nil }
        await store.page(current: { Self.communityActor }) { _ in try Self.response(["kind": "page", "submissions": [Self.item(id)], "nextCursor": id, "complete": false]) }
        #expect(store.visibleItems(Self.communityActor).count == 1 && !store.complete)
        await store.page(current: { Self.communityActor }) { _ in try Self.response(["kind": "page", "submissions": [Self.item(id)], "nextCursor": id, "complete": true]) }
        #expect(store.visibleItems(Self.communityActor).isEmpty)
        var continuation: CheckedContinuation<Data, Never>?
        let work = Task { await store.read(id: id, current: { Self.communityActor }) { _ in await withCheckedContinuation { continuation = $0 } } }
        for _ in 0..<100 { if continuation != nil { break }; await Task.yield() }
        let captured = try #require(continuation)
        store.bind(nil); captured.resume(returning: try Self.response(["kind": "item", "submission": Self.item(id)]))
        await work.value
        #expect(store.selected == nil && store.items.isEmpty && !store.busy)
        let foreign = NativeCommunityActor(scope: .init(endpoint: Self.actor.endpoint, subject: "33333333-3333-4333-8333-333333333333", mobileEpoch: 2, generation: 1), sessionID: Self.actor.subject)
        #expect(throws: (any Error).self) { try NativeCommunityOutcome.decode(Self.response(["kind": "item", "submission": Self.item(id)], actor: foreign), actor: Self.communityActor) }
    }

    @Test func unknownAckPersistsBeforeDispatchAndExactRetryReadsWithdrawnCurrentState() async throws {
        let vault = CommunityTestVault(), journal = NativeCommunityJournal(vault: vault), store = NativeCommunityStore(), command = try Self.submit()
        let id = try #require(command.submissionID)
        let read = { try journal.read(Self.actor, sessionID: Self.actor.subject) }
        let complete = { (value: NativeCommunityPending) in try journal.complete(value, scope: Self.actor, sessionID: Self.actor.subject) }
        store.restore(Self.communityActor, read: read)
        await store.perform(command, current: { Self.communityActor }, read: read,
                            retain: { try journal.retain(body: $0, scope: Self.actor, sessionID: Self.actor.subject) }, complete: complete) { body in
            #expect(try read()?.body == body); throw NativeDataError.server(code: "COMMUNITY_ACK_UNKNOWN")
        }
        #expect(store.pending?.body == command.body && store.selected == nil)
        await store.recover(current: { Self.communityActor }, complete: complete) { body in
            #expect(try NativeCommunityInput(body: body).recovery?.body == command.body)
            return try Self.operation(command, state: "absent")
        }
        #expect(store.pending != nil && store.canRetry(Self.communityActor))
        await store.retry(current: { Self.communityActor }, read: read, complete: complete) { body in
            #expect(body == command.body)
            #expect(try read()?.body == command.body)
            return try Self.operation(command, state: "committed", item: Self.item(id, status: "withdrawn"))
        }
        #expect(store.pending == nil)
        #expect(try read() == nil)
        #expect(store.visibleItem(Self.communityActor)?.status == "withdrawn")
        #expect(store.visibleItem(Self.communityActor)?.content == "")
    }

    @Test func stopUnknownOperationIsExplicitAndDeletionFailureKeepsFence() async throws {
        let vault = CommunityTestVault(), journal = NativeCommunityJournal(vault: vault), store = NativeCommunityStore(), command = try Self.submit()
        let read = { try journal.read(Self.actor, sessionID: Self.actor.subject) }
        let complete = { (value: NativeCommunityPending) in try journal.complete(value, scope: Self.actor, sessionID: Self.actor.subject) }
        _ = try journal.retain(body: command.body, scope: Self.actor, sessionID: Self.actor.subject)
        store.restore(Self.communityActor, read: read)
        vault.failRemove = true
        await store.recover(abandon: true, current: { Self.communityActor }, complete: complete) { body in
            let raw = try #require(JSONSerialization.jsonObject(with: body) as? [String: Any])
            #expect(raw["action"] as? String == "abandon")
            return try Self.operation(command, state: "abandoned")
        }
        #expect(store.pending != nil && !store.storageReady)
        var posts = 0
        await store.perform(try Self.submit(), current: { Self.communityActor }, read: read,
                            retain: { try journal.retain(body: $0, scope: Self.actor, sessionID: Self.actor.subject) }, complete: complete) { _ in posts += 1; return Data() }
        #expect(posts == 0)
        vault.failRemove = false; store.restore(Self.communityActor, read: read)
        await store.recover(abandon: true, current: { Self.communityActor }, complete: complete) { _ in try Self.operation(command, state: "abandoned") }
        #expect(store.pending == nil && store.notice == "OPERATION_ABANDONED")
    }

    @Test func moduleDeletionAndExportNeverClaimAllAccountCoverage() async throws {
        let store = NativeCommunityStore(); store.restore(Self.communityActor) { nil }
        let export: [String: Any] = ["kind": "export", "scope": "community_module", "coverage": "complete_for_community", "submissions": [], "reviews": [], "receipts": [], "audits": [], "retained": NativeCommunityWire.retained]
        await store.export(current: { Self.communityActor }) { _ in try Self.response(export) }
        let url = try #require(store.exportURL(Self.communityActor))
        #expect(FileManager.default.fileExists(atPath: url.path))
        store.suspend(); #expect(store.exportURL(Self.communityActor) == nil && !FileManager.default.fileExists(atPath: url.path))
        var allAccount = export; allAccount["scope"] = "all_account"
        #expect(throws: (any Error).self) { try NativeCommunityOutcome.decode(Self.response(allAccount), actor: Self.communityActor) }
        let command = try NativeCommunityCommand.delete()
        let result = try NativeCommunityOutcome.decode(Self.response(["kind": "deleted", "operationId": command.operationID, "scope": "community_module", "retained": NativeCommunityWire.retained]), actor: Self.communityActor)
        #expect(try result.terminal(for: command, recovery: false))
        #expect(try NativeCommunityOutcome.decode(Self.operation(command, state: "committed"), actor: Self.communityActor).terminal(for: command, recovery: true))
    }

}

@MainActor private final class CommunityTestVault: NativeCredentialVault {
    private var entries: [String: Data] = [:]
    var failWrite = false
    var failRemove = false
    private func key(_ service: String, _ owner: String) -> String { service + "\u{0}" + owner }
    func write(_ data: Data, service: String, owner: String) -> OSStatus {
        if failWrite { return errSecInteractionNotAllowed }
        entries[key(service, owner)] = data; return errSecSuccess
    }
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        guard let data = entries[key(service, owner)] else { return (errSecItemNotFound, nil) }
        return (errSecSuccess, data)
    }
    func remove(service: String, owner: String) -> OSStatus {
        if failRemove { return errSecInteractionNotAllowed }
        entries.removeValue(forKey: key(service, owner)); return errSecSuccess
    }
}

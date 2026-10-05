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
        let export: [String: Any] = ["kind": "export", "scope": "community_module", "coverage": "complete_for_community", "submissions": [], "reviews": [], "receipts": [], "audits": [], "reviewerQualification": NSNull(), "trustedDisclosure": NSNull(), "retained": NativeCommunityWire.retained]
        await store.export(current: { Self.communityActor }) { _ in try Self.response(export) }
        let url = try #require(store.exportURL(Self.communityActor))
        #expect(FileManager.default.fileExists(atPath: url.path))
        store.suspend(); #expect(store.exportURL(Self.communityActor) == nil && !FileManager.default.fileExists(atPath: url.path))
        var final = export
        final["reviewerQualification"] = ["active": false]; final["trustedDisclosure"] = "unknown"
        final["receipts"] = [["operationId": Self.actor.subject, "submissionId": NSNull(), "action": "unknown", "state": "committed", "digest": String(repeating: "a", count: 64)]]
        _ = try NativeCommunityOutcome.decode(Self.response(final), actor: Self.communityActor)
        for variant in ["missingQualification", "missingDisclosure", "numericQualification", "extraKey"] {
            var invalid = final
            switch variant {
            case "missingQualification": invalid.removeValue(forKey: "reviewerQualification")
            case "missingDisclosure": invalid.removeValue(forKey: "trustedDisclosure")
            case "numericQualification": invalid["reviewerQualification"] = ["active": 1]
            default: invalid["foreignPrivateText"] = "not allowed"
            }
            #expect(throws: (any Error).self) { try NativeCommunityOutcome.decode(Self.response(invalid), actor: Self.communityActor) }
        }
        var unknown = try #require(JSONSerialization.jsonObject(with: Self.submit().body) as? [String: Any]); unknown["action"] = "unknown"
        #expect(throws: (any Error).self) { try NativeCommunityCommand(body: NativeCommunityWire.bytes(unknown)) }
        var allAccount = export; allAccount["scope"] = "all_account"
        #expect(throws: (any Error).self) { try NativeCommunityOutcome.decode(Self.response(allAccount), actor: Self.communityActor) }
        let command = try NativeCommunityCommand.delete()
        let result = try NativeCommunityOutcome.decode(Self.response(["kind": "deleted", "operationId": command.operationID, "scope": "community_module", "retained": NativeCommunityWire.retained]), actor: Self.communityActor)
        #expect(try result.terminal(for: command, recovery: false))
        #expect(try NativeCommunityOutcome.decode(Self.operation(command, state: "committed"), actor: Self.communityActor).terminal(for: command, recovery: true))
    }


    @Test func escapedMutationRecoveryIsBoundedExactAndCommittedAbandonDoesNotUndo() async throws {
        let content = String(repeating: "\\", count: 4000)
        let command = try NativeCommunityCommand.submit(.init(title: "Experience", content: content, consent: true, associationConfirmed: true))
        #expect(command.body.count <= NativeCommunityWire.maximumMutationBytes)
        let operation = try command.recovery(), abandon = try command.recovery(abandon: true)
        #expect(try #require(String(data: operation, encoding: .utf8)).utf16.count > NativeCommunityWire.maximumMutationUTF16)
        #expect(try NativeCommunityInput(body: operation).recovery?.body == command.body)
        #expect(try NativeCommunityInput(body: abandon).recovery?.body == command.body)
        var atLimit = operation
        atLimit.append(Data(repeating: 32, count: NativeCommunityWire.maximumTransportBytes - atLimit.count))
        #expect(try NativeCommunityInput(body: atLimit).recovery?.body == command.body)
        // Legal JSON whitespace expands to escaped TABs only inside the recovery envelope.
        let nearDraft = NativeCommunityDraft(title: String(repeating: "中", count: 160), content: String(repeating: "中", count: 4000),
                                             consent: true, benefitDisclosure: String(repeating: "中", count: 400), associationConfirmed: true)
        let nearBase = try NativeCommunityCommand.submit(nearDraft)
        let baseText = try #require(String(data: nearBase.body, encoding: .utf8))
        let tabCount = NativeCommunityWire.maximumMutationUTF16 - baseText.utf16.count
        #expect(tabCount > 0)
        let nearBody = Data((String(repeating: "\t", count: tabCount) + baseText).utf8)
        #expect(try #require(String(data: nearBody, encoding: .utf8)).utf16.count == NativeCommunityWire.maximumMutationUTF16)
        let nearCommand = try NativeCommunityCommand(body: nearBody), nearOperation = try nearCommand.recovery()
        #expect(nearCommand.body.count <= 24_000 && nearOperation.count > 24_000 && nearOperation.count <= 49_152)
        #expect(try NativeCommunityInput(body: nearOperation).recovery?.body == nearBody)
        #expect(try NativeCommunityInput(body: nearCommand.recovery(abandon: true)).recovery?.body == nearBody)
        var overOuter = atLimit; overOuter.append(32)
        #expect(throws: (any Error).self) { try NativeCommunityInput(body: overOuter) }
        var overInner = command.body
        overInner.append(Data(repeating: 32, count: NativeCommunityWire.maximumMutationUTF16 + 1 - overInner.count))
        let innerRejected = try NativeCommunityWire.bytes(["action": "operation", "operationId": command.operationID, "mutationBytes": try #require(String(data: overInner, encoding: .utf8))])
        #expect(throws: (any Error).self) { try NativeCommunityInput(body: innerRejected) }
        var oversizedBytes = command.body
        oversizedBytes.append(Data(repeating: 32, count: NativeCommunityWire.maximumMutationBytes + 1 - oversizedBytes.count))
        #expect(throws: (any Error).self) { try NativeCommunityCommand(body: oversizedBytes) }
        let small = try Self.submit(), nested = try small.recovery()
        let nestedRejected = try NativeCommunityWire.bytes(["action": "abandon", "operationId": small.operationID, "mutationBytes": try #require(String(data: nested, encoding: .utf8))])
        #expect(throws: (any Error).self) { try NativeCommunityInput(body: nestedRejected) }
        var ordinary = command.body
        ordinary.append(Data(repeating: 32, count: NativeCommunityWire.maximumMutationBytes + 1 - ordinary.count))
        #expect(throws: (any Error).self) { try NativeCommunityInput(body: ordinary) }

        let vault = CommunityTestVault(), journal = NativeCommunityJournal(vault: vault), store = NativeCommunityStore()
        let read = { try journal.read(Self.actor, sessionID: Self.actor.subject) }
        let complete = { (value: NativeCommunityPending) in try journal.complete(value, scope: Self.actor, sessionID: Self.actor.subject) }
        store.restore(Self.communityActor, read: read)
        await store.perform(nearCommand, current: { Self.communityActor }, read: read,
                            retain: { try journal.retain(body: $0, scope: Self.actor, sessionID: Self.actor.subject) }, complete: complete) { bytes in
            #expect(bytes == nearCommand.body)
            #expect(try read()?.body == bytes)
            throw NativeDataError.server(code: "COMMUNITY_ACK_UNKNOWN")
        }
        await store.recover(current: { Self.communityActor }, complete: complete) { bytes in
            #expect(bytes == nearOperation)
            return try Self.operation(nearCommand, state: "absent")
        }
        #expect(store.pending?.body == nearCommand.body && store.canRetry(Self.communityActor))
        var committed = Self.item(try #require(nearCommand.submissionID)); committed["content"] = nearDraft.content
        let receipt = try Self.operation(nearCommand, state: "committed", item: committed)
        let expectedAbandon = try nearCommand.recovery(abandon: true)
        await store.recover(abandon: true, current: { Self.communityActor }, complete: complete) { bytes in
            #expect(bytes == expectedAbandon)
            return receipt
        }
        #expect(store.pending == nil && store.visibleItem(Self.communityActor)?.content == nearDraft.content)
        #expect(store.visibleItem(Self.communityActor)?.status == "pending")

        // The actual NativeSession transport must accept the larger recovery envelope, not just its parser.
        let name = "community-escaped-session-" + UUID().uuidString
        let defaults = try #require(UserDefaults(suiteName: name)); defer { defaults.removePersistentDomain(forName: name) }
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [CommunitySessionProtocol.self]
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", Self.actor.endpoint], defaults: defaults, configuration: config, bundleConfiguration: [:], vault: vault)
        await session.login(email: "synthetic@example.invalid", password: "synthetic-only")
        let actor = try session.communityActor()
        _ = try session.rememberCommunity(body: nearCommand.body, actor: actor)
        do { _ = try await session.communityRequest(body: nearOperation, actor: actor) } catch { }
        #expect(session.status == "expiredOrReplaced" && session.dataScope == nil)
        await session.logout()
    }

    @Test func actualSessionHeadersAndDenialEraseOwnJournalBeforeLegacyPreservation() async throws {
        let name = "community-session-" + UUID().uuidString
        let defaults = try #require(UserDefaults(suiteName: name)); defer { defaults.removePersistentDomain(forName: name) }
        let vault = CommunityTestVault(), config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [CommunitySessionProtocol.self]
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", Self.actor.endpoint], defaults: defaults, configuration: config, bundleConfiguration: [:], vault: vault)
        await session.login(email: "synthetic@example.invalid", password: "synthetic-only")
        let actor = try session.communityActor(), command = try Self.submit()
        _ = try session.rememberCommunity(body: command.body, actor: actor)
        do { _ = try await session.communityRequest(body: command.body, actor: actor) } catch { }
        #expect(session.dataScope == nil && session.status == "expiredOrReplaced")
        #expect(try NativeCommunityJournal(vault: vault).read(actor.scope, sessionID: actor.sessionID) == nil)
        #expect(defaults.string(forKey: "native.v2.activeSubject." + actor.scope.endpoint + ".pendingJournalCleanupOwner") == actor.scope.subject)
        await session.logout()
        #expect(session.status == "signedOut")
    }
    @Test func actualSessionJournalCleanupFailureFencesIdentityAndCanBeRetried() async throws {
        let name = "community-cleanup-" + UUID().uuidString
        let defaults = try #require(UserDefaults(suiteName: name)); defer { defaults.removePersistentDomain(forName: name) }
        let vault = CommunityTestVault(), config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [CommunitySessionProtocol.self]
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", Self.actor.endpoint], defaults: defaults, configuration: config, bundleConfiguration: [:], vault: vault)
        await session.login(email: "synthetic@example.invalid", password: "synthetic-only")
        let actor = try session.communityActor(), command = try Self.submit()
        let pending = try session.rememberCommunity(body: command.body, actor: actor)
        vault.failRemove = true
        await session.logout()
        #expect(session.dataScope == nil && session.status == "storageError")
        #expect(session.failureCode == "communityJournalCleanupRequired")
        #expect(try NativeCommunityJournal(vault: vault).read(actor.scope, sessionID: actor.sessionID) == pending)
        vault.failRemove = false
        await session.logout()
        #expect(session.status == "signedOut")
        #expect(try NativeCommunityJournal(vault: vault).read(actor.scope, sessionID: actor.sessionID) == nil)
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

nonisolated private final class CommunitySessionProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "127.0.0.1" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let owner = "22222222-2222-4222-8222-222222222222", session = "33333333-3333-4333-8333-333333333333"
        let path = request.url!.path
        let status: Int, value: [String: Any]
        if path.hasSuffix("/credentials") {
            let payload = try! JSONSerialization.data(withJSONObject: ["sub": owner, "session_id": session])
                .base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
            status = 200; value = ["subject": owner, "accessToken": "synthetic." + payload + ".unsigned-fixture", "refreshToken": "synthetic-only", "expiresAt": Date().timeIntervalSince1970 + 3600]
        } else if path.hasSuffix("/login") { status = 200; value = ["subject": owner, "mobileEpoch": 2] }
        else if path.hasSuffix("/profile") { status = 200; value = ["subject": owner, "displayName": "Synthetic"] }
        else if path.hasSuffix("/logout") { status = 200; value = [:] }
        else if path == "/api/community/native/v1", request.value(forHTTPHeaderField: "x-community-expected-actor") == owner,
                request.value(forHTTPHeaderField: "x-community-expected-session") == session,
                request.value(forHTTPHeaderField: "Cookie") == nil, request.httpMethod == "POST" {
            status = 401; value = ["error": "UNAUTHENTICATED"]
        } else { status = 400; value = ["error": "INVALID_FIXTURE_TRANSPORT"] }
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: try! JSONSerialization.data(withJSONObject: value)); client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

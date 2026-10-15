import Foundation
import Security
import Testing
@testable import VisePanda

// Explicit fixture injection for existing Store tests; never a production default.
@MainActor final class NativeTranslationRecoveryTestPersistence: NativeTranslationRecoveryPersistence {
    var record: NativeTranslationRecoveryRecord?
    func read(_ scope: NativeDataScope) throws -> NativeTranslationRecoveryRecord? {
        guard record == nil || record?.matches(scope) == true else { throw NativeTranslationRecoveryError.compareFailed }
        return record
    }
    func retain(_ identity: NativeTranslationRecoveryIdentity, scope: NativeDataScope) throws -> NativeTranslationRecoveryRecord {
        guard record == nil else { throw NativeTranslationRecoveryError.pendingRecord }
        let next = NativeTranslationRecoveryRecord(identity: identity, endpoint: scope.endpoint, subject: scope.subject,
            mobileEpoch: scope.mobileEpoch, bytes: try JSONEncoder().encode(identity))
        record = next; return next
    }
    func complete(_ original: NativeTranslationRecoveryRecord, verifiedReceipt: NativeTranslationRecoveryReceipt, scope: NativeDataScope) throws {
        guard verifiedReceipt.permitsCompletion, verifiedReceipt.identity == original.identity else { throw NativeTranslationRecoveryError.invalidReceipt }
        try abandonLocally(original, scope: scope)
    }
    func abandonLocally(_ original: NativeTranslationRecoveryRecord, scope: NativeDataScope) throws {
        guard try read(scope) == original else { throw NativeTranslationRecoveryError.compareFailed }
        record = nil
    }
}

@MainActor private final class TranslationStoreFakeVault: NativeCredentialVault {
    var items: [String: Data] = [:]
    var writeFailure = false
    var physicalReadFailure = false
    var failReadAfterWrite = false
    var removes = 0
    func write(_ data: Data, service: String, owner: String) -> OSStatus {
        if writeFailure { return errSecNotAvailable }
        items[service + "|" + owner] = data
        if failReadAfterWrite { physicalReadFailure = true }
        return errSecSuccess
    }
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        if physicalReadFailure { return (errSecNotAvailable, nil) }
        return items[service + "|" + owner].map { (errSecSuccess, $0) } ?? (errSecItemNotFound, nil)
    }
    func remove(service: String, owner: String) -> OSStatus {
        removes += 1
        return items.removeValue(forKey: service + "|" + owner) == nil ? errSecItemNotFound : errSecSuccess
    }
}

@MainActor private final class TranslationStoreFixture {
    let scope = NativeDataScope(endpoint: "http://127.0.0.1", subject: "11111111-1111-4111-8111-111111111111", mobileEpoch: 1, generation: 1)
    let vault = TranslationStoreFakeVault()
    var journal: NativeTranslationRecoveryJournal { .init(vault: vault) }
    var original = "No peanuts. CNY 50."
    var policyID = "22222222-2222-4222-8222-222222222222"
    var notice = String(repeating: "a", count: 64)
    var accepted = true
    var state = "unknown"
    var nullPhrase = true
    var mismatch = false
    var recoveryFailure = false
    var posts: [Data] = []
    var cancelPosts = 0
    var gets = 0
    var physicalBeforePOST = false
    func makeStore() -> NativeTranslationStore { .init(recovery: journal) }
    func policy() throws -> Data {
        try JSONSerialization.data(withJSONObject: ["version": 1, "kind": "policy", "policy": [
            "id": policyID, "provider": "qwen", "recipient": "Synthetic recipient", "sourceRegion": "test",
            "processingRegion": "test", "storageRegion": "test", "termsVersion": "test", "noticeVersion": "test",
            "noticeHash": notice, "noticeZh": "Test", "noticeEn": "Test", "retention": "retain_after_hide_v1",
            "expiresAt": "2099-01-01T00:00:00Z", "consentState": accepted ? "accepted" : "withdrawn"]])
    }
    func receipt() throws -> Data {
        let identity = try #require(try journal.read(scope)?.identity)
        var object = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(identity)) as? [String: Any])
        if mismatch { object["inputHash"] = String(repeating: "b", count: 64) }
        var phrase: Any = NSNull()
        if !nullPhrase {
            phrase = ["turnId": identity.turnId, "sourceLocale": identity.sourceLocale, "targetLocale": identity.targetLocale,
                "original": original, "state": state, "translation": state == "translated" ? "Sample 50." as Any : NSNull(),
                "backTranslation": state == "translated" ? original as Any : NSNull()]
        }
        return try JSONSerialization.data(withJSONObject: ["version": 1, "kind": "translation_recovery", "identity": object, "state": state, "phrase": phrase])
    }
    func request(_ path: String, _ method: String, _ body: Data?) throws -> Data {
        if path == "api/translate/policy" { return try policy() }
        if path == "api/translate/consent" { return Data("{}".utf8) }
        if path.hasPrefix("api/translate/recovery/") {
            gets += 1
            #expect(method == "GET" && body == nil)
            let query = try #require(URLComponents(string: path)?.queryItems)
            let values = Dictionary(uniqueKeysWithValues: query.map { ($0.name, $0.value ?? "") })
            let identity = try #require(try journal.read(scope)?.identity)
            #expect(values.count == 7 && values["threadId"] == identity.threadId && values["idempotencyKey"] == identity.idempotencyKey)
            #expect(values["inputHash"] == identity.inputHash && values["noticeHash"] == identity.noticeHash)
            #expect(path.hasPrefix("api/translate/recovery/" + identity.turnId + "?"))
            if recoveryFailure { throw NativeDataError.server(code: "PROVIDER_UNAVAILABLE") }
            return try receipt()
        }
        if method == "POST", path.hasSuffix("/cancel") { cancelPosts += 1; return Data("{\"version\":1,\"kind\":\"cancelled\"}".utf8) }
        if path == "api/translate", method == "POST", let body {
            physicalBeforePOST = try journal.read(scope) != nil
            posts.append(body)
            throw NativeDataError.server(code: "PROVIDER_UNAVAILABLE") // Lost ACK: the server outcome is unknown.
        }
        return Data("{\"version\":1,\"kind\":\"translations\",\"phrases\":[]}".utf8)
    }
    func send(_ store: NativeTranslationStore) async {
        await store.load(scope: scope, request: request)
        await store.submit(text: original, sourceLocale: "en", request: request)
    }
}

@MainActor struct NativeTranslationRecoveryStoreTests {
    @Test func lostACKBackgroundAndRecreatedStoreReconcileSameIdentityWithoutExtraPOST() async throws {
        let f = TranslationStoreFixture(), store = NativeTranslationStore()
        await store.load(scope: f.scope, request: f.request)
        await store.submit(text: f.original, sourceLocale: "en", request: f.request)
        #expect(f.posts.isEmpty && store.recoveryStatus == .storageFailed) // No silent memory fallback.
        let first = f.makeStore()
        await f.send(first)
        let record = try #require(try f.journal.read(f.scope))
        #expect(f.physicalBeforePOST && f.posts.count == 1)
        first.clear()
        #expect(first.pending == nil && first.phrases.isEmpty && first.scope == nil)
        #expect(try f.journal.read(f.scope) == record)
        let reopened = f.makeStore()
        let nextGeneration = NativeDataScope(endpoint: f.scope.endpoint, subject: f.scope.subject, mobileEpoch: 1, generation: 2)
        await reopened.load(scope: nextGeneration, request: f.request)
        #expect(reopened.pending == nil && reopened.recoveryRecord == record && reopened.recoveryStatus == .unknown)
        await reopened.submit(text: "Different text", sourceLocale: "zh", request: f.request)
        #expect(f.posts.count == 1 && f.gets == 2 && f.vault.removes == 0)
        #expect(try f.journal.read(f.scope) == record)
    }

    @Test func exactTerminalGETRestoresOutsideHistoryWindowAndSettlesOnlyOriginalRecord() async throws {
        let f = TranslationStoreFixture(), store = f.makeStore()
        await f.send(store)
        let original = try #require(try f.journal.read(f.scope))
        f.state = "translated"; f.nullPhrase = false
        await store.load(scope: f.scope, request: f.request)
        #expect(f.posts.count == 1 && f.gets == 1 && f.vault.removes == 1)
        #expect(try f.journal.read(f.scope) == nil)
        #expect(!store.hasUnresolvedRecovery && store.pending == nil && store.recoveryStatus == .translated)
        #expect(store.phrases.count == 1 && store.phrases.first?.turnId == original.identity.turnId)
        #expect(store.phrases.first?.original.utf8.elementsEqual(f.original.utf8) == true)
    }

    @Test(arguments: [false, true]) func saveOrPhysicalReadbackFailurePreventsPOST(afterWrite: Bool) async throws {
        let f = TranslationStoreFixture(), store = f.makeStore()
        await store.load(scope: f.scope, request: f.request)
        f.vault.writeFailure = !afterWrite; f.vault.failReadAfterWrite = afterWrite
        await store.submit(text: f.original, sourceLocale: "en", request: f.request)
        #expect(f.posts.isEmpty && store.hasUnresolvedRecovery && store.recoveryStatus == .storageFailed)
        #expect(f.vault.removes == 0)
        f.vault.physicalReadFailure = false; f.vault.failReadAfterWrite = false
        await store.load(scope: f.scope, request: f.request)
        #expect(f.posts.isEmpty)
        #expect(afterWrite ? store.recoveryRecord != nil : store.recoveryRecord == nil)
    }

    @Test func policyNoticeAndWithdrawalHidePrivateTextButKeepDurableIdentity() async throws {
        let f = TranslationStoreFixture(), store = f.makeStore()
        await f.send(store)
        let original = try #require(try f.journal.read(f.scope))
        for replacement in ["33333333-3333-4333-8333-333333333333", f.policyID] {
            f.policyID = replacement; f.notice = replacement == original.identity.policyId ? String(repeating: "b", count: 64) : f.notice
            await store.load(scope: f.scope, request: f.request)
            #expect(store.recoveryStatus == .blocked && store.phrases.isEmpty && store.pending == nil)
            #expect(try f.journal.read(f.scope) == original)
        }
        f.notice = original.identity.noticeHash; f.accepted = false
        await store.consent(accept: false, request: f.request)
        #expect(store.policy?.consentState != .accepted && store.phrases.isEmpty && f.gets == 0)
        #expect(try f.journal.read(f.scope) == original)
        #expect(f.posts.count == 1 && f.vault.removes == 0)
    }

    @Test func actorEndpointAndEpochChangesNeverReadOriginalPrivatePhrase() async throws {
        let f = TranslationStoreFixture(), store = f.makeStore()
        await f.send(store)
        let original = try #require(try f.journal.read(f.scope))
        for changed in [NativeDataScope(endpoint: f.scope.endpoint, subject: "44444444-4444-4444-8444-444444444444", mobileEpoch: 1, generation: 2),
                        NativeDataScope(endpoint: f.scope.endpoint, subject: f.scope.subject, mobileEpoch: 2, generation: 2),
                        NativeDataScope(endpoint: "http://localhost", subject: f.scope.subject, mobileEpoch: 1, generation: 2)] {
            await store.load(scope: changed, request: f.request)
            #expect(store.phrases.isEmpty && store.pending == nil && f.gets == 0)
        }
        #expect(try f.journal.read(f.scope) == original)
        #expect(f.posts.count == 1 && f.vault.removes == 0)
    }

    @Test func cancellationACKAndNullTerminalCannotProveCompletion() async throws {
        let f = TranslationStoreFixture(), store = f.makeStore()
        await f.send(store)
        let original = try #require(try f.journal.read(f.scope))
        await store.cancel(request: f.request)
        #expect(f.cancelPosts == 1 && store.recoveryStatus == .unknown && f.vault.removes == 0)
        f.state = "cancelled"
        await store.load(scope: f.scope, request: f.request)
        #expect(store.recoveryRecord == original && f.vault.removes == 0)
        f.nullPhrase = false
        await store.load(scope: f.scope, request: f.request)
        #expect(!store.hasUnresolvedRecovery && f.vault.removes == 1 && f.posts.count == 1)
    }

    @Test func mismatchedReceiptAnd503RetainOriginalAndNeverBecomeNewSendEligibility() async throws {
        let f = TranslationStoreFixture(), store = f.makeStore()
        await f.send(store)
        let original = try #require(try f.journal.read(f.scope))
        f.state = "translated"; f.nullPhrase = false; f.mismatch = true
        await store.load(scope: f.scope, request: f.request)
        #expect(store.phrases.isEmpty && store.recoveryStatus == .unknown && store.hasUnresolvedRecovery)
        f.mismatch = false; f.recoveryFailure = true
        await store.load(scope: f.scope, request: f.request)
        #expect(try f.journal.read(f.scope) == original)
        #expect(f.posts.count == 1 && f.vault.removes == 0 && store.phrases.isEmpty)
    }

    @Test func lateCallbackAfterBackgroundCannotPublishOrComplete() async throws {
        let f = TranslationStoreFixture(), store = f.makeStore()
        await f.send(store)
        f.state = "translated"; f.nullPhrase = false
        await store.load(scope: f.scope) { path, method, body in
            let data = try f.request(path, method, body)
            if path.hasPrefix("api/translate/recovery/") { store.clear() }
            return data
        }
        #expect(store.scope == nil && store.phrases.isEmpty && store.recoveryRecord == nil)
        #expect(try f.journal.read(f.scope) != nil && f.vault.removes == 0)
    }

    @Test func lateActorChangeBeforeReconciliationCannotPublishOrComplete() async throws {
        let f = TranslationStoreFixture(), store = f.makeStore()
        await f.send(store)
        f.state = "translated"; f.nullPhrase = false
        var live: NativeDataScope? = f.scope
        await store.load(scope: f.scope, currentScope: { live }) { path, method, body in
            let data = try f.request(path, method, body)
            if path.hasPrefix("api/translate/recovery/") { live = nil }
            return data
        }
        #expect(store.phrases.isEmpty && f.vault.removes == 0 && store.hasUnresolvedRecovery)
    }

    @Test(arguments: ["consent", "policy", "notice"]) func policyChangeDuringOriginalGETCannotExposeOrSettle(change: String) async throws {
        let f = TranslationStoreFixture(), store = f.makeStore()
        await f.send(store)
        let original = try #require(try f.journal.read(f.scope))
        f.state = "translated"; f.nullPhrase = false
        await store.load(scope: f.scope) { path, method, body in
            let bytes = try f.request(path, method, body)
            if path.hasPrefix("api/translate/recovery/") {
                if change == "consent" { f.accepted = false }
                if change == "policy" { f.policyID = "33333333-3333-4333-8333-333333333333" }
                if change == "notice" { f.notice = String(repeating: "b", count: 64) }
            }
            return bytes
        }
        #expect(store.phrases.isEmpty && store.recoveryStatus == .blocked && store.hasUnresolvedRecovery)
        #expect(try f.journal.read(f.scope) == original && f.vault.removes == 0 && f.posts.count == 1)
    }

    @Test(arguments: ["pending", "unknown", "cancelled", "unavailable", "needs_review"])
    func nullProjectionNeverSettlesEvenForTerminalState(state: String) async throws {
        let f = TranslationStoreFixture(), store = f.makeStore()
        await f.send(store)
        let original = try #require(try f.journal.read(f.scope))
        f.state = state
        await store.load(scope: f.scope, request: f.request)
        #expect(try f.journal.read(f.scope) == original)
        #expect(store.hasUnresolvedRecovery && store.phrases.isEmpty && f.vault.removes == 0 && f.posts.count == 1)
    }

    @Test func replacedPhysicalRecordCannotBeClearedByLateOriginalTerminal() async throws {
        let f = TranslationStoreFixture(), store = f.makeStore()
        await f.send(store)
        let original = try #require(try f.journal.read(f.scope))
        f.state = "translated"; f.nullPhrase = false
        var replacement: NativeTranslationRecoveryRecord?
        await store.load(scope: f.scope) { path, method, body in
            let data = try f.request(path, method, body)
            if path.hasPrefix("api/translate/recovery/") {
                try f.journal.abandonLocally(original, scope: f.scope)
                let old = original.identity
                let identity = try NativeTranslationRecoveryIdentity(threadId: old.threadId,
                    turnId: "33333333-3333-4333-8333-333333333333", idempotencyKey: old.idempotencyKey,
                    policyId: old.policyId, noticeHash: old.noticeHash, sourceLocale: old.sourceLocale,
                    targetLocale: old.targetLocale, inputHash: old.inputHash)
                replacement = try f.journal.retain(identity, scope: f.scope)
            }
            return data
        }
        #expect(try f.journal.read(f.scope) == replacement)
        #expect(store.phrases.isEmpty && f.vault.removes == 1 && f.posts.count == 1)
    }

    @Test func missingPhysicalRecordDoesNotProvePriorRequestNeverExisted() async throws {
        let f = TranslationStoreFixture(), store = f.makeStore()
        await f.send(store)
        let original = try #require(try f.journal.read(f.scope))
        f.vault.items.removeAll()
        await store.load(scope: f.scope, request: f.request)
        #expect(store.recoveryRecord == original && store.hasUnresolvedRecovery && store.recoveryStatus == .storageFailed)
        await store.submit(text: f.original, sourceLocale: "en", request: f.request)
        #expect(f.posts.count == 1 && f.vault.removes == 0)
    }

    @Test func utf8OriginalHashDoesNotNormalizeAndTripFieldsNeverPersist() async throws {
        let f = TranslationStoreFixture(), store = f.makeStore()
        f.original = "e\u{301}"
        await store.load(scope: f.scope, request: f.request)
        let source = NativeTranslationTripSource(ownerId: f.scope.subject, tripId: f.policyID, headVersion: 2, dayId: "day-1", itemId: "item_1", field: "title")
        await store.submit(text: f.original, sourceLocale: "en", tripSelection: .init(scope: f.scope, source: source, value: f.original), request: f.request)
        let record = try #require(try f.journal.read(f.scope))
        #expect(record.identity.inputHash == NativeTranslationRecoveryIdentity.hashInput(f.original))
        #expect(record.identity.inputHash != NativeTranslationRecoveryIdentity.hashInput("\u{e9}"))
        let saved = try #require(String(data: record.bytes, encoding: .utf8))
        #expect(!saved.contains("tripSource") && !saved.contains("item_1") && !saved.contains(f.original))
        f.original = "\u{e9}"; f.state = "translated"; f.nullPhrase = false
        await store.load(scope: f.scope, request: f.request)
        #expect(store.phrases.isEmpty && store.hasUnresolvedRecovery && f.vault.removes == 0)
    }

    @Test func explicitLocalAbandonDoesNotCancelOrGenerate() async throws {
        let f = TranslationStoreFixture(), store = f.makeStore()
        await f.send(store)
        let reviewed = try #require(store.recoveryRecord)
        store.abandonLocalRecovery(reviewed)
        #expect(try f.journal.read(f.scope) == nil)
        #expect(f.posts.count == 1 && f.cancelPosts == 0 && f.vault.removes == 1)
        #expect(!store.hasUnresolvedRecovery && store.pending == nil)
    }

    @Test func staleAbandonConfirmationCannotDiscardAnotherIdentity() async throws {
        let f = TranslationStoreFixture(), store = f.makeStore()
        await f.send(store)
        let stale = try #require(store.recoveryRecord)
        store.abandonLocalRecovery(stale)
        await store.submit(text: f.original, sourceLocale: "en", request: f.request)
        let current = try #require(store.recoveryRecord)
        #expect(current.identity != stale.identity)
        store.abandonLocalRecovery(stale)
        #expect(try f.journal.read(f.scope) == current && store.hasUnresolvedRecovery && f.vault.removes == 1)
    }

    @Test(arguments: [false, true]) func latestHistoryCannotReplaceExactRecoveryProof(terminal: Bool) async throws {
        let f = TranslationStoreFixture(), store = f.makeStore()
        await f.send(store)
        let identity = try #require(try f.journal.read(f.scope)?.identity)
        if terminal { f.state = "translated"; f.nullPhrase = false }
        let unrelatedBody = "Different original. CNY 50."
        let history = try JSONSerialization.data(withJSONObject: ["version": 1, "kind": "translations", "phrases": [[
            "turnId": identity.turnId, "sourceLocale": "en", "targetLocale": "zh", "state": "translated",
            "original": unrelatedBody, "translation": "50", "backTranslation": unrelatedBody]]])
        await store.load(scope: f.scope) { path, method, body in
            if path == "api/translate", method == "GET" { return history }
            return try f.request(path, method, body)
        }
        #expect(terminal ? store.phrases.first?.original == f.original : store.phrases.isEmpty)
        #expect(store.phrases.allSatisfy { $0.original != unrelatedBody })
        #expect(f.posts.count == 1)
    }
}

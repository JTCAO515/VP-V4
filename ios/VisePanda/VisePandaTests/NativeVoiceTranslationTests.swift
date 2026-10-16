import Foundation
import Security
import Testing
@testable import VisePanda

/// Synthetic physical storage only; production still uses Session's original vault.
@MainActor private final class VoiceTranslationTestVault: NativeCredentialVault {
    var items: [String: Data] = [:]
    var failWrite = false
    var failReadAfterWrite = false
    var blockRead = false
    var removes = 0
    func write(_ data: Data, service: String, owner: String) -> OSStatus {
        guard !failWrite else { return errSecNotAvailable }
        items[service + "|" + owner] = data
        if failReadAfterWrite { blockRead = true }
        return errSecSuccess
    }
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        guard !blockRead else { return (errSecNotAvailable, nil) }
        return items[service + "|" + owner].map { (errSecSuccess, $0) } ?? (errSecItemNotFound, nil)
    }
    func remove(service: String, owner: String) -> OSStatus {
        removes += 1
        return items.removeValue(forKey: service + "|" + owner) == nil ? errSecItemNotFound : errSecSuccess
    }
}

@MainActor private final class VoiceTranslationFixture {
    let scope = NativeDataScope(endpoint: "http://127.0.0.1", subject: "22222222-2222-4222-8222-222222222222", mobileEpoch: 1, generation: 1)
    let policyID = "11111111-1111-4111-8111-111111111111"
    var noticeHash = String(repeating: "a", count: 64)
    let vault = VoiceTranslationTestVault()
    var journal: NativeTranslationRecoveryJournal { .init(vault: vault) }
    var original = "No peanuts."
    var source = "en"
    var accepted = true
    var lostACK = true
    var state = "unknown"
    var includePhrase = false
    var historyTurn: String?
    var historyOriginal: String?
    var posts: [Data] = []
    var recoveryQueries: [NativeTranslationRecoveryIdentity] = []
    var cancels = 0
    var physicalBeforePOST = false
    var denyRead = false

    func boundStore() -> NativeVoiceTranslationStore {
        let store = NativeVoiceTranslationStore()
        store.bind(scope: scope, recovery: journal)
        return store
    }
    func policy() throws -> Data {
        try JSONSerialization.data(withJSONObject: ["version": 1, "kind": "policy", "policy": [
            "id": policyID, "provider": "qwen", "recipient": "Synthetic recipient", "sourceRegion": "test", "processingRegion": "test",
            "storageRegion": "test", "termsVersion": "test", "noticeVersion": "test", "noticeHash": noticeHash,
            "noticeZh": "Synthetic notice", "noticeEn": "Synthetic notice", "retention": "retain_after_hide_v1",
            "expiresAt": "2099-01-01T00:00:00Z", "consentState": accepted ? "accepted" : "withdrawn"]])
    }
    func phrase(turn: String, original: String, state: String, source: String) -> [String: Any] {
        ["turnId": turn, "sourceLocale": source, "targetLocale": source == "en" ? "zh" : "en", "original": original,
         "state": state, "translation": state == "translated" ? "Synthetic translation" as Any : NSNull(),
         "backTranslation": state == "translated" ? original as Any : NSNull()]
    }
    func request(_ path: String, _ method: String, _ body: Data?) throws -> Data {
        if path == "api/translate/policy" {
            if denyRead { throw NativeDataError.server(code: "FORBIDDEN") }
            return try policy()
        }
        if path == "api/translate/consent" {
            #expect(method == "DELETE" || method == "POST")
            return Data("{}".utf8)
        }
        if path.hasPrefix("api/translate/recovery/") {
            #expect(method == "GET" && body == nil)
            let record = try #require(try journal.read(scope))
            let components = try #require(URLComponents(string: path))
            let query = try #require(components.queryItems)
            try #require(query.count == 7 && Set(query.map(\.name)).count == 7)
            let values = Dictionary(uniqueKeysWithValues: query.map { ($0.name, $0.value ?? "") })
            let fields = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(record.identity)) as? [String: String])
            #expect(components.path == "api/translate/recovery/" + record.identity.turnId)
            #expect(Set(values.keys) == NativeTranslationRecoveryIdentity.keys.subtracting(["turnId"]))
            for (key, value) in fields where key != "turnId" { #expect(values[key] == value) }
            recoveryQueries.append(record.identity)
            return try JSONSerialization.data(withJSONObject: ["version": 1, "kind": "translation_recovery", "identity": fields,
                "state": state, "phrase": includePhrase ? phrase(turn: record.identity.turnId, original: original, state: state, source: record.identity.sourceLocale) as Any : NSNull()])
        }
        if path.hasSuffix("/cancel") {
            #expect(method == "POST")
            cancels += 1
            return Data("{\"version\":1,\"kind\":\"cancelled\"}".utf8)
        }
        if path == "api/translate", method == "POST" {
            let data = try #require(body)
            let record = try #require(try journal.read(scope))
            let fields = try #require(JSONSerialization.jsonObject(with: data) as? [String: String])
            #expect(Set(fields.keys) == Set(["threadId", "turnId", "idempotencyKey", "policyId", "sourceLocale", "targetLocale", "text"]))
            #expect(fields["text"]?.utf8.elementsEqual(original.utf8) == true)
            #expect(fields["threadId"] == record.identity.threadId && fields["turnId"] == record.identity.turnId)
            #expect(fields["idempotencyKey"] == record.identity.idempotencyKey && fields["policyId"] == record.identity.policyId)
            #expect(fields["sourceLocale"] == record.identity.sourceLocale && fields["targetLocale"] == record.identity.targetLocale)
            #expect(record.identity.inputHash == NativeTranslationRecoveryIdentity.hashInput(original))
            physicalBeforePOST = true; posts.append(data)
            if lostACK { throw NativeDataError.server(code: "PROVIDER_UNAVAILABLE") }
            return try JSONSerialization.data(withJSONObject: ["version": 1, "kind": "accepted", "turnId": record.identity.turnId, "reused": false])
        }
        #expect(path == "api/translate" && method == "GET" && body == nil)
        let rows = historyTurn.map { [phrase(turn: $0, original: historyOriginal ?? original, state: "translated", source: source)] } ?? []
        return try JSONSerialization.data(withJSONObject: ["version": 1, "kind": "translations", "phrases": rows])
    }
    func send(_ store: NativeVoiceTranslationStore) async {
        await store.refresh(request: request)
        await store.submitReviewed(text: original, sourceLocale: source, request: request)
    }
}

@MainActor struct NativeVoiceTranslationTests {
    @Test func lateAndDuplicateFinalsCannotReplaceReviewedTextOrCrossAccount() {
        let f = VoiceTranslationFixture(), store = f.boundStore()
        let first = UUID(), second = UUID()
        #expect(store.beginReview(recordingID: first, sourceLocale: "en"))
        store.interruptCapture()
        #expect(!store.acceptFinal(recordingID: first, scope: f.scope, text: "Late", seconds: 1, characters: 4))
        #expect(store.beginReview(recordingID: second, sourceLocale: "en"))
        #expect(store.acceptFinal(recordingID: second, scope: f.scope, text: f.original, seconds: 1.5, characters: f.original.utf16.count))
        #expect(!store.acceptFinal(recordingID: second, scope: f.scope, text: "Another", seconds: 1.5, characters: 7))
        #expect(store.finalTranscript == f.original && store.measuredSeconds == 1.5)
        #expect(store.reviewText(scope: f.scope) == f.original)
        store.bind(scope: .init(endpoint: f.scope.endpoint, subject: "33333333-3333-4333-8333-333333333333", mobileEpoch: 2, generation: 2), recovery: f.journal)
        #expect(store.finalTranscript == nil && store.measuredSeconds == nil)
        #expect(!store.acceptFinal(recordingID: second, scope: f.scope, text: f.original, seconds: 1.5, characters: f.original.utf16.count))
    }

    @Test func unknownACKReadbackFindsOriginalTurnWithoutSecondGenerate() async throws {
        let f = VoiceTranslationFixture(), store = f.boundStore()
        await f.send(store)
        try #require(f.posts.count == 1)
        let original = try #require(try f.journal.read(f.scope))
        #expect(f.physicalBeforePOST && store.turnID == original.identity.turnId)
        f.state = "translated"; f.includePhrase = true
        await store.submitReviewed(text: f.original, sourceLocale: f.source, request: f.request)
        #expect(f.posts.count == 1 && f.recoveryQueries == [original.identity] && store.translation.pending == nil)
        #expect(try f.journal.read(f.scope) == nil)
        #expect(store.readableResult(scope: f.scope)?.id == original.identity.turnId)
        #expect(store.readableResult(scope: f.scope)?.original.utf8.elementsEqual(f.original.utf8) == true)
    }

    @Test func pendingRetryKeepsExactBytesAndNeverUsesUnrelatedHistory() async throws {
        let f = VoiceTranslationFixture(), store = f.boundStore()
        f.historyTurn = "44444444-4444-4444-8444-444444444444"
        await f.send(store)
        try #require(f.posts.count == 1)
        let body = try #require(f.posts.first)
        let record = try #require(try f.journal.read(f.scope))
        await store.submitReviewed(text: "Changed", sourceLocale: f.source, request: f.request)
        #expect(f.posts.count == 1 && f.recoveryQueries.isEmpty)
        await store.submitReviewed(text: f.original, sourceLocale: f.source, request: f.request)
        #expect(f.posts.count == 1 && f.posts.first == body)
        #expect(try f.journal.read(f.scope)?.bytes == record.bytes)
        #expect(f.recoveryQueries == [record.identity] && store.result == nil && !store.canRecord)
        #expect(store.translation.phrases.contains(where: { $0.id == f.historyTurn }))
        store.resetDraft()
        #expect(store.hasSubmission && store.turnID == record.identity.turnId)
    }

    @Test func policyWithdrawalAndLateResponseHideScopedResult() async throws {
        let f = VoiceTranslationFixture(), store = f.boundStore()
        f.lostACK = false; f.state = "translated"; f.includePhrase = true
        await f.send(store)
        try #require(f.posts.count == 1)
        try #require(store.readableResult(scope: f.scope) != nil)
        f.accepted = false
        await store.consent(accept: false, request: f.request)
        #expect(store.result == nil && store.submittedText == nil && store.readableResult(scope: f.scope) == nil)
        await store.refresh { path, method, body in
            store.clear()
            return try f.request(path, method, body)
        }
        #expect(store.scope == nil && store.result == nil)
    }

    @Test func unconfiguredPersistenceRemainsClosedWithoutTrapping() async throws {
        let f = VoiceTranslationFixture(), store = NativeVoiceTranslationStore()
        store.bind(scope: f.scope)
        await f.send(store)
        #expect(f.posts.isEmpty && f.vault.items.isEmpty)
        #expect(store.translation.recoveryStatus == .storageFailed && store.result == nil)
    }

    @Test(arguments: [false, true]) func journalSaveOrPhysicalReadbackFailurePreventsPOST(afterWrite: Bool) async throws {
        let f = VoiceTranslationFixture(), store = f.boundStore()
        await store.refresh(request: f.request)
        f.vault.failWrite = !afterWrite; f.vault.failReadAfterWrite = afterWrite
        await store.submitReviewed(text: f.original, sourceLocale: f.source, request: f.request)
        #expect(f.posts.isEmpty && store.translation.recoveryStatus == .storageFailed && store.hasSubmission)
        store.resetDraft()
        #expect(store.hasSubmission && !store.canRecord)
        if afterWrite {
            f.vault.blockRead = false; f.vault.failReadAfterWrite = false
            let record = try #require(try f.journal.read(f.scope))
            await store.refresh(request: f.request)
            #expect(f.posts.isEmpty && f.recoveryQueries == [record.identity])
        }
    }

    @Test func recreatedVoiceConsumerRestoresOnlyVerifiedOriginalAndDirection() async throws {
        let f = VoiceTranslationFixture(), first = f.boundStore()
        f.original = "\u{4e0d}\u{8981}\u{82b1}\u{751f}\u{3002}"; f.source = "zh"
        await f.send(first)
        try #require(f.posts.count == 1)
        let original = try #require(try f.journal.read(f.scope))
        first.clear()
        #expect(try f.journal.read(f.scope)?.bytes == original.bytes)
        let reopened = f.boundStore()
        await reopened.refresh(request: f.request)
        #expect(reopened.hasSubmission && reopened.submittedText == nil && reopened.finalTranscript == nil)
        #expect(reopened.turnID == original.identity.turnId && reopened.sourceLocale == "zh" && !reopened.canRecord)
        reopened.resetDraft()
        await reopened.submitReviewed(text: "Replacement", sourceLocale: "en", request: f.request)
        #expect(try f.journal.read(f.scope)?.bytes == original.bytes)
        #expect(f.posts.count == 1 && reopened.submittedText == nil)
        f.state = "translated"; f.includePhrase = true
        await reopened.refresh(request: f.request)
        let result = try #require(reopened.readableResult(scope: f.scope))
        #expect(result.id == original.identity.turnId && result.original.utf8.elementsEqual(f.original.utf8))
        #expect(result.sourceLocale == "zh" && result.targetLocale == "en")
        #expect(reopened.submittedText == f.original && reopened.finalTranscript == nil && f.posts.count == 1)
        #expect(f.recoveryQueries.allSatisfy { $0 == original.identity })
    }

    @Test func cancellationUnknownPreservesPhysicalIdentityAndDoesNotUnlockNewPhrase() async throws {
        let f = VoiceTranslationFixture(), store = f.boundStore()
        await f.send(store)
        let original = try #require(try f.journal.read(f.scope))
        await store.cancelTranslation(request: f.request)
        #expect(f.cancels == 1 && f.posts.count == 1 && f.recoveryQueries == [original.identity])
        #expect(try f.journal.read(f.scope)?.bytes == original.bytes)
        store.resetDraft()
        #expect(store.turnID == original.identity.turnId && store.hasSubmission && !store.canRecord)
    }

    @Test func lateRecoveryAfterActorSwitchCannotPublishOriginal() async throws {
        let f = VoiceTranslationFixture(), store = f.boundStore()
        await f.send(store)
        let original = try #require(try f.journal.read(f.scope))
        let other = NativeDataScope(endpoint: f.scope.endpoint, subject: "33333333-3333-4333-8333-333333333333", mobileEpoch: 2, generation: 2)
        f.state = "translated"; f.includePhrase = true
        await store.refresh { path, method, body in
            let data = try f.request(path, method, body)
            if path.hasPrefix("api/translate/recovery/") { store.bind(scope: other, recovery: f.journal) }
            return data
        }
        #expect(store.scope == other && store.result == nil && store.submittedText == nil && store.turnID == nil)
        #expect(store.readableResult(scope: f.scope) == nil && store.readableResult(scope: other) == nil)
        #expect(try f.journal.read(f.scope)?.bytes == original.bytes)
    }

    @Test func liveActorChangeAndWithdrawalDuringGETCannotPublishOrComplete() async throws {
        let f = VoiceTranslationFixture(), store = f.boundStore()
        await f.send(store)
        let original = try #require(try f.journal.read(f.scope))
        var live: NativeDataScope? = f.scope
        f.state = "translated"; f.includePhrase = true
        await store.refresh(currentScope: { live }) { path, method, body in
            let data = try f.request(path, method, body)
            if path.hasPrefix("api/translate/recovery/") { live = nil }
            return data
        }
        #expect(store.result == nil && store.readableResult(scope: live) == nil)
        #expect(try f.journal.read(f.scope)?.bytes == original.bytes)
        live = f.scope
        await store.refresh(currentScope: { live }) { path, method, body in
            let data = try f.request(path, method, body)
            if path.hasPrefix("api/translate/recovery/") { f.accepted = false }
            return data
        }
        #expect(store.result == nil && store.readableResult(scope: f.scope) == nil)
        #expect(try f.journal.read(f.scope)?.bytes == original.bytes && f.posts.count == 1)
    }

    @Test func canonicallyEqualEditedReviewCannotChangeOriginalUTF8OrKey() async throws {
        let f = VoiceTranslationFixture(), store = f.boundStore()
        f.original = "e\u{301}"
        await f.send(store)
        let original = try #require(try f.journal.read(f.scope))
        await store.submitReviewed(text: "\u{e9}", sourceLocale: "en", request: f.request)
        #expect(f.posts.count == 1 && f.recoveryQueries.isEmpty)
        #expect(try f.journal.read(f.scope)?.bytes == original.bytes)
        #expect(original.identity.inputHash == NativeTranslationRecoveryIdentity.hashInput(f.original))
    }

    @Test func newReadWithoutRecoveryQualificationHidesPreviouslyVerifiedVoiceResult() async throws {
        let f = VoiceTranslationFixture(), store = f.boundStore()
        f.lostACK = false; f.state = "translated"; f.includePhrase = true
        await f.send(store)
        let previous = try #require(store.readableResult(scope: f.scope))
        f.historyTurn = previous.id
        await store.refresh(request: f.request)
        #expect(store.translation.phrases.contains(where: { $0.id == previous.id }))
        #expect(store.translation.recoveredTurnID == nil && store.readableResult(scope: f.scope) == nil && store.result == nil)
        #expect(f.posts.count == 1)
    }

    @Test(arguments: ["withdraw", "notice", "permission", "unrelated-history"])
    func recreatedRecoveredReviewExpiresWithCurrentQualification(reason: String) async throws {
        let f = VoiceTranslationFixture(), first = f.boundStore()
        await f.send(first)
        let original = try #require(try f.journal.read(f.scope))
        first.clear()
        let reopened = f.boundStore()
        f.state = "translated"; f.includePhrase = true
        await reopened.refresh(request: f.request)
        try #require(reopened.reviewText(scope: f.scope) == f.original)
        try #require(reopened.submittedText == f.original)
        #expect(reopened.finalTranscript == nil && reopened.turnID == original.identity.turnId)
        let storage = f.vault.items, removals = f.vault.removes
        if reason == "withdraw" { f.accepted = false }
        if reason == "notice" { f.noticeHash = String(repeating: "b", count: 64) }
        if reason == "permission" { f.denyRead = true }
        if reason == "unrelated-history" { f.historyTurn = "44444444-4444-4444-8444-444444444444" }
        await reopened.refresh { path, method, body in
            // This is the same read port as the TextField Binding, during the read,
            // before a View onChange could consume a notification.
            #expect(reopened.reviewText(scope: f.scope).isEmpty && reopened.submittedText == nil)
            return try f.request(path, method, body)
        }
        #expect(reopened.reviewText(scope: f.scope).isEmpty && reopened.submittedText == nil && reopened.result == nil)
        #expect(reopened.turnID == original.identity.turnId && reopened.hasSubmission)
        #expect(f.vault.items == storage && f.vault.removes == removals && f.posts.count == 1)
        if reason == "unrelated-history" { #expect(reopened.translation.phrases.contains(where: { $0.id == f.historyTurn })) }
    }

    @Test func recoveredReviewReadPortRejectsActorSceneAndRootInvalidationImmediately() async throws {
        let f = VoiceTranslationFixture(), first = f.boundStore()
        await f.send(first)
        first.clear()
        let reopened = f.boundStore()
        f.state = "translated"; f.includePhrase = true
        await reopened.refresh(request: f.request)
        try #require(reopened.reviewText(scope: f.scope) == f.original)
        let other = NativeDataScope(endpoint: f.scope.endpoint, subject: "33333333-3333-4333-8333-333333333333", mobileEpoch: 2, generation: 2)
        #expect(reopened.reviewText(scope: nil).isEmpty && reopened.reviewText(scope: other).isEmpty)
        reopened.updateReview(f.original, scope: other) // Cannot promote a protected body to a local draft.
        #expect(reopened.reviewText(scope: other).isEmpty)
        reopened.translation.clear() // No Voice/View notification has been consumed yet.
        #expect(reopened.submittedText == f.original)
        #expect(reopened.reviewText(scope: f.scope).isEmpty)
        await reopened.refresh(request: f.request)
        #expect(reopened.submittedText == nil && reopened.reviewText(scope: f.scope).isEmpty)
        #expect(f.posts.count == 1)
    }

    @Test func failedRefreshDoesNotEraseUnsubmittedLocalReview() async throws {
        let f = VoiceTranslationFixture(), store = f.boundStore()
        await store.refresh(request: f.request)
        let draft = "Local e\u{301}\nKeep exact bytes."
        store.updateReview(draft, scope: f.scope)
        f.denyRead = true
        await store.refresh(request: f.request)
        #expect(store.reviewText(scope: f.scope).utf8.elementsEqual(draft.utf8))
        #expect(store.reviewText(scope: nil).isEmpty && store.submittedText == nil)
        #expect(f.posts.isEmpty && f.vault.items.isEmpty)
    }

    @Test func rejectedRecoveryReadKeepsUnknownPhysicalIdentityWithoutReviewBody() async throws {
        let f = VoiceTranslationFixture(), first = f.boundStore()
        await f.send(first)
        let original = try #require(try f.journal.read(f.scope))
        first.clear()
        let reopened = f.boundStore()
        await reopened.refresh(request: f.request)
        f.denyRead = true
        await reopened.refresh(request: f.request)
        #expect(reopened.reviewText(scope: f.scope).isEmpty && reopened.submittedText == nil)
        #expect(reopened.hasSubmission && reopened.turnID == original.identity.turnId)
        #expect(try f.journal.read(f.scope)?.bytes == original.bytes)
        #expect(f.posts.count == 1 && f.vault.removes == 0)
    }

    @Test func restoringOriginalNeverOverwritesAnUnsubmittedLocalDraft() async throws {
        let f = VoiceTranslationFixture(), first = f.boundStore()
        await f.send(first)
        first.clear()
        let reopened = f.boundStore()
        let localDraft = "My own unsent e\u{301} draft."
        reopened.updateReview(localDraft, scope: f.scope) // Before the retained reference has been loaded.
        f.state = "translated"; f.includePhrase = true
        await reopened.refresh(request: f.request)
        try #require(reopened.reviewText(scope: f.scope) == f.original)
        f.noticeHash = String(repeating: "b", count: 64)
        await reopened.refresh(request: f.request)
        #expect(reopened.submittedText == nil && reopened.result == nil)
        #expect(reopened.reviewText(scope: f.scope).utf8.elementsEqual(localDraft.utf8))
        #expect(reopened.reviewText(scope: nil).isEmpty && f.posts.count == 1)
    }
}

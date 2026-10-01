import Foundation
import Testing
@testable import VisePanda

@MainActor struct NativeTranslationTests {
    private let scope = NativeDataScope(endpoint: "http://127.0.0.1", subject: "owner-a", mobileEpoch: 1, generation: 1)
    private let id = "11111111-1111-4111-8111-111111111111"
    private func policy(_ accepted: Bool = true) -> Data {
        Data("""
        {"version":1,"kind":"policy","policy":{"id":"\(id)","provider":"qwen","recipient":"Synthetic test recipient","sourceRegion":"test","processingRegion":"test","storageRegion":"test","termsVersion":"test","noticeVersion":"test","noticeHash":"\(String(repeating: "a", count: 64))","noticeZh":"测试","noticeEn":"Test notice","retention":"retain_after_hide_v1","expiresAt":"2099-01-01T00:00:00Z","consentState":"\(accepted ? "accepted" : "not_accepted")"}}
        """.utf8)
    }
    private func history() -> Data { Data("{\"version\":1,\"kind\":\"translations\",\"phrases\":[]}".utf8) }

    @Test func noConsentNeverSubmits() async {
        let store = NativeTranslationStore()
        var posts = 0
        let request: NativeTranslationStore.Request = { _, method, _ in
            if method == "POST" { posts += 1 }
            return policy(false)
        }
        await store.load(scope: scope, request: request)
        await store.submit(text: "Do not add peanuts.", sourceLocale: "en", request: request)
        #expect(posts == 0)
        #expect(store.pending == nil)
    }

    @Test func ambiguousSendRetriesSameIdentityAndRejectsEditedInput() async throws {
        let store = NativeTranslationStore()
        await store.load(scope: scope) { path, _, _ in path.hasSuffix("policy") ? policy() : history() }
        var bodies: [Data] = []
        let failing: NativeTranslationStore.Request = { _, _, body in
            if let body { bodies.append(body) }
            throw NativeDataError.server(code: "PROVIDER_UNAVAILABLE")
        }
        await store.submit(text: "No peanuts. CNY 50.", sourceLocale: "en", request: failing)
        let first = try #require(store.pending)
        await store.submit(text: "Different address", sourceLocale: "en", request: failing)
        #expect(bodies.count == 1)
        await store.submit(text: first.text, sourceLocale: "en", request: failing)
        #expect(bodies.count == 2)
        let one = try #require(JSONSerialization.jsonObject(with: bodies[0]) as? [String: String])
        let two = try #require(JSONSerialization.jsonObject(with: bodies[1]) as? [String: String])
        #expect(one == two)
        #expect(one["text"] == first.text)
        #expect(store.pending == first)
    }

    @Test func scopeChangeDropsLateResponseAndPendingText() async {
        let store = NativeTranslationStore()
        await store.load(scope: scope) { _, _, _ in
            store.clear()
            return policy()
        }
        #expect(store.policy == nil)
        #expect(store.scope == nil)
        #expect(store.phrases.isEmpty)
    }

    @Test func withdrawalHidesCachedPhraseEvenIfNetworkFails() async {
        let store = NativeTranslationStore()
        await store.load(scope: scope) { path, _, _ in path.hasSuffix("policy") ? policy() : history() }
        await store.submit(text: "No peanuts", sourceLocale: "en") { _, _, _ in throw NativeDataError.invalidResponse }
        #expect(store.pending != nil)
        await store.consent(accept: false) { _, _, _ in throw NativeDataError.invalidResponse }
        #expect(store.pending == nil)
        #expect(store.policy == nil)
        #expect(store.phrases.isEmpty)
    }

    @Test func cardRequiresBothTranslationsAndPreservesOriginal() throws {
        let data = Data("""
        {"turnId":"\(id)","sourceLocale":"en","targetLocale":"zh","original":"Do not add peanuts. CNY 50.","state":"translated","translation":"不要加花生。50 元。","backTranslation":"Do not add peanuts. CNY 50."}
        """.utf8)
        let phrase = try JSONDecoder().decode(NativeTranslationPhrase.self, from: data)
        #expect(phrase.valid)
        #expect(phrase.original == "Do not add peanuts. CNY 50.")
        let bad = NativeTranslationPhrase(turnId: id, sourceLocale: "en", targetLocale: "zh", original: "Keep me", state: "translated", translation: "保留", backTranslation: nil)
        #expect(!bad.valid)
    }
    private func savedPhrase(_ number: Int = 1) -> NativeTranslationPhrase {
        .init(turnId: String(format: "22222222-2222-4222-8222-%012d", number), sourceLocale: "en", targetLocale: "zh",
              original: "CNY 50.", state: "translated", translation: "50元。", backTranslation: "CNY 50.")
    }
    private func savedPage(_ phrases: [NativeTranslationPhrase], cursor: String? = nil) throws -> Data {
        let rows = phrases.map { ["turnId": $0.turnId, "sourceLocale": $0.sourceLocale, "targetLocale": $0.targetLocale,
                                  "original": $0.original, "state": $0.state, "translation": $0.translation!, "backTranslation": $0.backTranslation!] }
        return try JSONSerialization.data(withJSONObject: ["version": 2, "kind": "translations", "policyId": id,
            "phrases": rows, "nextCursor": cursor as Any? ?? NSNull()])
    }
    private func savedExact(_ phrase: NativeTranslationPhrase) throws -> Data {
        let row = ["turnId": phrase.turnId, "sourceLocale": phrase.sourceLocale, "targetLocale": phrase.targetLocale,
                   "original": phrase.original, "state": phrase.state, "translation": phrase.translation!, "backTranslation": phrase.backTranslation!]
        return try JSONSerialization.data(withJSONObject: ["version": 2, "kind": "translation", "policyId": id, "phrase": row])
    }

    @Test func savedHistoryPagesReplaceRowsAndOlderTranslationUsesFreshExactGET() async throws {
        let store = NativeSavedTranslationHistoryStore(uptime: { 0 }), detail = NativeSavedTranslationHistoryStore(uptime: { 0 })
        let rows = (1...20).map(savedPhrase), old = savedPhrase(21)
        let policyRequest: NativeTranslationStore.Request = { path, method, body in
            #expect(path == "api/translate/policy" && method == "GET" && body == nil); return policy()
        }
        await store.load(scope: scope, currentScope: { scope }, policyRequest: policyRequest) { cursor, turn in
            #expect(cursor == nil && turn == nil); return try savedPage(rows, cursor: rows.last?.id)
        }
        #expect(store.phrases.count == 20)
        await store.load(scope: scope, cursor: store.nextCursor, currentScope: { scope }, policyRequest: policyRequest) { cursor, turn in
            #expect(cursor == rows.last?.id && turn == nil); return try savedPage([old])
        }
        #expect(store.phrases == [old]); #expect(store.nextCursor == nil)
        let reference = try #require(store.reference(old, scope: scope))
        await detail.load(scope: scope, exact: reference, currentScope: { scope }, policyRequest: policyRequest) { cursor, turn in
            #expect(cursor == nil && turn == old.id); return try savedExact(old)
        }
        #expect(detail.opened == old)
    }

    @Test(arguments: [19.0, 20.0, 21.0]) func savedHistoryUsesMonotonicLifetimeIncludingRequestTime(delay: Double) async throws {
        var time = 0.0
        let store = NativeSavedTranslationHistoryStore(uptime: { time })
        await store.load(scope: scope, currentScope: { scope }, policyRequest: { _, _, _ in policy() }) { _, _ in
            time = delay; return try savedPage([savedPhrase()])
        }
        #expect(store.isCurrent(scope) == (delay < 20))
        time = 20
        #expect(!store.isCurrent(scope)); #expect(store.reference(savedPhrase(), scope: scope) == nil)
    }

    @Test func savedHistoryDropsLateScopeChangeAndRevokedFinalPolicy() async throws {
        let store = NativeSavedTranslationHistoryStore(uptime: { 0 })
        var current: NativeDataScope? = scope
        await store.load(scope: scope, currentScope: { current }, policyRequest: { _, _, _ in policy() }) { _, _ in
            current = nil; return try savedPage([savedPhrase()])
        }
        #expect(store.phrases.isEmpty && store.state == "unavailable")
        var reads = 0
        await store.load(scope: scope, currentScope: { scope }, policyRequest: { _, _, _ in reads += 1; return policy(reads == 1) }) { _, _ in try savedPage([savedPhrase()]) }
        #expect(store.phrases.isEmpty && store.state == "unavailable")
    }

    @Test func savedHistoryCannotOpenChangedExactContentOrPublishMalformedCursor() async throws {
        let store = NativeSavedTranslationHistoryStore(uptime: { 0 }), detail = NativeSavedTranslationHistoryStore(uptime: { 0 })
        let phrase = savedPhrase()
        await store.load(scope: scope, currentScope: { scope }, policyRequest: { _, _, _ in policy() }) { _, _ in try savedPage([phrase]) }
        let reference = try #require(store.reference(phrase, scope: scope))
        await detail.load(scope: scope, exact: reference, currentScope: { scope }, policyRequest: { _, _, _ in policy() }) { _, _ in try savedExact(savedPhrase(99)) }
        #expect(detail.opened == nil && detail.state == "unavailable")
        await store.load(scope: scope, currentScope: { scope }, policyRequest: { _, _, _ in policy() }) { _, _ in try savedPage([phrase], cursor: savedPhrase(99).id) }
        #expect(store.phrases.isEmpty && store.nextCursor == nil)
    }

    @Test func savedHistoryClearDuringReadCannotPublishLateContent() async throws {
        let store = NativeSavedTranslationHistoryStore(uptime: { 0 })
        await store.load(scope: scope, currentScope: { scope }, policyRequest: { _, _, _ in policy() }) { _, _ in
            store.clear(); return try savedPage([savedPhrase()])
        }
        #expect(store.state == "idle" && store.phrases.isEmpty && store.scope == nil)
    }

    @Test func savedHistoryAcceptsTwentyMaximumCJKPhrasesAndEscapedWire() async throws {
        let rows = (1...20).map { number in
            NativeTranslationPhrase(turnId: String(format: "33333333-3333-4333-8333-%012d", number), sourceLocale: "zh", targetLocale: "en",
                original: String(repeating: "原", count: 600), state: "translated",
                translation: String(repeating: "译", count: 2400), backTranslation: String(repeating: "回", count: 2400))
        }
        let literal = try savedPage(rows)
        #expect(literal.count > 324_000)
        let escapedString = try #require(String(data: literal, encoding: .utf8))
            .replacingOccurrences(of: "原", with: "\\u539f")
            .replacingOccurrences(of: "译", with: "\\u8bd1")
            .replacingOccurrences(of: "回", with: "\\u56de")
        let escaped = Data(escapedString.utf8)
        #expect(escaped.count > literal.count)
        for data in [literal, escaped] {
            let store = NativeSavedTranslationHistoryStore(uptime: { 0 })
            await store.load(scope: scope, currentScope: { scope }, policyRequest: { _, _, _ in policy() }) { _, _ in data }
            #expect(store.state == "ready")
            #expect(store.phrases == rows)
        }
        let limit = NativeTranslationHistoryWire.maximumResponseBytes
        #expect(escaped.count < limit)
        var oversized = literal
        oversized.append(Data(repeating: 0x20, count: limit + 1 - oversized.count))
        let rejected = NativeSavedTranslationHistoryStore(uptime: { 0 })
        await rejected.load(scope: scope, currentScope: { scope }, policyRequest: { _, _, _ in policy() }) { _, _ in oversized }
        #expect(rejected.phrases.isEmpty && rejected.state == "unavailable")
    }

}

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
}

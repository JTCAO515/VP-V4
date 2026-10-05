import Foundation
import Testing
@testable import VisePanda

@MainActor struct NativeVoiceTranslationTests {
    private let scope = NativeDataScope(endpoint: "http://127.0.0.1", subject: "test-owner", mobileEpoch: 1, generation: 1)
    private let policyID = "11111111-1111-4111-8111-111111111111"
    private func policy(accepted: Bool = true) -> Data {
        Data("""
        {"version":1,"kind":"policy","policy":{"id":"\(policyID)","provider":"qwen","recipient":"Synthetic test recipient","sourceRegion":"test","processingRegion":"test","storageRegion":"test","termsVersion":"test","noticeVersion":"test","noticeHash":"\(String(repeating: "a", count: 64))","noticeZh":"测试","noticeEn":"Test notice","retention":"retain_after_hide_v1","expiresAt":"2099-01-01T00:00:00Z","consentState":"\(accepted ? "accepted" : "not_accepted")"}}
        """.utf8)
    }
    private func history(turn: String? = nil, original: String = "No peanuts.") throws -> Data {
        let phrases: [[String: Any]] = turn.map { [["turnId": $0, "sourceLocale": "en", "targetLocale": "zh", "original": original,
            "state": "translated", "translation": "不要花生。", "backTranslation": "No peanuts."]] } ?? []
        return try JSONSerialization.data(withJSONObject: ["version": 1, "kind": "translations", "phrases": phrases])
    }

    @Test func lateAndDuplicateFinalsCannotReplaceReviewedTextOrCrossAccount() {
        let store = NativeVoiceTranslationStore()
        store.bind(scope: scope)
        let first = UUID(), second = UUID()
        #expect(store.beginReview(recordingID: first, sourceLocale: "en"))
        store.interruptCapture()
        #expect(!store.acceptFinal(recordingID: first, scope: scope, text: "Late", seconds: 1, characters: 4))
        #expect(store.beginReview(recordingID: second, sourceLocale: "en"))
        #expect(store.acceptFinal(recordingID: second, scope: scope, text: "No peanuts.", seconds: 1.5, characters: 11))
        #expect(!store.acceptFinal(recordingID: second, scope: scope, text: "Another", seconds: 1.5, characters: 7))
        #expect(store.finalTranscript == "No peanuts." && store.measuredSeconds == 1.5)
        store.bind(scope: .init(endpoint: scope.endpoint, subject: "other-owner", mobileEpoch: 2, generation: 2))
        #expect(store.finalTranscript == nil && store.measuredSeconds == nil)
        #expect(!store.acceptFinal(recordingID: second, scope: scope, text: "No peanuts.", seconds: 1.5, characters: 11))
    }

    @Test func unknownACKReadbackFindsOriginalTurnWithoutSecondGenerate() async throws {
        let store = NativeVoiceTranslationStore()
        store.bind(scope: scope)
        await store.refresh { path, _, _ in path.hasSuffix("policy") ? policy() : try history() }
        var turn: String?, posts = 0
        await store.submitReviewed(text: "No peanuts.", sourceLocale: "en") { _, _, body in
            posts += 1
            turn = (try JSONSerialization.jsonObject(with: #require(body)) as? [String: Any])?["turnId"] as? String
            throw NativeDataError.server(code: "PROVIDER_UNAVAILABLE")
        }
        let original = try #require(turn)
        #expect(store.turnID == original && store.translation.pending?.turnId == original)
        await store.submitReviewed(text: "No peanuts.", sourceLocale: "en") { path, method, _ in
            #expect(method == "GET")
            return path.hasSuffix("policy") ? policy() : try history(turn: original)
        }
        #expect(posts == 1 && store.translation.pending == nil)
        #expect(store.readableResult(scope: scope)?.id == original)
        #expect(store.readableResult(scope: scope)?.translation == "不要花生。")
    }

    @Test func pendingRetryKeepsExactBytesAndNeverUsesUnrelatedHistory() async throws {
        let store = NativeVoiceTranslationStore()
        store.bind(scope: scope)
        await store.refresh { path, _, _ in path.hasSuffix("policy") ? policy() : try history() }
        var bodies: [Data] = []
        let request: NativeTranslationStore.Request = { path, method, body in
            if method == "POST" {
                bodies.append(try #require(body))
                throw NativeDataError.server(code: "PROVIDER_UNAVAILABLE")
            }
            return path.hasSuffix("policy") ? policy() : try history(turn: "22222222-2222-4222-8222-222222222222")
        }
        await store.submitReviewed(text: "No peanuts.", sourceLocale: "en", request: request)
        await store.submitReviewed(text: "Changed", sourceLocale: "en", request: request)
        #expect(bodies.count == 1)
        await store.submitReviewed(text: "No peanuts.", sourceLocale: "en", request: request)
        #expect(bodies.count == 2 && bodies[0] == bodies[1])
        #expect(store.result == nil && !store.canRecord)
    }

    @Test func policyWithdrawalAndLateResponseHideScopedResult() async throws {
        let store = NativeVoiceTranslationStore()
        store.bind(scope: scope)
        await store.refresh { path, _, _ in path.hasSuffix("policy") ? policy() : try history() }
        var turn: String?
        await store.submitReviewed(text: "No peanuts.", sourceLocale: "en") { path, method, body in
            if method == "POST" {
                turn = (try JSONSerialization.jsonObject(with: #require(body)) as? [String: Any])?["turnId"] as? String
                return try JSONSerialization.data(withJSONObject: ["version": 1, "kind": "accepted", "turnId": #require(turn), "reused": false])
            }
            return path.hasSuffix("policy") ? policy() : try history(turn: turn)
        }
        #expect(store.readableResult(scope: scope) != nil)
        await store.consent(accept: false) { path, method, _ in method == "DELETE" ? Data() : path.hasSuffix("policy") ? policy(accepted: false) : try history(turn: turn) }
        #expect(store.result == nil && store.submittedText == nil && store.readableResult(scope: scope) == nil)
        store.bind(scope: scope)
        await store.refresh { path, _, _ in
            store.clear()
            return path.hasSuffix("policy") ? policy() : try history(turn: turn)
        }
        #expect(store.scope == nil && store.result == nil)
    }
}

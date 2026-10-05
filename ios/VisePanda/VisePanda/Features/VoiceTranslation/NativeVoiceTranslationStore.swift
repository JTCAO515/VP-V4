import Foundation
import Observation

/// Audio never enters the HTTP lane. Only explicitly reviewed final text does.
@MainActor @Observable
final class NativeVoiceTranslationStore {
    let translation = NativeTranslationStore()
    private(set) var scope: NativeDataScope?
    private(set) var finalTranscript: String?
    private(set) var recordingID: UUID?
    private(set) var measuredSeconds: Double?
    private(set) var measuredASRCharacters: Int?
    private(set) var submittedText: String?
    private(set) var turnID: String?
    private(set) var result: NativeTranslationPhrase?
    private(set) var sourceLocale = "en"
    private var generation = UUID()
    private var resultPolicyID: String?
    private var resultNoticeHash: String?

    var hasSubmission: Bool { turnID != nil }
    var canRecord: Bool { scope != nil && !translation.busy && !hasSubmission }

    func bind(scope next: NativeDataScope?) {
        guard scope != next else { return }
        clear(); scope = next
    }

    func clear() {
        generation = UUID(); scope = nil; translation.clear()
        finalTranscript = nil; recordingID = nil; measuredSeconds = nil; measuredASRCharacters = nil
        submittedText = nil; turnID = nil; result = nil; resultPolicyID = nil; resultNoticeHash = nil
    }

    func beginReview(recordingID: UUID, sourceLocale: String) -> Bool {
        guard canRecord, ["en", "zh"].contains(sourceLocale) else { return false }
        self.recordingID = recordingID; self.sourceLocale = sourceLocale
        finalTranscript = nil; measuredSeconds = nil; measuredASRCharacters = nil; result = nil
        return true
    }

    @discardableResult
    func acceptFinal(recordingID: UUID, scope: NativeDataScope, text: String, seconds: Double, characters: Int) -> Bool {
        guard self.scope == scope, self.recordingID == recordingID, !hasSubmission,
              seconds.isFinite, seconds > 0, characters == text.utf16.count,
              !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, text.utf16.count <= 600,
              finalTranscript == nil else { return false }
        finalTranscript = text; measuredSeconds = seconds; measuredASRCharacters = characters
        return true
    }

    /// Interrupting audio fences late ASR while keeping a reviewed original readable.
    func interruptCapture() { recordingID = nil }

    func resetDraft() {
        guard !translation.busy, translation.pending == nil else { return }
        generation = UUID(); recordingID = nil; finalTranscript = nil; measuredSeconds = nil; measuredASRCharacters = nil
        submittedText = nil; turnID = nil; result = nil; resultPolicyID = nil; resultNoticeHash = nil
    }

    func refresh(request: NativeTranslationStore.Request) async {
        guard let scope else { return }
        let own = generation
        await translation.load(scope: scope, request: request)
        guard own == generation else { return }
        synchronizeResult()
    }

    func submitReviewed(text: String, sourceLocale: String, request: NativeTranslationStore.Request) async {
        guard scope != nil, !translation.busy, translation.policy?.consentState == .accepted,
              ["en", "zh"].contains(sourceLocale), text.utf16.count <= 600,
              !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        let own = generation
        // Unknown ACK resolves from the original server-read turn before any retry.
        if hasSubmission {
            guard submittedText?.utf8.elementsEqual(text.utf8) == true, self.sourceLocale == sourceLocale else { return }
            await refresh(request: request)
            guard own == generation, result == nil, translation.pending != nil, translation.errorCode == nil else { return }
        }
        await translation.submit(text: text, sourceLocale: sourceLocale) { [self] path, method, body in
            guard generation == own, !Task.isCancelled else { throw CancellationError() }
            if path == "api/translate", method == "POST", let body {
                let fields = try JSONSerialization.jsonObject(with: body) as? [String: Any]
                guard let id = fields?["turnId"] as? String, UUID(uuidString: id) != nil,
                      let original = fields?["text"] as? String, original.utf8.elementsEqual(text.utf8),
                      turnID == nil || turnID == id else { throw NativeDataError.invalidResponse }
                turnID = id; submittedText = original; self.sourceLocale = sourceLocale
                resultPolicyID = translation.policy?.id; resultNoticeHash = translation.policy?.noticeHash
            }
            return try await request(path, method, body)
        }
        guard own == generation else { return }
        synchronizeResult()
    }

    func consent(accept: Bool, request: NativeTranslationStore.Request) async {
        if !accept {
            generation = UUID(); recordingID = nil; finalTranscript = nil
            measuredSeconds = nil; measuredASRCharacters = nil; submittedText = nil; turnID = nil; result = nil
            resultPolicyID = nil; resultNoticeHash = nil
        }
        await translation.consent(accept: accept, request: request)
        synchronizeResult()
    }

    func cancelTranslation(request: NativeTranslationStore.Request) async {
        await translation.cancel(request: request)
        synchronizeResult()
    }

    func readableResult(scope current: NativeDataScope?) -> NativeTranslationPhrase? {
        guard current != nil, scope == current, translation.scope == current,
              translation.policy?.consentState == .accepted,
              translation.policy?.id == resultPolicyID, translation.policy?.noticeHash == resultNoticeHash else { return nil }
        return result
    }

    private func synchronizeResult() {
        result = nil
        guard let turnID, let submittedText, translation.scope == scope,
              translation.policy?.consentState == .accepted,
              translation.policy?.id == resultPolicyID, translation.policy?.noticeHash == resultNoticeHash,
              let phrase = translation.phrases.first(where: { $0.id == turnID }), phrase.valid,
              phrase.original.utf8.elementsEqual(submittedText.utf8), phrase.sourceLocale == sourceLocale,
              phrase.state == "translated" else { return }
        result = phrase
    }
}

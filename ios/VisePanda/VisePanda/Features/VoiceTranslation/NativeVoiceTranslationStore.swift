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
    private var localReview = ""
    private var reviewIsRecovered = false

    private var hasUnresolvedSubmission: Bool {
        translation.recoveryRecord != nil || (translation.scope == scope && translation.hasUnresolvedRecovery)
    }
    var hasSubmission: Bool { turnID != nil || hasUnresolvedSubmission }
    var canRecord: Bool { scope != nil && !translation.busy && !hasSubmission }

    func bind(scope next: NativeDataScope?, recovery: (any NativeTranslationRecoveryPersistence)? = nil) {
        if scope != next { clear(); scope = next }
        translation.configureRecovery(recovery)
    }

    func clear() {
        generation = UUID(); scope = nil; translation.clear()
        finalTranscript = nil; recordingID = nil; measuredSeconds = nil; measuredASRCharacters = nil
        submittedText = nil; turnID = nil; result = nil; resultPolicyID = nil; resultNoticeHash = nil
        localReview = ""; reviewIsRecovered = false
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
        localReview = text; reviewIsRecovered = false
        return true
    }

    /// Interrupting audio fences late ASR while keeping a reviewed original readable.
    func interruptCapture() { recordingID = nil }

    func resetDraft() {
        guard !translation.busy, !hasUnresolvedSubmission else { return }
        generation = UUID(); recordingID = nil; finalTranscript = nil; measuredSeconds = nil; measuredASRCharacters = nil
        submittedText = nil; turnID = nil; result = nil; resultPolicyID = nil; resultNoticeHash = nil
        localReview = ""; reviewIsRecovered = false
    }

    /// The View's actual edit-field read port. Recovered bodies never become local drafts.
    func reviewText(scope current: NativeDataScope?) -> String {
        guard current != nil, scope == current else { return "" }
        if reviewIsRecovered { return readableResult(scope: current)?.original ?? "" }
        return localReview
    }

    func updateReview(_ text: String, scope current: NativeDataScope?) {
        guard current != nil, scope == current, !hasSubmission, !translation.busy else { return }
        localReview = text; reviewIsRecovered = false
    }

    func refresh(currentScope: NativeTranslationStore.CurrentScope? = nil, request: NativeTranslationStore.Request) async {
        guard let scope else { return }
        let own = generation
        result = nil
        if reviewIsRecovered { submittedText = nil }
        await translation.load(scope: scope, currentScope: { [self] in
            generation == own && self.scope == scope && (currentScope == nil || currentScope?() == scope) ? scope : nil
        }, request: request)
        guard own == generation else { return }
        synchronizeResult()
    }

    func submitReviewed(text: String, sourceLocale: String, currentScope: NativeTranslationStore.CurrentScope? = nil,
                        request: NativeTranslationStore.Request) async {
        guard let scope, !translation.busy, translation.policy?.consentState == .accepted,
              ["en", "zh"].contains(sourceLocale), text.utf16.count <= 600,
              !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        let own = generation
        // Unknown ACK and recreated consumers only reconcile the retained original.
        if hasSubmission {
            if let submittedText {
                guard submittedText.utf8.elementsEqual(text.utf8), self.sourceLocale == sourceLocale else { return }
            }
            await refresh(currentScope: currentScope, request: request)
            return
        }
        await translation.submit(text: text, sourceLocale: sourceLocale, currentScope: { [self] in
            generation == own && self.scope == scope && (currentScope == nil || currentScope?() == scope) ? scope : nil
        }) { [self] path, method, body in
            guard generation == own, self.scope == scope, !Task.isCancelled,
                  currentScope == nil || currentScope?() == scope else { throw CancellationError() }
            if path == "api/translate", method == "POST", let body {
                let fields = try JSONSerialization.jsonObject(with: body) as? [String: Any]
                guard let id = fields?["turnId"] as? String, UUID(uuidString: id) != nil,
                      let original = fields?["text"] as? String, original.utf8.elementsEqual(text.utf8),
                      turnID == nil || turnID == id else { throw NativeDataError.invalidResponse }
                turnID = id; submittedText = original; self.sourceLocale = sourceLocale
                localReview = original; reviewIsRecovered = false
                resultPolicyID = translation.policy?.id; resultNoticeHash = translation.policy?.noticeHash
            }
            return try await request(path, method, body)
        }
        guard own == generation else { return }
        synchronizeResult()
    }

    func consent(accept: Bool, currentScope: NativeTranslationStore.CurrentScope? = nil, request: NativeTranslationStore.Request) async {
        if !accept {
            generation = UUID(); recordingID = nil; finalTranscript = nil
            measuredSeconds = nil; measuredASRCharacters = nil; submittedText = nil; turnID = nil; result = nil
            resultPolicyID = nil; resultNoticeHash = nil
            localReview = ""; reviewIsRecovered = false
        }
        await translation.consent(accept: accept, currentScope: currentScope, request: request)
        synchronizeResult()
    }

    func cancelTranslation(currentScope: NativeTranslationStore.CurrentScope? = nil, request: NativeTranslationStore.Request) async {
        await translation.cancel(currentScope: currentScope, request: request)
        synchronizeResult()
    }

    func readableResult(scope current: NativeDataScope?) -> NativeTranslationPhrase? {
        guard current != nil, scope == current, translation.scope == current,
              translation.policy?.consentState == .accepted,
              translation.policy?.id == resultPolicyID, translation.policy?.noticeHash == resultNoticeHash,
              !translation.busy, let result, translation.recoveredTurnID == result.id,
              translation.phrases.contains(result) else { return nil }
        return result
    }

    private func synchronizeResult() {
        result = nil
        defer { if reviewIsRecovered && result == nil { submittedText = nil } }
        guard scope != nil, translation.scope == scope else { return }
        // Metadata can lock/reset-fence a recreated consumer but can never supply a body.
        if let original = translation.recoveryRecord {
            guard turnID == nil || turnID == original.identity.turnId else { return }
            turnID = original.identity.turnId; sourceLocale = original.identity.sourceLocale
            resultPolicyID = original.identity.policyId; resultNoticeHash = original.identity.noticeHash
        }
        guard let recoveredID = translation.recoveredTurnID,
              translation.policy?.consentState == .accepted,
              translation.policy?.valid == true,
              let phrase = translation.phrases.first(where: { $0.id == recoveredID }), phrase.valid,
              phrase.state == "translated" else { return }
        if let turnID {
            guard turnID == phrase.id, translation.policy?.id == resultPolicyID,
                  translation.policy?.noticeHash == resultNoticeHash else { return }
        }
        if let submittedText {
            guard phrase.original.utf8.elementsEqual(submittedText.utf8), phrase.sourceLocale == sourceLocale else { return }
        }
        if submittedText == nil { reviewIsRecovered = true; localReview = "" }
        turnID = phrase.id; submittedText = phrase.original; sourceLocale = phrase.sourceLocale
        resultPolicyID = translation.policy?.id; resultNoticeHash = translation.policy?.noticeHash
        result = phrase
    }
}

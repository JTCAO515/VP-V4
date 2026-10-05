import SwiftUI

struct NativeVoiceTranslationView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var scenePhase
    @State private var store = NativeVoiceTranslationStore()
    @State private var source = "en"
    @State private var review = ""
    @State private var action: Task<Void, Never>?
    private var session: NativeSession { settings.nativeSession }
    private var activeScope: NativeDataScope? { session.dataScope }
    private func text(_ en: String, _ zh: String) -> String { settings.selectedLocale == .zh ? zh : en }
    private func request(_ path: String, _ method: String, _ body: Data?) async throws -> Data {
        try await session.translateRequest(path: path, method: method, body: body)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text(text("Speak, review, translate", "说话、核对、翻译")).font(.largeTitle.bold())
                Text(text("Hold to record. Release to finish. Review the final transcript before sending it for translation.", "按住录音，松开结束。核对最终字幕后，再发送文字翻译。"))
                if activeScope == nil { Text(text("Sign in in Profile to use translation.", "请在「我的」登录后翻译。")) }
                policyView
                Picker(text("Translate", "翻译方向"), selection: $source) {
                    Text("English → 中文").tag("en")
                    Text("中文 → English").tag("zh")
                }.pickerStyle(.segmented).disabled(store.hasSubmission || store.translation.busy)
                NativeVoiceCapturePanel(store: store, source: source)
                if let final = store.finalTranscript {
                    Text(text("Final transcript", "最终字幕")).font(.headline)
                    Text(final).textSelection(.enabled).accessibilityIdentifier("voice.finalTranscript")
                }
                TextField(text("Review or type a phrase", "核对字幕或输入短句"), text: $review, axis: .vertical)
                    .lineLimit(3...8).textFieldStyle(.roundedBorder)
                    .disabled(store.hasSubmission || store.translation.busy)
                    .accessibilityIdentifier("voice.review")
                Text("\(review.utf16.count)/600").font(.caption).foregroundStyle(.secondary)
                Text(text("If local recognition is unavailable, type here. Translation still needs a connection and the text-processing consent below.", "本机识别不可用时可在此输入。文字翻译仍需网络和文字处理同意。"))
                    .font(.caption).foregroundStyle(.secondary)
                Button(text(store.hasSubmission ? "Check and retry the same request" : "Confirm text and translate", store.hasSubmission ? "核对并重试同一请求" : "确认文字并翻译")) {
                    run { await store.submitReviewed(text: review, sourceLocale: source, request: request) }
                }.buttonStyle(.borderedProminent)
                    .disabled(scenePhase != .active || store.translation.busy || store.translation.policy?.consentState != .accepted || review.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || review.utf16.count > 600)
                    .accessibilityIdentifier("voice.translate")
                if store.translation.busy { ProgressView() }
                if store.hasSubmission {
                    Text(text("Refresh reads this request's saved result. No recording or playback restarts automatically.", "刷新会读取本请求已存结果，不会自动重新录音或播放。"))
                    Button(text("Refresh this result", "刷新本次结果")) { run { await store.refresh(request: request) } }
                        .disabled(store.translation.busy || scenePhase != .active).accessibilityIdentifier("voice.refresh")
                }
                if store.translation.pending != nil {
                    Button(text("Cancel translation", "取消翻译")) { run { await store.cancelTranslation(request: request) } }
                        .disabled(store.translation.busy).accessibilityIdentifier("voice.cancelTranslation")
                }
                if let phrase = store.readableResult(scope: activeScope) {
                    resultView(phrase)
                }
                if store.translation.errorCode != nil {
                    Text(text("Translation is unavailable or its receipt is uncertain. Keep your reviewed text and refresh before retrying.", "翻译暂不可用或回执未确认。保留已核对文字，重试前先刷新。"))
                        .accessibilityIdentifier("voice.translationError")
                }
                Button(text("Start a new phrase", "开始新短句")) {
                    store.resetDraft(); review = ""
                }.disabled(store.translation.busy || store.translation.pending != nil)
                    .accessibilityIdentifier("voice.newPhrase")
                if let seconds = store.measuredSeconds, let characters = store.measuredASRCharacters {
                    Text(text("Recorded \(seconds.formatted(.number.precision(.fractionLength(2)))) s · final transcript \(characters) UTF-16 units", "录音 \(seconds.formatted(.number.precision(.fractionLength(2)))) 秒 · 最终字幕 \(characters) 个 UTF-16 单位"))
                        .font(.caption).accessibilityIdentifier("voice.measurements")
                }
                Text(text("Translation cost remains unknown until measured by the original service. Local duration and character counts are usage measurements, not a price.", "文字翻译费用仍由原服务核算，未知费用保持待核。本机秒数与字符数是用量记录，并非价格。"))
                    .font(.caption).foregroundStyle(.secondary)
            }.padding()
        }
        .background(Color.vpBackground)
        .navigationTitle(text("Voice translation", "语音翻译"))
        .navigationBarTitleDisplayMode(.inline)
        .task(id: activeScope) {
            store.bind(scope: activeScope)
            await store.refresh(request: request)
        }
        .onChange(of: store.finalTranscript) { _, final in
            if let final, !store.hasSubmission { review = final }
        }
        .onChange(of: source) { _, _ in
            store.interruptCapture()
            if !store.hasSubmission { store.resetDraft(); review = "" }
        }
        .onChange(of: activeScope) { _, scope in
            action?.cancel(); store.bind(scope: scope); review = ""
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { action?.cancel(); store.interruptCapture() }
        }
        .onDisappear { action?.cancel(); store.interruptCapture() }
    }

    private func run(_ operation: @escaping @MainActor () async -> Void) {
        action?.cancel()
        action = Task { await operation() }
    }

    @ViewBuilder private var policyView: some View {
        if let policy = store.translation.policy {
            VStack(alignment: .leading, spacing: 8) {
                Text(text("Text processing", "文字处理")).font(.headline)
                Text(settings.selectedLocale == .zh ? policy.noticeZh : policy.noticeEn)
                Text(text("Recipient: ", "接收方：") + policy.recipient)
                Text(text("Processing region: ", "处理地区：") + policy.processingRegion)
                Button(policy.consentState == .accepted ? text("Withdraw consent", "撤回同意") : text("Agree to text processing", "同意文字处理")) {
                    store.interruptCapture(); review = ""
                    run { await store.consent(accept: policy.consentState != .accepted, request: request) }
                }.disabled(store.translation.busy).accessibilityIdentifier("voice.consent")
            }
        }
    }

    private func resultView(_ phrase: NativeTranslationPhrase) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(text("Confirmed original", "确认原文")).font(.headline)
            Text(phrase.original).textSelection(.enabled)
            Text(phrase.translation ?? "").font(.title2).textSelection(.enabled)
                .accessibilityIdentifier("voice.finalTranslation")
            NativeVoicePlaybackPanel(phrase: phrase, scope: activeScope)
            Text(text("Back-translation is also AI-generated and does not independently verify the translation.", "回译同样由 AI 生成，不是独立核验。"))
                .font(.caption).foregroundStyle(.secondary)
        }
    }
}

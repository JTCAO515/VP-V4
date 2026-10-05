import SwiftUI

/// Gesture lifetime and audio-controller generation each fence their own callbacks.
struct NativeVoiceCapturePanel: View {
    let store: NativeVoiceTranslationStore
    let source: String
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var scenePhase
    @GestureState private var pressing = false
    @State private var captureToken: UUID?
    private var audio: NativeVoiceAudioController { settings.nativeSession.voiceAudio }
    private func text(_ en: String, _ zh: String) -> String { settings.selectedLocale == .zh ? zh : en }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(text("Only the pressed recording is recognized on this device. No continuous listening or automatic language downloads.", "只识别本次按住录音，识别在本机完成。不会持续监听或自动下载语言资源。"))
                .font(.caption).foregroundStyle(.secondary)
            Text(audio.phase == .recording ? text("Recording — release to finish", "录音中，松开结束") : text("Hold to speak · up to 30 seconds", "按住说话，最多 30 秒"))
                .font(.headline).frame(maxWidth: .infinity).padding()
                .background(Color.vpAccent.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                .contentShape(Rectangle())
                .gesture(DragGesture(minimumDistance: 0)
                    .updating($pressing) { _, held, _ in held = true }
                    .onChanged { _ in begin() }
                    .onEnded { _ in audio.endRecording() })
                .accessibilityIdentifier("voice.holdToRecord")
                .accessibilityAddTraits(.isButton)
                .accessibilityAction(named: Text(text("Start recording", "开始录音"))) { begin() }
                .accessibilityAction(named: Text(text("Finish recording", "结束录音"))) { audio.endRecording() }
                .opacity(store.canRecord ? 1 : 0.5)
            if audio.phase == .requestingPermission { Text(text("Waiting for permission. Release cancels this recording.", "等待权限中。松开会取消本次录音。")) }
            if audio.phase == .recognizing { ProgressView(text("Recognizing on device…", "正在本机识别…")) }
            if audio.phase == .recording || audio.phase == .requestingPermission || audio.phase == .recognizing {
                Button(text("Cancel recording", "取消录音")) { cancel() }
                    .accessibilityIdentifier("voice.cancelRecording")
            }
            if audio.failure != nil {
                Text(audio.cleanupPending ? text("Audio cleanup needs retry before another recording. Your text remains readable.", "音频清理需要重试后才能再次录音。文字仍可阅读。") : text("Local audio is unavailable or was interrupted. You can type your phrase instead.", "本机音频不可用或已中断，可改为输入短句。"))
                    .accessibilityIdentifier("voice.audioUnavailable")
                if audio.cleanupPending { Button(text("Retry audio cleanup", "重试音频清理")) { cancel() } }
            }
        }
        .onChange(of: pressing) { _, held in
            // GestureState resets on cancellation as well as normal finger release.
            if !held { audio.endRecording() }
        }
        .onChange(of: source) { _, _ in cancel() }
        .onChange(of: settings.nativeSession.dataScope) { _, _ in cancel() }
        .onChange(of: scenePhase) { _, phase in if phase != .active { cancel() } }
        .onChange(of: store.translation.policy?.consentState) { _, state in if state != .accepted { cancel() } }
        .onChange(of: store.recordingID) { _, id in if id == nil { cancel() } }
        .onChange(of: store.hasSubmission) { _, submitted in if submitted { cancel() } }
        .onChange(of: audio.phase) { _, phase in
            if phase == .idle, captureToken != nil { captureToken = nil; store.interruptCapture() }
        }
        .onDisappear { cancel(); audio.onFinalTranscript = nil }
    }

    private func begin() {
        guard captureToken == nil, scenePhase == .active, store.canRecord,
              audio.phase == .idle, !audio.cleanupPending,
              let scope = settings.nativeSession.dataScope, scope == store.scope else { return }
        audio.bind(scope: scope)
        guard let token = audio.beginRecording(localeIdentifier: source == "zh" ? "zh-CN" : "en-US") else { return }
        guard store.beginReview(recordingID: token, sourceLocale: source) else { audio.cancel(); return }
        captureToken = token
        audio.onFinalTranscript = { value in
            guard captureToken == token, scenePhase == .active, settings.nativeSession.dataScope == scope else { return }
            _ = store.acceptFinal(recordingID: value.recordingID, scope: value.scope, text: value.text,
                seconds: value.audioSeconds, characters: value.characters)
            captureToken = nil
        }
    }

    private func cancel() {
        captureToken = nil; audio.cancel(); store.interruptCapture()
    }
}

struct NativeVoicePlaybackPanel: View {
    let phrase: NativeTranslationPhrase
    let scope: NativeDataScope?
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var scenePhase
    private var audio: NativeVoiceAudioController { settings.nativeSession.voiceAudio }
    private func text(_ en: String, _ zh: String) -> String { settings.selectedLocale == .zh ? zh : en }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(text("Read this final translation", "朗读本次最终译文")) {
                guard scenePhase == .active, scope != nil, scope == settings.nativeSession.dataScope,
                      phrase.valid, phrase.state == "translated", let translation = phrase.translation else { return }
                audio.bind(scope: scope)
                audio.selectFinalTranslation(id: phrase.id, text: translation, localeIdentifier: phrase.targetLocale == "zh" ? "zh-CN" : "en-US")
                audio.speak()
            }.disabled(scenePhase != .active || audio.phase != .idle || audio.cleanupPending)
                .accessibilityIdentifier("voice.speak")
            Button(text("Stop playback", "停止朗读")) { audio.stopSpeaking() }
                .disabled(audio.phase != .speaking).accessibilityIdentifier("voice.stopPlayback")
            Text(text("Uses an installed system voice. After a stop or interruption this translation does not restart.", "使用已安装的系统声音，停止或中断后不会重新播放本条译文。"))
                .font(.caption).foregroundStyle(.secondary)
            if audio.playbackCharacters > 0 {
                Text(text("Selected text: \(audio.playbackCharacters) UTF-16 units · system progress: \(audio.spokenCharacters)", "已选译文：\(audio.playbackCharacters) 个 UTF-16 单位 · 系统进度：\(audio.spokenCharacters)"))
                    .font(.caption).accessibilityIdentifier("voice.playbackProgress")
            }
            if audio.failure != nil { Text(text("Playback is unavailable. Read the translation above.", "朗读暂不可用，可阅读上方译文。")) }
        }
        .onChange(of: scenePhase) { _, phase in if phase != .active { audio.stopSpeaking() } }
        .onDisappear { audio.stopSpeaking() }
    }
}

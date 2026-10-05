import SwiftUI

struct NativePlaceGuideCapturePanel: View {
    let followUp: NativePlaceGuideFollowUpStore
    let selection: NativePlaceGuideSelection
    let active: Bool
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var phase
    @GestureState private var pressing = false
    @State private var recordingID: UUID?
    private var audio: NativeVoiceAudioController { settings.nativeSession.voiceAudio }
    private var chinese: Bool { selection.locale == "zh" }
    private func t(_ en: String, _ zh: String) -> String { chinese ? zh : en }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(t("Hold to record a question · release to finish", "按住录制追问 · 松开结束"))
                .padding().frame(maxWidth: .infinity).background(Color.vpAccent.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                .contentShape(Rectangle())
                .gesture(DragGesture(minimumDistance: 0).updating($pressing) { _, held, _ in held = true }
                    .onChanged { _ in begin() }.onEnded { _ in audio.endRecording() })
                .accessibilityAddTraits(.isButton)
                .accessibilityAction(named: Text(t("Start recording", "开始录音"))) { begin() }
                .accessibilityAction(named: Text(t("Finish recording", "结束录音"))) { audio.endRecording() }
                .accessibilityIdentifier("guide.record")
            if audio.phase == .recognizing { ProgressView(t("Recognizing on this device", "正在本机识别")) }
            if audio.failure != nil {
                Text(t("Local recognition unavailable or interrupted. Type your question below.", "本机识别不可用或已中断，可在下方输入追问。"))
            }
            if recordingID != nil { Button(t("Cancel recording", "取消录音")) { cancel() } }
        }
        .onChange(of: pressing) { _, held in if !held { audio.endRecording() } }
        .onChange(of: active) { _, active in if !active { cancel() } }
        .onChange(of: settings.nativeSession.dataScope) { _, _ in cancel() }
        .onChange(of: phase) { _, phase in if phase != .active { cancel() } }
        .onDisappear { cancel() }
    }
    private func begin() {
        guard active, recordingID == nil, phase == .active, settings.nativeSession.dataScope == selection.scope,
              audio.phase == .idle, !audio.cleanupPending else { return }
        audio.bind(scope: selection.scope)
        guard let id = audio.beginRecording(localeIdentifier: chinese ? "zh-CN" : "en-US") else { return }
        recordingID = id
        audio.onFinalTranscript = { value in
            guard active, phase == .active, recordingID == id, value.recordingID == id,
                  value.scope == selection.scope, settings.nativeSession.dataScope == selection.scope else { return }
            followUp.draft = value.text; recordingID = nil
        }
    }
    private func cancel() {
        guard recordingID != nil else { return }
        recordingID = nil; audio.cancel(); audio.onFinalTranscript = nil
    }
}

import SwiftUI
import UIKit

struct NativeLocalVoicePresentation: Identifiable { let id = UUID() }

/// Reads actual AppSettings/NativeSession; it never creates a guest backend scope.
@MainActor struct NativeLocalVoiceHost: View {
    let state: NativeFrontendState
    @Environment(AppSettings.self) private var settings
    var body: some View { NativeLocalVoiceSheet(state: state, settings: settings) }
}

@MainActor struct NativeLocalVoiceSheet: View {
    let state: NativeFrontendState
    let settings: AppSettings
    @State private var capture: NativeLocalVoiceCapture
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase

    init(state: NativeFrontendState, settings: AppSettings) {
        self.state = state; self.settings = settings
        _capture = State(initialValue: NativeLocalVoiceCapture(
            driver: NativeSystemVoiceAudioDriver(), resources: .shared,
            current: { NativeLocalVoiceContext(state: state, identity: .init(settings: settings)) },
            eligible: { state.selectedTab == .vp && state.screenState == .ready && UIApplication.shared.applicationState == .active }))
    }

    private var chinese: Bool { settings.selectedLocale.rawValue.hasPrefix("zh") }
    private func words(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    private var liveContext: NativeLocalVoiceContext { .init(state: state, identity: .init(settings: settings)) }
    private var status: String {
        if let failure = capture.failure {
            switch failure {
            case .empty: return words("没有识别到文字，请重试或手动输入。", "No speech was recognized. Try again or type instead.")
            case .contextChanged: return words("对话、草稿或会话已变化，本次语音已取消。请手动输入或重新开始。", "The conversation, draft or session changed. Voice input was cancelled. Type or start again.")
            case .busy: return words("另一个本地语音输入正在使用麦克风，请稍后再试或手动输入。", "Another local voice input is active. Try later or type instead.")
            case .audio(let reason):
                switch reason {
                case .permissionDenied: return words("麦克风或语音识别权限未获允许。可在系统设置中检查权限，或手动输入。", "Microphone or speech permission was not granted. Check system Settings or type instead.")
                case .unavailable: return words("当前语言的设备端语音识别不可用，请手动输入。不会切换到云端识别。", "On-device recognition is unavailable for this language. Type instead. Cloud recognition will not be used.")
                case .invalidAudio: return words("录音无效，请重试或手动输入。", "The recording was invalid. Try again or type instead.")
                case .transcriptTooLong: return words("识别文字超过600字符或合并后草稿超过2000字符，未采用；请缩短录音或手动输入。", "The transcript exceeds 600 characters or the combined draft exceeds 2000. Nothing was inserted. Use a shorter recording or type.")
                case .timedOut: return words("本次语音已超时并取消，请重试或手动输入。", "Voice input timed out and was cancelled. Try again or type instead.")
                case .interrupted: return words("录音或识别被系统中断，已取消。请重新开始或手动输入。", "Recording or recognition was interrupted and cancelled. Start again or type instead.")
                case .cleanupRequired: return words("临时录音清理失败，已停用新录音。请手动输入。", "Temporary recording cleanup failed. New recordings are disabled. Type instead.")
                }
            }
        }
        if capture.transcript != nil { return words("请审阅识别文字，只有点击采用才放入当前草稿。", "Review the recognized text. Only Use text inserts it into the current draft.") }
        switch capture.phase {
        case .requestingPermission: return words("正在等待系统权限，可取消。", "Waiting for system permission. You can cancel.")
        case .recording: return words("正在录音，最长30秒。点击停止后识别。", "Recording, up to 30 seconds. Stop to recognize speech.")
        case .recognizing: return words("正在设备端识别，可取消。", "Recognizing on this device. You can cancel.")
        default: return words("点击开始才申请系统权限并录音。", "Tap Start to request system permission and record.")
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text(words("语音仅用于当前本地草稿；聊天仍为体验示例，未连接真实 Agent。不会自动发送、创建任务或调用付费服务。", "Voice is only for this local draft. Chat remains a sample, with no live Agent. It will not send automatically, create tasks or call paid services."))
                        .font(.footnote).foregroundStyle(.secondary)
                    Text(status).accessibilityIdentifier("frontend.voice.status")
                    if let text = capture.transcript {
                        Text(text).textSelection(.enabled)
                            .accessibilityIdentifier("frontend.voice.transcript")
                        Button(words("采用到当前草稿", "Use text in current draft")) {
                            if capture.adopt(into: state) { dismiss() }
                        }
                        .buttonStyle(.borderedProminent)
                        .accessibilityIdentifier("frontend.voice.adopt")
                    } else if capture.phase == .recording || capture.phase == .requestingPermission {
                        Button(words("停止", "Stop")) { capture.stop() }
                            .buttonStyle(.borderedProminent).accessibilityIdentifier("frontend.voice.stop")
                    } else if capture.phase == .recognizing {
                        ProgressView().accessibilityLabel(words("正在设备端识别", "Recognizing on this device"))
                    } else {
                        Button(words("开始录音", "Start recording")) { capture.begin() }
                            .buttonStyle(.borderedProminent).disabled(capture.cleanupPending)
                            .accessibilityIdentifier("frontend.voice.start")
                    }
                    Button(words("取消并手动输入", "Cancel and type instead")) { capture.cancel(); dismiss() }
                        .accessibilityIdentifier("frontend.voice.type")
                }
                .frame(maxWidth: .infinity, alignment: .leading).padding(20)
            }
            .navigationTitle(words("设备端语音输入", "On-device voice input"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) {
                Button(words("关闭", "Close")) { capture.cancel(); dismiss() }
            } }
        }
        .onChange(of: liveContext) { _, _ in capture.invalidateIfChanged() }
        .onChange(of: state.selectedTab) { _, _ in capture.invalidateIfChanged() }
        .onChange(of: state.screenState) { _, _ in capture.invalidateIfChanged() }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { capture.cancel(.audio(.interrupted)) }
        }
        .onDisappear { capture.cancel() }
    }
}

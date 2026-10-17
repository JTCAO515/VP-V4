import SwiftUI

@MainActor
struct NativeFrontendAssistantDetail: View {
    let state: NativeFrontendState
    @Environment(\.dismiss) private var dismiss
    @Environment(\.locale) private var locale
    @State private var editing = false
    @State private var resetConfirmation = false
    @State private var allowed = false
    @State private var todos = NativeFrontendAssistantTodo.samples
    @State private var feedback: NativeFrontendAssistantFeedback?

    private func copy(_ zh: String, _ en: String) -> String {
        NativeFrontendAssistantCopy(locale: locale)(zh, en)
    }

    var body: some View {
        NavigationStack {
            List {
                Section { NativeFrontendBoundary() }
                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        Image("PandaMark").resizable().scaledToFit().frame(width: 72, height: 72)
                            .accessibilityLabel(copy("VP 熊猫头像", "VP panda avatar"))
                        Text(state.assistantName).font(.largeTitle.bold())
                        Text(state.assistantTagline).font(.body)
                        Label(state.assistantTone, systemImage: "bubble.left")
                            .foregroundStyle(.secondary)
                    }.padding(.vertical, 8)
                    Button(state.customized ? copy("编辑人格", "Edit personality") : copy("首次定制", "Customize assistant")) { editing = true }
                        .accessibilityIdentifier("assistant.customize")
                    if !state.customized {
                        Button(copy("暂时跳过", "Skip for now")) { feedback = .skippedFromDetail }
                            .accessibilityIdentifier("assistant.skip")
                    }
                } header: { Text(copy("你的助手", "Your assistant")) } footer: {
                    Text(copy("人格只决定本地示例的名字、标语和表达语气。旅行偏好在记忆页管理。", "Personality only sets the name, tagline and tone in this local sample. Manage travel preferences in Memory."))
                }
                if state.screenState == .ready {
                    Section(copy("当前工作", "Current work")) {
                        Label(copy("等待你选择下一步", "Waiting for your next step"), systemImage: "pause.circle")
                        Text(copy("展示本地上海两日安排样例；没有正在执行的后台任务。", "Showing a local two-day Shanghai plan sample. No background task is running."))
                            .foregroundStyle(.secondary)
                        Button(copy("回到对话", "Back to chat")) { state.openChat(); dismiss() }
                    }
                    Section(copy("了解助手", "About your assistant")) {
                        NavigationLink(copy("活动记录", "Activity")) { activity }
                        NavigationLink(copy("权限说明", "Permissions")) { permissions }
                        NavigationLink(copy("待办 · 本地示意", "To-dos · Local sample")) { todoList }
                        Button(copy("查看旅行偏好", "Travel preferences")) { state.selectedTab = .memory; dismiss() }
                    }
                }
                Section(copy("体验状态", "Sample states")) {
                    Picker(copy("页面状态", "Page state"), selection: Bindable(state).screenState) {
                        ForEach(NativeFrontendScreenState.allCases) { Text(screenTitle($0)).tag($0) }
                    }.accessibilityIdentifier("assistant.screen-state")
                    if state.screenState != .ready { sampleStatePanel }
                }
                if let feedback {
                    Section(copy("本地反馈", "Local feedback")) { Text(feedback.message(locale: locale)).accessibilityIdentifier("assistant.feedback") }
                }
                Section {
                    Button(copy("重置助手样例", "Reset assistant sample"), role: .destructive) { resetConfirmation = true }
                        .accessibilityIdentifier("assistant.reset")
                } footer: { Text(copy("仅在当前体验内保存，退出 App 后不保留；不会更改账号或真实服务。", "Changes stay in this experience and are not kept after quitting the app. Your account and real services are unchanged.")) }
            }
            .navigationTitle(copy("助手详情", "Assistant details"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(copy("关闭", "Close")) { dismiss() } } }
            .sheet(isPresented: $editing) {
                NativeFrontendAssistantEditor(state: state) { feedback = $0 }
            }
            .confirmationDialog(copy("重置助手样例？", "Reset assistant sample?"), isPresented: $resetConfirmation, titleVisibility: .visible) {
                Button(copy("重置", "Reset"), role: .destructive) { resetAssistant() }
                Button(copy("取消", "Cancel"), role: .cancel) { }
            } message: { Text(copy("名字、标语、语气、示意权限和待办恢复默认。旅程、资料和记忆保留。", "Restore the default name, tagline, tone, sample permissions and to-dos. Journeys, materials and memories stay unchanged.")) }
        }
    }

    private var activity: some View {
        List {
            NativeFrontendBoundary()
            Section(copy("本地记录", "Local activity")) {
                NavigationLink(copy("准备展示两日安排", "Two-day plan sample ready")) {
                    List {
                        NativeFrontendBoundary()
                        Text(copy("样例已准备好", "Sample ready")).font(.headline)
                        Text(copy("这是界面内置内容，没有调用模型、搜索或预订服务，也没有后台执行或真实时间记录。", "This content is built into the interface. No AI, search or booking service was called. There is no background execution or real activity timestamp."))
                        Button(copy("查看样例资料", "View sample material")) {
                            state.openMaterial("sample-plan"); dismiss()
                        }
                    }.navigationTitle(copy("活动详情", "Activity details"))
                }
                Text(copy("真实活动尚未接入。", "Real activity is not connected yet.")).foregroundStyle(.secondary)
            }
        }.navigationTitle(copy("活动记录", "Activity"))
    }

    private var permissions: some View {
        List {
            NativeFrontendBoundary()
            Section(copy("权限示意", "Sample permissions")) {
                Toggle(copy("允许提醒示意", "Allow sample reminders"), isOn: $allowed)
                    .accessibilityIdentifier("assistant.permission")
                Text(allowed ? copy("本地示意：允许。没有开启系统通知。", "Local sample: allowed. System notifications are not enabled.") : copy("本地示意：不允许。不会影响已有内容。", "Local sample: not allowed. Existing content is unaffected."))
                Text(copy("此开关只帮助体验允许与不允许的界面，不会申请或修改 iOS 通知、位置、麦克风或照片权限。真实权限尚未接入。", "This switch only demonstrates allowed and denied states. It does not request or change iOS notification, location, microphone or photo permissions. Real permissions are not connected yet."))
            }
            Section(copy("你保留控制权", "You stay in control")) {
                Text(copy("人格定制不会授权任何外部操作。待办标记不会预订、发送消息或写入真实旅程。", "Customizing personality does not authorize external actions. To-do marks do not make bookings, send messages or change real journeys."))
            }
        }.navigationTitle(copy("权限说明", "Permissions"))
    }

    private var todoList: some View {
        List {
            NativeFrontendBoundary()
            ForEach($todos) { $todo in
                Section(todo.title) {
                    Text(todo.explanation).foregroundStyle(.secondary)
                    Text(todo.status.title(locale: locale))
                    if todo.status == .pending {
                        Button(copy("标记完成", "Mark complete")) { todo.status = .completed }
                            .accessibilityLabel(copy("标记完成：", "Mark complete: ") + todo.title)
                        Button(copy("取消待办", "Cancel to-do"), role: .destructive) { todo.status = .cancelled }
                            .accessibilityLabel(copy("取消待办：", "Cancel to-do: ") + todo.title)
                    } else {
                        Button(copy("恢复待办", "Restore to-do")) { todo.status = .pending }
                    }
                }
            }
        }.navigationTitle(copy("待办", "To-dos"))
    }

    private func screenTitle(_ screen: NativeFrontendScreenState) -> String {
        switch screen {
        case .ready: copy("正常", "Ready")
        case .empty: copy("空白", "Empty")
        case .loading: copy("加载中", "Loading")
        case .failed: copy("失败", "Failed")
        case .cancelled: copy("取消", "Cancelled")
        }
    }

    @ViewBuilder
    private var sampleStatePanel: some View {
        // Shared panel is currently Chinese-only. Keep the equivalent English UI owned here.
        if locale.language.languageCode?.identifier == "zh" {
            NativeFrontendStatePanel(state: state)
        } else {
            switch state.screenState {
            case .ready: EmptyView()
            case .empty:
                ContentUnavailableView("No content yet", systemImage: "tray",
                    description: Text("Start in chat, or return to the ready sample."))
            case .loading:
                VStack {
                    ProgressView()
                    Text("Demonstrating the loading state")
                    Button("Cancel loading") { state.screenState = .cancelled }
                }
            case .failed:
                ContentUnavailableView {
                    Label("Unable to load", systemImage: "wifi.exclamationmark")
                } description: {
                    Text("This is a local failure sample. No real request was sent.")
                } actions: {
                    Button("Retry sample") { state.screenState = .ready }
                }
            case .cancelled:
                VStack {
                    Text("Loading cancelled")
                    Button("Back to content") { state.screenState = .ready }
                }
            }
        }
    }

    private func resetAssistant() {
        let sample = NativeFrontendAssistantPersona.sample
        state.assistantName = sample.name; state.assistantTagline = sample.tagline
        state.assistantTone = sample.tone; state.customized = false
        allowed = false; todos = NativeFrontendAssistantTodo.samples; state.screenState = .ready
        feedback = .reset
    }
}

@MainActor
private struct NativeFrontendAssistantEditor: View {
    let state: NativeFrontendState
    let onFeedback: (NativeFrontendAssistantFeedback) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.locale) private var locale
    @State private var draft: NativeFrontendAssistantPersona

    init(state: NativeFrontendState, onFeedback: @escaping (NativeFrontendAssistantFeedback) -> Void) {
        self.state = state; self.onFeedback = onFeedback
        _draft = State(initialValue: .init(name: state.assistantName, tagline: state.assistantTagline, tone: state.assistantTone))
    }

    private func copy(_ zh: String, _ en: String) -> String {
        NativeFrontendAssistantCopy(locale: locale)(zh, en)
    }

    var body: some View {
        NavigationStack {
            Form {
                NativeFrontendBoundary()
                Section(copy("人格", "Personality")) {
                    TextField(copy("名字", "Name"), text: $draft.name).accessibilityIdentifier("assistant.name")
                    TextField(copy("标语", "Tagline"), text: $draft.tagline, axis: .vertical)
                        .accessibilityIdentifier("assistant.tagline")
                    Picker(copy("语气", "Tone"), selection: $draft.tone) {
                        ForEach(NativeFrontendAssistantPersona.tones, id: \.self) { Text(NativeFrontendAssistantPersona.toneTitle($0, locale: locale)).tag($0) }
                    }.accessibilityIdentifier("assistant.tone")
                    Text(copy("名字 1–24 字，标语 1–80 字。", "Name: 1–24 characters. Tagline: 1–80 characters.")).font(.caption).foregroundStyle(.secondary)
                }
                Section(copy("预览", "Preview")) {
                    Text(draft.normalized.name.isEmpty ? copy("你的助手", "Your assistant") : draft.normalized.name).font(.title2.bold())
                    Text(draft.tagline)
                    Text(draft.preview(locale: locale))
                }
                Section { Text(copy("这是表达方式预览，没有调用 AI。旅行偏好请到记忆页管理。", "This is a tone preview. No AI was called. Manage travel preferences in Memory.")) }
                if !state.customized { Button(copy("跳过定制", "Skip customization")) { cancel(.skippedFromEditor) } }
            }
            .navigationTitle(state.customized ? copy("编辑人格", "Edit personality") : copy("首次定制", "Customize assistant"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(copy("取消", "Cancel")) { cancel(.cancelled) } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(copy("保存", "Save")) {
                        guard draft.canSave else { return }
                        let value = draft.normalized
                        state.assistantName = value.name; state.assistantTagline = value.tagline
                        state.assistantTone = value.tone; state.customized = true
                        onFeedback(.saved)
                        dismiss()
                    }.disabled(!draft.canSave).accessibilityIdentifier("assistant.save")
                }
            }
            .interactiveDismissDisabled()
        }
    }
    private func cancel(_ message: NativeFrontendAssistantFeedback) { onFeedback(message); dismiss() }
}

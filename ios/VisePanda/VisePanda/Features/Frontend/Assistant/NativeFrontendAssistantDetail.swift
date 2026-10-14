import SwiftUI

@MainActor
struct NativeFrontendAssistantDetail: View {
    let state: NativeFrontendState
    @Environment(\.dismiss) private var dismiss
    @State private var editing = false
    @State private var resetConfirmation = false
    @State private var allowed = false
    @State private var todos = NativeFrontendAssistantTodo.samples
    @State private var feedback: String?

    var body: some View {
        NavigationStack {
            List {
                Section { NativeFrontendBoundary() }
                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        Image("PandaMark").resizable().scaledToFit().frame(width: 72, height: 72)
                            .accessibilityLabel("VP 熊猫头像")
                        Text(state.assistantName).font(.largeTitle.bold())
                        Text(state.assistantTagline).font(.body)
                        Label(state.assistantTone, systemImage: "bubble.left")
                            .foregroundStyle(.secondary)
                    }.padding(.vertical, 8)
                    Button(state.customized ? "编辑人格" : "首次定制") { editing = true }
                        .accessibilityIdentifier("assistant.customize")
                    if !state.customized {
                        Button("暂时跳过") { feedback = "已跳过定制，可以继续使用默认人格，随时回来修改。" }
                            .accessibilityIdentifier("assistant.skip")
                    }
                } header: { Text("你的助手") } footer: {
                    Text("人格只决定本地示例的名字、标语和表达语气。旅行偏好在记忆页管理。")
                }
                if state.screenState == .ready {
                    Section("当前工作") {
                        Label("等待你选择下一步", systemImage: "pause.circle")
                        Text("展示本地上海两日安排样例；没有正在执行的后台任务。")
                            .foregroundStyle(.secondary)
                        Button("回到对话") { state.openChat(); dismiss() }
                    }
                    Section("了解助手") {
                        NavigationLink("活动记录") { activity }
                        NavigationLink("权限说明") { permissions }
                        NavigationLink("待办 · 本地示意") { todoList }
                        Button("查看旅行偏好") { state.selectedTab = .memory; dismiss() }
                    }
                }
                Section("体验状态") {
                    Picker("页面状态", selection: Bindable(state).screenState) {
                        ForEach(NativeFrontendScreenState.allCases) { Text($0.title).tag($0) }
                    }.accessibilityIdentifier("assistant.screen-state")
                    if state.screenState != .ready { NativeFrontendStatePanel(state: state) }
                }
                if let feedback {
                    Section("本地反馈") { Text(feedback).accessibilityIdentifier("assistant.feedback") }
                }
                Section {
                    Button("重置助手样例", role: .destructive) { resetConfirmation = true }
                        .accessibilityIdentifier("assistant.reset")
                } footer: { Text("仅在当前体验内保存，退出 App 后不保留；不会更改账号或真实服务。") }
            }
            .navigationTitle("助手详情")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("关闭") { dismiss() } } }
            .sheet(isPresented: $editing) {
                NativeFrontendAssistantEditor(state: state) { feedback = $0 }
            }
            .confirmationDialog("重置助手样例？", isPresented: $resetConfirmation, titleVisibility: .visible) {
                Button("重置", role: .destructive) { resetAssistant() }
                Button("取消", role: .cancel) { }
            } message: { Text("名字、标语、语气、示意权限和待办恢复默认。旅程、资料和记忆保留。") }
        }
    }

    private var activity: some View {
        List {
            NativeFrontendBoundary()
            Section("本地记录") {
                NavigationLink("准备展示两日安排") {
                    List {
                        NativeFrontendBoundary()
                        Text("样例已准备好").font(.headline)
                        Text("这是界面内置内容，没有调用模型、搜索或预订服务，也没有后台执行或真实时间记录。")
                        Button("查看样例资料") {
                            state.openMaterial("sample-plan"); dismiss()
                        }
                    }.navigationTitle("活动详情")
                }
                Text("真实活动尚未接入。").foregroundStyle(.secondary)
            }
        }.navigationTitle("活动记录")
    }

    private var permissions: some View {
        List {
            NativeFrontendBoundary()
            Section("权限示意") {
                Toggle("允许提醒示意", isOn: $allowed)
                    .accessibilityIdentifier("assistant.permission")
                Text(allowed ? "本地示意：允许。没有开启系统通知。" : "本地示意：不允许。不会影响已有内容。")
                Text("此开关只帮助体验允许与不允许的界面，不会申请或修改 iOS 通知、位置、麦克风或照片权限。真实权限尚未接入。")
            }
            Section("你保留控制权") {
                Text("人格定制不会授权任何外部操作。待办标记不会预订、发送消息或写入真实旅程。")
            }
        }.navigationTitle("权限说明")
    }

    private var todoList: some View {
        List {
            NativeFrontendBoundary()
            ForEach($todos) { $todo in
                Section(todo.title) {
                    Text(todo.explanation).foregroundStyle(.secondary)
                    Text(todo.status.rawValue)
                    if todo.status == .pending {
                        Button("标记完成") { todo.status = .completed }
                            .accessibilityLabel("标记完成：\(todo.title)")
                        Button("取消待办", role: .destructive) { todo.status = .cancelled }
                            .accessibilityLabel("取消待办：\(todo.title)")
                    } else {
                        Button("恢复待办") { todo.status = .pending }
                    }
                }
            }
        }.navigationTitle("待办")
    }

    private func resetAssistant() {
        let sample = NativeFrontendAssistantPersona.sample
        state.assistantName = sample.name; state.assistantTagline = sample.tagline
        state.assistantTone = sample.tone; state.customized = false
        allowed = false; todos = NativeFrontendAssistantTodo.samples; state.screenState = .ready
        feedback = "助手样例已重置，旅程、资料和记忆保留。"
    }
}

@MainActor
private struct NativeFrontendAssistantEditor: View {
    let state: NativeFrontendState
    let onFeedback: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var draft: NativeFrontendAssistantPersona

    init(state: NativeFrontendState, onFeedback: @escaping (String) -> Void) {
        self.state = state; self.onFeedback = onFeedback
        _draft = State(initialValue: .init(name: state.assistantName, tagline: state.assistantTagline, tone: state.assistantTone))
    }

    var body: some View {
        NavigationStack {
            Form {
                NativeFrontendBoundary()
                Section("人格") {
                    TextField("名字", text: $draft.name).accessibilityIdentifier("assistant.name")
                    TextField("标语", text: $draft.tagline, axis: .vertical)
                        .accessibilityIdentifier("assistant.tagline")
                    Picker("语气", selection: $draft.tone) {
                        ForEach(NativeFrontendAssistantPersona.tones, id: \.self) { Text($0).tag($0) }
                    }.accessibilityIdentifier("assistant.tone")
                    Text("名字 1–24 字，标语 1–80 字。").font(.caption).foregroundStyle(.secondary)
                }
                Section("预览") {
                    Text(draft.normalized.name.isEmpty ? "你的助手" : draft.normalized.name).font(.title2.bold())
                    Text(draft.tagline)
                    Text(draft.preview)
                }
                Section { Text("这是表达方式预览，没有调用 AI。旅行偏好请到记忆页管理。") }
                if !state.customized { Button("跳过定制") { cancel("已跳过定制，默认人格保留。") } }
            }
            .navigationTitle(state.customized ? "编辑人格" : "首次定制")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { cancel("已取消，原人格保留。") } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") {
                        guard draft.canSave else { return }
                        let value = draft.normalized
                        state.assistantName = value.name; state.assistantTagline = value.tagline
                        state.assistantTone = value.tone; state.customized = true
                        onFeedback("人格已保存到本次本地体验，未同步真实账号。")
                        dismiss()
                    }.disabled(!draft.canSave).accessibilityIdentifier("assistant.save")
                }
            }
            .interactiveDismissDisabled()
        }
    }
    private func cancel(_ message: String) { onFeedback(message); dismiss() }
}

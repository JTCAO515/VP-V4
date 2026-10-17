import SwiftUI

@MainActor
struct NativeFrontendMemoryView: View {
    @Environment(\.locale) private var locale
    private var copy: NativeLibraryMemoryCopy { .init(locale: locale) }
    let state: NativeFrontendState

    var body: some View {
        List {
            Section {
                NativeLibraryMemoryBoundary()
                Text(copy("VP 记得的旅行偏好", "Travel preferences VP remembers")).font(.headline)
                Text(copy("旅行偏好帮助理解旅行需求；助手人格控制表达方式，两者不同。这里的样例尚未用于真实回答。", "Travel preferences describe your travel needs. Assistant personality controls how it responds. These are different. These samples have not been used for real answers."))
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            if state.screenState != .ready {
                NativeLibraryMemoryStatePanel(state: state)
                if state.screenState == .empty { Button(copy("返回正常样例", "Return to sample")) { state.screenState = .ready } }
            } else if state.memories.isEmpty {
                ContentUnavailableView(copy("还没有旅行偏好", "No travel preferences yet"), systemImage: "brain",
                    description: Text(copy("可从对话说明偏好，也可主动恢复本地样例。", "Describe your preferences in chat, or explicitly restore the local sample.")))
                Button(copy("恢复偏好样例", "Restore preference sample")) { state.restoreLocalMemories(locale: locale) }
                    .accessibilityIdentifier("frontend.memory.restore")
                Button(copy("开始对话", "Start chat")) { state.openChat(context: copy("我想说明旅行偏好。", "I would like to describe my travel preferences.")) }
            } else {
                Section(copy("旅行偏好", "Travel preference")) {
                    ForEach(state.memories) { memory in
                        NavigationLink(value: NativeFrontendMemoryRoute.detail(memoryID: memory.id)) {
                            VStack(alignment: .leading, spacing: 8) {
                                Text(memory.title).font(.headline)
                                Text(copy("适用：", "Applies to: ") + memory.scope).font(.subheadline)
                                Text(copy("来源：", "Source: ") + memory.source).font(.caption).foregroundStyle(.secondary)
                            }.padding(.vertical, 6)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("frontend.memory.item.\(memory.id)")
                    }
                }
            }
            if let notice = state.notice { Section(copy("近期本地反馈", "Recent local feedback")) { Text(notice).font(.subheadline) } }
        }
        .navigationTitle(copy("记忆", "Memory"))
        .navigationDestination(for: NativeFrontendMemoryRoute.self) { route in
            switch route {
            case .detail(let memoryID):
                NativeFrontendMemoryDetail(state: state, memoryID: memoryID)
            }
        }
    }
}

// A dedicated value type avoids sharing a String destination with other tab routes.
private enum NativeFrontendMemoryRoute: Hashable {
    case detail(memoryID: String)
}

@MainActor
private struct NativeFrontendMemoryDetail: View {
    @Environment(\.locale) private var locale
    private var copy: NativeLibraryMemoryCopy { .init(locale: locale) }
    let state: NativeFrontendState
    let memoryID: String
    @Environment(\.dismiss) private var dismiss
    @State private var editing = false
    @State private var forgetting = false

    var body: some View {
        List {
            NativeLibraryMemoryBoundary()
            if let memory = state.memories.first(where: { $0.id == memoryID }) {
                Section(copy("旅行偏好", "Travel preference")) { Text(memory.title).font(.headline) }
                Section(copy("适用范围", "Applies to")) { Text(memory.scope); Text(copy("这不是助手人格设定。只修改本地样例，真实记忆和真实回答不会改变。", "This is not an assistant personality setting. Only the local sample changes; real memories and answers remain unchanged.")).font(.caption).foregroundStyle(.secondary) }
                Section(copy("来源", "Source")) { Text(memory.source) }
                Section {
                    Button(copy("修正偏好", "Edit preference")) { editing = true }.accessibilityIdentifier("frontend.memory.edit")
                    Button(copy("带着偏好继续对话", "Continue in chat with this preference")) { state.openChat(context: copy("旅行偏好（本地样例）：", "Travel preference (local sample): ") + memory.title + copy("；适用：", "; applies to: ") + memory.scope) }
                    Button(copy("忘记这条偏好", "Forget this preference"), role: .destructive) { forgetting = true }
                        .accessibilityIdentifier("frontend.memory.forget")
                }
                if let notice = state.notice { Section(copy("近期本地反馈", "Recent local feedback")) { Text(notice) } }
            } else { ContentUnavailableView(copy("这条样例已忘记", "Sample preference forgotten"), systemImage: "brain") }
        }
        .navigationTitle(copy("偏好详情", "Preference details")).navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $editing) { NativeFrontendMemoryEditor(state: state, memoryID: memoryID) }
        .alert(copy("忘记这条本地偏好？", "Forget this local preference?"), isPresented: $forgetting) {
            Button(copy("取消", "Cancel"), role: .cancel) {}
            Button(copy("确认忘记", "Confirm forgetting"), role: .destructive) { state.forgetLocalMemory(memoryID, locale: locale); dismiss() }
        } message: { Text(copy("确认后从当前本地样例中删除。不会请求真实服务，也不会删除真实记忆。", "Confirmation removes it from the current local sample. No real service is called and no real memory is deleted.")) }
    }
}

@MainActor
private struct NativeFrontendMemoryEditor: View {
    @Environment(\.locale) private var locale
    private var copy: NativeLibraryMemoryCopy { .init(locale: locale) }
    let state: NativeFrontendState
    let memoryID: String
    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var scope: String
    @State private var confirming = false
    @State private var error: String?

    init(state: NativeFrontendState, memoryID: String) {
        self.state = state
        self.memoryID = memoryID
        let memory = state.memories.first { $0.id == memoryID }
        _title = State(initialValue: memory?.title ?? "")
        _scope = State(initialValue: memory?.scope ?? "")
    }

    private var correctionPreview: String {
        let original = state.memories.first { $0.id == memoryID }
        let unavailable = copy("已不可用", "Unavailable")
        return copy("原偏好：", "Previous preference: ") + (original?.title ?? unavailable)
            + "\n" + copy("新偏好：", "New preference: ") + title
            + "\n" + copy("原范围：", "Previous scope: ") + (original?.scope ?? unavailable)
            + "\n" + copy("新范围：", "New scope: ") + scope
            + "\n" + copy("仅修改本地样例。", "Only the local sample changes.")
    }

    private var valid: Bool {
        let text = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let range = scope.trimmingCharacters(in: .whitespacesAndNewlines)
        return !text.isEmpty && text.count <= 500 && !range.isEmpty && range.count <= 200
    }

    var body: some View {
        NavigationStack {
            Form {
                NativeLibraryMemoryBoundary()
                Section(copy("修正内容", "Correction")) {
                    TextField(copy("旅行偏好", "Travel preference"), text: $title, axis: .vertical)
                        .accessibilityIdentifier("frontend.memory.title")
                    TextField(copy("适用范围", "Applies to"), text: $scope, axis: .vertical)
                        .accessibilityIdentifier("frontend.memory.scope")
                    Text(copy("偏好 1–500 字，范围 1–200 字。保存前需确认，取消会保留原内容。", "Preference: 1–500 characters. Scope: 1–200 characters. Confirm before saving; cancelling keeps the original."))
                        .font(.caption).foregroundStyle(.secondary)
                }
                if let error { Text(error).foregroundStyle(.red) }
                Button(copy("查看修改并确认", "Review changes")) { confirming = true }.disabled(!valid)
                    .accessibilityIdentifier("frontend.memory.reviewCorrection")
            }
            .navigationTitle(copy("修正偏好", "Edit preference")).navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(copy("取消", "Cancel")) { dismiss() } } }
            .alert(copy("确认本地修正？", "Confirm local correction?"), isPresented: $confirming) {
                Button(copy("继续编辑", "Keep editing"), role: .cancel) {}
                Button(copy("确认修正", "Confirm correction")) {
                    if state.correctLocalMemory(memoryID, title: title, scope: scope, locale: locale) { dismiss() }
                    else { error = copy("内容无效或原偏好已不可用，未修改。", "Invalid content or preference no longer available. No changes made.") }
                }
            } message: {
                Text(correctionPreview)
            }
        }
    }
}

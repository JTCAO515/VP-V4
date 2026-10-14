import SwiftUI

@MainActor
struct NativeFrontendMemoryView: View {
    let state: NativeFrontendState

    var body: some View {
        List {
            Section {
                NativeFrontendBoundary()
                Text("VP 记得的旅行偏好").font(.headline)
                Text("旅行偏好帮助理解旅行需求；助手人格控制表达方式，两者不同。这里的样例尚未用于真实回答。")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            if state.screenState != .ready {
                NativeFrontendStatePanel(state: state)
                if state.screenState == .empty { Button("返回正常样例") { state.screenState = .ready } }
            } else if state.memories.isEmpty {
                ContentUnavailableView("还没有旅行偏好", systemImage: "brain",
                    description: Text("可从对话说明偏好，也可主动恢复本地样例。"))
                Button("恢复偏好样例") { state.restoreLocalMemories() }
                    .accessibilityIdentifier("frontend.memory.restore")
                Button("开始对话") { state.openChat(context: "我想说明旅行偏好。") }
            } else {
                Section("旅行偏好") {
                    ForEach(state.memories) { memory in
                        NavigationLink(value: NativeFrontendMemoryRoute.detail(memoryID: memory.id)) {
                            VStack(alignment: .leading, spacing: 8) {
                                Text(memory.title).font(.headline)
                                Text("适用：\(memory.scope)").font(.subheadline)
                                Text("来源：\(memory.source)").font(.caption).foregroundStyle(.secondary)
                            }.padding(.vertical, 6)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("frontend.memory.item.\(memory.id)")
                    }
                }
            }
            if let notice = state.notice { Section("近期本地反馈") { Text(notice).font(.subheadline) } }
        }
        .navigationTitle("记忆")
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
    let state: NativeFrontendState
    let memoryID: String
    @Environment(\.dismiss) private var dismiss
    @State private var editing = false
    @State private var forgetting = false

    var body: some View {
        List {
            NativeFrontendBoundary()
            if let memory = state.memories.first(where: { $0.id == memoryID }) {
                Section("旅行偏好") { Text(memory.title).font(.headline) }
                Section("适用范围") { Text(memory.scope); Text("这不是助手人格设定。只修改本地样例，真实记忆和真实回答不会改变。").font(.caption).foregroundStyle(.secondary) }
                Section("来源") { Text(memory.source) }
                Section {
                    Button("修正偏好") { editing = true }.accessibilityIdentifier("frontend.memory.edit")
                    Button("带着偏好继续对话") { state.openChat(context: "旅行偏好（本地样例）：\(memory.title)；适用：\(memory.scope)") }
                    Button("忘记这条偏好", role: .destructive) { forgetting = true }
                        .accessibilityIdentifier("frontend.memory.forget")
                }
                if let notice = state.notice { Section("近期本地反馈") { Text(notice) } }
            } else { ContentUnavailableView("这条样例已忘记", systemImage: "brain") }
        }
        .navigationTitle("偏好详情").navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $editing) { NativeFrontendMemoryEditor(state: state, memoryID: memoryID) }
        .alert("忘记这条本地偏好？", isPresented: $forgetting) {
            Button("取消", role: .cancel) {}
            Button("确认忘记", role: .destructive) { state.forgetLocalMemory(memoryID); dismiss() }
        } message: { Text("确认后从当前本地样例中删除。不会请求真实服务，也不会删除真实记忆。") }
    }
}

@MainActor
private struct NativeFrontendMemoryEditor: View {
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

    private var valid: Bool {
        let text = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let range = scope.trimmingCharacters(in: .whitespacesAndNewlines)
        return !text.isEmpty && text.count <= 500 && !range.isEmpty && range.count <= 200
    }

    var body: some View {
        NavigationStack {
            Form {
                NativeFrontendBoundary()
                Section("修正内容") {
                    TextField("旅行偏好", text: $title, axis: .vertical)
                        .accessibilityIdentifier("frontend.memory.title")
                    TextField("适用范围", text: $scope, axis: .vertical)
                        .accessibilityIdentifier("frontend.memory.scope")
                    Text("偏好 1–500 字，范围 1–200 字。保存前需确认，取消会保留原内容。")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if let error { Text(error).foregroundStyle(.red) }
                Button("查看修改并确认") { confirming = true }.disabled(!valid)
                    .accessibilityIdentifier("frontend.memory.reviewCorrection")
            }
            .navigationTitle("修正偏好").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } } }
            .alert("确认本地修正？", isPresented: $confirming) {
                Button("继续编辑", role: .cancel) {}
                Button("确认修正") {
                    if state.correctLocalMemory(memoryID, title: title, scope: scope) { dismiss() }
                    else { error = "内容无效或原偏好已不可用，未修改。" }
                }
            } message: {
                Text("原偏好：\(state.memories.first { $0.id == memoryID }?.title ?? "已不可用")\n新偏好：\(title)\n原范围：\(state.memories.first { $0.id == memoryID }?.scope ?? "已不可用")\n新范围：\(scope)\n仅修改本地样例。")
            }
        }
    }
}

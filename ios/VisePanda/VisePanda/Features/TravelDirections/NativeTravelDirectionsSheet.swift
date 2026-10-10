import SwiftUI

struct NativeTravelDirectionsSheet: View {
    let selection: NativeTravelDirectionsSelection
    let currentSelection: () -> NativeTravelDirectionsSelection?
    let originalRequest: String
    let session: NativeSession
    let chinese: Bool
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var phase
    let store: NativeTravelDirectionsIntakeStore
    @State private var values = NativeTravelDirectionsFormValues()
    @State private var formInitialized = false
    @State private var confirmReturn = false
    @State private var refresh = UUID()
    private struct Load: Equatable { let selection: NativeTravelDirectionsSelection?; let active: Bool; let refresh: UUID }
    private var authority: NativeTravelDirectionsSelection? {
        guard session.dataScope == selection.scope, let live = currentSelection(),
              selection.sameRequestContext(as: live) else { return nil }
        return live
    }
    private var current: NativeTravelDirectionsSelection? { phase == .active ? authority : nil }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let publication = store.publication, session.dataScope == selection.scope {
                        NativeTravelDirectionsResultView(artifactID: publication.artifactID, revision: publication.revision,
                            session: session, chinese: chinese)
                    } else {
                        if current != selection { Text(t("原输入或会话已变化。请返回对话重新选择，已填写字段暂时保留。", "The original input or session changed. Return to the conversation and choose again. Your entered fields are retained here.")) }
                        if store.notice != nil {
                            Text(t("当前依据或操作暂不可确认。请重新读取；未完成的请求只可明确重试。", "The current basis or action is unconfirmed. Reload, or explicitly retry an unfinished request."))
                        }
                        Button(t("重新核对当前依据", "Recheck the current basis")) { refresh = UUID() }
                            .disabled(store.busy || current == nil || store.pendingBody != nil)
                        NativeTravelDirectionsIntakeForm(originalRequest: originalRequest, chinese: chinese,
                            qualified: store.qualified(current), busy: store.busy,
                            savedPaceSummary: store.intake?.profilePace?.travelPace.map { t("本机保存节奏预览：\($0.label(chinese: true))", "Local saved pace preview: \($0.label(chinese: false))") },
                            values: $values, generate: {
                                Task {
                                    await store.submit(values: values, text: originalRequest, locale: chinese ? "zh" : "en", current: { current },
                                        post: { try await session.travelDirectionsActionRequest(action: "submit", body: $0) },
                                        read: { try await session.fiveResultRequest(artifactID: $0, revision: $1) },
                                        readIntake: { try await session.travelDirectionsReadRequest(kind: "intake", conversationID: $0, goalID: $1) })
                                }
                            })
                        if store.pendingBody != nil {
                            Button(t("重试同一次方向请求", "Retry the same directions request")) {
                                Task {
                                    await store.retry(current: { current }, post: { try await session.travelDirectionsActionRequest(action: "submit", body: $0) },
                                        read: { try await session.fiveResultRequest(artifactID: $0, revision: $1) },
                                        readIntake: { try await session.travelDirectionsReadRequest(kind: "intake", conversationID: $0, goalID: $1) })
                                }
                            }.disabled(store.busy || current == nil)
                        }
                    }
                }.padding()
            }
            .navigationTitle(t("旅行方向", "Travel directions"))
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(t("返回对话", "Return to conversation")) { confirmReturn = true }
                        .accessibilityIdentifier("directions.return")
                }
            }
            .interactiveDismissDisabled(store.busy)
            .confirmationDialog(t("返回对话？", "Return to the conversation?"), isPresented: $confirmReturn, titleVisibility: .visible) {
                Button(t("返回并放弃未保存填写", "Return and discard unsaved fields"), role: .destructive) { dismiss() }
                    .disabled(store.busy)
                Button(t("继续规划", "Keep planning"), role: .cancel) {}
            } message: {
                Text(t("原对话与输入锚点会保留。已发布的成果可以从资源库或本任务重新读取。尚未确认的请求需先明确重试。", "The original conversation and input anchor stay in place. Published results can be reloaded from Library or this task. Explicitly retry an unconfirmed request first."))
            }
            .task(id: Load(selection: authority, active: phase == .active, refresh: refresh)) {
                store.bind(session.dataScope == selection.scope ? selection : nil)
                guard current != nil, store.pendingBody == nil else { return }
                await store.load(current: { current }, read: { try await session.travelDirectionsReadRequest(kind: $0, conversationID: $1, goalID: $2) })
                if current != nil, store.qualified(current), !formInitialized {
                    if let intake = store.intake { values = .init(intake: intake.intake) }
                    formInitialized = true
                }
            }
        }
    }
}

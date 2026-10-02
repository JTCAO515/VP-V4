import SwiftUI

/// Prepared component for the qualified-intake entry. No executable work is admitted here.
struct NativeQualifiedDelegationView: View {
    let context: NativeQualifiedDelegationContext?
    let chinese: Bool
    @State private var store = NativeQualifiedDelegationStore()
    init(context: NativeQualifiedDelegationContext?, chinese: Bool, store: NativeQualifiedDelegationStore = NativeQualifiedDelegationStore()) {
        self.context = context; self.chinese = chinese; _store = State(initialValue: store)
    }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    var body: some View {
        Form {
            Section(t("明确委托比较", "Explicit comparison delegation")) {
                Text(t("比较执行能力尚未就绪。目前没有专用执行器或完成通道，因此不能发起工作。", "Comparison execution is not ready. There is no dedicated executor or completion channel, so work cannot be started."))
                    .accessibilityIdentifier("assistant.delegation.unavailable")
                Text(t("需求或授权发生变化时须重新核对；修改需求请先走旅行需求纠正流程。", "Recheck changed requirements or consent. Correct travel input in its existing editor first."))
                if let current = context, current.qualified {
                    Text(t("当前已核对输入修订 \(current.basis.intakeRevision)。这只说明输入资格，不表示已执行或已有成果。", "Input revision \(current.basis.intakeRevision) is qualified. This does not mean work ran or a result exists."))
                } else { Text(t("当前没有已核对完整需求与现行规划授权。", "Current complete requirements and planning consent are not qualified.")) }
                TextField(t("明确委托文本（草稿）", "Explicit delegation text (draft)"), text: $store.draft, axis: .vertical)
                    .lineLimit(2...6).accessibilityIdentifier("assistant.delegation.draft")
                Button(t("委托比较（尚未就绪）", "Delegate comparison (not ready)")) {}
                    .disabled(true).accessibilityIdentifier("assistant.delegation.submit")
                Text(t("不会自动保存 Memory、写入行程、预留预算或调用 provider。", "This does not save Memory, change a Trip, reserve budget, or call a provider."))
            }
        }
        .task(id: context) { store.bind(context) }
        .onChange(of: context) { _, value in store.bind(value) }
        .onDisappear { store.invalidate() }
    }
}

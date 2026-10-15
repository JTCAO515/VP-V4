import SwiftUI

/// Transient input and the original Trip proposal authority; never writes confirmed content locally.
struct NativeTripAddressEditor: View {
    let detail: NativeTripDetail
    let dayID: String
    let item: NativeTripItem
    let store: NativeTripStore
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var phase
    @Environment(\.dismiss) private var dismiss
    @State private var input: String
    @State private var clear = false
    @State private var preparedReference: String?
    @State private var submitted: NativeAddressOperationText?
    @State private var failed = false
    @State private var confirming = false
    @State private var confirmAttempted = false
    @State private var actor: NativeDataScope?
    private var chinese: Bool { settings.selectedLocale == .zh }
    private var session: NativeSession { settings.nativeSession }
    private func text(_ en: String, _ zh: String) -> String { chinese ? zh : en }
    init(detail: NativeTripDetail, dayID: String, item: NativeTripItem, store: NativeTripStore) {
        self.detail = detail; self.dayID = dayID; self.item = item; self.store = store
        _input = State(initialValue: item.userAddress?.text ?? "")
    }
    private var current: Bool {
        phase == .active && actor != nil && actor == session.dataScope && store.scope == actor
            && store.selectedID == detail.trip.id && store.detail?.trip.id == detail.trip.id
            && store.detail?.trip.headVersion == detail.trip.headVersion
            && store.detail?.confirmationState == "confirmed"
    }
    private var proposal: NativeTripPending.Proposal? {
        guard current, let pending = store.pending, pending.trip.id == detail.trip.id,
              pending.proposal.baseTripVersion == detail.trip.headVersion,
              let submitted, pending.proposal.patch.operations == [operation(submitted)],
              store.confirmationReference == preparedReference else { return nil }
        return pending.proposal
    }
    var body: some View {
        Form {
            Section(text("User-provided address", "用户补充地址")) {
                Text(item.title)
                Text(text("Provided by you · Unverified. Source references remain separate.", "用户提供 · 未核验；来源参考单独保留。"))
                    .font(.footnote).foregroundStyle(.secondary)
                TextEditor(text: $input).frame(minHeight: 120)
                    .disabled(preparedReference != nil || store.hasUncertainProposal || !current)
                    .accessibilityIdentifier("trip.address.input")
                if item.userAddress != nil {
                    Toggle(text("Remove this user-provided address", "移除此用户补充地址"), isOn: $clear)
                        .disabled(preparedReference != nil || store.hasUncertainProposal || !current)
                }
                Text(text("Up to 500 Unicode scalars and 1500 UTF-8 bytes. Your original text is retained.", "最多 500 个 Unicode 标量、1500 个 UTF-8 字节，保留输入原文。"))
                    .font(.caption)
                if preparedReference == nil && !confirmAttempted {
                    Button(text("Prepare proposal and review changes", "生成提议并审阅差异")) { Task { await prepare() } }
                        .disabled(!current || store.busy || (!clear && !NativeAddressText.valid(input)) || store.hasUncertainProposal)
                        .accessibilityIdentifier("trip.address.prepare")
                }
            }
            if let proposal, let submitted {
                Section(text("Original Trip proposal · Review changes", "原行程提议 · 审阅差异")) {
                    Text(text("Confirmed version: \(proposal.baseTripVersion)", "确认版本：\(proposal.baseTripVersion)"))
                    Text(text("Before", "原内容")).font(.caption)
                    Text(item.userAddress?.text ?? text("Not provided", "未提供")).textSelection(.enabled)
                    Text(text("After · Provided by you · Unverified", "新内容 · 用户提供 · 未核验")).font(.caption)
                    Text(afterText(submitted)).textSelection(.enabled)
                    Text(text("Proposal revision: \(proposal.revision)", "提议修订：\(proposal.revision)"))
                    Button(text("Confirm this exact proposal", "确认此提议")) { confirming = true }
                        .disabled(store.busy || proposal.stale || confirmAttempted || !store.canEdit)
                        .accessibilityIdentifier("trip.address.confirm")
                    if !confirmAttempted {
                        Button(text("Reject proposal; retain input", "拒绝提议并保留输入")) { Task {
                            await store.reject(using: session)
                            if store.pending == nil { preparedReference = nil; self.submitted = nil }
                        }}.disabled(store.busy)
                    }
                }
            }
            if confirmAttempted {
                Section {
                    Text(text("Confirmation sent. If its result is unknown, read the original proposal and receipt in Trip before any further confirmation. Input is retained here.", "已发送确认；结果未知时，请在行程页读取原提议和回执后再处理。此处保留输入。"))
                    Button(text("Read current Trip", "读取当前行程")) { Task { await store.reload(using: session) } }.disabled(store.busy)
                }
            }
            if store.hasUncertainProposal {
                Button(text("Read the original proposal", "读取原提议")) { Task { await prepare() } }
                    .disabled(!current || store.busy)
                Text(text("Proposal result unknown. Read the same request in Trip; do not submit a new address proposal.", "提议结果未知，请在行程页读取同一请求；勿另发地址提议。"))
            }
            if failed || store.notice != nil && store.notice != "reviewRequired" {
                Text(text("The operation is incomplete. Your input is retained; check the current Trip before continuing.", "操作尚未完成，输入已保留；请核对当前行程后继续。"))
            }
            if !current { Text(text("The account or confirmed Trip version changed. Reopen from the current Trip.", "账号或确认版本已变化，请从当前行程重新打开。")) }
        }
        .navigationTitle(text("Edit address", "编辑地址"))
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button(text("Close", "关闭")) { dismiss() } } }
        .task { if actor == nil { actor = session.dataScope } }
        .confirmationDialog(text("Apply this reviewed proposal?", "应用已审阅的提议？"), isPresented: $confirming, titleVisibility: .visible) {
            Button(text("Explicitly confirm", "明确确认")) { Task { await confirm() } }
            Button(text("Cancel", "取消"), role: .cancel) { }
        }
    }
    private func operation(_ value: NativeAddressOperationText) -> NativeTripOperation {
        .init(kind: .setChineseAddress, dayId: dayID, itemId: item.id, addressText: value)
    }
    private func afterText(_ value: NativeAddressOperationText) -> String {
        switch value { case .clear: text("Not provided", "未提供"); case .set(let value): value }
    }
    private func prepare() async {
        guard current else { return }
        let value: NativeAddressOperationText = clear ? .clear : .set(input)
        failed = false
        guard await store.prepareAddressProposal(expectedTripVersion: detail.trip.headVersion, dayID: dayID, itemID: item.id, value: value, using: session), current else { failed = true; return }
        submitted = value
        preparedReference = store.confirmationReference
    }
    private func confirm() async {
        guard current, proposal != nil, let reference = preparedReference, !confirmAttempted else { return }
        confirmAttempted = true
        await store.confirmAddressProposal(reviewedReference: reference, using: session)
        if store.notice == "confirmed", store.pending == nil, store.detail?.trip.id == detail.trip.id,
           store.detail?.trip.headVersion == detail.trip.headVersion + 1, store.scope == actor, session.dataScope == actor {
            dismiss()
        } else { failed = true }
    }
}

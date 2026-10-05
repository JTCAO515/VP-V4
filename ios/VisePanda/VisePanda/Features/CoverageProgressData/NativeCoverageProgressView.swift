import SwiftUI

struct NativeCoverageProgressView: View {
    let store: NativeCoverageProgressStore
    let client: NativeCoverageProgressClient
    let chinese: Bool
    let completed: (NativeCoverageProgressCompletion, NativeCommunitySafetyActor) -> Void
    @Environment(\.scenePhase) private var phase
    @Environment(\.dismiss) private var dismiss
    @State private var task: Task<Void, Never>?
    @State private var confirmation: NativeCoverageProgressBinding?
    private var actor: NativeCommunitySafetyActor? { phase == .active ? client.current() : nil }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }

    var body: some View {
        Form {
            Section {
                Text(t("选择当前账户的导出进度与围栏，包括仍保留的历史会话记录。每次最多选择 20 条。", "Select current-account export progress and fences, including retained historical-session records. Select up to 20 per operation."))
                Text(t("只清理所选临时进度；请求围栏与最小回执保留，直到原会话或账户撤销。行程、通知和其他原始资料不会删除。", "Clears selected transient progress. Request fences and minimal receipts remain until the original session or account is revoked. Trip, notification and other source data are retained."))
                Text(t("外部文件与备份不在此范围，不代表全账户数据完成。", "External files and backups are outside this scope. This does not complete all account data."))
            }
            Section(t("当前账户库存", "Current account inventory")) {
                Button(t("刷新清单", "Refresh inventory")) { run { await store.load(client: client) } }
                    .accessibilityIdentifier("coverageProgress.refresh")
                ForEach(store.visibleObjects(actor)) { row in
                    Button { store.toggle(row, actor: actor) } label: {
                        VStack(alignment: .leading) {
                            Label(row.domain == "collector" ? t("原导出进度", "Original export progress") : t("本出口处理记录", "Exit operation record"),
                                  systemImage: store.selected.contains(row.id) ? "checkmark.circle.fill" : "circle")
                            Text(row.id).font(.caption).textSelection(.enabled)
                            Text(state(row.state) + " · " + t("临时进度", "Transient progress") + " \(row.rows)").font(.caption)
                        }
                    }.disabled(store.pending != nil)
                }
                if store.next != nil {
                    Button(t("下一页（重新选择）", "Next page (select again)")) { run { await store.load(nextPage: true, client: client) } }
                }
                Button(t("预览所选全部字段", "Preview every selected field")) { run { await store.review(client: client) } }
                    .disabled(store.selected.isEmpty || store.pending != nil)
                    .accessibilityIdentifier("coverageProgress.preview")
            }.disabled(store.busy || actor == nil || !store.storageReady)
            if let preview = store.visiblePreview(actor) {
                Section(t("核对所选字段", "Review selected fields")) {
                    ForEach(preview.items) { item in
                        Text(item.id).font(.caption).textSelection(.enabled)
                        Text(item.fields).font(.caption.monospaced()).textSelection(.enabled)
                    }
                }
                Section(t("范围与保留边界", "Scope and retention boundaries")) {
                    Text(t("将导出所选原请求、各节进度、原围栏及本出口请求、页进度和最小回执的全部字段。擦除只清理所选原请求和各节、或本出口的临时页进度。永久围栏、选择与摘要及决策回执保留。", "Exports every field of selected original requests, section progress and fences, and exit requests, page progress and minimal receipts. Erasure clears selected original requests/sections or exit transient pages. Permanent fences, selections, digests and decision receipts remain."))
                    Button(t("明确确认并导出所选", "Confirm and export selected records")) {
                        run { await store.execute(action: "export", reviewed: preview.binding, client: client) }
                    }.accessibilityIdentifier("coverageProgress.export")
                    Button(t("擦除所选临时进度…", "Erase selected transient progress…"), role: .destructive) { confirmation = preview.binding }
                        .accessibilityIdentifier("coverageProgress.erase")
                }.disabled(store.busy)
            }
            if let pending = store.pendingCommand(actor) {
                Section(t("原操作结果待核验", "Original operation requires verification")) {
                    Text(pending.requestID ?? "").font(.caption).textSelection(.enabled)
                    ForEach(pending.objectIDs, id: \.self) { Text($0).font(.caption).textSelection(.enabled) }
                    Text(t("保留已确认的原操作字节。恢复只查询该操作，不重新擦除、不刷新期限。", "Retains the exact confirmed operation bytes. Recovery only queries that operation; it does not erase again or renew expiry."))
                    Button(t("核验原操作回执", "Verify original receipt")) { run { await store.recover(client: client) } }.disabled(store.busy || !store.storageReady)
                }
            }
            if let receipt = store.visibleReceipt(actor) {
                Section(t("所选清理回执", "Selected cleanup receipt")) {
                    Text(receipt.binding.requestID).font(.caption).textSelection(.enabled)
                    Text(t("已清理原请求 \(receipt.collectorRequests)、各节进度 \(receipt.collectorSections)、本出口页进度 \(receipt.exitPages)；保留围栏 \(receipt.retainedFences)。", "Cleared original requests \(receipt.collectorRequests), sections \(receipt.collectorSections), exit pages \(receipt.exitPages); retained fences \(receipt.retainedFences)."))
                }
            }
            if let url = store.exportURL(actor) {
                Section {
                    Text(t("所选文件已私有保存并核验，30 秒内可主动保存或分享。外部交付由你完成。", "Selected file is privately saved and verified; save or share within 30 seconds. You control external handoff."))
                    ShareLink(item: url) { Text(t("保存或分享已核验文件", "Save or share verified file")) }
                }
            }
            if let message = store.message { Text(status(message)) }
        }.navigationTitle(t("导出进度与请求围栏", "Export progress and request fences"))
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(t("完成", "Done")) { dismiss() } } }
            .confirmationDialog(t("确认擦除刚才核对的临时进度？", "Erase the transient progress just reviewed?"), isPresented: .init(get: { confirmation != nil }, set: { if !$0 { confirmation = nil } }), titleVisibility: .visible) {
                if let binding = confirmation {
                    Button(t("确认所选临时进度并擦除", "Confirm and erase selected transient progress"), role: .destructive) {
                        confirmation = nil; run { await store.execute(action: "erase", reviewed: binding, client: client) }
                    }
                }
            } message: { Text(t("保留原围栏、最小回执与原始资料；不报全账户完成。", "Retains original fences, minimal receipts and source data; no all-account completion.")) }
            .task(id: actor) {
                store.bind(actor)
                while !Task.isCancelled, actor != nil {
                    store.tick(client)
                    try? await Task.sleep(for: .seconds(1))
                }
            }
            .onChange(of: actor) { _, _ in task?.cancel(); confirmation = nil; store.bind(actor) }
            .onChange(of: phase) { _, value in if value != .active { task?.cancel(); confirmation = nil; store.suspend() } }
            .onDisappear { task?.cancel(); confirmation = nil; store.suspend() }
    }
    private func run(_ operation: @escaping () async -> Void) {
        task?.cancel()
        task = Task {
            await operation()
            guard !Task.isCancelled, let actor, let value = store.completion else { return }
            completed(value, actor)
        }
    }
    private func state(_ value: String) -> String {
        switch value { case "active": t("有临时进度", "Transient progress present"); case "erased": t("已清理、围栏保留", "Cleared, fences retained"); default: t("围栏保留", "Fences retained") }
    }
    private func status(_ value: String) -> String {
        switch value {
        case "file": t("私有文件已核验。", "Private file verified.")
        case "erased": t("所选临时进度回执已核验。", "Selected transient progress receipt verified.")
        case "unknown": t("原操作结果尚不确定，请核验原回执。", "Original operation outcome is uncertain; verify its receipt.")
        case "storage": t("私有存储或清理未通过；当前不可执行。", "Private storage or cleanup failed; actions are unavailable.")
        default: t("权限、范围、版本或期限未确认；请刷新后重新核对。", "Authority, scope, version or expiry is unconfirmed; refresh and review again.")
        }
    }
}

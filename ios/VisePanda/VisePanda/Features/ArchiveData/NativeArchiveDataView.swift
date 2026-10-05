import SwiftUI
import UIKit

struct NativeArchiveDataView: View {
    let store: NativeArchiveDataStore
    let client: NativeArchiveDataClient
    let chinese: Bool
    let completed: (NativeArchiveDataCompletion, NativeCommunitySafetyActor) -> Void
    let delete: (NativeLinkedTripDeleteSelection, NativeCommunitySafetyActor) -> Void
    @Environment(\.scenePhase) private var phase
    @State private var task: Task<Void, Never>?
    @State private var confirmation: NativeArchiveDataBinding?
    @State private var shareItem: NativeArchiveDataShareItem?
    private var actor: NativeCommunitySafetyActor? { phase == .active ? client.current() : nil }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    var body: some View {
        Section {
            Text(store.scope == .trip ? t("明确选择自己的一个已归档行程，核对版本后导出实际保存的资料。", "Explicitly select one of your archived Trips, review its version and export the stored data.") : t("选择自己的归档出口请求，包括仍保留的历史会话记录。每次最多 20 条。", "Select your archive exit requests, including retained historical-session records. Up to 20 per operation."))
            Text(t("归档状态保持不变；此处不恢复行程、不撤销已确认安排、不操作外部订单或支付。", "Archived state remains. This screen does not restore a Trip, reverse confirmed plans or operate external orders or payments."))
        }
        Section(t("当前账户清单", "Current account inventory")) {
            Button(t("刷新清单", "Refresh inventory")) { run { await store.load(client: client) } }.accessibilityIdentifier("archiveData.refresh")
            ForEach(store.visibleObjects(actor)) { row in
                Button { store.toggle(row, actor: actor); shareItem = nil } label: {
                    VStack(alignment: .leading) {
                        Label(row.trip?.title ?? row.id, systemImage: store.selected.contains(row.id) ? "checkmark.circle.fill" : "circle")
                        Text(row.id + (row.trip.map { " · v\($0.headVersion)" } ?? "")).font(.caption).textSelection(.enabled)
                        Text(NativeArchiveDataCopy.state(row.state, chinese: chinese)).font(.caption)
                        if row.progressErased { Text(t("分页进度已清理，最小请求围栏保留。", "Pagination progress cleared; minimal request fences remain.")).font(.caption) }
                    }
                }.disabled(store.pending != nil)
            }
            if store.next != nil { Button(t("下一页（重新选择）", "Next page (select again)")) { run { await store.load(nextPage: true, client: client) } } }
            Button(t("预览实际字段、保留与缺项", "Preview actual fields, retention and omissions")) { run { await store.review(client: client) } }
                .disabled(store.selected.isEmpty || store.pending != nil).accessibilityIdentifier("archiveData.preview")
            if let selection = store.deletionSelection(actor), let actor {
                Button(t("打开原行程删除范围预览…", "Open original Trip deletion scope preview…"), role: .destructive) {
                    store.suspend(); delete(selection, actor)
                }.accessibilityIdentifier("archiveData.tripDelete")
            }
        }.disabled(store.busy || actor == nil || !store.storageReady)
        if let preview = store.visiblePreview(actor) {
            Section(t("本次精确选择", "Exact selection for this operation")) {
                Text(preview.binding.requestID).font(.caption).textSelection(.enabled)
                if let id = preview.binding.tripID { Text(id + " · v\(preview.binding.tripVersion ?? 0)").font(.caption) }
                ForEach(preview.binding.objectIDs, id: \.self) { Text($0).font(.caption).textSelection(.enabled) }
                Text(t("行程 \(preview.counts["trip"] ?? 0)，已存快照 \(preview.counts["snapshots"] ?? 0)，状态操作 \(preview.counts["operations"] ?? 0)，出口请求 \(preview.counts["progress"] ?? 0)。", "Trips \(preview.counts["trip"] ?? 0), stored snapshots \(preview.counts["snapshots"] ?? 0), state operations \(preview.counts["operations"] ?? 0), exit requests \(preview.counts["progress"] ?? 0)."))
                if store.scope == .trip { Text(t("从未保存的版本：\(preview.snapshotVersionGaps)。", "Versions never stored: \(preview.snapshotVersionGaps).")) }
            }
            ForEach(["exportFields", "eraseFields", "retained", "missing"], id: \.self) { group in
                Section(boundaryTitle(group)) {
                    let codes = NativeArchiveDataWire.boundaries[store.scope]?[group] ?? []
                    if codes.isEmpty { Text(t("此出口不执行行程删除；使用上面的原删除预览。", "This exit does not delete Trips; use the original deletion preview above.")) }
                    ForEach(codes, id: \.self) { Text(NativeArchiveDataCopy.boundary($0, chinese: chinese)) }
                }
            }
            Section {
                Button(t("明确确认此版本并导出", "Confirm this version and export")) { run { await store.execute(action: "export", reviewed: preview.binding, client: client) } }
                    .accessibilityIdentifier("archiveData.export")
                if store.scope == .progress {
                    Button(t("清理所选临时分页进度…", "Clear selected transient pagination progress…"), role: .destructive) { confirmation = preview.binding }
                }
            }.disabled(store.busy)
        }
        if let pending = store.pendingCommand(actor) {
            Section(t("原操作结果待核验", "Original operation requires verification")) {
                Text(pending.requestID ?? "").font(.caption).textSelection(.enabled)
                Text(t("保留原确认字节；不会自动发起新操作或续期。", "Original confirmed bytes are retained. No new operation or expiry renewal starts automatically."))
                if pending.scope != store.scope { Text(t("请切换至此请求对应的资料范围。", "Switch to the data scope of this request.")) }
                else if pending.action == "erase" {
                    Button(t("只读核验原清理回执", "Read the original cleanup receipt")) { run { await store.resolve(client: client) } }
                } else {
                    Button(t("明确重送原导出请求", "Explicitly resend the original export request")) { run { await store.resolve(client: client, resend: true) } }
                    Button(t("放弃本机未确认导出，重新选择", "Discard the uncertain local export and select again")) { store.discardUncertainExport(actor: actor) }
                }
            }.disabled(store.busy || !store.storageReady)
        }
        if let receipt = store.visibleReceipt(actor) {
            Section(t("所选临时进度回执", "Selected transient-progress receipt")) {
                Text(receipt.binding.requestID).font(.caption).textSelection(.enabled)
                Text(t("已清理分页进度 \(receipt.clearedProgress)，保留请求围栏 \(receipt.retainedFences)。原行程及外部副本未删除。", "Cleared pagination progress \(receipt.clearedProgress); retained request fences \(receipt.retainedFences). Source Trip and external copies were not deleted."))
            }
        }
        if store.completion?.action == "export" {
            Section {
                Text(t("已核验并写入受保护的本机文件。每次保存或分享前会再次核对权限、源版本和期限；取消分享不表示外部已保存。", "Verified data was written to a protected local file. Authority, source version and expiry are checked again before each save or share. Cancelling sharing does not mean an external copy was saved."))
                Button(t("核对并保存或分享文件", "Validate and save or share the file")) {
                    run {
                        guard let captured = actor, let url = await store.share(client: client), actor == captured else { return }
                        shareItem = .init(url: url)
                    }
                }.disabled(store.busy).accessibilityIdentifier("archiveData.share")
            }
        }
        if let message = store.message { Section { Text(status(message)) } }
        Color.clear.frame(height: 0)
            .confirmationDialog(t("确认清理刚才核对的临时进度？", "Clear the transient progress just reviewed?"), isPresented: .init(get: { confirmation != nil }, set: { if !$0 { confirmation = nil } }), titleVisibility: .visible) {
                if let binding = confirmation { Button(t("明确确认并清理", "Confirm and clear"), role: .destructive) { confirmation = nil; run { await store.execute(action: "erase", reviewed: binding, client: client) } } }
            }
            .sheet(item: $shareItem) { item in NativeArchiveDataShare(url: item.url) }
            .task(id: actor) {
                store.bind(actor)
                while !Task.isCancelled, actor != nil {
                    await store.tick(client: client)
                    if store.completion == nil { shareItem = nil }
                    try? await Task.sleep(for: .seconds(1))
                }
            }
            .onChange(of: actor) { _, _ in task?.cancel(); confirmation = nil; shareItem = nil; store.bind(actor) }
            .onChange(of: phase) { _, value in if value != .active { task?.cancel(); confirmation = nil; shareItem = nil; store.suspend() } }
            .onDisappear { task?.cancel(); confirmation = nil; shareItem = nil; store.suspend() }
    }
    private func run(_ operation: @escaping () async -> Void) {
        task?.cancel(); task = Task {
            await operation()
            guard !Task.isCancelled, let actor, let result = store.completion else { return }
            completed(result, actor)
        }
    }
    private func boundaryTitle(_ group: String) -> String {
        switch group { case "exportFields": t("实际可导出字段", "Actual export fields"); case "eraseFields": t("可清理范围", "Cleanup scope"); case "retained": t("保留项", "Retained data"); default: t("缺项与范围外资料", "Omissions and data outside this scope") }
    }
    private func status(_ value: String) -> String {
        switch value {
        case "file": t("私有文件已核验。", "Private file verified.")
        case "erased": t("所选临时进度回执已核验。", "Selected transient-progress receipt verified.")
        case "unknown": t("原操作结果尚不确定，请核验同一请求。", "Original operation outcome is uncertain. Verify the same request.")
        case "storage": t("私有存储或清理失败，当前不可继续交付。", "Private storage or cleanup failed. Delivery is unavailable.")
        default: t("权限、源版本或期限未确认，请刷新后重新核对。", "Authority, source version or expiry is unconfirmed. Refresh and review again.")
        }
    }
}
private struct NativeArchiveDataShareItem: Identifiable { let id = UUID(); let url: URL }
private struct NativeArchiveDataShare: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: [url], applicationActivities: nil) }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

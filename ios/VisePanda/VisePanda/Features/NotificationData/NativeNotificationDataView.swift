import SwiftUI

struct NativeNotificationDataView: View {
    let store: NativeNotificationDataStore
    let client: NativeNotificationDataClient
    let chinese: Bool
    let completed: (NativeNotificationDataCompletion, NativeCommunitySafetyActor) -> Void
    @Environment(\.scenePhase) private var phase
    @State private var actionTask: Task<Void, Never>?
    @State private var reviewedErase: NativeNotificationDataBinding?
    private var actor: NativeCommunitySafetyActor? { phase == .active ? client.current() : nil }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }

    var body: some View {
        Form {
            if let pending = store.pendingCommand(actor) {
                Section(t("恢复原擦除操作", "Recover original erasure")) {
                    Text(NativeNotificationDataCopy.title(pending.scope, chinese: chinese))
                    Text(pending.requestID ?? "").font(.caption).textSelection(.enabled)
                    ForEach(pending.objectIDs, id: \.self) { Text($0).font(.caption) }
                    Text(t("原操作回执未知。只读取原回执，不重新擦除；关闭页面仍保留恢复记录。", "The original receipt is unknown. Recovery reads it without executing erasure again. Closing keeps the recovery record."))
                    Button(t("读取原操作回执", "Read original receipt")) { run { await store.recover(client: client) } }
                        .disabled(store.busy || actor == nil || !store.storageReady)
                }
            }
            Section(t("明确选择本人通知资料", "Explicitly select your notification data")) {
                Text(NativeNotificationDataCopy.scope(store.scope, chinese: chinese))
                Button(t("读取当前本人记录", "Read current owned records")) { run { await store.load(client: client) } }
                    .disabled(store.busy || actor == nil || !store.storageReady)
                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    ForEach(store.visibleObjects(actor)) { object in
                        Button { store.toggle(object, actor: actor); reviewedErase = nil } label: {
                            VStack(alignment: .leading) {
                                Text(object.label ?? NativeNotificationDataCopy.title(store.scope, chinese: chinese))
                                Text(object.id).font(.caption)
                                Text(NativeNotificationDataCopy.state(object.state, chinese: chinese))
                                Text(t("资料行数：", "Data rows: ") + String(object.rows)).font(.caption)
                                if store.selectedIDs.contains(object.id) { Image(systemName: "checkmark") }
                            }
                        }.disabled(store.busy || store.pending != nil)
                    }
                    if store.next != nil, !store.visibleObjects(actor).isEmpty {
                        Button(t("明确读取下一页", "Explicitly read next page")) { run { await store.load(nextPage: true, client: client) } }
                            .disabled(store.busy)
                    }
                    Button(t("预览所选全部字段和保留范围", "Preview all selected fields and retained scope")) { run { await store.review(client: client) } }
                        .disabled(store.busy || store.pending != nil || store.selectedIDs.isEmpty || store.visibleObjects(actor).isEmpty)
                }
            }
            TimelineView(.periodic(from: .now, by: 1)) { _ in
                if let preview = store.visiblePreview(actor) { review(preview) }
                if let receipt = store.visibleReceipt(actor) {
                    Section(t("所选范围的擦除回执", "Erasure receipt for selected scope")) {
                        Text(NativeNotificationDataCopy.title(receipt.binding.scope, chinese: chinese))
                        Text(receipt.binding.requestID).font(.caption).textSelection(.enabled)
                        Text(t("原授权提交时间：", "Original authorization committed: "))
                        Text(receipt.committedAt, style: .time)
                        Text(t("擦除最终回执时间：", "Erasure finalized: "))
                        Text(receipt.decidedAt, style: .time)
                        if let proof = receipt.drainProof {
                            Text(t("发送租约的单调时钟等待已核验：", "Verified monotonic dispatch wait: ") + String(proof.waitMS) + " ms")
                        }
                        ForEach(NativeNotificationDataProtocol.countNames, id: \.self) { key in
                            Text(NativeNotificationDataCopy.field(key, chinese: chinese) + ": " + String(receipt.counts[key] ?? 0))
                        }
                        Text(t("发送租约已处理至：", "Dispatch leases drained through: "))
                        Text(receipt.drainedThrough, style: .time)
                        boundaryRows(receipt.binding.boundaries.retained)
                        boundaryRows(receipt.binding.boundaries.missing)
                    }
                }
                if let file = store.exportURL(actor) {
                    Section(t("已核验私有文件", "Verified private file")) {
                        ShareLink(item: file) { Text(t("明确保存或分享通知资料", "Explicitly save or share notification data")) }
                        Text(t("服务器资料已完整核验并写入受保护文件。系统交付由你主动完成；取消分享不表示外部保存成功。", "Server data is fully validated in a protected file. You initiate system handoff; cancelling does not prove an external copy was saved."))
                    }
                }
            }
            if let message = store.message { Text(NativeNotificationDataCopy.message(message, chinese: chinese)) }
            if !store.storageReady, actor != nil {
                Button(t("重试私有文件清理", "Retry private file cleanup")) { store.retryCleanup(client) }.disabled(store.busy)
            }
            Section {
                Text(t("只处理明确选定的通知资料。原行程和业务成果保留；已发送的 provider 副本、系统通知、本机旧日志与外部文件不由此服务器擦除。", "Handles only explicitly selected notification data. Trips and business results remain. Provider copies, delivered device notifications, old device journals and external files are outside this server erasure."))
                Text(t("临时预览和文件在退出、后台或到期时清理。未知 provider 回执不会被标为已召回。", "Temporary previews and files clear on exit, backgrounding or expiry. Unknown provider acknowledgements are never marked recalled."))
            }
        }
        .navigationTitle(NativeNotificationDataCopy.title(store.scope, chinese: chinese))
        .task(id: actor) {
            store.bind(actor)
            while actor != nil, !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                if !Task.isCancelled { store.tick(client) }
            }
        }
        .onChange(of: actor) { _, next in actionTask?.cancel(); reviewedErase = nil; store.bind(next) }
        .onChange(of: phase) { _, next in if next != .active { hide() } }
        .onDisappear { hide() }
        .onChange(of: store.completion?.id) { _, _ in
            guard let value = store.completion, let actor else { return }
            if value.action == "export", store.exportURL(actor) == nil { return }
            if value.action == "delete", store.visibleReceipt(actor) == nil { return }
            completed(value, actor)
        }
        .confirmationDialog(t("确认擦除刚才预览的所选通知资料？", "Erase the selected notification data you reviewed?"),
            isPresented: Binding(get: { reviewedErase != nil }, set: { if !$0 { reviewedErase = nil } }), titleVisibility: .visible) {
                if let reviewedErase {
                    Button(t("确认原操作并擦除所选资料", "Confirm original operation and erase selected data"), role: .destructive) {
                        run { await store.execute(action: "erase", reviewed: reviewedErase, client: client) }
                        self.reviewedErase = nil
                    }
                }
            } message: {
                if let reviewedErase {
                    Text((reviewedErase.requestID + "\n" + reviewedErase.objectIDs.joined(separator: "\n")) + "\n" +
                        t("只擦除预览中的服务器资料；必要防重放记录保留。排队与已领发送由服务器围栏处理，已发送副本无法召回。", "Erases only server data in the preview; replay fences remain. Server fencing handles queued and claimed dispatch. Delivered copies cannot be recalled."))
                }
            }
    }

    @ViewBuilder private func review(_ preview: NativeNotificationDataPreview) -> some View {
        Section(t("核对原操作、全部字段和边界", "Review original operation, all fields and boundaries")) {
            Text(preview.binding.requestID).font(.caption).textSelection(.enabled)
            ForEach(preview.items) { item in
                DisclosureGroup(item.id) {
                    ForEach(item.fields) { field in
                        VStack(alignment: .leading) {
                            Text(NativeNotificationDataCopy.field(field.name, chinese: chinese)).font(.headline)
                            Text(field.value).font(.caption).textSelection(.enabled)
                        }
                    }
                }
            }
            Text(t("导出字段", "Exported fields")).font(.headline)
            boundaryRows(preview.binding.boundaries.exportFields)
            Text(t("擦除字段", "Erased fields")).font(.headline)
            boundaryRows(preview.binding.boundaries.eraseFields)
            Text(t("必要保留", "Required retention")).font(.headline)
            boundaryRows(preview.binding.boundaries.retained)
            Text(t("外部副本与未包含范围", "External copies and excluded scope")).font(.headline)
            boundaryRows(preview.binding.boundaries.missing)
            Button(t("确认此预览并导出", "Confirm this preview and export")) {
                run { await store.execute(action: "export", reviewed: preview.binding, client: client) }
            }.disabled(store.busy || store.pending != nil)
            Button(t("核对原操作后擦除…", "Review original operation and erase…"), role: .destructive) { reviewedErase = preview.binding }
                .disabled(store.busy || store.pending != nil)
        }
    }
    @ViewBuilder private func boundaryRows(_ names: [String]) -> some View {
        ForEach(names, id: \.self) { Text(NativeNotificationDataCopy.field($0, chinese: chinese)) }
    }
    private func hide() { actionTask?.cancel(); actionTask = nil; reviewedErase = nil; store.suspend() }
    private func run(_ operation: @escaping @MainActor () async -> Void) { actionTask?.cancel(); actionTask = Task { await operation() } }
}

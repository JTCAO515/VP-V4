import SwiftUI

struct NativeMaterialReferenceView: View {
    let store: NativeMaterialReferenceStore
    let trips: NativeMaterialReferenceTrips
    let client: NativeMaterialReferenceClient
    let chinese: Bool
    let completed: (NativeMaterialReferenceCompletion, NativeCommunitySafetyActor) -> Void
    @Environment(\.scenePhase) private var phase
    @State private var actionTask: Task<Void, Never>?
    @State private var reviewedErase: NativeMaterialReferenceBinding?
    private var actor: NativeCommunitySafetyActor? { phase == .active ? client.current() : nil }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }

    var body: some View {
        Form {
            if let pending = store.pendingCommand(actor), let pendingTrip = pending.tripID {
                Section(t("恢复原擦除操作", "Recover the original erasure")) {
                    Text(NativeMaterialReferenceCopy.title(pending.scope, chinese: chinese))
                    Text(pendingTrip).font(.caption).textSelection(.enabled)
                    ForEach(pending.objectIDs, id: \.self) { Text($0).font(.caption).textSelection(.enabled) }
                    Text(t("已有未知回执。关闭页面不会抹掉原操作记录；读取回执不会重新执行擦除。", "An operation has an unknown receipt. Closing this screen retains its recovery record. Reading the receipt does not execute erasure again."))
                    Button(t("读取原操作回执", "Read original operation receipt")) { run { await store.recover(client: client) } }
                        .disabled(store.busy || actor == nil || !store.storageReady)
                }
            }
            Section(t("从自己的行程明确选择", "Explicitly select from your Trips")) {
                Button(t("读取本模块关联的行程与历史记录", "Read Trips and historical contexts for this module")) {
                    store.clearSelection()
                    run { await trips.load(scope: store.scope, client: client) }
                }.disabled(store.busy || trips.busy || actor == nil)
                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    ForEach(trips.visible(actor)) { trip in
                        Button((trip.label ?? t("原行程名称不可得", "Original Trip title unavailable")) + " · v\(trip.headVersion)") { select(trip) }
                            .disabled(store.busy || trips.busy)
                        Text(NativeMaterialReferenceCopy.tripState(trip.state, chinese: chinese)).font(.caption)
                    }
                    if let trip = trips.currentSelection(actor) {
                        Text((trip.label ?? t("原行程名称不可得", "Original Trip title unavailable")) + " · v\(trip.headVersion)").font(.headline)
                        Text(trip.id).font(.caption).textSelection(.enabled)
                    }
                    if trips.next != nil, !trips.visible(actor).isEmpty {
                        Button(t("明确读取下一页关联行程", "Explicitly read the next Trip context page")) {
                            store.clearSelection()
                            run { await trips.load(scope: store.scope, nextPage: true, client: client) }
                        }.disabled(store.busy || trips.busy)
                    }
                }
                if trips.unavailable { Text(t("行程列表或所选行程不可读。没有猜测对象或执行擦除。", "The Trip list or selected Trip is unreadable. No object was guessed or erased.")) }
            }
            objectSelection
            TimelineView(.periodic(from: .now, by: 1)) { _ in
                if let preview = store.visiblePreview(actor) { review(preview) }
                if let receipt = store.visibleReceipt(actor) {
                    Section(t("所选范围的真实擦除回执", "Erasure receipt for the selected scope")) {
                        Text(receipt.binding.requestID).font(.caption).textSelection(.enabled)
                        Text(t("已处理对象：", "Objects processed: ") + String(receipt.objects))
                        Text(t("已清理临时记录：", "Temporary records cleared: ") + String(receipt.temporaryRecords))
                        Text(t("已清理未确认候选：", "Unapplied candidates cleared: ") + String(receipt.unappliedProposals))
                        boundaryRows(receipt.binding.boundaries.retained)
                        boundaryRows(receipt.binding.boundaries.missing)
                    }
                }
                if let file = store.exportURL(actor) {
                    Section(t("已核验私有文件", "Verified private file")) {
                        ShareLink(item: file) { Text(t("明确保存或分享导出文件", "Explicitly save or share the export file")) }
                        Text(t("本机临时副本会在关闭、退出或期限到达后清理；外部已保存副本无法召回。", "The temporary device copy is removed on close, sign-out or expiry. Externally saved copies cannot be recalled."))
                    }
                }
            }
            if let message = store.message { Section { Text(NativeMaterialReferenceCopy.message(message, chinese: chinese)) } }
            if !store.storageReady, actor != nil {
                Button(t("重试本机私有文件清理", "Retry private device file cleanup")) { store.retryCleanup(client) }.disabled(store.busy)
            }
            Section {
                Text(t("此页面只处理所选资料范围，不代表全账户数据完成。不会联系订单供应商、取消订单、退款或撤销已确认的行程。", "This screen handles only the selected data scope and does not complete all account data. It does not contact suppliers, cancel reservations, refund charges or undo confirmed Trips."))
            }
        }
        .navigationTitle(NativeMaterialReferenceCopy.title(store.scope, chinese: chinese))
        .task(id: actor) {
            store.bind(actor)
            while actor != nil, !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                if !Task.isCancelled { store.tick(client) }
            }
        }
        .onChange(of: actor) { _, next in actionTask?.cancel(); trips.clear(); reviewedErase = nil; store.bind(next) }
        .onChange(of: phase) { _, next in if next != .active { hide() } }
        .onDisappear { hide() }
        .onChange(of: store.completion?.id) { _, _ in
            guard let value = store.completion, let actor else { return }
            if value.action == "export", store.exportURL(actor) == nil { return }
            if value.action == "delete", store.visibleReceipt(actor) == nil { return }
            completed(value, actor)
        }
        .confirmationDialog(t("确认擦除已预览的所选资料？", "Erase the selected data you reviewed?"),
            isPresented: Binding(get: { reviewedErase != nil }, set: { if !$0 { reviewedErase = nil } }), titleVisibility: .visible) {
                if let reviewedErase {
                    Button(t("确认并擦除此所选范围", "Confirm and erase this selected scope"), role: .destructive) {
                        run { await store.execute(action: "erase", reviewed: reviewedErase, client: client) }; self.reviewedErase = nil
                    }
                }
            } message: {
                Text(t("只清理预览中选定的服务器资料。必要的防重放记录与原已确认行程保留，外部文件和订单不在此范围。", "Clears only selected server data shown in the preview. Required replay fences and confirmed Trips remain. External files and reservations are outside this scope."))
            }
    }

    private var objectSelection: some View {
        Section(t("明确选择资料记录", "Explicitly select data records")) {
            TimelineView(.periodic(from: .now, by: 1)) { _ in
                ForEach(store.visibleObjects(actor)) { object in
                    Button { store.toggle(object, actor: actor); reviewedErase = nil } label: {
                        VStack(alignment: .leading) {
                            Text(object.label ?? NativeMaterialReferenceCopy.title(store.scope, chinese: chinese))
                            Text(object.id).font(.caption)
                            Text(NativeMaterialReferenceCopy.state(object.sourceState, chinese: chinese)).font(.caption)
                            if store.selectedIDs.contains(object.id) { Image(systemName: "checkmark") }
                        }
                    }.disabled(store.busy || store.pending != nil)
                }
                if store.next != nil, let trip = trips.currentSelection(actor) {
                    Button(t("明确读取下一页记录", "Explicitly read the next record page")) { run { await store.load(trip: trip, nextPage: true, client: client) } }.disabled(store.busy)
                }
                Button(t("预览所选字段与擦除范围", "Preview selected fields and erasure scope")) { run { await store.review(client: client) } }
                    .disabled(store.busy || store.selectedIDs.isEmpty || store.pending != nil || actor == nil)
            }
        }
    }

    private func review(_ preview: NativeMaterialReferencePreview) -> some View {
        Section(t("核对字段与处理范围", "Review fields and operation scope")) {
            Text(preview.binding.tripID + " · v\(preview.binding.tripVersion)").font(.caption).textSelection(.enabled)
            ForEach(preview.items) { item in
                Text(item.id).font(.caption).textSelection(.enabled)
                ForEach(item.fields) { field in
                    LabeledContent(NativeMaterialReferenceCopy.field(field.name, chinese: chinese)) {
                        if ["originalState", "state"].contains(field.name) { Text(NativeMaterialReferenceCopy.state(field.value, chinese: chinese)) }
                        else { Text(field.value).textSelection(.enabled) }
                    }
                }
            }
            Text(t("导出包括", "Export includes")).font(.headline)
            boundaryRows(preview.binding.boundaries.exportFields)
            Text(t("擦除包括", "Erasure includes")).font(.headline)
            boundaryRows(preview.binding.boundaries.eraseFields)
            Text(t("保留", "Retained")).font(.headline)
            boundaryRows(preview.binding.boundaries.retained)
            Text(t("此范围之外或尚未核验", "Outside this scope or unverified")).font(.headline)
            boundaryRows(preview.binding.boundaries.missing)
            Button(t("确认此范围并生成私有导出文件", "Confirm this scope and create a private export file")) {
                run { await store.execute(action: "export", reviewed: preview.binding, client: client) }
            }.disabled(store.busy || store.pending != nil)
            Button(t("擦除已预览的所选资料…", "Erase selected reviewed data…"), role: .destructive) { reviewedErase = preview.binding }
                .disabled(store.busy || store.pending != nil)
        }
    }
    private func boundaryRows(_ values: [String]) -> some View {
        ForEach(values, id: \.self) { Text(NativeMaterialReferenceCopy.boundary($0, chinese: chinese)).font(.footnote) }
    }
    private func select(_ trip: NativeMaterialReferenceTrip) {
        guard let actor else { return }
        reviewedErase = nil
        trips.select(trip, current: actor)
        run {
            if let current = trips.currentSelection(self.actor) { await store.load(trip: current, client: client) }
        }
    }
    private func run(_ work: @escaping @MainActor () async -> Void) { actionTask?.cancel(); actionTask = Task { await work() } }
    private func hide() { actionTask?.cancel(); trips.clear(); reviewedErase = nil; store.suspend() }
}

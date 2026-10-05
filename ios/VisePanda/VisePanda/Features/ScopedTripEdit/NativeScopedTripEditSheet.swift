import SwiftUI

struct NativeScopedTripEditSheet: View {
    let selection: NativeScopedTripSelection
    let tripStore: NativeTripStore
    let session: NativeSession
    let chinese: Bool
    let onReview: (NativeScopedTripSelection) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var store = NativeScopedTripEditStore()
    @State private var reservationItems: [String: String] = [:]
    @State private var question = ""
    @State private var selectedItem = ""
    @State private var targetDay = ""
    @State private var start = Date()
    @State private var end = Date()
    @State private var hasStart = false
    @State private var hasEnd = false
    @State private var order: [String] = []
    @State private var lockItem: String?
    @State private var abandonVisible = false
    private func t(_ en: String, _ zh: String) -> String { chinese ? zh : en }
    private var current: Bool {
        scenePhase == .active && tripStore.scope == selection.actor && tripStore.canEdit
        && selection.isCurrent(actor: session.dataScope, detail: tripStore.detail)
        && tripStore.draft == nil && !tripStore.hasUncertainProposal
    }
    private var items: [NativeTripItem] { store.context?.snapshot.days.flatMap(\.items) ?? [] }
    private var selectedItems: [NativeTripItem] { items.filter { store.context?.selectedItemIDs.contains($0.id) == true } }

    var body: some View {
        NavigationStack {
            Form {
                Section(t("Selected confirmed scope", "选中的已确认范围")) {
                    Text(selection.itemID == nil ? t("One day", "一天") : t("One item", "一个项目"))
                    Text(tripStore.detail?.content.days.first(where: { $0.id == selection.dayID })?.date ?? selection.dayID)
                    if let itemID = selection.itemID { Text(items.first(where: { $0.id == itemID })?.title ?? t("Selected item", "所选项目")) }
                    Text(t("Version \(selection.headVersion). Other objects stay unchanged.", "版本 \(selection.headVersion)。其他对象保持不动。"))
                }
                if !current {
                    Text(t("This scope changed. Return and select its current version again.", "选区依据已变化。请返回并重新选择当前版本。"))
                        .accessibilityIdentifier("trip.scoped.stale")
                } else {
                    if let notice = store.notice { Text(message(notice)).accessibilityIdentifier("trip.scoped.notice") }
                    if store.busy { ProgressView() }
                    Button(t("Refresh scope and protection", "刷新选区与保护事项")) { Task { await reload() } }
                        .disabled(store.busy).accessibilityIdentifier("trip.scoped.refresh")
                    if let journal = store.journal {
                        recovery(journal)
                    } else if let candidates = store.candidates {
                        choices(candidates)
                    } else if let receipt = store.receipt {
                        candidate(receipt)
                    } else if let required = store.bindingRequired {
                        reservationBinding(required)
                    } else if let context = store.context {
                        TimelineView(.periodic(from: .now, by: 1)) { _ in
                            Group {
                                protections(context)
                                ask(context)
                                manual(context)
                            }.disabled(!context.current || store.busy)
                        }
                    }
                }
            }
            .navigationTitle(t("Edit this scope with VP", "与 VP 局部改稿"))
            .toolbar { ToolbarItem(placement: .cancellationAction) {
                Button(t("Return to selected object", "返回所选对象")) { dismiss() }
                    .accessibilityIdentifier("trip.scoped.close")
            } }
        }
        .task(id: selection.id) { await reload() }
        .onChange(of: scenePhase) { _, phase in if phase != .active { store.suspend() } }
        .onChange(of: session.dataScope) { _, _ in store.suspend() }
        .onChange(of: tripStore.detail?.trip.headVersion) { _, _ in store.suspend() }
        .confirmationDialog(t("Change this item's protection?", "更改此项目的保护？"), isPresented: Binding(get: { lockItem != nil }, set: { if !$0 { lockItem = nil } }), titleVisibility: .visible) {
            if let id = lockItem, let context = store.context {
                Button(context.lockedItemIDs.contains(id) ? t("Unlock item", "解除硬锁") : t("Lock item", "锁定项目")) {
                    Task { await store.send(action: "lock", fields: ["itemId": id, "locked": !context.lockedItemIDs.contains(id)], selection: selection, session: session, current: { current }); if store.journal == nil { await reload() } }
                }
            }
            Button(t("Keep current protection", "保留当前保护"), role: .cancel) { lockItem = nil }
        } message: { Text(t("A hard lock prevents later edits. An ordinary manual edit does not create a lock. This does not change an external order.", "硬锁会阻止后续修改；普通手动编辑不会自动加锁。此操作不改变外部订单。")) }
        .confirmationDialog(t("Stop this same pending operation?", "停止这一未决操作？"), isPresented: $abandonVisible, titleVisibility: .visible) {
            Button(t("Fence pending operation", "停止未决操作"), role: .destructive) { Task { await recover("abandon") } }
            Button(t("Keep waiting", "继续等待"), role: .cancel) {}
        } message: { Text(t("The server stops a late request if it has not committed. An existing proposal or confirmed Trip is retained. External orders are unchanged.", "若尚未提交，服务端会阻止迟到请求；已有提议或已确认行程保留。外部订单不变。")) }
    }

    private func reservationBinding(_ required: NativeScopedTripBindingRequired) -> some View {
        Section(t("Preserve confirmed reservations", "保留已确认预订")) {
            Text(t("Choose the actual Trip item for each current reservation reference. Titles do not establish a link. These are user reported references, not supplier verification.", "请为每份当前预订参考明确选择对应行程项目。名称不能证明关联；这些是用户报告参考，并非供应商验证。"))
            ForEach(required.reservations) { reference in
                VStack(alignment: .leading) {
                    Text(reference.fields.title).font(.headline)
                    Text("\(reference.fields.status) · \(reference.fields.startsAt ?? "") · \(reference.fields.address ?? "")")
                        .font(.caption)
                    Picker(t("Item to preserve", "要保留的项目"), selection: Binding(get: { reservationItems[reference.referenceId] ?? "" }, set: { reservationItems[reference.referenceId] = $0 })) {
                        Text(t("Choose explicitly", "明确选择")).tag("")
                        ForEach(tripStore.detail?.content.days.flatMap(\.items) ?? []) { Text($0.title).tag($0.id) }
                    }
                }
            }
            Button(t("Review these links and prepare scope", "核对这些关联并准备选区")) {
                let bindings = required.reservations.compactMap { ref -> NativeScopedTripReservationBinding? in
                    guard let item = reservationItems[ref.referenceId], !item.isEmpty else { return nil }
                    return .init(itemId: item, referenceId: ref.referenceId, referenceRevision: ref.revision)
                }
                Task { await reload(bindings: bindings) }
            }.disabled(store.busy || required.reservations.contains { reservationItems[$0.referenceId]?.isEmpty != false })
                .accessibilityIdentifier("trip.scoped.reservations.bind")
        }
    }

    private func protections(_ context: NativeScopedTripContext) -> some View {
        Section(t("Preserved and protected", "保留与保护事项")) {
            ForEach(selectedItems) { item in
                HStack {
                    VStack(alignment: .leading) {
                        Text(item.title)
                        if context.fixedItemIDs.contains(item.id) { Text(t("Linked confirmed reservation · preserved", "已关联确认预订 · 保留")).font(.caption) }
                        else if context.lockedItemIDs.contains(item.id) { Text(t("User hard lock · preserved", "用户硬锁 · 保留")).font(.caption) }
                        else { Text(t("Editable; manual editing does not lock it", "可编辑；手动修改不会加锁")).font(.caption) }
                    }
                    Spacer()
                    Button(context.lockedItemIDs.contains(item.id) ? t("Unlock", "解锁") : t("Lock", "锁定")) { lockItem = item.id }
                        .disabled(context.fixedItemIDs.contains(item.id))
                        .accessibilityIdentifier("trip.scoped.lock.\(item.id)")
                }
            }
            Text(t("Only explicitly linked reservation sources are protected as fixed. Missing links do not prove there is no order.", "仅明确关联的预订来源作为固定事项保护；缺少关联不代表没有订单。"))
                .font(.footnote)
        }
    }
    private func ask(_ context: NativeScopedTripContext) -> some View {
        Section(t("Ask VP about this scope", "向 VP 提问此选区")) {
            TextField(t("Describe the change you want", "描述你想怎样修改"), text: $question, axis: .vertical)
                .accessibilityIdentifier("trip.scoped.ask.input")
            Text(t("Sending uses your existing VP execution and consent. A candidate is separate from confirmation; source and transfer checks may remain pending.", "发送使用现有 VP 执行与同意范围。候选与确认分开；来源、时间接驳可能仍待核。"))
                .font(.footnote)
            Button(t("Send selected scope to VP", "将选区发送给 VP")) {
                Task { await store.send(action: "ask", fields: ["text": question], selection: selection, session: session, current: { current }) }
            }.disabled(question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || question.utf16.count > 4000 || context.editableItemIDs.isEmpty)
                .accessibilityIdentifier("trip.scoped.ask.send")
        }
    }
    private func manual(_ context: NativeScopedTripContext) -> some View {
        Section(t("Manual edit · review a proposal before saving", "手动编辑 · 保存前审阅提议")) {
            Picker(t("Item", "项目"), selection: $selectedItem) {
                ForEach(selectedItems.filter { context.editableItemIDs.contains($0.id) }) { Text($0.title).tag($0.id) }
            }.onChange(of: selectedItem) { _, _ in bindTimes() }
            if !selectedItem.isEmpty {
                Picker(t("Move to day", "移至日期"), selection: $targetDay) {
                    Text(t("Choose another day", "选择另一日期")).tag("")
                    ForEach(context.snapshot.days.filter { $0.id != items.first(where: { $0.id == selectedItem })?.dayId }) { Text($0.date).tag($0.id) }
                }
                Button(t("Review move", "审阅移日")) { Task { await manualSend(["kind": "move_item", "itemId": selectedItem, "toDayId": targetDay]) } }
                    .disabled(targetDay.isEmpty).accessibilityIdentifier("trip.scoped.move")
                Text(t("Moving keeps the item's times. Review whether they still fit the destination date.", "移日保留项目原时间，请审阅其是否仍适合目标日期。"))
                    .font(.footnote)
                Toggle(t("Set start time", "设置开始时间"), isOn: $hasStart)
                if hasStart { DatePicker(t("Start", "开始"), selection: $start) }
                Toggle(t("Set end time", "设置结束时间"), isOn: $hasEnd)
                if hasEnd { DatePicker(t("End", "结束"), selection: $end) }
                Button(t("Review time change", "审阅时间修改")) {
                    Task { await manualSend(["kind": "set_time", "itemId": selectedItem,
                        "startsAt": hasStart ? iso(start) as Any : NSNull(), "endsAt": hasEnd ? iso(end) as Any : NSNull()]) }
                }.disabled(hasStart && hasEnd && end <= start).accessibilityIdentifier("trip.scoped.time")
            }
            if order.count > 1 {
                Text(t("Order within selected editable slots", "选区内可编辑位置的顺序"))
                ForEach(Array(order.enumerated()), id: \.element) { index, id in
                    HStack {
                        Text(items.first(where: { $0.id == id })?.title ?? id)
                        Spacer()
                        Button { order.swapAt(index, index - 1) } label: { Image(systemName: "arrow.up") }
                            .disabled(index == 0).accessibilityLabel(t("Move earlier", "向前移动"))
                        Button { order.swapAt(index, index + 1) } label: { Image(systemName: "arrow.down") }
                            .disabled(index + 1 == order.count).accessibilityLabel(t("Move later", "向后移动"))
                    }
                }
                Button(t("Review new order", "审阅新顺序")) { Task { await manualSend(["kind": "reorder_items", "dayId": selection.dayID, "itemIds": order]) } }
                    .disabled(order == context.orderedItemIDs[selection.dayID]?.filter { context.editableItemIDs.contains($0) })
                    .accessibilityIdentifier("trip.scoped.order")
                Text(t("Locked, fixed and unselected slots stay in place. Order does not change times.", "锁定、固定和未选中的位置保持不动。排序不改变时间。"))
                    .font(.footnote)
            }
        }
    }
    private func recovery(_ journal: NativeScopedTripJournal) -> some View {
        Section(t("Same-operation recovery", "同一操作恢复")) {
            Text(t("The saved request is retained until its server outcome is verified. Another request cannot replace it.", "原请求保留至服务端结果核实，不能用另一请求覆盖。"))
            Button(t("Check same operation", "查询同一操作")) { Task { await recover("read") } }
                .accessibilityIdentifier("trip.scoped.recovery.read")
            Button(t("Retry exact saved request", "重试原请求")) { Task { await recover("retry") } }
                .accessibilityIdentifier("trip.scoped.recovery.retry")
            Button(t("Stop pending operation…", "停止未决操作…"), role: .destructive) { abandonVisible = true }
                .accessibilityIdentifier("trip.scoped.recovery.abandon")
        }.disabled(store.busy || journal.tripID != selection.tripID)
    }
    private func choices(_ ready: NativeScopedTripCandidates) -> some View {
        Section(t("Local candidates · no proposal yet", "局部候选 · 尚未生成提议")) {
            Text(t("Candidates reuse existing items from this Trip. A new venue or walking improvement is not verified by copying an item.", "候选复用当前行程中已有项目。复制项目不证明新地点资格或步行改善。"))
                .font(.footnote)
            ForEach(Array(ready.candidates.enumerated()), id: \.element.id) { index, candidate in
                VStack(alignment: .leading, spacing: 8) {
                    Text(t("Option \(index + 1)", "候选 \(index + 1)")).font(.headline)
                    ForEach(candidate.diff.changes) { change in
                        Text(changeLabel(change.kind))
                        Text(t("Before: ", "原内容：") + itemText(change.before))
                        Text(t("After: ", "新内容：") + itemText(change.after))
                    }
                    Text(t("Preserved", "保留"))
                    ForEach(candidate.diff.preservedItemIds, id: \.self) { id in Text(items.first(where: { $0.id == id })?.title ?? id) }
                    Text(t("Time and transfer impact pending; walking improvement unverified. External orders unchanged.", "时间与接驳影响待核；步行改善未验证。外部订单不变。"))
                        .font(.footnote)
                    TimelineView(.periodic(from: .now, by: 1)) { _ in
                        Button(t("Choose this option and prepare review", "选择此候选并准备审阅")) {
                            Task {
                                guard current, await tripStore.refreshForSharing(using: session), current else { store.suspend(); return }
                                await store.selectCandidate(candidate.id, selection: selection, session: session, current: { current })
                            }
                        }.disabled(!ready.current || store.busy || !current)
                            .accessibilityIdentifier("trip.scoped.candidate.\(candidate.id)")
                    }
                }
            }
            Text(t("Choosing creates an exact proposal for review. Saving still requires its visible diff and explicit confirmation.", "选择后生成精确提议供审阅。保存仍须查看差异并显式确认。"))
        }
    }

    private func candidate(_ receipt: NativeScopedTripProposalReceipt) -> some View {
        Section(t("One local candidate · not applied", "一个局部候选 · 尚未应用")) {
            ForEach(receipt.diff.changes) { change in
                VStack(alignment: .leading, spacing: 4) {
                    Text(changeLabel(change.kind)).font(.headline)
                    Text(t("Before: ", "原内容：") + itemText(change.before))
                    Text(t("After: ", "新内容：") + itemText(change.after))
                    if change.kind == "reordered" { Text(t("Review the exact order in the proposal diff.", "在提议差异中审阅精确顺序。")) }
                }
            }
            Text(t("Preserved items", "保留项目")).font(.headline)
            ForEach(receipt.diff.preservedItemIds, id: \.self) { id in Text(items.first(where: { $0.id == id })?.title ?? id) }
            Text(t("Time and transfer impact needs checking. Walking improvement is unverified. Alternatives stay in this candidate until reviewed; external orders remain unchanged.", "时间与接驳影响待核，步行改善未验证。备选在审阅前仍为候选；外部订单不变。"))
            TimelineView(.periodic(from: .now, by: 1)) { _ in
                Button(t("Review this exact proposal", "审阅这一精确提议")) {
                    Task {
                        guard current, receipt.proposal.current,
                              await store.revalidateCandidate(selection: selection, session: session, current: { current }),
                              await tripStore.openScopedProposal(receipt.proposal, selection: selection, using: session), current else {
                            store.suspend(); return
                        }
                        onReview(selection); dismiss()
                    }
                }.disabled(!receipt.proposal.current || tripStore.busy || !current)
                    .accessibilityIdentifier("trip.scoped.review")
            }
            Text(t("Only the original Trip diff offers explicit confirmation. Closing this sheet applies nothing.", "仅原行程差异页提供显式确认。关闭此页不会应用修改。"))
                .font(.footnote)
        }
    }
    private func reload(bindings: [NativeScopedTripReservationBinding] = []) async {
        guard current, await tripStore.refreshForSharing(using: session), current else { store.suspend(); return }
        await store.load(selection: selection, session: session, locale: chinese ? "zh" : "en", bindings: bindings, current: { current })
        selectedItem = selectedItems.first(where: { store.context?.editableItemIDs.contains($0.id) == true })?.id ?? ""
        order = store.context?.orderedItemIDs[selection.dayID]?.filter { store.context?.editableItemIDs.contains($0) == true } ?? []
        bindTimes()
    }
    private func recover(_ mode: String) async {
        guard current, await tripStore.refreshForSharing(using: session), current else { store.suspend(); return }
        await store.recover(mode: mode, selection: selection, session: session, current: { current })
    }
    private func manualSend(_ edit: [String: Any]) async {
        guard current else { return }
        await store.send(action: "manual", fields: ["edit": edit], selection: selection, session: session, current: { current })
    }
    private func bindTimes() {
        guard let item = items.first(where: { $0.id == selectedItem }) else { return }
        hasStart = item.startsAt != nil; hasEnd = item.endsAt != nil
        start = item.startsAt.flatMap(NativeScopedTripCommand.date) ?? Date()
        end = item.endsAt.flatMap(NativeScopedTripCommand.date) ?? start.addingTimeInterval(3600)
    }
    private func iso(_ date: Date) -> String { ISO8601DateFormatter().string(from: date) }
    private func itemText(_ item: NativeTripItem?) -> String {
        guard let item else { return t("Absent", "无") }
        let day = store.context?.snapshot.days.first(where: { $0.id == item.dayId })?.date ?? item.dayId
        return "\(item.title) · \(day)\n\(item.startsAt ?? t("Start unset", "开始未设")) → \(item.endsAt ?? t("End unset", "结束未设"))"
    }
    private func changeLabel(_ kind: String) -> String {
        switch kind {
        case "added": t("Add", "新增")
        case "removed": t("Remove", "移除")
        case "replaced": t("Replace", "替换")
        case "moved": t("Move day", "移日")
        case "reordered": t("Reorder", "排序")
        default: t("Change", "修改")
        }
    }
    private func message(_ code: String) -> String {
        switch code {
        case "declined:no_change": t("VP finished with no change. No proposal was created, the Trip is unchanged and no external order was cancelled.", "VP 已处理，本次无变化。未创建提议，行程未修改，未取消外部订单。")
        case "declined:unsupported_request": t("VP finished but cannot support this request. No proposal was created, the Trip is unchanged and no external order was cancelled.", "VP 已处理，当前不支持这一请求。未创建提议，行程未修改，未取消外部订单。")
        case "declined:safety_refused": t("VP finished and could not process this request. No proposal was created, the Trip is unchanged and no external order was cancelled.", "VP 已处理，无法处理这一请求。未创建提议，行程未修改，未取消外部订单。")
        case "queued": t("VP is working. Check the same operation for its candidate.", "VP 正在处理，请查询同一操作的候选。")
        case "provider_unavailable": t("VP execution is currently unavailable. The same request is retained; no AI candidate is claimed.", "VP 执行当前不可用，原请求保留；尚无 AI 候选。")
        case "candidatesReady": t("Candidates are ready. Choose an option before a proposal is created.", "候选已准备好。选择后才会生成提议。")
        case "reviewRequired": t("Candidate ready for the original proposal review.", "候选可进入原提议审阅。")
        case "lockSaved": t("Protection saved. Refresh before another edit.", "保护事项已保存，请刷新后再修改。")
        case "otherPendingTrip": t("Another Trip has an unresolved edit. Open that Trip to resolve it first.", "另一行程有未决编辑，请先打开该行程处理。")
        case "cancelled": t("Pending operation stopped. Existing Trip and orders are retained.", "未决操作已停止，已有行程与订单保留。")
        case "stale_basis", "stale", "refreshRequired": t("The basis changed or expired. Refresh and review again.", "依据变化或到期，请刷新并重新审阅。")
        case "protected_item": t("A locked or fixed item cannot be changed. Review its protection first.", "锁定或固定项目不能修改，请先审阅保护事项。")
        case "invalidResponse": t("The response could not be verified. The pending request stays saved.", "无法核实响应，未决请求仍保留。")
        default: t("Outcome not verified. Reconnect and check the same operation.", "结果未核实，请回网查询同一操作。")
        }
    }
}

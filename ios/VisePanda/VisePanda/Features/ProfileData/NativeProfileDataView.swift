import SwiftUI

struct NativeProfileDataView: View {
    let store: NativeProfileDataStore
    let client: NativeProfileDataClient
    let chinese: Bool
    let completed: (NativeProfileDataCompletion, NativeCommunitySafetyActor) -> Void
    @Environment(\.scenePhase) private var phase
    @State private var confirmation: NativeProfileDataBinding?
    @State private var operation: Task<Void, Never>?
    private var actor: NativeCommunitySafetyActor? { phase == .active ? client.current() : nil }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }

    var body: some View {
        Group {
            Section {
                Text(NativeProfileDataCopy.scope(store.scope == .sensitive, chinese: chinese))
                Text(t("明确选择本人的 Profile 资料，核对保存字段及节奏同意与撤销历史。账号、会话、Trip、显式 Memory 和财务资料保留；外部副本无法召回。", "Explicitly select your Profile and review saved fields, pace consent and Undo history. Account, sessions, Trips, explicit Memory and financial data remain; external copies cannot be recalled."))
                Button(t("读取本人对象", "Read my objects")) { run { await store.load(client: client) } }
                    .disabled(store.busy || !store.storageReady || store.pending != nil || actor == nil)
                    .accessibilityIdentifier("profileData.load")
            }
            objectRows
            if let preview = store.visiblePreview(actor) { previewRows(preview) }
            pendingRows
            if let receipt = store.visibleReceipt(actor) { receiptRows(receipt) }
            if let message = store.message { Section { Text(status(message)) } }
            Color.clear.frame(height: 0)
                .confirmationDialog(t("确认刚才核对的本人资料与全部影响？", "Confirm the reviewed Profile and every effect?"), isPresented: Binding(get: { confirmation != nil }, set: { if !$0 { confirmation = nil } }), titleVisibility: .visible) {
                    if let binding = confirmation {
                        Button(t("明确确认并擦除所选范围", "Explicitly confirm and erase the selected scope"), role: .destructive) {
                            confirmation = nil; run { await store.erase(reviewed: binding, client: client) }
                        }
                    }
                } message: {
                    if let binding = confirmation {
                        if let preview = store.visiblePreview(actor), preview.binding == binding {
                            Text((binding.profileID ?? binding.objectIDs.joined(separator: ", ")) + "\n" + binding.requestID + "\n" +
                                (store.scope == .sensitive ? t("全部保存字段及节奏请求与撤销历史", "All saved fields, pace requests and Undo history") : t("所选 \(preview.progressCount) 项临时预览", "Selected \(preview.progressCount) transient previews")))
                        }
                    }
                }
                .task(id: actor) {
                    store.bind(actor)
                    while !Task.isCancelled, actor != nil {
                        store.tick(client: client)
                        if store.visiblePreview(actor)?.binding != confirmation { confirmation = nil }
                        try? await Task.sleep(for: .seconds(1))
                    }
                }
                .onChange(of: actor) { _, _ in operation?.cancel(); confirmation = nil; store.bind(actor) }
                .onChange(of: phase) { _, value in if value != .active { operation?.cancel(); confirmation = nil; store.suspend() } }
                .onDisappear { operation?.cancel(); confirmation = nil; store.suspend() }
        }
    }

    @ViewBuilder private var objectRows: some View {
        let objects = store.visibleObjects(actor)
        if !objects.isEmpty {
            Section(t("明确选择对象", "Explicitly select objects")) {
                ForEach(objects) { object in
                    Button {
                        confirmation = nil; store.toggle(object, actor: actor)
                    } label: {
                        VStack(alignment: .leading) {
                            Label(object.id, systemImage: store.selected.contains(object.id) ? "checkmark.circle.fill" : "circle")
                            if let summary = object.summary {
                                Text(t("资料版本 \(summary.profileRevision) · 节奏版本 \(summary.paceRevision)", "Profile revision \(summary.profileRevision) · Pace revision \(summary.paceRevision)")).font(.caption)
                            }

                        }
                    }.disabled(store.busy || store.pending != nil)
                    if let fields = object.operationInventory {
                        DisclosureGroup(t("查看此操作的全部保留字段", "Inspect all retained fields of this operation")) {
                            Text(fields).font(.caption.monospaced()).textSelection(.enabled)
                        }
                    }
                }
                Button(t("核对所选关系与全部影响", "Review selected relations and every effect")) { run { await store.review(client: client) } }
                    .disabled(store.busy || store.pending != nil || store.selected.isEmpty)
                    .accessibilityIdentifier("profileData.preview")
                if store.next != nil {
                    Button(t("读取下一页；重新选择本页对象", "Read the next page; select objects on that page")) { run { await store.load(nextPage: true, client: client) } }.disabled(store.busy || store.pending != nil)
                }
            }
        }
    }

    @ViewBuilder private func previewRows(_ preview: NativeProfileDataPreview) -> some View {
        Section(t("本次核对", "This review")) {
            Text(preview.binding.profileID ?? preview.binding.objectIDs.joined(separator: ", ")).textSelection(.enabled)
            Text(preview.binding.requestID).font(.caption).textSelection(.enabled)
            Text(t("此预览仅在原 30 秒期限内可确认。", "Confirm within this preview’s original 30-second deadline."))
            if store.scope == .progress { Text(t("所选临时进度：\(preview.progressCount)", "Selected transient progress: \(preview.progressCount)")) }
        }
        if let fields = preview.profile {
            Section(t("将清理的本人保存资料", "My saved fields to clear")) {
                ForEach(["displayName", "travelPace", "locale", "currency", "distanceUnit", "temperatureUnit", "defaultDepartureTime"], id: \.self) { key in
                    let mask = ["displayName": "display_name", "travelPace": "travel_pace", "distanceUnit": "distance_unit", "temperatureUnit": "temperature_unit", "defaultDepartureTime": "default_departure_time"]
                    let saved = preview.summary?.presentFields.contains(mask[key] ?? key) == true
                    LabeledContent(NativeProfileDataCopy.label(key, chinese: chinese), value: fields.values[key].map { saved ? $0 : t("系统缺省：", "System fallback: ") + $0 } ?? t("未保存", "Not saved"))
                }
                if let summary = preview.summary {
                    Text(t("保存字段 \(summary.presentFields.count) 项；资料清理下限 \(summary.profileErasureFloor)，节奏清理下限 \(summary.paceErasureFloor)。", "Saved fields: \(summary.presentFields.count); Profile erasure floor \(summary.profileErasureFloor), pace erasure floor \(summary.paceErasureFloor)."))
                    Text(t("原节奏状态：\(summary.paceState) · 版本 \(summary.paceRevision)", "Original pace state: \(summary.paceState) · Revision \(summary.paceRevision)"))
                }
                DisclosureGroup(t("节奏同意、原请求与撤销历史的全部字段", "Every field of pace consent, original request and Undo history")) {
                    Text(fields.historyInventory).font(.caption.monospaced()).textSelection(.enabled)
                }
            }
        }
        copiesRows(preview.copies)
        ForEach(["eraseFields", "retained", "missing"], id: \.self) { group in
            Section(boundaryTitle(group)) {
                ForEach(NativeProfileDataWire.boundaries[store.scope]?[group] ?? [], id: \.self) { code in
                    Text(NativeProfileDataCopy.label(code, chinese: chinese))
                }
            }
        }
        if !preview.conflicts.isEmpty {
            Section(t("阻挡；本次无法执行清理", "Blocked; cleanup cannot proceed")) {
                ForEach(preview.conflicts, id: \.self) { Text(NativeProfileDataCopy.label($0, chinese: chinese)) }
            }
        }
        if preview.eligible {
            Section {
                Button(t("确认本人资料与全部影响…", "Confirm my data and every effect…"), role: .destructive) { confirmation = preview.binding }
                    .disabled(store.busy || store.pending != nil).accessibilityIdentifier("profileData.confirm")
            }
        }
    }
    @ViewBuilder private var pendingRows: some View {
        if let command = store.pendingCommand(actor) {
            Section(t("原操作待核验", "Original operation requires verification")) {
                Text(command.requestID ?? "").font(.caption).textSelection(.enabled)
                Text(t("保留原确认请求；未知回执不表示擦除完成。", "The original confirmed request remains. An unknown receipt does not mean erasure completed."))
                if let inventory = store.pendingInventory(actor) {
                    DisclosureGroup(t("查看本机未决记录的全部字段", "Inspect every field retained in the local pending record")) {
                        Text(inventory).font(.caption.monospaced()).textSelection(.enabled)
                    }
                }
                if command.scope == store.scope {
                    Button(t("只读核验原操作回执", "Read the original operation receipt")) { run { await store.resolve(client: client) } }
                        .disabled(store.busy || !store.storageReady).accessibilityIdentifier("profileData.recover")
                    if store.canResend(actor) {
                        Button(t("明确重送同一原确认请求", "Explicitly resend the same original confirmation"), role: .destructive) { run { await store.resolve(client: client, resend: true) } }
                            .disabled(store.busy || !store.storageReady)
                    }
                } else { Text(NativeProfileDataCopy.scope(command.scope == .sensitive, chinese: chinese)) }
            }
        }
    }
    @ViewBuilder private func receiptRows(_ receipt: NativeProfileDataReceipt) -> some View {
        Section(t("所选范围核验回执", "Verified selected-scope receipt")) {
            Text(receipt.binding.requestID).font(.caption).textSelection(.enabled)
            Text(receipt.decision.decidedAt, format: .dateTime)
            Text(t("账号与会话、Trip、显式 Memory、财务与提供商资料保留；外部副本未清理。", "Account, sessions, Trips, explicit Memory, financial and provider data remain; external copies were not erased."))
            if let revision = receipt.decision.afterProfileRevision, let pace = receipt.decision.afterPaceRevision {
                Text(t("Profile 已清理，节奏用途已撤销；资料版本 \(revision)，节奏版本 \(pace)。", "Profile cleared and pace purpose revoked; Profile revision \(revision), pace revision \(pace)."))
            }
            Text(t("清理预览 \(receipt.decision.clearedPreviews)；保留围栏 \(receipt.decision.retainedFences)。", "Cleared previews: \(receipt.decision.clearedPreviews); retained fences: \(receipt.decision.retainedFences)."))
            if let file = store.visibleReceiptFile(actor) {
                ShareLink(item: file) { Text(t("导出本次核验回执", "Export this verified receipt")) }
            }
            if let inventory = store.visibleReceiptInventory(actor) {
                DisclosureGroup(t("原回执的全部保留字段", "Every retained field of the original receipt")) {
                    Text(inventory).font(.caption.monospaced()).textSelection(.enabled)
                }
            }
        }
        copiesRows(receipt.decision.retainedCopies)
    }
    @ViewBuilder private func copiesRows(_ copies: NativeProfileDataCopies) -> some View {
        Section(t("来源副本与原流程影响", "Source copies and their original controls")) {
            Text(t("旅行简报按权威回执撤销 Profile 节奏用途。混合修改、恢复与导出副本保留，须通过其原流程处理；不能召回外部保存副本。", "The authoritative receipt withdraws Profile pace use in Traveler Briefs. Mixed editing, recovery and export copies remain under their original controls; externally saved copies cannot be recalled."))
            ForEach(NativeProfileDataWire.copyKeys, id: \.self) { key in
                let ids = copies.ids[key] ?? []
                DisclosureGroup(NativeProfileDataCopy.label(key, chinese: chinese) + " · \(ids.count)") {
                    ForEach(ids, id: \.self) { Text($0).font(.caption).textSelection(.enabled) }
                }
            }
        }
    }
    private func boundaryTitle(_ key: String) -> String {
        switch key {
        case "eraseFields": t("擦除字段范围", "Erased field scope")
        case "retained": t("保留范围", "Preserved scope")
        default: t("未支持与原流程处理范围", "Unsupported scope and original flows")
        }
    }
    private func status(_ code: String) -> String {
        switch code {
        case "storage": t("本机操作记录无法安全读写，已停止发送。", "Local operation storage cannot be safely read or written; sending has stopped.")
        case "unknown": t("原操作尚未核验；请使用只读回执恢复。", "The original operation is unverified; use read-only receipt recovery.")
        case "blocked": t("存在阻挡。先通过相应原流程处理，再重新选择核对。", "Conflicts exist. Resolve them in their original flows, then select and review again.")
        case "erased": t("已核验所选范围的擦除回执。", "Erasure receipt for the selected scope verified.")
        default: t("目前无法核验此范围，请重新读取。", "This scope cannot currently be verified; read it again.")
        }
    }
    private func run(_ work: @escaping @MainActor () async -> Void) {
        guard operation == nil else { return }
        operation = Task { @MainActor in
            defer { operation = nil }
            await work()
            guard !Task.isCancelled, let actor, let value = store.completion, store.visibleReceipt(actor) != nil else { return }
            completed(value, actor)
        }
    }
}

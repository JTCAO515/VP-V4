import SwiftUI

struct NativeConversationDataView: View {
    let store: NativeConversationDataStore
    let client: NativeConversationDataClient
    let chinese: Bool
    let completed: (NativeConversationDataCompletion, NativeCommunitySafetyActor) -> Void
    @Environment(\.scenePhase) private var phase
    @State private var confirmation: NativeConversationDataBinding?
    @State private var operation: Task<Void, Never>?
    private var actor: NativeCommunitySafetyActor? { phase == .active ? client.current() : nil }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }

    var body: some View {
        Group {
            Section {
                Text(NativeConversationDataCopy.scope(store.scope, chinese: chinese))
                Text(t("只核验明确选择的范围。已确认 Trip、原显式 Memory、财务与其他会话保留；外部副本和备份恢复另行处理。", "Verifies the explicitly selected scope. Confirmed Trips, original explicit Memory, financial records and other conversations remain. External copies and backup restore require separate handling."))
                if store.scope == .sensitive, let root = store.rootKind {
                    Picker(t("选择真实本人对象类型", "Select your actual object type"), selection: Binding(get: { root }, set: { value in confirmation = nil; store.selectRoot(value, actor: actor) })) {
                        ForEach(NativeConversationDataRoot.allCases, id: \.self) { kind in Text(NativeConversationDataCopy.root(kind, chinese: chinese)).tag(kind) }
                    }.disabled(store.busy || store.pending != nil || actor == nil)
                }
                Button(t("读取本人对象", "Read my objects")) { run { await store.load(client: client) } }
                    .disabled(store.busy || !store.storageReady || store.pending != nil || actor == nil)
                    .accessibilityIdentifier("conversationData.load")
            }
            objectRows
            if let preview = store.visiblePreview(actor) { previewRows(preview) }
            pendingRows
            if let receipt = store.visibleReceipt(actor) { receiptRows(receipt) }
            if let message = store.message { Section { Text(status(message)) } }
            Color.clear.frame(height: 0)
                .confirmationDialog(t("确认刚才核对的对象与完整关系图？", "Confirm the reviewed object and complete graph?"), isPresented: Binding(get: { confirmation != nil }, set: { if !$0 { confirmation = nil } }), titleVisibility: .visible) {
                    if let binding = confirmation {
                        Button(t("明确确认并擦除所选范围", "Explicitly confirm and erase the selected scope"), role: .destructive) {
                            confirmation = nil; run { await store.erase(reviewed: binding, client: client) }
                        }
                    }
                } message: {
                    if let binding = confirmation {
                        Text((binding.rootID ?? binding.objectIDs.joined(separator: ", ")) + "\n" + binding.requestID)
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
                            Text(object.createdAt, format: .dateTime).font(.caption)
                        }
                    }.disabled(store.busy || store.pending != nil)
                    if let fields = object.operationFields {
                        DisclosureGroup(t("查看此操作的全部保留字段", "Inspect all retained fields of this operation")) {
                            Text(fields).font(.caption.monospaced()).textSelection(.enabled)
                        }
                    }
                }
                Button(t("核对所选关系与全部影响", "Review selected relations and every effect")) { run { await store.review(client: client) } }
                    .disabled(store.busy || store.pending != nil || store.selected.isEmpty)
                    .accessibilityIdentifier("conversationData.preview")
                if store.next != nil {
                    Button(t("读取下一页；重新选择本页对象", "Read the next page; select objects on that page")) { run { await store.load(nextPage: true, client: client) } }.disabled(store.busy || store.pending != nil)
                }
            }
        }
    }

    @ViewBuilder private func previewRows(_ preview: NativeConversationDataPreview) -> some View {
        Section(t("本次核对", "This review")) {
            Text(preview.binding.rootID ?? preview.binding.objectIDs.joined(separator: ", ")).textSelection(.enabled)
            Text(preview.binding.requestID).font(.caption).textSelection(.enabled)
            Text(t("此预览仅在原 30 秒期限内可确认。重新读取不会续期本操作。", "This preview can be confirmed only within its original 30-second lifetime. Reading again does not renew this operation."))
            if store.scope == .progress { Text(t("所选临时进度：\(preview.progressCount)", "Selected transient progress: \(preview.progressCount)")) }
        }
        graphRows(preview.graph, complete: preview.eligible)
        countRows(preview.eligible ? t("将擦除", "Will erase") : t("已核验的擦除候选字段；不可执行", "Verified erasure candidate fields; cannot execute"), keys: NativeConversationDataWire.erasedKeys, values: preview.erased)
        countRows(preview.eligible ? t("将脱敏", "Will redact") : t("已核验的脱敏候选字段；不可执行", "Verified redaction candidate fields; cannot execute"), keys: NativeConversationDataWire.redactedKeys, values: preview.redacted)
        countRows(t("保留最小记录", "Retained minimal records"), keys: NativeConversationDataWire.retainedKeys, values: preview.retained)
        Section(t("保留的外部领域引用", "Preserved domain references")) {
            ForEach(preview.tripIDs, id: \.self) { Text("Trip · " + $0).textSelection(.enabled) }
            ForEach(preview.memoryIDs, id: \.self) { Text("Memory · " + $0).textSelection(.enabled) }
            if preview.tripIDs.isEmpty && preview.memoryIDs.isEmpty { Text(t("未列出 Trip / Memory 引用", "No Trip / Memory references listed")) }
        }
        Section(t("原来源授权标识", "Original source authority identities")) {
            ForEach(Array(preview.binding.sourceAuthorities.enumerated()), id: \.offset) { _, authority in
                Text("Policy · " + authority.policyID + "\nConsent · " + authority.consentID).font(.caption).textSelection(.enabled)
            }
            if preview.binding.sourceAuthorities.isEmpty { Text(t("此范围没有带政策的来源对象", "This scope has no policy-bearing source objects")) }
        }
        ForEach(["eraseFields", "redactFields", "retained", "missing"], id: \.self) { group in
            Section(boundaryTitle(group)) {
                let codes = NativeConversationDataWire.boundaries[store.scope]?[group] ?? []
                ForEach(codes, id: \.self) { Text(NativeConversationDataCopy.label($0, chinese: chinese)) }
                if codes.isEmpty { Text(t("无此类字段", "No fields in this category")) }
            }
        }
        if !preview.conflicts.isEmpty {
            Section(t("阻挡；本次不会执行擦除", "Blocked; this review cannot erase")) {
                ForEach(preview.conflicts, id: \.self) { Text(NativeConversationDataCopy.label($0, chinese: chinese)) }
            }
        }
        if preview.eligible {
            Section {
                Button(t("确认此对象与关系图…", "Confirm this object and graph…"), role: .destructive) { confirmation = preview.binding }
                    .disabled(store.busy || store.pending != nil).accessibilityIdentifier("conversationData.confirm")
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
                        .disabled(store.busy || !store.storageReady).accessibilityIdentifier("conversationData.recover")
                    if store.canResend(actor) {
                        Button(t("明确重送同一原确认请求", "Explicitly resend the same original confirmation"), role: .destructive) { run { await store.resolve(client: client, resend: true) } }
                            .disabled(store.busy || !store.storageReady)
                    }
                } else { Text(NativeConversationDataCopy.scope(command.scope, chinese: chinese)) }
            }
        }
    }
    @ViewBuilder private func receiptRows(_ receipt: NativeConversationDataReceipt) -> some View {
        Section(t("所选范围核验回执", "Verified selected-scope receipt")) {
            Text(receipt.binding.requestID).font(.caption).textSelection(.enabled)
            Text(receipt.decidedAt, format: .dateTime)
            Text(t("Trip 与原显式 Memory 保留，外部副本未擦除；不代表全账户清理完成。", "Trips and original explicit Memory remain, and external copies were not erased. This does not complete account-wide cleanup."))
            Text(t("清理预览 \(receipt.clearedPreviews)；保留围栏 \(receipt.retainedFences)。", "Cleared previews: \(receipt.clearedPreviews); retained fences: \(receipt.retainedFences)."))
            if let inventory = store.visibleReceiptInventory(actor) {
                DisclosureGroup(t("查看原回执的全部保留字段", "Inspect every retained field of the original receipt")) {
                    Text(inventory).font(.caption.monospaced()).textSelection(.enabled)
                }
            }
        }
        graphRows(receipt.graph)
        countRows(t("实际擦除", "Actually erased"), keys: NativeConversationDataWire.erasedKeys, values: receipt.erased)
        countRows(t("实际脱敏", "Actually redacted"), keys: NativeConversationDataWire.redactedKeys, values: receipt.redacted)
        countRows(t("实际保留", "Actually retained"), keys: NativeConversationDataWire.retainedKeys, values: receipt.retained)
    }
    @ViewBuilder private func graphRows(_ graph: NativeConversationDataGraph, complete: Bool = true) -> some View {
        Section(complete ? t("完整已核验关系图", "Complete verified graph") : t("已核验的本人对象；存在阻挡，关系尚未闭合", "Verified owned objects; conflicts leave the graph unclosed")) {
            ForEach(NativeConversationDataWire.graphKeys, id: \.self) { key in
                let ids = graph.ids[key] ?? []
                DisclosureGroup(NativeConversationDataCopy.label(key, chinese: chinese) + " · \(ids.count)") {
                    ForEach(ids, id: \.self) { Text($0).font(.caption).textSelection(.enabled) }
                }
            }
        }
    }
    @ViewBuilder private func countRows(_ title: String, keys: [String], values: [String: Int]) -> some View {
        Section(title) {
            ForEach(keys, id: \.self) { key in Text(NativeConversationDataCopy.label(key, chinese: chinese) + " · \(values[key] ?? 0)") }
        }
    }
    private func boundaryTitle(_ key: String) -> String {
        switch key {
        case "eraseFields": t("擦除字段范围", "Erased field scope")
        case "redactFields": t("脱敏字段范围", "Redacted field scope")
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

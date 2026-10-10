import SwiftUI

struct NativeTurnDataView: View {
    let store: NativeTurnDataStore
    let client: NativeTurnDataClient
    let chinese: Bool
    let completed: (NativeTurnDataCompletion, NativeCommunitySafetyActor) -> Void
    @Environment(\.scenePhase) private var phase
    @State private var confirmation: NativeTurnDataBinding?
    @State private var operation: Task<Void, Never>?
    private var actor: NativeCommunitySafetyActor? { phase == .active ? client.current() : nil }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }

    var body: some View {
        Group {
            Section {
                Text(NativeTurnDataCopy.scope(store.scope == .sensitive, chinese: chinese))
                Text(t("选择本人一个真实已完成轮次，核对全部敏感副本和阻挡来源。轮次、消息与任务身份保留；任务中所选输入的摘要副本若需清理，会单独列明。其他轮次、Trip、显式 Memory 与财务记录保留。", "Select one actual completed Turn and review all sensitive copies and blockers. Turn, message and Task identities remain. Any selected input digest copy in a Task is shown separately before cleanup. Other Turns, Trips, explicit Memory and financial records remain."))
                Button(t("读取本人对象", "Read my objects")) { run { await store.load(client: client) } }
                    .disabled(store.busy || !store.storageReady || store.pending != nil || actor == nil)
                    .accessibilityIdentifier("turnData.load")
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
                        if let preview = store.visiblePreview(actor), preview.binding == binding {
                            Text((binding.turnID ?? binding.objectIDs.joined(separator: ", ")) + "\n" + binding.requestID + "\n" +
                                (store.scope == .sensitive ? t("核对 \(preview.graph.size) 个实际关联身份及全部影响", "Review \(preview.graph.size) actual related identities and every effect") : t("所选 \(preview.progressCount) 项临时预览", "Selected \(preview.progressCount) transient previews")))
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
                            Text(object.createdAt, format: .dateTime).font(.caption)
                            if let threadID = object.threadID { Text(threadID).font(.caption).textSelection(.enabled) }
                            if let taskID = object.taskID { Text(taskID).font(.caption).textSelection(.enabled) }
                            if object.erasedSource == true { Text(t("敏感正文已清理；保留轮次身份", "Sensitive bodies cleared; Turn identity remains")).font(.caption) }

                        }
                    }.disabled(store.busy || store.pending != nil || object.erasedSource == true)
                    if let fields = object.operationFields {
                        DisclosureGroup(t("查看此操作的全部保留字段", "Inspect all retained fields of this operation")) {
                            Text(fields).font(.caption.monospaced()).textSelection(.enabled)
                        }
                    }
                }
                Button(t("核对所选关系与全部影响", "Review selected relations and every effect")) { run { await store.review(client: client) } }
                    .disabled(store.busy || store.pending != nil || store.selected.isEmpty)
                    .accessibilityIdentifier("turnData.preview")
                if store.next != nil {
                    Button(t("读取下一页；重新选择本页对象", "Read the next page; select objects on that page")) { run { await store.load(nextPage: true, client: client) } }.disabled(store.busy || store.pending != nil)
                }
            }
        }
    }

    @ViewBuilder private func previewRows(_ preview: NativeTurnDataPreview) -> some View {
        Section(t("本次核对", "This review")) {
            Text(preview.binding.turnID ?? preview.binding.objectIDs.joined(separator: ", ")).textSelection(.enabled)
            Text(preview.binding.requestID).font(.caption).textSelection(.enabled)
            Text(t("此预览仅在原 30 秒期限内可确认。重新读取不会续期本操作。", "Confirm this selected Turn and every reviewed effect within the original 30 seconds. Reading again does not renew this operation."))
            if store.scope == .progress { Text(t("所选临时进度：\(preview.progressCount)", "Selected transient progress: \(preview.progressCount)")) }
        }
        graphRows(preview.graph, complete: preview.eligible)
        countRows(preview.eligible ? t("将擦除", "Will erase") : t("已核验的擦除候选字段；不可执行", "Verified erasure candidate fields; cannot execute"), keys: NativeTurnDataWire.erasedKeys, values: preview.erased)
        countRows(t("将清理正文或摘要副本，结构身份保留", "Will clear body or digest copies; structural identities remain"), keys: NativeTurnDataWire.redactedKeys, values: preview.redacted)
        countRows(t("保留最小记录", "Retained minimal records"), keys: NativeTurnDataWire.retainedKeys, values: preview.retained)
        Section(t("保留的原来源与领域资料", "Preserved original sources and domain data")) {
            ForEach(NativeTurnDataWire.referenceKeys, id: \.self) { key in
                let ids = preview.references.ids[key] ?? []
                DisclosureGroup(NativeTurnDataCopy.label(key, chinese: chinese) + " · \(ids.count)") {
                    ForEach(ids, id: \.self) { Text($0).font(.caption).textSelection(.enabled) }
                }
            }
        }
        Section(t("原来源授权标识", "Original source authority identities")) {
            ForEach(Array(preview.binding.sourceAuthorities.enumerated()), id: \.offset) { _, authority in
                Text("Policy · " + authority.policyID + "\nConsent · " + authority.consentID).font(.caption).textSelection(.enabled)
            }
            if preview.binding.sourceAuthorities.isEmpty { Text(t("此范围没有带政策的来源对象", "This scope has no policy-bearing source objects")) }
        }
        ForEach(["eraseFields", "redactFields", "retained", "missing"], id: \.self) { group in
            Section(boundaryTitle(group)) {
                ForEach(NativeTurnDataWire.boundaries[store.scope]?[group] ?? [], id: \.self) { code in
                    Text(NativeTurnDataCopy.label(code, chinese: chinese))
                }
            }
        }
        if !preview.conflicts.isEmpty {
            Section(t("阻挡；本次不会执行擦除", "Blocked; this review cannot erase")) {
                ForEach(preview.conflicts, id: \.self) { Text(NativeTurnDataCopy.label($0, chinese: chinese)) }
            }
        }
        if preview.eligible {
            Section {
                Button(t("确认所选轮次与全部影响…", "Confirm this selected Turn and every effect…"), role: .destructive) { confirmation = preview.binding }
                    .disabled(store.busy || store.pending != nil).accessibilityIdentifier("turnData.confirm")
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
                        .disabled(store.busy || !store.storageReady).accessibilityIdentifier("turnData.recover")
                    if store.canResend(actor) {
                        Button(t("明确重送同一原确认请求", "Explicitly resend the same original confirmation"), role: .destructive) { run { await store.resolve(client: client, resend: true) } }
                            .disabled(store.busy || !store.storageReady)
                    }
                } else { Text(NativeTurnDataCopy.scope(command.scope == .sensitive, chinese: chinese)) }
            }
        }
    }
    @ViewBuilder private func receiptRows(_ receipt: NativeTurnDataReceipt) -> some View {
        Section(t("所选范围核验回执", "Verified selected-scope receipt")) {
            Text(receipt.binding.requestID).font(.caption).textSelection(.enabled)
            Text(receipt.decidedAt, format: .dateTime)
            Text(t("Trip 与原显式 Memory 保留，外部副本未擦除；不代表全账户清理完成。", "Trips and original explicit Memory remain, and external copies were not erased. This does not complete account-wide cleanup."))
            let fenceLabel = receipt.binding.scope == .sensitive
                ? t("轮次／消息／成果身份围栏", "Turn/message/result identity fences")
                : t("所选操作身份围栏", "Selected operation identity fences")
            Text(t("清理预览 \(receipt.clearedPreviews)；", "Cleared previews: \(receipt.clearedPreviews); ") + fenceLabel + " · \(receipt.retainedFences)")
            if let file = store.visibleReceiptFile(actor) {
                ShareLink(item: file) { Text(t("分享本次核验回执", "Share this verified receipt")) }
            }
            if let inventory = store.visibleReceiptInventory(actor) {
                DisclosureGroup(t("查看原回执的全部保留字段", "Inspect every retained field of the original receipt")) {
                    Text(inventory).font(.caption.monospaced()).textSelection(.enabled)
                }
            }
        }
        graphRows(receipt.graph)
        countRows(t("实际擦除", "Actually erased"), keys: NativeTurnDataWire.erasedKeys, values: receipt.erased)
        countRows(t("实际清理的正文与摘要副本", "Actually cleared body and digest copies"), keys: NativeTurnDataWire.redactedKeys, values: receipt.redacted)
        countRows(t("实际保留", "Actually retained"), keys: NativeTurnDataWire.retainedKeys, values: receipt.retained)
    }
    @ViewBuilder private func graphRows(_ graph: NativeTurnDataGraph, complete: Bool = true) -> some View {
        Section(complete ? t("完整已核验关系图", "Complete verified graph") : t("已核验的本人对象；存在阻挡，关系尚未闭合", "Verified owned objects; conflicts leave the graph unclosed")) {
            ForEach(NativeTurnDataWire.graphKeys, id: \.self) { key in
                let ids = graph.ids[key] ?? []
                DisclosureGroup(NativeTurnDataCopy.label(key, chinese: chinese) + " · \(ids.count)") {
                    ForEach(ids, id: \.self) { Text($0).font(.caption).textSelection(.enabled) }
                }
            }
        }
    }
    @ViewBuilder private func countRows(_ title: String, keys: [String], values: [String: Int]) -> some View {
        Section(title) {
            ForEach(keys, id: \.self) { key in Text(NativeTurnDataCopy.label(key, chinese: chinese) + " · \(values[key] ?? 0)") }
        }
    }
    private func boundaryTitle(_ key: String) -> String {
        switch key {
        case "redactFields": t("正文与摘要副本清理范围", "Body and digest copy cleanup scope")
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

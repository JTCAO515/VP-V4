import SwiftUI

struct NativeTravelerBriefView: View {
    let caseID: String
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var phase
    @State private var store = NativeTravelerBriefStore()
    @State private var includePace = false
    @State private var includeIntake = false
    @State private var memoryKeys = Set<String>()
    @State private var actionTask: Task<Void, Never>?
    @State private var actionGeneration = UUID()
    @State private var confirmation: Confirmation?
    @State private var exportFile: NativeTravelerBriefExportFile?
    @State private var share: NativeTravelerBriefExportFile?
    @State private var exportCleanup: Task<Void, Never>?
    @State private var exportCount: Int?
    @State private var failed = false
    private enum Confirmation { case share, withdraw, delete, export, abandon }
    private var session: NativeSession { settings.nativeSession }
    private var actor: NativeDataScope? { session.dataScope }
    private var zh: Bool { settings.selectedLocale == .zh }
    private var operating: Bool { store.busy || actionTask != nil }
    private func t(_ zh: String, _ en: String) -> String { self.zh ? zh : en }
    private struct LoadKey: Equatable { let actor: NativeDataScope?; let active: Bool }

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { _ in
            Form {
                Section {
                    Text(t("只为这一个服务请求向当前指定员工分享你明确选择的字段。先选择来源、预览字段，再确认分享。", "Share only individually selected fields with the current recipient for this service request. Choose sources, preview fields, then confirm sharing."))
                    Text(t("基础记忆可用不代表员工能读取它；不会自动分享聊天、全历史或敏感人格推断。", "Memory availability does not permit employee access. Chats, full history and sensitive personality inferences are not shared automatically.")).font(.footnote)
                }
                if phase == .active, let actor {
                    if let options = store.visibleOptions(actor) { sourceChoices(options, actor: actor) }
                    if let preview = store.visible(actor) { previewFields(preview, actor: actor) }
                    if let brief = store.shared(actor) { sharedFields(brief) }
                    if store.visibleOptions(actor) == nil, store.visible(actor) == nil {
                        Text(t("当前资料或授权不可读。请刷新；需要授权时返回此请求选择员工和时限。", "Current sources or sharing permission are unavailable. Refresh, or return to this request to choose the recipient and access duration."))
                    }
                    recovery(actor: actor)
                    cleanupControls(actor: actor)
                    audit(actor: actor)
                    exportControls(actor: actor)
                    if let receipt = store.receipt {
                        Text(receipt.outcome == "cancelled" ? t("原操作已终止。重新读取后再选择。", "The original operation was stopped. Reread before selecting again.") : t("操作已记录；当前分享内容请重新读取确认。", "The operation was recorded. Reread to confirm the current shared content."))
                    }
                    if store.notice != nil || failed {
                        Text(t("状态尚未确认。保留未确认的原操作；可读取回执、重试或明确终止。", "The state is unconfirmed. The original unresolved operation is retained; check its receipt, retry, or explicitly stop it.")).foregroundStyle(.red)
                            .accessibilityIdentifier("brief.unconfirmed")
                    }
                    Button(t("刷新当前来源和授权", "Refresh current sources and sharing")) { run { await load(actor) } }
                        .disabled(operating).accessibilityIdentifier("brief.refresh")
                    corrections
                } else { Text(t("登录后查看自己的请求资料。", "Sign in to view sources for your own request.")) }
            }
        }
        .navigationTitle(t("此请求的旅行者资料", "Traveler Brief for this request"))
        .task(id: LoadKey(actor: actor, active: phase == .active)) {
            guard phase == .active, let actor else { clear(); return }
            await load(actor)
        }
        .onChange(of: session.currentProfileDataErasure?.id) { _, _ in
            guard let erased = session.currentProfileDataErasure, erased.actor.scope == actor, erased.briefCaseIDs.contains(caseID) else { return }
            actionGeneration = UUID(); actionTask?.cancel(); actionTask = nil
            resetChoices(); store.invalidate(); eraseExport() // Original pending journal remains recoverable.
        }
        .onChange(of: actor) { _, _ in clear() }
        .onChange(of: phase) { _, value in if value != .active { clear() } }
        .onDisappear { clear() }
        .confirmationDialog(confirmationTitle, isPresented: Binding(get: { confirmation != nil }, set: { if !$0 { confirmation = nil } }), titleVisibility: .visible) {
            Button(t("明确确认", "Confirm explicitly"), role: confirmation == .delete || confirmation == .withdraw ? .destructive : nil) {
                guard let choice = confirmation, let actor else { return }; confirmation = nil
                run {
                    switch choice {
                    case .share: store.confirm(actor: actor); await mutate("share", actor: actor)
                    case .withdraw: await mutate("withdraw", actor: actor)
                    case .delete: await mutate("delete", actor: actor)
                    case .export: await prepareExport(actor)
                    case .abandon: await recover(.abandon, actor: actor)
                    }
                }
            }
            Button(t("继续核对", "Keep reviewing"), role: .cancel) {}
        }
        .sheet(item: $share) { NativeTravelerBriefExportShare(file: $0) }
    }
    private var confirmationTitle: String {
        switch confirmation {
        case .share: t("确认仅分享所选字段给此请求的当前员工？", "Share only selected fields with this request's current recipient?")
        case .withdraw: t("撤回此请求的 Brief 字段分享？", "Withdraw this request's Brief field sharing?")
        case .delete: t("删除此请求的 Brief 引用、预览和可控副本？原始偏好需在原管理入口删除。", "Delete this request's Brief references, previews and controlled copies? Delete original preferences in their own management view.")
        case .export: t("导出自己的 Brief 引用和最小审计？不包含原始来源值，也不是完整账户导出。", "Export your Brief references and minimal audit? Original source values are excluded; this is not a full account export.")
        case .abandon: t("终止原未确认操作？若已经应用，回执会如实返回；这不是撤销。", "Stop the original unresolved operation? An already applied operation returns its actual receipt; this is not Undo.")
        case nil: ""
        }
    }
    @ViewBuilder private func sourceChoices(_ options: NativeTravelerBriefSources, actor: NativeDataScope) -> some View {
        Section(t("选择本次预览的真实来源", "Choose actual sources for this preview")) {
            Text(t("当前指定接收员工：", "Current recipient: ") + options.recipientID).font(.footnote)
            Text(Date(timeIntervalSince1970: options.expiresAt / 1000), format: .dateTime).font(.caption)
            Text(t("来源选择只用于私人预览；仍须在下一步逐字段选择后明确分享。", "Choosing sources creates a private preview. Sharing still requires individual field selection and explicit confirmation.")).font(.footnote)
            if let pace = options.profilePace {
                Toggle(isOn: $includePace) { NativeTravelerBriefFieldView(field: pace, chinese: zh) }.accessibilityIdentifier("brief.source.pace")
            }
            Text(t("以下仅为最近三条合格的明确偏好。其他记忆仍在原管理入口。", "These are only the latest three eligible explicit preferences. Other Memory remains in its management view.")).font(.footnote)
            ForEach(options.memories) { field in
                Toggle(isOn: Binding(get: { memoryKeys.contains(field.key) }, set: { if $0 { memoryKeys.insert(field.key) } else { memoryKeys.remove(field.key) } })) {
                    NativeTravelerBriefFieldView(field: field, chinese: zh)
                }.accessibilityIdentifier("brief.source." + field.key)
            }
            if let intake = options.intake {
                Toggle(t("预览此请求关联的当前旅行需求", "Preview the current travel intake linked to this request"), isOn: $includeIntake).accessibilityIdentifier("brief.source.intake")
                ForEach(intake.fields) { NativeTravelerBriefFieldView(field: $0, chinese: zh) }
            } else { Text(t("没有此请求关联的合法旅行需求来源；预算及需求保持未知。", "No eligible travel intake is linked to this request; budget and requirements remain unknown.")).font(.footnote) }
            Button(t("取得私人字段预览", "Get private field preview")) { run { await preview(options, actor: actor) } }.accessibilityIdentifier("brief.preview")
        }.disabled(operating || store.pending != nil)
    }
    @ViewBuilder private func previewFields(_ preview: NativeTravelerBriefSnapshot, actor: NativeDataScope) -> some View {
        Section(t("逐字段核对和选择分享", "Review and select fields to share")) {
            Text(t("只向当前指定员工分享勾选的正文；未勾选字段不会进入 Brief。", "Only checked fields enter the Brief shared with the current recipient.")).font(.footnote)
            ForEach(preview.fields) { field in
                if field.available {
                    Toggle(isOn: Binding(get: { store.selection?.selectedKeys.contains(field.key) == true }, set: { store.select(field.key, include: $0, actor: actor) })) {
                        NativeTravelerBriefFieldView(field: field, chinese: zh)
                    }.accessibilityIdentifier("brief.field." + field.key)
                } else { NativeTravelerBriefFieldView(field: field, chinese: zh) }
            }
            Button(t("确认分享所选字段", "Confirm sharing selected fields")) { confirmation = .share }
                .disabled(store.selection?.selectedKeys.isEmpty != false).accessibilityIdentifier("brief.share")
        }.disabled(operating || store.pending != nil)
    }
    @ViewBuilder private func cleanupControls(actor: NativeDataScope) -> some View {
        if store.cleanupBinding(actor) != nil {
            Section(t("管理此请求的 Brief 分享", "Manage this request's Brief sharing")) {
                Text(t("即使访问到期或已撤权，你仍可清理自己的 Brief；这不会重新开放员工权限。", "Even after access expires or is revoked, you can clean up your own Brief. This does not restore employee access.")).font(.footnote)
                Button(t("撤回 Brief 字段分享", "Withdraw Brief field sharing"), role: .destructive) { confirmation = .withdraw }.accessibilityIdentifier("brief.withdraw")
                Button(t("删除此请求的 Brief 资料", "Delete this request's Brief data"), role: .destructive) { confirmation = .delete }.accessibilityIdentifier("brief.delete")
            }.disabled(operating || store.pending != nil)
        }
    }
    @ViewBuilder private func sharedFields(_ brief: NativeTravelerBriefSnapshot) -> some View {
        Section(t("刚核对的已授权正文", "Shared content just rechecked")) {
            Text(t("最新版本 \(brief.revision)；每次服务器读取重新检查权限和来源。", "Latest revision \(brief.revision); the server rechecks permission and sources on each read.")).font(.footnote)
            ForEach(brief.fields) { NativeTravelerBriefFieldView(field: $0, chinese: zh) }
        }
    }
    @ViewBuilder private func recovery(actor: NativeDataScope) -> some View {
        if let pending = store.pending {
            Section(t("恢复原未确认操作", "Recover the original unresolved operation")) {
                if let command = try? NativeTravelerBriefCommand(body: pending.body) {
                    Text(t("原请求：", "Original request: ") + command.caseID).font(.caption)
                    Text(t("另一请求不能覆盖这次操作。", "Another request cannot overwrite this operation.")).font(.footnote)
                }
                Button(t("读取原操作回执", "Read original operation receipt")) { run { await recover(.read, actor: actor) } }
                if !store.erased {
                    Button(t("重试原操作", "Retry original operation")) { run { await recover(.retry, actor: actor) } }
                    Button(t("明确终止原操作", "Explicitly stop original operation")) { confirmation = .abandon }
                } else {
                    Text(t("服务器恢复记录已删除，结果未知；不能宣称成功或撤销。", "The server recovery record was erased; the outcome is unknown. No success or Undo is claimed."))
                    Button(t("明确停止本机恢复", "Explicitly stop device recovery")) {
                        store.stopErasedRecovery(actor: actor, current: { self.actor }, read: { try session.travelerBriefRecovery(actor: actor) }, complete: { try session.completeTravelerBrief($0, actor: actor) })
                    }
                }
                if store.receiptAbsent { Text(t("未找到回执；这不证明操作未应用。", "No receipt was found; this does not prove the operation was unapplied.")) }
            }.disabled(operating)
        }
    }
    @ViewBuilder private func audit(actor: NativeDataScope) -> some View {
        if let audit = store.visibleAudit(actor) {
            Section(t("此请求的最小授权与访问记录", "Minimal sharing and access record for this request")) {
                if audit.events.isEmpty { Text(t("目前没有 Brief 审计记录。", "No Brief audit events are currently recorded.")) }
                ForEach(audit.events) { event in
                    VStack(alignment: .leading) {
                        Text(auditLabel(event.action))
                        Text(Date(timeIntervalSince1970: event.createdAt / 1000), format: .dateTime).font(.caption)
                        Text(event.fieldKeys.map { NativeTravelerBriefFieldView.title($0.hasPrefix("memory:") ? "preference" : $0, chinese: zh) }.joined(separator: " · ")).font(.caption)
                        Text(t("操作人：", "Actor: ") + event.actorID).font(.caption2)
                        if let id = event.recipientID { Text(t("接收员工：", "Recipient: ") + id).font(.caption2) }
                    }
                }
            }
        } else if store.auditUnavailable {
            Section(t("此请求的访问记录", "Access records for this request")) {
                Text(t("完整审计记录暂不可读，可能超过单次读取上限；未展示截断记录。撤回和删除按当前 owner 元数据独立核对。", "The complete audit is unavailable and may exceed the read limit; no truncated record is shown. Withdrawal and deletion use independently rechecked current owner metadata.")).font(.footnote)
            }
        }
    }
    private func auditLabel(_ action: String) -> String {
        switch action {
        case "previewed": t("已私人预览", "Privately previewed")
        case "shared": t("已明确分享", "Explicitly shared")
        case "withdrawn": t("已撤回", "Withdrawn")
        case "deleted": t("已删除", "Deleted")
        case "read": t("已读取", "Read")
        default: t("来源或授权变化后已失效", "Invalidated after source or sharing changes")
        }
    }
    @ViewBuilder private var corrections: some View {
        Section(t("纠正或删除原始来源", "Correct or delete original sources")) {
            NavigationLink(t("管理原记忆和偏好", "Manage original Memory and preferences")) { ScrollView { NativeMemoryPreferencesView(session: session, chinese: zh).padding() } }
            NavigationLink(t("管理原旅行节奏", "Manage original travel pace")) { NativeTravelPaceView() }
            Text(t("旅行需求在原 VP 对话中纠正。返回后重新读取；旧预览和旧字段不能继续分享。", "Correct travel intake in its original VP conversation. Reread on return; old previews and fields cannot continue to be shared.")).font(.footnote)
            Text(t("返回此请求可更换员工或撤回整个访问授权。", "Return to this request to change the employee or revoke all access.")).font(.footnote)
        }.disabled(operating)
    }
    @ViewBuilder private func exportControls(actor: NativeDataScope) -> some View {
        Section(t("自己的 Brief 资料副本", "Your own Brief data copy")) {
            Text(t("导出 Brief 引用、预览、最小审计和操作记录；不复制来源值，附件不可用，未纳入账户核心导出。", "Exports Brief references, previews, minimal audit and operations. Source values are not copied; attachments are unavailable and this is outside the core account export.")).font(.footnote)
            Button(t("预览导出范围并确认", "Review export scope and confirm")) { confirmation = .export }.disabled(operating || store.pending != nil)
            if let file = exportFile, file.current(actor) {
                Text(t("已准备 \(exportCount ?? 0) 条引用记录；副本有短期有效期。", "Prepared \(exportCount ?? 0) reference records; this copy expires shortly.")).font(.footnote)
                Button(t("分享这份副本", "Share this copy")) { if file.current(self.actor), phase == .active { share = file } }
            }
        }
    }
    private func run(_ work: @escaping @MainActor () async -> Void) {
        guard !operating else { return }; let own = actionGeneration
        actionTask = Task { await work(); if own == actionGeneration { actionTask = nil } }
    }
    private func resetChoices() { includePace = false; includeIntake = false; memoryKeys = []; confirmation = nil }
    private func clear() {
        actionGeneration = UUID(); actionTask?.cancel(); actionTask = nil; resetChoices(); store.bind(nil); eraseExport()
    }
    private func eraseExport() {
        share = nil; exportCleanup?.cancel(); exportCleanup = nil
        if let file = exportFile { do { try NativeTravelerBriefExportFile.erase(file); exportFile = nil; exportCount = nil } catch { failed = true } }
    }
    private func load(_ actor: NativeDataScope) async {
        store.journalObservation = session.journalDataObservation(.travelerBrief)
        failed = false; resetChoices(); eraseExport(); store.bind(actor)
        do { try NativeTravelerBriefExportFile.sweepOrphans() } catch { failed = true; return }
        store.restore(actor: actor, read: { try session.travelerBriefRecovery(actor: actor) })
        await store.loadOptions(actor: actor, caseID: caseID, current: { self.actor }, request: { try await session.travelerBriefRequest(body: $0, actor: actor) })
        await store.loadOwnerState(actor: actor, caseID: caseID, current: { self.actor }, request: { try await session.travelerBriefRequest(body: $0, actor: actor) })
        await store.loadShared(actor: actor, caseID: caseID, current: { self.actor }, request: { try await session.travelerBriefRequest(body: $0, actor: actor) })
        await store.loadAudit(actor: actor, caseID: caseID, current: { self.actor }, request: { try await session.travelerBriefRequest(body: $0, actor: actor) })
    }
    private func preview(_ options: NativeTravelerBriefSources, actor: NativeDataScope) async {
        do {
            guard store.visibleOptions(actor) == options else { throw NativeDataError.staleSessionResponse }
            let body = try options.previewBody(includePace: includePace, memoryKeys: memoryKeys, includeIntake: includeIntake)
            await store.loadPreview(body: body, actor: actor, caseID: caseID, recipientID: options.recipientID, grantRevision: options.grantRevision,
                                    current: { self.actor }, request: { try await session.travelerBriefRequest(body: $0, actor: actor) })
            await store.loadAudit(actor: actor, caseID: caseID, current: { self.actor }, request: { try await session.travelerBriefRequest(body: $0, actor: actor) })
            await store.loadOwnerState(actor: actor, caseID: caseID, current: { self.actor }, request: { try await session.travelerBriefRequest(body: $0, actor: actor) })
        } catch { failed = true }
    }
    private func mutate(_ action: String, actor: NativeDataScope) async {
        eraseExport()
        do {
            let command: NativeTravelerBriefCommand
            if action == "share" {
                guard let snapshot = store.visible(actor) else { throw NativeDataError.staleSessionResponse }
                command = try NativeTravelerBriefCommand(action: action, snapshot: snapshot, actor: actor, selection: store.selection)
            } else {
                guard let (binding, revision) = store.cleanupBinding(actor), let recipient = binding.recipientID else { throw NativeDataError.staleSessionResponse }
                command = try .init(cleanup: action, caseID: binding.caseID, recipientID: recipient, grantRevision: binding.grantRevision, revision: revision)
            }
            await store.perform(command: command, actor: actor, current: { self.actor }, read: { try session.travelerBriefRecovery(actor: actor) },
                                retain: { try session.rememberTravelerBrief($0, actor: actor) }, complete: { try session.completeTravelerBrief($0, actor: actor) },
                                request: { try await session.travelerBriefRequest(body: $0, actor: actor) })
            if store.pending == nil { await load(actor) }
        } catch { failed = true }
    }
    private func recover(_ kind: NativeTravelerBriefStore.Recovery, actor: NativeDataScope) async {
        eraseExport()
        await store.perform(command: nil, recovery: kind, actor: actor, current: { self.actor }, read: { try session.travelerBriefRecovery(actor: actor) },
                            retain: { try session.rememberTravelerBrief($0, actor: actor) }, complete: { try session.completeTravelerBrief($0, actor: actor) },
                            request: { try await session.travelerBriefRequest(body: $0, actor: actor) })
        if store.pending == nil { await load(actor) }
    }
    private func prepareExport(_ actor: NativeDataScope) async {
        eraseExport(); let own = actionGeneration, started = ProcessInfo.processInfo.systemUptime
        do {
            let requestID = UUID().uuidString.lowercased(), sessionID = try session.serviceCaseExportSessionId(actor: actor)
            let body = try NativeTravelerBriefWire.bytes(["action": "export", "requestId": requestID, "confirmed": true])
            let bytes = try await session.travelerBriefRequest(body: body, actor: actor)
            guard own == actionGeneration, self.actor == actor, phase == .active, !Task.isCancelled else { return }
            let bundle = try NativeTravelerBriefBundle(bytes: bytes, actor: actor, sessionID: sessionID, requestID: requestID)
            let file = try NativeTravelerBriefExportFile.create(bundle, actor: actor, started: started)
            exportFile = file; exportCount = bundle.rowCount; failed = false
            exportCleanup = Task {
                do { try await Task.sleep(for: .seconds(max(0, file.deadline - ProcessInfo.processInfo.systemUptime))) } catch { return }
                if exportFile?.id == file.id { eraseExport() }
            }
        } catch { if own == actionGeneration { failed = true } }
    }
}

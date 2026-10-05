import SwiftUI

struct NativeCommunitySafetyView: View {
    @Environment(NativeSession.self) private var session
    @Environment(\.scenePhase) private var scenePhase
    @State private var store = NativeCommunitySafetyStore()
    @State private var selectedCollection = "objects"
    @State private var category = "other"
    @State private var modal: Modal?
    @State private var action: Task<Void, Never>?
    private var actor: NativeCommunitySafetyActor? { try? session.communitySafetyActor() }
    private var chinese: Bool { session.locale.hasPrefix("zh") }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }

    private enum Modal: Identifiable {
        case report(NativeCommunitySafetyObject, NativeCommunitySafetyActor, String)
        case appeal(NativeCommunitySafetyRecord, NativeCommunitySafetyActor)
        case block(NativeCommunitySafetyObject, NativeCommunitySafetyActor)
        case unblock(NativeCommunitySafetyRecord, NativeCommunitySafetyActor)
        case delete(NativeCommunitySafetyActor)
        case abandon(NativeCommunitySafetyActor)
        var id: String {
            switch self {
            case .report(let object, _, _): "report-" + object.id
            case .appeal(let record, _): "appeal-" + record.id
            case .block(let object, _): "block-" + object.id
            case .unblock(let record, _): "unblock-" + record.id
            case .delete: "delete"
            case .abandon: "abandon"
            }
        }
    }
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { _ in
            Form {
                Section {
                    Text(t("受控内部社区安全", "Safety for the controlled internal community")).font(.headline)
                    Text(t("可操作对象由服务端确认。内容尚未公开，也不会自动成为旅行事实。", "The server confirms which objects you can act on. Content is internal and does not become a travel fact automatically.")).font(.caption)
                }
                if actor == nil {
                    NativeCommunitySafetyUnavailableView(chinese: chinese, reason: t("需要有效登录会话。", "A current signed-in session is required."))
                } else {
                    if let notice = store.notice { Section { Text(message(notice)).accessibilityIdentifier("community-safety-notice") } }
                    if store.pending != nil { recoverySection }
                    Section {
                        Picker(t("查看", "View"), selection: $selectedCollection) {
                            Text(t("可操作内容", "Eligible content")).tag("objects")
                            Text(t("我的举报", "My reports")).tag("reports")
                            Text(t("自身处置", "My dispositions")).tag("dispositions")
                            Text(t("我的申诉", "My appeals")).tag("appeals")
                            Text(t("我的屏蔽", "My blocks")).tag("blocks")
                        }.accessibilityIdentifier("community-safety-collection")
                        Button(t("刷新当前状态", "Refresh current state")) { run { actor in await load(actor) } }
                            .disabled(store.busy).accessibilityIdentifier("community-safety-refresh")
                        if store.busy { ProgressView() }
                    }
                    if let object = store.visibleObject(actor) { objectDetail(object) }
                    else if let record = store.visibleRecord(actor) { recordDetail(record) }
                    else if store.isFresh(actor) {
                        listSection
                    } else if !store.busy {
                        NativeCommunitySafetyUnavailableView(chinese: chinese, reason: t("目前没有有效的可操作内容。请刷新；没有资格时无法举报或屏蔽。", "No current eligible content is available. Refresh to check; reports and blocks require eligibility."))
                    }
                    Section(t("本模块资料", "Module data")) {
                        Text(t("仅含社区安全模块的自身举报、处置、申诉、屏蔽及最少操作元数据。统一账户导出/删除尚未接入此模块。", "Includes your own reports, dispositions, appeals, blocks and minimal operation metadata in this safety module. Unified account export and deletion are not enrolled for this module.")).font(.caption)
                        Button(t("导出本模块资料", "Export module data")) { run { actor in await store.export(current: { self.actor }, request: { try await session.communitySafetyRequest(body: $0, actor: actor) }) } }
                            .disabled(store.busy || !store.storageReady).accessibilityIdentifier("community-safety-export")
                        if let url = store.exportURL(actor) { ShareLink(item: url) { Label(t("分享临时导出", "Share temporary export"), systemImage: "square.and.arrow.up") }.accessibilityIdentifier("community-safety-share") }
                        Button(t("删除本模块个人资料", "Delete personal module data"), role: .destructive) { if let actor { modal = .delete(actor) } }
                            .disabled(store.busy || store.pending != nil || !store.storageReady).accessibilityIdentifier("community-safety-delete")
                        NavigationLink(t("我的投稿、撤回及投稿资料删除", "My submissions, withdrawal and submission data deletion")) { NativeCommunitySubmissionView().id(session.dataScope) }
                    }
                }
            }
            .onChange(of: Int(ProcessInfo.processInfo.systemUptime)) { _, _ in
                store.tick(current: actor)
                if !store.isFresh(actor), modalRequiresFreshness { modal = nil }
            }
        }
        .navigationTitle(t("社区安全", "Community safety"))
        .task(id: actor) { await reload() }
        .onChange(of: selectedCollection) { _, _ in modal = nil; run { actor in await load(actor) } }
        .onChange(of: scenePhase) { _, next in
            if next != .active { hide() }
            else { run { actor in await load(actor) } }
        }
        .onDisappear { hide() }
        .sheet(item: $modal) { value in modalView(value) }
    }
    private var modalRequiresFreshness: Bool {
        switch modal { case .report, .appeal, .block, .unblock: true; default: false }
    }
    private var recoverySection: some View {
        Section(t("原操作待确认", "Original operation unconfirmed")) {
            Text(t("不会创建新操作或自动重试。先读取原操作回执。", "No new operation or automatic retry will be created. Read the original receipt first."))
            Button(t("读取原操作结果", "Read original operation result")) { run { actor in await recover(actor) } }.disabled(store.busy || !store.storageReady)
            if store.canRetry(actor) {
                Button(t("明确重试同一操作", "Explicitly retry the same operation")) {
                    run { actor in await store.retry(current: { self.actor }, read: { try session.communitySafetyRecovery(actor: actor) }, complete: { try session.completeCommunitySafety($0, actor: actor) }, request: { try await session.communitySafetyRequest(body: $0, actor: actor) }) }
                }.disabled(store.busy)
            }
            Button(t("停止原操作并读取", "Stop original operation and read")) { if let actor { modal = .abandon(actor) } }.disabled(store.busy || !store.storageReady)
        }
    }
    private var listSection: some View {
        Section {
            let objects = store.visibleObjects(actor), records = store.visibleRecords(actor)
            if objects.isEmpty && records.isEmpty { Text(t("没有符合此范围的当前对象。", "No current objects are available in this scope.")) }
            ForEach(objects) { object in
                Button(object.title) { run { actor in await store.read(objectID: object.id, current: { self.actor }, request: { try await session.communitySafetyRequest(body: $0, actor: actor) }) } }.disabled(store.busy)
            }
            ForEach(records) { record in
                Button(recordTitle(record) + " · " + record.id) {
                    let collection = selectedCollection
                    run { actor in await store.read(collection: collection, recordID: record.id, current: { self.actor }, request: { try await session.communitySafetyRequest(body: $0, actor: actor) }) }
                }.disabled(store.busy)
            }
            if let cursor = store.nextCursor { Button(t("下一页", "Next page")) { run { actor in await load(actor, cursor: cursor) } }.disabled(store.busy) }
        }
    }
    private func objectDetail(_ object: NativeCommunitySafetyObject) -> some View {
        Section {
            Text(object.title).font(.headline)
            Text(object.content).textSelection(.enabled)
            Text(t("作者身份：", "Author disclosure: ") + disclosure(object.authorDisclosure)).font(.caption)
            if let reviewer = object.reviewerDisclosure { Text(t("审核者身份：", "Reviewer disclosure: ") + disclosure(reviewer)).font(.caption) }
            if let benefit = object.benefit, !benefit.isEmpty { Text(t("作者自述利益：", "Author-reported interests: ") + benefit).font(.caption) }
            Text(t("来源：", "Source: ") + source(object.source)).font(.caption)
            Text(t("著作权情况未核实。仅当前会话短期显示。", "Copyright status is unknown. Display is short-lived in the current session.")).font(.caption)
            if object.canReport {
                Picker(t("举报类别", "Report category"), selection: $category) {
                    Text(t("滥用", "Abuse")).tag("abuse"); Text(t("权利", "Rights")).tag("rights")
                    Text(t("误导", "Misleading")).tag("misleading"); Text(t("其他", "Other")).tag("other")
                }
                Button(t("举报此内容", "Report this content")) { if let actor { modal = .report(object, actor, category) } }
                    .disabled(store.busy || store.pending != nil || !store.storageReady).accessibilityIdentifier("community-safety-report")
            }
            if object.canBlock {
                Button(t("屏蔽此内容的作者", "Block this content’s author"), role: .destructive) { if let actor { modal = .block(object, actor) } }
                    .disabled(store.busy || store.pending != nil || !store.storageReady).accessibilityIdentifier("community-safety-block")
            }
            if !object.canReport && !object.canBlock { Text(t("当前没有可执行的安全操作资格。", "No safety action is currently eligible.")) }
        }
    }
    private func recordDetail(_ record: NativeCommunitySafetyRecord) -> some View {
        Section {
            Text(recordTitle(record)).font(.headline)
            Text(record.id).font(.caption).textSelection(.enabled)
            if let explanation = record.explanation { Text(explanation).textSelection(.enabled) }
            if let note = record.note { Text(t("处置说明：", "Disposition note: ") + note).textSelection(.enabled) }
            if let time = record.createdAt { Text(time).font(.caption) }
            if let time = record.endedAt { Text(time).font(.caption) }
            if record.kind == "disposition" {
                Text(t("投稿状态：", "Submission state: ") + status(record.j1Status ?? "unknown"))
                if record.appealBasis != nil {
                    Button(t("对此处置申诉", "Appeal this disposition")) { if let actor { modal = .appeal(record, actor) } }
                        .disabled(store.busy || store.pending != nil || !store.storageReady).accessibilityIdentifier("community-safety-appeal")
                } else { Text(t("此处置当前不可申诉。", "This disposition is currently unavailable for appeal.")) }
            }
            if record.canUnblock {
                Button(t("解除此屏蔽", "Unblock")) { if let actor { modal = .unblock(record, actor) } }
                    .disabled(store.busy || store.pending != nil || !store.storageReady).accessibilityIdentifier("community-safety-unblock")
            }
        }
    }
    @ViewBuilder private func modalView(_ value: Modal) -> some View {
        switch value {
        case .report(let object, let bound, let category):
            NativeCommunitySafetyExplanationForm(chinese: chinese, title: t("举报", "Report"), purpose: t("说明只向符合资格的运营审核人员提供；其他用户不会读到此举报正文。", "The explanation is available to eligible operators. Other users cannot read this report text."), limit: 1000, stillEligible: { actor == bound && store.visibleObject(actor) == object && object.canReport && store.pending == nil && !store.busy && store.storageReady }) { explanation in
                guard actor == bound, store.visibleObject(actor) == object, let command = try? NativeCommunitySafetyCommand.object(object, action: "report", category: category, explanation: explanation) else { return }
                run { actor in await perform(command, actor: actor) }
            }
        case .appeal(let record, let bound):
            NativeCommunitySafetyExplanationForm(chinese: chinese, title: t("申诉", "Appeal"), purpose: t("申诉异步处理。提交不会恢复已撤回或已删除的内容。", "Appeals are processed asynchronously. Submission does not restore withdrawn or deleted content."), limit: 1000, stillEligible: { actor == bound && store.visibleRecord(actor) == record && record.appealBasis != nil && store.pending == nil && !store.busy && store.storageReady }) { explanation in
                guard actor == bound, store.visibleRecord(actor) == record, let command = try? NativeCommunitySafetyCommand.appeal(record, explanation: explanation) else { return }
                run { actor in await perform(command, actor: actor) }
            }
        default: confirmation(value)
        }
    }
    private func confirmation(_ value: Modal) -> some View {
        NavigationStack {
            Form {
                Text(confirmText(value))
                Button(t("确认", "Confirm"), role: .destructive) { confirm(value) }.accessibilityIdentifier("community-safety-confirm")
            }
            .navigationTitle(t("确认操作范围", "Confirm scope"))
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(t("取消", "Cancel")) { modal = nil } } }
        }
    }
    private func confirmText(_ value: Modal) -> String {
        switch value {
        case .block: t("屏蔽服务端确认的此内容作者。解除屏蔽不会恢复已下架或无资格内容。", "Block the server-confirmed author of this content. Unblocking will not restore removed or ineligible content.")
        case .unblock: t("解除此屏蔽。其他权限与内容处置继续适用。", "Remove this block. Other permissions and dispositions still apply.")
        case .delete: t("清除本模块个人举报说明、申诉正文、屏蔽关系及自己写的运营说明等。最少操作防重放标记、记录墓碑和审计元数据保留。投稿原文与其他账户模块不在此范围。", "Erase personal report details, appeal text, block relations and moderation notes you wrote in this module. Minimal replay fences, record tombstones and audit metadata remain. Submission text and other account modules are outside this scope.")
        case .abandon: t("停止尚未执行的原操作；若已提交则读取当前回执，不代表已回滚。", "Stop the original operation if uncommitted; otherwise read its current receipt. This does not claim a rollback.")
        default: ""
        }
    }
    private func confirm(_ value: Modal) {
        modal = nil
        let command: NativeCommunitySafetyCommand?
        switch value {
        case .block(let object, let bound):
            guard actor == bound, store.visibleObject(actor) == object else { return }; command = try? .object(object, action: "block")
        case .unblock(let record, let bound):
            guard actor == bound, store.visibleRecord(actor) == record else { return }; command = try? .unblock(record)
        case .delete(let bound): guard actor == bound else { return }; command = try? .delete()
        case .abandon(let bound):
            guard actor == bound else { return }; run { actor in await recover(actor, abandon: true) }; return
        default: return
        }
        guard let command else { return }; run { actor in await perform(command, actor: actor) }
    }
    private func run(_ work: @escaping (NativeCommunitySafetyActor) async -> Void) {
        guard let actor, !store.busy, scenePhase == .active else { return }
        action?.cancel(); action = Task { await work(actor) }
    }
    private func hide() { action?.cancel(); action = nil; modal = nil; store.suspend() }
    private func reload() async {
        hide(); store.bind(actor)
        guard let actor else { return }
        store.restore(actor) { try session.communitySafetyRecovery(actor: actor) }
        await load(actor)
    }
    private func load(_ actor: NativeCommunitySafetyActor, cursor: String? = nil) async {
        await store.load(collection: selectedCollection == "objects" ? nil : selectedCollection, cursor: cursor, current: { self.actor }, request: { try await session.communitySafetyRequest(body: $0, actor: actor) })
    }
    private func perform(_ command: NativeCommunitySafetyCommand, actor: NativeCommunitySafetyActor) async {
        await store.perform(command, current: { self.actor }, read: { try session.communitySafetyRecovery(actor: actor) }, retain: { try session.rememberCommunitySafety(body: $0, actor: actor) }, complete: { try session.completeCommunitySafety($0, actor: actor) }, request: { try await session.communitySafetyRequest(body: $0, actor: actor) })
    }
    private func recover(_ actor: NativeCommunitySafetyActor, abandon: Bool = false) async {
        await store.recover(abandon: abandon, current: { self.actor }, complete: { try session.completeCommunitySafety($0, actor: actor) }, request: { try await session.communitySafetyRequest(body: $0, actor: actor) })
    }
    private func recordTitle(_ record: NativeCommunitySafetyRecord) -> String {
        let kind = switch record.kind { case "report": t("举报", "Report"); case "appeal": t("申诉", "Appeal"); case "block": t("屏蔽", "Block"); default: t("自身处置", "My disposition") }
        return kind + " · " + status(record.state)
    }
    private func status(_ value: String) -> String {
        switch value {
        case "pending": t("待处理", "Pending")
        case "dismissed": t("举报已驳回", "Report dismissed")
        case "removed": t("已下架", "Removed")
        case "upheld": t("维持原处置", "Disposition upheld")
        case "restored": t("复核已恢复内部资格", "Internal eligibility restored after review")
        case "blocked": t("已屏蔽", "Blocked")
        case "unblocked": t("已解除屏蔽", "Unblocked")
        case "erased", "deleted": t("个人文字已清除", "Personal text erased")
        case "clear": t("当前无安全下架", "No current safety removal")
        case "published": t("内部审核通过", "Internally approved")
        case "rejected": t("投稿拒绝", "Submission rejected")
        case "withdrawn": t("投稿撤回", "Submission withdrawn")
        default: t("当前不可用", "Currently unavailable")
        }
    }
    private func disclosure(_ value: String) -> String {
        switch value {
        case "registered_user": t("注册用户", "Registered user")
        case "community_reviewer": t("社区审核人员", "Community reviewer")
        case "official": t("官方", "Official")
        case "employee": t("员工", "Employee")
        default: t("身份关系未核实", "Affiliation unverified")
        }
    }
    private func source(_ value: String) -> String {
        switch value { case "user_experience": t("用户体验", "User experience"); case "user_help": t("用户帮助", "User help"); default: t("来源未知", "Unknown source") }
    }
    private func message(_ value: String) -> String {
        switch value {
        case "SAFETY_DISABLED": t("当前环境未开放内部安全操作；自身回执和资料清理仍需有效会话。", "Internal safety actions are disabled in this environment. Own receipts and data cleanup still require a current session.")
        case "SAFETY_FORBIDDEN", "SAFETY_NOT_FOUND": t("当前无权读取或操作此对象，请刷新。", "This object is currently unavailable for reading or action. Refresh.")
        case "RECOVERY_REQUIRED", "ACK_UNKNOWN", "SAFETY_ACK_UNKNOWN": t("原操作结果未确认。请读取原操作回执，不会自动重试。", "The original result is unconfirmed. Read its receipt; no automatic retry occurs.")
        case "EXACT_RETRY_OR_ABANDON": t("服务端尚无此操作回执。可明确重试相同操作或停止。", "No receipt exists yet. You can explicitly retry the same operation or stop it.")
        case "ACKNOWLEDGED": t("已确认操作，以下为当前服务端回执。", "Operation acknowledged. Its current server receipt appears below.")
        case "ABANDONED": t("原操作已停止。", "The original operation was stopped.")
        case "MODULE_EXPORT_READY": t("仅本模块导出已就绪，30秒内可分享。已分享副本无法召回。", "This module’s export is ready to share for 30 seconds. Shared copies cannot be recalled.")
        case "MODULE_DELETED": t("本模块个人资料已清除，最少防重放与审计元数据保留。", "Personal module data was erased. Minimal replay fences and audit metadata remain.")
        case "EXPORT_EXPIRED", "REFRESH_REQUIRED": t("当前显示已到期，请刷新。", "The current display expired. Refresh.")
        case "SAFETY_CONFLICT": t("对象版本或处置已变化，请读取原操作并刷新。", "The object version or disposition changed. Read the original operation and refresh.")
        case "SAFETY_CAPACITY": t("超过完整处理上限，本次未完成。", "The complete-processing limit was exceeded; this action did not complete.")
        case "STORAGE_CLEANUP_REQUIRED", "STORAGE_UNAVAILABLE": t("本机存储未确认安全保存或清理，操作已锁定。请刷新会话并重新读取。", "Local storage or cleanup could not be verified. Actions are locked. Refresh the session and read again.")
        default: t("此功能目前不可用，请刷新会话与当前状态。", "This feature is currently unavailable. Refresh the session and current state.")
        }
    }
}

import SwiftUI

struct NativeCommunitySubmissionView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var scenePhase
    @State private var store = NativeCommunityStore()
    @State private var draft = NativeCommunityDraft()
    @State private var action: Task<Void, Never>?
    @State private var confirmation: Confirmation?
    @State private var placePicker: PlacePicker?
    @State private var placeUnavailable = false
    private var session: NativeSession { settings.nativeSession }
    private var chinese: Bool { settings.selectedLocale == .zh }
    private var actor: NativeCommunityActor? { try? session.communityActor() }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }

    private struct PlacePicker: Identifiable { let actor: NativeCommunityActor; let id = UUID() }
    private enum Confirmation: Identifiable {
        case withdraw(NativeCommunityItem), delete, abandon
        var id: String { switch self { case .withdraw(let item): "withdraw-" + item.id; case .delete: "delete"; case .abandon: "abandon" } }
    }
    var body: some View {
        Form {
            Section {
                Text(t("投稿仅进入内部审核。旅行体验不会自动成为事实；没有公开动态、私信或关注。", "Submissions enter internal review only. Travel experiences do not become facts automatically. Public feed, messaging and following are unavailable."))
                    .font(.footnote)
                if actor == nil { Text(t("请先登录有效注册账号。", "Sign in with an active registered account.")) }
                if store.busy { ProgressView() }
                if let notice = store.notice { Text(message(notice)).accessibilityIdentifier("community.notice") }
            }
            if store.pending != nil {
                Section(t("未确认的操作", "Unconfirmed operation")) {
                    Text(t("网络中断不能证明操作未执行。先读取原操作结果；不会自动再次投稿。", "An interrupted connection does not prove the operation failed. Read its result first; submission is never retried automatically."))
                    Button(t("读取原操作结果", "Read original operation result")) { run { actor in
                        await store.recover(current: { self.actor }, complete: { try session.completeCommunity($0, actor: actor) }, request: { try await session.communityRequest(body: $0, actor: actor) })
                    } }.accessibilityIdentifier("community.operation.read")
                    if store.canRetry(actor) {
                        Button(t("同一内容、同一操作重试", "Retry the same content and operation")) { run { actor in
                            await store.retry(current: { self.actor }, read: { try session.communityRecovery(actor: actor) }, complete: { try session.completeCommunity($0, actor: actor) }, request: { try await session.communityRequest(body: $0, actor: actor) })
                        } }.accessibilityIdentifier("community.operation.retry")
                    }
                    Button(t("停止原操作并读取最终状态", "Stop the original operation and read its final state")) { confirmation = .abandon }
                        .accessibilityIdentifier("community.operation.abandon")
                }.disabled(store.busy || !store.storageReady || actor == nil)
            }
            Section(t("可选地点关联", "Optional place association")) {
                if let place = draft.place {
                    Text(place.label)
                    Button(t("明确移除关联", "Remove association")) { draft.place = nil; draft.associationConfirmed = true; placeUnavailable = false }
                }
                Button(t("本次明确不关联地点", "Explicitly submit without a place")) { draft.place = nil; draft.associationConfirmed = true; placeUnavailable = false }
                if draft.place == nil { Text(draft.associationConfirmed ? t("已选择不关联地点", "You chose no place association") : t("请明确选择地点或不关联地点", "Choose a place or explicitly choose no association")) }
                Button(t("选择自己行程内的已收藏地点", "Choose a saved place in your Trip")) { if let actor { placePicker = .init(actor: actor) } }
                if placeUnavailable { Text(t("地点或行程已变化。请重新选择，或明确移除关联后投稿。", "The place or Trip changed. Choose again or explicitly remove the association before submitting.")) }
            }.disabled(store.busy || store.pending != nil || actor == nil)
            NativeCommunityComposer(draft: $draft, chinese: chinese, disabled: store.busy || store.pending != nil || !store.storageReady || actor == nil) { frozen in
                run { actor in
                    guard await validatePlace(frozen.place, actor: actor), !Task.isCancelled, self.actor == actor,
                          draft == frozen, let command = try? NativeCommunityCommand.submit(frozen) else { placeUnavailable = true; return }
                    draft = .init(); placeUnavailable = false; await perform(command, actor: actor)
                }
            }
            Section(t("自己的投稿", "Your submissions")) {
                Button(t("刷新第一页", "Refresh first page")) { run { actor in await store.page(current: { self.actor }, request: { try await session.communityRequest(body: $0, actor: actor) }) } }
                    .disabled(store.busy || actor == nil).accessibilityIdentifier("community.mine.refresh")
                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    if store.isFresh(actor) {
                        ForEach(store.visibleItems(actor)) { item in
                            Button { run { actor in await store.read(id: item.id, current: { self.actor }, request: { try await session.communityRequest(body: $0, actor: actor) }) } } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(item.title.isEmpty ? status(item.status) : item.title)
                                    Text(status(item.status) + " · v\(item.version)").font(.caption).foregroundStyle(.secondary)
                                }
                            }.disabled(store.busy).accessibilityIdentifier("community.open.\(item.id)")
                        }
                        if store.items.isEmpty && store.selected == nil { Text(t("本页没有投稿。", "No submissions on this page.")) }
                        Text(store.complete ? t("当前分页已到末页；刷新可查看更新。", "This page is the last page of the current scan. Refresh to check updates.") : t("仍有后续投稿。每页均重新核对权限。", "More submissions are available. Access is checked on every page."))
                            .font(.caption)
                        if let cursor = store.nextCursor {
                            Button(t("下一页", "Next page")) { run { actor in await store.page(cursor: cursor, current: { self.actor }, request: { try await session.communityRequest(body: $0, actor: actor) }) } }
                                .disabled(store.busy).accessibilityIdentifier("community.mine.next")
                        }
                        if let item = store.visibleItem(actor) { detail(item) }
                    } else if !store.busy { Text(t("请刷新查看当前投稿及审核结果。", "Refresh to read current submissions and review results.")) }
                }
            }
            Section(t("投稿资料管理", "Submission data")) {
                Text(t("导出与删除仅覆盖此投稿模块：你的投稿、可见审核结果、你写的审核说明、关联及操作记录。导出最多涵盖每类100条；超过上限会明确失败。其他账户资料需另行处理。", "Export and deletion cover this submission module only: your submissions, visible review results, review notes you wrote, associations and operation records. Export is limited to 100 records per category and fails explicitly above that limit. Other account data needs separate handling."))
                    .font(.footnote)
                Button(t("导出投稿模块资料", "Export submission module data")) { run { actor in await store.export(current: { self.actor }, request: { try await session.communityRequest(body: $0, actor: actor) }) } }
                    .disabled(store.busy || actor == nil || !store.storageReady).accessibilityIdentifier("community.export")
                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    if let url = store.exportURL(actor) { ShareLink(item: url) { Label(t("分享导出文件", "Share exported file"), systemImage: "square.and.arrow.up") }.accessibilityIdentifier("community.export.share") }
                }
                Button(t("删除此模块的个人投稿资料", "Delete personal submission data in this module"), role: .destructive) { confirmation = .delete }
                    .disabled(store.busy || store.pending != nil || actor == nil || !store.storageReady).accessibilityIdentifier("community.delete")
            }
        }.navigationTitle(t("旅行投稿", "Travel submissions"))
            .task(id: session.dataScope) { await reload() }
            .onChange(of: scenePhase) { _, phase in if phase != .active { hide() } }
            .onChange(of: session.dataScope) { _, _ in hide(); store.bind(actor) }
            .onDisappear { hide() }
            .sheet(item: $placePicker) { token in
                NativeCommunityPlacePicker(session: session, actor: token.actor, chinese: chinese) { place in
                    guard actor == token.actor else { return }; draft.place = place; draft.associationConfirmed = true; placeUnavailable = false
                }
            }
            .sheet(item: $confirmation) { value in confirmationView(value) }
    }
    private func run(_ work: @escaping (NativeCommunityActor) async -> Void) {
        guard let actor, !store.busy else { return }
        action?.cancel(); action = Task { await work(actor) }
    }
    private func reload() async {
        hide(); store.bind(actor)
        guard let actor else { return }
        store.restore(actor) { try session.communityRecovery(actor: actor) }
        await store.page(current: { self.actor }, request: { try await session.communityRequest(body: $0, actor: actor) })
    }
    private func hide() { action?.cancel(); action = nil; confirmation = nil; placePicker = nil; draft = .init(); placeUnavailable = false; store.suspend() }
    private func validatePlace(_ place: NativeCommunityPlaceSelection?, actor: NativeCommunityActor) async -> Bool {
        guard let place else { return true }
        guard place.actor == actor, self.actor == actor else { return false }
        do {
            let bytes = try await session.tripRequest(path: "api/trips/native/v2/" + place.tripID, method: "GET")
            guard self.actor == actor, bytes.count <= 1_000_000, !Task.isCancelled else { return false }
            let trip = try JSONDecoder().decode(NativeTripDetail.self, from: bytes)
            guard trip.version == 2, trip.trip.id == place.tripID, trip.trip.headVersion == place.tripVersion else { return false }
            let reader = NativeSavedPlaceStore()
            await reader.load(scope: actor.scope, tripId: place.tripID, version: place.tripVersion, locale: chinese ? "zh" : "en", cursor: place.cursor,
                              current: { self.actor == actor }) { try await session.placeActionRequest(tripId: place.tripID, body: $0, actor: actor.scope) }
            defer { reader.clear() }
            return reader.visible(scope: actor.scope, tripId: place.tripID, version: place.tripVersion)?.contains(place.row) == true && place.row.mappingStatus == "current"
        } catch { return false }
    }
    private func perform(_ command: NativeCommunityCommand, actor: NativeCommunityActor) async {
        await store.perform(command, current: { self.actor }, read: { try session.communityRecovery(actor: actor) }, retain: { try session.rememberCommunity(body: $0, actor: actor) }, complete: { try session.completeCommunity($0, actor: actor) }, request: { try await session.communityRequest(body: $0, actor: actor) })
    }
    @ViewBuilder private func detail(_ item: NativeCommunityItem) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(status(item.status) + " · v\(item.version)").font(.headline)
            Text(item.id).font(.caption).textSelection(.enabled)
            if !item.title.isEmpty { Text(item.title).font(.title3); Text(item.content).textSelection(.enabled) }
            Text(t("作者身份：", "Author disclosure: ") + disclosure(item.disclosure)).font(.caption)
            if let benefit = item.benefit, !benefit.isEmpty { Text(t("作者自述利益关系：", "Author-reported interests: ") + benefit).font(.caption) }
            if item.reviewedAt != nil { Text(t("审核者身份：", "Reviewer disclosure: ") + disclosure(item.reviewerDisclosure ?? "unknown")).font(.caption) }
            if let note = item.reviewNote { Text(t("审核结果说明：", "Review result note: ") + note).textSelection(.enabled) }
            else if item.reviewedAt != nil { Text(t("未提供可向作者展示的审核说明。", "No author-visible review note is available.")) }
            if let place = item.place {
                Text(place.label ?? t("地点关联当前不可读", "Place association is currently unavailable"))
                Text(t("此关联只作为投稿依据，不会保存地点或加入行程。", "This association is submission metadata; it does not save a place or add it to a Trip.")).font(.caption)
            }
            ForEach(Array(item.history.enumerated()), id: \.offset) { _, event in
                Text(status(event.action) + " · v\(event.version) · " + event.createdAt).font(.caption)
            }
            if item.canWithdraw { Button(t("撤回并清除正文", "Withdraw and clear the text"), role: .destructive) { confirmation = .withdraw(item) }.disabled(store.busy || store.pending != nil || !store.storageReady).accessibilityIdentifier("community.withdraw") }
        }.accessibilityIdentifier("community.detail")
    }
    private func confirmationView(_ value: Confirmation) -> some View {
        NavigationStack {
            Form {
                switch value {
                case .withdraw(let item):
                    Text(t("撤回后服务端清除标题、正文、利益说明及地点关联。审核结果与最少审计记录保留。", "Withdrawal clears the title, text, reported interests and place association on the server. Review results and minimal audit records remain."))
                    Button(t("确认撤回", "Confirm withdrawal"), role: .destructive) {
                        confirmation = nil
                        guard store.visibleItem(actor) == item, let command = try? NativeCommunityCommand.withdraw(item) else { return }
                        run { actor in await perform(command, actor: actor) }
                    }.accessibilityIdentifier("community.withdraw.confirm")
                case .delete:
                    Text(t("只删除此模块的个人文字、地点关联、你写的审核说明与身份披露资料。保留防止旧操作复活正文的标记、已擦除投稿标记及审计元数据；他人的正文与其他账户模块不在范围内。", "Deletes personal text, place associations, review notes you wrote and disclosure data in this module. Replay fences, erased submission markers and audit metadata remain. Other authors’ text and other account modules are outside this scope."))
                    Button(t("确认删除此模块资料", "Confirm deletion for this module"), role: .destructive) {
                        confirmation = nil; draft = .init()
                        guard let command = try? NativeCommunityCommand.delete() else { return }; run { actor in await perform(command, actor: actor) }
                    }.accessibilityIdentifier("community.delete.confirm")
                case .abandon:
                    Text(t("服务端会终止尚未执行的同一操作；若已执行则返回当前结果。这不是证明网络中断时已回滚。", "The server stops this operation if it has not committed. If it committed, its current result is returned. This does not claim that an interrupted request rolled back."))
                    Button(t("确认停止并读取", "Confirm stop and read")) { confirmation = nil; run { actor in await store.recover(abandon: true, current: { self.actor }, complete: { try session.completeCommunity($0, actor: actor) }, request: { try await session.communityRequest(body: $0, actor: actor) }) } }
                        .accessibilityIdentifier("community.operation.abandon.confirm")
                }
            }.navigationTitle(t("确认操作范围", "Confirm operation scope"))
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button(t("取消", "Cancel")) { confirmation = nil } } }
        }
    }
    private func status(_ raw: String) -> String {
        switch raw {
        case "pending", "submitted": t("待审核", "Pending review")
        case "published": t("内部审核通过（未公开）", "Internally approved (not public)")
        case "reviewed": t("已内部审核", "Internally reviewed")
        case "rejected": t("审核拒绝", "Rejected")
        case "withdrawn": t("已撤回正文", "Text withdrawn")
        case "deleted": t("正文已删除", "Text deleted")
        default: t("未知状态", "Unknown state")
        }
    }
    private func disclosure(_ raw: String) -> String {
        switch raw {
        case "registered_user": t("注册用户", "Registered user")
        case "community_reviewer": t("社区审核人员", "Community reviewer")
        case "official": t("官方", "Official")
        case "employee": t("员工", "Employee")
        default: t("身份关系未核实", "Affiliation unverified")
        }
    }
    private func message(_ code: String) -> String {
        switch code {
        case "COMMUNITY_ONLY_DELETED": t("此投稿模块个人资料已删除；最少防重放与审计记录保留。其他账户资料未删除。", "Personal data in this submission module was deleted. Minimal replay fences and audit records remain. Other account data was not deleted.")
        case "COMMUNITY_ONLY_EXPORT": t("导出已就绪，仅此投稿模块；临时文件30秒内可分享。已分享副本无法召回。", "Export is ready for this submission module only. The temporary file can be shared for 30 seconds. Shared copies cannot be recalled.")
        case "ACKNOWLEDGED": t("操作已确认，以下为服务端当前状态。", "Operation acknowledged. The current server state is shown below.")
        case "COMMUNITY_DISABLED": t("当前环境未开放内部投稿。", "Internal submissions are disabled in this environment.")
        case "COMMUNITY_CAPACITY": t("超过本次完整处理上限，操作未完成。", "The limit for complete processing was exceeded; the operation did not complete.")
        case "COMMUNITY_PLACE_UNAVAILABLE": t("所选地点关联已失效，请重新读取或明确移除关联后投稿。", "The selected place association is unavailable. Read it again or explicitly remove it before submitting.")
        case "COMMUNITY_CONFLICT": t("投稿版本或操作已变化，请读取原操作结果并刷新。", "The submission version or operation changed. Read the original operation result and refresh.")
        case "OPERATION_ABANDONED": t("原操作已终止，可以重新编辑并明确投稿。", "The original operation was stopped. You can edit and explicitly submit again.")
        case "STORAGE_CLEANUP_REQUIRED", "STORAGE_UNAVAILABLE": t("本机存储尚未确认清理或保存成功，投稿操作已锁定。请刷新登录状态后重读。", "Local storage could not be verified. Submission actions are locked. Refresh the session and read again.")
        case "ABSENT_EXACT_RETRY_OR_ABANDON": t("未找到已提交回执。可明确同操作重试或终止；不会自动重试。", "No committed receipt was found. You can explicitly retry the same operation or stop it. Automatic retry is disabled.")
        case "RECOVERY_REQUIRED", "COMMUNITY_ACK_UNKNOWN": t("原操作结果未确认，请读取原操作结果。", "The original operation result is unconfirmed. Read its result.")
        default: t("目前无法读取此操作，请刷新身份与投稿。", "This operation is unavailable. Refresh the session and submissions.")
        }
    }
}

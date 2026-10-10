import SwiftUI

struct NativePlaceActionsView: View {
    let candidate: NativePlaceCandidate
    let session: NativeSession
    let chinese: Bool
    let active: Bool
    var savedReference: NativeSavedPlaceOpen? = nil
    @Environment(\.scenePhase) private var phase
    @State private var trips = NativePlaceActionTrips()
    @State private var store = NativePlaceActionStore()
    @State private var selectedTrip: String?
    @State private var dayId: String?
    @State private var start = Date()
    @State private var end = Date().addingTimeInterval(3600)
    @State private var windowConfirmed = false
    @State private var refresh = UUID()
    @State private var review: NativePlaceActionProposal?
    @State private var task: Task<Void, Never>?
    private var scope: NativeDataScope? { active && phase == .active ? session.dataScope : nil }
    private var target: NativePlaceActionSelection? {
        guard let scope, let detail = trips.detail, detail.trip.id == selectedTrip,
              trips.readable(scope: scope), let identity = try? NativePlaceActionIdentity(candidate: candidate) else { return nil }
        return .init(scope: scope, place: identity, tripId: detail.trip.id, baseVersion: detail.trip.headVersion)
    }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    private var locale: String { chinese ? "zh" : "en" }
    private struct Key: Equatable { let scope: NativeDataScope?; let candidate: NativePlaceCandidate; let refresh: UUID }
    private var key: Key { .init(scope: scope, candidate: candidate, refresh: refresh) }
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(t("收藏／问 VP／加入候选", "Save / Ask VP / Add candidate")).font(.headline)
            Text(t("收藏保存地点身份引用，不保存供应商正文，也不会加入日程。加入只生成候选，须在原提案查看差异并明确确认。", "Save persists an identity reference. Add creates a candidate for the original Proposal diff and explicit confirmation.")).font(.caption)
            if candidate.matchedCanonicalPoiId == nil {
                Text(t("此结果尚无 canonical 映射，请重新选择已映射的具体地点。", "This result has no canonical mapping. Reselect a mapped specific place."))
            } else if let scope {
                if trips.scope == scope {
                    Picker(t("同一行程", "Same Trip"), selection: $selectedTrip) {
                        Text(t("明确选择行程", "Choose a Trip explicitly")).tag(String?.none)
                        ForEach(trips.trips) { Text($0.title).tag(Optional($0.id)) }
                    }.accessibilityIdentifier("place.actions.trip")
                }
                Button(t("重读行程与地点身份", "Reread Trip and place identity")) { reload() }
                    .disabled(store.busy || trips.loading).accessibilityIdentifier("place.actions.refresh")
                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    if let target, let context = store.visible(target), review == nil {
                        currentActions(context, target: target)
                    } else {
                        Text(t("当前版本、映射或来源仍待核对；过期后请重读。未确认可行。", "Current version, mapping or sources need checking. Reread after expiry. Feasibility is pending."))
                            .accessibilityIdentifier("place.actions.pending")
                    }
                }
                if let saved = store.rememberedSaved, saved.target.scope == scope, store.visible(target) == nil {
                    Button(t("取消上次核实的准确收藏引用", "Forget the exact previously checked saved reference")) {
                        do { let command = try store.forgetRemembered(scope: scope); run { await perform(command, scope: scope, recover: false) } } catch { store.fail(error) }
                    }.disabled(store.busy || store.pending != nil).accessibilityIdentifier("place.actions.forget.withdrawn")
                }
                if let pending = store.pending {
                    Text(t("上次操作回执未确认。仅恢复原操作：", "The previous acknowledgement is unresolved. Recover only the original operation: ") + pending.command.tripId)
                    Button(t("读取原操作回执", "Read original operation receipt")) { run { await perform(nil, scope: scope, recover: true) } }
                        .disabled(store.busy).accessibilityIdentifier("place.actions.recover")
                    Button(t("停止未提交操作（已提交的不会撤销）", "Stop unsubmitted operation (committed work is preserved)")) {
                        run { await perform(nil, scope: scope, recover: true, abandon: true) }
                    }.disabled(store.busy).accessibilityIdentifier("place.actions.abandon")
                    if store.receiptAbsent {
                        Button(t("明确重试原请求", "Explicitly retry original request")) { run { await perform(nil, scope: scope, recover: true, retry: true) } }
                            .disabled(store.busy).accessibilityIdentifier("place.actions.retry.original")
                    }
                    Text(t("退出页面或暂时失去登录不会把未知操作当作未发生。换账号／明确退出沿本机清理规则处理。", "Leaving or losing authentication does not mean the operation failed. Account changes and explicit sign-out use the device cleanup rules.")).font(.caption)
                }
                if let receipt = store.receipt, store.scope == scope {
                    receiptView(receipt, scope: scope)
                }
                if store.busy || trips.loading { ProgressView() }
                if let notice = store.notice { Text(message(notice)).font(.caption).accessibilityIdentifier("place.actions.notice") }
                if trips.unavailable { Text(t("行程读取失败，请重新登录或刷新。", "Trip read failed. Reauthenticate or refresh.")) }
            } else { Text(t("请登录后操作自己的行程。", "Sign in to act on your own Trip.")) }
            Link(t("打开 VP 手动提问", "Open VP to ask manually"), destination: URL(string: "visepanda://ask")!)
        }
        .task(id: key) { store.journalObservation = session.journalDataObservation(.placeAction); await loadTrips() }
        .task(id: selectedTrip) { await selectTrip() }
        .onChange(of: selectedTrip) { _, _ in task?.cancel(); store.invalidateContext(); dayId = nil; windowConfirmed = false }
        .onChange(of: dayId) { _, _ in windowConfirmed = false }
        .onChange(of: start) { _, _ in windowConfirmed = false }
        .onChange(of: end) { _, _ in windowConfirmed = false }
        .onChange(of: scope) { _, _ in clear() }
        .onDisappear { if review == nil { clear() } }
        .sheet(item: $review, onDismiss: { reload() }) { NativePlaceActionReview(reference: $0, chinese: chinese) }
    }
    @ViewBuilder private func currentActions(_ context: NativePlaceActionContext, target: NativePlaceActionSelection) -> some View {
        if context.sourceCandidatesStatus == "unavailable" { Text(t("来源读取暂不可用，不能把缺少结果当成没有约束。", "Source reader unavailable; missing results do not mean no constraints.")).font(.caption) }
        Text(t("当前行程版本：", "Current Trip version: ") + String(context.tripVersion))
        Text(t("路线、停留、预约、开放时段、缓冲与费用未齐全时保持待核；当前路况不能保证未来行程。", "Routes, stay duration, reservations, opening windows, buffers and costs remain pending until supported. Current traffic does not guarantee a future Trip.")).font(.caption)
        if context.saved?.status == "saved" {
            Text(t("本次重读：已收藏引用", "This read: saved reference")).accessibilityIdentifier("place.actions.saved.current")
            Button(t("取消此收藏引用", "Unsave this reference")) { submit("unsave", target: target) }
                .disabled(store.busy || store.pending != nil)
        } else {
            Button(t("收藏此地点引用", "Save this place reference")) { submit("save", target: target) }
                .disabled(store.busy || store.pending != nil).accessibilityIdentifier("place.actions.save")
        }
        Button(t("在同一个 VP 准备提问", "Prepare question in the same VP")) {
            run {
                let handoff = await store.ask(target: target, locale: locale, current: { self.target }) { try await session.placeActionRequest(tripId: target.tripId, body: $0, actor: target.scope) }
                if let handoff, self.target == target, scope == target.scope { session.prepareExploreAsk(handoff) }
            }
        }.disabled(store.busy || store.pending != nil).accessibilityIdentifier("explore.place.ask")
        Text(t("仅准备同一 canonical 引用，仍由你明确发送；没有授予供应商或知识使用资格。", "Prepares the same canonical reference for your explicit send. Provider and knowledge eligibility remain unconfirmed.")).font(.caption)
        Picker(t("加入哪一天", "Day for the candidate"), selection: $dayId) {
            Text(t("明确选择一天", "Choose a day explicitly")).tag(String?.none)
            ForEach(context.days) { Text($0.date).tag(Optional($0.id)) }
        }.accessibilityIdentifier("place.actions.day")
        DatePicker(t("开始时间", "Start"), selection: $start)
        DatePicker(t("结束时间", "End"), selection: $end)
        Toggle(t("我明确选择此时间窗口（不代表已核实停留时长）", "I explicitly choose this time window (not verified stay duration)"), isOn: $windowConfirmed)
        Button(t("生成同一行程候选并查看差异", "Create same-Trip candidate and review diff")) { submit("add", target: target) }
            .disabled(store.busy || store.pending != nil || dayId == nil || !windowConfirmed || end <= start || end.timeIntervalSince(start) > 86400)
            .accessibilityIdentifier("place.actions.add")
    }
    @ViewBuilder private func receiptView(_ receipt: NativePlaceActionReceipt, scope: NativeDataScope) -> some View {
        Text(t("历史操作回执：", "Historical operation receipt: ") + receipt.operationId).font(.caption)
        if receipt.action == "add" {
            if let preview = receipt.preview {
                Text(preview.status == "infeasible" ? t("本候选发现时间约束冲突", "Candidate has timing conflicts") : t("本候选可行性待核", "Candidate feasibility pending"))
                Text(t("本次一处修改影响 ", "This edit affects ") + String(preview.edges.count) + t(" 条有向路段；移除旧衔接 ", " directed legs; removes ") + String(preview.removed.count) + t(" 条。", " old connections."))
                    .accessibilityIdentifier("place.actions.affected.legs")
                ForEach(Array(preview.edges.enumerated()), id: \.offset) { _, edge in
                    Text(legLabel(edge.fromItemId, newItem: preview.newItemId, receipt: receipt) + " → " + legLabel(edge.toItemId, newItem: preview.newItemId, receipt: receipt))
                    Text(t("本候选衔接出发时间：", "Candidate connection departure: ") + edge.departureAt.formatted()).font(.caption)
                }
                Text(t("待核约束：", "Pending constraints: ") + String(preview.pendingCount))
                Text(t("尚未调用路线供应商。路线观察时间、计费单位与成本未知。请在原提案的约束核验中明确选择真实端点与同意，再查询受影响路段。", "No route provider was called. Observation time, billing unit and cost are unknown. In the original Proposal constraint check, explicitly select real endpoints and consent before querying affected legs.")).font(.caption)
                if preview.sourceExpiresAt <= Date() { Text(t("此预览来源窗口已过期，原提案核验须重新读取。", "Preview source window expired; original Proposal checks must reread.")) }
            }
            Text(t("候选已持久化；尚未宣称行程已改变。请查看原差异与确认结果，返回后重读同一行程。", "Candidate persisted. Review the original diff and confirmation result, then reread the same Trip on return."))
            if let pointer = receipt.proposalReview {
                Button(t("查看原提案差异／明确确认", "Review original Proposal diff / explicit confirmation")) {
                    guard self.scope == scope, !store.busy, store.pending == nil else { return }
                    store.invalidateContext()
                    review = .init(scope: scope, tripId: pointer.tripId, baseVersion: pointer.baseVersion, proposalId: pointer.proposalId, revision: pointer.revision, digest: pointer.digest)
                }.accessibilityIdentifier("place.actions.proposal")
            } else { Text(t("原提案已变化或过期，请重新读取；不会创建替代提案。", "Original Proposal changed or expired. Reread; no replacement is created.")) }
        } else {
            Text(receipt.savedStatus == "saved" ? t("收藏写入回执已核对，仍须重读当前状态。", "Save acknowledgement checked; reread current state.") : t("取消收藏回执已核对，仍须重读当前状态。", "Unsave acknowledgement checked; reread current state."))
            if receipt.savedStatus == "saved" {
                Button(t("忘记此准确收藏引用（即使来源已撤回）", "Forget this exact saved reference (including withdrawn source)")) {
                    do { let command = try store.forgetCommand(from: receipt, scope: scope); run { await perform(command, scope: scope, recover: false) } } catch { store.fail(error) }
                }.disabled(store.busy || store.pending != nil).accessibilityIdentifier("place.actions.forget")
            }
        }
        if let detail = trips.detail, detail.trip.id == receipt.tripId, trips.readable(scope: scope) {
            Text(t("同一行程已重读：版本 ", "Same Trip reloaded: version ") + String(detail.trip.headVersion)).accessibilityIdentifier("place.actions.reloaded")
            ForEach(detail.content.days) { day in ForEach(day.items) { Text(day.date + " · " + $0.title) } }
        }
    }
    private func legLabel(_ id: String, newItem: String, receipt: NativePlaceActionReceipt) -> String {
        if id == newItem { return t("新增地点候选", "New place candidate") }
        guard let scope, let detail = trips.detail, detail.trip.id == receipt.tripId, detail.trip.headVersion == receipt.tripVersion,
              trips.readable(scope: scope), let item = detail.content.days.flatMap(\.items).first(where: { $0.id == id }) else {
            return t("原行程条目（需重读）", "Original Trip item (reread required)")
        }
        return item.title
    }
    private func loadTrips() async {
        guard let scope, candidate.matchedCanonicalPoiId != nil else { clear(); return }
        store.restore(scope: scope) { try session.pendingPlaceAction(actor: scope) }
        await trips.list(scope: scope, current: { self.scope }) { try await session.tripRequest(path: "api/trips/native/v2", method: "GET") }
        guard self.scope == scope, !Task.isCancelled else { return }
        if selectedTrip == nil, let savedReference, savedReference.scope == scope { selectedTrip = savedReference.tripId }
        if !trips.trips.contains(where: { $0.id == selectedTrip }) { selectedTrip = nil }
        if let selectedTrip { await readTrip(selectedTrip, scope: scope) }
    }
    private func selectTrip() async {
        guard let scope, let selectedTrip else { store.invalidateContext(); return }
        await readTrip(selectedTrip, scope: scope)
    }
    private func readTrip(_ id: String, scope: NativeDataScope) async {
        await trips.select(tripId: id, scope: scope, current: { self.scope }) { try await session.tripRequest(path: "api/trips/native/v2/" + id, method: "GET") }
        guard self.scope == scope, selectedTrip == id, !Task.isCancelled, let target else { return }
        if let savedReference, savedReference.scope == scope, savedReference.tripId == id, savedReference.row.selection == target.place {
            store.rememberSaved(savedReference.row, target: target)
        }
        await store.load(target: target, locale: locale, current: { self.target }) { try await session.placeActionRequest(tripId: id, body: $0, actor: scope) }
    }
    private func submit(_ action: String, target: NativePlaceActionSelection) {
        do {
            let command = try store.command(target: target, action: action, dayId: dayId, startsAt: start, endsAt: end, locale: locale)
            run { await perform(command, scope: target.scope, recover: false) }
        } catch { store.fail(error) }
    }
    private func perform(_ command: NativePlaceActionCommand?, scope: NativeDataScope, recover: Bool, retry: Bool = false, abandon: Bool = false) async {
        await store.perform(command: command, scope: scope, recover: recover, retryOriginal: retry, abandon: abandon, current: { self.scope },
                            read: { try session.pendingPlaceAction(actor: scope) }, retain: { try session.rememberPlaceAction($0, actor: scope) },
                            complete: { try session.completePlaceAction($0, actor: scope) },
                            request: { try await session.placeActionRequest(tripId: $0, body: $1, actor: scope) })
        guard self.scope == scope, !Task.isCancelled, store.pending == nil, let receipt = store.receipt else { return }
        if selectedTrip == receipt.tripId { await readTrip(receipt.tripId, scope: scope) }
    }
    private func reload() { task?.cancel(); store.invalidateContext(); refresh = UUID() }
    private func run(_ action: @escaping () async -> Void) { guard task == nil || !store.busy else { return }; task?.cancel(); task = Task { await action() } }
    private func clear() { task?.cancel(); task = nil; trips.clear(); store.clear(); selectedTrip = nil; dayId = nil; windowConfirmed = false; review = nil }
    private func message(_ code: String) -> String {
        switch code {
        case "PLACE_ACTION_CANCELLED": t("原操作已由服务端原子终止，未改动行程。请重读后重新选择。", "Original operation atomically stopped by the server. Reread and reselect.")
        case "STALE_TRIP_VERSION": t("行程版本已变化，请重读后重新选择。", "Trip version changed. Reread and reselect.")
        case "MAPPING_CHANGED": t("地点映射已变化，请重新选择。原收藏仍可准确取消。", "Place mapping changed. Reselect; the saved reference can still be forgotten.")
        case "CAS_CONFLICT", "IDEMPOTENCY_KEY_REUSE": t("发现并发或请求冲突，请读取原回执与当前状态。", "Concurrent or request conflict. Read original receipt and current state.")
        case "PLACE_ACTION_RECOVERY_REQUIRED", "PLACE_ACTION_RECEIPT_ABSENT": t("原操作尚未结清；请读回原回执，本次未读到回执不代表写入未发生，只能重试同一请求。", "Original operation unresolved. Read its receipt; an absent read does not prove no write occurred. Retry only the same request.")
        case "PLACE_ACTION_RELOAD_REQUIRED": t("准确回执已核对，正在重读同一对象。", "Exact acknowledgement checked. Rereading the same object.")
        default: t("暂不可用、来源已撤回或权限未确认。请重读或重新登录；未知写入保留原操作。", "Unavailable, withdrawn or authority unconfirmed. Reread or reauthenticate; unknown writes retain their original operation.")
        }
    }
}

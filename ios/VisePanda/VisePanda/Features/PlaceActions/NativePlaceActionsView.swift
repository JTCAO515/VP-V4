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
    private struct Key: Equatable { let scope: NativeDataScope?; let candidate: NativePlaceCandidate; let refresh: UUID; let locale: String }
    private var key: Key { .init(scope: scope, candidate: candidate, refresh: refresh, locale: locale) }
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            placeOverview
            Text(t("围绕这个地点", "Use this place")).font(.title3.bold())
            Text(t("收藏便于再找到；问 VP 先准备问题；加入行程先查看候选差异，再由你确认。", "Save to find it again, prepare a question for VP, or review a Trip candidate before confirming.")).font(.subheadline)
            if candidate.matchedCanonicalPoiId == nil {
                Text(t("还未核对到准确地点，收藏和加入行程暂不可用。请返回地点列表，确认城市、分店或入口后重新选择。", "This result is not matched to a verified place yet. Return to the place list and check the city, branch or entrance before saving or adding."))
            } else if let scope {
                if trips.scope == scope {
                    Text(t("1 · 选择行程", "1 · Choose a Trip")).font(.headline)
                    Picker(t("同一行程", "Same Trip"), selection: $selectedTrip) {
                        Text(t("明确选择行程", "Choose a Trip explicitly")).tag(String?.none)
                        ForEach(trips.trips) { Text($0.title).tag(Optional($0.id)) }
                    }.pickerStyle(.menu).accessibilityIdentifier("place.actions.trip")
                    if trips.trips.isEmpty && !trips.loading && !trips.unavailable {
                        Text(t("当前没有可选行程。请先在行程中创建，再回来刷新。", "No Trips to choose from. Create one in Trips, then return and refresh.")).font(.subheadline)
                    }
                }
                Button(t("刷新地点与行程", "Refresh place and Trip")) { reload() }
                    .disabled(store.busy || trips.loading).accessibilityIdentifier("place.actions.refresh")
                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    if let target, let context = store.visible(target), review == nil {
                        currentActions(context, target: target)
                    } else {
                        Text(pendingExplanation)
                            .accessibilityIdentifier("place.actions.pending")
                    }
                }
                if let saved = store.rememberedSaved, saved.target.scope == scope, store.visible(target) == nil {
                    Button(t("取消上次核实的准确收藏引用", "Forget the exact previously checked saved reference")) {
                        do { let command = try store.forgetRemembered(scope: scope); run { await perform(command, scope: scope, recover: false) } } catch { store.fail(error) }
                    }.disabled(store.busy || store.pending != nil).accessibilityIdentifier("place.actions.forget.withdrawn")
                }
                if let pending = store.pending {
                    Label(t("上次操作结果待确认", "Previous result needs checking"), systemImage: "exclamationmark.arrow.circlepath").font(.headline)
                    Text(t("请先读取上次结果，避免重复收藏或生成候选。停止操作只终止未提交部分，已提交内容保留。", "Read the previous result before saving or creating another candidate. Stopping only ends unsubmitted work; committed work is preserved.")).font(.subheadline)
                    Text(t("原行程：", "Original Trip: ") + pending.command.tripId).font(.caption).textSelection(.enabled)
                    Button(t("检查上次操作结果", "Check previous operation result")) { run { await perform(nil, scope: scope, recover: true) } }
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
                if store.busy || trips.loading { ProgressView(t("正在核对，请稍候…", "Checking, please wait…")) }
                if let notice = store.notice { Text(message(notice)).font(.caption).accessibilityIdentifier("place.actions.notice") }
                if trips.unavailable { Text(t("行程读取失败，请重新登录或刷新。", "Trip read failed. Reauthenticate or refresh.")) }
            } else {
                Label(t("操作暂不可用", "Actions unavailable"), systemImage: "lock")
                Text(session.dataScope == nil
                     ? t("请先登录，再回来选择自己的行程。上次操作若结果未知，登录后先检查原操作结果。", "Sign in, then return to choose your Trip. If a previous result is unknown, check that operation after signing in.")
                     : t("页面暂未激活。返回此页面后刷新地点与行程，再继续。", "This page is inactive. Return and refresh the place and Trip before continuing."))
            }
            Link(t("打开 VP 手动提问", "Open VP to ask manually"), destination: URL(string: "visepanda://ask")!)
        }
        .task(id: key) { store.journalObservation = session.journalDataObservation(.placeAction); await loadTrips() }
        .task(id: selectedTrip) { await selectTrip() }
        .onChange(of: selectedTrip) { _, _ in task?.cancel(); store.invalidateContext(); dayId = nil; windowConfirmed = false }
        .onChange(of: dayId) { _, _ in windowConfirmed = false }
        .onChange(of: start) { _, _ in windowConfirmed = false }
        .onChange(of: end) { _, _ in windowConfirmed = false }
        .onChange(of: scope) { _, _ in clear() }
        .onChange(of: candidate) { _, _ in clear() }
        .onChange(of: chinese) { _, _ in
            task?.cancel(); store.invalidateContext(); dayId = nil; windowConfirmed = false; review = nil
        }
        .environment(\.locale, Locale(identifier: chinese ? "zh_CN" : "en_US"))
        .onDisappear { if review == nil { clear() } }
        .sheet(item: $review, onDismiss: { reload() }) { NativePlaceActionReview(reference: $0, chinese: chinese) }
    }
    private var pendingExplanation: String {
        if store.pending != nil { return t("先检查上次操作结果，再继续此地点的新操作。", "Check the previous operation before starting a new one for this place.") }
        if trips.loading || store.busy { return t("正在核对所选行程与地点，请稍候。", "Checking the selected Trip and place. Please wait.") }
        if selectedTrip == nil { return t("先明确选择一个行程，收藏、提问和候选将使用同一地点与行程。", "Choose a Trip first. Save, Ask and Add will use the same place and Trip.") }
        return t("资料已过期或尚未核对。请刷新地点与行程；路线与可行性仍待核。", "Details have expired or need checking. Refresh the place and Trip; routes and feasibility remain pending.")
    }
    private var placeOverview: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(t("选中的地点", "Selected place"), systemImage: "mappin.circle.fill").font(.headline)
            Text(candidate.rawName).font(.title2.bold()).textSelection(.enabled)
            Text(t("地点名称来源：", "Place name source: ") + (candidate.provider == .amap ? t("高德地图", "AMap") : t("腾讯地图", "Tencent Maps")))
                .font(.subheadline)
            Text(t("保留来源原名；其他语言名称、地址及准确入口未在此处核实。请结合上方地点详情确认，名称相似不代表同一地点。", "The source name is preserved. Other language names, address and exact entrance are unverified here. Check the place details above; similar names do not establish identity.")).font(.caption)
            DisclosureGroup(t("查看地点身份与来源", "Place identity and source")) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(t("VP 地点 ID：", "VP place ID: ") + (candidate.matchedCanonicalPoiId ?? t("待核对", "Pending match")))
                    Text(t("地图来源地点 ID：", "Map source place ID: ") + candidate.providerPoiId)
                    Text(t("收藏、提问和候选沿用以上同一引用；来源 ID 与 VP 地点 ID 分开核对。", "Save, Ask and Add keep this same reference. The map source ID and VP place ID are checked separately."))
                }.font(.caption).textSelection(.enabled)
            }.accessibilityIdentifier("place.actions.identity")
        }.padding().frame(maxWidth: .infinity, alignment: .leading)
            .background(.quaternary, in: RoundedRectangle(cornerRadius: 16))
    }
    @ViewBuilder private func currentActions(_ context: NativePlaceActionContext, target: NativePlaceActionSelection) -> some View {
        if context.sourceCandidatesStatus == "unavailable" { Text(t("来源资料暂不可读，缺少结果不代表没有约束。", "Source details are unavailable; missing results do not mean no constraints.")).font(.subheadline) }
        Text(t("本次核对的地点名称：", "Place name checked for this read: ") + context.title).textSelection(.enabled)
        Text(t("行程版本：", "Trip version: ") + String(context.tripVersion)).font(.caption)
        VStack(alignment: .leading, spacing: 10) {
            Text(t("2 · 收藏或问 VP", "2 · Save or ask VP")).font(.headline)
            if context.saved?.status == "saved" {
                Label(t("本次刷新：已收藏", "Saved on this read"), systemImage: "bookmark.fill").accessibilityIdentifier("place.actions.saved.current")
                Button(t("取消收藏", "Unsave")) { submit("unsave", target: target) }
                    .disabled(store.busy || store.pending != nil)
            } else {
                Button(t("收藏这个地点", "Save this place")) { submit("save", target: target) }
                    .disabled(store.busy || store.pending != nil).accessibilityIdentifier("place.actions.save")
            }
            Text(t("只保存地点引用，不保存地图供应商正文，也不会加入日程。", "Saves a place reference, without storing map supplier content or adding to your schedule.")).font(.caption)
            Button(t("在同一个 VP 准备提问", "Prepare question in the same VP")) {
                run {
                    let handoff = await store.ask(target: target, locale: locale, current: { self.target }) { try await session.placeActionRequest(tripId: target.tripId, body: $0, actor: target.scope) }
                    if let handoff, self.target == target, scope == target.scope { session.prepareExploreAsk(handoff) }
                }
            }.disabled(store.busy || store.pending != nil).accessibilityIdentifier("explore.place.ask")
            Text(t("带入同一地点，仍由你明确发送问题；供应商资料与知识使用资格待核。", "Prepares the same place for you to send explicitly. Eligibility to use supplier information and knowledge remains unconfirmed.")).font(.caption)
            if store.pending != nil || store.busy { Text(pendingExplanation).font(.caption) }
        }.buttonStyle(.bordered)
        NativePlaceCandidatePanel(
            chinese: chinese, days: context.days.map { .init(id: $0.id, date: $0.date) },
            dayId: $dayId, start: $start, end: $end, windowConfirmed: $windowConfirmed,
            busy: store.busy, unresolved: store.pending != nil
        ) { submit("add", target: target) }
        NativePlaceRoutePendingPanel(chinese: chinese)
    }
    @ViewBuilder private func receiptView(_ receipt: NativePlaceActionReceipt, scope: NativeDataScope) -> some View {
        Text(t("操作记录（仍须刷新当前状态）：", "Operation record (refresh to check current state): ") + receipt.operationId).font(.caption)
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
    private func reload() { task?.cancel(); store.invalidateContext(); dayId = nil; windowConfirmed = false; refresh = UUID() }
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

// IOS003_PRESENTATION_BEGIN
/// Presentation only. The action store remains the authority for every request.
enum NativePlaceAddAvailability: Equatable {
    case ready, busy, unresolved, noDays, chooseDay, confirmWindow, invalidOrder, tooLong

    static func evaluate(busy: Bool, unresolved: Bool, days: [String], dayId: String?,
                         confirmed: Bool, start: Date, end: Date) -> Self {
        if unresolved { return .unresolved }
        if busy { return .busy }
        if days.isEmpty { return .noDays }
        guard let dayId, days.contains(dayId) else { return .chooseDay }
        if end <= start { return .invalidOrder }
        if end.timeIntervalSince(start) > 86400 { return .tooLong }
        if !confirmed { return .confirmWindow }
        return .ready
    }
    func explanation(chinese: Bool) -> String {
        let pair: (String, String) = switch self {
        case .ready: ("下一步查看候选差异；明确确认后才能改变行程。", "Next, review the candidate diff. Your explicit confirmation is required to change the Trip.")
        case .busy: ("正在核对，请稍候。", "Checking. Please wait.")
        case .unresolved: ("先检查上次操作结果，避免重复生成候选。", "Check the previous result before creating another candidate.")
        case .noDays: ("这个行程还没有可选日期。请在行程中添加日期后刷新。", "This Trip has no days to choose from. Add a day in Trips, then refresh.")
        case .chooseDay: ("请明确选择这个行程中的一天。", "Explicitly choose a day in this Trip.")
        case .confirmWindow: ("请核对开始、结束时间，再勾选时间窗口。默认时间不代表你的选择。", "Check start and end, then confirm the time window. Default times are not your selection.")
        case .invalidOrder: ("结束时间须晚于开始时间。", "End must be after start.")
        case .tooLong: ("时间窗口不能超过 24 小时。请缩短后重新核对。", "The time window cannot exceed 24 hours. Shorten it and check again.")
        }
        return chinese ? pair.0 : pair.1
    }
}
// IOS003_PRESENTATION_END

private struct NativePlaceCandidatePanel: View {
    struct Day: Identifiable { let id: String; let date: String }
    let chinese: Bool
    let days: [Day]
    @Binding var dayId: String?
    @Binding var start: Date
    @Binding var end: Date
    @Binding var windowConfirmed: Bool
    let busy: Bool
    let unresolved: Bool
    let add: () -> Void
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    private var availability: NativePlaceAddAvailability {
        .evaluate(busy: busy, unresolved: unresolved, days: days.map(\.id), dayId: dayId,
                  confirmed: windowConfirmed, start: start, end: end)
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(t("3 · 准备行程候选", "3 · Prepare a Trip candidate")).font(.headline)
            Text(t("选择日期和时间，只生成候选，不直接修改行程。", "Choose a day and time to create a candidate for review.")).font(.subheadline)
            Picker(t("加入哪一天", "Day for the candidate"), selection: $dayId) {
                Text(t("明确选择一天", "Choose a day explicitly")).tag(String?.none)
                ForEach(days) { Text($0.date).tag(Optional($0.id)) }
            }.pickerStyle(.menu).accessibilityIdentifier("place.actions.day")
            DatePicker(t("开始时间", "Start"), selection: $start)
                .accessibilityIdentifier("place.actions.start")
            DatePicker(t("结束时间", "End"), selection: $end)
                .accessibilityIdentifier("place.actions.end")
            Text(t("显示时区：", "Displayed time zone: ") + TimeZone.current.identifier).font(.caption)
            Text(t("请核对所选行程日期与时区。这里不自动换算日期，也不据此认定停留时长可行。", "Check the Trip day and time zone. Dates are not converted automatically and this does not establish a feasible stay duration.")).font(.caption)
            Toggle(t("我已明确选择这个时间窗口（停留时长仍待核）", "I explicitly choose this window (stay duration still pending)"), isOn: $windowConfirmed)
                .accessibilityIdentifier("place.actions.window.confirm")
            Button(t("生成候选 · 下一步查看差异", "Create candidate · Review diff next")) { add() }
                .buttonStyle(.borderedProminent).disabled(availability != .ready)
                .accessibilityIdentifier("place.actions.add")
            Text(availability.explanation(chinese: chinese)).font(.subheadline)
                .accessibilityIdentifier("place.actions.add.reason")
        }
        .onChange(of: dayId) { _, _ in windowConfirmed = false }
        .onChange(of: start) { _, _ in windowConfirmed = false }
        .onChange(of: end) { _, _ in windowConfirmed = false }
        .padding().frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 16))
    }
}

private struct NativePlaceRoutePendingPanel: View {
    let chinese: Bool
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(t("路线与费用 · 待核", "Routes and costs · Pending"), systemImage: "point.topleft.down.curvedto.point.bottomright.up").font(.headline)
            Text(t("步行、公交、驾车：此处尚未查询路线。距离、耗时、换乘、票价和当前路况均未知。", "Walking, transit, driving: no routes have been queried here. Distance, duration, transfers, fares and current traffic are unknown.")).font(.subheadline)
            Text(t("在原候选差异中核对起终点、入口、方式、出发时间和资料来源；确认供应商用途、计费与同意后才查询。公交规划不代表实时到站，驾车规划不代表已叫车。", "In the original candidate review, check endpoints, entrances, mode, departure time and sources. Check supplier purpose, billing and consent before querying. Transit planning does not establish real-time arrivals; driving planning does not book a ride.")).font(.caption)
            Text(t("开放时间、预约、停留、缓冲与无障碍资料未齐时保持待核；当前路况不能保证未来行程。", "Opening hours, reservations, stay, buffers and accessibility remain pending without supporting details. Current traffic does not guarantee a future Trip.")).font(.caption)
        }.padding().frame(maxWidth: .infinity, alignment: .leading)
            .background(.quaternary, in: RoundedRectangle(cornerRadius: 16))
            .accessibilityIdentifier("place.actions.routes.pending")
    }
}

#if DEBUG
/// Main may mount this leaf directly: NativePlaceActionsSampleExperience().
/// This entry uses the production presentation panels with synthetic callbacks only.
struct NativePlaceActionsSampleExperience: View {
    @Environment(\.locale) private var locale
    @State private var chineseOverride: Bool?
    private var chinese: Bool { chineseOverride ?? (locale.language.languageCode?.identifier == "zh") }
    init() {}
    var body: some View {
        VStack(spacing: 0) {
            Picker("Sample language / 样例语言", selection: Binding(get: { chinese }, set: { chineseOverride = $0 })) {
                Text("中文").tag(true)
                Text("English").tag(false)
            }.pickerStyle(.segmented).padding()
                .accessibilityIdentifier("place.sample.language")
            NativePlaceActionsSample(chinese: chinese).id(chinese)
        }.onChange(of: locale.identifier) { _, _ in chineseOverride = nil }
    }
}

/// Isolated in-memory interaction fixture. Never creates a session, writes data or calls a provider.
private struct NativePlaceActionsSample: View {
    let chinese: Bool
    @State private var dayId: String?
    @State private var start = Date(timeIntervalSince1970: 1792026000)
    @State private var end = Date(timeIntervalSince1970: 1792029600)
    @State private var confirmed = false
    @State private var saved = false
    @State private var questionPrepared = false
    @State private var review = false
    @State private var result = false
    @State private var unresolved = false
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(t("Sample · 未连接 · 仅内存交互", "Sample · Unconnected · In-memory interactions only")).font(.headline)
                Text(t("示例地点 / Sample place", "Sample place / 示例地点")).font(.title2)
                Text(t("来源：合成样例；示例行程和地点均非真实资料。", "Source: synthetic fixture. This place and Trip are not real records."))
                Button(saved ? t("取消样例收藏", "Unsave sample") : t("样例收藏", "Save sample")) { saved.toggle() }.disabled(unresolved)
                Button(t("准备样例问题", "Prepare sample question")) { questionPrepared = true }.disabled(unresolved)
                if questionPrepared { Text(t("样例问题已准备，未发送给 VP。", "Sample question prepared; nothing sent to VP.")) }
                NativePlaceCandidatePanel(chinese: chinese, days: [.init(id: "sample-day", date: "2026-10-15")], dayId: $dayId, start: $start, end: $end, windowConfirmed: $confirmed, busy: false, unresolved: unresolved) { review = true; result = false }
                if review {
                    Text(t("Sample 差异：示例日期新增一个地点候选。", "Sample diff: add one place candidate to the sample day."))
                    Button(t("确认样例差异（仅内存）", "Confirm sample diff (memory only)")) { review = false; result = true }
                        .disabled(unresolved)
                    Button(t("取消样例差异", "Cancel sample diff")) { review = false }
                }
                if result { Text(t("样例确认完成，真实行程未改变。", "Sample confirmation complete; no real Trip changed.")) }
                Toggle(t("模拟未知操作结果", "Simulate an unknown result"), isOn: $unresolved)
                if unresolved {
                    Text(t("Sample：操作结果未知，不能假定写入失败。", "Sample: the result is unknown; a failed write cannot be assumed."))
                    Button(t("样例读取原操作结果", "Read original sample result")) { unresolved = false }
                    Button(t("样例停止未提交操作", "Stop unsubmitted sample operation")) { unresolved = false; review = false }
                }
                NativePlaceRoutePendingPanel(chinese: chinese)
                Button(t("重置样例", "Reset sample")) {
                    dayId = nil; confirmed = false; saved = false; questionPrepared = false
                    review = false; result = false; unresolved = false
                }
            }.padding()
        }.environment(\.locale, Locale(identifier: chinese ? "zh_CN" : "en_US"))
    }
}

#Preview("IOS-003 Sample 双语") { NativePlaceActionsSampleExperience() }
#Preview("IOS-003 Sample 大字") {
    NativePlaceActionsSampleExperience().environment(\.dynamicTypeSize, .accessibility3)
}
#endif

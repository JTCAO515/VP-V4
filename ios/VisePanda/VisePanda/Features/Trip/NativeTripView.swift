import SwiftUI
import UIKit

struct NativeTripView: View {
    @Environment(AppSettings.self) private var settings
    @State private var store = NativeTripStore()
    @State private var newTitle = ""
    @State private var shareSource: NativeTripShareSource?
    @State private var screenshotReviewSource: NativeScreenshotReviewSource?
    @State private var inboxCleanupFailed = false
    @State private var confirmVisible = false
    @State private var reviewedReference: String?
    @State private var discardVisible = false
    @State private var archiveVisible = false
    @State private var archiveReference: String?
    @State private var planningRequest = ""
    @State private var outline: NativeRelativeOutline?
    @State private var outlineTitles: [String] = []
    @State private var outlineStartDate = ""
    @State private var outlineNotice: String?
    @FocusState private var titleFocused: Bool
    private var chinese: Bool { settings.selectedLocale == .zh }
    private var session: NativeSession { settings.nativeSession }
    private func text(_ en: String, _ zh: String) -> String { chinese ? zh : en }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: VPSpacing.section) {
                BrandHeader()
                Text(text("Test trips", "测试行程"))
                    .font(.headline)
                if session.dataScope == nil || store.scope != session.dataScope {
                    Text(text("Sign in to a test account in Profile to open your trips.", "请在「我的」登录测试账号，再打开行程。"))
                } else {
                    tripList
                    if let notice = store.notice {
                        Text(message(notice)).foregroundStyle(Color.vpSecondaryText)
                            .accessibilityIdentifier("trip.notice")
                    }
                    if inboxCleanupFailed {
                        Text(text("Protected screenshot cleanup is pending. Unlock the device to retry.", "受保护截图清理尚未完成。请解锁设备后重试。"))
                            .foregroundStyle(Color.vpSecondaryText)
                    }
                    if let detail = store.detail {
                        confirmed(detail)
                        if store.canEdit && store.draft == nil && store.pending == nil { outlineComposer }
                        if let pending = store.pending { proposal(pending) }
                        if let draft = store.draft {
                            NativeTripDraftEditor(draft: draftBinding(draft), chinese: chinese)
                                .id(draft.id)
                                .disabled(store.busy || store.pending != nil || store.hasUncertainProposal)
                            Button(text("Review proposed changes", "审阅拟议变化")) {
                                Task { await store.propose(using: session) }
                            }
                            .buttonStyle(.borderedProminent)
                            .accessibilityIdentifier("trip.draft.propose")
                            .disabled(store.busy || !store.canEdit || store.pending != nil || draft.patch.operations.isEmpty || draft.baseVersion != detail.trip.headVersion)
                            Button(text("Discard local draft", "放弃本机草稿"), role: .destructive) { discardVisible = true }
                                .accessibilityIdentifier("trip.draft.discard")
                                .disabled(store.busy || store.pending != nil || store.hasUncertainProposal)
                        } else if store.pending == nil && store.canEdit {
                            Button(text("Edit a draft", "编辑草稿")) { store.beginDraft() }
                                .buttonStyle(.borderedProminent)
                                .accessibilityIdentifier("trip.draft.begin")
                                .disabled(store.busy)
                        }
                    }
                    if store.busy { ProgressView().accessibilityLabel(text("Loading trip", "正在加载行程")) }
                }
            }
            .padding(VPSpacing.standard)
        }
        .background(Color.vpBackground)
        .sheet(item: $shareSource) { source in
            NativeTripShareView(source: source, store: store, session: session, chinese: chinese)
        }
        .sheet(item: $screenshotReviewSource) { source in
            NativeScreenshotReviewView(source: source, chinese: chinese, store: store, session: session)
        }
        .vpNavigationTitle("tab.trip")
        .navigationBarTitleDisplayMode(.inline)
        .scrollDismissesKeyboard(.interactively)
        .task(id: session.dataScope) {
            if screenshotReviewSource != nil || session.dataScope == nil {
                screenshotReviewSource = nil
            }
            cleanupAbandonedScreenshots()
            if store.scope != session.retainedDataScope {
                store.reset(for: session.retainedDataScope)
                newTitle = ""
                confirmVisible = false
                reviewedReference = nil
                discardVisible = false
                clearOutline()
                archiveVisible = false; archiveReference = nil
                screenshotReviewSource = nil
            }
            if session.dataScope != nil && !session.busy { await store.reload(using: session) }
        }
        .onChange(of: session.retainedDataScope) { _, retained in
            if store.scope != retained {
                screenshotReviewSource = nil
                cleanupAbandonedScreenshots()
                store.reset(for: retained)
                newTitle = ""; confirmVisible = false; reviewedReference = nil; discardVisible = false
                clearOutline()
                archiveVisible = false; archiveReference = nil
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.protectedDataDidBecomeAvailableNotification)) { _ in
            if screenshotReviewSource == nil { cleanupAbandonedScreenshots() }
        }
        .onChange(of: session.busy) { wasBusy, isBusy in
            // Login/restore publishes the subject before its profile request finishes.
            // Wait for that transaction without cancelling an in-flight Trip refresh.
            if wasBusy && !isBusy && session.dataScope != nil {
                Task { await store.reload(using: session) }
            }
        }
        .confirmationDialog(text("Apply the reviewed proposal?", "应用刚刚审阅的提议？"), isPresented: $confirmVisible, titleVisibility: .visible) {
            Button(text("Confirm and save", "确认并保存")) {
                if let reviewedReference { Task { await store.confirm(reviewedReference: reviewedReference, using: session) } }
            }
            Button(text("Keep reviewing", "继续审阅"), role: .cancel) {}
        } message: {
            Text(text("Only this proposal will be applied. External orders are not connected.", "只应用这一提议。外部订单尚未接入。"))
        }
        .confirmationDialog(text("Archive this trip?", "归档此行程？"), isPresented: $archiveVisible, titleVisibility: .visible) {
            Button(text("Archive confirmed trip", "归档已确认行程")) {
                if let archiveReference { Task { await store.archive(reviewedReference: archiveReference, using: session) } }
            }
            Button(text("Keep this trip open", "保持行程开放"), role: .cancel) {}
        } message: {
            Text(text("Your saved plan stays readable and shareable. Unfinished services keep their status. No preferences are saved automatically; you can skip preference review and start a fresh trip.", "已保存计划仍可读取和分享，未完服务保留原状态。不自动保存偏好；可以跳过偏好检查，直接开始新行程。"))
        }
        .confirmationDialog(text("Discard this local draft?", "放弃这份本机草稿？"), isPresented: $discardVisible, titleVisibility: .visible) {
            Button(text("Discard draft", "放弃草稿"), role: .destructive) { store.discardDraft() }
            Button(text("Keep draft", "保留草稿"), role: .cancel) {}
        }
    }

    private func cleanupAbandonedScreenshots() {
        do { try NativeScreenshotInbox().deleteAll(); inboxCleanupFailed = false }
        catch { inboxCleanupFailed = true }
    }

    private func clearOutline() {
        planningRequest = ""; outline = nil; outlineTitles = []; outlineStartDate = ""; outlineNotice = nil
    }

    private var outlineComposer: some View {
        VisePandaCard {
            VStack(alignment: .leading, spacing: 12) {
                Text(text("Start with a rough idea", "从模糊想法开始")).font(.title2.bold())
                Text(text("Describe a 2–7 day visit to Shanghai, Beijing, Guangzhou or Chongqing, with food and walks. This guided outline uses your words; it does not check places or routes.", "说说去上海、北京、广州或重庆的 2–7 天想法，并提到美食和散步。此引导草稿只使用你的输入，不核验地点或路线。"))
                    .font(.footnote).foregroundStyle(Color.vpSecondaryText)
                TextField(text("e.g. First time in Shanghai for four days; food and walks, dates unknown", "例如：第一次去上海四天，喜欢吃和散步，日期未定"), text: $planningRequest, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("trip.outline.request")
                Button(text("Show two directions", "查看两个方向")) {
                    if let result = NativeRelativeOutline.make(from: planningRequest, chinese: chinese) {
                        outline = result
                        outlineTitles = result.foodFirst
                        outlineNotice = nil
                    } else {
                        outline = nil; outlineTitles = []
                        outlineNotice = text("Add a supported city, 2–7 days, food and walks.", "请写明支持的城市、2–7 天、美食和散步。")
                    }
                }
                .accessibilityIdentifier("trip.outline.generate")
                if let outline {
                    Text(text("\(outline.city) · \(outline.count) relative days · date and budget unknown", "\(outline.city) · \(outline.count) 个相对日 · 日期与预算未知"))
                        .font(.headline)
                    Text(text("Food first: fewer planned walks, one food area on each full day.", "美食优先：少安排散步，每个完整日探索一个美食片区。"))
                    Button(text("Use food first", "选择美食优先")) { outlineTitles = outline.foodFirst }
                        .accessibilityIdentifier("trip.outline.food")
                    Text(text("Walk first: one neighborhood walk on each full day; meals stay flexible.", "散步优先：每个完整日安排一段街区散步，用餐保持弹性。"))
                    Button(text("Use walk first", "选择散步优先")) { outlineTitles = outline.walkFirst }
                        .accessibilityIdentifier("trip.outline.walk")
                    ForEach(outlineTitles.indices, id: \.self) { index in
                        TextField(text("Day \(index + 1)", "第 \(index + 1) 天"), text: $outlineTitles[index], axis: .vertical)
                            .textFieldStyle(.roundedBorder)
                            .accessibilityIdentifier("trip.outline.day.\(index + 1)")
                    }
                    Text(text("Choose a start date to make a reviewable Trip proposal. Existing days stay untouched; matching dates are rejected. Place, route, timing and feasibility still need verification.", "选定开始日期后才能生成可审阅的 Trip 提议。原有日程不改动，重叠日期会被拒绝。地点、路线、时间与可行性仍待核验。"))
                        .font(.footnote).foregroundStyle(Color.vpSecondaryText)
                    TextField(text("Start date (YYYY-MM-DD)", "开始日期（YYYY-MM-DD）"), text: $outlineStartDate)
                        .textFieldStyle(.roundedBorder).keyboardType(.numbersAndPunctuation)
                        .accessibilityIdentifier("trip.outline.startDate")
                    Button(text("Add outline to local draft", "将方向加入本机草稿")) {
                        if store.beginOutline(outlineTitles, starting: outlineStartDate, using: session) {
                            outlineNotice = nil
                        } else {
                            outlineNotice = text("Use a valid start date with no overlap, then try again.", "请填写有效且不与现有日程重叠的开始日期。")
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("trip.outline.addToDraft")
                    .disabled(store.busy)
                }
                if let outlineNotice {
                    Text(outlineNotice).foregroundStyle(Color.vpSecondaryText)
                        .accessibilityIdentifier("trip.outline.notice")
                }
            }
        }
    }

    private func draftBinding(_ rendered: NativeTripDraft) -> Binding<NativeTripDraft> {
        Binding {
            // SwiftUI may update a departing child after confirm has cleared the
            // optional. Keep that final read safe; never resurrect it on a write.
            guard let current = store.draft, current.id == rendered.id else { return rendered }
            return current
        } set: { value in
            guard store.draft?.id == rendered.id, store.scope == session.dataScope,
                  !store.hasUncertainProposal else { return }
            store.draft = value
        }
    }

    private var tripList: some View {
        VisePandaCard {
            VStack(alignment: .leading, spacing: 14) {
                Text(text("Your trips", "你的行程")).font(.title2.bold())
                if store.trips.isEmpty { Text(text("No trips yet.", "还没有行程。")) }
                ForEach(store.trips) { trip in
                    Button {
                        titleFocused = false
                        clearOutline()
                        Task { await store.select(trip.id, using: session) }
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(trip.title).multilineTextAlignment(.leading)
                            Text(text("Version \(trip.headVersion)", "版本 \(trip.headVersion)"))
                                .font(.caption).foregroundStyle(Color.vpSecondaryText)
                        }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    }
                    .accessibilityIdentifier("trip.select.\(trip.id)")
                    .disabled(store.busy)
                }
                Button(text("Reload saved trips", "重载已保存行程")) { Task { await store.reload(using: session) } }
                    .accessibilityIdentifier("trip.reload").disabled(store.busy)
                Divider()
                TextField(text("New trip title", "新行程名称"), text: $newTitle, axis: .vertical)
                    .textFieldStyle(.roundedBorder).focused($titleFocused)
                    .accessibilityIdentifier("trip.create.title")
                Button(text("Create trip", "创建行程")) {
                    titleFocused = false
                    clearOutline()
                    Task { await store.create(title: newTitle, using: session) }
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("trip.create.submit")
                .disabled(store.busy || newTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
    }

    private func snapshotStatus(_ detail: NativeTripDetail) -> String {
        switch detail.confirmationState {
        case "confirmed": text("Confirmed version \(detail.trip.headVersion)", "已确认版本 \(detail.trip.headVersion)")
        case "initial": text("Initial saved version \(detail.trip.headVersion)", "初始保存版本 \(detail.trip.headVersion)")
        default: text("Saved version \(detail.trip.headVersion) · confirmation unknown", "保存版本 \(detail.trip.headVersion) · 确认状态未知")
        }
    }

    private func confirmed(_ detail: NativeTripDetail) -> some View {
        VisePandaCard {
            VStack(alignment: .leading, spacing: 12) {
                Text(snapshotStatus(detail))
                    .font(.headline).accessibilityIdentifier("trip.confirmed.version")
                if let archive = store.archive {
                    Text(text("Archived · version \(archive.archivedVersion)", "已归档 · 版本 \(archive.archivedVersion)"))
                        .accessibilityIdentifier("trip.archive.status")
                    Text(text("Start your next trip with a new title above. Dates, places and temporary constraints stay with this trip. Manage explicitly saved preferences in Profile.", "在上方填写新名称即可开始下一旅程。日期、地点和临时约束留在此行程中；已明确保存的偏好可在「我的」管理。"))
                        .font(.footnote)
                } else if !store.archiveAvailable {
                    Text(text("Archive status is unavailable. Your saved plan is still readable.", "归档状态暂不可用，已保存计划仍可读取。"))
                        .font(.footnote)
                }
                if store.archiveReference != nil {
                    Button(text("Archive trip…", "归档行程…")) {
                        archiveReference = store.archiveReference
                        archiveVisible = true
                    }
                    .accessibilityIdentifier("trip.archive.begin").disabled(store.busy)
                }
                Text(detail.trip.title).font(.title2.bold()).accessibilityIdentifier("trip.confirmed.title")
                Text(detail.trip.id).font(.caption).textSelection(.enabled).accessibilityIdentifier("trip.selected.id")
                if detail.content.days.isEmpty { Text(text("No days in this saved version.", "此保存版本尚无日期安排。")) }
                ForEach(detail.content.days) { day in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(day.date).font(.headline)
                        if let zone = day.timeZone { Text(zone).font(.caption) }
                        ForEach(day.items) { item in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(item.title).accessibilityIdentifier("trip.confirmed.item.\(item.id)")
                                if let start = item.startsAt { Text(start).font(.caption) }
                                if let end = item.endsAt { Text(end).font(.caption) }
                            }
                        }
                    }
                }
                if detail.confirmationState == "confirmed" {
                    Button(text("Share confirmed plan", "分享已确认计划")) {
                        guard let scope = session.dataScope, store.scope == scope else { return }
                        shareSource = NativeTripShareSource(scope: scope, detail: detail)
                    }
                    .accessibilityIdentifier("trip.share")
                    .disabled(store.busy)
                }
                Button(text("Review one screenshot on device", "在本机审阅一张截图")) {
                    screenshotReviewSource = .init(
                        tripID: detail.trip.id,
                        tripVersion: detail.trip.headVersion,
                        tripDates: detail.content.days.map(\.date),
                        ownerID: session.dataScope?.subject,
                        detail: detail
                    )
                }
                .accessibilityIdentifier("trip.screenshot.review")
                .disabled(store.busy || !store.canEdit)
                Divider()
                Text(text("User locks are not enabled in this version. External orders are not connected, so this cannot tell you whether an order exists.", "此版本未启用用户硬锁。外部订单尚未接入，不能据此判断是否存在订单。"))
                    .font(.footnote).foregroundStyle(Color.vpSecondaryText)
            }
        }
    }

    private func proposal(_ pending: NativeTripPending) -> some View {
        VisePandaCard {
            VStack(alignment: .leading, spacing: 14) {
                Text(text("Review before saving", "保存前审阅")).font(.title2.bold())
                Text(text("Proposal \(pending.proposal.revision), based on version \(pending.proposal.baseTripVersion)", "提议 \(pending.proposal.revision)，基于版本 \(pending.proposal.baseTripVersion)"))
                    .accessibilityIdentifier("trip.proposal.version")
                Text(text("Not applied. Confirmed content above is unchanged.", "尚未应用。上方已确认内容未改变。"))
                if pending.proposal.titleDiff.before != pending.proposal.titleDiff.after {
                    Text(text("Title: \(pending.proposal.titleDiff.before) → \(pending.proposal.titleDiff.after)", "名称：\(pending.proposal.titleDiff.before) → \(pending.proposal.titleDiff.after)"))
                }
                ForEach(Array(pending.proposal.patch.operations.enumerated()), id: \.offset) { _, operation in
                    VStack(alignment: .leading, spacing: 5) {
                        Text(operationName(operation.kind)).font(.headline)
                        let comparison = operationComparison(operation, pending: pending)
                        Text(text("Before: \(comparison.before)", "原内容：\(comparison.before)"))
                        Text(text("After: \(comparison.after)", "新内容：\(comparison.after)"))
                    }.accessibilityElement(children: .combine)
                }
                Text(text("Expires: \(formattedExpiry(pending.proposal.expiresAt))", "到期：\(formattedExpiry(pending.proposal.expiresAt))"))
                    .font(.caption)
                if pending.proposal.stale { Text(message("STALE_TRIP_VERSION")) }
                Button(text("Confirm this proposal", "确认此提议")) { reviewedReference = store.confirmationReference; confirmVisible = true }
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("trip.proposal.confirm")
                    .disabled(store.busy || !store.canEdit || pending.proposal.stale || store.notice == "STALE_TRIP_VERSION" || store.detail?.trip.headVersion != pending.proposal.baseTripVersion)
                Button(text("Reject proposal; keep local draft", "拒绝提议并保留本机草稿")) { Task { await store.reject(using: session) } }
                    .accessibilityIdentifier("trip.proposal.reject").disabled(store.busy)
            }
        }
    }

    private func formattedExpiry(_ raw: String) -> String {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = parser.date(from: raw) else { return text("Check before confirming", "确认前检查") }
        return date.formatted(.dateTime.year().month(.abbreviated).day().hour().minute().locale(settings.selectedLocale.locale))
    }

    private func operationComparison(_ operation: NativeTripOperation, pending: NativeTripPending) -> (before: String, after: String) {
        let absent = text("Not present", "不存在")
        let unset = text("Not set", "未设置")
        let removed = text("Removed", "移除")
        let day = store.detail?.content.days.first { $0.id == operation.dayId }
        func dayText(_ date: String, _ zone: String?) -> String {
            "\(date) · \(zone ?? unset)"
        }
        func itemText(_ title: String, _ start: String?, _ end: String?) -> String {
            "\(title)\n" + text("Start: \(start ?? unset)\nEnd: \(end ?? unset)", "开始：\(start ?? unset)\n结束：\(end ?? unset)")
        }
        switch operation.kind {
        case .setTitle:
            return (pending.proposal.titleDiff.before, operation.title ?? unset)
        case .upsertDay:
            return (day.map { dayText($0.date, $0.timeZone) } ?? absent, dayText(operation.date ?? unset, operation.timeZone))
        case .deleteDay:
            let before = day.map { day in
                ([dayText(day.date, day.timeZone)] + day.items.map { itemText($0.title, $0.startsAt, $0.endsAt) }).joined(separator: "\n")
            } ?? absent
            return (before, removed)
        case .upsertItem, .deleteItem:
            let item = day?.items.first { $0.id == operation.itemId }
            let targetDate = pending.proposal.patch.operations.last { $0.kind == .upsertDay && $0.dayId == operation.dayId }?.date ?? day?.date ?? unset
            let prefix = text("Day: \(targetDate)\n", "日期：\(targetDate)\n")
            let before = item.map { itemText($0.title, $0.startsAt, $0.endsAt) } ?? absent
            let after = operation.kind == .deleteItem ? removed : itemText(operation.title ?? unset, operation.startsAt, operation.endsAt)
            return (prefix + before, prefix + after)
        }
    }

    private func operationName(_ kind: NativeTripOperation.Kind) -> String {
        switch kind {
        case .setTitle: text("Change trip title", "更改行程名称")
        case .upsertDay: text("Add or update day", "新增或修改日期")
        case .deleteDay: text("Remove day and its items", "移除日期及其项目")
        case .upsertItem: text("Add or update item", "新增或修改项目")
        case .deleteItem: text("Remove item", "移除项目")
        }
    }

    private func message(_ code: String) -> String {
        switch code {
        case "archived": text("Trip archived. Saved results and unfinished services are retained.", "行程已归档，已保存成果和未完服务已保留。")
        case "STALE_TRIP_VERSION": text("The saved trip changed. Your local draft is retained. Reload to compare; discard only when you choose to start again from the latest version.", "已保存行程发生变化，本机草稿已保留。请重载比较；只有你选择放弃草稿后，才从最新版本重新开始。")
        case "reviewRequired": text("Review the proposal below. Nothing has been applied yet.", "请审阅下方提议，目前尚未应用。")
        case "confirmed": text("Confirmed and reloaded from storage.", "已确认，并从存储重载。")
        case "rejected": text("Proposal rejected. Local draft retained.", "提议已拒绝，本机草稿已保留。")
        case "PROPOSAL_NOT_CONFIRMABLE": text("This proposal cannot be confirmed. Reload its current state; your draft is retained.", "此提议无法确认。请重载当前状态，本机草稿已保留。")
        case "finishDraft": text("Keep working on this draft, or explicitly discard it before choosing another trip.", "请继续当前草稿，或明确放弃草稿后再选择其他行程。")
        case "noChanges": text("Make a change before proposing it.", "请先修改草稿再提出提议。")
        case "INVALID_INPUT": text("Check the title, dates and item details.", "请检查名称、日期与项目内容。")
        case "FORBIDDEN": text("This account cannot access that trip.", "此账号无权访问该行程。")
        case "IDEMPOTENCY_KEY_REUSE": text("The request conflicts with an earlier submission. Reload before retrying.", "此请求与先前提交冲突，请重载后再试。")
        case "invalidResponse": text("The trip response could not be verified. Reload to try again.", "无法核实行程响应，请重载后再试。")
        default: text("Connection incomplete. Your draft is retained. Reload before retrying a proposal or confirmation.", "连接未完成，本机草稿已保留。请先重载，再重试提议或确认。")
        }
    }
}

private struct NativeTripDraftEditor: View {
    @Binding var draft: NativeTripDraft
    let chinese: Bool
    @FocusState private var focusedField: String?
    private func text(_ en: String, _ zh: String) -> String { chinese ? zh : en }

    var body: some View {
        VisePandaCard {
            VStack(alignment: .leading, spacing: 14) {
                Text(text("Local draft — not saved", "本机草稿 · 尚未保存")).font(.title2.bold())
                Text(text("Based on version \(draft.baseVersion)", "基于版本 \(draft.baseVersion)"))
                TextField(text("Trip title", "行程名称"), text: $draft.title, axis: .vertical)
                    .accessibilityIdentifier("trip.draft.title").focused($focusedField, equals: "title")
                ForEach($draft.days) { $day in
                    VStack(alignment: .leading, spacing: 10) {
                        Divider()
                        TextField(text("Date (YYYY-MM-DD)", "日期（YYYY-MM-DD）"), text: $day.date)
                            .keyboardType(.numbersAndPunctuation).focused($focusedField, equals: "day:\(day.id)")
                            .accessibilityIdentifier("trip.draft.day.\(day.id)")
                        ForEach($day.items) { $item in
                            TextField(text("Item title", "项目名称"), text: $item.title, axis: .vertical)
                                .focused($focusedField, equals: "item:\(item.id)").accessibilityIdentifier("trip.draft.item.\(item.id)")
                            Button(text("Remove item", "移除项目"), role: .destructive) {
                                day.items.removeAll { $0.id == item.id }
                            }.accessibilityIdentifier("trip.draft.removeItem.\(item.id)")
                        }
                        Button(text("Add item", "添加项目")) { draft.addItem(to: day.id) }
                            .accessibilityIdentifier("trip.draft.addItem.\(day.id)")
                        Button(text("Remove day", "移除日期"), role: .destructive) { draft.days.removeAll { $0.id == day.id } }
                            .accessibilityIdentifier("trip.draft.removeDay.\(day.id)")
                    }
                }
                Button(text("Add day", "添加日期")) { draft.addDay() }
                    .accessibilityIdentifier("trip.draft.addDay")
                Button(text("Done editing", "完成输入")) { focusedField = nil }
                    .accessibilityIdentifier("trip.draft.done")
            }.textFieldStyle(.roundedBorder)
        }
    }
}

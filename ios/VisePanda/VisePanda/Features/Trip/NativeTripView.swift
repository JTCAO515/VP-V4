import SwiftUI
import UIKit

/// A sheet keeps the Ask scroll position and original composer alive underneath it.
struct NativePlanningSheet: View {
    let request: String
    @Environment(AppSettings.self) private var settings
    @Environment(\.dismiss) private var dismiss
    @State private var confirmReturn = false

    private var chinese: Bool { settings.selectedLocale == .zh }

    var body: some View {
        NavigationStack {
            NativeTripView(initialPlanningRequest: request)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button(chinese ? "返回对话" : "Return to Ask") { confirmReturn = true }
                            .accessibilityIdentifier("trip.outline.return")
                    }
                }
        }
        .interactiveDismissDisabled()
        .confirmationDialog(chinese ? "返回对话？" : "Return to Ask?", isPresented: $confirmReturn, titleVisibility: .visible) {
            Button(chinese ? "返回并放弃未提交编辑" : "Return and discard unsubmitted edits", role: .destructive) { dismiss() }
                .accessibilityIdentifier("trip.outline.return.confirm")
            Button(chinese ? "继续规划" : "Keep planning", role: .cancel) {}
        } message: {
            Text(chinese ? "未提交的草稿编辑会丢失，原始对话输入仍保留。已保存的行程与提议可以在行程页重载。" : "Unsubmitted draft edits will be lost. Your original message stays in Ask. Saved trips and proposals can be reloaded from Trip.")
        }
    }
}

struct NativeTripView: View {
    private struct PaceBasis: Equatable {
        let tripID: String
        let request: String
        let choice: NativeOutlinePaceChoice
        let projection: NativeTaskTravelPace
    }
    private struct ResultLoadKey: Equatable {
        let scope: NativeDataScope?
        let tripID: String?
        let headVersion: Int?
        let archived: Bool
        let deleting: Bool
        let active: Bool
    }
    var offlineUserDraft:NativeOfflineTripDraft? = nil
    @State private var offlineDraftLoaded=false
    @State private var offlineTextDate=""
    @State private var offlineTextTitle=""
    @State private var offlineTextConsent=false
    var initialPlanningRequest: String? = nil
    var initialTripID: String? = nil
    var initialTripScope: NativeDataScope? = nil
    var initialProposalReference:String? = nil
    var initialTripVersion:Int? = nil
    @State private var initialTripReady = false
    @State private var initialTripFailed = false
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var scenePhase
    @State private var store = NativeTripStore()
    @State private var resultStore = NativeResultStore()
    @State private var newTitle = ""
    @State private var scopedRecovery: NativeScopedTripJournal?
    @State private var scopedSelection: NativeScopedTripSelection?
    @State private var scopedOrigin: NativeScopedTripSelection?
    @State private var scopedScrollID: String?
    @State private var shareSource: NativeTripShareSource?
    @State private var screenshotReviewSource: NativeScreenshotReviewSource?
    @State private var inboxCleanupFailed = false
    @State private var supportStore = NativeTripSupportStore()
    @State private var confirmVisible = false
    @State private var supportConfirmVisible = false
    @State private var reviewedSupportSelection: String?
    @State private var reviewedReference: String?
    @State private var discardVisible = false
    @State private var deleteVisible = false
    @State private var deleteReference: String?
    @State private var planningRequest = ""
    @State private var outline: NativeRelativeOutline?
    @State private var outlineTitles: [String] = []
    @State private var outlineStartDate = ""
    @State private var outlineNotice: String?
    @State private var outlinePaceChoice: NativeOutlinePaceChoice = .saved
    @State private var outlinePaceBasis: PaceBasis?
    @State private var outlineGeneration = UUID()
    @State private var consumedInitialRequest = false
    @FocusState private var titleFocused: Bool
    private var chinese: Bool { settings.selectedLocale == .zh }
    private var session: NativeSession { settings.nativeSession }
    private var resultLoadKey: ResultLoadKey {
        .init(scope: session.dataScope, tripID: store.detail?.trip.id, headVersion: store.detail?.trip.headVersion,
              archived: store.archive != nil, deleting: store.deletionRequest != nil || store.deletionReceipt != nil,
              active: scenePhase == .active)
    }
    private func text(_ en: String, _ zh: String) -> String { chinese ? zh : en }
    private var outlineCanPromote: Bool {
        guard let basis = outlinePaceBasis else { return false }
        return basis.projection.canPromoteToTripDraft(for: basis.tripID, choice: basis.choice)
    }

    var body: some View {
        Group {
            if initialTripID == nil {
                tripBody
            } else if initialTripScope != session.dataScope || initialTripFailed || initialPlanningRequest != nil {
                ContentUnavailableView(text("Trip unavailable", "行程暂不可用"), systemImage: "map",
                    description: Text(text("Return to Journeys and refresh before choosing this Trip again.", "请返回旅程并刷新，再选择本行程。")))
                    .accessibilityIdentifier("journeys.trip.unavailable")
            } else if initialTripReady, (initialProposalReference != nil && store.confirmationReference != initialProposalReference || initialTripVersion != nil && store.detail?.trip.headVersion != initialTripVersion) {
                ContentUnavailableView(text("Selected proposal changed", "所选提议已变化"),systemImage:"arrow.clockwise",description:Text(text("Return to the preparation task and recheck its exact basis.", "返回准备任务重新核对精确依据。")))
            } else if initialTripReady {
                tripBody
            } else {
                ProgressView(text("Opening selected Trip", "正在打开所选行程"))
            }
        }
        .task(id: session.dataScope) {
            guard let initialTripID else { return }
            initialTripReady = false; initialTripFailed = false
            guard let initialTripScope, session.dataScope == initialTripScope, initialPlanningRequest == nil else {
                initialTripFailed = true; return
            }
            while session.busy {
                do { try await Task.sleep(for: .milliseconds(50)) } catch { return }
                guard session.dataScope == initialTripScope, !Task.isCancelled else { return }
            }
            let opened = await NativeJourneyTripEntry.open(.init(tripID: initialTripID, scope: initialTripScope),
                currentScope: { session.dataScope }, reload: {
                    await store.reload(using: session)
                    return store.scope == initialTripScope ? store.trips : []
                }, select: { id in
                    await store.select(id, using: session)
                    return store.scope == initialTripScope && store.detail?.trip.id == id
                })
            guard session.dataScope == initialTripScope, !Task.isCancelled else { return }
            initialTripReady = opened; initialTripFailed = !opened
        }
    }

    private var tripBody: some View {
        ScrollViewReader { proxy in
        ScrollView {
            VStack(alignment: .leading, spacing: VPSpacing.section) {
                BrandHeader()
                Text(text("Test trips", "测试行程"))
                    .font(.headline)
                if session.dataScope == nil || store.scope != session.dataScope {
                    Text(text("Sign in to a test account in Profile to open your trips.", "请在「我的」登录测试账号，再打开行程。"))
                } else {
                    if initialPlanningRequest != nil && store.draft == nil && store.pending == nil {
                        outlineComposer
                    }
                    NavigationLink(text("Finish, archive and next Trip", "结束、归档与下一次旅行")) {
                        NativeTripLifecycleView(session: session, chinese: chinese, initialTripID: store.selectedID,
                                                onUpdated: { await lifecycleUpdated($0) })
                    }.accessibilityIdentifier("trip.lifecycle.entry")
                        .disabled(store.busy || store.draft != nil || store.pending != nil || store.hasUncertainProposal)
                    tripList
                    if let receipt = store.deletionReceipt {
                        VisePandaCard {
                            VStack(alignment: .leading, spacing: 10) {
                                Text(receipt.state == "completed" ? text("Trip deletion completed", "行程删除已完成") : text("Trip deletion queued", "行程删除已排队"))
                                    .font(.headline).accessibilityIdentifier("trip.deletion.state")
                                Text(text("Only this Trip is covered. Other account data, provider copies and backups are not confirmed erased. This screen clears its saved Trip view when opened online again; exported files cannot be recalled.",
                                          "仅处理这一行程。其他账户资料、服务商副本和备份未确认删除。再次联网打开此页面时，会清理已保存的行程视图；已导出的文件无法撤回。"))
                                    .font(.footnote)
                                if receipt.state == "queued" {
                                    Button(text("Check deletion status", "查询删除状态")) { Task { await store.retryDeletion(using: session) } }
                                        .accessibilityIdentifier("trip.deletion.refresh")
                                }
                            }
                        }
                    } else if store.deletionRequest != nil {
                        Text(text("Deletion request outcome is unknown. Reconnect and check the same request before trying another Trip.",
                                  "删除请求结果尚不确定。回网后查询同一请求，再处理其他行程。"))
                            .accessibilityIdentifier("trip.deletion.unknown")
                        Button(text("Check deletion request", "查询删除请求")) { Task { await store.retryDeletion(using: session) } }
                            .accessibilityIdentifier("trip.deletion.refresh")
                    }
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
                        if store.deletionRequest == nil && store.deletionReceipt == nil {
                            TimelineView(.periodic(from: .now, by: 1)) { _ in
                                NativeResultCard(store: resultStore, scope: session.dataScope, chinese: chinese,
                                                 expectedTripID: detail.trip.id)
                            }
                        }
                        NativeTravelRemindersView(detail: detail, session: session, chinese: chinese)
                            .id("reminders-\(detail.trip.id)-\(session.dataScope?.subject ?? "")")
                        if store.canEdit,store.draft==nil,store.pending==nil {
                            DisclosureGroup(text("New date/text explicitly eligible for offline capture", "新日期／项目文字的明确离线来源提交")) {
                                TextField(text("New date YYYY-MM-DD", "新日期 YYYY-MM-DD"),text:$offlineTextDate).disabled(store.offlineTextPending)
                                TextField(text("New item text", "新项目文字"),text:$offlineTextTitle,axis:.vertical).disabled(store.offlineTextPending)
                                Toggle(text("Submit this new text for offline capture", "明确提交这些新文字用于离线来源记录"),isOn:$offlineTextConsent)
                                Text(text("Only newly submitted date/item text enters this controlled proposal. Existing dates conflict; old Trip/OCR/imported content gains no permission. Review the original diff and confirm separately.", "仅新提交日期／项目文字进入受控提案；同日已存在则冲突，旧行程／OCR／导入内容不补授。仍须查看原差异并另行确认。"))
                                Button(store.offlineTextPending ? text("Retry the same controlled submission", "重试同一受控提交"):text("Create controlled text proposal", "创建受控文字提案")) {
                                    Task{_ = await store.proposeOfflineText(date:offlineTextDate,title:offlineTextTitle,saveOffline:offlineTextConsent,using:session)}
                                }.disabled(!offlineTextConsent || store.busy)
                            }
                        }
                        if let offlineUserDraft,!offlineDraftLoaded {
                            Button(text("Check current version and load this local draft", "核对当前版本并导入这份本地稿")){
                                Task{offlineDraftLoaded=await store.restoreOfflineUserDraft(offlineUserDraft,using:session)}
                            }.disabled(store.busy || store.draft != nil || store.pending != nil)
                            Text(text("This imports only your local edits. It does not submit or confirm; conflicts keep the saved local draft.", "仅导入用户本地编辑，不提交／确认；冲突仍保留已存本地稿。"))
                        }
                        if initialPlanningRequest == nil && store.canEdit && store.draft == nil && store.pending == nil { outlineComposer }
                        if let pending = store.pending { proposal(pending).id("scoped-proposal") }
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
        .onChange(of: scopedScrollID) { _, target in
            if let target { proxy.scrollTo(target, anchor: .center) }
        }
        .onChange(of: store.notice) { _, notice in
            guard notice == "confirmed", let origin = scopedOrigin, session.dataScope == origin.actor,
                  store.selectedID == origin.tripID, let detail = store.detail,
                  detail.trip.id == origin.tripID, detail.confirmationState == "confirmed",
                  detail.trip.headVersion > origin.headVersion else { return }
            let itemPresent = origin.itemID.map { id in detail.content.days.flatMap(\.items).contains { $0.id == id } } == true
            scopedScrollID = itemPresent ? origin.itemID.map { "scoped-item:\($0)" } : "scoped-day:\(origin.dayID)"
            scopedOrigin = nil
        }
        .background(Color.vpBackground)
        .sheet(item: $scopedSelection, onDismiss: {
            if scopedOrigin == nil { scopedScrollID = scopedSelection?.anchor ?? scopedScrollID }
        }) { selection in
            NativeScopedTripEditSheet(selection: selection, tripStore: store, session: session, chinese: chinese) { origin in
                scopedOrigin = origin; scopedScrollID = "scoped-proposal"
            }
        }
        .sheet(item: $scopedRecovery) { journal in
            NativeScopedTripRecoverySheet(journal: journal, tripStore: store, session: session, chinese: chinese)
        }
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
                screenshotReviewSource = nil
            }
            if !consumedInitialRequest, session.dataScope != nil, let initialPlanningRequest {
                consumedInitialRequest = true
                planningRequest = initialPlanningRequest
                await generateOutline()
            }
            if initialTripID == nil && session.dataScope != nil && !session.busy { await store.reload(using: session) }
        }
        .task(id: resultLoadKey) {
            let key = resultLoadKey
            guard let scope = key.scope, let tripID = key.tripID, !key.deleting,
                  key.active, store.scope == scope else { resultStore.clear(); return }
            await resultStore.load(scope: scope, tripID: tripID, using: session)
        }
        .onChange(of: session.retainedDataScope) { _, retained in
            if store.scope != retained {
                screenshotReviewSource = nil
                cleanupAbandonedScreenshots()
                store.reset(for: retained)
                newTitle = ""; confirmVisible = false; reviewedReference = nil; discardVisible = false
                clearOutline()
            }
        }
        .toolbar {
            ToolbarItem(placement:.topBarTrailing) {
                NavigationLink(text("Reference save receipt", "参考保存回执")) {
                    NativeTripSupportRecoveryView(session:session,chinese:settings.selectedLocale == .zh,readReceipt:{try await session.tripSupportConfirmationRead($0,actor:$1)},onResolved:{supportStore.bind(nil);await store.reload(using:session)})
                }
            }
            ToolbarItem(placement:.topBarTrailing) {
                if let journal=try? session.linkedTripDeletionRecovery() {
                    NavigationLink(text("Linked deletion status", "协同删除状态")) {
                        NativeLinkedTripDeletionView(tripID:journal.tripID,headVersion:(try? journal.decodedRequest().expectedVersion) ?? 0)
                    }.accessibilityIdentifier("trip.linkedDeletion.recovery")
                }
            }
        }
        .onChange(of: store.selectedID) { _, _ in
            scopedSelection = nil; scopedRecovery = nil; scopedOrigin = nil; scopedScrollID = nil
            outlineGeneration = UUID(); outline = nil; outlineTitles = []; outlinePaceBasis = nil
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
        .onChange(of:session.dataScope) { _,_ in supportStore.bind(nil); scopedSelection = nil; scopedRecovery = nil; scopedOrigin = nil }
        .onChange(of:store.selectedID) { _,_ in supportStore.bind(nil) }
        .onChange(of:store.confirmationReference) { _,_ in supportStore.bind(nil) }
        .onChange(of: store.deletionRequest) { _, request in
            if request != nil {
                shareSource = nil; screenshotReviewSource = nil
                cleanupAbandonedScreenshots()
            }
        }
        .confirmationDialog(text("Save the reviewed proposal with these exact receipts?", "连同明确选择的回执保存已审阅提议？"),isPresented:$supportConfirmVisible,titleVisibility:.visible) {
            Button(text("Confirm proposal and selected references", "确认提议及所选参考")) {
                if let reviewedReference,let reviewedSupportSelection { Task { await store.confirmSupported(reviewedReference:reviewedReference,reviewedSelection:reviewedSupportSelection,support:supportStore,using:session) } }
            }
            Button(text("Keep reviewing", "继续审阅"),role:.cancel) {}
        } message: { Text(text("Only the reviewed patch and explicitly selected receipt IDs are adopted. Source status may require recheck; this does not verify the entire plan.", "仅采用已审阅修改和明确选择的回执ID。来源状态可能需要重核；不验证整份行程。")) }
        .confirmationDialog(text("Apply the reviewed proposal?", "应用刚刚审阅的提议？"), isPresented: $confirmVisible, titleVisibility: .visible) {
            Button(text("Confirm and save", "确认并保存")) {
                if let reviewedReference { Task { await store.confirm(reviewedReference: reviewedReference, using: session) } }
            }
            Button(text("Keep reviewing", "继续审阅"), role: .cancel) {}
        } message: {
            Text(text("Only this proposal will be applied. External orders are not connected.", "只应用这一提议。外部订单尚未接入。"))
        }
        .confirmationDialog(text("Delete this Trip?", "删除此行程？"), isPresented: $deleteVisible, titleVisibility: .visible) {
            Button(text("Request Trip deletion", "请求删除行程"), role: .destructive) {
                if let deleteReference { Task { await store.deleteTrip(reviewedReference: deleteReference, using: session) } }
            }.accessibilityIdentifier("trip.deletion.confirm")
            Button(text("Keep Trip", "保留行程"), role: .cancel) {}
        } message: {
            Text(text("Sign out and sign in again in Profile before requesting deletion. The server requires a new sign-in within five minutes. A queued response is not completion. Trips with linked chats cannot be deleted in this step.",
                      "请先在「我的」退出并重新登录；服务端要求登录发生在五分钟内。排队回执不代表删除完成。有关联聊天的行程暂不能在此删除。"))
        }
        .confirmationDialog(text("Discard this local draft?", "放弃这份本机草稿？"), isPresented: $discardVisible, titleVisibility: .visible) {
            Button(text("Discard draft", "放弃草稿"), role: .destructive) { store.discardDraft() }
            Button(text("Keep draft", "保留草稿"), role: .cancel) {}
        }
        }
    }

    private func cleanupAbandonedScreenshots() {
        do { try NativeScreenshotInbox().deleteAll(); inboxCleanupFailed = false }
        catch { inboxCleanupFailed = true }
    }

    private func clearOutline() {
        planningRequest = ""; outline = nil; outlineTitles = []; outlineStartDate = ""; outlineNotice = nil
        outlinePaceBasis = nil; outlineGeneration = UUID()
    }

    private func projectPace(tripID: String, choice: NativeOutlinePaceChoice,
                             expectedRevision: Int? = nil) async throws -> NativeTaskTravelPace {
        try await NativeTaskTravelPaceReader.read(tripID: tripID, choice: choice,
            expectedSourceRevision: expectedRevision, currentScope: { session.dataScope }) { body in
            try await session.memoryRequest(path: "api/memory/native/v1/travel-pace/project", method: "POST", body: body)
        }
    }

    private func stillCurrent(_ basis: PaceBasis) async -> Bool {
        guard session.dataScope != nil, store.scope == session.dataScope,
              store.selectedID == basis.tripID else { return false }
        do {
            let latest = try await projectPace(tripID: basis.tripID, choice: basis.choice,
                expectedRevision: basis.projection.sourceRevision)
            return latest == basis.projection && store.selectedID == basis.tripID
        } catch { return false }
    }

    private func generateOutline() async {
        titleFocused = false
        let token = UUID(), request = planningRequest, choice = outlinePaceChoice
        outlineGeneration = token; outline = nil; outlineTitles = []; outlinePaceBasis = nil
        guard let result = NativeRelativeOutline.make(from: request, chinese: chinese) else {
            outline = nil; outlineTitles = []
            outlineNotice = text("Add a supported city, 2–7 days, and food or walks.", "请写明支持的城市、2–7 天，以及美食或散步。")
            return
        }
        guard let tripID = store.detail?.trip.id else {
            outline = result; outlineTitles = result.initialTitles; outlineNotice = nil
            return
        }
        do {
            let projection = try await projectPace(tripID: tripID, choice: choice)
            guard outlineGeneration == token, planningRequest == request, outlinePaceChoice == choice,
                  store.detail?.trip.id == tripID else { return }
            outline = result
            outlineTitles = projection.travelPace.map { result.titles(for: $0, chinese: chinese) } ?? result.initialTitles
            outlinePaceBasis = .init(tripID: tripID, request: request, choice: choice, projection: projection)
            outlineNotice = nil
        } catch {
            guard outlineGeneration == token else { return }
            outlineNotice = text("Could not verify the Trip and saved pace. Retry when connected.",
                                 "无法核验行程与已保存节奏，请联网后重试。")
        }
    }

    private func addOutlineToDraft() async {
        guard let basis = outlinePaceBasis, basis.request == planningRequest,
              basis.projection.canPromoteToTripDraft(for: basis.tripID, choice: basis.choice) else { return }
        guard await stillCurrent(basis) else {
            outline = nil; outlineTitles = []; outlinePaceBasis = nil
            outlineNotice = text("The pace or Trip changed. Generate a fresh outline before continuing.",
                                 "节奏或行程发生变化，请重新生成方向后继续。")
            return
        }
        if store.beginOutline(outlineTitles, starting: outlineStartDate, using: session) {
            outlineNotice = nil
        } else {
            outlineNotice = text("Use a valid start date with no overlap, then try again.",
                                 "请填写有效且不与现有日程重叠的开始日期。")
        }
    }

    private var outlineComposer: some View {
        VisePandaCard {
            VStack(alignment: .leading, spacing: 12) {
                Text(text("Start with a rough idea", "从模糊想法开始")).font(.title2.bold())
                Text(text("Describe a 2–7 day visit to Shanghai, Beijing, Guangzhou or Chongqing, with food or walks. This outline uses the city, duration, interests and the pace you select below. Other requests, dates, budget and fixed plans still need review; places and routes are not checked.", "说说去上海、北京、广州或重庆的 2–7 天想法，以及美食或散步兴趣。方向草稿使用城市、天数、兴趣及下方选择的节奏；其他要求、日期、预算与固定安排仍需审阅，地点和路线未经核验。"))
                    .font(.footnote).foregroundStyle(Color.vpSecondaryText)
                if store.detail != nil {
                    Picker(text("Travel pace for this outline", "本次方向的旅行节奏"), selection: $outlinePaceChoice) {
                        ForEach(NativeOutlinePaceChoice.allCases, id: \.self) { choice in
                            Text(choice.label(chinese: chinese)).tag(choice)
                        }
                    }
                    .accessibilityIdentifier("trip.outline.pace")
                    .onChange(of: outlinePaceChoice) { _, _ in
                        outlineGeneration = UUID(); outline = nil; outlineTitles = []; outlinePaceBasis = nil
                    }
                }
                TextField(text("e.g. First time in Shanghai for four days; food and walks, dates unknown", "例如：第一次去上海四天，喜欢吃和散步，日期未定"), text: Binding(get: { planningRequest }, set: {
                    planningRequest = $0
                    outlineGeneration = UUID(); outline = nil; outlineTitles = []; outlinePaceBasis = nil; outlineNotice = nil
                }), axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .focused($titleFocused)
                    .accessibilityIdentifier("trip.outline.request")
                Button(text("Show a relative-day outline", "查看相对日草稿")) { Task { await generateOutline() } }
                .accessibilityIdentifier("trip.outline.generate")
                if let outline {
                    Text(text("\(outline.city) · \(outline.count) relative days · dates not bound, budget unchecked", "\(outline.city) · \(outline.count) 个相对日 · 日期未绑定，预算未核验"))
                        .font(.headline)
                    if outlinePaceBasis?.projection.travelPace == nil && outline.hasAlternatives {
                        Text(text("Food first: fewer planned walks, one food area on each full day.", "美食优先：少安排散步，每个完整日探索一个美食片区。"))
                        Button(text("Use food first", "选择美食优先")) { titleFocused = false; outlineTitles = outline.foodFirst }
                            .accessibilityIdentifier("trip.outline.food")
                        Text(text("Walk first: one neighborhood walk on each full day; meals stay flexible.", "散步优先：每个完整日安排一段街区散步，用餐保持弹性。"))
                        Button(text("Use walk first", "选择散步优先")) { titleFocused = false; outlineTitles = outline.walkFirst }
                            .accessibilityIdentifier("trip.outline.walk")
                    }
                    if let projection = outlinePaceBasis?.projection, let pace = projection.travelPace {
                        Text(projection.source == "profile"
                             ? text("Saved \(pace.label(chinese: false)) pace shapes this local preview only.",
                                    "已保存的\(pace.label(chinese: true))节奏仅用于本机方向预览。")
                             : text("This-time \(pace.label(chinese: false)) pace shapes this local outline.",
                                    "本次\(pace.label(chinese: true))节奏用于本机方向草稿。"))
                            .font(.footnote).accessibilityIdentifier("trip.outline.paceSource")
                        if projection.source == "profile" {
                            Text(text("To add it to a Trip draft, choose \(pace.label(chinese: false)) this time and generate again.",
                                      "如要加入行程草稿，请明确选择“本次\(pace.label(chinese: true))”并重新生成。"))
                                .font(.footnote).accessibilityIdentifier("trip.outline.previewOnly")
                        }
                    } else if outlinePaceChoice == .saved && outlinePaceBasis?.projection.source == "none" {
                        Text(text("No authorized saved pace is available; this outline uses only your current request.",
                                  "没有可用的已授权保存节奏；这份方向只使用本次输入。"))
                            .font(.footnote).accessibilityIdentifier("trip.outline.paceSource")
                    }
                    ForEach(outlineTitles.indices, id: \.self) { index in
                        TextField(text("Day \(index + 1)", "第 \(index + 1) 天"), text: $outlineTitles[index], axis: .vertical)
                            .textFieldStyle(.roundedBorder)
                            .accessibilityIdentifier("trip.outline.day.\(index + 1)")
                    }
                    Text(outlinePaceBasis?.projection.source == "profile"
                         ? text("Saved pace is preview-only. Choose a this-time pace and generate again before adding to a Trip draft.",
                                "已保存节奏仅供预览。请明确选择本次节奏并重新生成，再加入行程草稿。")
                         : text("Choose a start date to make a reviewable Trip proposal. Existing days stay untouched; matching dates are rejected. Place, route, timing and feasibility still need verification.",
                                "选定开始日期后才能生成可审阅的 Trip 提议。原有日程不改动，重叠日期会被拒绝。地点、路线、时间与可行性仍待核验。"))
                        .font(.footnote).foregroundStyle(Color.vpSecondaryText)
                    TextField(text("Start date (YYYY-MM-DD)", "开始日期（YYYY-MM-DD）"), text: $outlineStartDate)
                        .textFieldStyle(.roundedBorder).keyboardType(.numbersAndPunctuation)
                        .focused($titleFocused)
                        .accessibilityIdentifier("trip.outline.startDate")
                    if store.detail == nil || !store.canEdit {
                        Text(text("You can leave the date unknown and edit this outline. Select or create an editable Trip below when you are ready to review a proposal.", "可以保留日期未知，先修改此草稿。准备审阅提议时，再在下方选择或创建可编辑的行程。"))
                            .font(.footnote).accessibilityIdentifier("trip.outline.chooseTrip")
                    }
                    Button(text("Add outline to local draft", "将方向加入本机草稿")) {
                        titleFocused = false
                        Task { await addOutlineToDraft() }
                    }
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("trip.outline.addToDraft")
                    .disabled(store.busy || store.detail == nil || !store.canEdit || !outlineCanPromote)
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

    private func lifecycleUpdated(_ terminal: NativeTripLifecycleTerminal?) async {
        if case .applied(let receipt) = terminal, receipt.action == .create, initialTripID == nil {
            // Keep the original planning request on this same screen; select the new empty Trip only after its receipt.
            await store.select(receipt.tripID, using: session)
        } else {
            await store.reload(using: session)
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
                        if initialPlanningRequest == nil { clearOutline() }
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
                NavigationLink(text("Create a fresh Trip with capacity review", "核对容量并创建全新行程")) {
                    NativeTripLifecycleView(session: session, chinese: chinese,
                                            onUpdated: { await lifecycleUpdated($0) })
                }
                .accessibilityIdentifier("trip.create.lifecycle")
                .disabled(store.busy || store.draft != nil || store.pending != nil || store.hasUncertainProposal)
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

    @ViewBuilder private func scopedEntry(detail: NativeTripDetail, dayID: String, itemID: String?) -> some View {
        if detail.confirmationState == "confirmed", let actor = session.dataScope,
           let selection = NativeScopedTripSelection(actor: actor, detail: detail, dayID: dayID, itemID: itemID) {
            Button(itemID == nil ? text("Ask VP / edit this day", "问 VP／编辑这一天") : text("Ask VP / edit this item", "问 VP／编辑此项目")) {
                scopedScrollID = selection.anchor; scopedSelection = selection
            }.disabled(store.busy || !store.canEdit || store.draft != nil || store.pending != nil || store.hasUncertainProposal)
                .accessibilityIdentifier("trip.scoped.entry.\(itemID ?? dayID)")
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
                    NavigationLink(text("Archive trip…", "归档行程…")) {
                        NativeTripLifecycleView(session: session, chinese: chinese, initialTripID: detail.trip.id,
                                                onUpdated: { await lifecycleUpdated($0) })
                    }
                    .accessibilityIdentifier("trip.archive.begin").disabled(store.busy)
                }
                if let reference = store.deletionReference {
                    Button(text("Delete this Trip…", "删除此行程…"), role: .destructive) {
                        deleteReference = reference; deleteVisible = true
                    }
                    .accessibilityIdentifier("trip.deletion.begin")
                    NavigationLink {
                        NativeLinkedTripDeletionView(tripID:detail.trip.id,headVersion:detail.trip.headVersion,onQueued:{id in store.hideLinkedDeletionScope(id)})
                    } label:{Label(text("Review linked-chat deletion scope…", "预览关联聊天协同删除范围…"),systemImage:"trash")}
                    .accessibilityIdentifier("trip.linkedDeletion.begin")
                }
                if let recovery = try? session.scopedTripEditRecovery(), recovery.tripID == detail.trip.id {
                    Button(text("Resolve pending local edit", "处理未决局部编辑")) { scopedRecovery = recovery }
                        .accessibilityIdentifier("trip.scoped.savedRecovery")
                }
                Text(detail.trip.title).font(.title2.bold()).accessibilityIdentifier("trip.confirmed.title")
                Text(detail.trip.id).font(.caption).textSelection(.enabled).accessibilityIdentifier("trip.selected.id")
                if detail.confirmationState == "confirmed" {
                    NavigationLink {
                        NativeTranslationView(initialTripID: detail.trip.id, initialTripScope: session.dataScope,
                                              initialTripVersion: detail.trip.headVersion)
                    } label: {
                        Label(text("Translate a selected field", "翻译所选字段"), systemImage: "character.bubble")
                    }
                    .disabled(store.scope != session.dataScope || store.busy || store.draft != nil || store.pending != nil
                              || store.hasUncertainProposal || store.deletionRequest != nil || store.deletionReceipt != nil
                              || !store.archiveAvailable || store.archive != nil)
                    .accessibilityIdentifier("trip.translation")
                    NavigationLink {
                        NativeTodayView(store: store, tripID: detail.trip.id)
                    } label: {
                        Label(text("Open Today", "打开今日"), systemImage: "sun.max")
                    }
                    .accessibilityIdentifier("trip.today")
                    NavigationLink {
                        NativeHotelComparisonView(detail: detail, store: store)
                    } label: {
                        Label(text("Compare accommodation", "比较住宿"), systemImage: "bed.double")
                    }
                    .accessibilityIdentifier("trip.hotelComparison")
                }
                NavigationLink(text("Preparation check", "准备检查")) {
                    NativeReadinessView(tripID: detail.trip.id, tripVersion: detail.trip.headVersion)
                }.accessibilityIdentifier("trip.readiness")
                if detail.content.days.isEmpty { Text(text("No days in this saved version.", "此保存版本尚无日期安排。")) }
                ForEach(detail.content.days) { day in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(day.date).font(.headline)
                        scopedEntry(detail: detail, dayID: day.id, itemID: nil)
                        if let zone = day.timeZone { Text(zone).font(.caption) }
                        ForEach(day.items) { item in
                            VStack(alignment: .leading, spacing: 4) {
                                NavigationLink(text("Item source references", "条目来源参考")) {
                                    NativeTripSupportView(session:session,tripID:detail.trip.id,tripVersion:detail.trip.headVersion,dayID:day.id,itemID:item.id,proposal:store.pending?.proposal,store:supportStore,chinese:settings.selectedLocale == .zh,ports:.init(read:{try await session.tripSupportRead($0)},context:{try await session.tripSupportContext(target:$0,proposal:$1)}))
                                }
                                Text(item.title).accessibilityIdentifier("trip.confirmed.item.\(item.id)")
                                scopedEntry(detail: detail, dayID: day.id, itemID: item.id)
                                if let start = item.startsAt { Text(start).font(.caption) }
                                if let end = item.endsAt { Text(end).font(.caption) }
                            }.id("scoped-item:\(item.id)")
                        }
                    }.id("scoped-day:\(day.id)")
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
                Text(text("Open a selected scope to review its current hard locks and explicitly linked reservation sources. Manual editing does not create a hard lock. Missing order links do not prove there is no order.", "打开选区可审阅当前硬锁与明确关联的预订来源。手动编辑不会自动加锁；缺少订单关联不代表没有订单。"))
                    .font(.footnote).foregroundStyle(Color.vpSecondaryText)
            }
        }
    }

    private func supportRecoveryPending(tripID:String)->Bool {
        do { return try session.tripSupportConfirmationRecovery()?.tripID==tripID }
        catch { return true }
    }
    private func proposal(_ pending: NativeTripPending) -> some View {
        VisePandaCard {
            VStack(alignment: .leading, spacing: 14) {
                NavigationLink(text("Check this proposal's constraints", "核验这份提议的约束")) {
                    NativePlanFeasibilityView(session:session,tripStore:store,chinese:settings.selectedLocale == .zh)
                }.disabled(store.busy || pending.proposal.stale)
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
                NativeTripSupportSelectionView(store:supportStore,chinese:settings.selectedLocale == .zh)
                ForEach(pending.proposal.dayDiffs,id:\.dayId) { day in
                    ForEach(day.items,id:\.itemId) { item in
                        NavigationLink(text("Review sources for \(day.dayId)/\(item.itemId)", "审阅条目来源 \(day.dayId)/\(item.itemId)")) {
                            NativeTripSupportView(session:session,tripID:pending.trip.id,tripVersion:pending.proposal.baseTripVersion,dayID:day.dayId,itemID:item.itemId,proposal:pending.proposal,store:supportStore,chinese:settings.selectedLocale == .zh,ports:.init(read:{try await session.tripSupportRead($0)},context:{try await session.tripSupportContext(target:$0,proposal:$1)}))
                        }
                    }
                }
                if let selection=supportStore.selectionReference {
                    Button(text("Confirm with the selected references", "连同所选参考确认")) {
                        reviewedReference=store.confirmationReference;reviewedSupportSelection=selection;supportConfirmVisible=true
                    }.disabled(supportRecoveryPending(tripID:pending.trip.id) || supportStore.confirmationUnknown || store.busy || !store.canEdit || pending.proposal.stale || store.detail?.trip.headVersion != pending.proposal.baseTripVersion)
                }
                Button(text("Confirm this proposal", "确认此提议")) { reviewedReference = store.confirmationReference; confirmVisible = true }
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("trip.proposal.confirm")
                    .disabled(supportRecoveryPending(tripID:pending.trip.id) || !supportStore.selectedIDs.isEmpty || supportStore.confirmationUnknown || store.busy || !store.canEdit || pending.proposal.stale || store.notice == "STALE_TRIP_VERSION" || store.detail?.trip.headVersion != pending.proposal.baseTripVersion)
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
        case .reorderItems:
            func orderText(_ items: [NativeTripItem]?) -> String {
                items?.map { "\($0.title) · \($0.manualOrder.map(String.init) ?? unset)" }.joined(separator: " → ") ?? absent
            }
            return (orderText(day?.items), orderText(pending.proposal.after?.days.first(where: { $0.id == operation.dayId })?.items))
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
        case .reorderItems: text("Change item order", "更改项目顺序")
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
        case "REAUTHENTICATION_REQUIRED": text("Sign out and sign in again in Profile, then check this same deletion request within five minutes.", "请在「我的」退出并重新登录，并在五分钟内查询同一删除请求。")
        case "TRIP_HAS_CHAT_REFERENCES": text("This legacy deletion path rejects linked chats. Use the separate exact linked-deletion preview; nothing was deleted by this request.", "旧删除路径不处理关联聊天，请使用单独的精确协同删除预览；本请求未删除任何内容。")
        case "DELETION_ALREADY_REQUESTED": text("A deletion request already exists for this Trip. Contact support with the Trip ID if its receipt is unavailable.", "此行程已有删除请求。若无法读取原回执，请携带行程 ID 联系支持团队。")
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

import SwiftUI

struct NativeTripLifecycleView: View {
    let session: NativeSession
    let chinese: Bool
    var initialTripID: String? = nil
    var onUpdated: (NativeTripLifecycleTerminal?) async -> Void = { _ in }
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var phase
    @State private var store = NativeTripLifecycleStore()
    @State private var title = ""
    @State private var archiveTrip: NativeTripLifecycleTrip?
    @State private var activation: NativeTripLifecycleTrip?
    @State private var reviewedActivation: NativeTripLifecycleSnapshot?
    @State private var abandonVisible = false
    private var client: NativeTripLifecycleClient { .init(session: session) }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(t("行程只会在你明确选择后启用或归档，日期过去不会自动结束行程。",
                       "Trips become active or archived only when you choose. Passing dates never end a Trip automatically."))
                if store.pending != nil { recovery }
                if let notice = store.notice {
                    Text(NativeTripLifecycleCopy.notice(notice, chinese: chinese))
                        .accessibilityIdentifier("trip.lifecycle.notice")
                }
                if store.busy { ProgressView(t("正在核对行程", "Checking Trips")) }
                Button(t("刷新容量与状态", "Refresh capacity and state")) { Task { await store.load(client) } }
                    .disabled(store.busy).accessibilityIdentifier("trip.lifecycle.refresh")
                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    if phase == .active, let snapshot = store.visible(session.dataScope) {
                        capacity(snapshot)
                        tripRows(snapshot)
                    } else {
                        Text(t("当前状态未读取或已过期，请刷新后选择。", "Current state is unread or expired. Refresh before choosing."))
                    }
                }
                Text(t("归档保留已保存成果，不取消未完服务。服务状态暂不可核实，不能据此认为没有未完服务。Journey Pass 到期不会删除已保存成果。",
                       "Archiving retains saved results and does not cancel unfinished services. Service status is unavailable; this does not mean no services remain. Journey Pass expiry does not erase saved results."))
                    .font(.footnote).accessibilityIdentifier("trip.lifecycle.retention")
                NavigationLink(t("查看已有服务入口", "Open existing service access")) { NativeServiceCaseView() }
            }
            .padding()
        }
        .navigationTitle(t("结束与下一次旅行", "Finish and next Trip"))
        .task(id: session.dataScope) {
        store.journalObservation = session.journalDataObservation(.tripLifecycle)
            store.bind(session.dataScope)
            if phase == .active {
                await store.load(client)
                while let initialTripID, store.visible(session.dataScope) != nil,
                      !store.trips.contains(where: { $0.id == initialTripID }), store.nextTripID != nil {
                    await store.load(client, next: true)
                    if Task.isCancelled { return }
                }
            }
        }
        .onChange(of: phase) { _, next in
            archiveTrip = nil; activation = nil; reviewedActivation = nil
            if next == .active { Task { await store.load(client) } } else { store.suspend() }
        }
        .onChange(of: session.dataScope) { _, actor in
            archiveTrip = nil; activation = nil; reviewedActivation = nil; store.bind(actor); title = ""
        }
        .onDisappear { store.suspend() }
        .sheet(item: $archiveTrip) { trip in
            NativeTripLifecycleArchiveSheet(session: session, store: store, trip: trip, chinese: chinese, onUpdated: onUpdated)
        }
        .confirmationDialog(t("启用所选行程？", "Activate selected Trip?"), isPresented: Binding(
            get: { activation != nil }, set: { if !$0 { activation = nil; reviewedActivation = nil } }), titleVisibility: .visible) {
            if let trip = activation, let reviewed = reviewedActivation {
                Button(t("明确切换到此行程", "Switch explicitly to this Trip")) {
                    Task { await store.perform(.activate, trip: trip, reviewed: reviewed, client: client); await onUpdated(store.receipt) }
                }
            }
            Button(t("继续查看", "Keep reviewing"), role: .cancel) {}
        } message: {
            Text(t("当前 Active 会在同一次操作中转为草稿；容量或版本不匹配时保留原 Active。不会删除成果或归档其他行程。",
                   "The current Active becomes a draft in the same operation. Capacity or version conflicts preserve the original Active. Saved results and other Trips are retained."))
        }
        .confirmationDialog(t("停止尚未确定的请求？", "Stop this unresolved request?"), isPresented: $abandonVisible, titleVisibility: .visible) {
            Button(t("核对并停止同一请求", "Check and stop the same request"), role: .destructive) {
                Task { await store.resolve(client, abandon: true); await onUpdated(store.receipt) }
            }
            Button(t("继续保留请求", "Keep the request"), role: .cancel) {}
        } message: {
            Text(t("服务器会阻止尚未执行的原请求；如果原请求已完成，会返回原回执，不会撤销已经完成的变化。",
                   "The server fences the original request if it has not executed. If it already completed, its original receipt is returned; completed changes are not undone."))
        }
    }

    private var recovery: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(t("有一个待核实的请求。请先处理它，再开始其他变化。", "One request needs verification. Resolve it before making another change."))
            Button(t("查询原请求", "Check original request")) { Task { await store.resolve(client); await onUpdated(store.receipt) } }
                .accessibilityIdentifier("trip.lifecycle.recover")
            Button(t("重试原请求", "Retry original request")) { Task { await store.resolve(client, resend: true); await onUpdated(store.receipt) } }
                .accessibilityIdentifier("trip.lifecycle.retry")
            Button(t("停止原请求…", "Stop original request…")) { abandonVisible = true }
                .accessibilityIdentifier("trip.lifecycle.abandon")
        }.disabled(store.busy)
    }

    private func capacity(_ view: NativeTripLifecycleSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(t("草稿 \(view.capacity.draftCount)/3 · Active \(view.capacity.activeTripId == nil ? 0 : 1)/1",
                   "Drafts \(view.capacity.draftCount)/3 · Active \(view.capacity.activeTripId == nil ? 0 : 1)/1"))
                .font(.headline).accessibilityIdentifier("trip.lifecycle.capacity")
            if let active = view.capacity.activeTripId {
                Text(t("当前 Active：", "Current Active: ") + (store.trips.first { $0.id == active }?.title ?? active))
                    .accessibilityIdentifier("trip.lifecycle.active")
            }
            if view.capacity.legacyCount > 0 {
                Text(t("有 \(view.capacity.legacyCount) 个旧行程需明确对账。逐个选择草稿、已保存历史或启用后，才能创建新行程。",
                       "\(view.capacity.legacyCount) older Trips need explicit reconciliation. Choose draft, saved history or activation for each before creating a new Trip."))
            } else if view.capacity.draftCount == 3 {
                Text(t("草稿容量已满。可启用一份已确认草稿，或主动归档已确认行程，再创建新草稿。",
                       "Draft capacity is full. Activate a confirmed draft or explicitly archive a confirmed Trip before creating another draft."))
            }
            TextField(t("新行程名称", "New Trip title"), text: $title)
                .accessibilityIdentifier("trip.lifecycle.title")
            Button(t("创建全新草稿", "Create a fresh draft")) {
                Task { await store.perform(.create, title: title.trimmingCharacters(in: .whitespacesAndNewlines), reviewed: view, client: client)
                    await onUpdated(store.receipt)
                    if case .applied(let receipt) = store.receipt, receipt.action == .create { dismiss() } }
            }
            .disabled(store.busy || store.pending != nil || view.capacity.legacyCount > 0 || view.capacity.draftCount >= 3
                      || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || title.utf16.count > 160)
            .accessibilityIdentifier("trip.lifecycle.create")
            Text(t("新草稿只使用新名称，不复制旧日期、地点、临时限制或未同意偏好。", "The fresh draft uses only its new title. Old dates, places, temporary constraints and unconsented preferences are not copied."))
                .font(.footnote)
        }
    }

    private func tripRows(_ view: NativeTripLifecycleSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            ForEach(store.trips) { trip in
                VStack(alignment: .leading, spacing: 8) {
                    Text(trip.title).font(.headline)
                    Text(NativeTripLifecycleCopy.state(trip.state, chinese: chinese))
                    if trip.id == initialTripID { Text(t("当前查看的同一行程", "The same Trip you were viewing")).font(.caption) }
                    NavigationLink(t("查看此行程与保存成果", "Read this Trip and saved results")) {
                        NativeTripView(initialTripID: trip.id, initialTripScope: session.dataScope)
                    }.accessibilityIdentifier("trip.lifecycle.open.\(trip.id)")
                    if trip.state == .legacy {
                        Button(t("明确记为草稿", "Classify explicitly as draft")) {
                            Task { await store.perform(.reconcile, trip: trip, state: .draft, reviewed: view, client: client); await onUpdated(store.receipt) }
                        }.disabled(view.capacity.draftCount >= 3 || store.pending != nil || store.busy)
                        if trip.headVersion > 0 {
                            Button(t("保留为已保存历史", "Retain as saved history")) {
                                Task { await store.perform(.reconcile, trip: trip, state: .retained, reviewed: view, client: client); await onUpdated(store.receipt) }
                            }.disabled(store.pending != nil || store.busy)
                        }
                    }
                    if trip.state != .archived, trip.state != .active, trip.headVersion > 0 {
                        Button(t("明确启用／切换…", "Activate / switch explicitly…")) { activation = trip; reviewedActivation = view }
                            .disabled(store.pending != nil || store.busy).accessibilityIdentifier("trip.lifecycle.activate.\(trip.id)")
                    }
                    if trip.state != .archived, trip.headVersion > 0 {
                        Button(t("结束／归档并选择偏好…", "Finish / archive and choose preferences…")) { archiveTrip = trip }
                            .disabled(store.pending != nil || store.busy).accessibilityIdentifier("trip.lifecycle.archive.\(trip.id)")
                    }
                }
            }
            if store.nextTripID != nil {
                Button(t("读取更多行程", "Read more Trips")) { Task { await store.load(client, next: true) } }
                    .disabled(store.busy).accessibilityIdentifier("trip.lifecycle.more")
            }
        }
    }
}

enum NativeTripLifecycleCopy {
    static func state(_ state: NativeTripLifecycleState, chinese: Bool) -> String {
        switch state {
        case .legacy: chinese ? "旧行程 · 待明确对账" : "Older Trip · needs reconciliation"
        case .draft: chinese ? "草稿" : "Draft"
        case .active: chinese ? "当前 Active" : "Current Active"
        case .retained: chinese ? "已保存历史" : "Saved history"
        case .archived: chinese ? "已归档 · 仍可读取" : "Archived · still readable"
        }
    }
    static func notice(_ code: String, chinese: Bool) -> String {
        let en: String, zh: String
        switch code {
        case "acknowledged": (zh, en) = ("服务器已确认原请求；已重新读取当前状态。", "The server confirmed the original request. Current state was reread.")
        case "USER_ABANDONED": (zh, en) = ("原请求已停止，尚未执行的变化不会再发生。", "The original request is stopped. Its unexecuted changes cannot apply later.")
        case "TRIP_CAPACITY": (zh, en) = ("容量不足，原 Active 保持不变。请查看当前草稿与 Active 再选择。", "Capacity is full; the original Active is unchanged. Review current drafts and Active before choosing again.")
        case "LEGACY_RECONCILIATION_REQUIRED": (zh, en) = ("请先明确对账旧行程，已有历史不会被自动启用或删除。", "Reconcile older Trips first. Existing history is never automatically activated or deleted.")
        case "MEMORY_CONFLICT": (zh, en) = ("偏好或同意已变化，请重新读取并逐项选择；未确认归档。", "A preference or consent changed. Reread and choose each one again; archive is not confirmed.")
        case "LIFECYCLE_CONFLICT", "STALE_TRIP_VERSION", "reviewExpired": (zh, en) = ("状态或版本已变化，请刷新并重新审阅。未确认新的变化。", "State or version changed. Refresh and review again. New changes are not confirmed.")
        case "PROPOSAL_NOT_CONFIRMABLE": (zh, en) = ("此行程尚无可核实的确认成果，不能启用、归档或记为已保存历史。", "This Trip has no verifiable confirmed result for activation, archive or saved-history classification.")
        case "UNAUTHENTICATED", "SESSION_REPLACED", "FORBIDDEN": (zh, en) = ("当前登录或权限不可用，请在「我的」重新核对。原请求不能在新会话中重放。", "The current sign-in or permission is unavailable. Check Profile. The original request cannot replay in a new session.")
        case "storage": (zh, en) = ("受保护的请求记录不可用，不能发送新变化。请解锁设备后重试。", "The protected request journal is unavailable. New changes cannot be sent. Unlock the device and retry.")
        default: (zh, en) = ("请求结果尚未确定。查询或重试同一请求，不要重复创建新请求。", "The request outcome is unresolved. Check or retry the same request before creating another.")
        }
        return chinese ? zh : en
    }
}

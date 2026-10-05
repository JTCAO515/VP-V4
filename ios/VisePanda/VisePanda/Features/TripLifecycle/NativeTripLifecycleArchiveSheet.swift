import SwiftUI

struct NativeTripLifecycleArchiveSheet: View {
    let session: NativeSession
    let store: NativeTripLifecycleStore
    let trip: NativeTripLifecycleTrip
    let chinese: Bool
    var onUpdated: (NativeTripLifecycleTerminal?) async -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var phase
    @State private var review: NativeTripPreferenceReview?
    @State private var reviewed: NativeTripLifecycleSnapshot?
    @State private var loading = false
    @State private var preferenceFailed = false
    @State private var changed = false
    @State private var deadline: TimeInterval = 0
    @State private var generation = UUID()
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    private var client: NativeTripLifecycleClient { .init(session: session) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text(trip.title).font(.headline)
                    Text(t("归档保留此行程的成果与未完服务，不取消服务。日期不会触发自动归档。",
                           "Archiving retains this Trip's results and unfinished services, without cancelling services. Dates never trigger automatic archive."))
                    if loading { ProgressView(t("读取已同意偏好", "Reading consented preferences")) }
                    if preferenceFailed {
                        Text(t("偏好读取失败，尚未判断有没有合法偏好。可以重试读取，或明确跳过本次保留选择。",
                               "Preferences could not be read. Availability is unknown. Retry the read or explicitly skip this retention choice."))
                            .accessibilityIdentifier("trip.lifecycle.preferences.unavailable")
                    }
                    if changed { Text(t("行程或偏好依据已变化，请重新读取并选择。", "Trip or preference basis changed. Reread and choose again.")) }
                    TimelineView(.periodic(from: .now, by: 1)) { _ in
                        if let review, phase == .active, ProcessInfo.processInfo.systemUptime < deadline,
                           session.dataScope == review.actor {
                            NativeTripPreferencePicker(review: Binding(get: { self.review ?? review }, set: { self.review = $0 }),
                                                       chinese: chinese, disabled: loading || store.busy || store.pending != nil)
                            Button(t("归档并保留明确选中的偏好", "Archive with explicitly selected preferences")) {
                                Task { await archive(skip: false) }
                            }
                            .disabled(review.selectedIDs.isEmpty || store.pending != nil || store.busy || loading)
                            .accessibilityIdentifier("trip.lifecycle.archive.keep")
                        }
                    }
                    Button(t("重新读取偏好与行程依据", "Reread preferences and Trip basis")) { Task { await load() } }
                        .disabled(loading || store.busy || store.pending != nil)
                    Button(t("跳过偏好选择并归档", "Skip preference selection and archive")) { Task { await archive(skip: true) } }
                        .disabled(loading || store.busy || store.pending != nil || reviewed == nil || phase != .active)
                        .accessibilityIdentifier("trip.lifecycle.archive.skip")
                    Text(t("此选择只记录这次归档的保留意图。不复制或重新授权记忆；跳过不会撤回已有全局记忆。以后仍由原记忆机制核对是否可使用。",
                           "This records retention intent for this archive. It does not copy or reauthorize Memory. Skipping leaves existing global Memory consent unchanged. Future use still follows original Memory qualification."))
                        .font(.footnote)
                    if let notice = store.notice { Text(NativeTripLifecycleCopy.notice(notice, chinese: chinese)) }
                    if store.pending != nil {
                        Text(t("请求结果未确认。可关闭此页，在生命周期页查询、重试或停止原请求。", "The request is unresolved. Close this sheet to check, retry or stop the original request on the lifecycle page."))
                    }
                }.padding()
            }
            .navigationTitle(t("明确结束与归档", "Explicit finish and archive"))
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(t("关闭", "Close")) { dismiss() }.disabled(loading || store.busy) } }
        }
        .interactiveDismissDisabled(loading || store.busy)
        .task { await load() }
        .onChange(of: phase) { _, next in
            if next != .active { generation = UUID(); review = nil; reviewed = nil; deadline = 0; loading = false }
            else { Task { await load() } }
        }
        .onChange(of: session.dataScope) { _, _ in generation = UUID(); review = nil; reviewed = nil; deadline = 0; loading = false }
        .onDisappear { generation = UUID(); review = nil; reviewed = nil }
    }

    private func load() async {
        guard !loading, store.pending == nil, let actor = session.dataScope, phase == .active else { return }
        let own = UUID(); generation = own; loading = true; review = nil; reviewed = nil; preferenceFailed = false; changed = false
        defer { if generation == own { loading = false } }
        if store.visible(actor) == nil {
            await store.load(client)
            while generation == own, store.visible(actor) != nil, !store.trips.contains(trip), store.nextTripID != nil {
                await store.load(client, next: true)
                if Task.isCancelled { return }
            }
        }
        guard generation == own, session.dataScope == actor, !Task.isCancelled,
              let snapshot = store.visible(actor), store.trips.contains(trip) else { changed = true; return }
        reviewed = snapshot
        let started = ProcessInfo.processInfo.systemUptime
        do {
            let bytes = try await session.memoryProfilesRequest()
            guard generation == own, session.dataScope == actor, phase == .active, !Task.isCancelled else { return }
            let profiles = try NativeMemoryWire.read(bytes, owner: actor.subject)
            review = try .init(tripID: trip.id, headVersion: trip.headVersion, actor: actor, profiles: profiles)
            deadline = started + 30
        } catch {
            guard generation == own, session.dataScope == actor else { return }
            preferenceFailed = true
        }
    }

    private func archive(skip: Bool) async {
        guard !loading, !store.busy, store.pending == nil, phase == .active,
              let actor = session.dataScope, let reviewed, store.visible(actor) == reviewed,
              store.trips.contains(trip) else { changed = true; return }
        let own = generation
        var references: [NativeTripPreferenceReview.Reference] = []
        if !skip {
            guard let review, !review.selectedIDs.isEmpty, ProcessInfo.processInfo.systemUptime < deadline else { changed = true; return }
            loading = true
            do {
                let bytes = try await session.memoryProfilesRequest()
                guard generation == own, session.dataScope == actor, phase == .active, !Task.isCancelled else { return }
                references = try review.references(currentActor: actor, tripID: trip.id, headVersion: trip.headVersion,
                                                    profiles: NativeMemoryWire.read(bytes, owner: actor.subject))
            } catch { loading = false; changed = true; self.review = nil; return }
            loading = false
        }
        guard generation == own, store.visible(actor) == reviewed else { changed = true; return }
        await store.perform(.archive, trip: trip, preferences: references, reviewed: reviewed, client: client)
        await onUpdated(store.receipt)
        if case .applied(let receipt) = store.receipt, receipt.tripID == trip.id, receipt.action == .archive { dismiss() }
    }
}

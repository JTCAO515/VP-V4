import SwiftUI

struct NativeProposalReferenceView: View {
    let store: NativeProposalReferenceStore
    let scope: NativeDataScope?
    let isActive: Bool
    let chinese: Bool
    @Environment(\.scenePhase) private var phase
    private func text(_ en: String, _ zh: String) -> String { chinese ? zh : en }
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { _ in
            VStack(alignment: .leading, spacing: 12) {
                Text(text("Saved proposal reference", "已存提案引用")).font(.headline)
                if let value = store.visible(scope: scope, active: isActive && phase == .active) {
                    Text(text("A read-only reference to an existing proposal. Review its details and eligibility in the original proposal workflow.", "这是已有提案的只读引用。请在原提案流程重新核对正文与适用资格。"))
                    Text(text("Proposal record version", "提案记录版本") + ": v\(value.proposalRevision)")
                    Text(text("Result record version", "成果记录版本") + ": r\(value.artifactRevision)")
                    Text(text("Linked Trip base", "关联行程基础版本") + ": v\(value.tripVersion)")
                    Text(text("Eligible at this read. Eligibility can change; re-read the authoritative proposal before further use. Task and goal records describe an association, not who generated the proposal.", "本次读取时符合资格。资格可能变化，后续使用前须权威重新读取。Task 与目标记录说明关联，不代表提案由该 Task 生成。"))
                        .font(.footnote).foregroundStyle(Color.vpSecondaryText)
                        .accessibilityIdentifier("proposal.reference.qualifier")
                } else if store.state == .loading && isActive && phase == .active { ProgressView() }
                else { Text(text("Reference unavailable or expired. Read the exact record again before using it.", "引用暂不可读或已过期，使用前请重新读取精确记录。"))
                    .accessibilityIdentifier("proposal.reference.unavailable") }
            }.frame(maxWidth: .infinity, alignment: .leading)
                .padding().background(Color.vpSurface, in: RoundedRectangle(cornerRadius: 16))
        }
        .onChange(of: isActive) { _, value in if !value { store.clear() } }
        .onChange(of: scope) { _, _ in store.clear() }
        .onChange(of: phase) { _, value in if value != .active { store.clear() } }
        .onDisappear { store.clear() }
    }
}

/// Library entry uses only the existing owned Trip list, then dedicated discovery and exact reads.
struct NativeLibraryProposalReferenceView: View {
    let isActive: Bool
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var phase
    @State private var trips = NativeTripStore()
    @State private var store = NativeProposalReferenceStore()
    @State private var selectedTrip: String?
    @State private var refresh = UUID()
    private var session: NativeSession { settings.nativeSession }
    private var chinese: Bool { settings.selectedLocale == .zh }
    private var active: Bool { isActive && phase == .active }
    private func text(_ en: String, _ zh: String) -> String { chinese ? zh : en }
    private struct Key: Equatable {
        let scope: NativeDataScope?
        let active: Bool
        let trip: String?
        let refresh: UUID
    }
    private var listKey: Key { .init(scope: session.dataScope, active: active, trip: nil, refresh: refresh) }
    private var readKey: Key { .init(scope: session.dataScope, active: active, trip: selectedTrip, refresh: refresh) }
    var body: some View {
        VStack(alignment: .leading, spacing: VPSpacing.compact) {
            Text(text("Saved proposal references", "已存提案引用")).font(.title2.bold())
            Text(text("Choose one of your Trips to read its latest eligible saved reference.", "选择你的行程，读取最近一条本次符合资格的已存引用。"))
                .foregroundStyle(Color.vpSecondaryText)
            if active, let scope = session.dataScope, trips.scope == scope {
                if trips.busy { ProgressView() }
                else if trips.notice != nil {
                    Text(text("Trip list unavailable. Refresh to retry.", "行程列表暂不可读，请刷新重试。"))
                } else if trips.trips.isEmpty {
                    Text(text("No Trips available.", "暂无可选行程。"))
                }
                ForEach(trips.trips) { trip in
                    Button {
                        guard selectedTrip != trip.id else { return }
                        store.clear(); selectedTrip = trip.id
                    } label: {
                        HStack {
                            Text(trip.title)
                            Spacer()
                            if selectedTrip == trip.id { Image(systemName: "checkmark") }
                        }
                    }.buttonStyle(.bordered)
                        .accessibilityIdentifier("library.proposal.trip." + trip.id)
                }
                if selectedTrip != nil {
                    NativeProposalReferenceView(store: store, scope: scope, isActive: active, chinese: chinese)
                }
                Button(text("Refresh proposal references", "刷新提案引用")) {
                    store.clear(); refresh = UUID()
                }.buttonStyle(.bordered).accessibilityIdentifier("library.proposal.refresh")
            } else {
                Text(text("Sign in to read your Trip references.", "登录后读取你的行程引用。"))
            }
        }
        .task(id: listKey) {
            let key = listKey
            guard key.active, let scope = key.scope else { clear(); return }
            trips.reset(for: scope)
            await trips.list(using: session)
            guard !Task.isCancelled, listKey == key else { return }
            if !trips.trips.contains(where: { $0.id == selectedTrip }) { store.clear(); selectedTrip = nil }
        }
        .task(id: readKey) {
            let key = readKey
            guard key.active, let trip = key.trip else { store.clear(); return }
            await store.loadTrip(tripID: trip, scope: key.scope, active: key.active,
                                 currentScope: { session.dataScope }, selectedTrip: { selectedTrip },
                                 discover: { try await session.tripProposalReferenceRequest(tripID: $0) },
                                 read: { try await session.proposalReferenceRequest(artifactID: $0, revision: $1) })
        }
        .onChange(of: session.dataScope) { _, _ in clear() }
        .onChange(of: active) { _, value in if !value { clear() } }
        .onDisappear { clear() }
    }
    private func clear() { store.clear(); selectedTrip = nil; trips.reset(for: nil) }
}

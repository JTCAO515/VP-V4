import SwiftUI

struct NativeSavedPlaceActionsView: View {
    let session: NativeSession
    let chinese: Bool
    let active: Bool
    @Environment(\.scenePhase) private var phase
    @Environment(\.dismiss) private var dismiss
    @State private var trips = NativePlaceActionTrips()
    @State private var store = NativeSavedPlaceStore()
    @State private var selectedTrip: String?
    @State private var opened: NativeSavedPlaceOpen?
    @State private var refresh = UUID()
    @State private var cursor: NativeSavedPlaceCursor?
    private var scope: NativeDataScope? { active && phase == .active ? session.dataScope : nil }
    private var selected: NativeTripSummary? { trips.trips.first { $0.id == selectedTrip } }
    private struct Key: Equatable { let scope: NativeDataScope?; let trip: String?; let refresh: UUID; var cursor: NativeSavedPlaceCursor? = nil }
    private var key: Key { .init(scope: scope, trip: selectedTrip, refresh: refresh, cursor: cursor) }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    var body: some View {
        NavigationStack {
            Form {
                Text(t("收藏的是同一行程的地点身份引用。过期、撤回或映射变化仍保留准确取消入口。", "Saved entries are place identity references in the same Trip. Expiry, withdrawal and mapping changes preserve the exact Unsave path."))
                if let scope, trips.scope == scope {
                    Picker(t("选择你的行程", "Choose your Trip"), selection: $selectedTrip) {
                        Text(t("请选择", "Choose")).tag(String?.none)
                        ForEach(trips.trips) { Text($0.title).tag(Optional($0.id)) }
                    }.accessibilityIdentifier("saved.places.trip")
                    TimelineView(.periodic(from: .now, by: 1)) { _ in
                        if let rows = store.visible(scope: scope, tripId: selectedTrip, version: selected?.headVersion), trips.readable(scope: scope) {
                            if rows.isEmpty { Text(t("本页没有已收藏地点。", "This page has no saved places.")) }
                            Text(t("本页最多20条。只有没有下一页才到达此快照末尾；打开前会重新核对准确对象。", "At most 20 entries per page. No next page marks this snapshot's end. Opening rechecks the exact object.")).font(.caption)
                            ForEach(rows) { row in
                                Button {
                                    guard opened == nil, store.visible(scope: scope, tripId: selectedTrip, version: selected?.headVersion) != nil,
                                          let trip = selected else { return }
                                    opened = .init(scope: scope, tripId: trip.id, tripVersion: trip.headVersion, row: row)
                                } label: {
                                    VStack(alignment: .leading) {
                                        Text(row.label(chinese: chinese))
                                        Text(row.mappingStatus == "current" ? t("当前映射；打开后重新核对", "Current mapping; opening rechecks it") : t("映射变化或不可用；仍可准确取消", "Mapping changed or unavailable; exact Unsave remains available")).font(.caption)
                                    }
                                }.accessibilityIdentifier("saved.places.open." + row.referenceId)
                            }
                            if let next = store.nextCursor {
                                Button(t("继续下一页", "Continue to next page")) { store.clear(); cursor = next }
                                    .accessibilityIdentifier("saved.places.next")
                            }
                        } else if store.busy || trips.loading { ProgressView() }
                        else if selectedTrip != nil { Text(t("读取失败、列表过期或超过容量，未宣称收藏为空。请刷新。", "Read failed, expired or exceeded capacity. The collection is not confirmed empty. Refresh.")) }
                    }
                } else { Text(t("请登录后读取自己的收藏引用。", "Sign in to read your saved references.")) }
                Button(t("刷新行程与已收藏引用", "Refresh Trips and saved references")) { store.clear(); cursor = nil; refresh = UUID() }
                    .accessibilityIdentifier("saved.places.refresh")
            }
            .navigationTitle(t("已收藏地点引用", "Saved place references"))
            .toolbar { ToolbarItem(placement: .topBarLeading) { Button(t("返回资源库", "Return to Library")) { dismiss() } } }
        }
        .task(id: key) {
            let requested = key
            guard let scope else { clear(); return }
            await trips.list(scope: scope, current: { self.scope }) { try await session.tripRequest(path: "api/trips/native/v2", method: "GET") }
            guard self.scope == scope, key == requested, !Task.isCancelled else { return }
            if !trips.trips.contains(where: { $0.id == selectedTrip }) { selectedTrip = nil }
            await load()
        }
        .onChange(of: scope) { _, _ in clear() }
        .onChange(of: selectedTrip) { _, _ in store.clear(); opened = nil; cursor = nil }
        .onDisappear { if opened == nil { clear() } }
        .sheet(item: $opened, onDismiss: { store.clear(); cursor = nil; refresh = UUID() }) { value in
            NavigationStack {
                ScrollView {
                    if scope == value.scope {
                        NativePlaceActionsView(candidate: value.candidate, session: session, chinese: chinese, active: active, savedReference: value).padding()
                    } else { Text(t("登录身份已变化，请重新打开收藏。", "Identity changed. Reopen the saved reference.")) }
                }.navigationTitle(value.row.label(chinese: chinese))
            }
        }
    }
    private func load() async {
        guard let scope, let trip = selected, trips.readable(scope: scope), opened == nil else { store.clear(); return }
        let requestedCursor = cursor
        await store.load(scope: scope, tripId: trip.id, version: trip.headVersion, locale: chinese ? "zh" : "en", cursor: requestedCursor,
                         current: { self.scope == scope && selected?.id == trip.id && selected?.headVersion == trip.headVersion && opened == nil && cursor == requestedCursor }) {
            try await session.placeActionRequest(tripId: trip.id, body: $0, actor: scope)
        }
    }
    private func clear() { trips.clear(); store.clear(); selectedTrip = nil; opened = nil; cursor = nil }
}

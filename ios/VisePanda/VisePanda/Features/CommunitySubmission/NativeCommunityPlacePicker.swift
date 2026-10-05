import SwiftUI

/// Uses the original current-owner saved-place reader; never writes a Save or Trip.
struct NativeCommunityPlacePicker: View {
    let session: NativeSession
    let actor: NativeCommunityActor
    let chinese: Bool
    let selected: (NativeCommunityPlaceSelection) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var phase
    @State private var trips = NativePlaceActionTrips()
    @State private var saved = NativeSavedPlaceStore()
    @State private var tripID: String?
    @State private var cursor: NativeSavedPlaceCursor?
    @State private var refresh = UUID()
    private var scope: NativeDataScope? { phase == .active && (try? session.communityActor()) == actor ? actor.scope : nil }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    var body: some View {
        NavigationStack {
            Form {
                Text(t("明确选择当前行程内已收藏、映射有效的地点引用。仅关联投稿，不会新增收藏或改动行程。", "Explicitly choose a saved place with a current mapping in your Trip. This links the submission without creating a Save or changing the Trip."))
                if trips.readable(scope: scope) {
                    Picker(t("自己的行程", "Your Trip"), selection: $tripID) {
                        Text(t("请选择", "Choose a Trip")).tag(String?.none)
                        ForEach(trips.trips) { Text($0.title).tag(Optional($0.id)) }
                    }.accessibilityIdentifier("community.place.trip")
                }
                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    if let trip = trips.detail?.trip, trip.id == tripID, trips.readable(scope: scope),
                       let rows = saved.visible(scope: scope, tripId: trip.id, version: trip.headVersion) {
                        ForEach(rows.filter { $0.mappingStatus == "current" }) { row in
                            Button(row.label(chinese: chinese)) {
                                guard let scope, scope == actor.scope, trips.readable(scope: scope),
                                      saved.visible(scope: scope, tripId: trip.id, version: trip.headVersion)?.contains(row) == true else { return }
                                selected(.init(tripID: trip.id, referenceID: row.referenceId, label: row.label(chinese: chinese), actor: actor, tripVersion: trip.headVersion, row: row, cursor: cursor))
                                dismiss()
                            }.accessibilityIdentifier("community.place.select.\(row.id)")
                        }
                        if !rows.contains(where: { $0.mappingStatus == "current" }) { Text(t("本页没有当前可用的已收藏地点。", "No saved places with a current mapping are available on this page.")) }
                        if let next = saved.nextCursor { Button(t("收藏下一页", "Next saved page")) { cursor = next } }
                    }
                }
                Button(t("重新读取自己的行程", "Reread your Trips")) { refresh = UUID() }.disabled(scope == nil || trips.loading || saved.busy)
                Link(t("返回探索明确收藏地点", "Open Explore to explicitly save a place"), destination: URL(string: "visepanda://explore")!)
                Text(t("也可取消后明确选择本次不关联地点。", "You can cancel and explicitly choose no place association for this submission.")).font(.caption)
                if trips.loading || saved.busy { ProgressView() }
                if trips.unavailable || saved.unavailable { Text(t("地点资料暂不可读，请刷新。", "Place data is unavailable. Refresh to read again.")) }
            }.navigationTitle(t("关联已有地点", "Associate a saved place"))
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button(t("取消", "Cancel")) { dismiss() } } }
                .task(id: ReadKey(scope: scope, refresh: refresh)) {
                    clear(); guard let scope else { return }
                    await trips.list(scope: scope, current: { self.scope }) { try await session.tripRequest(path: "api/trips/native/v2", method: "GET") }
                }
                .task(id: tripID) { cursor = nil; saved.clear(); if let tripID { await readTrip(tripID) } }
                .task(id: cursor) { if cursor != nil, let tripID { await readTrip(tripID) } }
                .onChange(of: scope) { _, _ in clear() }
                .onDisappear { clear() }
        }
    }
    private struct ReadKey: Equatable { let scope: NativeDataScope?; let refresh: UUID }
    private func clear() { saved.clear(); trips.clear(); tripID = nil; cursor = nil }
    private func readTrip(_ id: String) async {
        guard let scope else { return }
        await trips.select(tripId: id, scope: scope, current: { self.scope }) { try await session.tripRequest(path: "api/trips/native/v2/" + id, method: "GET") }
        guard self.scope == scope, tripID == id, trips.readable(scope: scope), let trip = trips.detail?.trip else { return }
        let requested = cursor
        await saved.load(scope: scope, tripId: id, version: trip.headVersion, locale: chinese ? "zh" : "en", cursor: requested,
                         current: { self.scope == scope && tripID == id && trips.detail?.trip.headVersion == trip.headVersion && cursor == requested }) {
            try await session.placeActionRequest(tripId: id, body: $0, actor: scope)
        }
    }
}

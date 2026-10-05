import SwiftUI

/// Entry keeps the selected canonical identity and explicitly chosen current Trip visible.
struct NativePlaceGuideContextPicker<Destination: View>: View {
    let candidate: NativePlaceCandidate
    let active: Bool
    let destination: (NativePlaceGuideSelection) -> Destination
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var phase
    @State private var trips = NativePlaceActionTrips()
    @State private var saved = NativeSavedPlaceStore()
    @State private var tripID: String?
    @State private var interest = NativePlaceGuideInterest.general
    @State private var cursor: NativeSavedPlaceCursor?
    @State private var refresh = UUID()
    private var session: NativeSession { settings.nativeSession }
    private var scope: NativeDataScope? { active && phase == .active ? session.dataScope : nil }
    private var chinese: Bool { settings.selectedLocale == .zh }
    private func t(_ en: String, _ zh: String) -> String { chinese ? zh : en }
    private var selection: NativePlaceGuideSelection? {
        guard let scope, candidate.valid(), let canonical = candidate.matchedCanonicalPoiId,
              trips.readable(scope: scope), let trip = trips.detail?.trip, trip.id == tripID,
              let row = saved.visible(scope: scope, tripId: trip.id, version: trip.headVersion)?.first(where: {
                  $0.selection.canonicalPoiId == canonical && $0.mappingStatus == "current"
              }) else { return nil }
        let value = NativePlaceGuideSelection(scope: scope, canonicalPoiID: canonical, placeReferenceID: row.referenceId, tripID: trip.id,
            tripVersion: trip.headVersion, locale: chinese ? "zh" : "en",
            interest: interest)
        return value.valid ? value : nil
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(t("A short guide to this place", "此地点的简短讲解")).font(.title.bold())
                Text(candidate.rawName).font(.headline)
                if candidate.matchedCanonicalPoiId == nil {
                    Text(t("This result has no verified place mapping. Select a mapped place in Explore.", "此结果尚无准确地点映射，请返回探索选择已映射地点。"))
                } else if let scope, trips.scope == scope {
                    TimelineView(.periodic(from: .now, by: 1)) { _ in
                        if trips.readable(scope: scope) {
                            Picker(t("Current Trip", "当前行程"), selection: $tripID) {
                                Text(t("Choose explicitly", "明确选择")).tag(String?.none)
                                ForEach(trips.trips) { Text($0.title).tag(Optional($0.id)) }
                            }.accessibilityIdentifier("guide.trip")
                            if let trip = trips.detail?.trip, trip.id == tripID {
                                Text(t("Trip version: ", "行程版本：") + String(trip.headVersion)).font(.caption)
                            }
                            if let selection {
                                NavigationLink { destination(selection) } label: {
                                    Text(t("Read this place's guide", "阅读此地点讲解"))
                                }.accessibilityIdentifier("guide.open")
                            }
                        } else {
                            Text(t("Reread this Trip before continuing.", "继续前请重新读取此行程。"))
                        }
                    }
                    Picker(t("Your interest for this guide", "本次明确选择的兴趣"), selection: $interest) {
                        ForEach(NativePlaceGuideInterest.allCases, id: \.self) { Text(chinese ? $0.zh : $0.en).tag($0) }
                    }.accessibilityIdentifier("guide.interest")
                    Text(t("Available guides use published practical facts. History and legends are not covered by this source.", "当前讲解使用已发布实用事实；此来源不覆盖历史与传说。"))
                        .font(.caption)
                    if tripID != nil && !saved.busy && selection == nil {
                        Text(t("No current saved reference for this place on this page. Save the exact place in this Trip, or check the next page.", "本页暂无此地点的当前收藏引用。请在同一行程收藏准确地点，或查看下一页。"))
                        if let next = saved.nextCursor {
                            Button(t("Check next saved page", "查看收藏下一页")) { cursor = next }
                        }
                    }
                } else {
                    Text(t("Sign in to choose your Trip.", "登录后选择自己的行程。"))
                }
                Text(t("Guide questions use this place, the selected interests and speech progress. Return keeps the same Trip; it does not change the itinerary.", "追问使用此地点、所选兴趣和语音进度。返回保留同一行程，不会改动日程。"))
                    .font(.caption).foregroundStyle(.secondary)
                Button(t("Reread Trip", "重新读取行程")) { refresh = UUID() }
                    .disabled(scope == nil || trips.loading).accessibilityIdentifier("guide.trip.refresh")
                if trips.loading { ProgressView() }
                if trips.unavailable { Text(t("Trip unavailable. Refresh or sign in again.", "行程暂不可用，请刷新或重新登录。")) }
                Link(t("Explore other places", "探索其他地点"), destination: URL(string: "visepanda://explore")!)
            }.padding()
        }
        .navigationTitle(t("Place guide", "地点讲解"))
        .task(id: ReadKey(scope: scope, refresh: refresh)) {
            guard let scope else { clear(); return }
            await trips.list(scope: scope, current: { self.scope }) {
                try await session.tripRequest(path: "api/trips/native/v2", method: "GET")
            }
            if let tripID { await readTrip(tripID) }
        }
        .task(id: tripID) { cursor = nil; saved.clear(); if let tripID { await readTrip(tripID) } }
        .task(id: cursor) { if cursor != nil, let tripID { await readTrip(tripID) } }
        .onChange(of: scope) { _, _ in clear() }
    }

    private struct ReadKey: Equatable { let scope: NativeDataScope?; let refresh: UUID }
    private func readTrip(_ id: String) async {
        guard let scope else { return }
        await trips.select(tripId: id, scope: scope, current: { self.scope }) {
            try await session.tripRequest(path: "api/trips/native/v2/" + id, method: "GET")
        }
        guard self.scope == scope, tripID == id, trips.readable(scope: scope), let trip = trips.detail?.trip else { return }
        let requestedCursor = cursor
        await saved.load(scope: scope, tripId: id, version: trip.headVersion, locale: chinese ? "zh" : "en", cursor: requestedCursor,
            current: { self.scope == scope && tripID == id && trips.detail?.trip.headVersion == trip.headVersion && cursor == requestedCursor }) {
                try await session.placeActionRequest(tripId: id, body: $0, actor: scope)
            }
    }
    private func clear() { trips.clear(); saved.clear(); tripID = nil; interest = .general; cursor = nil }
}

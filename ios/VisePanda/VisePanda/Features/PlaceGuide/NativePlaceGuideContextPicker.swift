import SwiftUI

/// Entry keeps the selected canonical identity and explicitly chosen current Trip visible.
struct NativePlaceGuideContextPicker<Destination: View>: View {
    let candidate: NativePlaceCandidate
    let active: Bool
    let destination: (NativePlaceGuideSelection) -> Destination
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var phase
    @State private var trips = NativePlaceActionTrips()
    @State private var tripID: String?
    @State private var interests: Set<NativePlaceGuideInterest> = []
    @State private var refresh = UUID()
    private var session: NativeSession { settings.nativeSession }
    private var scope: NativeDataScope? { active && phase == .active ? session.dataScope : nil }
    private var chinese: Bool { settings.selectedLocale == .zh }
    private func t(_ en: String, _ zh: String) -> String { chinese ? zh : en }
    private var selection: NativePlaceGuideSelection? {
        guard let scope, candidate.valid(), let canonical = candidate.matchedCanonicalPoiId,
              trips.readable(scope: scope), let trip = trips.detail?.trip, trip.id == tripID else { return nil }
        let value = NativePlaceGuideSelection(scope: scope, canonicalPoiID: canonical, tripID: trip.id,
            tripVersion: trip.headVersion, locale: chinese ? "zh" : "en",
            interests: NativePlaceGuideInterest.allCases.filter(interests.contains))
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
                    Text(t("Include only the interests you choose here:", "只使用你在此明确选择的兴趣：")).font(.headline)
                    ForEach(NativePlaceGuideInterest.allCases, id: \.self) { interest in
                        Toggle(chinese ? interest.zh : interest.en, isOn: Binding(
                            get: { interests.contains(interest) },
                            set: { if $0 { interests.insert(interest) } else { interests.remove(interest) } }
                        )).accessibilityIdentifier("guide.interest.\(interest.rawValue)")
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
        .task(id: tripID) { if let tripID { await readTrip(tripID) } }
        .onChange(of: scope) { _, _ in clear() }
        .onDisappear { trips.clear() }
    }

    private struct ReadKey: Equatable { let scope: NativeDataScope?; let refresh: UUID }
    private func readTrip(_ id: String) async {
        guard let scope else { return }
        await trips.select(tripId: id, scope: scope, current: { self.scope }) {
            try await session.tripRequest(path: "api/trips/native/v2/" + id, method: "GET")
        }
    }
    private func clear() { trips.clear(); tripID = nil; interests = [] }
}

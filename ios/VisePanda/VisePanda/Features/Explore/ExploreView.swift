import Foundation
import Observation
import SwiftUI

enum NativePlaceProvider: String, CaseIterable, Codable, Sendable {
    case amap
    case tencent
}

struct NativePlaceCandidate: Decodable, Identifiable, Equatable {
    let provider: NativePlaceProvider
    let providerPoiId: String
    let rawName: String
    let matchedCanonicalPoiId: String?

    var id: String { selection.id }
    var selection: NativePlaceSelection {
        if let matchedCanonicalPoiId { return .canonical(matchedCanonicalPoiId) }
        return .provider(provider, providerPoiId)
    }

    func valid() -> Bool {
        guard !providerPoiId.isEmpty, providerPoiId.count <= 128,
              rawName == rawName.trimmingCharacters(in: .whitespacesAndNewlines), !rawName.isEmpty, rawName.count <= 200 else { return false }
        return matchedCanonicalPoiId.map { UUID(uuidString: $0) != nil } ?? true
    }
}

enum NativePlaceSelection: Hashable, Sendable {
    case canonical(String)
    case provider(NativePlaceProvider, String)

    var id: String {
        switch self {
        case .canonical(let value): "canonical:" + value.lowercased()
        case .provider(let provider, let value): "provider:" + provider.rawValue + ":" + value
        }
    }
}

private struct NativePlaceSearchReply: Decodable {
    let candidates: [NativePlaceCandidate]
}

private struct NativePlaceSuggestion: Decodable, Identifiable {
    let provider: NativePlaceProvider
    let providerPoiId: String?
    let rawName: String
    let location: NativePlaceCoordinate?
    var id: String { provider.rawValue + ":" + (providerPoiId ?? "text") + ":" + rawName }
}

private struct NativePlaceSuggestionReply: Decodable { let candidates: [NativePlaceSuggestion] }
private struct NativePlaceCoordinate: Decodable { let lat: Double; let lng: Double; let coordinateSystem: String }
private struct NativePlaceReverseReply: Decodable { let result: NativePlaceReverseResult? }
private struct NativePlaceReverseResult: Decodable { let provider: NativePlaceProvider; let formattedAddress: String }

@MainActor
@Observable
final class NativePlaceSearchStore {
    enum State { case idle, loading, ready, empty, unavailable }
    private(set) var candidates: [NativePlaceCandidate] = []
    private(set) var selectedID: String?
    private(set) var state = State.idle
    private(set) var scope: NativeDataScope?
    private var generation = UUID()

    var selected: NativePlaceCandidate? { candidates.first { $0.id == selectedID } }

    func clear() {
        generation = UUID(); candidates = []; selectedID = nil; state = .idle; scope = nil
    }

    func search(scope: NativeDataScope?, provider: NativePlaceProvider, query: String, city: String, fetch: () async throws -> Data) async {
        clear()
        guard let scope, !Task.isCancelled else { return }
        self.scope = scope; state = .loading
        let own = generation
        do {
            let data = try await fetch()
            guard generation == own, !Task.isCancelled else { return }
            guard data.count <= 1_000_000 else { throw NativeDataError.invalidResponse }
            let reply = try JSONDecoder().decode(NativePlaceSearchReply.self, from: data)
            guard reply.candidates.count <= 50, reply.candidates.allSatisfy({ $0.valid() }) else { throw NativeDataError.invalidResponse }
            candidates = reply.candidates
            selectedID = candidates.first?.id
            state = candidates.isEmpty ? .empty : .ready
        } catch {
            guard generation == own else { return }
            candidates = []; selectedID = nil; state = Task.isCancelled ? .idle : .unavailable
        }
    }

    func select(_ candidate: NativePlaceCandidate) {
        guard candidates.contains(candidate) else { return }
        selectedID = candidate.id
    }
}

private struct NativePlaceSearchView: View {
    @Environment(AppSettings.self) private var settings
    @State private var store = NativePlaceSearchStore()
    @State private var query = ""
    @State private var city = "shanghai"
    @State private var provider = NativePlaceProvider.amap
    @State private var suggestions: [NativePlaceSuggestion] = []
    @State private var observedAddress: String?
    private var chinese: Bool { settings.selectedLocale == .zh }
    private var session: NativeSession { settings.nativeSession }
    private func text(_ en: String, _ zh: String) -> String { chinese ? zh : en }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: VPSpacing.section) {
                BrandHeader()
                Text(text("Find a place", "查找地点")).font(.largeTitle.bold())
                Text(text("Search results are provider observations. Select a specific result before using it; an unmapped result is not merged by name.", "搜索结果是供应商观测。请先选择具体结果；未映射结果不会仅按名称合并。"))
                    .foregroundStyle(Color.vpSecondaryText)
                Picker(text("City", "城市"), selection: $city) {
                    Text(text("Shanghai", "上海")).tag("shanghai")
                    Text(text("Beijing", "北京")).tag("beijing")
                    Text(text("Guangzhou", "广州")).tag("guangzhou")
                    Text(text("Chongqing", "重庆")).tag("chongqing")
                }
                Picker(text("Provider", "服务商"), selection: $provider) {
                    Text("AMap").tag(NativePlaceProvider.amap)
                    Text(text("Tencent Maps", "腾讯地图")).tag(NativePlaceProvider.tencent)
                }
                TextField(text("Place name in Chinese, English, or pinyin", "中文、英文或拼音地点名"), text: $query)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                    .textFieldStyle(.roundedBorder).accessibilityIdentifier("places.query")
                Button(text("Show input tips", "显示输入提示")) {
                    Task {
                        do {
                            let data = try await session.placeSuggestRequest(provider: provider, query: query, city: city)
                            let reply = try JSONDecoder().decode(NativePlaceSuggestionReply.self, from: data)
                            suggestions = reply.candidates.filter { !$0.rawName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }.prefix(10).map { $0 }
                        } catch { suggestions = [] }
                    }
                }.disabled(session.dataScope == nil || query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                ForEach(suggestions) { suggestion in
                    VStack(alignment: .leading, spacing: 5) {
                        Button { query = suggestion.rawName; observedAddress = nil } label: {
                            Text(suggestion.rawName).frame(maxWidth: .infinity, alignment: .leading)
                        }.buttonStyle(.bordered).accessibilityIdentifier("places.suggestion.\(suggestion.id)")
                        if suggestion.provider == .amap, let location = suggestion.location, location.coordinateSystem == "gcj02" {
                            Button(text("Read provider address", "读取供应商地址")) {
                                Task {
                                    do {
                                        let data = try await session.placeReverseGeocodeRequest(provider: suggestion.provider, latitude: location.lat, longitude: location.lng)
                                        observedAddress = try JSONDecoder().decode(NativePlaceReverseReply.self, from: data).result?.formattedAddress
                                    } catch { observedAddress = nil }
                                }
                            }.buttonStyle(.bordered)
                        }
                    }
                }
                if let observedAddress { Text(text("Provider address observation: ", "供应商地址观察：") + observedAddress).font(.caption).foregroundStyle(Color.vpSecondaryText).accessibilityIdentifier("places.reverseAddress") }
                Button(text("Search places", "搜索地点")) {
                    Task { await store.search(scope: session.dataScope, provider: provider, query: query, city: city) {
                        try await session.placeSearchRequest(provider: provider, query: query, city: city)
                    } }
                }.buttonStyle(.borderedProminent).disabled(session.dataScope == nil || query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                content
            }.padding(VPSpacing.standard)
        }
        .background(Color.vpBackground).vpNavigationTitle("tab.explore").navigationBarTitleDisplayMode(.inline)
        .onChange(of: session.dataScope) { _, _ in store.clear() }
        .onDisappear { store.clear() }
    }

    @ViewBuilder private var content: some View {
        if session.dataScope == nil { Text(text("Sign in in Profile to search places.", "请在「我的」登录后搜索地点。")) }
        else if store.state == .loading { ProgressView().accessibilityIdentifier("places.loading") }
        else if store.state == .empty { Text(text("No provider result matched this search.", "没有匹配此搜索的供应商结果。")) }
        else if store.state == .unavailable { Text(text("Place search is unavailable. Check your sign-in and try again.", "地点搜索暂不可用，请检查登录状态后重试。")) }
        else if store.state == .ready {
            ForEach(store.candidates) { candidate in
                Button { store.select(candidate) } label: {
                    VisePandaCard { VStack(alignment: .leading, spacing: 6) {
                        Text(candidate.rawName).font(.headline)
                        Text(candidate.matchedCanonicalPoiId == nil ? text("Choose this specific provider result", "请选择此具体供应商结果") : text("Mapped place", "已映射地点"))
                            .font(.caption).foregroundStyle(Color.vpSecondaryText)
                    }.frame(maxWidth: .infinity, alignment: .leading) }
                }.buttonStyle(.plain).accessibilityIdentifier("places.result.\(candidate.id)")
            }
            if let selected = store.selected {
                VisePandaCard { VStack(alignment: .leading, spacing: 6) {
                    Text(text("Selected place", "已选地点")).font(.headline)
                    Text(selected.rawName)
                    Text(selected.selection.id).font(.caption.monospaced()).foregroundStyle(Color.vpSecondaryText)
                }.frame(maxWidth: .infinity, alignment: .leading) }.accessibilityIdentifier("places.detail.\(selected.id)")
            }
        }
    }
}

private struct PreviewPlace: Identifiable {
    let id: String
    let title: LocalizedStringKey
    let subtitle: LocalizedStringKey
    let imageName: String
}

struct ExploreView: View {
    var isActive = true
    @Environment(AppSettings.self) private var settings
    private let places = [
        PreviewPlace(id: "beijing", title: "explore.beijing", subtitle: "explore.beijing.subtitle", imageName: "building.columns"),
        PreviewPlace(id: "shanghai", title: "explore.shanghai", subtitle: "explore.shanghai.subtitle", imageName: "water.waves"),
        PreviewPlace(id: "chengdu", title: "explore.chengdu", subtitle: "explore.chengdu.subtitle", imageName: "leaf")
    ]

    var body: some View {
        if settings.nativeSession.enabled { NativePlaceSearchView() } else { previewBody }
    }

    private var previewBody: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: VPSpacing.section) {
                BrandHeader()

                VStack(alignment: .leading, spacing: 8) {
                    Text("explore.title")
                        .font(.largeTitle.weight(.bold))
                        .tracking(-0.8)

                    Text("explore.subtitle")
                        .foregroundStyle(.secondary)
                }

                PreviewStatusBanner()

                ForEach(places) { place in
                    NavigationLink(value: AppRoute.capability(.tripPlanning)) {
                        VisePandaCard {
                            HStack(spacing: 16) {
                                Image(systemName: place.imageName)
                                    .font(.title2.weight(.semibold))
                                    .foregroundStyle(Color.vpBrand)
                                    .frame(width: 52, height: 52)
                                    .background(Color.vpLavender.opacity(0.22), in: RoundedRectangle(cornerRadius: 16, style: .continuous))

                                VStack(alignment: .leading, spacing: 5) {
                                    Text(place.title)
                                        .font(.headline)
                                        .foregroundStyle(.primary)
                                    Text(place.subtitle)
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                    Text("explore.sample")
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(Color.vpBrand)
                                }

                                Spacer(minLength: 0)
                                Image(systemName: "chevron.right")
                                    .font(.caption.weight(.bold))
                                    .foregroundStyle(.tertiary)
                                    .accessibilityHidden(true)
                            }
                        }
                    }
                    .buttonStyle(SoftPressButtonStyle())
                }
            }
            .padding(VPSpacing.standard)
        }
        .background(Color.vpBackground)
        .vpNavigationTitle("tab.explore")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NavigationStack { ExploreView() }
}

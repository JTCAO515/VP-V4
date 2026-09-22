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

struct NativePlaceSuggestion: Decodable, Identifiable {
    let provider: NativePlaceProvider
    let providerPoiId: String?
    let matchedCanonicalPoiId: String?
    let rawName: String
    let location: NativePlaceCoordinate?
    var id: String { provider.rawValue + ":" + (providerPoiId ?? "text") + ":" + rawName }
}

private struct NativePlaceSuggestionReply: Decodable { let candidates: [NativePlaceSuggestion] }
struct NativePlaceCoordinate: Codable, Equatable { let lat: Double; let lng: Double; let coordinateSystem: String }
private struct NativePlaceReverseReply: Decodable { let result: NativePlaceReverseResult? }
private struct NativePlaceReverseResult: Decodable { let provider: NativePlaceProvider; let formattedAddress: String }

struct NativePlaceDetail: Decodable {
    let provider: NativePlaceProvider
    let providerPoiId: String
    let rawName: String
    let address: String?
    let location: NativePlaceCoordinate?
}
private struct NativePlaceDetailReply: Decodable {
    let detail: NativePlaceDetail?
    let observedAt: String?
}
private struct NativePlaceGeocodeReply: Decodable {
    struct Result: Decodable { let formattedAddress: String; let location: NativePlaceCoordinate? }
    let result: Result?
    let observedAt: String?
}

@MainActor
@Observable
final class NativePlaceSearchStore {
    enum State { case idle, loading, ready, empty, unavailable }
    private(set) var candidates: [NativePlaceCandidate] = []
    private(set) var selectedID: String?
    private(set) var state = State.idle
    private(set) var scope: NativeDataScope?
    private var generation = UUID()
    private var suggestionGeneration = UUID()
    private var addressGeneration = UUID()
    private(set) var suggestions: [NativePlaceSuggestion] = []
    private(set) var observedAddress: String?
    private(set) var detail: NativePlaceDetail?
    private(set) var observedAt: String?
    private(set) var addressLocation: NativePlaceCoordinate?
    private var detailGeneration = UUID()
    private(set) var detailUnavailable = false

    func loadDetail(_ candidate: NativePlaceCandidate, fetch: () async throws -> Data) async {
        select(candidate)
        detailGeneration = UUID()
        let own = detailGeneration
        detail = nil; observedAt = nil; detailUnavailable = false
        guard selectedID == candidate.id, !Task.isCancelled else { return }
        do {
            let data = try await fetch()
            guard own == detailGeneration, selectedID == candidate.id, !Task.isCancelled else { return }
            guard data.count <= 1_000_000 else { throw NativeDataError.invalidResponse }
            let reply = try JSONDecoder().decode(NativePlaceDetailReply.self, from: data)
            guard let detail = reply.detail, detail.provider == candidate.provider, detail.providerPoiId == candidate.providerPoiId else { throw NativeDataError.invalidResponse }
            self.detail = detail; observedAt = reply.observedAt
        } catch {
            guard own == detailGeneration else { return }
            detailUnavailable = true
        }
    }

    func geocode(scope: NativeDataScope?, fetch: () async throws -> Data) async {
        clear()
        guard let scope, !Task.isCancelled else { return }
        self.scope = scope; state = .loading
        let own = generation
        do {
            let data = try await fetch()
            guard own == generation, !Task.isCancelled else { return }
            guard data.count <= 1_000_000 else { throw NativeDataError.invalidResponse }
            let reply = try JSONDecoder().decode(NativePlaceGeocodeReply.self, from: data)
            observedAddress = reply.result?.formattedAddress; addressLocation = reply.result?.location
            observedAt = reply.observedAt; state = reply.result == nil ? .empty : .ready
        } catch {
            guard own == generation else { return }
            state = .unavailable
        }
    }

    func clearAddress() {
        addressGeneration = UUID()
        observedAddress = nil
    }

    func suggest(scope: NativeDataScope?, fetch: () async throws -> Data) async {
        suggestionGeneration = UUID()
        let own = suggestionGeneration
        suggestions = []
        clearAddress()
        guard let scope, !Task.isCancelled else { return }
        self.scope = scope
        do {
            let data = try await fetch()
            guard suggestionGeneration == own, !Task.isCancelled else { return }
            guard data.count <= 1_000_000 else { throw NativeDataError.invalidResponse }
            let reply = try JSONDecoder().decode(NativePlaceSuggestionReply.self, from: data)
            suggestions = Array(reply.candidates.filter { !$0.rawName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }.prefix(10))
        } catch {
            guard suggestionGeneration == own else { return }
            suggestions = []
        }
    }

    func readAddress(scope: NativeDataScope?, fetch: () async throws -> Data) async {
        clearAddress()
        let own = addressGeneration
        guard let scope, !Task.isCancelled else { return }
        self.scope = scope
        do {
            let data = try await fetch()
            guard addressGeneration == own, !Task.isCancelled else { return }
            guard data.count <= 1_000_000 else { throw NativeDataError.invalidResponse }
            observedAddress = try JSONDecoder().decode(NativePlaceReverseReply.self, from: data).result?.formattedAddress
        } catch {
            guard addressGeneration == own else { return }
            observedAddress = nil
        }
    }

    var selected: NativePlaceCandidate? { candidates.first { $0.id == selectedID } }

    func clear() {
        generation = UUID(); suggestionGeneration = UUID(); detailGeneration = UUID(); clearAddress()
        detail = nil; observedAt = nil; addressLocation = nil; detailUnavailable = false
        candidates = []; suggestions = []; selectedID = nil; state = .idle; scope = nil
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

    func adoptSuggestion(_ candidate: NativePlaceCandidate, scope: NativeDataScope?) {
        clear()
        guard let scope, candidate.valid() else { return }
        self.scope = scope; candidates = [candidate]; selectedID = candidate.id; state = .ready
    }

    func select(_ candidate: NativePlaceCandidate) {
        guard candidates.contains(candidate) else { return }
        if selectedID != candidate.id { detailGeneration = UUID(); detail = nil; observedAt = nil }
        selectedID = candidate.id
    }
}

struct NativeRouteOption: Decodable, Identifiable {
    let mode: String
    let status: String
    let durationSeconds: Double?
    let distanceMeters: Double?
    let walkingMeters: Double?
    let transfers: Int?
    let estimateCny: Double?
    let estimateKind: String?
    let steps: [String]?
    let departureAt: String?
    let arrivalAt: String?
    let webUrl: String?
    var id: String { mode }
}
struct NativeRouteReply: Decodable {
    let provider: String
    let origin: NativePlaceDetail
    let destination: NativePlaceDetail
    let observedAt: String
    let expiresAt: String
    let options: [NativeRouteOption]
    func expired(at date: Date) -> Bool {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let expiry = formatter.date(from: expiresAt) else { return true }
        return date >= expiry
    }
    func appURL(mode: String) -> URL? {
        guard let start = origin.location, let end = destination.location,
              start.coordinateSystem == "gcj02", end.coordinateSystem == "gcj02",
              start.lat.isFinite, start.lng.isFinite, end.lat.isFinite, end.lng.isFinite,
              abs(start.lat) <= 90, abs(end.lat) <= 90, abs(start.lng) <= 180, abs(end.lng) <= 180,
              let transport = ["driving": "0", "transit": "1", "walking": "2"][mode] else { return nil }
        var url = URLComponents()
        url.scheme = "iosamap"; url.host = "path"
        url.queryItems = ["sourceApplication": "VisePanda", "sid": origin.providerPoiId, "did": destination.providerPoiId,
                          "slat": String(start.lat), "slon": String(start.lng), "sname": origin.rawName,
                          "dlat": String(end.lat), "dlon": String(end.lng), "dname": destination.rawName,
                          "dev": "0", "t": transport].map { URLQueryItem(name: $0.key, value: $0.value) }
        return url.url
    }
}
@MainActor @Observable final class NativeRouteStore {
    private(set) var origin: NativePlaceDetail?
    private(set) var destination: NativePlaceDetail?
    private(set) var reply: NativeRouteReply?
    private(set) var loading = false
    private(set) var unavailable = false
    private var generation = UUID()
    func invalidate() { generation = UUID(); reply = nil; loading = false; unavailable = false }
    func clear() { invalidate(); origin = nil; destination = nil }
    func choose(_ detail: NativePlaceDetail, start: Bool) {
        guard detail.provider == .amap, detail.location?.coordinateSystem == "gcj02" else { return }
        invalidate()
        if start { origin = detail } else { destination = detail }
    }
    func compare(fetch: ([String: String]) async throws -> Data) async {
        invalidate()
        guard let origin, let destination, origin.providerPoiId != destination.providerPoiId else { return }
        let own = generation; loading = true
        do {
            let data = try await fetch(["action": "routes", "provider": "amap", "originId": origin.providerPoiId, "destinationId": destination.providerPoiId, "departure": "now"])
            guard own == generation, !Task.isCancelled else { return }
            guard data.count <= 1_000_000 else { throw NativeDataError.invalidResponse }
            let value = try JSONDecoder().decode(NativeRouteReply.self, from: data)
            guard value.provider == "amap", value.origin.provider == .amap, value.destination.provider == .amap,
                  value.origin.providerPoiId == origin.providerPoiId, value.destination.providerPoiId == destination.providerPoiId,
                  value.options.allSatisfy({ option in
                      option.status != "observed" || ((option.durationSeconds ?? -1) >= 0 && (option.durationSeconds ?? .infinity) <= 604800 && (option.distanceMeters ?? -1) >= 0 && (option.distanceMeters ?? .infinity) <= 100_000_000 && (option.walkingMeters.map { $0 >= 0 && $0 <= 100_000_000 } ?? true))
                  }),
                  value.options.count == 3, Set(value.options.map(\.mode)) == Set(["walking", "transit", "driving"]),
                  !value.expired(at: Date()) else { throw NativeDataError.invalidResponse }
            reply = value
        } catch { if own == generation { unavailable = true } }
        if own == generation { loading = false }
    }
}
private struct NativeRouteComparison: View {
    let selected: NativePlaceDetail?
    let store: NativeRouteStore
    let chinese: Bool
    let fetch: ([String: String]) async throws -> Data
    @Environment(\.openURL) private var openURL
    @State private var future = false
    @State private var task: Task<Void, Never>?
    @State private var openFailed = false
    private func text(_ en: String, _ zh: String) -> String { chinese ? zh : en }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(text("Compare routes", "比较路线")).font(.headline)
            Text(text("Select an AMap place below, then set start or destination. Manual selection also works when location is denied.", "在下方选择高德地点，再设为起点或终点。定位拒权后仍可手动选点。"))
            if let selected, selected.provider == .amap, selected.location?.coordinateSystem == "gcj02" {
                Button(text("Use selected place as start", "将已选地点设为起点")) { task?.cancel(); store.choose(selected, start: true) }
                Button(text("Use selected place as destination", "将已选地点设为终点")) { task?.cancel(); store.choose(selected, start: false) }
            }
            Text((store.origin?.rawName ?? "—") + " → " + (store.destination?.rawName ?? "—"))
            Toggle(text("Future departure", "未来出发"), isOn: $future).onChange(of: future) { _, _ in task?.cancel(); store.invalidate() }
            if future { Text(text("Future departure unavailable. Current traffic is not tomorrow's forecast.", "未来出发暂不可用，当前路况不是明日预测。")) }
            else {
                Button(text("Agree and compare with AMap", "同意并向高德查询比较")) {
                    task?.cancel(); task = Task { await store.compare(fetch: fetch) }
                }.disabled(store.origin == nil || store.destination == nil || store.origin?.providerPoiId == store.destination?.providerPoiId || store.loading)
            }
            Button(text("Clear route", "清除路线")) { task?.cancel(); store.clear() }
            Text(text("The two places are sent to AMap, without current or background location. Estimates are not quotes; tolls exclude taxi fare. Transit is not live arrival data; driving does not book a car. Accessibility and entrances are unverified.", "两处地点将发送给高德，不发送当前或后台定位。估算不是报价；过路费不含打车费。公交不是实时到站；驾车不代表叫车成功。无障碍与入口未核实。"))
                .font(.caption).foregroundStyle(Color.vpSecondaryText)
            if store.loading { ProgressView() }
            if store.unavailable { Text(text("Routes unavailable or timed out. Check endpoints and sign-in, then retry or copy the address.", "路线不可用或查询超时。请检查起终点与登录状态，重试或复制地址。")) }
            if let destination = store.destination {
                Text(text("Chinese address card", "中文地址卡")).font(.headline)
                Text(destination.rawName + "\n" + (destination.address ?? text("Address unknown; select an exact entrance or terminal.", "地址未知，请选择准确入口或航站楼。"))).textSelection(.enabled)
                if let address = destination.address { Button(text("Copy destination address", "复制终点地址")) { UIPasteboard.general.string = destination.rawName + "\n" + address } }
            }
            if let reply = store.reply {
                Text(text("Source: AMap · Queried: ", "来源：高德 · 查询：") + reply.observedAt).font(.caption)
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    if reply.expired(at: context.date) { Text(text("Route expired. Query again before navigation.", "路线已过期，请重新查询后导航。")) }
                    else { ForEach(reply.options) { option in route(option, reply: reply) } }
                }
            }
            if openFailed { Text(text("Map app unavailable or failed to open. Use the web link or copy the address.", "地图 App 未安装或打开失败，请使用网页出口或复制地址。")) }
        }.onDisappear { task?.cancel(); store.clear() }
    }
    private func statusText(_ status: String) -> String {
        switch status {
        case "no_routes": text("No route found. Try different endpoints.", "没有可用路线，请尝试其他起终点。")
        case "timeout": text("Query timed out. Try again.", "查询超时，请重试。")
        case "endpoint_mismatch": text("Route endpoints do not match. Select again.", "路线起终点不匹配，请重新选择。")
        case "city_unknown": text("Transit city is unknown. Select a more specific place.", "公交城市信息缺失，请选择更准确的地点。")
        default: text("A complete plan is unavailable. Retry or copy the address.", "暂时无法提供完整方案，请重试或复制地址。")
        }
    }
    @ViewBuilder private func route(_ option: NativeRouteOption, reply: NativeRouteReply) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(chinese ? (["walking": "步行", "transit": "公交", "driving": "驾车"][option.mode] ?? option.mode) : option.mode).font(.headline)
            if option.status != "observed" { Text(statusText(option.status)) }
            else {
                Text("\(Int(ceil((option.durationSeconds ?? 0) / 60))) min · \(Int(option.distanceMeters ?? 0)) m")
                let walking: String = option.walkingMeters.map { "\(Int($0)) m" } ?? "—"
                let transfers: String = option.transfers.map { String($0) } ?? "—"
                Text(text("Walking / transfers: ", "步行距离 / 换乘：") + walking + " / " + transfers)
                Text(text(option.estimateKind == "tolls_only" ? "Estimated tolls only: " : "Estimated fare: ", option.estimateKind == "tolls_only" ? "仅过路费估算：" : "票价估算：") + (option.estimateCny.map { "¥\($0)" } ?? text("Unknown", "未知")))
                Text(text("Estimated departure / arrival: ", "估算出发 / 到达：") + (option.departureAt ?? "—") + " / " + (option.arrivalAt ?? "—")).font(.caption)
                ForEach(Array((option.steps ?? []).enumerated()), id: \.offset) { _, step in Text(step) }
                if let app = reply.appURL(mode: option.mode) {
                    Button(text("Open AMap app", "打开高德 App")) {
                        guard !reply.expired(at: Date()) else { return }
                        openURL(app) { accepted in openFailed = !accepted }
                    }
                }
                if let raw = option.webUrl, let url = URL(string: raw), url.scheme == "https", url.host == "uri.amap.com", url.path == "/navigation" {
                    Button(text("Open web directions", "打开网页路线")) {
                        guard !reply.expired(at: Date()) else { return }
                        openURL(url) { accepted in openFailed = !accepted }
                    }
                }
            }
        }
    }
}

private struct NativePlaceSearchView: View {
    var isActive: Bool
    @Environment(\.scenePhase) private var scenePhase
    @Environment(AppSettings.self) private var settings
    @State private var store = NativePlaceSearchStore()
    @State private var routes = NativeRouteStore()
    @State private var query = ""
    @State private var city = "shanghai"
    @State private var provider = NativePlaceProvider.amap
    @State private var suggestionTask: Task<Void, Never>?
    @State private var addressTask: Task<Void, Never>?
    @State private var searchTask: Task<Void, Never>?
    @State private var detailTask: Task<Void, Never>?
    @State private var category = "restroom"
    @State private var showMap = false
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
                    suggestionTask?.cancel()
                    addressTask?.cancel()
                    let scope = session.dataScope, provider = provider, query = query, city = city
                    suggestionTask = Task {
                        await store.suggest(scope: scope) {
                            try await session.placeLookupRequest(["action": "suggest", "provider": provider.rawValue, "q": query, "city": city])
                        }
                    }
                }.disabled(session.dataScope == nil || query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                ForEach(store.suggestions) { suggestion in
                    VStack(alignment: .leading, spacing: 5) {
                        Button {
                            resetSearch()
                            if let id = suggestion.providerPoiId {
                                let candidate = NativePlaceCandidate(provider: suggestion.provider, providerPoiId: id, rawName: suggestion.rawName, matchedCanonicalPoiId: suggestion.matchedCanonicalPoiId)
                                store.adoptSuggestion(candidate, scope: session.dataScope)
                                let parameters = ["action": "detail", "provider": candidate.provider.rawValue, "id": candidate.providerPoiId]
                                detailTask = Task { await store.loadDetail(candidate) { try await session.placeLookupRequest(parameters) } }
                            } else { query = suggestion.rawName }
                        } label: {
                            Text(suggestion.rawName).frame(maxWidth: .infinity, alignment: .leading)
                        }.buttonStyle(.bordered).accessibilityIdentifier("places.suggestion.\(suggestion.id)")
                        if suggestion.provider == .amap, let location = suggestion.location, location.coordinateSystem == "gcj02" {
                            Button(text("Read provider address", "读取供应商地址")) {
                                addressTask?.cancel()
                                let scope = session.dataScope
                                addressTask = Task {
                                    await store.readAddress(scope: scope) {
                                        try await session.placeReverseGeocodeRequest(provider: suggestion.provider, latitude: location.lat, longitude: location.lng)
                                    }
                                }
                            }.buttonStyle(.bordered)
                        }
                    }
                }
                if let observedAddress = store.observedAddress { Text(text("Provider address observation: ", "供应商地址观察：") + observedAddress).font(.caption).foregroundStyle(Color.vpSecondaryText).accessibilityIdentifier("places.reverseAddress") }
                Button(text("Search places", "搜索地点")) {
                    resetSearch()
                    let scope = session.dataScope, provider = provider, query = query, city = city
                    searchTask = Task { await store.search(scope: scope, provider: provider, query: query, city: city) {
                        try await session.placeSearchRequest(provider: provider, query: query, city: city)
                    } }
                }.buttonStyle(.borderedProminent).disabled(session.dataScope == nil || query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                Button(text("Find this address", "解析这个地址")) {
                    resetSearch()
                    let scope = session.dataScope, parameters = ["action": "geocode", "provider": provider.rawValue, "q": query, "city": city]
                    searchTask = Task { await store.geocode(scope: scope) { try await session.placeLookupRequest(parameters) } }
                }.disabled(session.dataScope == nil || query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                content
                NativeRouteComparison(selected: store.detail, store: routes, chinese: chinese, fetch: { try await session.placeLookupRequest($0) })
                if let point = store.detail?.location ?? store.addressLocation, point.coordinateSystem == "gcj02" {
                    if showMap {
                        NativePlaceMapCanvas(point: point, selectionID: store.selectedID ?? "address", name: store.detail?.rawName ?? store.observedAddress ?? "", onSelect: { id in
                            if let selected = store.selected, selected.id == id { store.select(selected) }
                        }).frame(height: 280)
                    } else {
                        Link(text("AMap privacy policy", "高德隐私政策"), destination: URL(string: "https://lbs.amap.com/pages/privacy/")!)
                        Button(text("Agree and show AMap", "同意并显示高德地图")) { showMap = true }
                        Text(text("Loading the map sends this place coordinate and network/device information to AMap. Your current location is not requested.", "加载地图将向高德发送此地点坐标及网络/设备信息，不会请求你当前的位置。"))
                            .font(.caption).foregroundStyle(Color.vpSecondaryText)
                    }
                    Picker(text("Nearby", "查找周边"), selection: $category) {
                        Text(text("Restrooms", "厕所")).tag("restroom")
                        Text(text("Convenience stores", "便利店")).tag("convenience_store")
                        Text(text("Food", "餐饮")).tag("dining")
                        Text(text("Pharmacies", "药店")).tag("pharmacy")
                        Text("ATM").tag("atm")
                    }
                    Button(text("Search within 1 km", "搜索 1 公里内")) {
                        let scope = session.dataScope, selectedProvider = provider
                        let parameters = ["action": "nearby", "provider": provider.rawValue, "category": category, "lat": String(point.lat), "lng": String(point.lng), "system": "gcj02"]
                        resetSearch()
                        searchTask = Task { await store.search(scope: scope, provider: selectedProvider, query: "", city: city) { try await session.placeLookupRequest(parameters) } }
                    }
                    Text(text("Opening hours, accessibility and special services are unknown. A map point is not a verified entrance.", "营业时间、无障碍和特殊服务未知。地图点位不等于已核实入口。"))
                        .font(.caption).foregroundStyle(Color.vpSecondaryText)
                }
            }.padding(VPSpacing.standard)
        }
        .background(Color.vpBackground).vpNavigationTitle("tab.explore").navigationBarTitleDisplayMode(.inline)
        .onChange(of: session.dataScope) { _, _ in routes.clear(); resetSearch() }
        .onChange(of: query) { _, _ in resetSearch() }
        .onChange(of: city) { _, _ in routes.clear(); resetSearch() }
        .onChange(of: provider) { _, _ in routes.clear(); resetSearch() }
        .onChange(of: scenePhase) { _, phase in if phase != .active { routes.clear(); resetSearch() } }
        .onChange(of: isActive) { _, active in if !active { routes.clear(); resetSearch() } }
        .onDisappear { resetSearch() }
    }

    private func resetSearch() {
        suggestionTask?.cancel(); addressTask?.cancel(); searchTask?.cancel(); detailTask?.cancel()
        detailTask = nil; showMap = false
        suggestionTask = nil; addressTask = nil; searchTask = nil
        store.clear()
    }

    @ViewBuilder private var content: some View {
        if session.dataScope == nil { Text(text("Sign in in Profile to search places.", "请在「我的」登录后搜索地点。")) }
        else if store.state == .loading { ProgressView().accessibilityIdentifier("places.loading") }
        else if store.state == .empty { Text(text("No provider result matched this search.", "没有匹配此搜索的供应商结果。")) }
        else if store.state == .unavailable { Text(text("Place search is unavailable. Check your sign-in and try again.", "地点搜索暂不可用，请检查登录状态后重试。")) }
        else if store.state == .ready {
            ForEach(store.candidates) { candidate in
                Button {
                    detailTask?.cancel()
                    let parameters = ["action": "detail", "provider": candidate.provider.rawValue, "id": candidate.providerPoiId]
                    detailTask = Task { await store.loadDetail(candidate) { try await session.placeLookupRequest(parameters) } }
                } label: {
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
                    if let detail = store.detail {
                        Text(detail.address ?? text("Chinese address unavailable", "暂无中文地址")).textSelection(.enabled)
                        if let address = detail.address { ShareLink(item: detail.rawName + "\n" + address) { Text(text("Share address", "分享地址")) } }
                        if let observedAt = store.observedAt { Text(text("Queried: ", "查询时间：") + observedAt).font(.caption) }
                        Text(text("Entrance and parent/terminal relationship are unverified. Choose the exact branch or entrance result.", "入口与父地点/航站楼关系未核实，请选择具体分店或入口结果。"))
                            .font(.caption).foregroundStyle(Color.vpSecondaryText)
                    } else {
                        Text(store.detailUnavailable ? text("Details unavailable. Retry this place.", "详情暂不可用，请重试此地点。") : text("Tap this result to load its address and map point.", "点选此结果以加载地址和地图点位。"))
                    }
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
        if settings.nativeSession.enabled { NativePlaceSearchView(isActive: isActive) } else { previewBody }
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

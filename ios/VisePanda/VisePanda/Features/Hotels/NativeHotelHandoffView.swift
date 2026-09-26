import SwiftUI

struct NativeHotelHandoffView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.openURL) private var openURL
    @State private var name = ""
    @State private var checkIn = Date()
    @State private var checkOut = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
    @State private var adults = 2
    @State private var rooms = 1
    @State private var children = false
    @State private var prepared: NativeHotelHandoff?
    @State private var message: String?

    private func text(_ en: String, _ zh: String) -> String { settings.selectedLocale == .zh ? zh : en }
    private var search: NativeHotelSearch {
        .init(hotelOrCity: name, checkIn: NativeHotelHandoff.day(checkIn), checkOut: NativeHotelHandoff.day(checkOut),
              adults: adults, rooms: rooms, includesChildren: children)
    }

    var body: some View {
        Form {
            Section {
                Text(text("Continue your hotel search on an official travel site. No booking is made in VisePanda.", "前往官方旅行网站继续搜索酒店。VisePanda 不会代你预订。"))
                TextField(text("Hotel name or city", "酒店名称或城市"), text: $name)
                    .accessibilityIdentifier("hotel.query")
                Text(text("Enter only a public hotel name or city, without guest names, passport details, health information or booking references.", "仅填写公开的酒店名称或城市，不要输入旅客姓名、护照、健康信息或订单编号。"))
                    .font(.footnote).foregroundStyle(.secondary)
                DatePicker(text("Check-in", "入住"), selection: $checkIn, in: Date()..., displayedComponents: .date)
                DatePicker(text("Check-out", "退房"), selection: $checkOut, in: Date()..., displayedComponents: .date)
                Stepper(text("Adults: \(adults)", "成人：\(adults)"), value: $adults, in: 1...30)
                Stepper(text("Rooms: \(rooms)", "客房：\(rooms)"), value: $rooms, in: 1...30)
                Toggle(text("Travelling with children", "有儿童同行"), isOn: $children)
                    .accessibilityIdentifier("hotel.children")
            }
            Section {
                Text(text("These are ordinary official links without VisePanda affiliate tracking. VisePanda does not receive booking status or claim commission attribution.", "这些是未添加 VisePanda 联盟追踪的普通官方链接。VisePanda 不会接收预订状态，也不声称已获得佣金归因。"))
                ForEach(NativeHotelProvider.allCases) { provider in
                    Button(text("Continue on \(provider.title)", "前往 \(provider.title)")) { prepare(provider) }
                        .accessibilityIdentifier("hotel.prepare.\(provider.rawValue)")
                }
            }
            if let message { Section { Text(message).accessibilityIdentifier("hotel.status") } }
        }
        .navigationTitle(text("Hotel search", "酒店搜索"))
        .onChange(of: search) { _, _ in prepared = nil; message = nil }
        .sheet(item: $prepared) { receipt in
            NavigationStack {
                Form {
                    Section(text("Before you leave", "离开前确认")) {
                        Text(receipt.search.hotelOrCity)
                        Text("\(receipt.search.checkIn) – \(receipt.search.checkOut)")
                        Text(text("\(receipt.search.adults) adults · \(receipt.search.rooms) rooms", "\(receipt.search.adults) 位成人 · \(receipt.search.rooms) 间客房"))
                        Text(disclosure(receipt)).accessibilityIdentifier("hotel.disclosure")
                        Text(text("Prices, taxes, availability, cancellation rules and foreign-passport eligibility must be checked with the provider or hotel. Opening a link does not confirm a booking or change your Trip.", "价格、税费、库存、取消规则和外宾入住资格均需向平台或酒店核实。打开链接不代表预订成功，也不会修改行程。"))
                        Button(text("Open \(receipt.provider.title)", "打开 \(receipt.provider.title)")) { open(receipt) }
                            .accessibilityIdentifier("hotel.open")
                        Button(text("Back to edit", "返回修改")) { prepared = nil }
                            .accessibilityIdentifier("hotel.cancel")
                    }
                }
                .navigationTitle(receipt.provider.title)
            }
        }
    }

    private func disclosure(_ receipt: NativeHotelHandoff) -> String {
        if receipt.provider == .trip {
            return text("Trip.com opens its hotel search page. Hotel, dates, guests, rooms and filters are not sent; enter all conditions there.", "Trip.com 将打开酒店搜索首页。酒店、日期、人数、房间数和筛选条件均不会传递，请到站重新填写。")
        }
        let occupancy = receipt.search.includesChildren
            ? text("Guest and room counts are not sent when travelling with children. Enter all guests, child ages and rooms there.", "有儿童同行时不会传递任何人数和房间数。请到站填写全部旅客人数、儿童年龄和客房数。")
            : text("Adult and room counts are included.", "链接包含成人数和房间数。")
        return text("Your hotel/city text and dates are sent to Booking.com for search, not an exact hotel reservation. \(occupancy) Filters are not sent. Select the hotel again on the destination site. Check every field after opening; website and app handoffs may change them.", "酒店或城市文字及日期将发送给 Booking.com 用于搜索，不代表指定酒店已被选定。\(occupancy)筛选条件不会传递，请到站重新选择具体酒店。网站或 App 跳转可能改变条件，请到站逐项核对。")
    }

    private func prepare(_ provider: NativeHotelProvider) {
        do { prepared = try NativeHotelHandoff.prepare(search, provider: provider); message = nil }
        catch { message = text("Enter a hotel or city, today or later dates, a stay of 1–90 nights, and at least one adult per room.", "请填写酒店或城市、今天或之后的入住日期、1–90 晚住宿，以及不少于客房数的成人数。") }
    }

    private func open(_ receipt: NativeHotelHandoff) {
        var current = receipt
        do {
            let url = try current.validateForOpen()
            prepared = nil
            openURL(url) { accepted in
                current.recordOpen(acceptedBySystem: accepted)
                message = accepted
                    ? text("Link handed to your device. Check the destination and all search fields. Booking status is unknown; your Trip is unchanged.", "链接已交给设备打开。请核对目标网站和所有搜索条件。预订状态未知，行程未改变。")
                    : text("Your device could not open the link. Try again or use the other official site.", "设备无法打开链接。请重试，或选择另一官方入口。")
            }
        } catch {
            prepared = nil
            message = text("This search link expired. Review your dates and prepare a new link.", "搜索链接已过期，请核对日期后重新生成。")
        }
    }
}

/// Local comparison notes for the selected confirmed Trip. No provider inventory or Trip write.
struct NativeHotelComparisonView: View {
    private struct SearchReply: Decodable { let candidates: [NativePlaceCandidate] }
    let detail: NativeTripDetail
    let store: NativeTripStore
    @Environment(AppSettings.self) private var settings
    @State private var intent = LodgingIntent.undecided
    @State private var adults = 2
    @State private var children = false
    @State private var rooms = 1
    @State private var bed = ""
    @State private var budget = ""
    @State private var currency = "CNY"
    @State private var budgetBasis = BudgetBasis.perNight
    @State private var firstArea = ""
    @State private var secondArea = ""
    @State private var firstHotel = ""
    @State private var secondHotel = ""
    @State private var city = ""
    @State private var anchorItemID = ""
    @State private var anchorQuery = ""
    @State private var anchorResults: [NativePlaceCandidate] = []
    @State private var firstResults: [NativePlaceCandidate] = []
    @State private var secondResults: [NativePlaceCandidate] = []
    @State private var anchorPlace: NativePlaceCandidate?
    @State private var firstPlace: NativePlaceCandidate?
    @State private var secondPlace: NativePlaceCandidate?
    @State private var firstRoute: NativeRouteReply?
    @State private var secondRoute: NativeRouteReply?
    @State private var busy = false
    @State private var lookupFailed = false
    @State private var generation = UUID()

    private enum LodgingIntent: String, CaseIterable, Identifiable {
        case undecided, booked, notNeeded, later, comparing
        var id: String { rawValue }
    }
    private enum BudgetBasis: String, CaseIterable, Identifiable {
        case perNight, wholeStay
        var id: String { rawValue }
    }
    private var chinese: Bool { settings.selectedLocale == .zh }
    private func text(_ en: String, _ zh: String) -> String { chinese ? zh : en }
    private var window: NativeHotelTripWindow? { NativeHotelTripWindow.suggest(from: detail) }
    private var tripAnchors: [NativeTripItem] {
        let items = detail.content.days.sorted { $0.date < $1.date }.flatMap(\.items)
        guard let first = items.first else { return [] }
        let last = items.last
        return last?.id == first.id ? [first] : [first] + (last.map { [$0] } ?? [])
    }
    private var current: Bool {
        guard let scope = settings.nativeSession.dataScope else { return false }
        return store.scope == scope && store.selectedID == detail.trip.id &&
            store.detail?.trip.headVersion == detail.trip.headVersion &&
            store.detail?.confirmationState == "confirmed"
    }

    var body: some View {
        Form {
            if !current {
                Section {
                    Text(text("This Trip changed or your account changed. Return to Trip and reopen the comparison.",
                              "行程或账号已变化。请返回行程页，重新打开比较。"))
                        .accessibilityIdentifier("hotel.compare.stale")
                }
            } else {
                Section(text("Trip basis", "行程依据")) {
                    Text(detail.trip.title)
                    Text(text("Confirmed Trip version \(detail.trip.headVersion)", "已确认行程版本 \(detail.trip.headVersion)"))
                    if let window {
                        Text(text("Suggested stay window from Trip days: \(window.checkIn) – \(window.checkOut) (\(window.nights) nights). Confirm the actual hotel nights, especially if changing cities or hotels.",
                                  "按行程日期推算的住宿窗口：\(window.checkIn) – \(window.checkOut)（\(window.nights) 晚）。请确认实际住宿晚数，尤其是跨城或换酒店时。"))
                            .accessibilityIdentifier("hotel.compare.tripDates")
                    } else {
                        Text(text("A valid stay window cannot be inferred from these Trip days. Enter and verify stay dates before any hotel search.",
                                  "无法从这些行程日期推算有效住宿窗口；搜索酒店前请填写并核对入住日期。"))
                            .accessibilityIdentifier("hotel.compare.missingDates")
                    }
                    Text(text("Trip items are context only. Their titles do not identify exact entrances or verified routes.",
                              "行程项目仅作背景；标题不能确定准确入口或已核路线。"))
                        .font(.footnote).foregroundStyle(.secondary)
                    ForEach(tripAnchors) { item in
                        Text(item.title).accessibilityIdentifier("hotel.compare.tripAnchor.\(item.id)")
                    }
                }
                Section(text("Accommodation intention", "住宿意向")) {
                    Picker(text("Current intention", "当前意向"), selection: $intent) {
                        Text(text("Not decided", "未决定")).tag(LodgingIntent.undecided)
                        Text(text("Already booked", "已订")).tag(LodgingIntent.booked)
                        Text(text("Not needed", "不需要")).tag(LodgingIntent.notNeeded)
                        Text(text("Decide later", "暂缓")).tag(LodgingIntent.later)
                        Text(text("Compare options", "比较候选")).tag(LodgingIntent.comparing)
                    }
                    .accessibilityIdentifier("hotel.compare.intent")
                    if intent != .comparing {
                        Text(intent == .booked
                             ? text("Keep your existing booking. No new hotel is suggested here.", "保留现有预订；此处不会推荐新酒店。")
                             : text("Comparison is paused until you choose Compare options. This choice stays on this device screen only.",
                                    "选择「比较候选」前不会推送住宿建议；此选择只保留在当前页面。"))
                            .accessibilityIdentifier("hotel.compare.suppressed")
                    }
                }
                if intent == .comparing {
                    requirements
                    places
                    candidate(number: 1, area: $firstArea, hotel: $firstHotel)
                    candidate(number: 2, area: $secondArea, hotel: $secondHotel)
                    Section {
                        Text(text("Area points are provider search results you selected; hotel names are your notes, not verified recommendations. Any shown route duration is a current-departure planning observation, not a forecast for the Trip date. Hotel availability, nightly rates and final prices are unavailable here; verify them with the supplier before choosing.",
                                  "区域参考点是你选择的供应商搜索结果；酒店名称只是你的备注，并非已核推荐。页面若显示路线耗时，也仅是现在出发的规划观察，不是行程日期预测。这里没有酒店库存、每晚房价或最终价；选择前请向供应商核实。"))
                            .accessibilityIdentifier("hotel.compare.evidenceGap")
                    }
                }
            }
        }
        .navigationTitle(text("Compare accommodation", "比较住宿"))
        .onChange(of: intent) { _, value in if value != .comparing { clearPlaces() } }
        .onChange(of: city) { _, _ in clearPlaces() }
        .onChange(of: anchorItemID) { _, _ in clearPlaces() }
        .onChange(of: anchorQuery) { _, _ in clearPlaces() }
        .onChange(of: firstArea) { _, _ in firstResults = []; firstPlace = nil; firstRoute = nil; generation = UUID(); busy = false }
        .onChange(of: secondArea) { _, _ in secondResults = []; secondPlace = nil; secondRoute = nil; generation = UUID(); busy = false }
        .onChange(of: settings.nativeSession.retainedDataScope) { _, _ in
            intent = .undecided
            adults = 2; children = false; rooms = 1
            currency = "CNY"; budgetBasis = .perNight
            bed = ""; budget = ""; firstArea = ""; secondArea = ""
            firstHotel = ""; secondHotel = ""
            city = ""; anchorItemID = ""; anchorQuery = ""
            clearPlaces()
        }
    }

    private var requirements: some View {
        Section(text("Stay requirements", "住宿需求")) {
            Text(text("Trip does not contain verified guest, bed or budget fields. Enter them for this comparison; nothing is saved to Trip or Memory.",
                      "行程尚无已核实的人数、床型或预算字段。请为本次比较填写；不会写入行程或记忆。"))
                .font(.footnote).foregroundStyle(.secondary)
            Stepper(text("Adults: \(adults)", "成人：\(adults)"), value: $adults, in: 1...30)
            Toggle(text("Travelling with children", "有儿童同行"), isOn: $children)
            Stepper(text("Rooms: \(rooms)", "房间数：\(rooms)"), value: $rooms, in: 1...30)
            TextField(text("Bed preference (optional)", "床型偏好（可选）"), text: $bed)
                .accessibilityIdentifier("hotel.compare.bed")
            TextField(text("Budget amount (optional)", "预算金额（可选）"), text: $budget)
                .keyboardType(.decimalPad).accessibilityIdentifier("hotel.compare.budget")
            Picker(text("Currency", "币种"), selection: $currency) {
                Text("CNY").tag("CNY")
                Text("USD").tag("USD")
            }
            Picker(text("Budget basis", "预算口径"), selection: $budgetBasis) {
                Text(text("Per night", "每晚")).tag(BudgetBasis.perNight)
                Text(text("Whole stay", "全程")).tag(BudgetBasis.wholeStay)
            }
            if !budget.isEmpty && (Decimal(string: budget) ?? 0) <= 0 {
                Text(text("Enter a positive budget amount, or leave it blank.", "请输入正数预算，或留空。"))
                    .foregroundStyle(.red)
                    .accessibilityIdentifier("hotel.compare.invalidBudget")
            }
            Text(text("Budget: \(budget.isEmpty ? "not provided" : budget) \(currency) \(budgetBasis == .perNight ? "per night" : "for the whole stay") · \(rooms) room(s). This is your limit, not a hotel quote. Taxes and fees are unknown.",
                      "预算：\(budget.isEmpty ? "未填写" : budget) \(currency)／\(budgetBasis == .perNight ? "每晚" : "全程") · \(rooms) 间房。这是你的预算，并非酒店报价；税费未知。"))
                .accessibilityIdentifier("hotel.compare.budgetSummary")
        }
    }

    private func candidate(number: Int, area: Binding<String>, hotel: Binding<String>) -> some View {
        Section(text("Candidate \(number)", "候选 \(number)")) {
            TextField(text("Area or neighborhood", "区域或街区"), text: area)
                .accessibilityIdentifier("hotel.compare.area.\(number)")
            TextField(text("Hotel name, if known", "酒店名称（如已知）"), text: hotel)
                .accessibilityIdentifier("hotel.compare.hotel.\(number)")
            if !firstArea.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
                firstArea.trimmingCharacters(in: .whitespacesAndNewlines).localizedCaseInsensitiveCompare(
                    secondArea.trimmingCharacters(in: .whitespacesAndNewlines)) == .orderedSame {
                Text(text("Enter different areas to compare distinct locations.", "请填写不同区域，才能比较不同地点。"))
                    .foregroundStyle(.red)
            }
            Button(text("Find area reference point", "查找区域参考点")) {
                Task { await find(number: number) }
            }
            .disabled(busy || city.isEmpty || area.wrappedValue.isEmpty)
            .accessibilityIdentifier("hotel.compare.find.\(number)")
            ForEach(number == 1 ? firstResults : secondResults) { place in
                Button(place.rawName) {
                    if number == 1 { firstPlace = place; firstRoute = nil }
                    else { secondPlace = place; secondRoute = nil }
                }
                .accessibilityIdentifier("hotel.compare.place.\(number).\(place.providerPoiId)")
            }
            if let selected = number == 1 ? firstPlace : secondPlace {
                Text(text("Selected map point: \(selected.rawName)", "已选地图参考点：\(selected.rawName)"))
            }
            TimelineView(.periodic(from: .now, by: 30)) { context in
                routeEvidence(number == 1 ? firstRoute : secondRoute, number: number, at: context.date)
            }
            Text(text("Display order follows your input; no commission or affiliate value is used to rank candidates.",
                      "展示顺序按你的输入，不使用佣金或联盟收益对候选排序。"))
                .font(.footnote).foregroundStyle(.secondary)
        }
    }

    private var places: some View {
        Section(text("Trip destination to compare", "行程目的地参照")) {
            TextField(text("City for map search", "地图搜索城市"), text: $city)
                .accessibilityIdentifier("hotel.compare.city")
            if !tripAnchors.isEmpty {
                Picker(text("Trip item", "行程项目"), selection: $anchorItemID) {
                    Text(text("Select an item", "选择项目")).tag("")
                    ForEach(tripAnchors) { item in Text(item.title).tag(item.id) }
                }
            }
            TextField(text("Public place name for this item", "该项目的公开地点名称"), text: $anchorQuery)
                .accessibilityIdentifier("hotel.compare.anchorQuery")
            Text(text("Enter only a public place name. Trip notes, guest names and booking references are not sent to AMap.",
                      "只填写公开地点名称；行程备注、旅客姓名和订单编号不会发送给高德。"))
                .font(.footnote).foregroundStyle(.secondary)
            Button(text("Find this Trip item on the map", "在地图查找该行程项目")) {
                Task { await find(number: 0) }
            }
            .disabled(busy || city.isEmpty || anchorItemID.isEmpty || anchorQuery.isEmpty)
            .accessibilityIdentifier("hotel.compare.findAnchor")
            ForEach(anchorResults) { place in
                Button(place.rawName) { anchorPlace = place; firstRoute = nil; secondRoute = nil }
                    .accessibilityIdentifier("hotel.compare.anchor.\(place.providerPoiId)")
            }
            if let anchorPlace {
                Text(text("Selected Trip destination: \(anchorPlace.rawName)", "已选行程目的地：\(anchorPlace.rawName)"))
            }
            Text(text("Confirm the exact map result. A Trip item title alone is not a place identity.",
                      "请确认准确地图结果；行程项目标题本身不是地点身份。"))
                .font(.footnote).foregroundStyle(.secondary)
            Button(text("Agree and check current routes with AMap", "同意向高德查询两个区域的当前路线")) {
                Task { await checkRoutes() }
            }
            .disabled(busy || anchorPlace == nil || firstPlace == nil || secondPlace == nil ||
                      firstPlace?.id == secondPlace?.id)
            .accessibilityIdentifier("hotel.compare.routes")
            if busy { ProgressView() }
            if lookupFailed {
                Text(text("Map lookup or routes are unavailable. Transport burden remains unverified.",
                          "地图查询或路线暂不可用，交通负担仍待核。"))
                    .accessibilityIdentifier("hotel.compare.lookupFailed")
            }
        }
    }

    @ViewBuilder private func routeEvidence(_ route: NativeRouteReply?, number: Int, at now: Date) -> some View {
        if let route, !route.expired(at: now) {
            Text(text("AMap planning observation at \(route.observedAt). For departure now only; not a forecast for your Trip date.",
                      "高德规划观察时间：\(route.observedAt)。仅对应当前出发，不是行程日期的预测。"))
                .font(.footnote)
            Text(text("Area point: \(route.origin.rawName) · \(route.origin.address ?? "address unknown") → Trip point: \(route.destination.rawName) · \(route.destination.address ?? "address unknown")",
                      "区域参考点：\(route.origin.rawName) · \(route.origin.address ?? "地址未知") → 行程参考点：\(route.destination.rawName) · \(route.destination.address ?? "地址未知")"))
                .font(.footnote)
            ForEach(route.options) { option in
                if option.status == "observed", let seconds = option.durationSeconds,
                   seconds.isFinite, seconds >= 0 {
                    Text(text("\(routeMode(option.mode, chinese: false)): about \(Int((seconds / 60).rounded())) min planning estimate",
                              "\(routeMode(option.mode, chinese: true))：规划估计约 \(Int((seconds / 60).rounded())) 分钟"))
                } else {
                    Text(text("\(routeMode(option.mode, chinese: false)): route unavailable (\(routeStatus(option.status, chinese: false)))",
                              "\(routeMode(option.mode, chinese: true))：路线不可用（\(routeStatus(option.status, chinese: true))）"))
                }
            }
        } else {
            Text(text("Transport burden: route evidence missing or expired. Exact entrances and travel-date conditions need checking.",
                      "交通负担：路线依据缺失或已过期。准确入口和行程日期的条件均待核。"))
                .accessibilityIdentifier("hotel.compare.routeGap.\(number)")
        }
    }

    private func routeMode(_ mode: String, chinese: Bool) -> String {
        switch mode {
        case "walking": chinese ? "步行" : "Walking"
        case "transit": chinese ? "公交" : "Transit"
        case "driving": chinese ? "驾车" : "Driving"
        default: chinese ? "路线" : "Route"
        }
    }

    private func routeStatus(_ status: String, chinese: Bool) -> String {
        switch status {
        case "no_routes": return chinese ? "无路线" : "No route"
        case "timeout": return chinese ? "查询超时" : "Timed out"
        case "city_unknown": return chinese ? "城市未知" : "City unknown"
        case "unsupported_segment": return chinese ? "含暂不支持的路段" : "Unsupported segment"
        case "endpoint_mismatch": return chinese ? "起终点不匹配" : "Endpoints mismatch"
        case "provider_rejected": return chinese ? "供应商拒绝查询" : "Provider rejected query"
        case "invalid_response": return chinese ? "结果不可用" : "Invalid result"
        default: return chinese ? "暂不可用" : "Unavailable"
        }
    }

    private func clearPlaces() {
        generation = UUID(); busy = false; anchorResults = []; firstResults = []; secondResults = []
        anchorPlace = nil; firstPlace = nil; secondPlace = nil
        firstRoute = nil; secondRoute = nil; lookupFailed = false
    }

    private func find(number: Int) async {
        guard current, !busy, !anchorItemID.isEmpty || number != 0 else { return }
        let query = number == 0 ? anchorQuery : number == 1 ? firstArea : secondArea
        guard
              !city.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        let own = UUID(); generation = own; busy = true; lookupFailed = false
        defer { if generation == own { busy = false } }
        do {
            let data = try await settings.nativeSession.placeSearchRequest(provider: .amap, query: query, city: city)
            guard current, generation == own, !Task.isCancelled, data.count <= 1_000_000 else { return }
            let results = try JSONDecoder().decode(SearchReply.self, from: data).candidates
            guard results.count <= 50, results.allSatisfy({ $0.provider == .amap && $0.valid() }) else { throw NativeDataError.invalidResponse }
            if number == 0 { anchorResults = results; anchorPlace = nil; firstRoute = nil; secondRoute = nil }
            else if number == 1 { firstResults = results; firstPlace = nil; firstRoute = nil }
            else { secondResults = results; secondPlace = nil; secondRoute = nil }
        } catch { if generation == own { lookupFailed = true } }
    }

    private func checkRoutes() async {
        guard current, !busy, let anchorPlace, let firstPlace, let secondPlace,
              firstPlace.id != secondPlace.id else { return }
        let own = UUID(); generation = own; busy = true; lookupFailed = false
        firstRoute = nil; secondRoute = nil
        defer { if generation == own { busy = false } }
        do {
            var observations: [NativeRouteReply] = []
            for place in [firstPlace, secondPlace] {
                let data = try await settings.nativeSession.placeLookupRequest([
                    "action": "routes", "provider": "amap", "departure": "now",
                    "originId": place.providerPoiId, "destinationId": anchorPlace.providerPoiId
                ])
                guard current, generation == own, !Task.isCancelled, data.count <= 1_000_000 else { return }
                let route = try JSONDecoder().decode(NativeRouteReply.self, from: data)
                observations.append(route)
            }
            guard observations.count == 2,
                  NativeHotelRouteComparison.accepts(observations[0], observations[1],
                      firstArea: firstPlace, secondArea: secondPlace, destination: anchorPlace, now: Date())
            else { throw NativeDataError.invalidResponse }
            firstRoute = observations[0]; secondRoute = observations[1]
        } catch { if generation == own { lookupFailed = true } }
    }
}

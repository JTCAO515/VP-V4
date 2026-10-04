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

    init(initialSearch: NativeHotelSearch? = nil) {
        guard let initialSearch else { return }
        _name = State(initialValue: initialSearch.hotelOrCity)
        _adults = State(initialValue: initialSearch.adults)
        _rooms = State(initialValue: initialSearch.rooms)
        _children = State(initialValue: initialSearch.includesChildren)
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        if let arrival = formatter.date(from: initialSearch.checkIn) { _checkIn = State(initialValue: arrival) }
        if let departure = formatter.date(from: initialSearch.checkOut) { _checkOut = State(initialValue: departure) }
    }

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
    private struct ContextEnvelope: Decodable { let data: NativeLodgingContext }
    private struct ExportText: Identifiable { let text: String; var id: String { text } }
    let detail: NativeTripDetail
    let store: NativeTripStore
    @Environment(AppSettings.self) private var settings
    @Environment(\.dismiss) private var dismiss
    @State private var intent = NativeLodgingIntent.undecided
    @State private var adults = 2
    @State private var children = 0
    @State private var rooms = 1
    @State private var partyConfirmed = false
    @State private var bedType: NativeLodgingBedType?
    @State private var budget = ""
    @State private var currency = "CNY"
    @State private var budgetBasis = NativeLodgingBudgetBasis.perRoomPerNight
    @State private var stayCheckIn = Date()
    @State private var stayCheckOut = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
    @State private var stayConfirmed = false
    @State private var savedRecord: NativeLodgingLocalRecord?
    @State private var selectedHotel: NativeLodgingSelection?
    @State private var selectedHotelNumber: Int?
    @State private var firstHotelChoice: NativeLodgingSelection?
    @State private var secondHotelChoice: NativeLodgingSelection?
    @State private var hotelResults: [NativePlaceCandidate] = []
    @State private var hotelLookupNumber: Int?
    @State private var lodgingContext: NativeLodgingContext?
    @State private var contextNotice: String?
    @State private var useSavedTravelPace = false
    @State private var localNotice: String?
    @State private var localSaving = false
    @State private var localGeneration = UUID()
    @State private var showReset = false
    @State private var exportText: String?
    @State private var affectedItemID = ""
    @State private var proposedTitle = ""
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

    private var chinese: Bool { settings.selectedLocale == .zh }
    private func text(_ en: String, _ zh: String) -> String { chinese ? zh : en }
    private var window: NativeHotelTripWindow? { NativeHotelTripWindow.suggest(from: detail) }
    private var namespace: NativeOfflineTripNamespace? {
        guard let scope = settings.nativeSession.dataScope else { return nil }
        return try? .init(scope: scope, tripID: detail.trip.id)
    }
    private var localNeedsRecheck: Bool { savedRecord?.needsTripRecheck(currentVersion: detail.trip.headVersion) ?? false }
    private var candidateChoices: [NativeLodgingSelection] { [firstHotelChoice, secondHotelChoice].compactMap { $0 } }
    private var localChoicesMatch: Bool { savedRecord?.candidateChoices == candidateChoices && savedRecord?.intent == intent }
    private func routeOrigin(_ number: Int) -> NativePlaceCandidate? {
        let choice = number == 1 ? firstHotelChoice : secondHotelChoice
        if let choice, choice.provider == .amap, let providerPoiId = choice.providerPoiId {
            return .init(provider: .amap, providerPoiId: providerPoiId, rawName: choice.hotelName,
                         matchedCanonicalPoiId: choice.canonicalPoiId)
        }
        return number == 1 ? firstPlace : secondPlace
    }
    private var tripAnchors: [NativeTripItem] {
        let dated = detail.content.days.sorted { $0.date < $1.date }
        guard let first = dated.first?.items.first else { return [] }
        let last = dated.last?.items.last
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
                        Text(text("Not decided", "未决定")).tag(NativeLodgingIntent.undecided)
                        Text(text("Already booked (your report)", "已订（你的声明）")).tag(NativeLodgingIntent.booked)
                        Text(text("Not needed", "不需要")).tag(NativeLodgingIntent.notNeeded)
                        Text(text("Decide later", "暂缓")).tag(NativeLodgingIntent.deferred)
                        Text(text("Compare options", "比较候选")).tag(NativeLodgingIntent.searching)
                    }
                    .accessibilityIdentifier("hotel.compare.intent")
                    if intent != .searching {
                        Text(intent == .booked
                             ? text("Your booking report is kept; supplier confirmation remains unknown. No new hotel is suggested here.", "保留你的已订声明；供应商确认仍未知。此处不会推荐新酒店。")
                             : text("Comparison stays paused until you choose Compare options. Save this choice on this device below.",
                                    "选择「比较候选」前不会推送住宿建议；可在下方将此选择保存到本机。"))
                            .accessibilityIdentifier("hotel.compare.suppressed")
                    }
                }
                if intent == .searching {
                    requirements
                    places
                    candidate(number: 1, area: $firstArea, hotel: $firstHotel)
                    candidate(number: 2, area: $secondArea, hotel: $secondHotel)
                    Section(text("Current source check", "当前来源核对")) {
                        Toggle(text("Use eligible saved travel pace for this context preview", "本次上下文预览使用符合资格的已存旅行节奏"),
                               isOn: $useSavedTravelPace)
                            .accessibilityIdentifier("hotel.compare.useSavedPace")
                        Button(text("Check both hotel candidates", "核对两处酒店候选")) { Task { await checkContext() } }
                            .disabled(busy || localSaving || savedRecord == nil || localNeedsRecheck || !localChoicesMatch)
                            .accessibilityIdentifier("hotel.compare.context")
                        if let contextNotice { Text(contextNotice).accessibilityIdentifier("hotel.compare.contextNotice") }
                        if let preview = lodgingContext?.profilePreview,
                           preview.usage == "local_preview_only", preview.appliedToRanking == false,
                           preview.status == "available", let pace = preview.value?.travelPace {
                            Text(text("Eligible saved pace: \(pace). It does not determine bed, budget, hotel classification or ranking.",
                                      "符合资格的已存节奏：\(pace)。它不决定床型、预算、酒店分类或排序。"))
                                .accessibilityIdentifier("hotel.compare.pacePreview")
                        }
                    }
                    if let selectedHotel { selectedHotelSection(selectedHotel) }
                    if selectedHotel != nil { affectedTripSection }
                    Section {
                        Text(text("Area points are provider search results you selected; hotel names are your notes, not verified recommendations. Any shown route duration is a current-departure planning observation, not a forecast for the Trip date. Hotel availability, nightly rates and final prices are unavailable here; verify them with the supplier before choosing.",
                                  "区域参考点是你选择的供应商搜索结果；酒店名称只是你的备注，并非已核推荐。页面若显示路线耗时，也仅是现在出发的规划观察，不是行程日期预测。这里没有酒店库存、每晚房价或最终价；选择前请向供应商核实。"))
                        .accessibilityIdentifier("hotel.compare.evidenceGap")
                    }
                }
                Section(text("On this device", "仅此设备")) {
                    if localNeedsRecheck {
                        Text(text("This saved choice belongs to Trip version \(savedRecord?.tripVersion ?? 0). Review the changed Trip and save again before using it for an exit or Trip draft.",
                                  "保存的选择属于行程版本 \(savedRecord?.tripVersion ?? 0)。行程已变化；外跳或准备行程草稿前请审阅并重新保存。"))
                            .accessibilityIdentifier("hotel.compare.localStale")
                    }
                    Button(text(savedRecord == nil ? "Save current choice on this device" : "Save changes for this Trip version",
                                savedRecord == nil ? "在本机保存当前选择" : "为当前行程版本保存修改")) { Task { await saveLocal() } }
                        .disabled(localSaving)
                        .accessibilityIdentifier("hotel.compare.saveLocal")
                    if savedRecord != nil {
                        Button(text("Review export of my lodging input", "查看并导出我的住宿输入")) { prepareExport() }
                            .accessibilityIdentifier("hotel.compare.export")
                        Button(text("Delete this device's lodging input", "删除本机住宿输入"), role: .destructive) { showReset = true }
                            .accessibilityIdentifier("hotel.compare.reset")
                    }
                    if let localNotice { Text(localNotice).accessibilityIdentifier("hotel.compare.localNotice") }
                    Text(text("This device-only record does not sync across devices or confirm a booking. Your Trip and Memory remain unchanged.",
                              "此记录仅保存在本机，不跨设备同步，也不证明预订成功；行程和记忆均未因此修改。"))
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle(text("Compare accommodation", "比较住宿"))
        .onChange(of: intent) { _, value in if value != .searching { clearPlaces() } }
        .onChange(of: city) { _, _ in clearPlaces(); hotelResults = []; lodgingContext = nil }
        .onChange(of: useSavedTravelPace) { _, _ in lodgingContext = nil; contextNotice = nil }
        .onChange(of: anchorItemID) { _, _ in clearPlaces() }
        .onChange(of: anchorQuery) { _, _ in clearPlaces() }
        .onChange(of: firstArea) { _, _ in firstResults = []; firstPlace = nil; firstRoute = nil; generation = UUID(); busy = false }
        .onChange(of: secondArea) { _, _ in secondResults = []; secondPlace = nil; secondRoute = nil; generation = UUID(); busy = false }
        .onChange(of: firstHotel) { _, _ in
            if firstHotelChoice?.hotelName != firstHotel {
                firstHotelChoice = nil; lodgingContext = nil; hotelResults = []; hotelLookupNumber = nil
                firstRoute = nil; generation = UUID(); busy = false
            }
            if selectedHotelNumber == 1 && selectedHotel?.hotelName != firstHotel {
                selectedHotel = nil; selectedHotelNumber = nil
            }
        }
        .onChange(of: secondHotel) { _, _ in
            if secondHotelChoice?.hotelName != secondHotel {
                secondHotelChoice = nil; lodgingContext = nil; hotelResults = []; hotelLookupNumber = nil
                secondRoute = nil; generation = UUID(); busy = false
            }
            if selectedHotelNumber == 2 && selectedHotel?.hotelName != secondHotel {
                selectedHotel = nil; selectedHotelNumber = nil
            }
        }
        .onChange(of: settings.nativeSession.retainedDataScope) { _, _ in
            localGeneration = UUID(); localSaving = false
            intent = .undecided
            adults = 2; children = 0; rooms = 1; partyConfirmed = false
            currency = "CNY"; budgetBasis = .perRoomPerNight; bedType = nil
            budget = ""; firstArea = ""; secondArea = ""
            firstHotel = ""; secondHotel = ""
            city = ""; anchorItemID = ""; anchorQuery = ""
            selectedHotel = nil; selectedHotelNumber = nil; savedRecord = nil; localNotice = nil; exportText = nil; stayConfirmed = false
            firstHotelChoice = nil; secondHotelChoice = nil
            hotelResults = []; hotelLookupNumber = nil; lodgingContext = nil; contextNotice = nil
            useSavedTravelPace = false
            affectedItemID = ""; proposedTitle = ""
            clearPlaces()
        }
        .task(id: settings.nativeSession.dataScope) { loadLocal() }
        .confirmationDialog(text("Delete device-only lodging input?", "删除仅本机保存的住宿输入？"), isPresented: $showReset) {
            Button(text("Delete on this device", "删除本机记录"), role: .destructive) { resetLocal() }
        }
        .sheet(item: Binding(get: { exportText.map { ExportText(text: $0) } }, set: { if $0 == nil { exportText = nil } })) { value in
            NavigationStack {
                Form { Text(value.text).textSelection(.enabled); ShareLink(item: value.text) {
                    Text(text("Share this exact text", "分享这份准确文本"))
                } }
                .navigationTitle(text("Lodging input export", "住宿输入导出"))
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button(text("Done", "完成")) { exportText = nil } } }
            }
        }
    }

    private var requirements: some View {
        Section(text("Stay requirements", "住宿需求")) {
            Text(text("Trip has no verified guest, bed or budget fields. Confirm only the details you know; saving below keeps them on this device for this Trip.",
                      "行程尚无已核实的人数、床型或预算字段。只确认你知道的条件；下方保存后仅留在本机当前行程。"))
                .font(.footnote).foregroundStyle(.secondary)
            Toggle(text("I confirm these guest and room counts", "我确认以下人数和房间数"), isOn: $partyConfirmed)
            Stepper(text("Adults: \(adults)", "成人：\(adults)"), value: $adults, in: 1...30)
            Stepper(text("Children: \(children)", "儿童：\(children)"), value: $children, in: 0...30)
            Stepper(text("Rooms: \(rooms)", "房间数：\(rooms)"), value: $rooms, in: 1...30)
            Picker(text("Bed preference", "床型偏好"), selection: $bedType) {
                Text(text("Unknown", "未知")).tag(NativeLodgingBedType?.none)
                Text(text("No preference", "无偏好")).tag(Optional(NativeLodgingBedType.unspecified))
                Text(text("Double", "大床")).tag(Optional(NativeLodgingBedType.double))
                Text(text("Twin", "双床")).tag(Optional(NativeLodgingBedType.twin))
            }
                .accessibilityIdentifier("hotel.compare.bed")
            DatePicker(text("Check-in to confirm", "请确认入住日期"), selection: $stayCheckIn, displayedComponents: .date)
            DatePicker(text("Check-out to confirm", "请确认退房日期"), selection: $stayCheckOut, displayedComponents: .date)
            Toggle(text("I confirm these stay dates", "我确认以上入住日期"), isOn: $stayConfirmed)
            TextField(text("Budget amount (optional)", "预算金额（可选）"), text: $budget)
                .keyboardType(.decimalPad).accessibilityIdentifier("hotel.compare.budget")
            Picker(text("Currency", "币种"), selection: $currency) {
                Text("CNY").tag("CNY")
                Text("USD").tag("USD")
                Text("EUR").tag("EUR")
                Text("GBP").tag("GBP")
            }
            Picker(text("Budget basis", "预算口径"), selection: $budgetBasis) {
                Text(text("Per room per night", "每间每晚")).tag(NativeLodgingBudgetBasis.perRoomPerNight)
                Text(text("Whole stay", "全程总额")).tag(NativeLodgingBudgetBasis.totalStay)
            }
            if !budget.isEmpty && NativeLodgingBudget.parse(budget, currency: currency, basis: budgetBasis) == nil {
                Text(text("Enter a positive budget amount, or leave it blank.", "请输入正数预算，或留空。"))
                    .foregroundStyle(.red)
                    .accessibilityIdentifier("hotel.compare.invalidBudget")
            }
            Text(text("Budget: \(budget.isEmpty ? "not provided" : budget) \(currency) \(budgetBasis == .perRoomPerNight ? "per room per night" : "whole stay total") · \(partyConfirmed ? "\(rooms)" : "unconfirmed") room(s). This is your limit, not a hotel quote. Taxes and fees are unknown.",
                      "预算：\(budget.isEmpty ? "未填写" : budget) \(currency)／\(budgetBasis == .perRoomPerNight ? "每间每晚" : "全程总额") · \(partyConfirmed ? "\(rooms)" : "未确认") 间房。这是你的预算，并非酒店报价；税费未知。"))
                .accessibilityIdentifier("hotel.compare.budgetSummary")
        }
    }

    private func candidate(number: Int, area: Binding<String>, hotel: Binding<String>) -> some View {
        Section(text("Candidate \(number)", "候选 \(number)")) {
            TextField(text("Area or neighborhood", "区域或街区"), text: area)
                .accessibilityIdentifier("hotel.compare.area.\(number)")
            TextField(text("Hotel name, if known", "酒店名称（如已知）"), text: hotel)
                .accessibilityIdentifier("hotel.compare.hotel.\(number)")
            Button(text("Temporarily select this hotel", "暂选此酒店")) {
                selectHotel(number: number, name: hotel.wrappedValue)
            }
            .disabled(busy || hotel.wrappedValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .accessibilityIdentifier("hotel.compare.selectHotel.\(number)")
            Button(text("Find this hotel name on the map", "在地图查找此酒店名称")) { Task { await findHotel(number: number) } }
                .disabled(busy || city.isEmpty || hotel.wrappedValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityIdentifier("hotel.compare.findHotel.\(number)")
            ForEach(hotelLookupNumber == number ? hotelResults : []) { place in
                Button(place.rawName) { chooseHotelPlace(place, number: number) }
                    .disabled(busy)
                    .accessibilityIdentifier("hotel.compare.hotelPlace.\(number).\(place.providerPoiId)")
            }
            if let choice = number == 1 ? firstHotelChoice : secondHotelChoice {
                Text(text("Selected hotel place reference: \(choice.providerPoiId ?? "none"). Identity is not inventory or a booking.",
                          "已选酒店地点引用：\(choice.providerPoiId ?? "无")。地点身份不代表库存或预订。"))
                    .font(.footnote)
                TimelineView(.periodic(from: .now, by: 10)) { tick in
                    Text(lodgingContext?.reviewedHotel(for: choice, tripID: detail.trip.id,
                        tripVersion: detail.trip.headVersion, lodgingIntent: intent, now: tick.date) == true
                         ? text("Current reviewed source classifies this place as a hotel; rooms, rates, beds and foreign-guest eligibility remain unknown.",
                                "当前已审核来源将此地点分类为酒店；房间、价格、床型及外宾入住资格仍未知。")
                         : text("No current reviewed hotel classification for this candidate.", "此候选尚无当前有效的已审核酒店分类。"))
                        .accessibilityIdentifier("hotel.compare.classification.\(number)")
                }
            }
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
                .disabled(busy)
                .accessibilityIdentifier("hotel.compare.place.\(number).\(place.providerPoiId)")
            }
            if let selected = number == 1 ? firstPlace : secondPlace {
                Text(text("Selected map point: \(selected.rawName)", "已选地图参考点：\(selected.rawName)"))
            }
            Text(text("Route origin uses the selected hotel map point when available; otherwise it uses this area point. Neither proves a room is available.",
                      "有已选酒店地图点时从该点规划路线，否则使用区域参考点；两者都不证明房间可售。"))
                .font(.footnote).foregroundStyle(.secondary)
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
            Picker(text("City for map search", "地图搜索城市"), selection: $city) {
                Text(text("Choose a city", "选择城市")).tag("")
                Text(text("Shanghai", "上海")).tag("shanghai")
                Text(text("Beijing", "北京")).tag("beijing")
                Text(text("Guangzhou", "广州")).tag("guangzhou")
                Text(text("Chongqing", "重庆")).tag("chongqing")
            }
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
                    .disabled(busy)
                    .accessibilityIdentifier("hotel.compare.anchor.\(place.providerPoiId)")
            }
            if let anchorPlace {
                Text(text("Selected Trip destination: \(anchorPlace.rawName)", "已选行程目的地：\(anchorPlace.rawName)"))
            }
            Text(text("Confirm the exact map result. A Trip item title alone is not a place identity.",
                      "请确认准确地图结果；行程项目标题本身不是地点身份。"))
                .font(.footnote).foregroundStyle(.secondary)
            Button(text("Agree and check current routes with AMap", "同意向高德查询两处候选地点的当前路线")) {
                Task { await checkRoutes() }
            }
            .disabled(busy || anchorPlace == nil || routeOrigin(1) == nil || routeOrigin(2) == nil ||
                      routeOrigin(1)?.id == routeOrigin(2)?.id)
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
            Text(text("Candidate point: \(route.origin.rawName) · \(route.origin.address ?? "address unknown") → Trip point: \(route.destination.rawName) · \(route.destination.address ?? "address unknown")",
                      "候选参考点：\(route.origin.rawName) · \(route.origin.address ?? "地址未知") → 行程参考点：\(route.destination.rawName) · \(route.destination.address ?? "地址未知")"))
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

    @ViewBuilder private func selectedHotelSection(_ selection: NativeLodgingSelection) -> some View {
        Section(text("Tentative hotel", "暂选酒店")) {
            Text(selection.hotelName).accessibilityIdentifier("hotel.compare.tentative")
            Text(text("You selected this public name. It is not a recommendation, reservation, supplier confirmation, available room, or verified price. Your confirmed Trip is unchanged.",
                      "这是你暂选的公开名称，不代表推荐、预订、供应商确认、可售房间或已核价格。已确认行程未改变。"))
                .font(.footnote).foregroundStyle(.secondary)
            if savedRecord?.selected == selection, !localNeedsRecheck, stayConfirmed, partyConfirmed,
               adults >= rooms, let checkIn = savedRecord?.checkIn, let checkOut = savedRecord?.checkOut {
                NavigationLink(text("Review official search exit", "核对官方搜索出口")) {
                    NativeHotelHandoffView(initialSearch: .init(hotelOrCity: selection.hotelName,
                        checkIn: checkIn, checkOut: checkOut, adults: adults, rooms: rooms,
                        includesChildren: children > 0))
                }
                .accessibilityIdentifier("hotel.compare.officialExit")
            } else {
                Text(text("Confirm stay dates and guests, save the selection for this Trip version, then review the official exit. No link opens automatically.",
                          "请确认入住日期与人数，并为当前行程版本保存暂选，之后再核对官方出口；不会自动打开链接。"))
                    .accessibilityIdentifier("hotel.compare.exitNeedsReview")
            }
        }
    }

    private var affectedTripSection: some View {
        Section(text("Affected Trip draft", "受影响行程草稿")) {
            Text(text("Choose an existing first- or last-day item and write the exact proposed replacement title. This prepares one editable Trip draft. The Trip changes only after you review its visible Proposal diff and confirm in Trip.",
                      "请选择首日或末日的现有项目，填写准确的拟替换标题。这里只准备一条可编辑行程草稿；须在行程页审阅可见 Proposal 差异并确认后才会修改行程。"))
                .font(.footnote)
            if tripAnchors.isEmpty {
                Text(text("No first- or last-day item is available. Use the Trip editor to add or adjust an item explicitly.",
                          "首末日没有可选项目。请在行程编辑器中明确添加或调整项目。"))
            } else {
                Picker(text("Affected item", "受影响项目"), selection: $affectedItemID) {
                    Text(text("Select one item", "选择一项")).tag("")
                    ForEach(tripAnchors) { item in Text(item.title).tag(item.id) }
                }
                TextField(text("Proposed Trip item title", "拟议行程项目标题"), text: $proposedTitle)
                    .accessibilityIdentifier("hotel.compare.proposedTitle")
                Button(text("Prepare one-item Trip draft", "准备一项行程草稿")) { Task { await prepareTripDraft() } }
                    .disabled(savedRecord?.selected == nil || localNeedsRecheck || affectedItemID.isEmpty ||
                              proposedTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityIdentifier("hotel.compare.prepareTripDraft")
            }
        }
    }

    private func prepareTripDraft() async {
        guard current, savedRecord?.selected == selectedHotel, !localNeedsRecheck,
              let item = tripAnchors.first(where:{$0.id==affectedItemID}),
              let day = detail.content.days.first(where:{$0.items.contains(where:{$0.id==item.id})}) else{return}
        let accepted=await store.prepareLodgingDraft(expectedTripVersion:detail.trip.headVersion,
            dayID:day.id,itemID:item.id,title:proposedTitle,using:settings.nativeSession)
        if accepted { dismiss() }
        else { localNotice=text("Trip draft could not be prepared. Reload and review the current Trip.", "未能准备行程草稿；请重载并审阅当前行程。") }
    }

    private func selectHotel(number: Int, name: String) {
        guard current else { return }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let prior = number == 1 ? firstHotelChoice : secondHotelChoice
        let value: NativeLodgingSelection
        if let prior, prior.hotelName == trimmed { value = prior }
        else { value = NativeLodgingSelection(hotelName: trimmed, provider: nil,
            providerPoiId: nil, canonicalPoiId: nil, selectedAt: Date()) }
        guard value.valid else { localNotice = text("Enter a public hotel name without private details.", "请填写不含私人信息的公开酒店名称。"); return }
        selectedHotel = value
        selectedHotelNumber = number
        lodgingContext = nil; hotelResults = []
        Task { await saveLocal() }
    }

    private func findHotel(number: Int) async {
        let name = number == 1 ? firstHotel : secondHotel
        guard current, !busy, [1,2].contains(number), !city.isEmpty,
              !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        let own = UUID(); generation = own; busy = true
        hotelResults = []; hotelLookupNumber = number; lodgingContext = nil; contextNotice = nil
        defer { if generation == own { busy = false } }
        do {
            let bytes = try await settings.nativeSession.placeSearchRequest(provider: .amap,
                query: name, city: city)
            guard current, generation == own, hotelLookupNumber == number,
                  (number == 1 ? firstHotel : secondHotel) == name, !Task.isCancelled,
                  bytes.count <= 1_000_000 else { return }
            let results = try JSONDecoder().decode(SearchReply.self, from: bytes).candidates
            guard results.count <= 50, results.allSatisfy({ $0.provider == .amap && $0.valid() }) else {
                throw NativeDataError.invalidResponse
            }
            hotelResults = results
            if results.isEmpty { contextNotice = text("No map match; this remains your unverified note.", "地图没有匹配结果；这仍是未经核实的备注。") }
        } catch { if generation == own { contextNotice = text("Hotel place lookup is unavailable; no identity is assumed.", "酒店地点查询不可用；不会推断其身份。") } }
    }

    private func chooseHotelPlace(_ place: NativePlaceCandidate, number: Int) {
        guard current, !busy, hotelLookupNumber == number, hotelResults.contains(place), place.valid() else { return }
        let name = (number == 1 ? firstHotel : secondHotel).trimmingCharacters(in: .whitespacesAndNewlines)
        let chosen = NativeLodgingSelection(hotelName: name, provider: place.provider,
            providerPoiId: place.providerPoiId, canonicalPoiId: place.matchedCanonicalPoiId, selectedAt: Date())
        guard chosen.valid else { return }
        if number == 1 { firstHotelChoice = chosen } else { secondHotelChoice = chosen }
        if selectedHotelNumber == number { selectedHotel = chosen }
        if number == 1 { firstRoute = nil } else { secondRoute = nil }
        hotelResults = []; hotelLookupNumber = nil; lodgingContext = nil; contextNotice = nil
        Task { await saveLocal() }
    }

    private func checkContext() async {
        guard current, !busy, let scope = settings.nativeSession.dataScope,
              let savedRecord, localChoicesMatch, !localNeedsRecheck,
              let body = NativeLodgingContextRequest.make(record: savedRecord,
                  locale: chinese ? "zh" : "en", tripVersion: detail.trip.headVersion,
                  useSavedTravelPace: useSavedTravelPace) else { return }
        let own = UUID(); generation = own; busy = true; lodgingContext = nil; contextNotice = nil
        defer { if generation == own { busy = false } }
        do {
            guard await store.refreshForSharing(using: settings.nativeSession), current,
                  settings.nativeSession.dataScope == scope, generation == own else { throw NativeDataError.staleSessionResponse }
            let bytes = try await settings.nativeSession.tripRequest(
                path: "api/trips/native/v2/\(detail.trip.id)/lodging/context", method: "POST", body: body)
            guard current, settings.nativeSession.dataScope == scope, generation == own,
                  !Task.isCancelled, bytes.count <= 1_000_000 else { return }
            let result = try JSONDecoder().decode(ContextEnvelope.self, from: bytes).data
            guard result.schemaVersion == "lodging-context/1", result.basis.tripId.lowercased() == detail.trip.id.lowercased(),
                  result.basis.tripVersion == detail.trip.headVersion, result.intent.value == intent.rawValue,
                  result.ranking.commissionUsed == false, result.ranking.userNoteUsed == false,
                  result.profilePreview.usage == "local_preview_only",
                  result.profilePreview.appliedToRanking == false,
                  result.tripMutation == "none" else { throw NativeDataError.invalidResponse }
            lodgingContext = result
            contextNotice = text("Current context read; classification still depends on a matching reviewed source.",
                                 "已读取当前上下文；酒店分类仍取决于匹配的已审核来源。")
        } catch { if generation == own { lodgingContext = nil; contextNotice = text("Current hotel evidence could not be verified. Try again after refreshing Trip.",
            "未能核实当前酒店依据；请刷新行程后重试。") } }
    }

    private func loadLocal() {
        guard current, let scope = settings.nativeSession.dataScope, let namespace else { return }
        do {
            let record = try settings.nativeSession.offlineTrips.readLodging(namespace, scope: scope)
            savedRecord = record
            guard let record else { prefillStaySuggestion(); return }
            intent = record.intent
            city = record.city ?? ""
            partyConfirmed = record.adults != nil && record.children != nil && record.rooms != nil
            adults = record.adults ?? 2; children = record.children ?? 0; rooms = record.rooms ?? 1
            bedType = record.bedType
            if let amount = record.budget?.amountMinor {
                budget = "\(amount / 100)." + String(format: "%02d", amount % 100)
            } else { budget = "" }
            currency = record.budget?.currency ?? "CNY"
            budgetBasis = record.budget?.basis ?? .perRoomPerNight
            firstHotelChoice = record.candidateChoices.first
            secondHotelChoice = record.candidateChoices.dropFirst().first
            firstHotel = firstHotelChoice?.hotelName ?? ""
            secondHotel = secondHotelChoice?.hotelName ?? ""
            selectedHotel = record.selected
            selectedHotelNumber = record.selected.flatMap { choice in
                if firstHotelChoice == choice { return 1 }
                if secondHotelChoice == choice { return 2 }
                return nil
            }
            if let selectedHotel, firstHotel.isEmpty {
                firstHotel = selectedHotel.hotelName; selectedHotelNumber = 1
            }
            if let checkIn = record.checkIn, let checkOut = record.checkOut,
               let arrival = localDay(checkIn), let departure = localDay(checkOut) {
                stayCheckIn = arrival; stayCheckOut = departure; stayConfirmed = true
            } else { prefillStaySuggestion() }
            localNotice = nil
        } catch {
            savedRecord = nil
            intent = .undecided; selectedHotel = nil; selectedHotelNumber = nil; partyConfirmed = false; stayConfirmed = false
            bedType = nil; budget = ""; city = ""; firstHotel = ""; secondHotel = ""
            firstHotelChoice = nil; secondHotelChoice = nil
            hotelResults = []; hotelLookupNumber = nil; lodgingContext = nil; clearPlaces()
            localNotice = text("Could not unlock the device-only lodging record. No saved choice is assumed.",
                               "无法读取本机住宿记录；不会假定已保存任何选择。")
        }
    }

    private func prefillStaySuggestion() {
        stayConfirmed = false
        if let window, let arrival = localDay(window.checkIn), let departure = localDay(window.checkOut) {
            stayCheckIn = arrival; stayCheckOut = departure
        }
    }

    private func localDay(_ value: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        guard let date = formatter.date(from: value), formatter.string(from: date) == value else { return nil }
        return date
    }

    private func saveLocal() async {
        guard current, !localSaving, let scope = settings.nativeSession.dataScope, let namespace else { return }
        let own = localGeneration
        localSaving = true
        defer { if localGeneration == own { localSaving = false } }
        let refreshed = await store.refreshForSharing(using: settings.nativeSession)
        guard localGeneration == own else { return }
        guard refreshed, current, settings.nativeSession.dataScope == scope else {
            localNotice = text("Trip changed or could not be refreshed. Review it before saving.",
                               "行程已变化或未能重新读取；请先审阅行程再保存。")
            return
        }
        let chosenBudget: NativeLodgingBudget?
        if budget.isEmpty { chosenBudget = nil }
        else {
            guard let parsed = NativeLodgingBudget.parse(budget, currency: currency, basis: budgetBasis) else {
                localNotice = text("Check the budget amount and currency.", "请核对预算金额和币种。")
                return
            }
            chosenBudget = parsed
        }
        let record = NativeLodgingLocalRecord(schemaVersion: "native-lodging-local/1", namespace: namespace,
            revision: (savedRecord?.revision ?? 0) + 1, tripVersion: detail.trip.headVersion,
            intent: intent, city: city.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : city.trimmingCharacters(in: .whitespacesAndNewlines),
            checkIn: stayConfirmed ? NativeHotelHandoff.day(stayCheckIn) : nil,
            checkOut: stayConfirmed ? NativeHotelHandoff.day(stayCheckOut) : nil,
            adults: partyConfirmed ? adults : nil, children: partyConfirmed ? children : nil,
            rooms: partyConfirmed ? rooms : nil, bedType: bedType, budget: chosenBudget,
            candidateChoices: candidateChoices, selected: selectedHotel, updatedAt: Date())
        guard record.valid else { localNotice = text("Check stay dates and lodging details.", "请核对入住日期和住宿条件。"); return }
        do {
            try settings.nativeSession.offlineTrips.saveLodging(record, expectedRevision: savedRecord?.revision, scope: scope)
            savedRecord = record
            localNotice = text("Saved only on this device. Booking status remains unknown.", "仅已保存到本机；预订状态仍未知。")
        } catch {
            localNotice = text("Could not save. Reload the Trip and retry; the prior record remains unchanged.",
                               "未能保存。请重载行程再试；此前记录未改变。")
        }
    }

    private func resetLocal() {
        guard current, let scope = settings.nativeSession.dataScope, let namespace else { return }
        localGeneration = UUID(); localSaving = false
        do {
            try settings.nativeSession.offlineTrips.removeLodging(namespace, scope: scope)
            savedRecord = nil; selectedHotel = nil; selectedHotelNumber = nil; intent = .undecided
            firstHotelChoice = nil; secondHotelChoice = nil
            adults = 2; children = 0; rooms = 1; partyConfirmed = false
            stayConfirmed = false; stayCheckIn = Date()
            stayCheckOut = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
            bedType = nil; budget = ""; currency = "CNY"; budgetBasis = .perRoomPerNight
            city = ""; anchorItemID = ""; anchorQuery = ""; firstArea = ""; secondArea = ""
            firstHotel = ""; secondHotel = ""; affectedItemID = ""; proposedTitle = ""
            hotelResults = []; hotelLookupNumber = nil; lodgingContext = nil; contextNotice = nil; exportText = nil
            clearPlaces()
            localNotice = text("Device-only lodging input deleted.", "本机住宿输入已删除。")
        } catch { localNotice = text("Device deletion could not be verified. Retry before signing out.", "未能确认本机删除，请重试后再退出。") }
    }

    private func prepareExport() {
        guard current, let savedRecord else { return }
        var data: [String: Any] = ["schemaVersion": "native-lodging-user-export/1", "tripVersion": savedRecord.tripVersion,
                                   "intent": savedRecord.intent.rawValue, "updatedAt": ISO8601DateFormatter().string(from: savedRecord.updatedAt)]
        if let city = savedRecord.city { data["city"] = city }
        if let checkIn = savedRecord.checkIn, let checkOut = savedRecord.checkOut { data["checkIn"] = checkIn; data["checkOut"] = checkOut }
        if let adults = savedRecord.adults, let children = savedRecord.children, let rooms = savedRecord.rooms {
            data["adults"] = adults; data["children"] = children; data["rooms"] = rooms
        }
        if let bedType = savedRecord.bedType { data["bedType"] = bedType.rawValue }
        if let budget = savedRecord.budget { data["budget"] = ["amountMinor": budget.amountMinor, "currency": budget.currency, "basis": budget.basis.rawValue] }
        if let selection = savedRecord.selected { data["tentativeHotelName"] = selection.hotelName }
        data["candidateHotelNames"] = savedRecord.candidateChoices.map(\.hotelName)
        guard let bytes = try? JSONSerialization.data(withJSONObject: data, options: [.prettyPrinted, .sortedKeys]),
              let text = String(data: bytes, encoding: .utf8) else {
            localNotice = self.text("Could not prepare export.", "未能准备导出。")
            return
        }
        exportText = text
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
        guard current, !busy, let anchorPlace, let firstPlace = routeOrigin(1),
              let secondPlace = routeOrigin(2), firstPlace.id != secondPlace.id else { return }
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

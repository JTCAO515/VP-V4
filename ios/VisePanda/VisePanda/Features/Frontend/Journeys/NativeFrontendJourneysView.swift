import SwiftUI

/// One shared presentation state supplied by Main. No domain store or transport.
@MainActor
struct NativeFrontendJourneysView: View {
    @Environment(\.locale) private var locale
    private var copy: NativeLibraryMemoryCopy { .init(locale: locale) }
    let state: NativeFrontendState
    @State private var showingJourney = false
    @State private var lastOpenedJourneyID: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(copy("我的旅程", "My journeys")).font(.largeTitle.bold())
                    Text(copy("把安排放在一起，给途中留一点余地。", "Keep your plans together, with room to enjoy the journey."))
                        .font(.subheadline).foregroundStyle(.secondary)
                    NativeFrontendBoundary()
                }
                if state.screenState == .ready {
                    if state.journeys.isEmpty {
                        ContentUnavailableView {
                            Label(copy("从一个想法开始", "Start with an idea"), systemImage: "suitcase.rolling")
                        } description: {
                            Text(copy("这里还没有旅程。向 VP 说说你的旅行想法。", "No journeys yet. Tell VP about your travel ideas."))
                        } actions: {
                            Button(copy("和 VP 聊聊", "Chat with VP")) { state.openChat() }
                        }
                    } else {
                        ForEach(state.journeys) { journey in
                            Button {
                                lastOpenedJourneyID = journey.id
                                state.selectedJourneyID = journey.id
                                showingJourney = true
                            } label: {
                                journeyCard(journey)
                            }.buttonStyle(.plain)
                                .accessibilityIdentifier("frontend.journey." + journey.id)
                        }
                        Button {
                            state.openChat()
                        } label: {
                            Label(copy("聊聊下一段旅程", "Talk about your next journey"), systemImage: "plus.bubble")
                                .frame(maxWidth: .infinity).padding(.vertical, 10)
                        }.buttonStyle(.bordered)
                    }
                } else {
                    NativeFrontendStatePanel(state: state)
                }
            }.padding(20)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle(copy("旅程", "Journeys")).navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { screenStates }
        }
        .navigationDestination(isPresented: $showingJourney) {
            if let id = state.selectedJourneyID {
                NativeFrontendJourneyDetail(state: state, journeyID: id)
            } else {
                ContentUnavailableView(copy("旅程未选定", "No journey selected"), systemImage: "suitcase", description: Text(copy("请返回列表选择一个旅程。", "Return to the list and choose a journey.")))
            }
        }
        .onAppear { followSelection() }
        .onChange(of: state.selectedJourneyID) { _, value in
            if value == nil { showingJourney = false; lastOpenedJourneyID = nil }
            else { followSelection() }
        }
        .onChange(of: showingJourney) { _, visible in
            if !visible { lastOpenedJourneyID = nil; state.selectedJourneyID = nil }
        }
        .onChange(of: state.screenState) { _, value in
            if value != .ready { showingJourney = false }
        }
    }

    private func followSelection() {
        guard state.screenState == .ready, let id = state.selectedJourneyID,
              state.journeys.contains(where: { $0.id == id }), lastOpenedJourneyID != id else { return }
        lastOpenedJourneyID = id
        showingJourney = true
    }
    private var screenStates: some View {
        Menu {
            ForEach(NativeFrontendScreenState.allCases) { value in
                Button(screenStateTitle(value)) { state.screenState = value }
            }
        } label: {
            Image(systemName: "ellipsis.circle")
        }.accessibilityLabel(copy("查看页面状态样例", "View sample page states"))
    }
    private func screenStateTitle(_ value: NativeFrontendScreenState) -> String {
        switch value {
        case .ready: copy("正常", "Ready")
        case .empty: copy("空白", "Empty")
        case .loading: copy("加载中", "Loading")
        case .failed: copy("失败", "Failed")
        case .cancelled: copy("取消", "Cancelled")
        }
    }
    private func journeyCard(_ journey: NativeFrontendJourney) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Image(systemName: "suitcase.rolling.fill").font(.title2).foregroundStyle(.blue)
                Spacer()
                Text(journey.confirmed ? copy("已确认 · 样例", "Confirmed · Sample") : copy("待确认 · 样例", "Needs confirmation · Sample"))
                    .font(.caption.weight(.medium)).padding(.horizontal, 10).padding(.vertical, 6)
                    .background(.blue.opacity(0.08), in: Capsule())
            }
            Text(journey.title).font(.title2.bold()).foregroundStyle(.primary)
            Text(journey.subtitle).font(.subheadline).foregroundStyle(.secondary)
            HStack {
                Label(copy("\(journey.days.count) 天 · 按顺序查看", "\(journey.days.count) days · View in order"), systemImage: "calendar")
                Spacer()
                Image(systemName: "arrow.right")
            }.font(.subheadline).foregroundStyle(.secondary)
        }.journeySurface()
    }
}

@MainActor
private struct NativeFrontendJourneyDetail: View {
    @Environment(\.locale) private var locale
    private var copy: NativeLibraryMemoryCopy { .init(locale: locale) }
    let state: NativeFrontendState
    let journeyID: String
    @State private var showExplanation = false
    private var journey: NativeFrontendJourney? { state.journeys.first { $0.id == journeyID } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                NativeFrontendBoundary()
                if state.screenState != .ready {
                    NativeFrontendStatePanel(state: state)
                } else if let journey {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(journey.title).font(.largeTitle.bold())
                        Text(journey.subtitle).foregroundStyle(.secondary)
                        Label(journey.confirmed ? copy("安排已确认 · 本地样例", "Plan confirmed · Local sample") : copy("安排待确认 · 本地样例", "Plan needs confirmation · Local sample"),
                              systemImage: journey.confirmed ? "checkmark.circle" : "clock")
                            .font(.subheadline).foregroundStyle(.blue)
                        Text(copy("确认的是样例安排，不代表路线已核实或服务已预订。", "Confirmation applies to this sample plan. Routes are unverified and no services are booked."))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Button { showExplanation = true } label: {
                        NativeFrontendJourneySketch()
                    }.buttonStyle(.plain).accessibilityLabel(copy("查看本地地图示意说明", "About this local map illustration"))
                    HStack {
                        Text(copy("每天的安排", "Day by day")).font(.title3.bold())
                        Spacer()
                        Text(copy("相对日序", "Relative day order")).font(.caption).foregroundStyle(.secondary)
                    }
                    ForEach(Array(journey.days.enumerated()), id: \.offset) { index, title in
                        NavigationLink {
                            NativeFrontendJourneyDay(state: state, journeyID: journeyID, dayIndex: index)
                        } label: {
                            HStack(alignment: .top, spacing: 14) {
                                Text("\(index + 1)").font(.title3.bold()).foregroundStyle(.blue)
                                    .frame(width: 38, height: 38).background(.blue.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(title).font(.headline).foregroundStyle(.primary)
                                    Text(index == 0 ? copy("先看当天重点，再核对地点与衔接。", "Review the focus, then check places and connections.") : copy("留出休息，再决定下一步。", "Leave room to rest, then choose your next step."))
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer(minLength: 0)
                                Image(systemName: "chevron.right").foregroundStyle(.secondary)
                            }.journeySurface()
                        }.buttonStyle(.plain).accessibilityIdentifier("frontend.journey.day.\(index)")
                    }
                    if journey.days.isEmpty {
                        Text(copy("这个旅程还没有日期安排。可以向 VP 说明想补充的内容。", "This journey has no days yet. Tell VP what you would like to add."))
                            .foregroundStyle(.secondary)
                    }
                    Button { state.openChat(context: journeyID) } label: {
                        Label(copy("和 VP 讨论这段旅程", "Discuss this journey with VP"), systemImage: "bubble.left.and.bubble.right")
                            .frame(maxWidth: .infinity)
                    }.buttonStyle(.borderedProminent)
                        .accessibilityIdentifier("frontend.journey.chat")
                    Button { state.openMaterial("sample-plan") } label: {
                        Label(copy("查看安排资料", "View plan material"), systemImage: "doc.text").frame(maxWidth: .infinity)
                    }.buttonStyle(.bordered)
                        .accessibilityIdentifier("frontend.journey.material")
                } else {
                    ContentUnavailableView(copy("这个旅程已不在样例中", "This journey is no longer in the sample"), systemImage: "suitcase", description: Text(copy("返回列表重新选择；不会打开其他旅程代替。", "Return to the list and choose again. No other journey will be substituted.")))
                }
            }.padding(20)
        }.background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle(copy("旅程概览", "Journey overview")).navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $showExplanation) {
                NativeFrontendJourneyExplanation()
            }
    }
}

private struct NativeFrontendJourneySketch: View {
    @Environment(\.locale) private var locale
    private var copy: NativeLibraryMemoryCopy { .init(locale: locale) }
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Label(copy("地点分布", "Place layout"), systemImage: "map").font(.headline)
                Spacer()
                Text(copy("本地示意", "Local illustration")).font(.caption).foregroundStyle(.secondary)
            }
            HStack(spacing: 8) {
                marker("城市漫步", icon: "building.2")
                Image(systemName: "ellipsis").foregroundStyle(.secondary)
                marker("江景", icon: "water.waves")
                Image(systemName: "ellipsis").foregroundStyle(.secondary)
                marker("休息", icon: "cup.and.saucer")
            }
            Text(copy("不是实际地图 · 无真实坐标、距离或导航", "Illustration only · No real coordinates, distances or navigation"))
                .font(.caption).foregroundStyle(.secondary)
        }.journeySurface()
    }
    private func marker(_ title: String, icon: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon).font(.title2).foregroundStyle(.blue)
            Text(title).font(.caption).multilineTextAlignment(.center)
        }.frame(maxWidth: .infinity).padding(.vertical, 12)
            .background(.blue.opacity(0.05), in: RoundedRectangle(cornerRadius: 14))
    }
}

private struct NativeFrontendJourneyExplanation: View {
    @Environment(\.locale) private var locale
    private var copy: NativeLibraryMemoryCopy { .init(locale: locale) }
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            NativeFrontendBoundary()
            Text(copy("先看关系，再核对路线", "See the connections, then check the route")).font(.title2.bold())
            Text(copy("三个标记只帮助理解样例安排的顺序，位置与连线没有地理含义。真实地点、准确入口、出发时间和路线供应商尚未连接。", "These three markers illustrate the sample order. Their positions and connections are not geographic. Real places, exact entrances, departure times and route providers are not connected."))
            Text(copy("不会请求定位、上传位置或产生地图供应商费用。", "No location access, location upload or map provider charge."))
                .font(.subheadline).foregroundStyle(.secondary)
            Button(copy("知道了，返回旅程", "Got it, back to the journey")) { dismiss() }.buttonStyle(.borderedProminent)
        }.padding(24).presentationDetents([.medium, .large])
    }
}

@MainActor
private struct NativeFrontendJourneyDay: View {
    @Environment(\.locale) private var locale
    private var copy: NativeLibraryMemoryCopy { .init(locale: locale) }
    let state: NativeFrontendState
    let journeyID: String
    let dayIndex: Int
    @State private var checked: Set<String> = []
    @State private var showBookingState = false
    private var journey: NativeFrontendJourney? { state.journeys.first { $0.id == journeyID } }
    private var dayTitle: String? {
        guard let journey, journey.days.indices.contains(dayIndex) else { return nil }
        return journey.days[dayIndex]
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                NativeFrontendBoundary()
                if state.screenState != .ready {
                    NativeFrontendStatePanel(state: state)
                } else if let dayTitle {
                    Text(dayTitle).font(.largeTitle.bold())
                    VStack(alignment: .leading, spacing: 8) {
                        Label(copy("当天重点", "Day focus"), systemImage: "sun.max").font(.headline)
                        Text(dayIndex == 0 ? "一段城市漫步，一次江景停留；留时间确认入口与休息。" : "慢一点看街区，给休息留出空间。")
                        Text(copy("按第 \(dayIndex + 1) 天呈现；真实日期、地点和营业时间未核实。", "Shown as day \(dayIndex + 1). Actual dates, places and opening hours are unverified."))
                            .font(.caption).foregroundStyle(.secondary)
                    }.journeySurface()
                    VStack(alignment: .leading, spacing: 14) {
                        Text(copy("安排顺序 · 样例", "Plan order · Sample")).font(.headline)
                        Label(copy("先确认地点", "First, check the place"), systemImage: "1.circle")
                        #if DEBUG
                        NavigationLink {
                            NativePlaceActionsSampleExperience()
                                .navigationTitle(copy("地点操作样例", "Place actions · Sample")).navigationBarTitleDisplayMode(.inline)
                        } label: {
                            Label(copy("查看地点与候选操作", "View place and candidate actions"), systemImage: "mappin.and.ellipse")
                        }.accessibilityIdentifier("frontend.journey.place")
                        #else
                        Text(copy("地点操作样例仅在本地调试体验中开放。", "The place actions sample is available only in the local debug experience."))
                            .font(.caption).foregroundStyle(.secondary)
                        #endif
                        Divider()
                        Label(copy("再核对出行衔接", "Then check the connection"), systemImage: "2.circle")
                        NavigationLink {
                            NativeFrontendJourneyRoute()
                        } label: {
                            Label(copy("查看步行、公交、驾车说明", "About walking, transit and driving"), systemImage: "arrow.triangle.turn.up.right.diamond")
                        }.accessibilityIdentifier("frontend.journey.route")
                        Divider()
                        Label(copy("留出休息与缓冲", "Leave room for rest and buffers"), systemImage: "3.circle")
                        Text(copy("不预填具体时间、费用或可行结论。", "No assumed times, prices or feasibility conclusions."))
                            .font(.caption).foregroundStyle(.secondary)
                    }.journeySurface()
                    VStack(alignment: .leading, spacing: 12) {
                        Text(copy("状态说明", "About the status")).font(.headline)
                        Label(journey?.confirmed == true ? copy("已确认 · 安排样例", "Confirmed · Plan sample") : copy("待确认 · 安排样例", "Needs confirmation · Plan sample"), systemImage: journey?.confirmed == true ? "checkmark.circle" : "clock")
                        Text(copy("这是同一旅程的本地确认状态；真实 Trip 未改变。", "This is the same journey's local confirmation state. No real Trip changed."))
                            .font(.caption).foregroundStyle(.secondary)
                        Button(copy("查看已预订状态样例", "View booked status sample")) { showBookingState = true }
                        Text(copy("当前没有真实预订。", "There are no real bookings."))
                            .font(.caption).foregroundStyle(.secondary)
                    }.journeySurface()
                    VStack(alignment: .leading, spacing: 12) {
                        Text(copy("出发前的小清单", "Before you go")).font(.headline)
                        checklist(copy("核对准确入口", "Check the exact entrance"), key: "entrance")
                        checklist(copy("核对营业与预约要求", "Check opening hours and reservations"), key: "opening")
                        checklist(copy("为休息留出时间", "Leave time to rest"), key: "rest")
                        Text(copy("勾选仅记录本页样例阅读，不表示已核实、购买或预订；离开样例不会保存。", "Checks record only this page's sample interaction. They do not verify, buy or book anything and are not saved when you leave."))
                            .font(.caption).foregroundStyle(.secondary)
                    }.journeySurface()
                    Button(copy("向 VP 提出调整", "Ask VP for an adjustment")) { state.openChat(context: journeyID) }
                        .buttonStyle(.borderedProminent).frame(maxWidth: .infinity)
                } else {
                    ContentUnavailableView(copy("这一天已不可读", "This day is unavailable"), systemImage: "calendar.badge.exclamationmark", description: Text(copy("请返回同一旅程重新选择，不会借用别的旅程安排。", "Return to the same journey and choose again. No other journey's plan will be used.")))
                }
            }.padding(20)
        }.background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle(copy("第 \(dayIndex + 1) 天", "Day \(dayIndex + 1)")).navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $showBookingState) { NativeFrontendBookingStateSample() }
    }
    private func checklist(_ title: String, key: String) -> some View {
        let scopedKey = journeyID + ":" + String(dayIndex) + ":" + key
        return Toggle(title, isOn: Binding(
            get: { checked.contains(scopedKey) },
            set: { value in if value { checked.insert(scopedKey) } else { checked.remove(scopedKey) } }
        )).tint(.blue)
    }
}

private struct NativeFrontendBookingStateSample: View {
    @Environment(\.locale) private var locale
    private var copy: NativeLibraryMemoryCopy { .init(locale: locale) }
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            NativeFrontendBoundary()
            Label(copy("已预订 · 状态样例", "Booked · Status sample"), systemImage: "ticket").font(.title2.bold())
            Text(copy("这里只展示预订状态的样式，没有订单、供应商、支付或预订行为。", "This illustrates a booking status only. There is no order, provider, payment or booking."))
            Text(copy("真实服务是否预订，应以获准供应商的订单与核对结果为准。", "Check the authorized provider's order and confirmation for any real booking."))
                .foregroundStyle(.secondary)
            Button(copy("返回当天安排", "Back to the day plan")) { dismiss() }.buttonStyle(.borderedProminent)
        }.padding(24).presentationDetents([.medium, .large])
    }
}

private struct NativeFrontendJourneyRoute: View {
    @Environment(\.locale) private var locale
    private var copy: NativeLibraryMemoryCopy { .init(locale: locale) }
    @State private var mode = "步行"
    private let modes = ["步行", "公交", "驾车"]
    private func modeTitle(_ value: String) -> String {
        switch value {
        case "步行": copy("步行", "Walking")
        case "公交": copy("公交", "Transit")
        case "驾车": copy("驾车", "Driving")
        default: value
        }
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                NativeFrontendBoundary()
                Text(copy("怎样衔接下一站", "Connect to the next stop")).font(.largeTitle.bold())
                Text(copy("先明确方式，再核对真实起终点。", "Choose a mode, then check the real endpoints."))
                    .foregroundStyle(.secondary)
                Picker(copy("出行方式说明", "About travel modes"), selection: $mode) {
                    ForEach(modes, id: \.self) { Text(modeTitle($0)).tag($0) }
                }.pickerStyle(.segmented)
                VStack(alignment: .leading, spacing: 12) {
                    Label(modeTitle(mode) + copy(" · 待核", " · Pending"), systemImage: mode == "步行" ? "figure.walk" : mode == "公交" ? "bus" : "car")
                        .font(.title3.bold())
                    Text(mode == "步行" ? copy("入口、步行距离、台阶与无障碍条件未核实。", "Entrances, walking distances, steps and accessibility are unverified.") : mode == "公交" ? copy("站点、换乘、票价与时刻未核实；规划不代表实时到站。", "Stops, transfers, fares and schedules are unverified. Planning does not establish real-time arrivals.") : copy("道路、拥堵、停车与费用未核实；规划不代表已叫车。", "Roads, traffic, parking and costs are unverified. Planning does not book a ride."))
                    Text(copy("耗时、距离、价格：未知。没有调用路线供应商。", "Duration, distance and price: unknown. No route provider was called."))
                        .font(.caption).foregroundStyle(.secondary)
                }.journeySurface()
                VStack(alignment: .leading, spacing: 12) {
                    Text(copy("实际查询前需要", "Before a real query")).font(.headline)
                    Label(copy("准确起点、终点与入口", "Exact endpoints and entrances"), systemImage: "mappin")
                    Label(copy("出发日期、时间与方式", "Departure date, time and mode"), systemImage: "clock")
                    Label(copy("供应商用途、费用和明确同意", "Provider purpose, charges and explicit consent"), systemImage: "checkmark.shield")
                    Text(copy("当前路况不能保证未来行程。开放、预约、停留与缓冲未齐时，仍保留待核。", "Current traffic does not guarantee a future journey. Opening hours, reservations, stay and buffers remain pending without supporting details."))
                        .font(.caption).foregroundStyle(.secondary)
                }.journeySurface()
            }.padding(20)
        }.background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle(copy("路线说明", "About the route")).navigationBarTitleDisplayMode(.inline)
    }
}

private extension View {
    func journeySurface() -> some View {
        padding(18).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20))
    }
}

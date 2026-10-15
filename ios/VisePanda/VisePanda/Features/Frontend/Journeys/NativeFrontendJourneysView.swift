import SwiftUI

/// One shared presentation state supplied by Main. No domain store or transport.
@MainActor
struct NativeFrontendJourneysView: View {
    let state: NativeFrontendState
    @State private var showingJourney = false
    @State private var lastOpenedJourneyID: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("我的旅程").font(.largeTitle.bold())
                    Text("把安排放在一起，给途中留一点余地。")
                        .font(.subheadline).foregroundStyle(.secondary)
                    NativeFrontendBoundary()
                }
                if state.screenState == .ready {
                    if state.journeys.isEmpty {
                        ContentUnavailableView {
                            Label("从一个想法开始", systemImage: "suitcase.rolling")
                        } description: {
                            Text("这里还没有旅程。向 VP 说说你的旅行想法。")
                        } actions: {
                            Button("和 VP 聊聊") { state.openChat() }
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
                            Label("聊聊下一段旅程", systemImage: "plus.bubble")
                                .frame(maxWidth: .infinity).padding(.vertical, 10)
                        }.buttonStyle(.bordered)
                    }
                } else {
                    NativeFrontendStatePanel(state: state)
                }
            }.padding(20)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("旅程").navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { screenStates }
        }
        .navigationDestination(isPresented: $showingJourney) {
            if let id = state.selectedJourneyID {
                NativeFrontendJourneyDetail(state: state, journeyID: id)
            } else {
                ContentUnavailableView("旅程未选定", systemImage: "suitcase", description: Text("请返回列表选择一个旅程。"))
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
                Button(value.title) { state.screenState = value }
            }
        } label: {
            Image(systemName: "ellipsis.circle")
        }.accessibilityLabel("查看页面状态样例")
    }
    private func journeyCard(_ journey: NativeFrontendJourney) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Image(systemName: "suitcase.rolling.fill").font(.title2).foregroundStyle(.blue)
                Spacer()
                Text(journey.confirmed ? "已确认 · 样例" : "待确认 · 样例")
                    .font(.caption.weight(.medium)).padding(.horizontal, 10).padding(.vertical, 6)
                    .background(.blue.opacity(0.08), in: Capsule())
            }
            Text(journey.title).font(.title2.bold()).foregroundStyle(.primary)
            Text(journey.subtitle).font(.subheadline).foregroundStyle(.secondary)
            HStack {
                Label("\(journey.days.count) 天 · 按顺序查看", systemImage: "calendar")
                Spacer()
                Image(systemName: "arrow.right")
            }.font(.subheadline).foregroundStyle(.secondary)
        }.journeySurface()
    }
}

@MainActor
private struct NativeFrontendJourneyDetail: View {
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
                        Label(journey.confirmed ? "安排已确认 · 本地样例" : "安排待确认 · 本地样例",
                              systemImage: journey.confirmed ? "checkmark.circle" : "clock")
                            .font(.subheadline).foregroundStyle(.blue)
                        Text("确认的是样例安排，不代表路线已核实或服务已预订。")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Button { showExplanation = true } label: {
                        NativeFrontendJourneySketch()
                    }.buttonStyle(.plain).accessibilityLabel("查看本地地图示意说明")
                    HStack {
                        Text("每天的安排").font(.title3.bold())
                        Spacer()
                        Text("相对日序").font(.caption).foregroundStyle(.secondary)
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
                                    Text(index == 0 ? "先看当天重点，再核对地点与衔接。" : "留出休息，再决定下一步。")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer(minLength: 0)
                                Image(systemName: "chevron.right").foregroundStyle(.secondary)
                            }.journeySurface()
                        }.buttonStyle(.plain).accessibilityIdentifier("frontend.journey.day.\(index)")
                    }
                    if journey.days.isEmpty {
                        Text("这个旅程还没有日期安排。可以向 VP 说明想补充的内容。")
                            .foregroundStyle(.secondary)
                    }
                    Button { state.openChat(context: journeyID) } label: {
                        Label("和 VP 讨论这段旅程", systemImage: "bubble.left.and.bubble.right")
                            .frame(maxWidth: .infinity)
                    }.buttonStyle(.borderedProminent)
                        .accessibilityIdentifier("frontend.journey.chat")
                    Button { state.openMaterial("sample-plan") } label: {
                        Label("查看安排资料", systemImage: "doc.text").frame(maxWidth: .infinity)
                    }.buttonStyle(.bordered)
                        .accessibilityIdentifier("frontend.journey.material")
                } else {
                    ContentUnavailableView("这个旅程已不在样例中", systemImage: "suitcase", description: Text("返回列表重新选择；不会打开其他旅程代替。"))
                }
            }.padding(20)
        }.background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("旅程概览").navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $showExplanation) {
                NativeFrontendJourneyExplanation()
            }
    }
}

private struct NativeFrontendJourneySketch: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Label("地点分布", systemImage: "map").font(.headline)
                Spacer()
                Text("本地示意").font(.caption).foregroundStyle(.secondary)
            }
            HStack(spacing: 8) {
                marker("城市漫步", icon: "building.2")
                Image(systemName: "ellipsis").foregroundStyle(.secondary)
                marker("江景", icon: "water.waves")
                Image(systemName: "ellipsis").foregroundStyle(.secondary)
                marker("休息", icon: "cup.and.saucer")
            }
            Text("不是实际地图 · 无真实坐标、距离或导航")
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
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            NativeFrontendBoundary()
            Text("先看关系，再核对路线").font(.title2.bold())
            Text("三个标记只帮助理解样例安排的顺序，位置与连线没有地理含义。真实地点、准确入口、出发时间和路线供应商尚未连接。")
            Text("不会请求定位、上传位置或产生地图供应商费用。")
                .font(.subheadline).foregroundStyle(.secondary)
            Button("知道了，返回旅程") { dismiss() }.buttonStyle(.borderedProminent)
        }.padding(24).presentationDetents([.medium, .large])
    }
}

@MainActor
private struct NativeFrontendJourneyDay: View {
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
                        Label("当天重点", systemImage: "sun.max").font(.headline)
                        Text(dayIndex == 0 ? "一段城市漫步，一次江景停留；留时间确认入口与休息。" : "慢一点看街区，给休息留出空间。")
                        Text("按第 \(dayIndex + 1) 天呈现；真实日期、地点和营业时间未核实。")
                            .font(.caption).foregroundStyle(.secondary)
                    }.journeySurface()
                    VStack(alignment: .leading, spacing: 14) {
                        Text("安排顺序 · 样例").font(.headline)
                        Label("先确认地点", systemImage: "1.circle")
                        #if DEBUG
                        NavigationLink {
                            NativePlaceActionsSampleExperience()
                                .navigationTitle("地点操作样例").navigationBarTitleDisplayMode(.inline)
                        } label: {
                            Label("查看地点与候选操作", systemImage: "mappin.and.ellipse")
                        }.accessibilityIdentifier("frontend.journey.place")
                        #else
                        Text("地点操作样例仅在本地调试体验中开放。")
                            .font(.caption).foregroundStyle(.secondary)
                        #endif
                        Divider()
                        Label("再核对出行衔接", systemImage: "2.circle")
                        NavigationLink {
                            NativeFrontendJourneyRoute()
                        } label: {
                            Label("查看步行、公交、驾车说明", systemImage: "arrow.triangle.turn.up.right.diamond")
                        }.accessibilityIdentifier("frontend.journey.route")
                        Divider()
                        Label("留出休息与缓冲", systemImage: "3.circle")
                        Text("不预填具体时间、费用或可行结论。")
                            .font(.caption).foregroundStyle(.secondary)
                    }.journeySurface()
                    VStack(alignment: .leading, spacing: 12) {
                        Text("状态说明").font(.headline)
                        Label(journey?.confirmed == true ? "已确认 · 安排样例" : "待确认 · 安排样例", systemImage: journey?.confirmed == true ? "checkmark.circle" : "clock")
                        Text("这是同一旅程的本地确认状态；真实 Trip 未改变。")
                            .font(.caption).foregroundStyle(.secondary)
                        Button("查看已预订状态样例") { showBookingState = true }
                        Text("当前没有真实预订。")
                            .font(.caption).foregroundStyle(.secondary)
                    }.journeySurface()
                    VStack(alignment: .leading, spacing: 12) {
                        Text("出发前的小清单").font(.headline)
                        checklist("核对准确入口", key: "entrance")
                        checklist("核对营业与预约要求", key: "opening")
                        checklist("为休息留出时间", key: "rest")
                        Text("勾选仅记录本页样例阅读，不表示已核实、购买或预订；离开样例不会保存。")
                            .font(.caption).foregroundStyle(.secondary)
                    }.journeySurface()
                    Button("向 VP 提出调整") { state.openChat(context: journeyID) }
                        .buttonStyle(.borderedProminent).frame(maxWidth: .infinity)
                } else {
                    ContentUnavailableView("这一天已不可读", systemImage: "calendar.badge.exclamationmark", description: Text("请返回同一旅程重新选择，不会借用别的旅程安排。"))
                }
            }.padding(20)
        }.background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("第 \(dayIndex + 1) 天").navigationBarTitleDisplayMode(.inline)
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
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            NativeFrontendBoundary()
            Label("已预订 · 状态样例", systemImage: "ticket").font(.title2.bold())
            Text("这里只展示预订状态的样式，没有订单、供应商、支付或预订行为。")
            Text("真实服务是否预订，应以获准供应商的订单与核对结果为准。")
                .foregroundStyle(.secondary)
            Button("返回当天安排") { dismiss() }.buttonStyle(.borderedProminent)
        }.padding(24).presentationDetents([.medium, .large])
    }
}

private struct NativeFrontendJourneyRoute: View {
    @State private var mode = "步行"
    private let modes = ["步行", "公交", "驾车"]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                NativeFrontendBoundary()
                Text("怎样衔接下一站").font(.largeTitle.bold())
                Text("先明确方式，再核对真实起终点。")
                    .foregroundStyle(.secondary)
                Picker("出行方式说明", selection: $mode) {
                    ForEach(modes, id: \.self) { Text($0).tag($0) }
                }.pickerStyle(.segmented)
                VStack(alignment: .leading, spacing: 12) {
                    Label(mode + " · 待核", systemImage: mode == "步行" ? "figure.walk" : mode == "公交" ? "bus" : "car")
                        .font(.title3.bold())
                    Text(mode == "步行" ? "入口、步行距离、台阶与无障碍条件未核实。" : mode == "公交" ? "站点、换乘、票价与时刻未核实；规划不代表实时到站。" : "道路、拥堵、停车与费用未核实；规划不代表已叫车。")
                    Text("耗时、距离、价格：未知。没有调用路线供应商。")
                        .font(.caption).foregroundStyle(.secondary)
                }.journeySurface()
                VStack(alignment: .leading, spacing: 12) {
                    Text("实际查询前需要").font(.headline)
                    Label("准确起点、终点与入口", systemImage: "mappin")
                    Label("出发日期、时间与方式", systemImage: "clock")
                    Label("供应商用途、费用和明确同意", systemImage: "checkmark.shield")
                    Text("当前路况不能保证未来行程。开放、预约、停留与缓冲未齐时，仍保留待核。")
                        .font(.caption).foregroundStyle(.secondary)
                }.journeySurface()
            }.padding(20)
        }.background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("路线说明").navigationBarTitleDisplayMode(.inline)
    }
}

private extension View {
    func journeySurface() -> some View {
        padding(18).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20))
    }
}

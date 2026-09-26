import SwiftUI

// VPJ-77 is an explicitly local interaction specimen. These values are presentation
// examples, never authoritative conversation, task, artifact or memory records.
enum AssistantSpecimenTab: String, CaseIterable, Identifiable {
    case vp, journeys, library, memory
    var id: String { rawValue }
    var symbol: String {
        switch self {
        case .vp: "sparkles"
        case .journeys: "map"
        case .library: "square.stack"
        case .memory: "heart.text.square"
        }
    }
}

enum AssistantSpecimenMoment: Int {
    case first, direction, delegated, returned
}

enum AssistantSpecimenDetail: String, Identifiable {
    case comparison, draft, task, artifact, memory, states
    var id: String { rawValue }
}

@MainActor
struct AssistantSpecimenView: View {
    @Environment(AppSettings.self) private var settings
    @State private var selectedTab: AssistantSpecimenTab = .vp
    @State private var moment: AssistantSpecimenMoment = .first
    @State private var detail: AssistantSpecimenDetail?
    @State private var showingSearch = false
    @State private var openSearchArtifact = false
    @State private var correction = ""
    @State private var corrected = false
    @State private var draftInput = ""
    @FocusState private var inputFocused: Bool
    @FocusState private var memoryFocused: Bool

    private var zh: Bool { settings.selectedLocale == .zh }
    private func t(_ chinese: String, _ english: String) -> String { zh ? chinese : english }

    var body: some View {
        TabView(selection: $selectedTab) {
            ForEach(AssistantSpecimenTab.allCases) { tab in
                NavigationStack {
                    ScrollView {
                        VStack(alignment: .leading, spacing: VPSpacing.section) {
                            banner
                            switch tab {
                            case .vp: vpContent
                            case .journeys: journeysContent
                            case .library: libraryContent
                            case .memory: memoryContent
                            }
                        }
                        .frame(maxWidth: 680, alignment: .leading)
                        .frame(maxWidth: .infinity)
                        .padding(VPSpacing.standard)
                    }
                    .background(Color.vpBackground)
                    .scrollDismissesKeyboard(.interactively)
                    .navigationTitle(title(tab))
                    .toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button { showingSearch = true } label: {
                                Label(t("搜索", "Search"), systemImage: "magnifyingglass")
                            }
                            .accessibilityIdentifier("specimen.search.open")
                        }
                        ToolbarItemGroup(placement: .keyboard) {
                            Spacer()
                            Button(t("完成", "Done")) {
                                inputFocused = false
                                memoryFocused = false
                            }
                        }
                    }
                }
                .tabItem { Label(title(tab), systemImage: tab.symbol) }
                .tag(tab)
            }
        }
        .accessibilityIdentifier("specimen.tabs")
        .sheet(item: $detail) { item in detailSheet(item) }
        .sheet(isPresented: $showingSearch, onDismiss: {
            if openSearchArtifact {
                openSearchArtifact = false
                detail = .artifact
            }
        }) { searchSheet }
    }

    private func title(_ tab: AssistantSpecimenTab) -> String {
        switch tab {
        case .vp: "VP"
        case .journeys: t("旅程", "Journeys")
        case .library: t("资源库", "Library")
        case .memory: "Memory"
        }
    }

    private var banner: some View {
        Text(t("FIXTURE · 离线样例 · 不会保存", "FIXTURE · Offline example · No save"))
            .font(.caption.weight(.bold))
            .foregroundStyle(Color.vpBrand)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Color.vpLavender.opacity(0.22), in: RoundedRectangle(cornerRadius: 12))
            .accessibilityIdentifier("specimen.fixture-banner")
    }

    private var vpContent: some View {
        VStack(alignment: .leading, spacing: VPSpacing.section) {
            HStack(spacing: 12) {
                Image("PandaMark").resizable().scaledToFit().frame(width: 52, height: 52)
                    .accessibilityHidden(true)
                VStack(alignment: .leading) {
                    Text("VP").font(.title.bold())
                    Text(t("同一位旅途伙伴，陪你把决定做完。", "One travel companion, from idea to useful result."))
                        .foregroundStyle(Color.vpSecondaryText)
                }
            }
            if corrected {
                note(t("本地样例已改为：\(correction)。正式结果须等真实 Memory 回执与重新计算。",
                       "Local example changed to: \(correction). A real result needs a Memory receipt and recomputation."))
                    .accessibilityIdentifier("specimen.memory-impact")
            }
            switch moment {
            case .first:
                card(t("首次认识", "First encounter"), t("第一次去中国，十天，和伴侣一起。喜欢美食与摄影，不想太赶。", "First time in China, ten days with my partner. We love food and photography, but don't want to rush."))
                action(t("看看两种有取舍的方向", "Compare two directions"), id: "specimen.first.compare") { moment = .direction }
            case .direction:
                card(t("VP · 条件性方向", "VP · Conditional direction"), t("我先比较轻松的城市组合和更丰富的摄影路线。具体交通、开放时间和住宿仍待核实。你更在意少换城市，还是更多拍摄机会？", "Here are a calmer city split and a photo-rich alternative. Transport, opening hours and stays still need checking. Which matters more: fewer moves or more photo stops?"))
                action(t("打开比较", "Open comparison"), id: "specimen.comparison.open") { detail = .comparison }
                action(t("委托 VP 比较城市与住宿", "Delegate city and stay comparison"), id: "specimen.delegate") { moment = .delegated }
            case .delegated:
                card(t("委托已接受 · 样例", "Delegation accepted · example"), t("交付范围：比较城市停留与住宿区域。样例任务显示排队中；离开 App 不等于取消。此处没有后台工作。", "Deliverable: compare city split and stay areas. The example task is queued. Leaving the app does not cancel work. No background work runs here."))
                action(t("查看任务", "View task"), id: "specimen.task.open") { detail = .task }
                action(t("模拟回来查看结果", "Simulate return to result"), id: "specimen.return") { moment = .returned }
            case .returned:
                card(t("回来后 · 样例成果", "On return · example result"), t("同一份成果可从 VP、旅程和资源库打开。它是草稿，不是已确认行程或预订。", "The same result opens from VP, Journeys and Library. It is a draft, not a confirmed Trip or booking."))
                action(t("打开成果 r1", "Open result r1"), id: "specimen.artifact.open") { detail = .artifact }
                action(t("纠正 Memory", "Correct Memory"), id: "specimen.memory.goto") { selectedTab = .memory }
            }
            VStack(alignment: .leading, spacing: 8) {
                TextField(t("可试键盘；文字不会发送", "Try the keyboard; text is not sent"), text: $draftInput, axis: .vertical)
                    .lineLimit(1...3)
                    .focused($inputFocused)
                    .accessibilityIdentifier("specimen.composer")
                Text(t("仅交互样例；请用上方按钮走预设路径。", "Interaction specimen only. Use the scripted actions above."))
                    .font(.caption).foregroundStyle(Color.vpSecondaryText)
            }
            .padding(14)
            .background(Color.vpSurface, in: RoundedRectangle(cornerRadius: 16))
            action(t("查看其他可见状态", "Inspect other visible states"), id: "specimen.states.open") { detail = .states }
        }
    }

    private var journeysContent: some View {
        VStack(alignment: .leading, spacing: VPSpacing.section) {
            card(t("旅程意向 · 未定日期", "Journey idea · dates open"), t("十天、两人、美食与摄影、较慢节奏。尚未建立或修改正式 Trip。", "Ten days, two people, food and photography, calmer pace. No confirmed Trip has been created or changed."))
            if moment == .returned {
                action(t("打开同一成果 · fixture-artifact-1 r1", "Open same result · fixture-artifact-1 r1"), id: "specimen.journeys.artifact") { detail = .artifact }
            } else {
                note(t("成果尚未产生。可在 VP 继续样例。", "No result yet. Continue the example in VP."))
            }
            note(t("正式接线：已确认 Trip、Today、地图、提案 diff 与确认入口属于 Journeys；样例不执行这些操作。", "Live seam: confirmed Trip, Today, maps, proposal diff and confirmation belong here. This specimen performs none of them."))
        }
    }

    private var libraryContent: some View {
        VStack(alignment: .leading, spacing: VPSpacing.section) {
            card(t("工具与我的资料", "Tools and my materials"), t("正式接线保留翻译、地址、已上传资料及支持的工具；样例不提供虚假可用入口。", "Live seam retains translation, addresses, uploads and supported tools. This specimen offers no fake live action."))
            if moment == .returned {
                action(t("打开同一成果 · fixture-artifact-1 r1", "Open same result · fixture-artifact-1 r1"), id: "specimen.library.artifact") { detail = .artifact }
            } else {
                note(t("暂无样例成果。", "No example result yet."))
            }
        }
    }

    private var memoryContent: some View {
        VStack(alignment: .leading, spacing: VPSpacing.section) {
            card(t("VP 可以记住什么", "What VP can remember"), t("明确保存的长期偏好应显示来源、适用范围，并可纠正、暂停和忘记。这里仅演示纠正；没有写入账户。", "Explicit long-term preferences should show source and scope, with correction, pause and forget. This only demonstrates correction; nothing is saved to an account."))
            card(t("旅行节奏 · FIXTURE", "Travel pace · FIXTURE"), corrected ? correction : t("不想太赶", "Prefer a calmer pace"))
            Text(t("来源：样例首次输入 · 范围：本次样例；非长期记忆", "Source: example first input · Scope: this example; not long-term memory"))
                .font(.caption).foregroundStyle(Color.vpSecondaryText)
            TextField(t("改成你的意思", "Correct the wording"), text: $correction)
                .textFieldStyle(.roundedBorder)
                .focused($memoryFocused)
                .accessibilityIdentifier("specimen.memory.edit")
            action(t("仅在本地演示纠正", "Correct local example only"), id: "specimen.memory.correct") {
                corrected = true
                inputFocused = false
                memoryFocused = false
            }
            .disabled(correction.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            if corrected {
                note(t("本地样例已更新；真实保存、撤回和受影响任务重算尚未接线。", "Local example updated. Real save, undo and affected task recomputation are not connected."))
                    .accessibilityIdentifier("specimen.memory.corrected")
            }
            action(t("查看来源与接线", "View source and seam"), id: "specimen.memory.details") { detail = .memory }
        }
    }

    private func detailSheet(_ item: AssistantSpecimenDetail) -> some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: VPSpacing.standard) {
                    banner
                    switch item {
                    case .comparison:
                        card(t("方向 A · 少换城市", "Option A · fewer city changes"), t("更松弛；拍摄场景较集中。城市、交通和开放时间仍需核实。", "Calmer pace; a narrower photo range. Cities, transport and hours need checking."))
                        card(t("方向 B · 更多拍摄", "Option B · more photo stops"), t("题材更丰富；换乘与体力成本可能更高。", "More varied scenes; likely more transfers and effort."))
                        note(t("选择方向只影响样例草稿，不会创建 Trip 或预订。", "Selecting a direction only affects an example draft, not a Trip or booking."))
                    case .draft, .artifact:
                        card(t("fixture-artifact-1 · r1 · 草稿", "fixture-artifact-1 · r1 · draft"), t("城市停留与住宿区域比较。保留十天、两人、较慢节奏；变动是城市分配。具体地址、价格和可订性未知。", "City split and stay-area comparison. Keeps ten days, two people and calmer pace; changes the city split. Exact addresses, prices and availability are unknown."))
                        note(t("待确认：若要写入正式 Trip，必须先看准确提案与 diff，再确认相同版本。此样例无确认按钮。", "Pending confirmation: a real Trip change requires an exact proposal and diff, then confirmation of the same revision. No confirm action exists here."))
                    case .task:
                        card(t("fixture-task-1 · 排队中", "fixture-task-1 · queued"), t("交付：城市与住宿区域比较。无后台 worker、进度百分比或完成回执。", "Deliverable: city and stay-area comparison. No background worker, percentage or completion receipt."))
                    case .memory:
                        card(t("Memory 权威接线", "Memory authority seam"), t("长期旅行节奏应读现有 Profile 权威；其他明确事实读 Memory 权威。纠正须等版本化回执，撤回仅针对该操作。", "Stable travel pace reads Profile authority; other explicit facts read Memory authority. Correction requires a versioned receipt; undo targets that operation."))
                    case .states:
                        stateRow(t("短答案", "Short answer"), t("直接文字，不强制卡片", "Plain prose, no forced card"))
                        stateRow(t("比较 / 草稿", "Comparison / draft"), t("可打开结构内容；不等于 Trip", "Open structured content; not a Trip"))
                        stateRow(t("待确认", "Pending confirmation"), t("只去准确 diff；样例不可确认", "Exact diff only; no specimen confirm"))
                        stateRow(t("失败", "Failed"), t("显示原因与可重试范围", "Show reason and safe retry scope"))
                        stateRow(t("未知", "Unknown"), t("先核对权威状态，不宣称完成", "Reconcile authority before claiming success"))
                        stateRow(t("无更新", "No update"), t("明确无新结果，不制造活动", "No new result; no invented activity"))
                    }
                }
                .padding(VPSpacing.standard)
            }
            .background(Color.vpBackground)
            .navigationTitle(t("样例详情", "Example detail"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button(t("关闭", "Done")) { detail = nil } } }
        }
    }

    private var searchSheet: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: VPSpacing.section) {
                banner
                Image(systemName: "magnifyingglass").font(.largeTitle).foregroundStyle(Color.vpBrand)
                Text(t("发现值得探索的方向", "Discover a direction worth exploring")).font(.title2.bold())
                Text(t("全局搜索接线将区分有依据的外部内容与你有权限查看的私人结果。样例没有搜索索引或虚构地点结果。", "The global search seam separates qualified external content from private results you may access. This specimen has no search index or invented place results."))
                if moment == .returned {
                    action(t("打开同一成果 · fixture-artifact-1 r1", "Open same result · fixture-artifact-1 r1"), id: "specimen.search.artifact") {
                        openSearchArtifact = true
                        showingSearch = false
                    }
                }
                Spacer()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(VPSpacing.standard)
            .background(Color.vpBackground)
            .navigationTitle(t("全局搜索", "Global search"))
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button(t("关闭", "Done")) { showingSearch = false } } }
        }
    }

    private func card(_ heading: String, _ body: String) -> some View {
        VisePandaCard {
            VStack(alignment: .leading, spacing: 8) {
                Text(heading).font(.headline)
                Text(body).font(.body)
            }
        }
    }

    private func note(_ value: String) -> some View {
        Text(value).font(.footnote).foregroundStyle(Color.vpSecondaryText)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func stateRow(_ heading: String, _ body: String) -> some View { card(heading, body) }

    private func action(_ title: String, id: String, perform: @escaping () -> Void) -> some View {
        Button(action: perform) {
            HStack { Text(title); Spacer(); Image(systemName: "arrow.right") }
                .frame(minHeight: 44)
        }
        .buttonStyle(.bordered)
        .accessibilityIdentifier(id)
    }
}

#Preview("VPJ-77 fixture · Chinese") {
    AssistantSpecimenView().environment(AppSettings(selectedLocale: .zh))
}

#Preview("VPJ-77 fixture · English") {
    AssistantSpecimenView().environment(AppSettings(selectedLocale: .en))
}

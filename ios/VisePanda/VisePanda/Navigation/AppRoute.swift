import Observation
import SwiftUI

enum AppRoute: Hashable {
    case capability(CapabilityKind)
    case today
    case entry(AppEntry)
    case journeyTrip(NativeJourneyTripSelection)
}

@MainActor
@Observable
final class RouterPath {
    var path: [AppRoute] = []

    func navigate(to route: AppRoute) {
        path.append(route)
    }

    func reset() {
        path.removeAll()
    }
}

@MainActor
struct TabRootView: View {
    @Environment(\.locale) private var locale
    let tab: AppTab
    var isActive = true
    var onSearch: (() -> Void)?
    var onEntry: ((AppEntry) -> Void)?
    var assistantShell = false
    var onSwitchShell: (() -> Void)?
    var rootResetID: UUID?
    var goalEntry: Binding<NativeJourneyGoalEntry?> = .constant(nil)
    var onOpenGoal: ((NativeJourneyGoalEntry) -> Void)?
    var switchBlocked = false
    var onSwitchBlock: ((Bool) -> Void)?
    var onShowSamples: (() -> Void)? = nil
    var frontendState: NativeFrontendState? = nil
    var onShowAssistant: (() -> Void)? = nil
    @State private var router = RouterPath()
#if DEBUG
    @State private var frontendTool: NativeFrontendTool?
#endif

    var body: some View {
        @Bindable var router = router

        Group {
            if frontendState != nil {
                // Presentation routes are local to this tab and have no production AppRoute payload.
                NavigationStack { rootContent.toolbar { shellToolbar } }
            } else {
                NavigationStack(path: $router.path) {
                    rootContent
                        .toolbar { shellToolbar }
                        .navigationDestination(for: AppRoute.self) { route in
                            Group {
                                switch route {
                                case .entry(let entry):
                                    AppEntryView(entry: entry, isActive: isActive)
                                case .journeyTrip(let selection):
                                    NativeTripView(initialTripID: selection.tripID, initialTripScope: selection.scope)
                                case .today:
                                    TodayView()
                                case .capability(let capability):
                                    CapabilityDetailView(capability: capability)
                                }
                            }.toolbar { shellToolbar }
                        }
                }
            }
        }
        .environment(router)
#if DEBUG
        .sheet(item: $frontendTool) { tool in
            NavigationStack {
                Group {
                    switch tool {
                    case .expression: NativeFrontendExpressionView()
                    case .place: NativePlaceActionsSampleExperience()
                    }
                }
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button(locale.language.languageCode?.identifier == "zh" ? "返回对话" : "Back to chat") { frontendTool = nil } } }
            }
        }
#endif
        .onChange(of: rootResetID) { _, _ in router.reset() }
    }

    @ToolbarContentBuilder
    private var shellToolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .topBarLeading) {
            if let frontendState, let onShowAssistant {
                Button(action: onShowAssistant) {
                    HStack(spacing: 8) {
                        Image("PandaMark").resizable().scaledToFit().frame(width: 30, height: 30).clipShape(Circle())
                        VStack(alignment: .leading, spacing: 2) {
                            Text(frontendState.assistantName).font(.headline)
                            Text(locale.language.languageCode?.identifier == "zh" ? "本地体验示例" : "Local sample").font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }.accessibilityLabel(locale.language.languageCode?.identifier == "zh" ? "助手详情" : "Assistant details").accessibilityIdentifier("frontend.assistant.open")
            }
            if frontendState == nil, let onSearch {
                Button(action: onSearch) {
                    Label("shell.search", systemImage: "magnifyingglass")
                }.accessibilityIdentifier("shell.search.open")
            }
            if frontendState == nil, let onEntry {
                Menu {
                    ForEach(AppEntry.allCases.filter { $0 != .search }) { entry in
                        Button { onEntry(entry) } label: { Text(LocalizedStringKey(entry.titleKey)) }
                            .accessibilityIdentifier("shell.entry.\(entry.rawValue)")
                    }
                    if let onSwitchShell {
                        Divider()
                        Button(assistantShell ? "shell.useLegacy" : "shell.useFourTabs", action: onSwitchShell)
                            .accessibilityIdentifier("shell.mode.toggle")
                            .disabled(switchBlocked)
                        Text(switchBlocked ? "shell.switch.pending" : "shell.switch.temporary")
                    }
#if DEBUG
                    if let onShowSamples {
                        Divider()
                        Button(action: onShowSamples) {
                            Label("体验示例 / Interaction samples", systemImage: "play.rectangle")
                        }
                        .disabled(switchBlocked)
                        .accessibilityIdentifier("native.samples.open")
                    }
#endif
                } label: {
                    Label("shell.entries", systemImage: "line.3.horizontal")
                }.accessibilityIdentifier("shell.entries.open")
            }
        }
    }

    private func frontendChat(_ state: NativeFrontendState) -> some View {
        Group {
#if DEBUG
            NativeFrontendChatView(state: state, onOpenExpression: { frontendTool = .expression }, onOpenPlace: { frontendTool = .place }, avatarImage: Image("MuseChatAvatarOriginal"), avatarScale: 1.6, avatarVerticalOffset: 0.39, onShowAssistant: onShowAssistant)
#else
            NativeFrontendChatView(state: state, avatarImage: Image("MuseChatAvatarOriginal"), avatarScale: 1.6, avatarVerticalOffset: 0.39, onShowAssistant: onShowAssistant)
#endif
        }
        .toolbar(.hidden, for: .navigationBar)
        .overlay(alignment: .top) {
            LinearGradient(stops: [.init(color: Color(uiColor: .systemBackground), location: 0), .init(color: Color(uiColor: .systemBackground), location: 0.68), .init(color: .clear, location: 1)], startPoint: .top, endPoint: .bottom)
                .frame(height: 56).ignoresSafeArea(edges: .top).allowsHitTesting(false)
        }
    }

    @ViewBuilder
    private var rootContent: some View {
        if let frontendState {
            Group {
                switch tab {
                case .vp: frontendChat(frontendState)
                case .journeys: NativeFrontendJourneysView(state: frontendState)
                case .library: NativeFrontendLibraryView(state: frontendState)
                case .memory: NativeFrontendMemoryView(state: frontendState)
                default: ContentUnavailableView("此入口属于旧版", systemImage: "square.grid.2x2")
                }
            }
            .environment(frontendState)
        } else {
            switch tab {
            case .vp: RealServiceAskEntry(isActive: isActive, goalEntry: goalEntry, onSwitchBlock: onSwitchBlock)
            case .journeys: NativeJourneysView(isActive: isActive, onOpenVP: onEntry.map { handler in { handler(.ask) } }, onOpenGoal: onOpenGoal)
            case .library: NativeKnowledgeView(isActive: isActive)
            case .memory: NativeMemoryHomeView(isActive:isActive,onSwitchBlock:onSwitchBlock)
            case .tools: ToolsView()
            case .trip: TripView()
            case .ask: RealServiceAskEntry(isActive: isActive, goalEntry: goalEntry, onSwitchBlock: onSwitchBlock)
            case .explore: ExploreView(isActive: isActive)
            case .profile: ProfileView()
            }
        }
    }
}

// Navigation identity only; each entry delegates to its existing domain consumer.
enum AppEntry: String, CaseIterable, Hashable, Identifiable {
    case ask, trip, knowledge, memory, profile, today, tools, explore, search, shareInbox
    var id: String { rawValue }
    var titleKey: String {
        switch self {
        case .knowledge: "tab.library"
        case .memory: "tab.memory"
        case .search: "shell.search"
        case .shareInbox: "shell.shareInbox"
        default: "tab.\(rawValue)"
        }
    }

    static func deepLink(_ url: URL) -> AppEntry? {
        guard url.scheme?.lowercased() == "visepanda", url.user == nil, url.password == nil,
              url.port == nil, url.query == nil, url.fragment == nil,
              let host = url.host?.lowercased(), url.path.isEmpty || url.path == "/" else { return nil }
        switch host {
        case "vp": return .ask
        case "journeys": return .trip
        case "library": return .knowledge
        case "shareinbox": return .shareInbox
        case "account", "privacy", "purchase", "logout": return .profile
        default: return AppEntry(rawValue: host)
        }
    }

    func tab(inAssistantShell assistant: Bool) -> AppTab? {
        switch self {
        case .ask: assistant ? .vp : .ask
        case .trip: assistant ? .journeys : .trip
        case .knowledge: assistant ? .library : nil
        case .memory: assistant ? .memory : nil
        case .profile: assistant ? nil : .profile
        case .tools: assistant ? nil : .tools
        case .explore: assistant ? nil : .explore
        case .today, .search, .shareInbox: nil
        }
    }
}

enum NativeShellRollout {
    static func enabled(arguments: [String] = ProcessInfo.processInfo.arguments,
                        bundled: Bool = Bundle.main.object(forInfoDictionaryKey: "VisePandaFourTabShellEnabled") as? Bool ?? false) -> Bool {
        if arguments.contains("-VisePandaLegacyShell") { return false }
        return bundled || arguments.contains("-VisePandaFourTabShell")
    }
}

@MainActor
private struct RealServiceAskEntry: View {
    var isActive = true
    var goalEntry: Binding<NativeJourneyGoalEntry?> = .constant(nil)
    var onSwitchBlock: ((Bool) -> Void)?
    @Environment(AppSettings.self) private var settings

    var body: some View {
        if ProcessInfo.processInfo.arguments.contains("-V10RealServiceFrontend"), !settings.nativeSession.enabled {
            NativeRealServiceDisconnectedView(chinese: settings.selectedLocale == .zh)
        } else {
            AskView(isActive: isActive, goalEntry: goalEntry, onSwitchBlock: onSwitchBlock)
        }
    }
}

@MainActor
struct AppEntryView: View {
    let entry: AppEntry
    var isActive = true

    @ViewBuilder var body: some View {
        switch entry {
        case .ask: RealServiceAskEntry(isActive: isActive)
        case .trip: TripView()
        case .knowledge: NativeKnowledgeView(isActive: isActive)
        case .memory: NativeMemoryHomeView(isActive:isActive)
        case .profile: ProfileView()
        case .today: TodayView()
        case .tools: ToolsView()
        case .explore: ExploreView(isActive: isActive)
        case .search: GlobalSearchView()
        case .shareInbox: NativeEntryResumeInboxEntry()
        }
    }
}

// Search delegates to the existing bounded search consumers. It is never a tab.
private struct GlobalSearchView: View {
    @Environment(AppSettings.self) private var settings
    @State private var query=""
    private var chinese:Bool{settings.selectedLocale == .zh}
    private func t(_ zh:String,_ en:String)->String{chinese ? zh:en}
    var body:some View {
        List {
            Section {
                TextField(t("搜索地点、资料或成果","Search places, materials or results"),text:$query)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                    .accessibilityIdentifier("shell.search.query")
            }
            if query.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty {
                Section(t("地点发现","Place discovery")) {
                    ContentUnavailableView {
                        Label(t("地点图片暂不可用","Place images are unavailable"),systemImage:"photo")
                    } description: {
                        Text(t("可以先查询已有地点与中文地址。","You can search existing places and Chinese addresses."))
                    }.accessibilityIdentifier("shell.discovery.unavailable")
                }
            }
            Section(t("外部已支持地点","Supported external places")) {
                NavigationLink {ExploreView(initialQuery:query)} label: {
                    Label(t("查找地点与中文地址","Find places and Chinese addresses"),systemImage:"mappin.and.ellipse")
                }.accessibilityIdentifier("shell.search.places")
                Text(t("地点查询沿用已有供应商服务；详情打开时重新读取所选实体。","Place search uses existing provider services. Opening reads the selected entity again.")).font(.footnote)
            }
            Section(t("我的私有资料与成果","My private materials and results")) {
                NavigationLink {NativeKnowledgeView(initialSearch:query)} label: {
                    Label(t("搜索已存翻译与生成成果","Search saved translations and generated results"),systemImage:"books.vertical")
                }.accessibilityIdentifier("shell.search.library")
                Text(t("仅本账号当前可读资料；查询与打开都会核对权限，未登录时不会展示标题或数量。","Only currently readable material on this account. Query and open recheck authority; signed-out users see no private titles or counts.")).font(.footnote)
            }
        }
        .vpNavigationTitle("shell.search")
        .onChange(of:settings.nativeSession.dataScope){_,_ in query=""}
    }
}

#if DEBUG
private enum NativeFrontendTool: String, Identifiable {
    case expression, place
    var id: String { rawValue }
}
#endif

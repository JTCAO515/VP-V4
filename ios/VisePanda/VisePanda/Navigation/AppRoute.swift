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
    @State private var router = RouterPath()

    var body: some View {
        @Bindable var router = router

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
        .environment(router)
        .onChange(of: rootResetID) { _, _ in router.reset() }
    }

    @ToolbarContentBuilder
    private var shellToolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .topBarLeading) {
            if let onSearch {
                Button(action: onSearch) {
                    Label("shell.search", systemImage: "magnifyingglass")
                }.accessibilityIdentifier("shell.search.open")
            }
            if let onEntry {
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
                } label: {
                    Label("shell.entries", systemImage: "line.3.horizontal")
                }.accessibilityIdentifier("shell.entries.open")
            }
        }
    }

    @ViewBuilder
    private var rootContent: some View {
        switch tab {
        case .vp: AskView(isActive: isActive, goalEntry: goalEntry, onSwitchBlock: onSwitchBlock)
        case .journeys: NativeJourneysView(isActive: isActive, onOpenVP: onEntry.map { handler in { handler(.ask) } }, onOpenGoal: onOpenGoal)
        case .library: NativeKnowledgeView(isActive: isActive)
        case .memory: NativeMemoryHomeView(isActive:isActive,onSwitchBlock:onSwitchBlock)
        case .tools: ToolsView()
        case .trip: TripView()
        case .ask: AskView(isActive: isActive, goalEntry: goalEntry, onSwitchBlock: onSwitchBlock)
        case .explore: ExploreView(isActive: isActive)
        case .profile: ProfileView()
        }
    }
}

// Navigation identity only; each entry delegates to its existing domain consumer.
enum AppEntry: String, CaseIterable, Hashable, Identifiable {
    case ask, trip, knowledge, memory, profile, today, tools, explore, search
    var id: String { rawValue }
    var titleKey: String {
        switch self {
        case .knowledge: "tab.library"
        case .memory: "tab.memory"
        case .search: "shell.search"
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
        case .today, .search: nil
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
struct AppEntryView: View {
    let entry: AppEntry
    var isActive = true

    @ViewBuilder var body: some View {
        switch entry {
        case .ask: AskView(isActive: isActive)
        case .trip: TripView()
        case .knowledge: NativeKnowledgeView(isActive: isActive)
        case .memory: NativeMemoryHomeView(isActive:isActive)
        case .profile: ProfileView()
        case .today: TodayView()
        case .tools: ToolsView()
        case .explore: ExploreView(isActive: isActive)
        case .search: GlobalSearchView()
        }
    }
}

// Search delegates to the existing bounded search consumers. It is never a tab.
private struct GlobalSearchView: View {
    var body: some View {
        List {
            NavigationLink {
                ExploreView()
            } label: {
                Label("shell.search.places", systemImage: "mappin.and.ellipse")
            }.accessibilityIdentifier("shell.search.places")
            NavigationLink {
                NativeKnowledgeView()
            } label: {
                Label("shell.search.library", systemImage: "books.vertical")
            }.accessibilityIdentifier("shell.search.library")
            Text("shell.search.scope").font(.footnote).foregroundStyle(Color.vpSecondaryText)
        }
        .vpNavigationTitle("shell.search")
    }
}

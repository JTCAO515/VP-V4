import SwiftUI

@MainActor
struct AppShellView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var scenePhase
    @State private var assistantShell: Bool
    @State private var selectedTab: AppTab
    @State private var goalEntry: NativeJourneyGoalEntry?
    @State private var presentedEntry: AppEntry?
    @State private var switchState = ShellSwitchState()
    @State private var entryResets: [AppTab: UUID] = [:]

    init(assistantShell: Bool = NativeShellRollout.enabled()) {
        _assistantShell = State(initialValue: assistantShell)
        _selectedTab = State(initialValue: assistantShell ? .defaultSelection : .ask)
    }

    private var tabs: [AppTab] { assistantShell ? AppTab.assistantTabs : AppTab.legacyTabs }

    var body: some View {
        TabView(selection: $selectedTab) {
            ForEach(tabs) { tab in
                let capturedScope = settings.nativeSession.dataScope
                let capturedHost = switchState.generation
                TabRootView(tab: tab, isActive: selectedTab == tab && presentedEntry == nil,
                            onSearch: { presentedEntry = .search }, onEntry: open,
                            assistantShell: assistantShell, onSwitchShell: switchShell, rootResetID: entryResets[tab],
                            goalEntry: $goalEntry, onOpenGoal: openGoal,
                            switchBlocked: switchState.blocked || settings.nativeSession.busy,
                            onSwitchBlock: { blocked in
                                guard capturedScope == settings.nativeSession.dataScope else { return }
                                switchState.update(blocked: blocked, tab: tab, scope: capturedScope, host: capturedHost)
                            })
                    .tabItem {
                        tab.label
                    }
                    .tag(tab)
            }
        }
        // Recreate view-owned drafts, paths and projections when the actor/epoch changes.
        .id(ShellNavigationIdentity(scope: settings.nativeSession.dataScope, assistant: assistantShell, generation: switchState.generation))
        .accessibilityIdentifier("main-tab-view")
        .sheet(item: $presentedEntry) { entry in
            ShellEntrySheet(entry: entry)
                .id(settings.nativeSession.dataScope)
        }
        .onOpenURL { url in
            guard let entry = AppEntry.deepLink(url) else { return }
            open(entry)
        }
        .onChange(of: settings.nativeSession.dataScope, initial: true) { _, scope in
            goalEntry = nil
            switchState.actorChanged(to: scope)
            presentedEntry = nil
            selectedTab = assistantShell ? .defaultSelection : .ask
        }
        .task { await settings.nativeSession.restore() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await settings.nativeSession.validate() } }
        }
    }
    private func switchShell() {
        guard !switchState.blocked, !settings.nativeSession.busy else { return }
        presentedEntry = nil
        switchState.modeChanged()
        assistantShell.toggle()
        selectedTab = assistantShell ? .defaultSelection : .ask
    }

    private func openGoal(_ entry: NativeJourneyGoalEntry) {
        guard entry.valid, entry.scope == settings.nativeSession.dataScope, settings.nativeSession.askMode == .assistant else { return }
        goalEntry = entry
        open(.ask)
    }

    private func open(_ entry: AppEntry) {
        if let tab = entry.tab(inAssistantShell: assistantShell) {
            presentedEntry = nil
            entryResets[tab] = UUID()
            selectedTab = tab
        } else {
            presentedEntry = entry
        }
    }
}

struct ShellNavigationIdentity: Hashable {
    let scope: NativeDataScope?
    let assistant: Bool
    let generation: UUID
}

struct ShellSwitchState {
    private(set) var scope: NativeDataScope?
    private(set) var generation = UUID()
    private var tabs: Set<AppTab> = []
    var blocked: Bool { !tabs.isEmpty }
    mutating func actorChanged(to next: NativeDataScope?) {
        guard scope != next else { return }
        scope = next; generation = UUID(); tabs.removeAll()
    }
    mutating func modeChanged() { generation = UUID(); tabs.removeAll() }
    mutating func update(blocked: Bool, tab: AppTab, scope captured: NativeDataScope?, host: UUID) {
        guard captured == scope, host == generation else { return }
        if blocked { tabs.insert(tab) } else { tabs.remove(tab) }
    }
}

private struct ShellEntrySheet: View {
    let entry: AppEntry
    @Environment(\.dismiss) private var dismiss
    @State private var router = RouterPath()

    var body: some View {
        @Bindable var router = router
        VStack(spacing: 0) {
            HStack {
                Spacer()
                Button("ask.done") { dismiss() }
                    .frame(minWidth: 44, minHeight: 44)
                    .accessibilityIdentifier("shell.entry.done")
            }.padding(.horizontal)
            NavigationStack(path: $router.path) {
                AppEntryView(entry: entry)
                    .navigationDestination(for: AppRoute.self) { route in
                        switch route {
                        case .entry(let entry): AppEntryView(entry: entry)
                        case .journeyTrip(let selection):
                            NativeTripView(initialTripID: selection.tripID, initialTripScope: selection.scope)
                        case .today: TodayView()
                        case .capability(let kind): CapabilityDetailView(capability: kind)
                        }
                    }
            }
        }
        .environment(router)
    }
}

#Preview("Four tabs — VP") {
    AppShellView(assistantShell: true)
        .environment(AppSettings())
}

#Preview("Arabic RTL") {
    AppShellView()
        .environment(AppSettings(selectedLocale: .ar))
        .environment(\.locale, Locale(identifier: "ar"))
        .environment(\.layoutDirection, LayoutDirection.rightToLeft)
}

import SwiftUI

@MainActor
struct AppShellView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var scenePhase
    @State private var frontend = NativeFrontendState()
    @State private var frontendEnabled = NativeFrontendRollout.enabled()
    @State private var frontendSheet: NativeFrontendSheet?
    @State private var assistantShell: Bool
    @State private var selectedTab: AppTab
    @State private var goalEntry: NativeJourneyGoalEntry?
    @State private var presentedEntry: AppEntry?
    @State private var switchState = ShellSwitchState()
    @State private var entryResets: [AppTab: UUID] = [:]
#if DEBUG
    @State private var samplePresentation: NativeExperienceSamplePresentation?
#endif

    init(assistantShell: Bool = NativeShellRollout.enabled()) {
        let useFourTabs = assistantShell || NativeFrontendRollout.enabled()
        _assistantShell = State(initialValue: useFourTabs)
        _selectedTab = State(initialValue: useFourTabs ? .defaultSelection : .ask)
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
                            }, onShowSamples: openSamples, frontendState: frontendEnabled ? frontend : nil,
                            onShowAssistant: { frontendSheet = .assistant })
                    .tabItem {
                        if frontendEnabled {
                            Label(frontendTitle(tab), systemImage: tab.systemImage)
                        } else { tab.label }
                    }
                    .tag(tab)
            }
        }
        .onChange(of: frontend.selectedTab) { _, tab in
            guard frontendEnabled else { return }; selectedTab = tab
        }
        .onChange(of: selectedTab) { _, tab in
            if frontendEnabled { frontend.selectedTab = tab }
        }
        .sheet(item: $frontendSheet) { _ in
            NativeFrontendAssistantDetail(state: frontend)
        }
        // Recreate view-owned drafts, paths and projections when the actor/epoch changes.
        .id(ShellNavigationIdentity(scope: settings.nativeSession.dataScope, assistant: assistantShell, generation: switchState.generation))
        .accessibilityIdentifier("main-tab-view")
        .environment(frontend)
        .environment(\.locale, frontendEnabled ? Locale(identifier: "zh-Hans") : settings.selectedLocale.locale)
        .environment(\.layoutDirection, frontendEnabled ? .leftToRight : settings.selectedLocale.layoutDirection)
        .sheet(item: $presentedEntry) { entry in
            ShellEntrySheet(entry: entry)
                .id(settings.nativeSession.dataScope)
        }
#if DEBUG
        .sheet(item: $samplePresentation) { _ in
            NativeExperienceSampleHub()
        }
#endif
        .sheet(item: Binding(get: { !frontendEnabled && presentedEntry == nil ? settings.nativeSession.notifications.destination : nil }, set: { value in
            if value == nil { settings.nativeSession.notifications.dismissDestination() }
        })) { destination in
            NativeNotificationReturnView(destination: destination, session: settings.nativeSession, chinese: settings.selectedLocale == .zh)
                .id(settings.nativeSession.dataScope)
        }
        .alert(settings.selectedLocale == .zh ? "提醒已不可用" : "Reminder unavailable",
               isPresented: Binding(get: { !frontendEnabled && settings.nativeSession.notifications.resolutionUnavailable }, set: { value in
                   if !value { settings.nativeSession.notifications.dismissResolutionFailure() }
               })) {
            Button(settings.selectedLocale == .zh ? "知道了" : "OK") { settings.nativeSession.notifications.dismissResolutionFailure() }
        } message: {
            Text(settings.selectedLocale == .zh ? "来源、行程、权限或有效期已变化，请从当前行程继续。" : "The source, trip, permission or expiry changed. Continue from your current trip.")
        }
        .onOpenURL { url in
            guard !frontendEnabled else { return }
            if settings.nativeSession.entryResume.receive(url, scope: settings.nativeSession.dataScope) { return }
            if let reference = NativeNotificationWire.opaqueReference(url) {
                if let scope = settings.nativeSession.dataScope {
                    Task { await settings.nativeSession.notifications.resolve(reference: reference, scope: scope) }
                } else { NativeNotificationSystem.shared.receivedWhileRestoring(reference: reference) }
                return
            }
            guard let entry = AppEntry.deepLink(url) else { return }
            open(entry)
        }
        .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
            if !frontendEnabled, let url = activity.webpageURL { _ = settings.nativeSession.entryResume.receive(url, scope: settings.nativeSession.dataScope) }
        }
        .sheet(isPresented: Binding(get: { !frontendEnabled && settings.nativeSession.entryResume.presented && presentedEntry == nil && settings.nativeSession.notifications.destination == nil && !switchState.blocked }, set: { settings.nativeSession.entryResume.presented = $0 })) {
            NativeEntryResumeView(session: settings.nativeSession, coordinator: settings.nativeSession.entryResume, chinese: settings.selectedLocale == .zh)
        }
        .onChange(of: settings.nativeSession.dataScope, initial: true) { _, scope in
            if !frontendEnabled {
                settings.nativeSession.notifications.attach(session: settings.nativeSession)
                settings.nativeSession.entryResume.refresh(scope: scope)
            }
            goalEntry = nil
#if DEBUG
            samplePresentation = nil
#endif
            switchState.actorChanged(to: scope)
            presentedEntry = nil
            selectedTab = assistantShell ? .defaultSelection : .ask
        }
        .onChange(of:settings.nativeSession.exploreAskHandoff?.id){_,_ in
            guard !frontendEnabled, let source=settings.nativeSession.exploreAskHandoff,source.scope==settings.nativeSession.dataScope,source.valid else{return}
            open(.ask)
        }
        .task {
            guard !frontendEnabled else { return }
            settings.nativeSession.notifications.attach(session: settings.nativeSession)
            await settings.nativeSession.restore()
            await settings.nativeSession.notifications.finishRestoration(session: settings.nativeSession)
#if DEBUG
            if ProcessInfo.processInfo.arguments.contains("-V10NativeExperienceSamples") {
                openSamples()
            }
#endif
        }
        .onChange(of: scenePhase) { _, phase in
            guard !frontendEnabled else { return }
            if phase != .active { settings.nativeSession.entryResume.hide() }
            if phase == .active {
                Task {
                    await settings.nativeSession.validate()
                    await settings.nativeSession.notifications.refreshPermission(session: settings.nativeSession)
                    settings.nativeSession.entryResume.refresh(scope: settings.nativeSession.dataScope)
                }
            }
        }
    }
    private func frontendTitle(_ tab: AppTab) -> String {
        switch tab {
        case .vp: "对话"
        case .journeys: "旅程"
        case .library: "资料库"
        case .memory: "记忆"
        default: tab.rawValue
        }
    }
    private func openSamples() {
#if DEBUG
        guard !switchState.blocked, !settings.nativeSession.busy,
              presentedEntry == nil, settings.nativeSession.notifications.destination == nil,
              !settings.nativeSession.entryResume.presented else { return }
        samplePresentation = .overview
#endif
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

private enum NativeFrontendSheet: String, Identifiable {
    case assistant
    var id: String { rawValue }
}

enum NativeFrontendRollout {
    static func enabled(arguments: [String] = ProcessInfo.processInfo.arguments) -> Bool {
        if arguments.contains("-VisePandaLegacyShell") || arguments.contains("-V10RealServiceFrontend") { return false }
        if arguments.contains("-V10FrontendExperience") { return true }
#if DEBUG
        return !arguments.contains("-VisePandaNativeAPI") && !arguments.contains("-VisePandaFourTabShell")
#else
        return false
#endif
    }
}

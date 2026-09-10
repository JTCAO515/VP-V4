import SwiftUI

@MainActor
struct AppShellView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var scenePhase
    @State private var selectedTab: AppTab = .defaultSelection

    var body: some View {
        TabView(selection: $selectedTab) {
            ForEach(AppTab.allCases) { tab in
                TabRootView(tab: tab)
                    .tabItem {
                        tab.label
                    }
                    .tag(tab)
            }
        }
        .accessibilityIdentifier("main-tab-view")
        .task { await settings.nativeSession.restore() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await settings.nativeSession.validate() } }
        }
    }
}

#Preview("Default — Ask") {
    AppShellView()
        .environment(AppSettings())
}

#Preview("Arabic RTL") {
    AppShellView()
        .environment(AppSettings(selectedLocale: .ar))
        .environment(\.locale, Locale(identifier: "ar"))
        .environment(\.layoutDirection, LayoutDirection.rightToLeft)
}

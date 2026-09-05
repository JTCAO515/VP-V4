import Observation
import SwiftUI

enum AppRoute: Hashable {
    case capability(CapabilityKind)
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
    @State private var router = RouterPath()

    var body: some View {
        @Bindable var router = router

        NavigationStack(path: $router.path) {
            rootContent
                .navigationDestination(for: AppRoute.self) { route in
                    switch route {
                    case .capability(let capability):
                        CapabilityDetailView(capability: capability)
                    }
                }
        }
        .environment(router)
    }

    @ViewBuilder
    private var rootContent: some View {
        switch tab {
        case .today: TodayView()
        case .trip: TripView()
        case .ask: AskView()
        case .explore: ExploreView()
        case .profile: ProfileView()
        }
    }
}

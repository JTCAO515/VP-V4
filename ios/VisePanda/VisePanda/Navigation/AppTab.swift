import SwiftUI

enum AppTab: String, CaseIterable, Identifiable, Sendable {
    case vp
    case journeys
    case library
    case memory
    case trip
    case explore
    case ask
    case tools
    case profile

    static let defaultSelection: AppTab = .vp
    static let assistantTabs: [AppTab] = [.vp, .journeys, .library, .memory]
    static let legacyTabs: [AppTab] = [.trip, .explore, .ask, .tools, .profile]

    var id: String { rawValue }

    var localizationKey: String {
        "tab.\(rawValue)"
    }

    var title: LocalizedStringKey {
        LocalizedStringKey(localizationKey)
    }

    var systemImage: String {
        switch self {
        case .vp: "sparkles"
        case .journeys: "map"
        case .library: "books.vertical"
        case .memory: "brain"
        case .tools: "wrench.and.screwdriver"
        case .trip: "map"
        case .ask: "sparkles"
        case .explore: "safari"
        case .profile: "person.crop.circle"
        }
    }

    @ViewBuilder
    var label: some View {
        Label {
            Text(title)
        } icon: {
            Image(systemName: systemImage)
        }
    }
}

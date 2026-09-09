import SwiftUI

enum AppTab: String, CaseIterable, Identifiable, Sendable {
    case trip
    case explore
    case ask
    case tools
    case profile

    static let defaultSelection: AppTab = .ask

    var id: String { rawValue }

    var localizationKey: String {
        "tab.\(rawValue)"
    }

    var title: LocalizedStringKey {
        LocalizedStringKey(localizationKey)
    }

    var systemImage: String {
        switch self {
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

import SwiftUI

enum AppTab: String, CaseIterable, Identifiable, Sendable {
    case today
    case trip
    case ask
    case explore
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
        case .today: "sun.max"
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

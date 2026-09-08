import SwiftUI

enum CapabilityAvailability: String, Sendable {
    case previewOnly
}

enum CapabilityKind: String, CaseIterable, Identifiable, Hashable, Sendable {
    case tripPlanning
    case translation
    case addressCard
    case safePhrase

    var id: String { rawValue }
    var availability: CapabilityAvailability { .previewOnly }

    var title: LocalizedStringKey {
        LocalizedStringKey("capability.\(rawValue).title")
    }

    var summary: LocalizedStringKey {
        LocalizedStringKey("capability.\(rawValue).summary")
    }

    var systemImage: String {
        switch self {
        case .tripPlanning: "point.topleft.down.to.point.bottomright.curvepath"
        case .translation: "character.bubble"
        case .addressCard: "mappin.and.ellipse"
        case .safePhrase: "cross.case"
        }
    }
}

struct CapabilityDetailView: View {
    let capability: CapabilityKind

    var body: some View {
        ContentUnavailableView {
            Label(capability.title, systemImage: capability.systemImage)
        } description: {
            Text(capability.summary)
        } actions: {
            AvailabilityBadge()
        }
        .navigationTitle(capability.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

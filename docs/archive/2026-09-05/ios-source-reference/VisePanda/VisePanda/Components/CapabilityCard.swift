import SwiftUI

struct CapabilityCard: View {
    let capability: CapabilityKind

    var body: some View {
        NavigationLink(value: AppRoute.capability(capability)) {
            VisePandaCard {
                VStack(alignment: .leading, spacing: 12) {
                    Image(systemName: capability.systemImage)
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(Color.vpBrand)

                    Text(capability.title)
                        .font(.headline)
                        .foregroundStyle(.primary)

                    Text(capability.summary)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(3)

                    AvailabilityBadge()
                }
            }
        }
        .buttonStyle(SoftPressButtonStyle())
        .accessibilityHint(Text("preview.open_hint"))
    }
}

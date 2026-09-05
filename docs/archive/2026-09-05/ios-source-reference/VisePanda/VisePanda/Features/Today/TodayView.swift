import SwiftUI

struct TodayView: View {
    private let quickActions: [CapabilityKind] = [.translation, .addressCard, .safePhrase, .tripPlanning]
    private let columns = [GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: VPSpacing.section) {
                BrandHeader()
                hero
                PreviewStatusBanner()

                Text("today.quick_actions")
                    .font(.title3.weight(.bold))

                LazyVGrid(columns: columns, spacing: 12) {
                    ForEach(quickActions) { capability in
                        CapabilityCard(capability: capability)
                    }
                }
            }
            .padding(.horizontal, VPSpacing.standard)
            .padding(.vertical, VPSpacing.standard)
        }
        .background(Color.vpBackground)
        .navigationTitle("tab.today")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var hero: some View {
        VisePandaCard {
            VStack(alignment: .leading, spacing: 14) {
                Text("today.eyebrow")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.vpBrand)
                    .textCase(.uppercase)

                Text("today.title")
                    .font(.largeTitle.weight(.bold))
                    .tracking(-0.8)
                    .fixedSize(horizontal: false, vertical: true)

                Text("today.subtitle")
                    .font(.body)
                    .foregroundStyle(.secondary)

                NavigationLink(value: AppRoute.capability(.tripPlanning)) {
                    Label("today.start", systemImage: "arrow.right")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .foregroundStyle(.white)
                        .background(Color.vpBrand, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(SoftPressButtonStyle())
            }
        }
    }
}

#Preview {
    NavigationStack { TodayView() }
}

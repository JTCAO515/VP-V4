import SwiftUI

private struct PreviewPlace: Identifiable {
    let id: String
    let title: LocalizedStringKey
    let subtitle: LocalizedStringKey
    let imageName: String
}

struct ExploreView: View {
    private let places = [
        PreviewPlace(id: "beijing", title: "explore.beijing", subtitle: "explore.beijing.subtitle", imageName: "building.columns"),
        PreviewPlace(id: "shanghai", title: "explore.shanghai", subtitle: "explore.shanghai.subtitle", imageName: "water.waves"),
        PreviewPlace(id: "chengdu", title: "explore.chengdu", subtitle: "explore.chengdu.subtitle", imageName: "leaf")
    ]

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: VPSpacing.section) {
                BrandHeader()

                VStack(alignment: .leading, spacing: 8) {
                    Text("explore.title")
                        .font(.largeTitle.weight(.bold))
                        .tracking(-0.8)

                    Text("explore.subtitle")
                        .foregroundStyle(.secondary)
                }

                PreviewStatusBanner()

                ForEach(places) { place in
                    NavigationLink(value: AppRoute.capability(.tripPlanning)) {
                        VisePandaCard {
                            HStack(spacing: 16) {
                                Image(systemName: place.imageName)
                                    .font(.title2.weight(.semibold))
                                    .foregroundStyle(Color.vpBrand)
                                    .frame(width: 52, height: 52)
                                    .background(Color.vpLavender.opacity(0.22), in: RoundedRectangle(cornerRadius: 16, style: .continuous))

                                VStack(alignment: .leading, spacing: 5) {
                                    Text(place.title)
                                        .font(.headline)
                                        .foregroundStyle(.primary)
                                    Text(place.subtitle)
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                    Text("explore.sample")
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(Color.vpBrand)
                                }

                                Spacer(minLength: 0)
                                Image(systemName: "chevron.right")
                                    .font(.caption.weight(.bold))
                                    .foregroundStyle(.tertiary)
                                    .accessibilityHidden(true)
                            }
                        }
                    }
                    .buttonStyle(SoftPressButtonStyle())
                }
            }
            .padding(VPSpacing.standard)
        }
        .background(Color.vpBackground)
        .navigationTitle("tab.explore")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NavigationStack { ExploreView() }
}

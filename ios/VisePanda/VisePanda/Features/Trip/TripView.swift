import SwiftUI

struct TripView: View {
    @ScaledMetric(relativeTo: .caption) private var workflowBadgeSize: CGFloat = 28

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: VPSpacing.section) {
                BrandHeader()
                PreviewStatusBanner()
                emptyTrip
                NavigationLink(value: AppRoute.today) {
                    Label("tab.today", systemImage: "sun.max")
                        .frame(minHeight: 44)
                }
                workflow
            }
            .padding(VPSpacing.standard)
        }
        .background(Color.vpBackground)
        .vpNavigationTitle("tab.trip")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var emptyTrip: some View {
        VisePandaCard {
            VStack(alignment: .leading, spacing: 14) {
                Image(systemName: "map.fill")
                    .font(.largeTitle)
                    .foregroundStyle(Color.vpBrand)
                    .accessibilityHidden(true)

                Text("trip.empty.title")
                    .font(.title2.weight(.bold))

                Text("trip.empty.message")
                    .foregroundStyle(Color.vpSecondaryText)

                NavigationLink(value: AppRoute.capability(.tripPlanning)) {
                    Label("trip.empty.action", systemImage: "sparkles")
                        .font(.headline)
                        .frame(minHeight: 44)
                }
            }
        }
    }

    private var workflow: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("trip.workflow.title")
                .font(.headline)

            workflowRow(number: "1", key: "trip.workflow.ask")
            workflowRow(number: "2", key: "trip.workflow.review")
            workflowRow(number: "3", key: "trip.workflow.confirm")
        }
    }

    private func workflowRow(number: String, key: LocalizedStringKey) -> some View {
        HStack(spacing: 12) {
            Text(number)
                .font(.caption.weight(.bold))
                .frame(width: workflowBadgeSize, height: workflowBadgeSize)
                .foregroundStyle(.white)
                .background(Color.vpBrandFill, in: Circle())

            Text(key)
                .font(.subheadline)

            Spacer()
        }
        .accessibilityElement(children: .combine)
    }
}

#Preview {
    NavigationStack { TripView() }
}

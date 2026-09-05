import SwiftUI

struct TripView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: VPSpacing.section) {
                BrandHeader()
                PreviewStatusBanner()
                emptyTrip
                workflow
            }
            .padding(VPSpacing.standard)
        }
        .background(Color.vpBackground)
        .navigationTitle("tab.trip")
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
                    .foregroundStyle(.secondary)

                NavigationLink(value: AppRoute.capability(.tripPlanning)) {
                    Label("trip.empty.action", systemImage: "sparkles")
                        .font(.headline)
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
                .frame(width: 28, height: 28)
                .foregroundStyle(.white)
                .background(Color.vpBrand, in: Circle())

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

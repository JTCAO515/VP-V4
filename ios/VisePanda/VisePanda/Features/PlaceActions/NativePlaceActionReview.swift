import SwiftUI

struct NativePlaceActionProposal: Identifiable, Equatable {
    let scope: NativeDataScope
    let tripId: String
    let baseVersion: Int
    let proposalId: String
    let revision: Int
    let digest: String
    var id: String { proposalId + ":" + String(revision) + ":" + digest }
}

/// Reuses the original Proposal reader, visible diff, confirmation journal and
/// atomic writer. Returning always reads the same Trip again before reporting it.
struct NativePlaceActionReview: View {
    let reference: NativePlaceActionProposal
    let chinese: Bool
    @Environment(\.dismiss) private var dismiss
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    var body: some View {
        NavigationStack {
            NativeTripView(initialTripID: reference.tripId, initialTripScope: reference.scope,
                           initialProposalReference: reference.id, initialTripVersion: reference.baseVersion)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button(t("返回此地点并重载行程", "Return to this place and reload Trip")) { dismiss() }
                            .accessibilityIdentifier("place.actions.return")
                    }
                }
        }
    }
}

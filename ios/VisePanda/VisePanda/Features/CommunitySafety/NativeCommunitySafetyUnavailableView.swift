import SwiftUI

struct NativeCommunitySafetyUnavailableView: View {
    let chinese: Bool
    let reason: String

    var body: some View {
        ContentUnavailableView {
            Label(chinese ? "社区安全暂不可用" : "Community safety unavailable", systemImage: "hand.raised")
        } description: {
            Text(reason)
        }
        .accessibilityIdentifier("community-safety-unavailable")
    }
}

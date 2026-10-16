import SwiftUI

/// Main supplies a live gate that includes scope, selected session, consent and visibility.
/// The timeline rechecks it on each content update. Keep the parent's observable
/// scope/visibility guard: the system can reduce timeline cadence.
/// No private payload is stored in view state.
@MainActor
struct NativeQAMessageCard: View {
    let message: NativeQAMessage
    let expectedSessionID: String
    let isCurrent: @MainActor () -> Bool
    let chinese: Bool

    var body: some View {
        TimelineView(.animation) { _ in
            if let presentation = NativeQAMessagePresentation.resolve(
                message: message, expectedSessionID: expectedSessionID,
                isCurrent: isCurrent, chinese: chinese
            ) {
                content(presentation)
            }
        }
    }

    private func content(_ presentation: NativeQAMessagePresentation) -> some View {
        VStack(alignment: .leading, spacing: VPSpacing.standard) {
            VStack(alignment: .leading, spacing: VPSpacing.compact) {
                Text(verbatim: presentation.userLabel)
                    .font(.subheadline.bold())
                    .foregroundStyle(Color.vpSecondaryText)
                    .accessibilityAddTraits(.isHeader)
                // Verbatim text preserves bytes and never creates Markdown links or remote images.
                Text(verbatim: presentation.input)
                    .font(.body)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("native.qa.question.\(presentation.id)")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(VPSpacing.standard)
            .background(Color.vpBackground, in: RoundedRectangle(cornerRadius: 16))

            VStack(alignment: .leading, spacing: VPSpacing.compact) {
                Text(verbatim: presentation.assistantLabel)
                    .font(.headline)
                    .foregroundStyle(Color.vpBrand)
                    .accessibilityAddTraits(.isHeader)
                Label {
                    Text(verbatim: presentation.statusTitle)
                } icon: {
                    Image(systemName: presentation.statusSymbol).accessibilityHidden(true)
                }
                .font(.subheadline.bold())
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("native.qa.message-status.\(presentation.id)")

                Text(verbatim: presentation.statusDetail)
                    .font(.subheadline)
                    .foregroundStyle(Color.vpSecondaryText)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("native.qa.message-detail.\(presentation.id)")

                if let response = presentation.response {
                    Text(verbatim: response)
                        .font(.body)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, VPSpacing.compact)
                        .accessibilityIdentifier("native.qa.answer.\(presentation.id)")
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(VPSpacing.standard)
            .background(Color.vpSurface, in: RoundedRectangle(cornerRadius: 16))
        }
        .foregroundStyle(.primary)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

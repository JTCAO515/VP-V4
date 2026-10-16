import SwiftUI

struct NativeQAWorkCard: View {
    let presentation: NativeQAWorkPresentation
    let identifier: String
    var actionIdentifier: String?
    var action: (() -> Void)?

    private var symbolColor: Color {
        switch presentation.tone {
        case .neutral: Color.vpSecondaryText
        case .information: Color.vpBrand
        case .attention: .orange
        case .positive: .green
        }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: VPSpacing.standard) {
            Image(systemName: presentation.symbol)
                .font(.title2).foregroundStyle(symbolColor).accessibilityHidden(true)
            Text(presentation.title)
                .font(.headline).fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader).accessibilityIdentifier(identifier)
            Text(presentation.detail)
                .font(.body).foregroundStyle(Color.vpSecondaryText)
                .fixedSize(horizontal: false, vertical: true)
            if let action {
                Button(action: action) {
                    Text(presentation.actionTitle)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                }
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier(actionIdentifier ?? "native.qa.work-action")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(VPSpacing.standard)
        .background(Color.vpSurface, in: RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .contain)
    }
}

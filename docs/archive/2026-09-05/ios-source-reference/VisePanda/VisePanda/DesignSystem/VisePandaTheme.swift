import SwiftUI

extension Color {
    static let vpBrand = Color(red: 0.30, green: 0.12, blue: 0.29)
    static let vpAccent = Color(red: 0.93, green: 0.56, blue: 0.25)
    static let vpLavender = Color(red: 0.80, green: 0.68, blue: 0.93)
    static let vpBackground = Color(uiColor: .systemGroupedBackground)
    static let vpSurface = Color(uiColor: .secondarySystemGroupedBackground)
}

enum VPSpacing {
    static let compact: CGFloat = 8
    static let standard: CGFloat = 16
    static let section: CGFloat = 24
    static let generous: CGFloat = 32
}

struct VisePandaCard<Content: View>: View {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @ViewBuilder let content: Content

    var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(VPSpacing.standard)
            .background {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(reduceTransparency ? AnyShapeStyle(Color.vpSurface) : AnyShapeStyle(.regularMaterial))
            }
            .overlay {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(.primary.opacity(0.08), lineWidth: 1)
            }
    }
}

struct SoftPressButtonStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .opacity(configuration.isPressed ? 0.86 : 1)
            .animation(
                reduceMotion ? nil : .spring(response: 0.24, dampingFraction: 1),
                value: configuration.isPressed
            )
    }
}

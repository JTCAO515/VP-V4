import SwiftUI

extension Color {
    static let vpBrandFill = Color(red: 0.30, green: 0.12, blue: 0.29)
    static let vpBrand = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.88, green: 0.75, blue: 0.94, alpha: 1)
            : UIColor(red: 0.30, green: 0.12, blue: 0.29, alpha: 1)
    })
    // Opaque supporting text keeps contrast on grouped and preview surfaces.
    static let vpSecondaryText = Color(uiColor: UIColor { traits in
        UIColor(white: traits.userInterfaceStyle == .dark ? 0.80 : 0.30, alpha: 1)
    })
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
    @ViewBuilder let content: Content

    var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(VPSpacing.standard)
            .background {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(Color.vpSurface)
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
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.98 : 1)
            .opacity(configuration.isPressed ? 0.86 : 1)
            .animation(
                reduceMotion ? nil : .spring(response: 0.24, dampingFraction: 1),
                value: configuration.isPressed
            )
    }
}

// Resolve navigation chrome on every locale update without resetting drafts or navigation paths.
private struct VPNavigationTitle: ViewModifier {
    @Environment(\.locale) private var locale
    let key: String

    func body(content: Content) -> some View {
        let bundle = Bundle.main.path(forResource: locale.identifier, ofType: "lproj")
            .flatMap(Bundle.init(path:)) ?? .main
        content.navigationTitle(Text(verbatim: bundle.localizedString(forKey: key, value: nil, table: nil)))
    }
}

extension View {
    func vpNavigationTitle(_ key: String) -> some View {
        modifier(VPNavigationTitle(key: key))
    }
}

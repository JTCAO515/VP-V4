import SwiftUI
import UIKit
import Testing
@testable import VisePanda

@MainActor
struct AccessibilityContrastTests {
    @Test("Reading tokens keep WCAG AA contrast in every Dynamic Type category and appearance")
    func readingTokens() throws {
        let sizes: [UIContentSizeCategory] = [.extraSmall, .small, .medium, .large,
            .extraLarge, .extraExtraLarge, .extraExtraExtraLarge, .accessibilityMedium,
            .accessibilityLarge, .accessibilityExtraLarge, .accessibilityExtraExtraLarge,
            .accessibilityExtraExtraExtraLarge]
        for style in [UIUserInterfaceStyle.light, .dark] {
            for contrast in [UIAccessibilityContrast.normal, .high] {
                for size in sizes {
                    let traits = UITraitCollection(traitsFrom: [
                        UITraitCollection(userInterfaceStyle: style),
                        UITraitCollection(accessibilityContrast: contrast),
                        UITraitCollection(preferredContentSizeCategory: size)
                    ])
                    let page = try rgb(UIColor.vpBackground, traits)
                    let surface = try rgb(UIColor.vpSurface, traits)
                    let lavender = try rgb(UIColor.vpLavender, traits)
                    let preview = zip(lavender, page).map { $0 * 0.18 + $1 * 0.82 }
                    let badge = zip(lavender, surface).map { $0 * 0.22 + $1 * 0.78 }
                    for foreground in [UIColor.label, UIColor.vpSecondaryText, UIColor.vpBrand] {
                        for background in [page, surface, preview, badge] {
                            let ratio = ratio(try rgb(foreground, traits), background)
                            // Use the stricter small-text threshold even at maximum size.
                            #expect(ratio >= 4.5, "Ratio \(ratio), style \(style.rawValue), size \(size.rawValue), contrast \(contrast.rawValue)")
                        }
                    }
                    #expect(ratio([1, 1, 1], try rgb(UIColor.vpBrandFill, traits)) >= 4.5)
                }
            }
        }
    }

    private func rgb(_ color: UIColor, _ traits: UITraitCollection) throws -> [Double] {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        #expect(color.resolvedColor(with: traits).getRed(&r, green: &g, blue: &b, alpha: &a))
        #expect(a == 1)
        return [Double(r), Double(g), Double(b)]
    }

    private func ratio(_ foreground: [Double], _ background: [Double]) -> Double {
        func luminance(_ rgb: [Double]) -> Double {
            let linear = rgb.map { $0 <= 0.04045 ? $0 / 12.92 : pow(($0 + 0.055) / 1.055, 2.4) }
            return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
        }
        let a = luminance(foreground), b = luminance(background)
        return (max(a, b) + 0.05) / (min(a, b) + 0.05)
    }
}

@MainActor
struct ReadableTextLayoutTests {
    @Test("Native reading copy responds to live locale and maximum text changes without losing content")
    func updatesInPlace() async throws {
        func root(_ locale: String, _ size: DynamicTypeSize) -> AnyView {
            AnyView(VPReadableText("preview.message", style: .footnote, color: .vpSecondaryText)
                .environment(\.locale, Locale(identifier: locale))
                .environment(\.dynamicTypeSize, size)
                .environment(\.layoutDirection, locale == "ar" ? .rightToLeft : .leftToRight)
                .frame(width: 300))
        }
        let host = UIHostingController(rootView: root("en", .large))
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let previousWindow = scene.windows.first(where: \.isKeyWindow)
        let window = UIWindow(windowScene: scene)
        window.rootViewController = host
        window.makeKeyAndVisible()
        defer {
            window.isHidden = true
            window.rootViewController = nil
            previousWindow?.makeKeyAndVisible()
        }
        host.view.layoutIfNeeded()
        func label(in view: UIView) -> UILabel? {
            if let result = view as? UILabel { return result }
            return view.subviews.lazy.compactMap { label(in: $0) }.first
        }
        func renderedLabel(_ expected: String) async throws -> UILabel {
            for _ in 0..<100 {
                host.view.layoutIfNeeded()
                if let current = label(in: host.view), current.text == expected { return current }
                try await Task.sleep(for: .milliseconds(10))
            }
            let current = try #require(label(in: host.view))
            #expect(current.text == expected)
            return current
        }
        let english = try await renderedLabel("Live data, accounts, AI, booking, and payments are not connected in this version.")
        #expect(english.text == "Live data, accounts, AI, booking, and payments are not connected in this version.")
        // Exercise the UILabel's actual retained color, not just the palette:
        // a Color -> UIColor round trip on iOS17 would freeze both to light ink.
        for (appearance, expected) in [(UIUserInterfaceStyle.light, CGFloat(0.30)), (.dark, CGFloat(0.80))] {
            let resolved = english.textColor.resolvedColor(with: UITraitCollection(userInterfaceStyle: appearance))
            var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
            #expect(resolved.getRed(&red, green: &green, blue: &blue, alpha: &alpha))
            #expect(abs(red - expected) < 0.001)
            #expect(abs(green - expected) < 0.001)
            #expect(abs(blue - expected) < 0.001)
            #expect(alpha == 1)
        }
        let initialFontSize = english.font.pointSize
        let initialHeight = english.sizeThatFits(CGSize(width: 300, height: CGFloat.greatestFiniteMagnitude)).height

        host.rootView = root("zh-Hans", .accessibility5)
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()
        let chinese = try await renderedLabel("此版本尚未连接实时数据、账号、AI、预订或支付。")
        #expect(chinese.text == "此版本尚未连接实时数据、账号、AI、预订或支付。")
        #expect(chinese.font.pointSize > initialFontSize * 2)
        #expect(chinese.sizeThatFits(CGSize(width: 300, height: CGFloat.greatestFiniteMagnitude)).height > initialHeight * 2)
        #expect(chinese.numberOfLines == 0)
        #expect(chinese.bounds.height >= chinese.sizeThatFits(CGSize(width: 300, height: CGFloat.greatestFiniteMagnitude)).height - 0.5)
        #expect(chinese.bounds.width <= 300)
        for (locale, expected) in [
            ("es", "Esta versión aún no conecta datos en vivo, cuentas, IA, reservas ni pagos."),
            ("ru", "В этой версии не подключены актуальные данные, аккаунты, ИИ, бронирование и оплата."),
            ("ar", "لا تتصل هذه النسخة بالبيانات المباشرة أو الحسابات أو الذكاء الاصطناعي أو الحجز أو الدفع.")
        ] {
            host.rootView = root(locale, .accessibility5)
            host.view.setNeedsLayout()
            let legacy = try await renderedLabel(expected)
            #expect(legacy.font.pointSize > initialFontSize * 2)
            #expect(legacy.semanticContentAttribute == (locale == "ar" ? .forceRightToLeft : .forceLeftToRight))
            #expect(legacy.bounds.width <= 300)
        }

        host.rootView = root("en", .large)
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()
        let restored = try await renderedLabel("Live data, accounts, AI, booking, and payments are not connected in this version.")
        #expect(restored.text == "Live data, accounts, AI, booking, and payments are not connected in this version.")
        #expect(abs(restored.font.pointSize - initialFontSize) < 0.1)
        #expect(abs(restored.sizeThatFits(CGSize(width: 300, height: CGFloat.greatestFiniteMagnitude)).height - initialHeight) < 0.5)
    }
}

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
                    let page = try rgb(UIColor(Color.vpBackground), traits)
                    let surface = try rgb(UIColor(Color.vpSurface), traits)
                    let lavender = try rgb(UIColor(Color.vpLavender), traits)
                    let preview = zip(lavender, page).map { $0 * 0.18 + $1 * 0.82 }
                    let badge = zip(lavender, surface).map { $0 * 0.22 + $1 * 0.78 }
                    for foreground in [UIColor.label, UIColor(Color.vpSecondaryText), UIColor(Color.vpBrand)] {
                        for background in [page, surface, preview, badge] {
                            let ratio = ratio(try rgb(foreground, traits), background)
                            // Use the stricter small-text threshold even at maximum size.
                            #expect(ratio >= 4.5, "Ratio \(ratio), style \(style.rawValue), size \(size.rawValue), contrast \(contrast.rawValue)")
                        }
                    }
                    #expect(ratio([1, 1, 1], try rgb(UIColor(Color.vpBrandFill), traits)) >= 4.5)
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

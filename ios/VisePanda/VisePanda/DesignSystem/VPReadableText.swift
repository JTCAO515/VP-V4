import SwiftUI
import UIKit

/// Native text metrics for scrollable copy. UILabel keeps its accessibility
/// geometry tied to the rendered text when Dynamic Type and scroll offsets change.
struct VPReadableText: UIViewRepresentable {
    let key: String
    var style: UIFont.TextStyle = .body
    var weight: UIFont.Weight? = nil
    var color: UIColor = .label
    var identifier: String? = nil
    var fillsWidth = true
    var tracking: CGFloat = 0
    @Environment(\.locale) private var locale
    @Environment(\.dynamicTypeSize) private var textSize
    @Environment(\.layoutDirection) private var direction

    init(_ key: String, style: UIFont.TextStyle = .body, weight: UIFont.Weight? = nil,
         color: UIColor = .label, identifier: String? = nil, fillsWidth: Bool = true, tracking: CGFloat = 0) {
        self.key = key
        self.style = style
        self.weight = weight
        self.color = color
        self.identifier = identifier
        self.fillsWidth = fillsWidth
        self.tracking = tracking
    }

    func makeUIView(context: Context) -> UILabel {
        let label = UILabel()
        label.numberOfLines = 0
        label.adjustsFontForContentSizeCategory = true
        label.setContentCompressionResistancePriority(.required, for: .vertical)
        label.setContentHuggingPriority(.defaultLow, for: .horizontal)
        return label
    }

    func updateUIView(_ label: UILabel, context: Context) {
        let bundle = Bundle.main.path(forResource: locale.identifier, ofType: "lproj")
            .flatMap(Bundle.init(path:)) ?? .main
        label.text = bundle.localizedString(forKey: key, value: nil, table: nil)
        let traits = UITraitCollection(preferredContentSizeCategory: textSize.contentSizeCategory)
        let preferred = UIFont.preferredFont(forTextStyle: style, compatibleWith: traits)
        let font: UIFont
        if let weight {
            let descriptor = preferred.fontDescriptor.addingAttributes([
                .traits: [UIFontDescriptor.TraitKey.weight: weight]
            ])
            font = UIFont(descriptor: descriptor, size: preferred.pointSize)
        } else {
            font = preferred
        }
        label.font = font
        if tracking != 0, let text = label.text {
            label.attributedText = NSAttributedString(string: text, attributes: [.font: font, .kern: tracking])
        }
        label.textColor = color
        label.accessibilityIdentifier = identifier
        label.semanticContentAttribute = direction == .rightToLeft ? .forceRightToLeft : .forceLeftToRight
        label.textAlignment = .natural
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UILabel, context: Context) -> CGSize? {
        guard let width = proposal.width, width.isFinite, width > 0 else { return nil }
        let fitted = uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
        return CGSize(width: fillsWidth ? width : min(width, fitted.width), height: fitted.height)
    }
}

private extension DynamicTypeSize {
    var contentSizeCategory: UIContentSizeCategory {
        switch self {
        case .xSmall: .extraSmall
        case .small: .small
        case .medium: .medium
        case .large: .large
        case .xLarge: .extraLarge
        case .xxLarge: .extraExtraLarge
        case .xxxLarge: .extraExtraExtraLarge
        case .accessibility1: .accessibilityMedium
        case .accessibility2: .accessibilityLarge
        case .accessibility3: .accessibilityExtraLarge
        case .accessibility4: .accessibilityExtraExtraLarge
        case .accessibility5: .accessibilityExtraExtraExtraLarge
        @unknown default: .large
        }
    }
}

import SwiftUI

struct BrandHeader: View {
    var body: some View {
        HStack(spacing: 12) {
            Image("PandaMark")
                .resizable()
                .scaledToFit()
                .frame(width: 48, height: 48)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                // Keep the established header height across asset aspect ratios.
                // Fit the complete image; never stretch or crop the approved mark.
                BrandWordmark(width: 156, maxHeight: 36)

                VPReadableText("brand.tagline", style: .caption1, color: .vpSecondaryText)
            }

            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text(verbatim: "Vise Panda. ") + Text("brand.tagline"))
    }
}

// The heart wordmark uses a complete 3:1 transparent canvas.
struct BrandWordmark: View {
    let width: CGFloat
    var maxHeight: CGFloat? = nil

    var body: some View {
        Image("BrandWordmark")
            .resizable()
            .scaledToFit()
            .frame(width: width, height: maxHeight ?? width / 3, alignment: .leading)
            .environment(\.layoutDirection, .leftToRight)
            .accessibilityHidden(true)
    }
}

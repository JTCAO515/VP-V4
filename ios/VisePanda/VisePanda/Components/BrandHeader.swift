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
                BrandWordmark(width: 156)

                Text("brand.tagline")
                    .font(.caption)
                    .foregroundStyle(Color.vpSecondaryText)
            }

            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text(verbatim: "Vise Panda. ") + Text("brand.tagline"))
    }
}

// Crop only the display viewport; retain the original supplied PNG in the catalog.
struct BrandWordmark: View {
    let width: CGFloat

    var body: some View {
        Image("BrandWordmark")
            .resizable()
            .frame(width: width * 1448 / 1356, height: width * 1086 / 1356)
            .offset(x: -width * 64 / 1356, y: -width * 398 / 1356)
            .frame(width: width, height: width * 308 / 1356, alignment: .topLeading)
            .clipped()
            .environment(\.layoutDirection, .leftToRight)
            .accessibilityHidden(true)
    }
}

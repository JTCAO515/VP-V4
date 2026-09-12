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

// The heart wordmark uses a complete 3:1 transparent canvas.
struct BrandWordmark: View {
    let width: CGFloat

    var body: some View {
        Image("BrandWordmark")
            .resizable()
            .scaledToFit()
            .frame(width: width, height: width / 3)
            .environment(\.layoutDirection, .leftToRight)
            .accessibilityHidden(true)
    }
}

import SwiftUI

struct BrandHeader: View {
    var body: some View {
        HStack(spacing: 12) {
            Image("PandaMark")
                .resizable()
                .scaledToFill()
                .frame(width: 48, height: 48)
                .clipShape(Circle())
                .overlay(Circle().stroke(Color.vpAccent.opacity(0.45), lineWidth: 1))
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text("VisePanda.")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(Color.vpBrand)

                Text("brand.tagline")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }
}

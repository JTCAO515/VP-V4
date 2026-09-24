import SwiftUI

struct PreviewStatusBanner: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                if !dynamicTypeSize.isAccessibilitySize {
                    Image(systemName: "eye")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Color.vpBrand)
                        .accessibilityHidden(true)
                }
                VPReadableText("preview.title", style: .subheadline, weight: .semibold)
            }
            VPReadableText("preview.message", style: .footnote, color: .vpSecondaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color.vpLavender.opacity(0.18), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

struct AvailabilityBadge: View {
    var body: some View {
        Label("preview.badge", systemImage: "clock")
            .font(.caption.weight(.semibold))
            .foregroundStyle(Color.vpBrand)
            .padding(.horizontal, 11)
            .padding(.vertical, 7)
            .background(Color.vpLavender.opacity(0.22), in: Capsule())
            .accessibilityElement(children: .combine)
    }
}

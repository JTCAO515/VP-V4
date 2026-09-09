import SwiftUI

struct PreviewStatusBanner: View {
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "eye")
                .font(.body.weight(.semibold))
                .foregroundStyle(Color.vpBrand)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 3) {
                Text("preview.title")
                    .font(.subheadline.weight(.semibold))

                Text("preview.message")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
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

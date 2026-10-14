import SwiftUI

/// Three independent floating controls, not an opaque navigation-bar strip.
struct NativeMuseChatHeader: View {
    var avatarImage: Image?
    var avatarScale: CGFloat
    /// Fraction of avatarSide, supplied by the original-image owner.
    var avatarVerticalOffset: CGFloat
    let sidebar: () -> Void
    let assistant: () -> Void
    let referral: () -> Void
    private let avatarSide: CGFloat = 56
    var body: some View {
        HStack(alignment: .top) {
            Button(action: sidebar) {
                VStack(alignment: .leading, spacing: 5) {
                    Capsule().frame(width: 20, height: 1.7)
                    Capsule().frame(width: 20, height: 1.7)
                }.frame(width: 46, height: 46)
            }.floatingControl().accessibilityLabel("打开本地对话侧栏")
                .accessibilityIdentifier("muse.chat.sidebar.open")
            Spacer(minLength: 16)
            Button(action: assistant) {
                VStack(spacing: -2) {
                    ZStack {
                        Circle().fill(.ultraThinMaterial)
                        if let avatarImage {
                            avatarImage.resizable().scaledToFill()
                                .frame(width: avatarSide, height: avatarSide)
                                .scaleEffect(max(0.1, avatarScale))
                                .offset(x: -avatarSide * 0.05, y: avatarSide * avatarVerticalOffset)
                        } else {
                            Circle().strokeBorder(.secondary.opacity(0.25), lineWidth: 1)
                        }
                    }
                    .frame(width: avatarSide, height: avatarSide).clipShape(Circle())
                    .overlay { Circle().strokeBorder(.white.opacity(0.7), lineWidth: 1) }
                    Text("VisePanda").font(.system(size: 12, weight: .semibold))
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(.ultraThinMaterial, in: Capsule())
                }
            }.buttonStyle(.plain)
                .accessibilityLabel(avatarImage == nil ? "VisePanda 助手详情，原头像待接入" : "VisePanda 助手详情")
                .accessibilityIdentifier("muse.chat.assistant")
            Spacer(minLength: 16)
            Button(action: referral) { Image(systemName: "gift").font(.system(size: 21, weight: .regular)).frame(width: 46, height: 46) }
                .floatingControl().accessibilityLabel("打开邀请页面")
                .accessibilityIdentifier("muse.chat.referral")
        }
        .foregroundStyle(.primary).padding(.horizontal, 18).padding(.top, 6)
    }
}

private extension View {
    func floatingControl() -> some View {
        buttonStyle(.plain).background(.ultraThinMaterial, in: Circle())
            .overlay { Circle().strokeBorder(.primary.opacity(0.08), lineWidth: 0.7) }
            .shadow(color: .black.opacity(0.04), radius: 8, y: 2)
    }
}

struct NativeMuseChatReferralView: View {
    let close: () -> Void
    var body: some View {
        NavigationStack {
            Color(uiColor: .systemBackground)
                .navigationTitle("邀请").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("关闭", action: close) } }
        }
    }
}

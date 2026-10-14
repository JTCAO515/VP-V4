import SwiftUI

/// Content for the Chat owner's drawer. Main's presentation state owns all local history.
@MainActor
struct NativeMuseChatSidebarView: View {
    let state: NativeFrontendState
    let onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(spacing: 12) {
                Text("对话").font(.title2.weight(.semibold))
                Spacer(minLength: 0)
                Button(action: onClose) {
                    Image(systemName: "xmark").font(.body.weight(.medium))
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("关闭侧栏，返回对话")
                .accessibilityIdentifier("frontend.chat.sidebar.close")
            }

            Button {
                state.startLocalConversation()
                onClose()
            } label: {
                Label("新对话", systemImage: "square.and.pencil")
                    .font(.body.weight(.semibold))
                    .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                    .padding(.horizontal, 14)
                    .background(Color.accentColor.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
            }
            .buttonStyle(.plain)
            .accessibilityHint("开始空白的本地样例对话并关闭侧栏")
            .accessibilityIdentifier("frontend.chat.sidebar.new")

            VStack(alignment: .leading, spacing: 6) {
                Text("本地样例历史").font(.headline)
                Text("未接入真实历史服务；仅用于本次本地体验。")
                    .font(.caption).foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityIdentifier("frontend.chat.sidebar.boundary")

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 8) {
                    ForEach(state.localConversations) { conversation in
                        conversationRow(conversation)
                    }
                }
            }
            .accessibilityIdentifier("frontend.chat.sidebar.history")
        }
        .padding(20)
        .frame(maxWidth: 320, maxHeight: .infinity, alignment: .topLeading)
        .background(Color(uiColor: .systemGroupedBackground))
    }

    private func conversationRow(_ conversation: NativeFrontendConversation) -> some View {
        let selected = conversation.id == state.activeLocalConversationID
        return Button {
            state.selectLocalConversation(conversation.id)
            onClose()
        } label: {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "bubble.left").padding(.top, 2)
                VStack(alignment: .leading, spacing: 5) {
                    Text(conversation.title).font(.subheadline.weight(selected ? .semibold : .regular))
                        .fixedSize(horizontal: false, vertical: true)
                    Text(selected ? "当前对话 · 本地样例" : "本地样例")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                if selected { Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.accentColor) }
            }
            .multilineTextAlignment(.leading)
            .foregroundStyle(.primary)
            .padding(14)
            .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
            .background(selected ? Color.accentColor.opacity(0.08) : Color(uiColor: .secondarySystemGroupedBackground),
                        in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? .isSelected : [])
        .accessibilityHint("打开这段本地样例对话并关闭侧栏")
        .accessibilityIdentifier("frontend.chat.sidebar.session.\(conversation.id)")
    }
}

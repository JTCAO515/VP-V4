import SwiftUI

/// Install in Main's bottom safeAreaInset within the existing TabView.
/// No request, persistence, draft clearing or authorization is owned by this view.
@MainActor
struct NativeQAComposer: View {
    @Binding var draft: String
    let canSend: Bool
    let isBusy: Bool
    let hasUnconfirmedRequest: Bool
    let chinese: Bool
    let isCurrent: @MainActor () -> Bool
    let onSend: NativeQAComposerAccess.Send

    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @FocusState private var focused: Bool
    @State private var attempt = NativeQAComposerAttempt()

    init(
        draft: Binding<String>, canSend: Bool, isBusy: Bool,
        hasUnconfirmedRequest: Bool, chinese: Bool,
        isCurrent: @escaping @MainActor () -> Bool,
        onSend: @escaping NativeQAComposerAccess.Send
    ) {
        _draft = draft
        self.canSend = canSend
        self.isBusy = isBusy
        self.hasUnconfirmedRequest = hasUnconfirmedRequest
        self.chinese = chinese
        self.isCurrent = isCurrent
        self.onSend = onSend
    }

    private var current: Bool { scenePhase == .active && isCurrent() }
    private var editable: Bool { current && !isBusy && !hasUnconfirmedRequest && !attempt.isLatched }
    private var sendEnabled: Bool { editable && canSend && NativeQAComposerAccess.validInput(draft) }
    private func copy(_ zh: String, _ en: String) -> String { chinese ? zh : en }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if current {
                HStack(alignment: .bottom, spacing: 8) {
                    TextField(copy("开始聊天", "Start chatting"), text: protectedDraft, axis: .vertical)
                        .font(.body)
                        .lineLimit(1...(dynamicTypeSize.isAccessibilitySize ? 3 : 5))
                        .frame(minHeight: 44)
                        .focused($focused)
                        .disabled(!editable)
                        // Return inserts a newline. Only the explicit send button sends.
                        .accessibilityLabel(copy("开始聊天", "Start chatting"))
                        .accessibilityHint(copy("支持换行，使用发送按钮提问。", "Supports new lines. Use Send to ask your question."))
                        .accessibilityIdentifier("native.qa.input")
                    Button(action: send) {
                        Image(systemName: "arrow.up")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(sendEnabled ? Color.white : Color.vpSecondaryText)
                            .frame(width: 44, height: 44)
                            .background(sendEnabled ? Color.vpBrandFill : Color.vpSurface, in: Circle())
                    }
                    .buttonStyle(.plain)
                    .disabled(!sendEnabled)
                    .accessibilityLabel(copy("发送", "Send"))
                    .accessibilityIdentifier("native.qa.send")
                }
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(Color.vpSurface, in: RoundedRectangle(cornerRadius: 26))
                .overlay { RoundedRectangle(cornerRadius: 26).strokeBorder(Color.primary.opacity(0.12)) }

                if hasUnconfirmedRequest {
                    notice(copy("上次请求结果尚待确认，请先核对已保存状态。", "The previous request needs confirmation. Check saved state first."))
                } else if isBusy || attempt.isLatched {
                    notice(copy("正在核对请求状态…", "Checking request state…"))
                } else if draft.utf16.count > NativeQAComposerAccess.maximumUTF16Count {
                    notice(copy("问题超过长度限制，请缩短后发送。", "The question exceeds the length limit. Shorten it before sending."))
                }
            } else {
                notice(copy("输入已暂停。", "Input is paused."))
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 8)
        .background(.regularMaterial)
        .accessibilityIdentifier("native.qa.composer")
        .onChange(of: current) { _, value in
            if !value { focused = false; attempt.invalidate() }
        }
        .onChange(of: isBusy) { _, busy in if busy { focused = false } }
        .onChange(of: hasUnconfirmedRequest) { _, pending in if pending { focused = false } }
        .onDisappear { focused = false; attempt.invalidate() }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                if current && focused {
                    Spacer()
                    Button(copy("完成", "Done")) { focused = false }
                        .accessibilityLabel(copy("收起键盘", "Dismiss keyboard"))
                        .accessibilityIdentifier("native.qa.composer.done")
                }
            }
        }
    }

    private var protectedDraft: Binding<String> {
        NativeQAComposerAccess.protectedDraft($draft, isCurrent: { current }, canEdit: { editable })
    }

    private func notice(_ text: String) -> some View {
        Text(text).font(.footnote).foregroundStyle(Color.vpSecondaryText)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityIdentifier("native.qa.composer.notice")
    }

    private func send() {
        if NativeQAComposerAccess.send(
            draft: $draft, canSend: canSend, isBusy: isBusy,
            hasUnconfirmedRequest: hasUnconfirmedRequest, attempt: attempt,
            isCurrent: { current }, onSend: onSend
        ) { focused = false }
    }
}

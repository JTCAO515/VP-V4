import SwiftUI

/// Install in Chat's bottom safeAreaInset, inside Main's existing four-tab shell.
/// Tools are supplied by Chat so its local-sample sheets retain their explanations.
@MainActor struct NativeMuseChatComposerView: View {
    let state: NativeFrontendState
    let onAttach: () -> Void
    let onExpression: () -> Void
    let onPlace: () -> Void
    let onVoice: () -> Void
    @Environment(\.locale) private var locale
    @FocusState private var composerFocused: Bool
    @State private var voicePresentation: NativeLocalVoicePresentation?

    init(
        state: NativeFrontendState,
        onAttach: @escaping () -> Void,
        onExpression: @escaping () -> Void,
        onPlace: @escaping () -> Void,
        onVoice: @escaping () -> Void
    ) {
        self.state = state
        self.onAttach = onAttach
        self.onExpression = onExpression
        self.onPlace = onPlace
        self.onVoice = onVoice
    }

    private var canSubmit: Bool {
        NativeMuseChatComposerPolicy.canSubmit(
            state.draft,
            blocked: state.screenState == .loading || state.screenState == .failed
        )
    }

    var body: some View {
        @Bindable var editable = state
        VStack(spacing: 6) {
            HStack(spacing: 4) {
                tools
                // Single-line field: Return and the send button share the same guard.
                // The binding retains the complete draft, including over-limit input.
                TextField(localized(.start), text: $editable.draft)
                    .font(.body)
                    .frame(minWidth: 44, minHeight: 44)
                    .layoutPriority(1)
                    .focused($composerFocused)
                    .submitLabel(.send)
                    .onSubmit { submitDraft() }
                    .accessibilityLabel(localized(.start))
                    .accessibilityHint(localized(.inputHint))
                    .accessibilityIdentifier("frontend.chat.composer")
                if NativeMuseChatComposerPolicy.showsVoice(for: state.draft) {
                    Button {
                        composerFocused = false
                        voicePresentation = NativeLocalVoicePresentation()
                    } label: {
                        Image(systemName: "waveform").font(.system(size: 20, weight: .medium))
                            .frame(width: 44, height: 44)
                    }
                    .accessibilityLabel(localized(.voice))
                    .accessibilityIdentifier("frontend.chat.voice")
                } else {
                    Button { submitDraft() } label: {
                        Image(systemName: "arrow.up").font(.system(size: 18, weight: .semibold))
                            .frame(width: 36, height: 36)
                            .foregroundStyle(.white)
                            .background(canSubmit ? Color.accentColor : Color.secondary, in: Circle())
                            .frame(width: 44, height: 44)
                    }
                    .disabled(!canSubmit)
                    .accessibilityLabel(localized(.send))
                    .accessibilityIdentifier("frontend.chat.send")
                }
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 6).padding(.vertical, 4)
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: Capsule())
            .overlay { Capsule().strokeBorder(Color.primary.opacity(0.08), lineWidth: 1) }

            if state.draft.count > NativeMuseChatComposerPolicy.maximumCharacters {
                Text(localized(.limit))
                    .font(.caption).foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityIdentifier("frontend.chat.composer.limit")
            }
        }
        .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 8)
        .background(.regularMaterial)
        .sheet(item: $voicePresentation) { _ in NativeLocalVoiceHost(state: state) }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                if composerFocused {
                    Spacer()
                    Button(localized(.done)) { composerFocused = false }
                        .accessibilityLabel(localized(.dismissKeyboard))
                        .accessibilityIdentifier("frontend.chat.composer.done")
                }
            }
        }
    }

    private func localized(_ text: NativeMuseChatComposerText) -> String {
        text.value(locale: locale)
    }

    private var tools: some View {
        Menu {
            Button { openTool(onAttach) } label: { Label(localized(.attachment), systemImage: "paperclip") }
                .accessibilityIdentifier("frontend.chat.attachment")
            Button { openTool(onExpression) } label: { Label(localized(.expression), systemImage: "character.bubble") }
                .accessibilityIdentifier("frontend.chat.expression")
            Button { openTool(onPlace) } label: { Label(localized(.place), systemImage: "mappin") }
                .accessibilityIdentifier("frontend.chat.place")
        } label: {
            Image(systemName: "plus").font(.system(size: 20, weight: .medium))
                .frame(width: 44, height: 44)
        }
        .accessibilityLabel(localized(.tools))
        .accessibilityIdentifier("frontend.chat.composer.tools")
    }

    private func openTool(_ action: () -> Void) {
        composerFocused = false
        action()
    }

    private func submitDraft() {
        guard canSubmit else { return }
        state.submit()
        composerFocused = false
    }
}

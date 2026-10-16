import SwiftUI

/// Synthetic compile fixture only. The real ServiceView is owned by integration.
@MainActor
func nativeQAComposerCompletionCompileFixture(
    draft: Binding<String>,
    isCurrent: @escaping @MainActor () -> Bool,
    send: @escaping @MainActor () async -> Void
) -> some View {
    NativeQAComposer(
        draft: draft, canSend: true, isBusy: false,
        hasUnconfirmedRequest: false, chinese: true, isCurrent: isCurrent,
        onSend: { complete in
            Task { @MainActor in
                defer { complete() }
                guard isCurrent(), !Task.isCancelled else { return }
                await send()
            }
        }
    )
}

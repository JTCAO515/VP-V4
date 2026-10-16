import Foundation
import Observation
import SwiftUI

/// Only the UI invocation identity is retained, never input or request data.
@MainActor @Observable
final class NativeQAComposerAttempt {
    private var token: UUID?
    var isLatched: Bool { token != nil }

    fileprivate func begin() -> UUID? {
        guard token == nil else { return nil }
        let next = UUID()
        token = next
        return next
    }

    fileprivate func complete(_ completed: UUID) {
        guard token == completed else { return }
        token = nil
    }

    func invalidate() { token = nil }
}

/// UI-only guards. The owner must capture the exact scope/session/projection generation
/// in isCurrent; checking only that *some* account is signed in is insufficient.
@MainActor
enum NativeQAComposerAccess {
    typealias Completion = @MainActor () -> Void
    /// Owner calls completion exactly when its invocation returns, including
    /// refusal/cancellation. Completion is local invocation end, not server success.
    typealias Send = @MainActor (@escaping Completion) -> Void
    static let maximumUTF16Count = 4000

    static func validInput(_ text: String) -> Bool {
        text.utf16.count <= maximumUTF16Count
            && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    static func protectedDraft(
        _ draft: Binding<String>,
        isCurrent: @escaping @MainActor () -> Bool,
        canEdit: @escaping @MainActor () -> Bool
    ) -> Binding<String> {
        Binding(
            get: { isCurrent() ? draft.wrappedValue : "" },
            set: { value in
                guard isCurrent(), canEdit() else { return }
                // No truncation, trimming, normalization, deferred writes or private copy.
                draft.wrappedValue = value
            }
        )
    }

    @discardableResult
    static func send(
        draft: Binding<String>, canSend: Bool, isBusy: Bool,
        hasUnconfirmedRequest: Bool, attempt: NativeQAComposerAttempt,
        isCurrent: @MainActor () -> Bool, onSend: Send
    ) -> Bool {
        guard isCurrent(), canSend, !isBusy, !hasUnconfirmedRequest, !attempt.isLatched,
              validInput(draft.wrappedValue), let token = attempt.begin() else { return false }
        // Close the tap -> owner's async busy publication gap synchronously.
        // A late/duplicate completion cannot release a successor invocation.
        // This never reauthorizes scope, restores focus, or reads/writes drafts.
        onSend { attempt.complete(token) }
        return true
    }
}

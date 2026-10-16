import Foundation
import SwiftUI

/// UI-only guards. The owner must capture the exact scope/session/projection generation
/// in isCurrent; checking only that *some* account is signed in is insufficient.
@MainActor
enum NativeQAComposerAccess {
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
        hasUnconfirmedRequest: Bool, latched: inout Bool,
        isCurrent: @MainActor () -> Bool, onSend: @MainActor () -> Void
    ) -> Bool {
        guard isCurrent(), canSend, !isBusy, !hasUnconfirmedRequest, !latched,
              validInput(draft.wrappedValue) else { return false }
        // Close the tap -> owner's async busy publication gap synchronously.
        latched = true
        onSend()
        return true
    }
}

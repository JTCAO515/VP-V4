import Foundation

/// Presentation guard only; the shared state remains the submission authority.
enum NativeMuseChatComposerPolicy {
    static let maximumCharacters = 2000

    static func showsVoice(for draft: String) -> Bool {
        draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    static func canSubmit(_ draft: String, blocked: Bool) -> Bool {
        !blocked && !showsVoice(for: draft) && draft.count <= maximumCharacters
    }
}

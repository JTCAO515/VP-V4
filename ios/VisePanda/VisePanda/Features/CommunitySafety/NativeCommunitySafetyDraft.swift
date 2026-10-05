import Foundation

/// Explicit user input only. Authority and eligible targets come from the server.
struct NativeCommunitySafetyDraft: Equatable {
    var explanation = ""
    var confirmed = false

    var boundedExplanation: String {
        explanation.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func isValid(limit: Int) -> Bool {
        confirmed && !boundedExplanation.isEmpty && boundedExplanation.utf16.count <= limit
    }
}

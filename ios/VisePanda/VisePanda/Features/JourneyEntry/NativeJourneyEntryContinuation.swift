import Foundation

/// A missing parent on an existing goal must not create a second goal.
enum NativeJourneyEntryContinuation {
    static func relationship(authorized: Bool, pending: Bool, goalVersion: Int?, hasCurrentParent: Bool) -> String? {
        guard authorized, !pending else { return nil }
        guard let goalVersion else { return "goal_start" }
        guard (1..<10001).contains(goalVersion), hasCurrentParent else { return nil }
        return "follow_up"
    }

    static func validIdea(_ value: String) -> Bool {
        let text = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return !text.isEmpty && text.utf16.count <= 4000
    }
}

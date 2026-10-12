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

/// Source identity for an ephemeral read, never a persistence or consent grant.
struct NativeJourneyReadAnchor: Equatable {
    let conversationID: String
    let goalID: String
    let goalVersion: Int
    let messageID: String
    var valid: Bool {
        [conversationID, goalID, messageID].allSatisfy { UUID(uuidString: $0) != nil }
            && (1...10000).contains(goalVersion)
    }
    func accepts(_ source: Self, started: TimeInterval, now: TimeInterval) -> Bool {
        valid && self == source && started.isFinite && now.isFinite
            && now >= started && now - started < 20
    }
}

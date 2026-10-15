import Foundation
import CoreFoundation

enum NativeJourneyGoalReturnWire {
    struct Scope: Equatable {
        let conversationID: String
        let goalID: String
        let goalVersion: Int
        let parentMessageID: String
        let inputSequence: Int
        var valid: Bool {
            [conversationID, goalID, parentMessageID].allSatisfy(canonicalUUID)
                && (1...10000).contains(goalVersion) && (1...1000000).contains(inputSequence)
        }
        var query: [URLQueryItem] {
            [.init(name: "conversationId", value: conversationID), .init(name: "goalId", value: goalID),
             .init(name: "goalVersion", value: String(goalVersion)), .init(name: "parentMessageId", value: parentMessageID),
             .init(name: "inputSequence", value: String(inputSequence))]
        }
    }
    struct Reference: Equatable {
        let artifactID: String
        let revision: Int
        /// Canonical publication sequence; never converted to floating point or
        /// interpreted as wall-clock/commit chronology.
        let eventID: String
    }
    enum Response: Equatable { case unavailable; case reference(Reference) }
    enum InvalidWire: Error { case invalid }
    static func canonicalUUID(_ value: String) -> Bool {
        value.range(of: "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", options: .regularExpression) != nil
            && UUID(uuidString: value)?.uuidString.lowercased() == value
    }
    private static func integer(_ value: Any?, maximum: Int) -> Int? {
        guard let n = value as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(),
              n.doubleValue.isFinite, n.doubleValue.rounded() == n.doubleValue,
              n.doubleValue >= 1, n.doubleValue <= Double(maximum) else { return nil }
        return n.intValue
    }
    static func decode(_ bytes: Data, expected: Scope) throws -> Response {
        guard expected.valid, bytes.count <= 16384,
              let root = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              integer(root["version"], maximum: 5) == 5,
              let next = root["nextStep"] as? [String: Any], Set(next.keys) == ["kind"],
              next["kind"] as? String == "unknown" else { throw InvalidWire.invalid }
        if root["kind"] as? String == "unavailable" {
            guard Set(root.keys) == ["version", "kind", "nextStep"] else { throw InvalidWire.invalid }
            return .unavailable
        }
        guard Set(root.keys) == ["version", "kind", "schemaVersion", "scope", "lastDecision", "nextStep"],
              root["kind"] as? String == "goal_return", root["schemaVersion"] as? String == "goal-return/1",
              let scope = root["scope"] as? [String: Any],
              Set(scope.keys) == ["conversationId", "goalId", "goalVersion", "parentMessageId", "inputSequence"],
              scope["conversationId"] as? String == expected.conversationID,
              scope["goalId"] as? String == expected.goalID,
              scope["parentMessageId"] as? String == expected.parentMessageID,
              integer(scope["goalVersion"], maximum: 10000) == expected.goalVersion,
              integer(scope["inputSequence"], maximum: 1000000) == expected.inputSequence,
              let reference = root["lastDecision"] as? [String: Any],
              Set(reference.keys) == ["artifactId", "revision", "eventId"],
              let id = reference["artifactId"] as? String, canonicalUUID(id),
              let revision = integer(reference["revision"], maximum: 1000),
              let event = reference["eventId"] as? String, (1...19).contains(event.utf8.count),
              event.first != "0", event.unicodeScalars.allSatisfy({ (48...57).contains($0.value) }),
              let number = Int64(event), number > 0 else { throw InvalidWire.invalid }
        return .reference(.init(artifactID: id, revision: revision, eventID: event))
    }
}

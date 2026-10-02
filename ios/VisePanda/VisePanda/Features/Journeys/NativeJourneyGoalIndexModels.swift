import Foundation

private struct JourneyIndexKey: CodingKey {
    let stringValue: String
    let intValue: Int? = nil
    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { return nil }
}

private func indexShape(_ decoder: Decoder, _ keys: Set<String>) throws {
    let container = try decoder.container(keyedBy: JourneyIndexKey.self)
    guard Set(container.allKeys.map(\.stringValue)) == keys else { throw NativeDataError.invalidResponse }
}

enum NativeJourneyGoalIndexWire {
    static func uuid(_ value: String) -> Bool {
        UUID(uuidString: value)?.uuidString.lowercased() == value
    }
    static func snapshot(_ value: String) -> Bool {
        value.range(of: "^[a-f0-9]{32}$", options: .regularExpression) != nil
    }
}

struct NativeJourneyGoalIndexCursor: Equatable {
    let rawValue: String
    let conversationID: String
    let goalID: String
    let snapshot: String
    var orderKey: String { conversationID + "." + goalID }

    init?(_ rawValue: String) {
        let parts = rawValue.split(separator: ".", omittingEmptySubsequences: false).map(String.init)
        guard parts.count == 4, parts[0] == "v1", NativeJourneyGoalIndexWire.uuid(parts[1]),
              NativeJourneyGoalIndexWire.uuid(parts[2]), NativeJourneyGoalIndexWire.snapshot(parts[3]) else { return nil }
        self.rawValue = rawValue; conversationID = parts[1]; goalID = parts[2]; snapshot = parts[3]
    }
}

struct NativeJourneyGoalIndexRow: Decodable, Identifiable, Equatable {
    let conversationId: String
    let goal: NativeJourneyGoal
    let relation: NativeJourneyRelation
    let tripHeadVersion: Int?
    var id: String { conversationId + "." + goal.goalId }
    var canAmend: Bool { goal.scopeVersion < 10001 }
    private enum CodingKeys: String, CodingKey { case conversationId, goalId, scopeVersion, text, relation }

    private struct Relation: Decodable {
        let projected: NativeJourneyRelation
        let headVersion: Int?
        private enum CodingKeys: String, CodingKey { case state, tripId, tripHeadVersion }
        init(from decoder: Decoder) throws {
            try indexShape(decoder, ["state", "tripId", "tripHeadVersion"])
            let c = try decoder.container(keyedBy: CodingKeys.self)
            let state = try c.decode(String.self, forKey: .state)
            // Unknown future relations never retain a Trip identifier or head.
            guard ["linked", "unlinked", "unknown"].contains(state) else {
                projected = .unknown; headVersion = nil; return
            }
            let tripID = try c.decodeIfPresent(String.self, forKey: .tripId)
            let head = try c.decodeIfPresent(Int.self, forKey: .tripHeadVersion)
            if state == "linked" {
                guard let tripID, NativeJourneyGoalIndexWire.uuid(tripID), let head, head >= 0 else { throw NativeDataError.invalidResponse }
                projected = .linked(tripID); headVersion = head
            } else {
                guard tripID == nil, head == nil else { throw NativeDataError.invalidResponse }
                projected = state == "unlinked" ? .unlinked : .unknown; headVersion = nil
            }
        }
    }

    init(from decoder: Decoder) throws {
        try indexShape(decoder, ["conversationId", "goalId", "scopeVersion", "text", "relation"])
        let c = try decoder.container(keyedBy: CodingKeys.self)
        conversationId = try c.decode(String.self, forKey: .conversationId)
        let goalID = try c.decode(String.self, forKey: .goalId)
        let version = try c.decode(Int.self, forKey: .scopeVersion)
        let text = try c.decode(String.self, forKey: .text)
        guard NativeJourneyGoalIndexWire.uuid(conversationId), NativeJourneyGoalIndexWire.uuid(goalID),
              (1...10001).contains(version), !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              text.unicodeScalars.count <= 4000 else { throw NativeDataError.invalidResponse }
        goal = NativeJourneyGoal(goalId: goalID, scopeVersion: version, text: text)
        let link = try c.decode(Relation.self, forKey: .relation)
        relation = link.projected; tripHeadVersion = link.headVersion
    }
}

struct NativeJourneyGoalIndexPage: Decodable, Equatable {
    let snapshot: String
    let goals: [NativeJourneyGoalIndexRow]
    let nextCursor: String?
    private enum CodingKeys: String, CodingKey { case version, kind, snapshot, goals, nextCursor }

    init(from decoder: Decoder) throws {
        try indexShape(decoder, ["version", "kind", "snapshot", "goals", "nextCursor"])
        let c = try decoder.container(keyedBy: CodingKeys.self)
        guard try c.decode(Int.self, forKey: .version) == 5,
              try c.decode(String.self, forKey: .kind) == "journeys_goal_index" else { throw NativeDataError.invalidResponse }
        snapshot = try c.decode(String.self, forKey: .snapshot)
        goals = try c.decode([NativeJourneyGoalIndexRow].self, forKey: .goals)
        nextCursor = try c.decodeIfPresent(String.self, forKey: .nextCursor)
        guard NativeJourneyGoalIndexWire.snapshot(snapshot), goals.count <= 20,
              zip(goals, goals.dropFirst()).allSatisfy({ $0.id < $1.id }) else { throw NativeDataError.invalidResponse }
        if let nextCursor {
            guard goals.count == 20, let last = goals.last,
                  nextCursor == "v1.\(last.id).\(snapshot)", NativeJourneyGoalIndexCursor(nextCursor) != nil else { throw NativeDataError.invalidResponse }
        }
    }

    func follows(_ cursor: NativeJourneyGoalIndexCursor?) -> Bool {
        guard let cursor else { return true }
        return snapshot == cursor.snapshot && goals.allSatisfy { $0.id > cursor.orderKey }
    }
}

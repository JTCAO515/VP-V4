import Foundation
import Observation

// A transient read projection. Goal text and Trip content retain their existing writers.
struct NativeJourneyGoal: Decodable, Identifiable, Equatable {
    let goalId: String
    let scopeVersion: Int
    let text: String
    var id: String { goalId }
    var valid: Bool { UUID(uuidString: goalId) != nil && scopeVersion > 0 && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && text.count <= 4000 }
}

private struct JourneyPageGoal: Decodable {
    let goalId: String
    let scopeVersion: Int
    let text: String
    let relation: JourneyPageRelation
    var goal: NativeJourneyGoal { .init(goalId: goalId, scopeVersion: scopeVersion, text: text) }
}

private struct JourneyPageRelation: Decodable {
    let state: String
    let tripId: String?
    let tripHeadVersion: Int?
    private enum CodingKeys: String, CodingKey { case state, tripId, tripHeadVersion }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        guard c.contains(.tripId), c.contains(.tripHeadVersion) else { throw NativeDataError.invalidResponse }
        state = try c.decode(String.self, forKey: .state)
        tripId = try c.decodeIfPresent(String.self, forKey: .tripId)
        tripHeadVersion = try c.decodeIfPresent(Int.self, forKey: .tripHeadVersion)
    }
    var valid: Bool {
        switch state {
        case "unlinked", "unknown": tripId == nil && tripHeadVersion == nil
        case "linked": tripId.map { UUID(uuidString: $0) != nil } == true && tripHeadVersion.map { $0 >= 0 } == true
        default: false
        }
    }
    func project(trips: [NativeTripSummary]) -> NativeJourneyRelation {
        if state == "unlinked" { return .unlinked }
        if state == "linked", let tripId, trips.contains(where: { $0.id == tripId && $0.headVersion == tripHeadVersion }) { return .linked(tripId) }
        return .unknown
    }
}

private struct JourneyPageRead: Decodable {
    let version: Int
    let kind: String
    let conversationId: String?
    let conversationVersion: Int
    let snapshot: String?
    let goals: [JourneyPageGoal]
    let nextCursor: String?
    func valid(cursor: String?) -> Bool {
        guard version == 5, kind == "journeys_page", goals.count <= 20,
              goals.allSatisfy({ $0.goal.valid && $0.scopeVersion <= 10001 && $0.relation.valid }),
              Set(goals.map(\.goalId)).count == goals.count,
              zip(goals, goals.dropFirst()).allSatisfy({ $0.0.goalId < $0.1.goalId }) else { return false }
        guard let conversationId else { return cursor == nil && conversationVersion == 0 && snapshot == nil && goals.isEmpty && nextCursor == nil }
        guard UUID(uuidString: conversationId) != nil, (1...1000001).contains(conversationVersion),
              let snapshot, snapshot.range(of: "^[a-f0-9]{32}$", options: .regularExpression) != nil else { return false }
        if let cursor {
            let parts = cursor.split(separator: ".")
            guard parts.count == 5, parts[0] == "v1", parts[1] == conversationId,
                  parts[2] == String(conversationVersion), parts[4] == snapshot, !goals.isEmpty,
                  goals.allSatisfy({ $0.goalId > String(parts[3]) }) else { return false }
        }
        if let nextCursor {
            guard goals.count == 20, let last = goals.last,
                  nextCursor == "v1.\(conversationId).\(conversationVersion).\(last.goalId).\(snapshot)" else { return false }
        }
        return true
    }
}

enum NativeJourneyRelation: Equatable {
    case unlinked, linked(String), unknown
}

struct NativeJourneyRow: Identifiable, Equatable {
    let goal: NativeJourneyGoal
    let relation: NativeJourneyRelation
    var id: String { goal.id }
}

@MainActor
@Observable
final class NativeJourneysStore {
    private(set) var scope: NativeDataScope?
    private(set) var rows: [NativeJourneyRow] = []
    private(set) var trips: [NativeTripSummary] = []
    private(set) var goalsAvailable = false
    private(set) var tripsAvailable = false
    private(set) var busy = false
    private(set) var conversationID: String?
    private(set) var nextCursor: String?
    private var generation = UUID()
    private var readableUntil: TimeInterval?
    private let uptime: () -> TimeInterval

    init(uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        self.uptime = uptime
    }

    func clear() {
        generation = UUID(); scope = nil; rows = []; trips = []
        goalsAvailable = false; tripsAvailable = false; readableUntil = nil; busy = false; nextCursor = nil; conversationID = nil
    }

    func isCurrent(_ current: NativeDataScope?) -> Bool {
        scope != nil && scope == current && readableUntil.map { uptime() < $0 } == true
    }

    // Fixed-path GET closures are supplied by the existing NativeSession transport.
    func load(scope requested: NativeDataScope?, assistant: Bool, cursor: String? = nil,
              currentScope: () -> NativeDataScope?,
              request: (String) async throws -> Data) async {
        clear()
        guard let requested, currentScope() == requested else { return }
        if let cursor, cursor.range(of: "^v1\\.[a-f0-9-]{36}\\.[1-9][0-9]{0,6}\\.[a-f0-9-]{36}\\.[a-f0-9]{32}$", options: .regularExpression) == nil { return }
        scope = requested; busy = true
        let token = generation
        let deadline = uptime() + 20
        func valid() -> Bool { !Task.isCancelled && generation == token && currentScope() == requested && uptime() < deadline }
        defer { if generation == token { busy = false } }
        var ownedTrips: [NativeTripSummary] = []
        var tripRead = false
        do {
            let bytes = try await request("api/trips/native/v2")
            guard valid(), bytes.count <= 256_000 else { return }
            let read = try JSONDecoder().decode(NativeTripList.self, from: bytes)
            guard read.version == 2, read.trips.count <= 100,
                  Set(read.trips.map(\.id)).count == read.trips.count,
                  read.trips.allSatisfy({ UUID(uuidString: $0.id) != nil && $0.headVersion >= 0 && !$0.title.isEmpty && $0.title.count <= 2000 }) else { throw NativeDataError.invalidResponse }
            ownedTrips = read.trips; tripRead = true
        } catch { guard valid() else { return } }
        var projected: [NativeJourneyRow] = []
        var goalRead = false
        var following: String?
        var readConversation: String?
        if assistant {
            do {
                let policyBytes = try await request("api/chat/native/v5/policy")
                guard valid(), policyBytes.count <= 32_768 else { return }
                let policy = try JSONDecoder().decode(NativeTextPolicyReply.self, from: policyBytes)
                guard policy.kind == "policy", policy.policy.valid, policy.policy.consentState == .accepted else { throw NativeDataError.invalidResponse }
                let path = "api/chat/native/v5/journeys" + (cursor.map { "/" + $0 } ?? "")
                let bytes = try await request(path)
                guard valid(), bytes.count <= 512_000 else { return }
                let read = try JSONDecoder().decode(JourneyPageRead.self, from: bytes)
                guard read.valid(cursor: cursor) else { throw NativeDataError.invalidResponse }
                projected = read.goals.map { .init(goal: $0.goal, relation: $0.relation.project(trips: ownedTrips)) }
                following = read.nextCursor; readConversation = read.conversationId
                guard valid() else { return }
                let finalPolicyBytes = try await request("api/chat/native/v5/policy")
                guard valid(), finalPolicyBytes.count <= 32_768 else { return }
                let finalPolicy = try JSONDecoder().decode(NativeTextPolicyReply.self, from: finalPolicyBytes)
                guard finalPolicy.kind == "policy", finalPolicy.policy == policy.policy else { throw NativeDataError.invalidResponse }
                goalRead = true
            } catch { guard valid() else { return }; projected = []; following = nil; readConversation = nil }
        }
        guard valid() else { return }
        rows = projected; trips = ownedTrips; goalsAvailable = goalRead; tripsAvailable = tripRead; nextCursor = following; conversationID = readConversation
        // No partial publication while the goal/link reads are still in flight.
        readableUntil = deadline
    }
}

struct NativeJourneyTripSelection: Hashable {
    let tripID: String
    let scope: NativeDataScope
}

@MainActor
enum NativeJourneyTripEntry {
    static func open(_ selection: NativeJourneyTripSelection, currentScope: () -> NativeDataScope?,
                     reload: () async -> [NativeTripSummary], select: (String) async -> Bool) async -> Bool {
        guard UUID(uuidString: selection.tripID) != nil, currentScope() == selection.scope, !Task.isCancelled else { return false }
        let owned = await reload()
        guard currentScope() == selection.scope, !Task.isCancelled,
              owned.contains(where: { $0.id == selection.tripID }) else { return false }
        let selected = await select(selection.tripID)
        return selected && currentScope() == selection.scope && !Task.isCancelled
    }
}

// Ephemeral navigation reference, never a copy of goal text or a writer authority.
struct NativeJourneyGoalEntry: Identifiable, Equatable {
    let id: UUID
    let scope: NativeDataScope
    let conversationID: String
    let goalID: String
    let scopeVersion: Int
    init(scope: NativeDataScope, conversationID: String, goalID: String, scopeVersion: Int) {
        self.id = UUID(); self.scope = scope; self.conversationID = conversationID
        self.goalID = goalID; self.scopeVersion = scopeVersion
    }
    var valid: Bool { UUID(uuidString: conversationID) != nil && UUID(uuidString: goalID) != nil && (1...10001).contains(scopeVersion) }
    func goal(in read: AssistantConversation?, scope current: NativeDataScope?) -> AssistantGoal? {
        guard valid, current == scope, let read, read.valid, read.conversationId == conversationID else { return nil }
        return read.goals.first { $0.goalId == goalID && $0.scopeVersion == scopeVersion }
    }
}

@MainActor
enum NativeJourneyGoalReader {
    static func read(_ entry: NativeJourneyGoalEntry, isCurrent: () -> Bool,
                     policy: () async throws -> Data, conversation: () async throws -> Data,
                     uptime: () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) async throws -> (NativeTextPolicy, AssistantConversation) {
        let deadline = uptime() + 30
        func current() -> Bool { isCurrent() && !Task.isCancelled && uptime() < deadline }
        guard entry.valid, current() else { throw NativeDataError.staleSessionResponse }
        let beforeBytes = try await policy()
        guard current(), beforeBytes.count <= 32_768 else { throw NativeDataError.staleSessionResponse }
        let before = try JSONDecoder().decode(NativeTextPolicyReply.self, from: beforeBytes)
        guard before.kind == "policy", before.policy.valid, before.policy.consentState == .accepted else { throw NativeDataError.invalidResponse }
        let read = try await AssistantConversationReader.read(requestedID: entry.conversationID, isCurrent: current, load: conversation)
        guard entry.goal(in: read, scope: entry.scope) != nil else { throw NativeDataError.invalidResponse }
        let afterBytes = try await policy()
        guard current(), afterBytes.count <= 32_768 else { throw NativeDataError.staleSessionResponse }
        let after = try JSONDecoder().decode(NativeTextPolicyReply.self, from: afterBytes)
        guard after.kind == "policy", after.policy == before.policy else { throw NativeDataError.invalidResponse }
        return (after.policy, read)
    }
}

enum NativeJourneyGoalDraftDecision: Equatable {
    case blocked, confirmDiscard, open
    static func decide(pending: Bool, draft: String, planningDraft: String, discard: Bool) -> Self {
        if pending { return .blocked }
        if !discard && (!draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !planningDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) { return .confirmDiscard }
        return .open
    }
}

// Complete scope equality, not just a matching user ID, controls restoration.
enum NativeAssistantScopeAppearance {
    static func preservesContext(bound: NativeDataScope?, retained: NativeDataScope?, active: NativeDataScope?) -> Bool {
        bound == retained && (active == nil || active == bound)
    }
}

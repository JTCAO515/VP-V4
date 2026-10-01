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

private struct JourneyConversationRead: Decodable {
    let version: Int
    let kind: String
    let conversationId: String?
    let goals: [NativeJourneyGoal]
    var valid: Bool {
        version == 5 && kind == "conversation" && goals.count <= 50 && goals.allSatisfy(\.valid)
        && Set(goals.map(\.id)).count == goals.count
        && (conversationId.map { UUID(uuidString: $0) != nil } ?? goals.isEmpty)
    }
}

private struct JourneyLinkRead: Decodable {
    let version: Int
    let kind: String
    let conversationId: String
    let goalId: String
    let goalScopeVersion: Int
    let linkVersion: Int
    let tripId: String?
    let tripHeadVersion: Int?
    let terminalUnlinked: Bool
    let current: Bool

    private enum CodingKeys: String, CodingKey {
        case version, kind, conversationId, goalId, goalScopeVersion, linkVersion
        case tripId, tripHeadVersion, terminalUnlinked, current
    }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        guard c.contains(.tripId), c.contains(.tripHeadVersion) else { throw NativeDataError.invalidResponse }
        version = try c.decode(Int.self, forKey: .version)
        kind = try c.decode(String.self, forKey: .kind)
        conversationId = try c.decode(String.self, forKey: .conversationId)
        goalId = try c.decode(String.self, forKey: .goalId)
        goalScopeVersion = try c.decode(Int.self, forKey: .goalScopeVersion)
        linkVersion = try c.decode(Int.self, forKey: .linkVersion)
        tripId = try c.decodeIfPresent(String.self, forKey: .tripId)
        tripHeadVersion = try c.decodeIfPresent(Int.self, forKey: .tripHeadVersion)
        terminalUnlinked = try c.decode(Bool.self, forKey: .terminalUnlinked)
        current = try c.decode(Bool.self, forKey: .current)
    }

    func relation(conversation: String, goal: NativeJourneyGoal, trips: [NativeTripSummary]) -> NativeJourneyRelation {
        guard version == 5, kind == "goal_trip_link", conversationId == conversation,
              goalId == goal.id, goalScopeVersion == goal.scopeVersion, linkVersion >= 0,
              (tripId == nil) == (tripHeadVersion == nil), !current || tripId != nil,
              !terminalUnlinked || tripId == nil else { return .unknown }
        if let tripId {
            guard UUID(uuidString: tripId) != nil, let head = tripHeadVersion, head >= 0 else { return .unknown }
            guard current, trips.contains(where: { $0.id == tripId && $0.headVersion == head }) else { return .unknown }
            return .linked(tripId)
        }
        return .unlinked
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
    private var generation = UUID()
    private var readableUntil: TimeInterval?
    private let uptime: () -> TimeInterval

    init(uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        self.uptime = uptime
    }

    func clear() {
        generation = UUID(); scope = nil; rows = []; trips = []
        goalsAvailable = false; tripsAvailable = false; readableUntil = nil; busy = false
    }

    func isCurrent(_ current: NativeDataScope?) -> Bool {
        scope != nil && scope == current && readableUntil.map { uptime() < $0 } == true
    }

    // Fixed-path GET closures are supplied by the existing NativeSession transport.
    func load(scope requested: NativeDataScope?, assistant: Bool,
              currentScope: () -> NativeDataScope?,
              request: (String) async throws -> Data) async {
        clear()
        guard let requested, currentScope() == requested else { return }
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
        if assistant {
            do {
                let policyBytes = try await request("api/chat/native/v5/policy")
                guard valid(), policyBytes.count <= 32_768 else { return }
                let policy = try JSONDecoder().decode(NativeTextPolicyReply.self, from: policyBytes)
                guard policy.kind == "policy", policy.policy.valid, policy.policy.consentState == .accepted else { throw NativeDataError.invalidResponse }
                let bytes = try await request("api/chat/native/v5/conversation")
                guard valid(), bytes.count <= 256_000 else { return }
                let read = try JSONDecoder().decode(JourneyConversationRead.self, from: bytes)
                guard read.valid else { throw NativeDataError.invalidResponse }
                for goal in read.goals {
                    var relation: NativeJourneyRelation = .unknown
                    if let conversation = read.conversationId {
                        do {
                            let linkBytes = try await request("api/chat/native/v5/goals/\(goal.id)/trip")
                            guard valid(), linkBytes.count <= 16_384 else { return }
                            let link = try JSONDecoder().decode(JourneyLinkRead.self, from: linkBytes)
                            relation = link.relation(conversation: conversation, goal: goal, trips: ownedTrips)
                        } catch { guard valid() else { return } }
                    }
                    projected.append(.init(goal: goal, relation: relation))
                }
                guard valid() else { return }
                let finalPolicyBytes = try await request("api/chat/native/v5/policy")
                guard valid(), finalPolicyBytes.count <= 32_768 else { return }
                let finalPolicy = try JSONDecoder().decode(NativeTextPolicyReply.self, from: finalPolicyBytes)
                guard finalPolicy.kind == "policy", finalPolicy.policy == policy.policy else { throw NativeDataError.invalidResponse }
                goalRead = true
            } catch { guard valid() else { return }; projected = [] }
        }
        guard valid() else { return }
        rows = projected; trips = ownedTrips; goalsAvailable = goalRead; tripsAvailable = tripRead
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

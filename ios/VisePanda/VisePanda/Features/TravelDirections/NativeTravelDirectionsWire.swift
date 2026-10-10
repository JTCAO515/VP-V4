import Foundation
import CoreFoundation

struct NativeTravelDirectionsSelection: Equatable, Identifiable {
    var id: String { "\(scope.endpoint):\(scope.subject):\(scope.mobileEpoch):\(scope.generation):\(conversationID):\(goalID):\(goalVersion):\(parentMessageID)" }
    let scope: NativeDataScope
    let conversationID: String
    let goalID: String
    let goalVersion: Int
    let parentMessageID: String
    let planningPolicyID: String
    var valid: Bool {
        [conversationID, goalID, parentMessageID, planningPolicyID].allSatisfy { UUID(uuidString: $0) != nil }
            && (1...9999).contains(goalVersion)
    }
}

struct NativeTravelDirectionsWriteBasis: Decodable, Equatable {
    let kind: String
    let conversationId: String
    let goalId: String
    let goalVersion: Int
    let parentMessageId: String
    let messageSequence: Int
    let intakeRevision: Int
    let intakeDigest: String?
    let policyId: String

    func matches(_ target: NativeTravelDirectionsSelection) -> Bool {
        conversationId == target.conversationID && goalId == target.goalID
            && goalVersion == target.goalVersion && parentMessageId == target.parentMessageID
    }
    static func decode(_ bytes: Data) throws -> Self? {
        let raw = try NativeTravelDirectionsWire.data(bytes)
        if try NativeTravelDirectionsWire.unavailable(raw) { return nil }
        guard Set(raw.keys) == Set(["kind", "conversationId", "goalId", "goalVersion", "parentMessageId", "messageSequence", "intakeRevision", "intakeDigest", "policyId"]),
              raw["kind"] as? String == "directions_write_basis",
              NativeFiveResultContent.integer(raw["goalVersion"], maximum: 9999) != nil,
              NativeFiveResultContent.integer(raw["messageSequence"], maximum: 999999) != nil,
              let revision = NativeFiveResultContent.integer(raw["intakeRevision"], minimum: 0, maximum: 999),
              revision == 0 ? raw["intakeDigest"] is NSNull : NativeTravelDirectionsWire.digest(raw["intakeDigest"]) else { throw NativeDataError.invalidResponse }
        let value = try JSONDecoder().decode(Self.self, from: JSONSerialization.data(withJSONObject: raw))
        guard [value.conversationId, value.goalId, value.parentMessageId, value.policyId].allSatisfy({ UUID(uuidString: $0) != nil }) else { throw NativeDataError.invalidResponse }
        return value
    }
}

/// The exact command body is retained for explicit retry; never regenerated on retry.
enum NativeTravelDirectionsAction: Equatable {
    case choose(String)
    case save
    case edit([Replacement])
    case bind(tripID: String, tripVersion: Int, startDate: String)
    struct Replacement: Equatable { let ordinal: Int; let destination: String; let activities: [String] }
    var endpoint: String {
        switch self { case .choose: "choose"; case .save: "save"; case .edit: "edit"; case .bind: "bind" }
    }
    var receiptKind: String {
        switch self { case .choose: "selected"; case .save: "saved"; case .edit: "revised"; case .bind: "proposal_created" }
    }
    func body(artifactID: String, revision: Int, operationID: String) throws -> Data {
        guard UUID(uuidString: artifactID) != nil, UUID(uuidString: operationID) != nil,
              (1...1000).contains(revision) else { throw NativeDataError.invalidResponse }
        var raw: [String: Any] = ["artifactId": artifactID, "expectedRevision": revision, "operationId": operationID]
        switch self {
        case .choose(let id):
            guard ["depth", "breadth"].contains(id), revision < 1000 else { throw NativeDataError.invalidResponse }
            raw["directionId"] = id
        case .save:
            guard revision < 1000 else { throw NativeDataError.invalidResponse }
        case .edit(let replacements):
            guard revision < 1000, (1...30).contains(replacements.count),
                  Set(replacements.map(\.ordinal)).count == replacements.count,
                  replacements.allSatisfy({ (1...30).contains($0.ordinal)
                    && NativeTravelDirectionsIntake.validText($0.destination, max: 80)
                    && (1...8).contains($0.activities.count)
                    && $0.activities.allSatisfy({ NativeTravelDirectionsIntake.validText($0, max: 160) }) }) else { throw NativeDataError.invalidResponse }
            raw["replacements"] = replacements.map { ["ordinal": $0.ordinal, "destination": $0.destination, "activities": $0.activities] as [String: Any] }
        case .bind(let tripID, let version, let date):
            guard UUID(uuidString: tripID) != nil, version >= 0,
                  NativeTravelIntake.validDates(.init(startDate: date, endDate: date)) else { throw NativeDataError.invalidResponse }
            raw["tripId"] = tripID; raw["expectedTripVersion"] = version; raw["startDate"] = date
        }
        return try JSONSerialization.data(withJSONObject: raw, options: .sortedKeys)
    }
}

struct NativeTravelDirectionsReceipt {
    let artifactID: String
    let revision: Int
    let proposal: Proposal?
    struct Proposal { let tripID: String; let tripVersion: Int; let proposalID: String; let proposalRevision: Int; let artifactID: String; let artifactRevision: Int }
    static func decode(_ bytes: Data, action: NativeTravelDirectionsAction, artifactID: String, expectedRevision: Int) throws -> Self {
        guard bytes.count <= 16_384, let raw = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              NativeFiveResultContent.integer(raw["version"]) == 1, raw["kind"] as? String == action.receiptKind,
              raw["artifactId"] as? String == artifactID,
              let revision = NativeFiveResultContent.integer(raw["revision"], maximum: 1000),
              let reused = raw["reused"] as? NSNumber, CFGetTypeID(reused) == CFBooleanGetTypeID() else { throw NativeDataError.invalidResponse }
        if case .bind(let tripID, let tripVersion, _) = action {
            guard Set(raw.keys) == Set(["version", "kind", "artifactId", "revision", "reused", "tripId", "tripVersion", "proposalId", "proposalRevision", "proposalArtifactId", "proposalArtifactRevision"]),
                  revision == expectedRevision, raw["tripId"] as? String == tripID,
                  NativeFiveResultContent.integer(raw["tripVersion"], minimum: 0) == tripVersion,
                  let proposalID = raw["proposalId"] as? String, UUID(uuidString: proposalID) != nil,
                  let proposalRevision = NativeFiveResultContent.integer(raw["proposalRevision"], maximum: 1000),
                  let proposalArtifactID = raw["proposalArtifactId"] as? String, UUID(uuidString: proposalArtifactID) != nil,
                  let proposalArtifactRevision = NativeFiveResultContent.integer(raw["proposalArtifactRevision"], maximum: 1000) else { throw NativeDataError.invalidResponse }
            return .init(artifactID: artifactID, revision: revision, proposal: .init(tripID: tripID, tripVersion: tripVersion,
                proposalID: proposalID, proposalRevision: proposalRevision, artifactID: proposalArtifactID, artifactRevision: proposalArtifactRevision))
        }
        guard Set(raw.keys) == Set(["version", "kind", "artifactId", "revision", "reused"]), revision == expectedRevision + 1 else { throw NativeDataError.invalidResponse }
        return .init(artifactID: artifactID, revision: revision, proposal: nil)
    }
}

enum NativeTravelDirectionsWire {
    static func digest(_ value: Any?) -> Bool {
        guard let value = value as? String else { return false }
        return value.utf16.count == 64 && value.allSatisfy { "0123456789abcdef".contains($0) }
    }
    static func data(_ bytes: Data) throws -> [String: Any] {
        guard bytes.count <= 32_000, let envelope = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              Set(envelope.keys) == Set(["version", "data"]), NativeFiveResultContent.integer(envelope["version"]) == 1,
              let data = envelope["data"] as? [String: Any] else { throw NativeDataError.invalidResponse }
        return data
    }
    static func unavailable(_ raw: [String: Any]) throws -> Bool {
        guard raw["kind"] as? String == "unavailable" else { return false }
        guard Set(raw.keys) == Set(["kind", "reason"]), ["blocked", "intake_unrecorded", "stale_basis"].contains(raw["reason"] as? String ?? "") else { throw NativeDataError.invalidResponse }
        return true
    }
}

struct NativeTravelDirectionsIntakeBasis: Decodable {
    let kind: String
    let schemaVersion: String
    let conversationId: String
    let goalId: String
    let goalVersion: Int
    let inputMessageId: String
    let inputSequence: Int
    let intakeRevision: Int
    let intakeDigest: String
    let intake: NativeTravelDirectionsIntake
    let memoryBasis: [NativeTravelMemoryReference]
    let tripId: String?
    let tripVersion: Int?
    let profilePace: NativeTaskTravelPace?
    static func decode(_ bytes: Data) throws -> Self? {
        let raw = try NativeTravelDirectionsWire.data(bytes)
        if try NativeTravelDirectionsWire.unavailable(raw) { return nil }
        guard Set(raw.keys) == Set(["kind", "schemaVersion", "conversationId", "goalId", "goalVersion", "inputMessageId", "inputSequence", "intakeRevision", "intakeDigest", "intake", "memoryBasis", "tripId", "tripVersion", "profilePace"]),
              raw["kind"] as? String == "directions_intake", raw["schemaVersion"] as? String == "travel-directions-current-basis/1",
              NativeFiveResultContent.integer(raw["goalVersion"], maximum: 10_000) != nil,
              NativeFiveResultContent.integer(raw["inputSequence"], maximum: 1_000_000) != nil,
              NativeFiveResultContent.integer(raw["intakeRevision"], maximum: 1000) != nil,
              NativeTravelDirectionsWire.digest(raw["intakeDigest"]), let intake = raw["intake"] as? [String: Any],
              let memories = raw["memoryBasis"] as? [[String: Any]], memories.count <= 3,
              memories.allSatisfy({ Set($0.keys) == Set(["id", "revision"])
                && ($0["id"] as? String).flatMap(UUID.init(uuidString:)) != nil
                && NativeFiveResultContent.integer($0["revision"], maximum: 9_007_199_254_740_991) != nil }) else { throw NativeDataError.invalidResponse }
        _ = try NativeTravelDirectionsIntake.decode(intake)
        if !(raw["profilePace"] is NSNull) {
            guard let pace = raw["profilePace"] as? [String: Any],
                  Set(pace.keys) == Set(["schemaVersion", "tripId", "travelPace", "source", "sourceRevision", "sourceOperationId", "purpose"]) else { throw NativeDataError.invalidResponse }
        }
        let value = try JSONDecoder().decode(Self.self, from: JSONSerialization.data(withJSONObject: raw))
        guard [value.conversationId, value.goalId, value.inputMessageId].allSatisfy({ UUID(uuidString: $0) != nil }),
              Set(value.memoryBasis.map(\.id)).count == value.memoryBasis.count,
              value.tripId == nil ? value.tripVersion == nil : UUID(uuidString: value.tripId!) != nil && value.tripVersion.map({ $0 >= 0 }) == true else { throw NativeDataError.invalidResponse }
        if let pace = value.profilePace {
            guard let tripID = value.tripId, pace.source == "profile", pace.valid(for: tripID, choice: .saved) else { throw NativeDataError.invalidResponse }
        }
        return value
    }
}

struct NativeTravelDirectionsPublication {
    let artifactID: String
    let revision: Int
    let taskID: String
    let turnID: String
    let goalVersion: Int
    let inputMessageID: String
    let inputSequence: Int
    let intakeRevision: Int
    let intakeDigest: String
    let current: Bool
    static func decode(_ bytes: Data, request: [String: Any]) throws -> Self {
        guard bytes.count <= 16_384, let raw = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              Set(raw.keys) == Set(["version", "kind", "artifactId", "revision", "reused", "taskId", "turnId", "conversationId", "goalId", "goalVersion", "inputMessageId", "inputSequence", "intakeRevision", "intakeDigest", "current"]),
              NativeFiveResultContent.integer(raw["version"]) == 1, raw["kind"] as? String == "published",
              let task = raw["taskId"] as? String, UUID(uuidString: task) != nil, task == request["taskId"] as? String,
              let turn = raw["turnId"] as? String, UUID(uuidString: turn) != nil, turn == request["turnId"] as? String,
              raw["conversationId"] as? String == request["conversationId"] as? String, raw["goalId"] as? String == request["goalId"] as? String,
              let message = raw["inputMessageId"] as? String, UUID(uuidString: message) != nil, message == request["messageId"] as? String,
              let artifact = raw["artifactId"] as? String, UUID(uuidString: artifact) != nil,
              let revision = NativeFiveResultContent.integer(raw["revision"], maximum: 1000),
              let goalVersion = NativeFiveResultContent.integer(raw["goalVersion"], maximum: 10_000),
              let sequence = NativeFiveResultContent.integer(raw["inputSequence"], maximum: 1_000_000),
              let intakeRevision = NativeFiveResultContent.integer(raw["intakeRevision"], maximum: 1000),
              let digest = raw["intakeDigest"] as? String, NativeTravelDirectionsWire.digest(digest),
              let current = raw["current"] as? NSNumber, CFGetTypeID(current) == CFBooleanGetTypeID(),
              let reused = raw["reused"] as? NSNumber, CFGetTypeID(reused) == CFBooleanGetTypeID() else { throw NativeDataError.invalidResponse }
        return .init(artifactID: artifact, revision: revision, taskID: task, turnID: turn,
            goalVersion: goalVersion, inputMessageID: message,
            inputSequence: sequence, intakeRevision: intakeRevision, intakeDigest: digest, current: current.boolValue)
    }
}

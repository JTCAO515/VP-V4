import Foundation
import CoreFoundation

struct NativeProposalReferenceRecord: Equatable {
    let artifactID: String
    let artifactRevision: Int
    let proposalID: String
    let proposalRevision: Int
    let tripID: String
    let tripVersion: Int
    let taskID: String
    let goalID: String
    let goalVersion: Int
    let inputSequence: Int

    /// Frozen closed wire only; confirmation material and unknown fields fail closed.
    static func decode(_ bytes: Data) throws -> Self? {
        guard bytes.count <= 100_000,
              let envelope = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              closed(envelope, ["version", "data"]), integer(envelope["version"], maximum: 1) == 1,
              let data = envelope["data"] as? [String: Any] else { throw NativeDataError.invalidResponse }
        if ["empty", "unavailable"].contains(data["kind"] as? String ?? "") {
            guard closed(data, ["kind"]) else { throw NativeDataError.invalidResponse }; return nil
        }
        guard closed(data, ["kind", "artifactId", "revision", "currentRevision", "current", "historicalReadable", "lifecycle", "source", "basis", "content", "createdAt"]),
              data["kind"] as? String == "result_artifact", boolean(data["current"]) == true,
              boolean(data["historicalReadable"]) == true, data["lifecycle"] as? String == "active",
              let artifact = identifier(data["artifactId"]), let revision = integer(data["revision"], maximum: 1000),
              integer(data["currentRevision"], maximum: 1000) == revision,
              let created = data["createdAt"] as? String, created.utf16.count <= 64, NativeKnowledgeRead.date(created) != nil,
              let source = data["source"] as? [String: Any],
              closed(source, ["taskId", "taskTurnId", "goalId", "goalVersion", "inputMessageId", "inputSequence", "tripId", "tripVersion"]),
              let task = identifier(source["taskId"]), identifier(source["taskTurnId"]) != nil,
              let goal = identifier(source["goalId"]), let goalVersion = integer(source["goalVersion"]),
              identifier(source["inputMessageId"]) != nil, let sequence = integer(source["inputSequence"]),
              let trip = identifier(source["tripId"]), let tripVersion = integer(source["tripVersion"], minimum: 0),
              let basis = data["basis"] as? [String: Any], closed(basis, ["memories", "evidence"]),
              let memories = basis["memories"] as? [[String: Any]], memories.count <= 20,
              memories.allSatisfy({ closed($0, ["id", "revision"]) && identifier($0["id"]) != nil && integer($0["revision"]) != nil }),
              let evidence = basis["evidence"] as? [Any], evidence.isEmpty,
              let content = data["content"] as? [String: Any],
              closed(content, ["schemaVersion", "proposalId", "proposalRevision", "actions"]),
              content["schemaVersion"] as? String == "change-proposal-reference/1",
              let proposal = identifier(content["proposalId"]),
              let proposalRevision = integer(content["proposalRevision"], maximum: 2_147_483_647),
              let actions = content["actions"] as? [Any], actions.isEmpty else { throw NativeDataError.invalidResponse }
        return .init(artifactID: artifact, artifactRevision: revision, proposalID: proposal,
                     proposalRevision: proposalRevision, tripID: trip, tripVersion: tripVersion,
                     taskID: task, goalID: goal, goalVersion: goalVersion, inputSequence: sequence)
    }
    private static func closed(_ value: [String: Any], _ keys: [String]) -> Bool { Set(value.keys) == Set(keys) }
    private static func identifier(_ value: Any?) -> String? {
        guard let text = value as? String, text.range(of: #"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"#, options: [.regularExpression, .caseInsensitive]) != nil else { return nil }
        return text.lowercased()
    }
    private static func integer(_ value: Any?, minimum: Int = 1, maximum: Int = 9_007_199_254_740_991) -> Int? {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
              number.doubleValue.isFinite, number.doubleValue.rounded() == number.doubleValue,
              number.doubleValue >= Double(minimum), number.doubleValue <= Double(maximum) else { return nil }
        return number.intValue
    }
    private static func boolean(_ value: Any?) -> Bool? {
        guard let number = value as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() else { return nil }; return number.boolValue
    }
}

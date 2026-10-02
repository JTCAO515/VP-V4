import Foundation

struct NativeTaskActivitySelection: Equatable {
    let scope: NativeDataScope
    let conversationID: String
    let taskID: String
    let latestTurnID: String
    let eligible: Bool
    var valid: Bool {
        eligible && [conversationID, taskID, latestTurnID].allSatisfy { UUID(uuidString: $0) != nil }
    }
}

struct NativeTaskActivity: Decodable, Equatable {
    enum Tool: String, Decodable { case evidence = "evidence.lookup", place = "place.read", constraints = "constraints.evaluate", result = "result.prepare" }
    enum ReceiptState: String, Decodable { case started, completed, unknown }
    enum Recording: String, Decodable { case recorded, unrecorded }
    enum TurnStatus: String, Decodable {
        case accepted, planning, retrieving, generating, validating, completed, failed, cancelled, unavailable
    }
    struct Action: Decodable, Equatable {
        let tool: Tool
        let state: ReceiptState
        init(from decoder: Decoder) throws {
            try activityKeys(decoder, exactly: ["tool", "state"])
            let c = try decoder.container(keyedBy: CodingKeys.self)
            tool = try c.decode(Tool.self, forKey: .tool)
            state = try c.decode(ReceiptState.self, forKey: .state)
        }
        private enum CodingKeys: String, CodingKey { case tool, state }
    }
    let version: Int
    let kind: String
    let conversationId: String
    let taskId: String
    let turnId: String
    let turnStatus: TurnStatus
    let limit: Int
    let recording: Recording
    let actions: [Action]
    init(from decoder: Decoder) throws {
        try activityKeys(decoder, exactly: ["version", "kind", "conversationId", "taskId", "turnId", "turnStatus", "limit", "recording", "actions"])
        let c = try decoder.container(keyedBy: CodingKeys.self)
        version = try c.decode(Int.self, forKey: .version)
        kind = try c.decode(String.self, forKey: .kind)
        conversationId = try c.decode(String.self, forKey: .conversationId)
        taskId = try c.decode(String.self, forKey: .taskId)
        turnId = try c.decode(String.self, forKey: .turnId)
        turnStatus = try c.decode(TurnStatus.self, forKey: .turnStatus)
        limit = try c.decode(Int.self, forKey: .limit)
        recording = try c.decode(Recording.self, forKey: .recording)
        actions = try c.decode([Action].self, forKey: .actions)
        guard version == 5, kind == "task_activity", limit == 4, actions.count <= limit,
              [conversationId, taskId, turnId].allSatisfy({ UUID(uuidString: $0) != nil }),
              recording == (actions.isEmpty ? .unrecorded : .recorded) else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Invalid activity envelope"))
        }
    }
    func matches(_ selection: NativeTaskActivitySelection) -> Bool {
        selection.valid && conversationId == selection.conversationID && taskId == selection.taskID && turnId == selection.latestTurnID
    }
    private enum CodingKeys: String, CodingKey { case version, kind, conversationId, taskId, turnId, turnStatus, limit, recording, actions }
}

private struct ActivityWireKey: CodingKey {
    let stringValue: String
    var intValue: Int? { nil }
    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { return nil }
}
private func activityKeys(_ decoder: Decoder, exactly expected: Set<String>) throws {
    let c = try decoder.container(keyedBy: ActivityWireKey.self)
    guard Set(c.allKeys.map(\.stringValue)) == expected else {
        throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Invalid activity fields"))
    }
}

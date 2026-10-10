import Foundation
import CoreFoundation

/// Matches the sole TS producer's assistant-events/1 candidate. Activation awaits
/// the reviewed durable source and shared session integration; no legacy wire changes.
enum NativeAssistantEventsDecoder {
    enum Status: String {
        case accepted, planning, retrieving, generating, validating, completed
        case proposalReady = "proposal_ready"
        case unavailable, failed, cancelled
    }
    enum Change: Equatable {
        case task(Status)
        case progress(Tool, ReceiptState)
        case artifact(id: String, revision: Int, invalidated: Bool, unavailable: Bool)
        case retired(sequence: Int)
    }
    enum Tool: String { case evidence = "evidence.lookup", place = "place.read", constraints = "constraints.evaluate", result = "result.prepare" }
    enum ReceiptState: String { case started, completed, unknown }
    struct Event: Equatable {
        let eventID: String
        let sequence: Int
        let taskID: String?
        let turnID: String?
        let change: Change

        var reference: NativeAssistantEventsReference? {
            switch change {
            case .task, .progress:
                guard let taskID else { return nil }
                return .init(eventID: eventID, cursor: String(sequence), object: .task(taskID),
                             revision: sequence, invalidated: false)
            case .artifact(let id, let revision, let invalidated, _):
                return .init(eventID: eventID, cursor: String(sequence), object: .artifact(id),
                             revision: revision, invalidated: invalidated)
            case .retired: return nil
            }
        }
    }
    struct Page: Equatable {
        let events: [Event]
        let afterSequence: Int
        let hasMore: Bool
    }
    private static let maximum = 999_999_999_999_999

    /// Finite response: validate the final checkpoint before exposing any event.
    /// A network-truncated frame, unknown field or schema never yields a cursor.
    static func decode(_ bytes: Data, conversationID: String, after: Int) throws -> Page {
        guard bytes.count <= 65_536, UUID(uuidString: conversationID) != nil,
              (0...maximum).contains(after), let text = String(data: bytes, encoding: .utf8),
              text.hasSuffix("\n\n"), !text.contains("\r") else { throw NativeDataError.invalidResponse }
        var frames = text.components(separatedBy: "\n\n")
        guard frames.removeLast().isEmpty, !frames.isEmpty, frames.count <= 51 else {
            throw NativeDataError.invalidResponse
        }
        var events: [Event] = []
        var previous = after
        var checkpoint: Page?
        for (offset, frame) in frames.enumerated() {
            var fields: [String: String] = [:]
            for line in frame.components(separatedBy: "\n") {
                guard let colon = line.firstIndex(of: ":") else { throw NativeDataError.invalidResponse }
                let key = String(line[..<colon])
                var value = String(line[line.index(after: colon)...])
                if value.first == " " { value.removeFirst() }
                guard fields[key] == nil, ["id", "event", "data", "retry"].contains(key) else {
                    throw NativeDataError.invalidResponse
                }
                fields[key] = value
            }
            guard let payload = fields["data"], let object = try JSONSerialization.jsonObject(with: Data(payload.utf8)) as? [String: Any],
                  object["schemaVersion"] as? String == "assistant-events/1",
                  object["conversationId"] as? String == conversationID else { throw NativeDataError.invalidResponse }
            switch fields["event"] {
            case "assistant":
                guard Set(fields.keys) == ["id", "event", "data"], events.count < 50,
                      let rawID = fields["id"], rawID.range(of: "^[1-9][0-9]{0,14}$", options: .regularExpression) != nil,
                      let sequence = Int(rawID), sequence == previous + 1,
                      try integer(object["sequence"]) == sequence,
                      object["eventId"] as? String == "\(conversationID):\(sequence)" else { throw NativeDataError.invalidResponse }
                if object["type"] as? String == "source_retired" {
                    guard Set(object.keys) == ["schemaVersion", "conversationId", "eventId", "sequence", "type", "retiredSequence"] else { throw NativeDataError.invalidResponse }
                    let retired = try integer(object["retiredSequence"])
                    guard retired > 0, retired <= sequence else { throw NativeDataError.invalidResponse }
                    events.append(.init(eventID: "\(conversationID):\(sequence)", sequence: sequence, taskID: nil, turnID: nil, change: .retired(sequence: retired)))
                    previous = sequence
                    continue
                }
                guard let taskID = object["taskId"] as? String, UUID(uuidString: taskID) != nil,
                      let turnID = object["turnId"] as? String, UUID(uuidString: turnID) != nil else { throw NativeDataError.invalidResponse }
                let base: Set<String> = ["schemaVersion", "conversationId", "eventId", "sequence", "taskId", "turnId", "type"]
                let change: Change
                if object["type"] as? String == "task_status" {
                    guard Set(object.keys) == base.union(["status"]),
                          let raw = object["status"] as? String, let status = Status(rawValue: raw) else { throw NativeDataError.invalidResponse }
                    change = .task(status)
                } else if object["type"] as? String == "task_progress" {
                    guard Set(object.keys) == base.union(["tool", "state"]),
                          let tool = object["tool"] as? String, let parsedTool = Tool(rawValue: tool),
                          let state = object["state"] as? String, let parsedState = ReceiptState(rawValue: state) else { throw NativeDataError.invalidResponse }
                    change = .progress(parsedTool, parsedState)
                } else {
                    guard Set(object.keys) == base.union(["artifactId", "revision", "availability"]),
                          let type = object["type"] as? String, ["artifact_ready", "artifact_updated", "artifact_invalidated"].contains(type),
                          let id = object["artifactId"] as? String, UUID(uuidString: id) != nil,
                          let availability = object["availability"] as? String, ["recheck", "unavailable"].contains(availability) else { throw NativeDataError.invalidResponse }
                    let revision = try integer(object["revision"])
                    guard (1...1000).contains(revision), type != "artifact_invalidated" || availability == "unavailable" else { throw NativeDataError.invalidResponse }
                    change = .artifact(id: id, revision: revision, invalidated: type == "artifact_invalidated", unavailable: availability == "unavailable")
                }
                events.append(.init(eventID: "\(conversationID):\(sequence)", sequence: sequence, taskID: taskID, turnID: turnID, change: change))
                previous = sequence
            case "checkpoint":
                guard offset == frames.count - 1, Set(fields.keys) == ["retry", "event", "data"], fields["retry"] == "2000",
                      Set(object.keys) == ["schemaVersion", "conversationId", "afterSequence", "hasMore"],
                      try integer(object["afterSequence"]) == previous,
                      let more = object["hasMore"] as? NSNumber, CFGetTypeID(more) == CFBooleanGetTypeID(),
                      !more.boolValue || events.count == 50 else { throw NativeDataError.invalidResponse }
                checkpoint = .init(events: events, afterSequence: previous, hasMore: more.boolValue)
            default: throw NativeDataError.invalidResponse
            }
        }
        guard let checkpoint else { throw NativeDataError.invalidResponse }
        return checkpoint
    }

    private static func integer(_ value: Any?) throws -> Int {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
              number.doubleValue.isFinite, number.doubleValue.rounded() == number.doubleValue,
              number.doubleValue >= 0, number.doubleValue <= Double(maximum) else { throw NativeDataError.invalidResponse }
        return number.intValue
    }
}

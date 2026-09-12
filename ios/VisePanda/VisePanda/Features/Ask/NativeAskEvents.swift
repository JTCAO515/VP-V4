import Foundation

/// Bounded SSE parser. A truncated frame never advances the acknowledged cursor.
struct NativeAskEventDecoder {
    struct Frame {
        let name: String
        let id: Int?
        let data: Data
    }
    private var line = Data()
    private var payload = Data()
    private var name: String?
    private var id: Int?
    private var bytes = 0

    mutating func append(_ byte: UInt8) throws -> Frame? {
        bytes += 1
        guard bytes <= 262_144 else { throw NativeDataError.invalidResponse }
        if byte != 10 { line.append(byte); return nil }
        if line.last == 13 { line.removeLast() }
        defer { line.removeAll(keepingCapacity: true) }
        if line.isEmpty {
            guard let name, !payload.isEmpty else { throw NativeDataError.invalidResponse }
            let result = Frame(name: name, id: id, data: payload)
            self.name = nil; id = nil; payload = Data(); bytes = 0
            return result
        }
        guard let text = String(data: line, encoding: .utf8), let separator = text.firstIndex(of: ":") else { throw NativeDataError.invalidResponse }
        let field = text[..<separator]
        var value = String(text[text.index(after: separator)...])
        if value.first == " " { value.removeFirst() }
        switch field {
        case "event":
            guard name == nil, ["turn", "projection", "heartbeat", "unavailable"].contains(value) else { throw NativeDataError.invalidResponse }
            name = value
        case "id":
            guard id == nil, value.range(of: "^[1-9][0-9]{0,14}$", options: .regularExpression) != nil, let parsed = Int(value) else { throw NativeDataError.invalidResponse }
            id = parsed
        case "data":
            guard payload.isEmpty else { throw NativeDataError.invalidResponse }
            payload = Data(value.utf8)
        case "retry":
            guard value == "2000" else { throw NativeDataError.invalidResponse }
        default: throw NativeDataError.invalidResponse
        }
        return nil
    }

    func finish() throws {
        guard bytes == 0 && line.isEmpty && payload.isEmpty && name == nil && id == nil else { throw NativeDataError.invalidResponse }
    }
}

struct NativeAskEvent: Decodable {
    let schemaVersion: String
    let turnId: String
    let sequence: Int?
    let eventId: String?
    let type: String?
    let state: String?
    let afterSequence: Int?
    let turn: NativeTextTurn?

    func validate(frame: NativeAskEventDecoder.Frame, expected: String, cursor: Int) throws -> Int {
        guard schemaVersion == "grounded-events/1", turnId == expected else { throw NativeDataError.invalidResponse }
        if frame.name == "projection" {
            guard frame.id == nil, sequence == nil, eventId == nil, type == nil, state == nil,
                  afterSequence == cursor, let turn, turn.id == expected else { throw NativeDataError.invalidResponse }
            return cursor
        }
        guard frame.name == "turn", let sequence, frame.id == sequence, sequence > cursor,
              afterSequence == nil, let eventId,
              eventId.range(of: "^[A-Za-z0-9._:-]{1,160}$", options: .regularExpression) != nil,
              let type, ["accepted", "phase", "progress", "answer", "card", "proposal", "terminal"].contains(type),
              let state else { throw NativeDataError.invalidResponse }
        let terminal = ["completed", "unavailable", "failed", "cancelled"].contains(state)
        guard terminal || ["accepted", "planning", "retrieving", "generating", "validating"].contains(state),
              (type == "terminal") == terminal else { throw NativeDataError.invalidResponse }
        if terminal {
            guard let turn, turn.id == expected, turn.status == state else { throw NativeDataError.invalidResponse }
        } else if turn != nil { throw NativeDataError.invalidResponse }
        return sequence
    }
}

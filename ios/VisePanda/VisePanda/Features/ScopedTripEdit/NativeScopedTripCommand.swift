import Foundation
import CoreFoundation

struct NativeScopedTripBasis: Equatable {
    let contextID: String
    let contextDigest: String
    let baseVersion: Int
    var object: [String: Any] { ["contextId": contextID, "contextDigest": contextDigest, "baseVersion": baseVersion] }
}

/// Closed commands for the existing Proposal producer. A manual change creates
/// a proposal; a lock changes only explicit protection, never Trip content.
struct NativeScopedTripCommand: Equatable {
    let bytes: Data
    let operationID: String
    let action: String

    init(object: [String: Any]) throws {
        guard let operationID = object["operationId"] as? String,
              UUID(uuidString: operationID) != nil, operationID == operationID.lowercased(),
              let action = object["action"] as? String, ["manual", "ask", "lock", "select_candidate"].contains(action),
              let basis = object["basis"] as? [String: Any], Set(basis.keys) == ["contextId", "contextDigest", "baseVersion"],
              let contextID = basis["contextId"] as? String, UUID(uuidString: contextID) != nil,
              contextID == contextID.lowercased(), let digest = basis["contextDigest"] as? String,
              digest.count == 64, digest.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) }),
              NativeScopedTripWire.integer(basis["baseVersion"]) != nil else { throw NativeDataError.invalidResponse }
        switch action {
        case "select_candidate":
            guard Set(object.keys) == ["action", "operationId", "basis", "askOperationId", "candidateId"],
                  let askID = object["askOperationId"] as? String, NativeScopedTripWire.uuid(askID), askID != operationID,
                  let candidateID = object["candidateId"] as? String, NativeScopedTripWire.uuid(candidateID) else { throw NativeDataError.invalidResponse }
        case "ask":
            guard Set(object.keys) == ["action", "operationId", "basis", "text"], let text = object["text"] as? String,
                  !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, text.utf16.count <= 4000, !text.contains("\0") else { throw NativeDataError.invalidResponse }
        case "lock":
            guard Set(object.keys) == ["action", "operationId", "basis", "itemId", "locked"],
                  let item = object["itemId"] as? String, NativeScopedTripSelection.validObjectID(item),
                  let flag = object["locked"] as? NSNumber, CFGetTypeID(flag) == CFBooleanGetTypeID() else { throw NativeDataError.invalidResponse }
        default:
            guard Set(object.keys) == ["action", "operationId", "basis", "edit"],
                  let edit = object["edit"] as? [String: Any], let kind = edit["kind"] as? String else { throw NativeDataError.invalidResponse }
            switch kind {
            case "move_item":
                guard Set(edit.keys) == ["kind", "itemId", "toDayId"], Self.id(edit["itemId"]), Self.id(edit["toDayId"]) else { throw NativeDataError.invalidResponse }
            case "reorder_items":
                guard Set(edit.keys) == ["kind", "dayId", "itemIds"], Self.id(edit["dayId"]),
                      let ids = edit["itemIds"] as? [String], !ids.isEmpty, ids.count <= 64,
                      ids.allSatisfy(NativeScopedTripSelection.validObjectID), Set(ids).count == ids.count else { throw NativeDataError.invalidResponse }
            case "set_time":
                guard Set(edit.keys) == ["kind", "itemId", "startsAt", "endsAt"], Self.id(edit["itemId"]),
                      Self.time(edit["startsAt"]), Self.time(edit["endsAt"]) else { throw NativeDataError.invalidResponse }
                if let start = edit["startsAt"] as? String, let end = edit["endsAt"] as? String {
                    guard let a = Self.date(start), let b = Self.date(end), b > a else { throw NativeDataError.invalidResponse }
                }
            default: throw NativeDataError.invalidResponse
            }
        }
        bytes = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
        guard bytes.count <= 16000 else { throw NativeDataError.invalidResponse }
        self.operationID = operationID; self.action = action
    }

    init(bytes: Data) throws {
        guard bytes.count <= 16000, let object = try JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { throw NativeDataError.invalidResponse }
        let validated = try Self(object: object)
        self.bytes = bytes; operationID = validated.operationID; action = validated.action
    }

    func abandoning() throws -> Data {
        try JSONSerialization.data(withJSONObject: ["action": "abandon", "operationId": operationID,
            "mutation": JSONSerialization.jsonObject(with: bytes)], options: [.sortedKeys])
    }
    static func date(_ raw: String) -> Date? {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = parser.date(from: raw) { return date }
        parser.formatOptions = [.withInternetDateTime]; return parser.date(from: raw)
    }
    private static func id(_ raw: Any?) -> Bool { (raw as? String).map(NativeScopedTripSelection.validObjectID) == true }
    private static func time(_ raw: Any?) -> Bool { raw is NSNull || (raw as? String).flatMap(date) != nil }
}

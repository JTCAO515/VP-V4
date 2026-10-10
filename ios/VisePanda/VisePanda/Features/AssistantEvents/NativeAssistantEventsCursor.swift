import Foundation
import CoreFoundation

/// Receiptless local replay hint. Contains no messages, answers, billing state or
/// confirmation receipt. Existing owner-scoped vault supplies atomic persistence.
enum NativeAssistantEventsCursor {
    static func encode(_ sequence: Int, selection: NativeAssistantEventsSelection) throws -> Data {
        guard selection.valid, (0...999_999_999_999_999).contains(sequence) else { throw NativeDataError.invalidResponse }
        let value: [String: Any] = [
            "version": 1, "endpoint": selection.scope.endpoint, "owner": selection.scope.subject,
            "epoch": selection.scope.mobileEpoch, "session": selection.sessionID, "policy": selection.policyID,
            "conversation": selection.conversationID, "sequence": sequence,
        ]
        let bytes = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
        guard bytes.count <= 4096 else { throw NativeDataError.invalidResponse }
        return bytes
    }

    /// Caller must first freshly qualify this exact selected conversation. A cursor
    /// is never restored solely because an account ID or on-disk record matches.
    static func decode(_ bytes: Data, selection: NativeAssistantEventsSelection, qualified: Bool) throws -> Int {
        guard qualified, selection.valid, bytes.count <= 4096,
              let value = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              Set(value.keys) == ["version", "endpoint", "owner", "epoch", "session", "policy", "conversation", "sequence"],
              try integer(value["version"]) == 1,
              value["endpoint"] as? String == selection.scope.endpoint,
              value["owner"] as? String == selection.scope.subject,
              try integer(value["epoch"]) == selection.scope.mobileEpoch,
              value["session"] as? String == selection.sessionID,
              value["policy"] as? String == selection.policyID,
              value["conversation"] as? String == selection.conversationID else { throw NativeDataError.staleSessionResponse }
        return try integer(value["sequence"])
    }

    private static func integer(_ value: Any?) throws -> Int {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
              number.doubleValue.isFinite, number.doubleValue.rounded() == number.doubleValue,
              number.doubleValue >= 0, number.doubleValue <= 999_999_999_999_999 else { throw NativeDataError.invalidResponse }
        return number.intValue
    }
}

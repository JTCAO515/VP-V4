import Foundation

/// A server-persisted same-operation fence, never inferred from an error/absence.
struct NativePlaceActionCancelled {
    let tripId: String
    let operationId: String
    static func decode(_ bytes: Data, pending: NativePlaceActionPending) throws -> Self? {
        let value = try NativePlaceActionWire.object(bytes, maximum: 262144)
        guard value["kind"] as? String == "place_action_cancelled" else { return nil }
        _ = try NativePlaceActionWire.exact(value, ["kind", "tripId", "operationId", "action", "selection", "tripVersion", "mappingDigest", "requestDigest", "historicalOnly", "currentEligibilityRequiresRead"])
        let command = try pending.command.object, operationId = try pending.command.operationId, action = try pending.command.action
        guard value["tripId"] as? String == pending.command.tripId, value["operationId"] as? String == operationId,
              value["action"] as? String == action,
              try NativePlaceActionWire.selection(value["selection"] as Any) == NativePlaceActionWire.selection(command["selection"] as Any),
              NativePlaceActionWire.integer(value["tripVersion"]) == NativePlaceActionWire.integer(command["expectedTripVersion"]),
              value["mappingDigest"] as? String == command["expectedMappingDigest"] as? String,
              NativePlaceActionWire.digest(value["requestDigest"]) != nil,
              NativePlaceActionWire.boolean(value["historicalOnly"]) == true,
              NativePlaceActionWire.boolean(value["currentEligibilityRequiresRead"]) == true else { throw NativeDataError.invalidResponse }
        return .init(tripId: pending.command.tripId, operationId: try pending.command.operationId)
    }
}

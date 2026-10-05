import Foundation
import CoreFoundation

struct NativeServiceOperationCommand: Equatable {
    let body: Data
    var object: [String: Any] { get throws {
        guard body.count <= 24_000, String(data: body, encoding: .utf8) != nil else { throw NativeDataError.invalidResponse }
        guard let value = try JSONSerialization.jsonObject(with: body) as? [String: Any] else { throw NativeDataError.invalidResponse }; return value
    } }
    var operationId: String { get throws { try NativeServiceOperationWire.identifier(object["operationId"]) } }
    var caseId: String { get throws { try NativeServiceOperationWire.identifier(object["caseId"]) } }
    var action: String { get throws { try NativeServiceOperationWire.string(object["action"], max: 16) } }
    var isData: Bool { get throws { try action == "delete" } }
    func validate() throws {
        let value = try object, action = try action
        if action == "delete" {
            _ = try NativeServiceOperationWire.object(value, keys: ["action", "operationId", "caseId", "grantRevision", "confirmed"])
            _ = try operationId; _ = try caseId; _ = try NativeServiceOperationWire.integer(value["grantRevision"])
            guard let confirmed = value["confirmed"] as? NSNumber, CFGetTypeID(confirmed) == CFBooleanGetTypeID(), confirmed.boolValue else { throw NativeDataError.invalidResponse }
            return
        }
        guard ["request", "cancel", "select_proposal"].contains(action) else { throw NativeDataError.invalidResponse }
        var keys: Set<String> = ["action", "operationId", "caseId", "expectedRevision", "grantRevision"]
        if action == "request" { keys.formUnion(["urgency", "trip"]) }
        if action == "select_proposal" { keys.insert("proposal") }
        _ = try NativeServiceOperationWire.object(value, keys: keys)
        _ = try operationId; _ = try caseId
        _ = try NativeServiceOperationWire.integer(value["expectedRevision"])
        _ = try NativeServiceOperationWire.integer(value["grantRevision"])
        if action == "select_proposal" {
            let proposal = try NativeServiceOperationWire.object(value["proposal"] as Any, keys: ["proposalId", "tripId", "baseVersion"])
            _ = try NativeServiceOperationWire.identifier(proposal["proposalId"])
            _ = try NativeServiceOperationWire.identifier(proposal["tripId"])
            _ = try NativeServiceOperationWire.integer(proposal["baseVersion"], minimum: 0)
        }
        if action == "request" {
            guard ["normal", "urgent"].contains(value["urgency"] as? String) else { throw NativeDataError.invalidResponse }
            guard let trip = value["trip"] as? [String: Any] else { throw NativeDataError.invalidResponse }
            if trip["kind"] as? String == "unknown" { _ = try NativeServiceOperationWire.object(trip, keys: ["kind"]) }
            else {
                _ = try NativeServiceOperationWire.object(trip, keys: ["kind", "tripId", "headVersion"])
                guard trip["kind"] as? String == "bound" else { throw NativeDataError.invalidResponse }
                _ = try NativeServiceOperationWire.identifier(trip["tripId"])
                _ = try NativeServiceOperationWire.integer(trip["headVersion"], minimum: 0)
            }
        }
    }
    func recoveryBody(abandon: Bool = false) throws -> Data {
        try validate()
        if abandon {
            guard let original = String(data: body, encoding: .utf8) else { throw NativeDataError.invalidResponse }
            return try NativeServiceOperationWire.bytes(["action": "abandon", "operationId": operationId, "mutationBytes": original])
        }
        return try NativeServiceOperationWire.bytes(["action": "read_operation", "operationId": operationId])
    }
}

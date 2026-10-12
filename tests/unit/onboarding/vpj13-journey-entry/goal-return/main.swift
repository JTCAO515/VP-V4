import Foundation

let scope = NativeJourneyGoalReturnWire.Scope(conversationID: "00000000-0000-4000-8000-000000000001",
    goalID: "00000000-0000-4000-8000-000000000002", goalVersion: 2,
    parentMessageID: "00000000-0000-4000-8000-000000000003", inputSequence: 9)
let artifact = "00000000-0000-4000-8000-000000000004"
let reference: [String: Any] = ["artifactId": artifact, "revision": 3, "eventId": "9223372036854775807"]
let rawScope: [String: Any] = ["conversationId": scope.conversationID, "goalId": scope.goalID,
    "goalVersion": scope.goalVersion, "parentMessageId": scope.parentMessageID, "inputSequence": scope.inputSequence]
let valid: [String: Any] = ["version": 5, "kind": "goal_return", "schemaVersion": "goal-return/1",
    "scope": rawScope, "lastDecision": reference, "nextStep": ["kind": "unknown"]]
var count = 0
func decode(_ body: [String: Any]) throws -> NativeJourneyGoalReturnWire.Response {
    try NativeJourneyGoalReturnWire.decode(JSONSerialization.data(withJSONObject: body), expected: scope)
}
func reject(_ body: [String: Any], _ name: String) {
    do { _ = try decode(body); fatalError(name) } catch { count += 1 }
}
func changed(_ field: String, _ value: Any) -> [String: Any] { var body = valid; body[field] = value; return body }
func nested(_ field: String, _ key: String, _ value: Any) -> [String: Any] {
    var valueBody = valid[field] as! [String: Any]; valueBody[key] = value; return changed(field, valueBody)
}
let accepted = try decode(valid)
precondition(accepted == .reference(.init(artifactID: artifact, revision: 3, eventID: "9223372036854775807"))); count += 1
let unavailable = try decode(["version": 5, "kind": "unavailable", "nextStep": ["kind": "unknown"]])
precondition(unavailable == .unavailable); count += 1
reject(changed("extra", "forbidden"), "unknown root field")
reject(changed("version", 6), "future wire version")
reject(changed("version", true), "boolean version")
reject(changed("schemaVersion", "goal-return/2"), "future schema")
reject(nested("scope", "conversationId", scope.goalID), "different conversation")
reject(nested("scope", "goalId", scope.conversationID), "different goal")
reject(nested("scope", "goalVersion", 3), "changed goal version")
reject(nested("scope", "parentMessageId", artifact), "different parent")
reject(nested("scope", "inputSequence", 10), "changed sequence")
reject(nested("scope", "goalVersion", true), "boolean integer")
reject(nested("scope", "inputSequence", 9.5), "fractional sequence")
reject(nested("lastDecision", "eventId", "9223372036854775808"), "int64 overflow")
reject(nested("lastDecision", "eventId", "01"), "noncanonical sequence")
reject(nested("lastDecision", "eventId", 9007199254740991), "numeric sequence loses provenance")
reject(nested("lastDecision", "eventId", "0"), "zero sequence")
reject(nested("lastDecision", "revision", 1001), "revision overflow")
reject(nested("lastDecision", "revision", true), "boolean revision")
reject(nested("lastDecision", "artifactId", "00000000-0000-6000-8000-000000000004"), "unsupported UUID version")
reject(nested("lastDecision", "artifactId", "00000000-0000-4000-0000-000000000004"), "invalid UUID variant")
reject(nested("nextStep", "kind", "confirm"), "invented next action")
reject(["version": 5, "kind": "unavailable", "nextStep": ["kind": "unknown"], "reason": "foreign"], "unavailable details leak")
let query = scope.query
precondition(query.count == 5 && Set(query.map(\.name)).count == 5 && scope.valid); count += 1
print("PASS \(count) closed goal-return wire cases; no installed RPC or runtime claim")

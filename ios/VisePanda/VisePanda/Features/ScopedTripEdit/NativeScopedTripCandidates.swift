import Foundation

struct NativeScopedTripCandidates {
    struct Candidate: Identifiable {
        let id: String
        let diff: NativeScopedTripDiff
    }
    let askOperationID: String
    let basis: NativeScopedTripBasis
    let expiresAt: Date
    let candidates: [Candidate]
    var current: Bool { expiresAt > Date() }
    static func decode(_ data: Data, journal: NativeScopedTripJournal, context: NativeScopedTripContext?) throws -> Self {
        let raw = try NativeScopedTripWire.exact(data, keys: ["kind", "operationId", "tripId", "contextId", "contextDigest", "baseVersion", "expiresAt", "returnScope", "candidates", "reused"])
        let command = try journal.command()
        let mutation = try JSONSerialization.jsonObject(with: command.bytes) as! [String: Any]
        let basis = mutation["basis"] as! [String: Any]
        guard command.action == "ask", raw["kind"] as? String == "scoped_edit_candidates/1",
              raw["operationId"] as? String == command.operationID, raw["tripId"] as? String == journal.tripID,
              let contextID = raw["contextId"] as? String, contextID == basis["contextId"] as? String,
              let digest = raw["contextDigest"] as? String, digest == basis["contextDigest"] as? String,
              let version = NativeScopedTripWire.integer(raw["baseVersion"]), version == NativeScopedTripWire.integer(basis["baseVersion"]),
              let expires = (raw["expiresAt"] as? String).flatMap(NativeScopedTripCommand.date),
              let candidatesRaw = raw["candidates"] as? [Any], (1...2).contains(candidatesRaw.count),
              NativeScopedTripWire.bool(raw["reused"]) != nil else { throw NativeDataError.invalidResponse }
        let scopeRaw = try NativeScopedTripWire.exact(raw["returnScope"]!, keys: ["dayIds", "itemIds"])
        let scope = try NativeScopedTripWire.decode(NativeScopedTripScope.self, scopeRaw)
        if let context { guard scope == context.scope, context.basis.contextDigest == digest else { throw NativeDataError.invalidResponse } }
        let candidates = try candidatesRaw.map { value -> Candidate in
            let candidate = try NativeScopedTripWire.exact(value, keys: ["candidateId", "edits", "diff"])
            guard let id = candidate["candidateId"] as? String, NativeScopedTripWire.uuid(id),
                  let edits = candidate["edits"] as? [[String: Any]], (1...16).contains(edits.count) else { throw NativeDataError.invalidResponse }
            for edit in edits {
                if ["move_item", "set_time", "reorder_items"].contains(edit["kind"] as? String ?? "") {
                    _ = try NativeScopedTripCommand(object: ["action": "manual", "operationId": UUID().uuidString.lowercased(), "basis": basis, "edit": edit])
                } else {
                    let keys: Set<String>
                    switch edit["kind"] as? String {
                    case "remove_item": keys = ["kind", "itemId"]
                    case "replace_item": keys = ["kind", "itemId", "sourceItemId"]
                    case "add_item": keys = ["kind", "sourceItemId", "toDayId"]
                    default: throw NativeDataError.invalidResponse
                    }
                    guard Set(edit.keys) == keys, keys.subtracting(["kind"]).allSatisfy({ (edit[$0] as? String).map(NativeScopedTripSelection.validObjectID) == true }) else { throw NativeDataError.invalidResponse }
                }
            }
            return .init(id: id, diff: try NativeScopedTripDiff.decode(candidate["diff"]!, context: context))
        }
        guard Set(candidates.map(\.id)).count == candidates.count else { throw NativeDataError.invalidResponse }
        return .init(askOperationID: command.operationID, basis: .init(contextID: contextID, contextDigest: digest, baseVersion: version),
            expiresAt: expires, candidates: candidates)
    }
}

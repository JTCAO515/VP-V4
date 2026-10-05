import Foundation
import CryptoKit

struct NativeMaterialReferencePage {
    let objects: [NativeMaterialReferenceObject]
    let next: NativeMaterialReferenceCursor?
    let expiresAt: Date
}
struct NativeMaterialReferenceTripPage {
    let trips: [NativeMaterialReferenceTrip]
    let next: NativeMaterialReferenceCursor?
    let expiresAt: Date
}
struct NativeMaterialReferencePreview {
    let binding: NativeMaterialReferenceBinding
    let items: [NativeMaterialReferenceItem]
}
struct NativeMaterialReferenceReceipt {
    let binding: NativeMaterialReferenceBinding
    let requestDigest: String
    let decidedAt: Date
    let objects: Int
    let temporaryRecords: Int
    let unappliedProposals: Int
}
enum NativeMaterialReferenceResult {
    case erased(NativeMaterialReferenceReceipt)
    case unknown
}

enum NativeMaterialReferenceProtocol {
    private static let w = NativeCommunityWire.self
    static func digest(_ bytes: Data) -> String { SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined() }

    static func trips(_ bytes: Data, command: NativeMaterialReferenceCommand,
                      actor: NativeCommunitySafetyActor, now: Date) throws -> NativeMaterialReferenceTripPage {
        guard command.action == "trip_list" else { throw NativeDataError.invalidResponse }
        let v = try w.object(NativeMaterialReferenceWire.root(bytes), ["schemaVersion", "kind", "scope", "ownerId", "sessionId", "mobileEpoch",
            "sourceDigest", "capturedAt", "expiresAt", "items", "hasMore", "nextCursor", "allUserDataCompleted"])
        let captured = try w.integer(v["capturedAt"], max: 9_007_199_254_740_991)
        let expiry = try w.integer(v["expiresAt"], max: 9_007_199_254_740_991)
        let source = try w.hash(v["sourceDigest"]), hasMore = try w.bool(v["hasMore"])
        guard v["schemaVersion"] as? String == NativeMaterialReferenceWire.schema, v["kind"] as? String == "trip_list",
              v["scope"] as? String == command.scope.rawValue, v["ownerId"] as? String == actor.scope.subject.lowercased(),
              v["sessionId"] as? String == actor.sessionID,
              try w.integer(v["mobileEpoch"], max: 9_007_199_254_740_991) == actor.scope.mobileEpoch,
              try !w.bool(v["allUserDataCompleted"]), expiry == captured + 30_000,
              Double(captured) <= now.timeIntervalSince1970 * 1000, Double(expiry) > now.timeIntervalSince1970 * 1000,
              command.cursor == nil || command.cursor?.sourceDigest == source else { throw NativeDataError.invalidResponse }
        let trips = try w.rows(v["items"], max: 20, { try NativeMaterialReferenceTrip($0, scope: command.scope) })
        var last = command.cursor?.afterID ?? ""
        for trip in trips { guard trip.id > last else { throw NativeDataError.invalidResponse }; last = trip.id }
        let next = try w.optional(v["nextCursor"], NativeMaterialReferenceCursor.init)
        guard hasMore ? trips.count == 20 && next?.sourceDigest == source && next?.afterID == last : next == nil else { throw NativeDataError.invalidResponse }
        return .init(trips: trips, next: next, expiresAt: Date(timeIntervalSince1970: Double(expiry) / 1000))
    }

    static func list(_ bytes: Data, command: NativeMaterialReferenceCommand,
                     actor: NativeCommunitySafetyActor, now: Date) throws -> NativeMaterialReferencePage {
        guard command.action == "list" else { throw NativeDataError.invalidResponse }
        let v = try w.object(NativeMaterialReferenceWire.root(bytes), ["schemaVersion", "kind", "scope", "tripId", "ownerId", "sessionId", "mobileEpoch",
            "sourceDigest", "capturedAt", "expiresAt", "items", "hasMore", "nextCursor", "allUserDataCompleted"])
        let captured = try w.integer(v["capturedAt"], max: 9_007_199_254_740_991)
        let expiry = try w.integer(v["expiresAt"], max: 9_007_199_254_740_991)
        let source = try w.hash(v["sourceDigest"])
        let hasMore = try w.bool(v["hasMore"])
        guard v["schemaVersion"] as? String == NativeMaterialReferenceWire.schema, v["kind"] as? String == "list",
              v["scope"] as? String == command.scope.rawValue, v["tripId"] as? String == command.tripID,
              v["ownerId"] as? String == actor.scope.subject.lowercased(), v["sessionId"] as? String == actor.sessionID,
              try w.integer(v["mobileEpoch"], max: 9_007_199_254_740_991) == actor.scope.mobileEpoch,
              try !w.bool(v["allUserDataCompleted"]), expiry == captured + 30_000,
              Double(captured) <= now.timeIntervalSince1970 * 1000, Double(expiry) > now.timeIntervalSince1970 * 1000,
              command.cursor == nil || command.cursor?.sourceDigest == source else { throw NativeDataError.invalidResponse }
        let items = try w.rows(v["items"], max: 20, { try NativeMaterialReferenceObject($0, scope: command.scope) })
        var last = command.cursor?.afterID ?? ""
        for item in items { guard item.id > last else { throw NativeDataError.invalidResponse }; last = item.id }
        let next = try w.optional(v["nextCursor"], NativeMaterialReferenceCursor.init)
        guard hasMore ? items.count == 20 && next?.sourceDigest == source && next?.afterID == last : next == nil else { throw NativeDataError.invalidResponse }
        return .init(objects: items, next: next, expiresAt: Date(timeIntervalSince1970: Double(expiry) / 1000))
    }

    static func preview(_ bytes: Data, command: NativeMaterialReferenceCommand,
                        actor: NativeCommunitySafetyActor, now: Date) throws -> NativeMaterialReferencePreview {
        guard command.action == "preview" else { throw NativeDataError.invalidResponse }
        let v = try w.object(NativeMaterialReferenceWire.root(bytes), NativeMaterialReferenceWire.bindingKeys.union(["kind", "items", "requiresExplicitConfirmation"]))
        let binding = try NativeMaterialReferenceBinding(v, command: command, actor: actor, now: now)
        guard v["kind"] as? String == "preview", try w.bool(v["requiresExplicitConfirmation"]) else { throw NativeDataError.invalidResponse }
        return .init(binding: binding, items: try selectedItems(v["items"], binding: binding, now: now))
    }

    static func bundle(_ bytes: Data, command: NativeMaterialReferenceCommand, preview: NativeMaterialReferenceBinding,
                       actor: NativeCommunitySafetyActor, now: Date) throws -> NativeMaterialReferenceBinding {
        guard command.action == "export" else { throw NativeDataError.invalidResponse }
        let v = try w.object(NativeMaterialReferenceWire.root(bytes), NativeMaterialReferenceWire.bindingKeys.union(["kind", "requestDigest", "items", "proof"]))
        let binding = try NativeMaterialReferenceBinding(v, command: command, actor: actor, now: now)
        let proof = try w.object(v["proof"] as Any, ["coverage", "pages", "rows"])
        guard v["kind"] as? String == "bundle", try w.hash(v["requestDigest"]) == digest(command.body), binding == preview,
              proof["coverage"] as? String == "complete", try w.integer(proof["rows"], max: 20) == binding.objectIDs.count,
              try w.integer(proof["pages"], max: 4) == (binding.objectIDs.count + 4) / 5 else { throw NativeDataError.invalidResponse }
        _ = try selectedItems(v["items"], binding: binding, now: now)
        return binding
    }

    static func erased(_ bytes: Data, command: NativeMaterialReferenceCommand,
                       actor: NativeCommunitySafetyActor, now: Date) throws -> NativeMaterialReferenceResult {
        guard ["erase", "recover"].contains(command.action) else { throw NativeDataError.invalidResponse }
        let raw = try NativeMaterialReferenceWire.root(bytes)
        let originalBytes = command.mutationBytes ?? command.body
        if raw["kind"] as? String == "unknown" {
            let v = try w.object(raw, ["schemaVersion", "kind", "scope", "requestId", "tripId", "objectIds", "ownerId", "sessionId", "mobileEpoch", "requestDigest", "allUserDataCompleted"])
            guard command.action == "recover", v["schemaVersion"] as? String == NativeMaterialReferenceWire.schema,
                  v["scope"] as? String == command.scope.rawValue, v["requestId"] as? String == command.requestID,
                  v["tripId"] as? String == command.tripID, v["objectIds"] as? [String] == command.objectIDs,
                  v["ownerId"] as? String == actor.scope.subject.lowercased(), v["sessionId"] as? String == actor.sessionID,
                  try w.integer(v["mobileEpoch"], max: 9_007_199_254_740_991) == actor.scope.mobileEpoch,
                  try w.hash(v["requestDigest"]) == digest(originalBytes), try !w.bool(v["allUserDataCompleted"]) else { throw NativeDataError.invalidResponse }
            return .unknown
        }
        let v = try w.object(raw, NativeMaterialReferenceWire.bindingKeys.union(["kind", "state", "requestDigest", "decidedAt", "effects"]))
        let binding = try NativeMaterialReferenceBinding(v, command: command, actor: actor, now: now, allowExpired: true)
        let decided = try NativeMaterialReferenceWire.time(v["decidedAt"] as Any)
        let requestDigest = try w.hash(v["requestDigest"])
        let effects = try w.object(v["effects"] as Any, ["objects", "temporaryRecords", "unappliedProposals", "tripMutation", "externalOrders", "financialRecords"])
        let objects = try w.integer(effects["objects"], max: 20)
        let temporary = try w.integer(effects["temporaryRecords"], max: objects, minimum: 0)
        let proposals = try w.integer(effects["unappliedProposals"], max: objects, minimum: 0)
        guard v["kind"] as? String == "receipt", v["state"] as? String == "erased", requestDigest == digest(originalBytes),
              decided >= binding.capturedAt, decided < binding.expiresAt, decided <= now,
              objects == binding.objectIDs.count, effects["tripMutation"] as? String == "none",
              effects["externalOrders"] as? String == "not_contacted", effects["financialRecords"] as? String == "not_modified" else { throw NativeDataError.invalidResponse }
        return .erased(.init(binding: binding, requestDigest: requestDigest, decidedAt: decided,
            objects: objects, temporaryRecords: temporary, unappliedProposals: proposals))
    }

    private static func selectedItems(_ raw: Any?, binding: NativeMaterialReferenceBinding, now: Date) throws -> [NativeMaterialReferenceItem] {
        let items = try w.rows(raw, max: 20, { try NativeMaterialReferenceRows.parse($0, scope: binding.scope, tripID: binding.tripID, epoch: binding.epoch, now: now) })
        guard items.map(\.id) == binding.objectIDs else { throw NativeDataError.invalidResponse }
        return items
    }
}

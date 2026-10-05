import Foundation
import CryptoKit

struct NativeNotificationDataObject: Identifiable, Equatable {
    let id: String
    let label: String?
    let state: String
    let rows: Int
    init(_ raw: Any, scope: NativeNotificationDataScope) throws {
        let w = NativeCommunityWire.self
        let v = try w.object(raw, ["objectId", "label", "state", "rows"])
        id = try NativeNotificationDataCommand.id(v["objectId"])
        label = try w.optional(v["label"], { try w.text($0, max: 1000, empty: true) })
        state = try w.text(v["state"], max: 8)
        rows = try w.integer(v["rows"], max: 10_000, minimum: 0)
        guard ["active", "archived", "retained", "erased"].contains(state),
              scope == .trip || label == nil, !["retained", "erased"].contains(state) || label == nil else {
            throw NativeDataError.invalidResponse
        }
    }
}
struct NativeNotificationDataPage {
    let objects: [NativeNotificationDataObject]
    let next: NativeNotificationDataCursor?
    let expiresAt: Date
}
struct NativeNotificationDataPreview {
    let binding: NativeNotificationDataBinding
    let items: [NativeNotificationDataItem]
}
struct NativeNotificationDataReceipt {
    let binding: NativeNotificationDataBinding
    let requestDigest: String
    let decidedAt: Date
    let counts: [String: Int]
    let drainedThrough: Date
}
enum NativeNotificationDataResult {
    case erased(NativeNotificationDataReceipt)
    case unknown
}

enum NativeNotificationDataProtocol {
    private static let w = NativeCommunityWire.self
    static let countNames = ["reminders", "watches", "dismissals", "outbox", "attempts", "operations", "travelReminders", "devices", "pageProgress", "fences", "providerAccepted", "providerUnknown", "activeGrants"]
    static func digest(_ bytes: Data) -> String { SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined() }

    static func list(_ bytes: Data, command: NativeNotificationDataCommand,
                     actor: NativeCommunitySafetyActor, now: Date) throws -> NativeNotificationDataPage {
        guard command.action == "list" else { throw NativeDataError.invalidResponse }
        let v = try w.object(NativeNotificationDataWire.root(bytes), ["schemaVersion", "kind", "scope", "ownerId", "sessionId", "mobileEpoch", "sourceDigest", "capturedAt", "expiresAt", "items", "hasMore", "nextCursor", "allUserDataCompleted"])
        let captured = try w.integer(v["capturedAt"], max: 9_007_199_254_740_991)
        let expiry = try w.integer(v["expiresAt"], max: 9_007_199_254_740_991)
        let source = try w.hash(v["sourceDigest"]), hasMore = try w.bool(v["hasMore"])
        guard v["schemaVersion"] as? String == NativeNotificationDataWire.schema, v["kind"] as? String == "list",
              v["scope"] as? String == command.scope.rawValue, v["ownerId"] as? String == actor.scope.subject.lowercased(),
              v["sessionId"] as? String == actor.sessionID, try w.integer(v["mobileEpoch"], max: 9_007_199_254_740_991) == actor.scope.mobileEpoch,
              try !w.bool(v["allUserDataCompleted"]), expiry == captured + 30_000,
              Double(captured) <= now.timeIntervalSince1970 * 1000, Double(expiry) > now.timeIntervalSince1970 * 1000,
              command.cursor == nil || command.cursor?.sourceDigest == source else { throw NativeDataError.invalidResponse }
        let objects = try w.rows(v["items"], max: 20, { try NativeNotificationDataObject($0, scope: command.scope) })
        var last = command.cursor?.afterID ?? ""
        for object in objects { guard object.id > last else { throw NativeDataError.invalidResponse }; last = object.id }
        let next = try w.optional(v["nextCursor"], NativeNotificationDataCursor.init)
        guard hasMore ? objects.count == 20 && next?.sourceDigest == source && next?.afterID == last : next == nil else { throw NativeDataError.invalidResponse }
        return .init(objects: objects, next: next, expiresAt: Date(timeIntervalSince1970: Double(expiry) / 1000))
    }

    static func preview(_ bytes: Data, command: NativeNotificationDataCommand,
                        actor: NativeCommunitySafetyActor, now: Date) throws -> NativeNotificationDataPreview {
        guard command.action == "preview" else { throw NativeDataError.invalidResponse }
        let v = try w.object(NativeNotificationDataWire.root(bytes), NativeNotificationDataWire.bindingKeys.union(["kind", "items", "requiresExplicitConfirmation"]))
        let binding = try NativeNotificationDataBinding(v, command: command, actor: actor, now: now)
        guard v["kind"] as? String == "preview", try w.bool(v["requiresExplicitConfirmation"]) else { throw NativeDataError.invalidResponse }
        return .init(binding: binding, items: try selected(v["items"], binding: binding, now: now))
    }

    static func bundle(_ bytes: Data, command: NativeNotificationDataCommand, preview: NativeNotificationDataBinding,
                       actor: NativeCommunitySafetyActor, now: Date) throws -> NativeNotificationDataBinding {
        guard command.action == "export" else { throw NativeDataError.invalidResponse }
        let v = try w.object(NativeNotificationDataWire.root(bytes), NativeNotificationDataWire.bindingKeys.union(["kind", "requestDigest", "items", "proof"]))
        let binding = try NativeNotificationDataBinding(v, command: command, actor: actor, now: now)
        let proof = try w.object(v["proof"] as Any, ["coverage", "pages", "rows"])
        guard v["kind"] as? String == "bundle", try w.hash(v["requestDigest"]) == digest(command.body), binding == preview,
              proof["coverage"] as? String == "complete", try w.integer(proof["rows"], max: 20) == binding.objectIDs.count,
              try w.integer(proof["pages"], max: 4) == (binding.objectIDs.count + 4) / 5 else { throw NativeDataError.invalidResponse }
        _ = try selected(v["items"], binding: binding, now: now)
        return binding
    }

    static func erased(_ bytes: Data, command: NativeNotificationDataCommand,
                       actor: NativeCommunitySafetyActor, now: Date) throws -> NativeNotificationDataResult {
        guard ["erase", "recover"].contains(command.action) else { throw NativeDataError.invalidResponse }
        let raw = try NativeNotificationDataWire.root(bytes), original = command.mutationBytes ?? command.body
        if raw["kind"] as? String == "unknown" {
            let v = try w.object(raw, ["schemaVersion", "kind", "scope", "requestId", "objectIds", "ownerId", "sessionId", "mobileEpoch", "requestDigest", "allUserDataCompleted"])
            guard command.action == "recover", v["schemaVersion"] as? String == NativeNotificationDataWire.schema,
                  v["scope"] as? String == command.scope.rawValue, v["requestId"] as? String == command.requestID,
                  v["objectIds"] as? [String] == command.objectIDs, v["ownerId"] as? String == actor.scope.subject.lowercased(),
                  v["sessionId"] as? String == actor.sessionID, try w.integer(v["mobileEpoch"], max: 9_007_199_254_740_991) == actor.scope.mobileEpoch,
                  try w.hash(v["requestDigest"]) == digest(original), try !w.bool(v["allUserDataCompleted"]) else { throw NativeDataError.invalidResponse }
            return .unknown
        }
        let v = try w.object(raw, NativeNotificationDataWire.bindingKeys.union(["kind", "state", "requestDigest", "decidedAt", "effects"]))
        let binding = try NativeNotificationDataBinding(v, command: command, actor: actor, now: now, allowExpired: true)
        let receipt = try receipt(v, binding: binding, now: now)
        guard receipt.requestDigest == digest(original) else { throw NativeDataError.invalidResponse }
        return .erased(receipt)
    }

    /// Historical receipt sessions are data, never current read authority.
    /// Only the outer current-owner read admits this nested retained record.
    static func retainedReceipt(_ raw: [String: Any], actorOwner: String, now: Date) throws -> NativeNotificationDataBinding {
        let v = try w.object(raw, NativeNotificationDataWire.bindingKeys.union(["kind", "state", "requestDigest", "decidedAt", "effects"]))
        guard let scope = NativeNotificationDataScope(rawValue: v["scope"] as? String ?? ""),
              let ids = v["objectIds"] as? [String] else { throw NativeDataError.invalidResponse }
        let request = try NativeNotificationDataCommand.id(v["requestId"])
        let session = try NativeNotificationDataCommand.id(v["sessionId"])
        let epoch = try w.integer(v["mobileEpoch"], max: 9_007_199_254_740_991)
        let command = try NativeNotificationDataCommand(body: w.bytes(["action": "preview", "scope": scope.rawValue, "requestId": request, "objectIds": ids]))
        let historical = NativeCommunitySafetyActor(scope: .init(endpoint: "historical-record", subject: actorOwner, mobileEpoch: epoch, generation: 0), sessionID: session)
        let binding = try NativeNotificationDataBinding(v, command: command, actor: historical, now: now, allowExpired: true)
        _ = try receipt(v, binding: binding, now: now)
        return binding
    }

    private static func receipt(_ v: [String: Any], binding: NativeNotificationDataBinding, now: Date) throws -> NativeNotificationDataReceipt {
        let decided = try NativeNotificationDataWire.time(v["decidedAt"])
        let requestDigest = try w.hash(v["requestDigest"])
        let effects = try w.object(v["effects"] as Any, Set(countNames + ["drainedThrough", "tripMutation", "businessResults", "providerCopies", "deviceCopies"]))
        var counts: [String: Int] = [:]
        for name in countNames { counts[name] = try w.integer(effects[name], max: 200_000, minimum: 0) }
        let drained = try w.integer(effects["drainedThrough"], max: 9_007_199_254_740_991, minimum: 0)
        guard v["kind"] as? String == "receipt", v["state"] as? String == "erased",
              decided >= binding.capturedAt, decided < binding.expiresAt, decided <= now,
              Double(drained) / 1000 <= decided.timeIntervalSince1970,
              effects["tripMutation"] as? String == "none", effects["businessResults"] as? String == "not_modified",
              effects["providerCopies"] as? String == "not_recalled", effects["deviceCopies"] as? String == "not_erased" else { throw NativeDataError.invalidResponse }
        if binding.scope == .progress {
            guard counts.allSatisfy({ ["pageProgress", "fences"].contains($0.key) || $0.value == 0 }) else { throw NativeDataError.invalidResponse }
        }
        return .init(binding: binding, requestDigest: requestDigest, decidedAt: decided, counts: counts,
            drainedThrough: Date(timeIntervalSince1970: Double(drained) / 1000))
    }

    private static func selected(_ raw: Any?, binding: NativeNotificationDataBinding, now: Date) throws -> [NativeNotificationDataItem] {
        let items = try w.rows(raw, max: 20, { try NativeNotificationDataRows.parse($0, binding: binding, now: now) })
        guard items.map(\.id) == binding.objectIDs else { throw NativeDataError.invalidResponse }; return items
    }
}

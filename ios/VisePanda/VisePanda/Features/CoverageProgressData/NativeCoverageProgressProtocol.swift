import Foundation

enum NativeCoverageProgressProtocol {
    struct Page {
        let objects: [NativeCoverageProgressObject]
        let next: NativeCoverageProgressCursor?
        let expiry: Date
    }
    static func list(_ bytes: Data, command: NativeCoverageProgressCommand, actor: NativeCommunitySafetyActor, now: Date) throws -> Page {
        let w = NativeCommunityWire.self, s = NativeCoverageProgressWire.self
        let v = try s.root(bytes)
        _ = try w.object(v, ["schemaVersion", "kind", "scope", "ownerId", "sessionId", "mobileEpoch", "sourceDigest", "capturedAt", "expiresAt", "items", "hasMore", "nextCursor", "allUserDataCompleted"])
        try s.actor(v, actor)
        let digest = try w.hash(v["sourceDigest"]), capture = try s.integer(v["capturedAt"]), expiry = try s.integer(v["expiresAt"])
        guard command.action == "list", v["kind"] as? String == "list", expiry == capture + 30_000,
              try s.time(capture) <= now, try s.time(expiry) > now,
              command.cursor == nil || command.cursor?.digest == digest,
              let items = v["items"] as? [[String: Any]], items.count <= 20 else { throw NativeDataError.invalidResponse }
        var last = command.cursor?.afterID ?? ""
        let objects: [NativeCoverageProgressObject] = try items.map {
            let row = try w.object($0, ["objectId", "domain", "state", "rows"])
            let id = try NativeCoverageProgressCommand.id(row["objectId"])
            guard id > last, let domain = row["domain"] as? String, ["collector", "exit"].contains(domain),
                  let state = row["state"] as? String, ["active", "retained", "erased"].contains(state) else { throw NativeDataError.invalidResponse }
            last = id
            return .init(id: id, domain: domain, state: state, rows: try s.integer(row["rows"], max: 3, minimum: 0))
        }
        let more = try w.bool(v["hasMore"])
        let next = try w.optional(v["nextCursor"]) { try NativeCoverageProgressCursor($0 as Any) }
        guard more ? objects.count == 20 && next?.digest == digest && next?.afterID == last : next == nil else { throw NativeDataError.invalidResponse }
        return .init(objects: objects, next: next, expiry: try s.time(expiry))
    }
    static func preview(_ bytes: Data, command: NativeCoverageProgressCommand, actor: NativeCommunitySafetyActor, now: Date) throws -> NativeCoverageProgressPreview {
        let v = try NativeCoverageProgressWire.root(bytes)
        _ = try NativeCommunityWire.object(v, NativeCoverageProgressWire.bindingKeys.union(["kind", "items", "requiresExplicitConfirmation"]))
        guard command.action == "preview", v["kind"] as? String == "preview",
              try NativeCommunityWire.bool(v["requiresExplicitConfirmation"]) else { throw NativeDataError.invalidResponse }
        let binding = try NativeCoverageProgressBinding(v, command: command, actor: actor, now: now)
        return .init(binding: binding, items: try NativeCoverageProgressRows.items(v["items"], binding: binding))
    }
    static func bundle(_ bytes: Data, command: NativeCoverageProgressCommand, reviewed: NativeCoverageProgressBinding,
                       actor: NativeCommunitySafetyActor, now: Date) throws -> NativeCoverageProgressBinding {
        let v = try NativeCoverageProgressWire.root(bytes)
        _ = try NativeCommunityWire.object(v, NativeCoverageProgressWire.bindingKeys.union(["kind", "requestDigest", "items", "proof"]))
        let binding = try NativeCoverageProgressBinding(v, command: command, actor: actor, now: now)
        guard command.action == "export", v["kind"] as? String == "bundle", binding == reviewed,
              try NativeCommunityWire.hash(v["requestDigest"]) == NativeCoverageProgressWire.digest(command.body) else { throw NativeDataError.invalidResponse }
        let items = try NativeCoverageProgressRows.items(v["items"], binding: binding)
        let proof = try NativeCommunityWire.object(v["proof"] as Any, ["coverage", "pages", "rows"])
        guard proof["coverage"] as? String == "complete",
              try NativeCoverageProgressWire.integer(proof["pages"], max: 4) == (items.count + 4) / 5,
              try NativeCoverageProgressWire.integer(proof["rows"], max: 20) == items.count else { throw NativeDataError.invalidResponse }
        return binding
    }
    static func erased(_ bytes: Data, command: NativeCoverageProgressCommand, actor: NativeCommunitySafetyActor, now: Date) throws -> NativeCoverageProgressReceipt? {
        guard ["erase", "recover"].contains(command.action) else { throw NativeDataError.invalidResponse }
        let v = try NativeCoverageProgressWire.root(bytes)
        let digest = NativeCoverageProgressWire.digest(command.mutationBytes ?? command.body)
        if v["kind"] as? String == "unknown" {
            _ = try NativeCommunityWire.object(v, ["schemaVersion", "kind", "scope", "requestId", "objectIds", "ownerId", "sessionId", "mobileEpoch", "requestDigest", "allUserDataCompleted"])
            try NativeCoverageProgressWire.actor(v, actor)
            guard command.action == "recover", v["requestId"] as? String == command.requestID,
                  v["objectIds"] as? [String] == command.objectIDs, v["requestDigest"] as? String == digest else { throw NativeDataError.invalidResponse }
            return nil
        }
        _ = try NativeCommunityWire.object(v, NativeCoverageProgressWire.bindingKeys.union(["kind", "state", "requestDigest", "committedAt", "decidedAt", "effects"]))
        let binding = try NativeCoverageProgressBinding(v, command: command, actor: actor, now: now, expiredReceipt: true)
        let committed = try NativeCoverageProgressWire.time(v["committedAt"]), decided = try NativeCoverageProgressWire.time(v["decidedAt"])
        guard v["kind"] as? String == "receipt", v["state"] as? String == "erased",
              try NativeCommunityWire.hash(v["requestDigest"]) == digest, committed >= binding.capturedAt,
              committed < binding.expiresAt, decided == committed, decided <= now else { throw NativeDataError.invalidResponse }
        let effects = try NativeCoverageProgressRows.effects(v["effects"] as Any)
        guard effects["retainedFences"] == binding.objectIDs.count else { throw NativeDataError.invalidResponse }
        return .init(binding: binding, collectorRequests: effects["collectorRequests"]!, collectorSections: effects["collectorSections"]!,
            exitPages: effects["exitPages"]!, retainedFences: effects["retainedFences"]!)
    }
}

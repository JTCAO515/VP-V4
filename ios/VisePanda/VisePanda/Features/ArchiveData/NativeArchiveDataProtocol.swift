import Foundation

enum NativeArchiveDataProtocol {
    struct Page {
        let objects: [NativeArchiveDataObject]
        let next: NativeArchiveDataCursor?
        let expiry: Date
    }
    static func list(_ bytes: Data, command: NativeArchiveDataCommand, actor: NativeCommunitySafetyActor, now: Date) throws -> Page {
        let w = NativeCommunityWire.self, s = NativeArchiveDataWire.self, v = try s.root(bytes)
        _ = try w.object(v, ["schemaVersion", "kind", "scope", "ownerId", "sessionId", "mobileEpoch", "sourceDigest", "capturedAt", "expiresAt", "items", "hasMore", "nextCursor", "allUserDataCompleted"])
        try s.actor(v, actor, scope: command.scope)
        let digest = try w.hash(v["sourceDigest"]), capture = try s.integer(v["capturedAt"]), expiry = try s.integer(v["expiresAt"])
        guard command.action == "list", v["kind"] as? String == "list", expiry == capture + 30_000,
              try s.time(capture) <= now, try s.time(expiry) > now, command.cursor == nil || command.cursor?.digest == digest,
              let items = v["items"] as? [[String: Any]], items.count <= 20 else { throw NativeDataError.invalidResponse }
        var last = command.cursor?.afterID ?? ""
        let objects = try items.map { row -> NativeArchiveDataObject in
            let result: NativeArchiveDataObject
            if command.scope == .trip {
                let trip = try NativeTripLifecycleWire.trip(row)
                _ = try NativeArchiveDataCommand.id(trip.id)
                guard trip.state == .archived else { throw NativeDataError.invalidResponse }
                result = .init(id: trip.id, trip: trip, originalScope: nil, originalTripID: nil, originalTripVersion: nil, state: "archived", progressErased: false)
            } else {
                _ = try w.object(row, ["objectId", "originalScope", "tripId", "tripVersion", "state", "progressErased"])
                guard let original = (row["originalScope"] as? String).flatMap(NativeArchiveDataScope.init(rawValue:)),
                      let state = row["state"] as? String, ["previewed", "exporting", "exported", "erased"].contains(state) else { throw NativeDataError.invalidResponse }
                let tripID = try w.optional(row["tripId"]) { try NativeArchiveDataCommand.id($0) }
                let version = try w.optional(row["tripVersion"]) { try s.integer($0, max: Int(Int32.max)) }
                guard original == .trip ? tripID != nil && version != nil : tripID == nil && version == nil else { throw NativeDataError.invalidResponse }
                result = .init(id: try NativeArchiveDataCommand.id(row["objectId"]), trip: nil, originalScope: original,
                    originalTripID: tripID, originalTripVersion: version, state: state, progressErased: try w.bool(row["progressErased"]))
            }
            guard result.id > last else { throw NativeDataError.invalidResponse }; last = result.id; return result
        }
        let more = try w.bool(v["hasMore"]), next = try w.optional(v["nextCursor"]) { try NativeArchiveDataCursor($0 as Any) }
        guard more ? objects.count == 20 && next?.digest == digest && next?.afterID == last : next == nil else { throw NativeDataError.invalidResponse }
        return .init(objects: objects, next: next, expiry: try s.time(expiry))
    }
    static func preview(_ bytes: Data, command: NativeArchiveDataCommand, actor: NativeCommunitySafetyActor, now: Date) throws -> NativeArchiveDataPreview {
        let w = NativeCommunityWire.self, s = NativeArchiveDataWire.self, v = try s.root(bytes)
        _ = try w.object(v, s.bindingKeys.union(["kind", "counts", "snapshotVersionGaps"]))
        guard command.action == "preview", v["kind"] as? String == "preview" else { throw NativeDataError.invalidResponse }
        let binding = try NativeArchiveDataBinding(v, command: command, actor: actor, now: now)
        let raw = try w.object(v["counts"] as Any, ["trip", "snapshots", "operations", "progress"])
        var counts: [String: Int] = [:]
        for (key, value) in raw { counts[key] = try s.integer(value, max: 10000, minimum: 0) }
        let gaps = try s.integer(v["snapshotVersionGaps"], max: Int(Int32.max) + 1, minimum: 0)
        if binding.scope == .trip {
            guard counts["trip"] == 1, counts["progress"] == 0, let snapshots = counts["snapshots"], snapshots > 0,
                  let version = binding.tripVersion, snapshots + gaps == version + 1 else { throw NativeDataError.invalidResponse }
        } else {
            guard counts["trip"] == 0, counts["snapshots"] == 0, counts["operations"] == 0,
                  counts["progress"] == binding.objectIDs.count, gaps == 0 else { throw NativeDataError.invalidResponse }
        }
        return .init(binding: binding, counts: counts, snapshotVersionGaps: gaps)
    }
    static func bundle(_ bytes: Data, command: NativeArchiveDataCommand, reviewed: NativeArchiveDataPreview?,
                       actor: NativeCommunitySafetyActor, now: Date) throws -> NativeArchiveDataBinding {
        let w = NativeCommunityWire.self, s = NativeArchiveDataWire.self, v = try s.root(bytes)
        _ = try w.object(v, s.bindingKeys.union(["kind", "requestDigest", "sections", "proof"]))
        let binding = try NativeArchiveDataBinding(v, command: command, actor: actor, now: now)
        guard command.action == "export", v["kind"] as? String == "bundle", reviewed == nil || binding == reviewed?.binding,
              try w.hash(v["requestDigest"]) == s.digest(command.body) else { throw NativeDataError.invalidResponse }
        let counts = try NativeArchiveDataRows.sections(v["sections"], binding: binding)
        guard reviewed == nil || counts == reviewed?.counts else { throw NativeDataError.invalidResponse }
        let proof = try w.object(v["proof"] as Any, ["coverage", "pages", "rows"])
        let rowCount = counts.values.reduce(0, +), pages = binding.scope.sections.reduce(0) { $0 + max(1, ((counts[$1] ?? 0) + 49) / 50) }
        guard proof["coverage"] as? String == "complete", rowCount <= 20001, pages <= 402,
              try s.integer(proof["pages"], max: 402) == pages, try s.integer(proof["rows"], max: 20001, minimum: 0) == rowCount else { throw NativeDataError.invalidResponse }
        return binding
    }
    static func validated(_ bytes: Data, command: NativeArchiveDataCommand, original: NativeArchiveDataCommand,
                          binding: NativeArchiveDataBinding, actor: NativeCommunitySafetyActor, now: Date) throws {
        let w = NativeCommunityWire.self, s = NativeArchiveDataWire.self, v = try s.root(bytes)
        _ = try w.object(v, s.bindingKeys.union(["kind", "requestDigest", "current"]))
        let result = try NativeArchiveDataBinding(v, command: command, actor: actor, now: now)
        guard command.action == "validate", original.action == "export", result == binding,
              v["kind"] as? String == "validated", try w.bool(v["current"]),
              try w.hash(v["requestDigest"]) == s.digest(original.body) else { throw NativeDataError.invalidResponse }
    }
    static func erased(_ bytes: Data, command: NativeArchiveDataCommand, actor: NativeCommunitySafetyActor, now: Date) throws -> NativeArchiveDataReceipt? {
        let w = NativeCommunityWire.self, s = NativeArchiveDataWire.self
        guard ["erase", "recover"].contains(command.action), command.scope == .progress else { throw NativeDataError.invalidResponse }
        let v = try s.root(bytes), digest = s.digest(command.mutationBytes ?? command.body)
        if v["kind"] as? String == "unknown" {
            _ = try w.object(v, ["schemaVersion", "kind", "scope", "requestId", "tripId", "tripVersion", "objectIds", "ownerId", "sessionId", "mobileEpoch", "requestDigest", "allUserDataCompleted"])
            try s.actor(v, actor, scope: .progress)
            guard v["requestId"] as? String == command.requestID, v["tripId"] is NSNull, v["tripVersion"] is NSNull,
                  v["objectIds"] as? [String] == command.objectIDs, v["requestDigest"] as? String == digest else { throw NativeDataError.invalidResponse }
            return nil
        }
        _ = try w.object(v, s.bindingKeys.union(["kind", "state", "requestDigest", "decidedAt", "effects"]))
        let binding = try NativeArchiveDataBinding(v, command: command, actor: actor, now: now, expiredReceipt: true)
        let decided = try s.time(v["decidedAt"])
        guard v["kind"] as? String == "receipt", v["state"] as? String == "erased", try w.hash(v["requestDigest"]) == digest,
              decided >= binding.capturedAt, decided < binding.expiresAt, decided <= now else { throw NativeDataError.invalidResponse }
        let effects = try w.object(v["effects"] as Any, ["clearedProgress", "retainedFences", "sourceTrip", "externalCopies"])
        let cleared = try s.integer(effects["clearedProgress"], max: 60, minimum: 0), retained = try s.integer(effects["retainedFences"], max: 20)
        guard retained == binding.objectIDs.count, effects["sourceTrip"] as? String == "not_modified",
              effects["externalCopies"] as? String == "not_erased" else { throw NativeDataError.invalidResponse }
        return .init(binding: binding, requestDigest: digest, decidedAt: decided, clearedProgress: cleared, retainedFences: retained)
    }
}

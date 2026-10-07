import Foundation

enum NativeProfileDataProtocol {
    static func preview(_ bytes: Data, command: NativeProfileDataCommand, actor: NativeCommunitySafetyActor, now: Date) throws -> NativeProfileDataPreview {
        guard command.action == "preview" else { throw NativeDataError.invalidResponse }
        let w = NativeCommunityWire.self, s = NativeProfileDataWire.self
        let v = try s.root(bytes)
        _ = try w.object(v, s.bindingKeys.union(["kind", "profile", "summary", "copies", "conflicts", "eligible", "progressCount"]))
        guard v["kind"] as? String == "preview" else { throw NativeDataError.invalidResponse }
        let binding = try NativeProfileDataBinding(v, command: command, actor: actor, now: now)
        let profile = try w.optional(v["profile"]) { try NativeProfileDataFields($0 as Any) }
        let summary = try w.optional(v["summary"]) { try NativeProfileDataSummary($0 as Any) }
        let copies = try NativeProfileDataCopies(v["copies"] as Any)
        let conflicts = try s.ordered(v["conflicts"], allowed: s.conflicts)
        let eligible = try w.bool(v["eligible"]), count = try s.integer(v["progressCount"])
        guard eligible == conflicts.isEmpty else { throw NativeDataError.invalidResponse }
        if command.scope == .sensitive {
            guard let profile, let summary, count == 0, summary.hasPaceRequest == profile.hasPaceRequest,
                  summary.hasPaceUndo == profile.hasPaceUndo,
                  !["explicit", "paused"].contains(summary.paceState) || profile.paceNotice == "local-planning-cross-trip-v1" else { throw NativeDataError.invalidResponse }
            guard profile.hasPaceRequest == (profile.paceOperation != nil),
                  !profile.hasPaceRequest || profile.paceRequestOperation == profile.paceOperation && (profile.paceRequestRevision ?? -1) + 1 == summary.paceRevision,
                  !profile.hasPaceUndo || profile.paceRequestAction == "save",
                  ["explicit", "paused"].contains(summary.paceState) || profile.paceNotice == nil else { throw NativeDataError.invalidResponse }
        } else {
            guard profile == nil, summary == nil, copies.empty, count == command.objectIDs.count else { throw NativeDataError.invalidResponse }
        }
        return .init(binding: binding, profile: profile, summary: summary, copies: copies, conflicts: conflicts, eligible: eligible, progressCount: count)
    }

    static func decision(_ raw: Any, scope: NativeProfileDataScope, captured: Date, expires: Date, now: Date, selected: Int) throws -> NativeProfileDataDecision {
        let w = NativeCommunityWire.self, s = NativeProfileDataWire.self
        let v = try w.object(raw, ["requestDigest", "decidedAt", "beforeProfileRevision", "afterProfileRevision", "beforePaceRevision", "afterPaceRevision", "erasedFields", "briefCasesInvalidated", "retainedCopies", "clearedPreviews", "retainedFences", "sourceProfile", "paceConsent", "account", "sourceTrip", "explicitMemory", "financialProvider", "externalCopies"])
        let digest = try w.hash(v["requestDigest"]), decided = try s.time(v["decidedAt"])
        guard decided >= captured, decided < expires, decided <= now,
              v["account"] as? String == "not_modified", v["sourceTrip"] as? String == "not_modified",
              v["explicitMemory"] as? String == "not_modified", v["financialProvider"] as? String == "not_modified",
              v["externalCopies"] as? String == "not_erased" else { throw NativeDataError.invalidResponse }
        let beforeProfile = try w.optional(v["beforeProfileRevision"], { try s.integer($0, maximum: 9_007_199_254_740_990) })
        let afterProfile = try w.optional(v["afterProfileRevision"], { try s.integer($0, maximum: 9_007_199_254_740_990) })
        let beforePace = try w.optional(v["beforePaceRevision"], { try s.integer($0, maximum: 9_007_199_254_740_990) })
        let afterPace = try w.optional(v["afterPaceRevision"], { try s.integer($0, maximum: 9_007_199_254_740_990) })
        let erasedFields = try s.ordered(v["erasedFields"], allowed: s.fields)
        let briefCases = try NativeProfileDataCommand.ids(v["briefCasesInvalidated"])
        let copies = try NativeProfileDataCopies(v["retainedCopies"] as Any)
        let cleared = try s.integer(v["clearedPreviews"]), retained = try s.integer(v["retainedFences"])
        if scope == .sensitive {
            guard let beforeProfile, let afterProfile, let beforePace, let afterPace,
                  afterProfile == beforeProfile + 1, afterPace == beforePace + 1,
                  v["sourceProfile"] as? String == "cleared", v["paceConsent"] as? String == "revoked",
                  erasedFields == s.fields, cleared == 0, retained == 1,
                  copies.ids["briefPreviews"]?.isEmpty == true, copies.ids["sharedBriefs"]?.isEmpty == true else { throw NativeDataError.invalidResponse }
        } else {
            guard [beforeProfile, afterProfile, beforePace, afterPace].allSatisfy({ $0 == nil }),
                  v["sourceProfile"] as? String == "not_modified", v["paceConsent"] as? String == "not_modified",
                  erasedFields.isEmpty, briefCases.isEmpty, copies.empty, cleared <= selected, retained == selected else { throw NativeDataError.invalidResponse }
        }
        return .init(requestDigest: digest, decidedAt: decided, beforeProfileRevision: beforeProfile, afterProfileRevision: afterProfile,
            beforePaceRevision: beforePace, afterPaceRevision: afterPace, erasedFields: erasedFields, briefCasesInvalidated: briefCases,
            retainedCopies: copies, clearedPreviews: cleared, retainedFences: retained)
    }

    /// Recovery reads immutable decisions after preview expiry, with the original mutation bytes.
    static func receipt(_ bytes: Data, command: NativeProfileDataCommand, actor: NativeCommunitySafetyActor, now: Date) throws -> NativeProfileDataReceipt? {
        guard ["erase", "recover"].contains(command.action) else { throw NativeDataError.invalidResponse }
        let w = NativeCommunityWire.self, s = NativeProfileDataWire.self, v = try s.root(bytes)
        let digest = s.digest(command.mutationBytes ?? command.body)
        if v["kind"] as? String == "unknown" {
            guard command.action == "recover" else { throw NativeDataError.invalidResponse }
            _ = try w.object(v, ["schemaVersion", "kind", "scope", "requestId", "profileId", "objectIds", "ownerId", "sessionId", "mobileEpoch", "requestDigest", "allUserDataCompleted"])
            try s.actor(v, actor, scope: command.scope)
            guard try NativeProfileDataCommand.id(v["requestId"]) == command.requestID,
                  try w.optional(v["profileId"], NativeProfileDataCommand.id) == command.profileID,
                  try NativeProfileDataCommand.ids(v["objectIds"], maximum: 20) == command.objectIDs,
                  try w.hash(v["requestDigest"]) == digest else { throw NativeDataError.invalidResponse }
            return nil
        }
        _ = try w.object(v, s.bindingKeys.union(["kind", "state", "decision"]))
        guard v["kind"] as? String == "receipt", v["state"] as? String == "erased" else { throw NativeDataError.invalidResponse }
        let binding = try NativeProfileDataBinding(v, command: command, actor: actor, now: now, decided: true)
        let result = try decision(v["decision"] as Any, scope: command.scope, captured: binding.capturedAt, expires: binding.expiresAt, now: now, selected: command.objectIDs.count)
        guard result.requestDigest == digest else { throw NativeDataError.invalidResponse }
        return .init(binding: binding, decision: result)
    }

    private static func operation(_ raw: [String: Any], owner: String, now: Date) throws -> NativeProfileDataObject {
        let w = NativeCommunityWire.self, s = NativeProfileDataWire.self
        let v = try w.object(raw, ["requestId", "ownerId", "sessionId", "mobileEpoch", "scope", "profileId", "objectIds", "sourceDigest", "previewDigest", "capturedAt", "expiresAt", "requestDigest", "state", "previewErased", "summary", "copies", "conflicts", "decision"])
        let selection = try NativeProfileDataCommand(body: w.bytes(["action": "preview", "scope": v["scope"] as Any, "requestId": v["requestId"] as Any, "profileId": v["profileId"] as Any, "objectIds": v["objectIds"] as Any]))
        guard try NativeProfileDataCommand.id(v["ownerId"]) == owner,
              selection.scope != .sensitive || selection.profileID == owner else { throw NativeDataError.invalidResponse }
        _ = try NativeProfileDataCommand.id(v["sessionId"]); _ = try s.integer(v["mobileEpoch"], minimum: 1)
        _ = try w.hash(v["sourceDigest"]); _ = try w.hash(v["previewDigest"])
        let capture = try s.integer(v["capturedAt"], minimum: 1), expiry = try s.integer(v["expiresAt"], minimum: 1)
        let captured = try s.time(capture), expires = try s.time(expiry)
        guard capture <= 9_007_199_254_740_991 - 30000, captured <= now, expiry == capture + 30000,
              let state = v["state"] as? String, ["previewed", "erased"].contains(state) else { throw NativeDataError.invalidResponse }
        let erased = try w.bool(v["previewErased"])
        var summary: NativeProfileDataSummary?
        if erased {
            guard [v["summary"], v["copies"], v["conflicts"]].allSatisfy({ $0 is NSNull }) else { throw NativeDataError.invalidResponse }
        } else {
            summary = try w.optional(v["summary"]) { try NativeProfileDataSummary($0 as Any) }
            guard (selection.scope == .sensitive) == (summary != nil) else { throw NativeDataError.invalidResponse }
            let copies = try NativeProfileDataCopies(v["copies"] as Any)
            guard selection.scope != .progress || copies.empty else { throw NativeDataError.invalidResponse }
            _ = try s.ordered(v["conflicts"], allowed: s.conflicts)
        }
        if state == "previewed" {
            guard v["requestDigest"] is NSNull, v["decision"] is NSNull else { throw NativeDataError.invalidResponse }
        } else {
            guard erased else { throw NativeDataError.invalidResponse }
            let d = try decision(v["decision"] as Any, scope: selection.scope, captured: captured, expires: expires, now: now, selected: selection.objectIDs.count)
            guard try w.hash(v["requestDigest"]) == d.requestDigest else { throw NativeDataError.invalidResponse }
        }
        guard let id = selection.requestID else { throw NativeDataError.invalidResponse }
        return .init(id: id, summary: summary, operationInventory: try s.inventory(v))
    }

    static func list(_ bytes: Data, command: NativeProfileDataCommand, actor: NativeCommunitySafetyActor, now: Date) throws -> NativeProfileDataPage {
        guard command.action == "list" else { throw NativeDataError.invalidResponse }
        let w = NativeCommunityWire.self, s = NativeProfileDataWire.self, v = try s.root(bytes)
        _ = try w.object(v, ["schemaVersion", "kind", "scope", "ownerId", "sessionId", "mobileEpoch", "sourceDigest", "capturedAt", "expiresAt", "items", "hasMore", "nextCursor", "allUserDataCompleted"])
        try s.actor(v, actor, scope: command.scope)
        let digest = try w.hash(v["sourceDigest"]), capture = try s.integer(v["capturedAt"], minimum: 1), expiry = try s.integer(v["expiresAt"], minimum: 1)
        let captured = try s.time(capture), expires = try s.time(expiry)
        guard v["kind"] as? String == "list", now.timeIntervalSince1970.isFinite, capture <= 9_007_199_254_740_991 - 30000,
              captured <= now, expiry == capture + 30000, now < expires,
              command.cursor == nil || command.cursor?.digest == digest,
              let rows = v["items"] as? [[String: Any]], rows.count <= 20 else { throw NativeDataError.invalidResponse }
        let hasMore = try w.bool(v["hasMore"]), next = try w.optional(v["nextCursor"]) { try NativeProfileDataCursor($0 as Any) }
        var previous = command.cursor?.afterID ?? ""
        let objects = try rows.map { row -> NativeProfileDataObject in
            let result: NativeProfileDataObject
            if command.scope == .sensitive {
                _ = try w.object(row, ["profileId", "summary"])
                let id = try NativeProfileDataCommand.id(row["profileId"])
                guard id == actor.scope.subject.lowercased() else { throw NativeDataError.invalidResponse }
                result = try .init(id: id, summary: NativeProfileDataSummary(row["summary"] as Any), operationInventory: nil)
            } else { result = try operation(row, owner: actor.scope.subject.lowercased(), now: now) }
            guard result.id > previous else { throw NativeDataError.invalidResponse }; previous = result.id
            return result
        }
        guard command.scope != .sensitive || objects.count <= 1 && !hasMore,
              hasMore ? objects.count == 20 && next?.digest == digest && next?.afterID == previous : next == nil else { throw NativeDataError.invalidResponse }
        return .init(objects: objects, next: next, expiresAt: expires)
    }
}

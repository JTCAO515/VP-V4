import Foundation

struct NativeConversationDataObject: Identifiable, Equatable {
    let id: String
    let rootKind: NativeConversationDataRoot?
    let createdAt: Date
    /// A validated finite metadata projection, never recursively embedded receipts.
    let operationFields: String?
}

struct NativeConversationDataPreview {
    let binding: NativeConversationDataBinding
    let graph: NativeConversationDataGraph
    let erased: [String: Int]
    let redacted: [String: Int]
    let retained: [String: Int]
    let tripIDs: [String]
    let memoryIDs: [String]
    let conflicts: [String]
    let eligible: Bool
    let progressCount: Int
}

struct NativeConversationDataReceipt {
    let binding: NativeConversationDataBinding
    let requestDigest: String
    let decidedAt: Date
    let graph: NativeConversationDataGraph
    let erased: [String: Int]
    let redacted: [String: Int]
    let retained: [String: Int]
    let clearedPreviews: Int
    let retainedFences: Int
}

private struct NativeConversationDataDecision {
    let requestDigest: String
    let decidedAt: Date
    let graph: NativeConversationDataGraph
    let erased: [String: Int]
    let redacted: [String: Int]
    let retained: [String: Int]
    let clearedPreviews: Int
    let retainedFences: Int

    func receipt(_ binding: NativeConversationDataBinding) -> NativeConversationDataReceipt {
        .init(binding: binding, requestDigest: requestDigest, decidedAt: decidedAt, graph: graph,
            erased: erased, redacted: redacted, retained: retained, clearedPreviews: clearedPreviews, retainedFences: retainedFences)
    }
}

enum NativeConversationDataProtocol {
    struct Page {
        let objects: [NativeConversationDataObject]
        let next: NativeConversationDataCursor?
        let expiresAt: Date
    }
    static func conflictList(_ raw: Any?) throws -> [String] {
        let all = NativeConversationDataWire.conflicts
        guard let values = raw as? [String], values.count <= all.count else { throw NativeDataError.invalidResponse }
        var previous = -1
        for value in values {
            guard let index = all.firstIndex(of: value), index > previous else { throw NativeDataError.invalidResponse }
            previous = index
        }
        return values
    }
    static func references(_ raw: Any?) throws -> (trips: [String], memories: [String]) {
        let v = try NativeCommunityWire.object(raw as Any, ["tripIds", "memoryIds"])
        return (try NativeConversationDataCommand.ids(v["tripIds"]), try NativeConversationDataCommand.ids(v["memoryIds"]))
    }
    static func root(_ graph: NativeConversationDataGraph, command: NativeConversationDataCommand) -> Bool {
        if command.scope == .progress { return graph.ids.values.allSatisfy(\.isEmpty) }
        if command.rootKind == .conversation { return graph.ids["conversationIds"] == [command.rootID ?? ""] }
        return graph.ids["threadIds"] == [command.rootID ?? ""] &&
            ["conversationIds", "goalIds", "messageIds"].allSatisfy { graph.ids[$0]?.isEmpty == true }
    }
    static func cardinalities(_ graph: NativeConversationDataGraph, erased: [String: Int], redacted: [String: Int], retained: [String: Int]) -> Bool {
        ["conversations": "conversationIds", "goals": "goalIds", "messages": "messageIds", "threads": "threadIds", "turns": "turnIds", "artifacts": "artifactIds"].allSatisfy {
            erased[$0.key] == graph.ids[$0.value]?.count
        } && redacted["taskDigests"] == graph.ids["taskIds"]?.count && retained["tasks"] == graph.ids["taskIds"]?.count
    }
    static func totalRows(erased: [String: Int], redacted: [String: Int], retained: [String: Int]) -> Int {
        erased.values.reduce(0, +) + retained.values.reduce(0, +) + (redacted["textBodies"] ?? 0)
    }

    static func list(_ bytes: Data, command: NativeConversationDataCommand, actor: NativeCommunitySafetyActor, now: Date) throws -> Page {
        let w = NativeCommunityWire.self, s = NativeConversationDataWire.self, v = try s.root(bytes)
        _ = try w.object(v, ["schemaVersion", "kind", "scope", "rootKind", "ownerId", "sessionId", "mobileEpoch", "sourceDigest", "capturedAt", "expiresAt", "items", "hasMore", "nextCursor", "allUserDataCompleted"])
        try s.actor(v, actor, scope: command.scope)
        let kind = try w.optional(v["rootKind"]) { value in
            guard let text = value as? String, let root = NativeConversationDataRoot(rawValue: text) else { throw NativeDataError.invalidResponse }
            return root
        }
        let capture = try s.integer(v["capturedAt"]), expiry = try s.integer(v["expiresAt"]), digest = try w.hash(v["sourceDigest"])
        guard command.action == "list", v["kind"] as? String == "list", kind == command.rootKind,
              capture <= 9_007_199_254_740_991 - 30_000, expiry == capture + 30_000,
              try s.time(capture) <= now, try s.time(expiry) > now,
              command.cursor == nil || command.cursor?.digest == digest,
              let items = v["items"] as? [[String: Any]], items.count <= 20 else { throw NativeDataError.invalidResponse }
        var last = command.cursor?.afterID ?? ""
        let objects = try items.map { item -> NativeConversationDataObject in
            let object: NativeConversationDataObject
            if command.scope == .sensitive {
                _ = try w.object(item, ["rootKind", "rootId", "createdAt"])
                guard item["rootKind"] as? String == kind?.rawValue else { throw NativeDataError.invalidResponse }
                object = .init(id: try NativeConversationDataCommand.id(item["rootId"]), rootKind: kind,
                    createdAt: try s.time(item["createdAt"]), operationFields: nil)
            } else { object = try operation(item, owner: actor.scope.subject, now: now) }
            guard object.id > last, object.createdAt <= now else { throw NativeDataError.invalidResponse }
            last = object.id; return object
        }
        let more = try w.bool(v["hasMore"]), next = try w.optional(v["nextCursor"]) { try NativeConversationDataCursor($0 as Any) }
        guard more ? objects.count == 20 && next?.digest == digest && next?.afterID == last : next == nil else { throw NativeDataError.invalidResponse }
        return .init(objects: objects, next: next, expiresAt: try s.time(expiry))
    }

    static func preview(_ bytes: Data, command: NativeConversationDataCommand, actor: NativeCommunitySafetyActor, now: Date) throws -> NativeConversationDataPreview {
        let w = NativeCommunityWire.self, s = NativeConversationDataWire.self, v = try s.root(bytes)
        _ = try w.object(v, s.bindingKeys.union(["kind", "graph", "eraseCounts", "redactCounts", "retainCounts", "retainedReferences", "conflicts", "eligible", "progressCount"]))
        guard command.action == "preview", v["kind"] as? String == "preview" else { throw NativeDataError.invalidResponse }
        let binding = try NativeConversationDataBinding(v, command: command, actor: actor, now: now)
        let graph = try NativeConversationDataGraph(v["graph"])
        let erase = try s.counts(v["eraseCounts"], keys: s.erasedKeys), redact = try s.counts(v["redactCounts"], keys: s.redactedKeys), retain = try s.counts(v["retainCounts"], keys: s.retainedKeys)
        let refs = try references(v["retainedReferences"]), conflicts = try conflictList(v["conflicts"])
        let eligible = try w.bool(v["eligible"]), progressCount = try s.integer(v["progressCount"], minimum: 0)
        guard eligible == conflicts.isEmpty,
              !eligible || root(graph, command: command) && cardinalities(graph, erased: erase, redacted: redact, retained: retain) &&
                totalRows(erased: erase, redacted: redact, retained: retain) <= 4100 else { throw NativeDataError.invalidResponse }
        if command.scope == .sensitive {
            guard progressCount == 0 else { throw NativeDataError.invalidResponse }
        } else {
            guard progressCount == command.objectIDs.count, root(graph, command: command), refs.trips.isEmpty, refs.memories.isEmpty,
                  [erase, redact, retain].allSatisfy({ $0.values.allSatisfy { $0 == 0 } }) else { throw NativeDataError.invalidResponse }
        }
        return .init(binding: binding, graph: graph, erased: erase, redacted: redact, retained: retain,
            tripIDs: refs.trips, memoryIDs: refs.memories, conflicts: conflicts, eligible: eligible, progressCount: progressCount)
    }

    static func receipt(_ bytes: Data, command: NativeConversationDataCommand, actor: NativeCommunitySafetyActor, now: Date) throws -> NativeConversationDataReceipt? {
        let w = NativeCommunityWire.self, s = NativeConversationDataWire.self, v = try s.root(bytes)
        guard ["erase", "recover"].contains(command.action) else { throw NativeDataError.invalidResponse }
        let digest = s.digest(command.mutationBytes ?? command.body)
        if v["kind"] as? String == "unknown" {
            _ = try w.object(v, ["schemaVersion", "kind", "scope", "requestId", "rootKind", "rootId", "objectIds", "ownerId", "sessionId", "mobileEpoch", "requestDigest", "allUserDataCompleted"])
            try s.actor(v, actor, scope: command.scope)
            let rootKind = try w.optional(v["rootKind"]) { try w.text($0, max: 12) }
            let rootID = try w.optional(v["rootId"], NativeConversationDataCommand.id)
            guard try NativeConversationDataCommand.id(v["requestId"]) == command.requestID,
                  rootKind == command.rootKind?.rawValue, rootID == command.rootID,
                  try NativeConversationDataCommand.ids(v["objectIds"], maximum: 20) == command.objectIDs,
                  try w.hash(v["requestDigest"]) == digest else { throw NativeDataError.invalidResponse }
            return nil
        }
        _ = try w.object(v, s.bindingKeys.union(["kind", "state", "decision"]))
        guard v["kind"] as? String == "receipt", v["state"] as? String == "erased" else { throw NativeDataError.invalidResponse }
        let binding = try NativeConversationDataBinding(v, command: command, actor: actor, now: now, decided: true)
        return try decision(v["decision"], command: command, capturedAt: binding.capturedAt,
            expiresAt: binding.expiresAt, digest: digest, now: now).receipt(binding)
    }

    private static func decision(_ raw: Any?, command: NativeConversationDataCommand, capturedAt: Date, expiresAt: Date, digest: String, now: Date) throws -> NativeConversationDataDecision {
        let w = NativeCommunityWire.self, s = NativeConversationDataWire.self
        let v = try w.object(raw as Any, ["requestDigest", "decidedAt", "graph", "erasedCounts", "redactedCounts", "retainedCounts", "clearedPreviews", "retainedFences", "sourceConversation", "sourceTrip", "explicitMemory", "externalCopies"])
        let decided = try s.time(v["decidedAt"]), graph = try NativeConversationDataGraph(v["graph"])
        let erase = try s.counts(v["erasedCounts"], keys: s.erasedKeys), redact = try s.counts(v["redactedCounts"], keys: s.redactedKeys), retain = try s.counts(v["retainedCounts"], keys: s.retainedKeys)
        let cleared = try s.integer(v["clearedPreviews"], minimum: 0), fences = try s.integer(v["retainedFences"], minimum: 0)
        guard try w.hash(v["requestDigest"]) == digest, decided >= capturedAt, decided < expiresAt, decided <= now,
              v["sourceTrip"] as? String == "not_modified", v["explicitMemory"] as? String == "not_modified",
              v["externalCopies"] as? String == "not_erased", root(graph, command: command) else { throw NativeDataError.invalidResponse }
        if command.scope == .sensitive {
            guard v["sourceConversation"] as? String == "erased", cleared == 0, fences == graph.ids.values.reduce(0, { $0 + $1.count }),
                  cardinalities(graph, erased: erase, redacted: redact, retained: retain),
                  totalRows(erased: erase, redacted: redact, retained: retain) <= 4100 else { throw NativeDataError.invalidResponse }
        } else {
            guard v["sourceConversation"] as? String == "not_modified", cleared <= command.objectIDs.count, fences == command.objectIDs.count,
                  [erase, redact, retain].allSatisfy({ $0.values.allSatisfy { $0 == 0 } }) else { throw NativeDataError.invalidResponse }
        }
        return .init(requestDigest: digest, decidedAt: decided, graph: graph,
            erased: erase, redacted: redact, retained: retain, clearedPreviews: cleared, retainedFences: fences)
    }

    private static func operation(_ v: [String: Any], owner: String, now: Date) throws -> NativeConversationDataObject {
        let w = NativeCommunityWire.self, s = NativeConversationDataWire.self
        _ = try w.object(v, ["requestId", "ownerId", "sessionId", "mobileEpoch", "scope", "rootKind", "rootId", "objectIds", "sourceDigest", "previewDigest", "capturedAt", "expiresAt", "requestDigest", "state", "previewErased", "graph", "eraseCounts", "redactCounts", "retainCounts", "retainedReferences", "conflicts", "decision"])
        var input: [String: Any] = ["action": "preview"]
        for key in ["scope", "requestId", "rootKind", "rootId", "objectIds"] { input[key] = v[key] }
        let command = try NativeConversationDataCommand(body: w.bytes(input))
        guard try NativeConversationDataCommand.id(v["ownerId"]) == owner.lowercased(),
              let state = v["state"] as? String, ["previewed", "erased"].contains(state) else { throw NativeDataError.invalidResponse }
        _ = try NativeConversationDataCommand.id(v["sessionId"]); _ = try s.integer(v["mobileEpoch"])
        _ = try w.hash(v["sourceDigest"]); _ = try w.hash(v["previewDigest"])
        let capture = try s.integer(v["capturedAt"]), expiry = try s.integer(v["expiresAt"])
        guard capture <= 9_007_199_254_740_991 - 30_000, expiry == capture + 30_000, try s.time(capture) <= now else { throw NativeDataError.invalidResponse }
        let previewErased = try w.bool(v["previewErased"])
        if previewErased {
            guard ["graph", "eraseCounts", "redactCounts", "retainCounts", "retainedReferences", "conflicts"].allSatisfy({ v[$0] is NSNull }) else { throw NativeDataError.invalidResponse }
        } else {
            let graph = try NativeConversationDataGraph(v["graph"])
            let erase = try s.counts(v["eraseCounts"], keys: s.erasedKeys), redact = try s.counts(v["redactCounts"], keys: s.redactedKeys), retain = try s.counts(v["retainCounts"], keys: s.retainedKeys)
            _ = try references(v["retainedReferences"])
            if try conflictList(v["conflicts"]).isEmpty {
                guard root(graph, command: command), cardinalities(graph, erased: erase, redacted: redact, retained: retain),
                      totalRows(erased: erase, redacted: redact, retained: retain) <= 4100 else { throw NativeDataError.invalidResponse }
            }
        }
        if state == "previewed" {
            guard v["requestDigest"] is NSNull, v["decision"] is NSNull else { throw NativeDataError.invalidResponse }
        } else {
            guard previewErased else { throw NativeDataError.invalidResponse }
            _ = try decision(v["decision"], command: command, capturedAt: s.time(capture),
                expiresAt: s.time(expiry), digest: w.hash(v["requestDigest"]), now: now)
        }
        let details = try JSONSerialization.data(withJSONObject: v, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
        guard let text = String(data: details, encoding: .utf8) else { throw NativeDataError.invalidResponse }
        return .init(id: command.requestID ?? "", rootKind: nil, createdAt: try s.time(capture), operationFields: text)
    }
}

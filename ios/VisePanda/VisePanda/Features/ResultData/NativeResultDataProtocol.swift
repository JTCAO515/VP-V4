import Foundation

struct NativeResultDataObject: Identifiable, Equatable {
    let id: String
    let createdAt: Date
    let currentRevision: Int?
    let revisionCount: Int?
    let eventCount: Int?
    let lifecycle: String?
    let resultTypes: [String]
    let operationFields: String?
}
struct NativeResultDataPreview {
    let binding: NativeResultDataBinding
    let graph: NativeResultDataGraph
    let erased: [String: Int]
    let retained: [String: Int]
    let references: NativeResultDataReferences
    let conflicts: [String]
    let eligible: Bool
    let progressCount: Int
}
struct NativeResultDataReceipt {
    let binding: NativeResultDataBinding
    let requestDigest: String
    let decidedAt: Date
    let graph: NativeResultDataGraph
    let erased: [String: Int]
    let retained: [String: Int]
    let clearedPreviews: Int
    let retainedFences: Int
}
private struct NativeResultDataDecision {
    let requestDigest: String
    let decidedAt: Date
    let graph: NativeResultDataGraph
    let erased: [String: Int]
    let retained: [String: Int]
    let clearedPreviews: Int
    let retainedFences: Int
    func receipt(_ binding: NativeResultDataBinding) -> NativeResultDataReceipt {
        .init(binding: binding, requestDigest: requestDigest, decidedAt: decidedAt, graph: graph,
            erased: erased, retained: retained, clearedPreviews: clearedPreviews, retainedFences: retainedFences)
    }
}

enum NativeResultDataProtocol {
    struct Page {
        let objects: [NativeResultDataObject]
        let next: NativeResultDataCursor?
        let expiresAt: Date
    }
    static func conflictList(_ raw: Any?) throws -> [String] {
        let all = NativeResultDataWire.conflicts
        guard let values = raw as? [String], values.count <= all.count else { throw NativeDataError.invalidResponse }
        var previous = -1
        for value in values {
            guard let index = all.firstIndex(of: value), index > previous else { throw NativeDataError.invalidResponse }
            previous = index
        }
        return values
    }
    static func root(_ graph: NativeResultDataGraph, command: NativeResultDataCommand) -> Bool {
        if command.scope == .progress { return graph.empty }
        return graph.ids["artifactIds"] == [command.rootID ?? ""] && !graph.revisions.isEmpty &&
            graph.revisions == Array(1...graph.revisions.count) && graph.ids["publicationKeys"]?.count == graph.revisions.count && graph.eventIDs.count >= graph.revisions.count
    }
    static func cardinalities(_ graph: NativeResultDataGraph, erased: [String: Int], retained: [String: Int]) -> Bool {
        erased["artifacts"] == graph.ids["artifactIds"]?.count && erased["revisions"] == graph.revisions.count &&
            erased["resultEvents"] == graph.eventIDs.count && erased["executionRuns"] == graph.ids["executionIds"]?.count &&
            erased["completionProofs"] == graph.ids["executionIds"]?.count && erased["completedReceipts"] == graph.ids["executionIds"]?.count &&
            erased["localJournals"] == graph.ids["journalIds"]?.count && (graph.ids["executionIds"]?.count ?? 0) <= 1 &&
            (graph.ids["journalIds"]?.count ?? 0) <= 1 &&
            ["callWindows", "collectorOrigins", "collectorOutputs", "resultClaims"].allSatisfy({ erased[$0] == graph.ids["executionIds"]?.count }) &&
            (retained["budgetAttempts"] ?? 0) >= (graph.ids["executionIds"]?.count ?? 0) &&
            ((graph.ids["executionIds"]?.isEmpty == true && graph.ids["journalIds"]?.isEmpty == true) || (retained["planningSources"] ?? 0) > 0) && totalRows(erased: erased, retained: retained) <= 4100 &&
            (graph.ids["artifactIds"]?.isEmpty == true || retained["conversations"] == 1 && retained["goals"] == 1 &&
                retained["messages"] == 1 && retained["tasks"] == 1 && (retained["turns"] ?? 0) > 0)
    }
    static func referencesMatch(_ refs: NativeResultDataReferences, retained: [String: Int]) -> Bool {
        let keys = ["conversations", "goals", "messages", "tasks", "turns", "threads", "trips", "memories", "sourceArtifacts", "proposals"]
        return zip(keys, NativeResultDataWire.referenceKeys).allSatisfy { retained[$0.0] == refs.ids[$0.1]?.count }
    }
    static func totalRows(erased: [String: Int], retained: [String: Int]) -> Int {
        erased.values.reduce(0, +) + retained.values.reduce(0, +)
    }
    static func list(_ bytes: Data, command: NativeResultDataCommand, actor: NativeCommunitySafetyActor, now: Date) throws -> Page {
        let w = NativeCommunityWire.self, s = NativeResultDataWire.self, v = try s.root(bytes)
        _ = try w.object(v, ["schemaVersion", "kind", "scope", "rootKind", "ownerId", "sessionId", "mobileEpoch", "sourceDigest", "capturedAt", "expiresAt", "items", "hasMore", "nextCursor", "allUserDataCompleted"])
        try s.actor(v, actor, scope: command.scope)
        let kind = try w.optional(v["rootKind"]) { try w.text($0, max: 12) }
        let capture = try s.integer(v["capturedAt"]), expiry = try s.integer(v["expiresAt"]), digest = try w.hash(v["sourceDigest"])
        guard now.timeIntervalSince1970.isFinite, command.action == "list", v["kind"] as? String == "list", kind == command.rootKind?.rawValue,
              capture <= 9_007_199_254_740_991 - 30_000, expiry == capture + 30_000,
              try s.time(capture) <= now, try s.time(expiry) > now,
              command.cursor == nil || command.cursor?.digest == digest,
              let items = v["items"] as? [[String: Any]], items.count <= 20 else { throw NativeDataError.invalidResponse }
        var last = command.cursor?.afterID ?? ""
        let objects = try items.map { item -> NativeResultDataObject in
            let value = try command.scope == .sensitive ? result(item, now: now) : operation(item, owner: actor.scope.subject, now: now)
            guard value.id > last else { throw NativeDataError.invalidResponse }
            last = value.id; return value
        }
        let more = try w.bool(v["hasMore"]), next = try w.optional(v["nextCursor"]) { try NativeResultDataCursor($0 as Any) }
        guard more ? objects.count == 20 && next?.digest == digest && next?.afterID == last : next == nil else { throw NativeDataError.invalidResponse }
        return .init(objects: objects, next: next, expiresAt: try s.time(expiry))
    }
    private static func result(_ v: [String: Any], now: Date) throws -> NativeResultDataObject {
        let w = NativeCommunityWire.self, s = NativeResultDataWire.self
        _ = try w.object(v, ["rootKind", "rootId", "createdAt", "currentRevision", "revisionCount", "eventCount", "lifecycle", "resultTypes"])
        let current = try s.integer(v["currentRevision"], maximum: 1000), count = try s.integer(v["revisionCount"], maximum: 1000)
        let events = try s.integer(v["eventCount"], maximum: 3000), created = try s.time(v["createdAt"])
        guard v["rootKind"] as? String == "artifact", current == count, events >= count, created <= now,
              let lifecycle = v["lifecycle"] as? String, ["active", "withdrawn"].contains(lifecycle),
              let types = v["resultTypes"] as? [String], !types.isEmpty, types.count <= 5, types == types.sorted(), Set(types).count == types.count,
              types.allSatisfy({ ["change-proposal-reference/1", "comparison/1", "decision/1", "journey-draft/1", "practical/1"].contains($0) }) else { throw NativeDataError.invalidResponse }
        return .init(id: try NativeResultDataCommand.id(v["rootId"]), createdAt: created, currentRevision: current,
            revisionCount: count, eventCount: events, lifecycle: lifecycle, resultTypes: types, operationFields: nil)
    }
    static func preview(_ bytes: Data, command: NativeResultDataCommand, actor: NativeCommunitySafetyActor, now: Date) throws -> NativeResultDataPreview {
        let w = NativeCommunityWire.self, s = NativeResultDataWire.self, v = try s.root(bytes)
        _ = try w.object(v, s.bindingKeys.union(["kind", "graph", "eraseCounts", "retainCounts", "retainedReferences", "conflicts", "eligible", "progressCount"]))
        guard command.action == "preview", v["kind"] as? String == "preview" else { throw NativeDataError.invalidResponse }
        let binding = try NativeResultDataBinding(v, command: command, actor: actor, now: now), graph = try NativeResultDataGraph(v["graph"])
        let erase = try s.counts(v["eraseCounts"], keys: s.erasedKeys), retain = try s.counts(v["retainCounts"], keys: s.retainedKeys)
        let refs = try NativeResultDataReferences(v["retainedReferences"]), conflicts = try conflictList(v["conflicts"])
        let eligible = try w.bool(v["eligible"]), progress = try s.integer(v["progressCount"], minimum: 0)
        guard eligible == conflicts.isEmpty, !eligible || root(graph, command: command) && cardinalities(graph, erased: erase, retained: retain) && referencesMatch(refs, retained: retain) else { throw NativeDataError.invalidResponse }
        if command.scope == .sensitive {
            guard progress == 0 else { throw NativeDataError.invalidResponse }
        } else {
            guard progress == command.objectIDs.count, graph.empty, refs.empty,
                  [erase, retain].allSatisfy({ $0.values.allSatisfy { $0 == 0 } }) else { throw NativeDataError.invalidResponse }
        }
        return .init(binding: binding, graph: graph, erased: erase, retained: retain, references: refs,
            conflicts: conflicts, eligible: eligible, progressCount: progress)
    }
    static func receipt(_ bytes: Data, command: NativeResultDataCommand, actor: NativeCommunitySafetyActor, now: Date) throws -> NativeResultDataReceipt? {
        let w = NativeCommunityWire.self, s = NativeResultDataWire.self, v = try s.root(bytes)
        guard ["erase", "recover"].contains(command.action) else { throw NativeDataError.invalidResponse }
        let digest = s.digest(command.mutationBytes ?? command.body)
        if v["kind"] as? String == "unknown" {
            _ = try w.object(v, ["schemaVersion", "kind", "scope", "requestId", "rootKind", "rootId", "objectIds", "ownerId", "sessionId", "mobileEpoch", "requestDigest", "allUserDataCompleted"])
            try s.actor(v, actor, scope: command.scope)
            let kind = try w.optional(v["rootKind"]) { try w.text($0, max: 12) }, root = try w.optional(v["rootId"], NativeResultDataCommand.id)
            guard command.action == "recover", try NativeResultDataCommand.id(v["requestId"]) == command.requestID,
                  kind == command.rootKind?.rawValue, root == command.rootID,
                  try NativeResultDataCommand.ids(v["objectIds"], maximum: 20) == command.objectIDs,
                  try w.hash(v["requestDigest"]) == digest else { throw NativeDataError.invalidResponse }
            return nil
        }
        _ = try w.object(v, s.bindingKeys.union(["kind", "state", "decision"]))
        guard v["kind"] as? String == "receipt", v["state"] as? String == "erased" else { throw NativeDataError.invalidResponse }
        let binding = try NativeResultDataBinding(v, command: command, actor: actor, now: now, decided: true)
        return try decision(v["decision"], command: command, capturedAt: binding.capturedAt,
            expiresAt: binding.expiresAt, digest: digest, now: now).receipt(binding)
    }
    private static func decision(_ raw: Any?, command: NativeResultDataCommand, capturedAt: Date, expiresAt: Date, digest: String, now: Date) throws -> NativeResultDataDecision {
        let w = NativeCommunityWire.self, s = NativeResultDataWire.self
        let v = try w.object(raw as Any, ["requestDigest", "decidedAt", "graph", "erasedCounts", "retainedCounts", "clearedPreviews", "retainedFences", "sourceResult", "sourceConversation", "sourceTrip", "explicitMemory", "externalCopies"])
        let decided = try s.time(v["decidedAt"]), graph = try NativeResultDataGraph(v["graph"])
        let erase = try s.counts(v["erasedCounts"], keys: s.erasedKeys), retain = try s.counts(v["retainedCounts"], keys: s.retainedKeys)
        let cleared = try s.integer(v["clearedPreviews"], minimum: 0), fences = try s.integer(v["retainedFences"], minimum: 0)
        guard now.timeIntervalSince1970.isFinite, try w.hash(v["requestDigest"]) == digest, decided >= capturedAt, decided < expiresAt, decided <= now,
              v["sourceConversation"] as? String == "not_modified", v["sourceTrip"] as? String == "not_modified", v["explicitMemory"] as? String == "not_modified",
              v["externalCopies"] as? String == "not_erased", root(graph, command: command) else { throw NativeDataError.invalidResponse }
        if command.scope == .sensitive {
            guard v["sourceResult"] as? String == "erased", cleared == 0, fences == graph.fenceCount,
                  cardinalities(graph, erased: erase, retained: retain) else { throw NativeDataError.invalidResponse }
        } else {
            guard v["sourceResult"] as? String == "not_modified", cleared <= command.objectIDs.count, fences == command.objectIDs.count,
                  [erase, retain].allSatisfy({ $0.values.allSatisfy { $0 == 0 } }) else { throw NativeDataError.invalidResponse }
        }
        return .init(requestDigest: digest, decidedAt: decided, graph: graph, erased: erase,
            retained: retain, clearedPreviews: cleared, retainedFences: fences)
    }
    private static func operation(_ v: [String: Any], owner: String, now: Date) throws -> NativeResultDataObject {
        let w = NativeCommunityWire.self, s = NativeResultDataWire.self
        _ = try w.object(v, ["requestId", "ownerId", "sessionId", "mobileEpoch", "scope", "rootKind", "rootId", "objectIds", "sourceDigest", "previewDigest", "sourceAuthorities", "capturedAt", "expiresAt", "requestDigest", "state", "previewErased", "graph", "eraseCounts", "retainCounts", "retainedReferences", "conflicts", "decision"])
        var input: [String: Any] = ["action": "preview"]
        for key in ["scope", "requestId", "rootKind", "rootId", "objectIds"] { input[key] = v[key] }
        let command = try NativeResultDataCommand(body: w.bytes(input)), authorities = try NativeResultDataSourceAuthority.parse(v["sourceAuthorities"])
        guard command.scope != .sensitive || !authorities.isEmpty,
              try NativeResultDataCommand.id(v["ownerId"]) == owner.lowercased(),
              let state = v["state"] as? String, ["previewed", "erased"].contains(state) else { throw NativeDataError.invalidResponse }
        _ = try NativeResultDataCommand.id(v["sessionId"]); _ = try s.integer(v["mobileEpoch"])
        _ = try w.hash(v["sourceDigest"]); _ = try w.hash(v["previewDigest"])
        let capture = try s.integer(v["capturedAt"]), expiry = try s.integer(v["expiresAt"])
        guard capture <= 9_007_199_254_740_991 - 30_000, expiry == capture + 30_000, try s.time(capture) <= now else { throw NativeDataError.invalidResponse }
        let cleared = try w.bool(v["previewErased"])
        if cleared {
            guard ["graph", "eraseCounts", "retainCounts", "retainedReferences", "conflicts"].allSatisfy({ v[$0] is NSNull }) else { throw NativeDataError.invalidResponse }
        } else {
            let graph = try NativeResultDataGraph(v["graph"]), erase = try s.counts(v["eraseCounts"], keys: s.erasedKeys), retain = try s.counts(v["retainCounts"], keys: s.retainedKeys)
            let refs = try NativeResultDataReferences(v["retainedReferences"])
            if try conflictList(v["conflicts"]).isEmpty {
                guard root(graph, command: command), cardinalities(graph, erased: erase, retained: retain), referencesMatch(refs, retained: retain) else { throw NativeDataError.invalidResponse }
            }
            if command.scope == .progress {
                guard graph.empty, refs.empty, [erase, retain].allSatisfy({ $0.values.allSatisfy { $0 == 0 } }) else { throw NativeDataError.invalidResponse }
            }
        }
        if state == "previewed" {
            guard v["requestDigest"] is NSNull, v["decision"] is NSNull else { throw NativeDataError.invalidResponse }
        } else {
            guard cleared else { throw NativeDataError.invalidResponse }
            _ = try decision(v["decision"], command: command, capturedAt: s.time(capture), expiresAt: s.time(expiry), digest: w.hash(v["requestDigest"]), now: now)
        }
        let data = try JSONSerialization.data(withJSONObject: v, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
        guard let fields = String(data: data, encoding: .utf8) else { throw NativeDataError.invalidResponse }
        return .init(id: command.requestID ?? "", createdAt: try s.time(capture), currentRevision: nil,
            revisionCount: nil, eventCount: nil, lifecycle: nil, resultTypes: [], operationFields: fields)
    }
}

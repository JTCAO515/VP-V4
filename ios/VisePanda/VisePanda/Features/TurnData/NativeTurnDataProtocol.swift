import Foundation

struct NativeTurnDataObject: Identifiable, Equatable {
    let id: String
    let createdAt: Date
    let threadID: String?
    let taskID: String?
    let erasedSource: Bool?
    let operationFields: String?
}
struct NativeTurnDataPreview {
    let binding: NativeTurnDataBinding
    let graph: NativeTurnDataGraph
    let erased: [String: Int]
    let redacted: [String: Int]
    let retained: [String: Int]
    let references: NativeTurnDataReferences
    let conflicts: [String]
    let eligible: Bool
    let progressCount: Int
}
struct NativeTurnDataReceipt {
    let binding: NativeTurnDataBinding
    let requestDigest: String
    let decidedAt: Date
    let graph: NativeTurnDataGraph
    let erased: [String: Int]
    let redacted: [String: Int]
    let retained: [String: Int]
    let clearedPreviews: Int
    let retainedFences: Int
}
private struct NativeTurnDataDecision {
    let requestDigest: String
    let decidedAt: Date
    let graph: NativeTurnDataGraph
    let erased: [String: Int]
    let redacted: [String: Int]
    let retained: [String: Int]
    let clearedPreviews: Int
    let retainedFences: Int
    func receipt(_ binding: NativeTurnDataBinding) -> NativeTurnDataReceipt {
        .init(binding: binding, requestDigest: requestDigest, decidedAt: decidedAt, graph: graph,
            erased: erased, redacted: redacted, retained: retained, clearedPreviews: clearedPreviews, retainedFences: retainedFences)
    }
}

enum NativeTurnDataProtocol {
    struct Page {
        let objects: [NativeTurnDataObject]
        let next: NativeTurnDataCursor?
        let expiresAt: Date
    }
    static func conflictList(_ raw: Any?) throws -> [String] {
        let all = NativeTurnDataWire.conflicts
        guard let values = raw as? [String], values.count <= all.count else { throw NativeDataError.invalidResponse }
        var previous = -1
        for value in values {
            guard let index = all.firstIndex(of: value), index > previous else { throw NativeDataError.invalidResponse }
            previous = index
        }
        return values
    }
    static func root(_ graph: NativeTurnDataGraph, command: NativeTurnDataCommand) -> Bool {
        command.scope == .progress ? graph.empty : graph.ids["turnIds"] == [command.turnID ?? ""]
    }
    static func effects(_ graph: NativeTurnDataGraph, command: NativeTurnDataCommand, erased: [String: Int], redacted: [String: Int], retained: [String: Int]) -> Bool {
        if command.scope == .progress {
            return graph.empty && [erased, redacted, retained].allSatisfy { $0.values.allSatisfy { $0 == 0 } }
        }
        return root(graph, command: command) && retained["turns"] == graph.ids["turnIds"]?.count &&
            retained["messages"] == graph.ids["messageIds"]?.count && redacted["messageBodies"] == graph.ids["messageIds"]?.count &&
            erased["artifacts"] == graph.ids["artifactIds"]?.count && redacted["textBodies"] == 1 &&
            (redacted["taskDigests"] ?? 0) <= (retained["tasks"] ?? 0) &&
            erased.values.reduce(0, +) + retained.values.reduce(0, +) + (redacted["textBodies"] ?? 0) <= 4100
    }
    static func referencesMatch(_ refs: NativeTurnDataReferences, retained: [String: Int]) -> Bool {
        zip(["tasks", "threads", "conversations", "goals"], ["taskIds", "threadIds", "conversationIds", "goalIds"])
            .allSatisfy { retained[$0.0] == refs.ids[$0.1]?.count }
    }
    static func list(_ bytes: Data, command: NativeTurnDataCommand, actor: NativeCommunitySafetyActor, now: Date) throws -> Page {
        let w = NativeCommunityWire.self, s = NativeTurnDataWire.self, v = try s.root(bytes)
        _ = try w.object(v, ["schemaVersion", "kind", "scope", "ownerId", "sessionId", "mobileEpoch", "sourceDigest", "capturedAt", "expiresAt", "items", "hasMore", "nextCursor", "allUserDataCompleted"])
        try s.actor(v, actor, scope: command.scope)
        let capture = try s.integer(v["capturedAt"]), expiry = try s.integer(v["expiresAt"]), digest = try w.hash(v["sourceDigest"])
        guard now.timeIntervalSince1970.isFinite, command.action == "list", v["kind"] as? String == "list",
              capture <= 9_007_199_254_740_991 - 30_000, expiry == capture + 30_000,
              try s.time(capture) <= now, try s.time(expiry) > now,
              command.cursor == nil || command.cursor?.digest == digest,
              let items = v["items"] as? [[String: Any]], items.count <= 20 else { throw NativeDataError.invalidResponse }
        var last = command.cursor?.afterID ?? ""
        let objects = try items.map { item -> NativeTurnDataObject in
            let value = try command.scope == .sensitive ? turn(item, now: now) : operation(item, owner: actor.scope.subject, now: now)
            guard value.id > last else { throw NativeDataError.invalidResponse }
            last = value.id; return value
        }
        let more = try w.bool(v["hasMore"]), next = try w.optional(v["nextCursor"]) { try NativeTurnDataCursor($0 as Any) }
        guard more ? objects.count == 20 && next?.digest == digest && next?.afterID == last : next == nil else { throw NativeDataError.invalidResponse }
        return .init(objects: objects, next: next, expiresAt: try s.time(expiry))
    }
    private static func turn(_ v: [String: Any], now: Date) throws -> NativeTurnDataObject {
        let w = NativeCommunityWire.self, s = NativeTurnDataWire.self
        _ = try w.object(v, ["turnId", "threadId", "taskId", "createdAt", "status", "erased"])
        let created = try s.time(v["createdAt"])
        guard created <= now, v["status"] as? String == "completed" else { throw NativeDataError.invalidResponse }
        return try .init(id: NativeTurnDataCommand.id(v["turnId"]), createdAt: created,
            threadID: NativeTurnDataCommand.id(v["threadId"]), taskID: w.optional(v["taskId"], NativeTurnDataCommand.id),
            erasedSource: w.bool(v["erased"]), operationFields: nil)
    }
    static func preview(_ bytes: Data, command: NativeTurnDataCommand, actor: NativeCommunitySafetyActor, now: Date) throws -> NativeTurnDataPreview {
        let w = NativeCommunityWire.self, s = NativeTurnDataWire.self, v = try s.root(bytes)
        _ = try w.object(v, s.bindingKeys.union(["kind", "graph", "eraseCounts", "redactCounts", "retainCounts", "retainedReferences", "conflicts", "eligible", "progressCount"]))
        guard command.action == "preview", v["kind"] as? String == "preview" else { throw NativeDataError.invalidResponse }
        let binding = try NativeTurnDataBinding(v, command: command, actor: actor, now: now), graph = try NativeTurnDataGraph(v["graph"])
        let erase = try s.counts(v["eraseCounts"], keys: s.erasedKeys), redact = try s.counts(v["redactCounts"], keys: s.redactedKeys), retain = try s.counts(v["retainCounts"], keys: s.retainedKeys)
        let refs = try NativeTurnDataReferences(v["retainedReferences"]), conflicts = try conflictList(v["conflicts"])
        let eligible = try w.bool(v["eligible"]), progress = try s.integer(v["progressCount"], minimum: 0)
        guard eligible == conflicts.isEmpty, !eligible || effects(graph, command: command, erased: erase, redacted: redact, retained: retain) && referencesMatch(refs, retained: retain) else { throw NativeDataError.invalidResponse }
        if command.scope == .sensitive {
            guard progress == 0 else { throw NativeDataError.invalidResponse }
        } else {
            guard progress == command.objectIDs.count, graph.empty, refs.empty,
                  [erase, redact, retain].allSatisfy({ $0.values.allSatisfy { $0 == 0 } }) else { throw NativeDataError.invalidResponse }
        }
        return .init(binding: binding, graph: graph, erased: erase, redacted: redact, retained: retain, references: refs,
            conflicts: conflicts, eligible: eligible, progressCount: progress)
    }
    static func receipt(_ bytes: Data, command: NativeTurnDataCommand, actor: NativeCommunitySafetyActor, now: Date) throws -> NativeTurnDataReceipt? {
        let w = NativeCommunityWire.self, s = NativeTurnDataWire.self, v = try s.root(bytes)
        guard ["erase", "recover"].contains(command.action) else { throw NativeDataError.invalidResponse }
        let digest = s.digest(command.mutationBytes ?? command.body)
        if v["kind"] as? String == "unknown" {
            _ = try w.object(v, ["schemaVersion", "kind", "scope", "requestId", "turnId", "objectIds", "ownerId", "sessionId", "mobileEpoch", "requestDigest", "allUserDataCompleted"])
            try s.actor(v, actor, scope: command.scope)
            let root = try w.optional(v["turnId"], NativeTurnDataCommand.id)
            guard command.action == "recover", try NativeTurnDataCommand.id(v["requestId"]) == command.requestID,
                  root == command.turnID,
                  try NativeTurnDataCommand.ids(v["objectIds"], maximum: 20) == command.objectIDs,
                  try w.hash(v["requestDigest"]) == digest else { throw NativeDataError.invalidResponse }
            return nil
        }
        _ = try w.object(v, s.bindingKeys.union(["kind", "state", "decision"]))
        guard v["kind"] as? String == "receipt", v["state"] as? String == "erased" else { throw NativeDataError.invalidResponse }
        let binding = try NativeTurnDataBinding(v, command: command, actor: actor, now: now, decided: true)
        return try decision(v["decision"], command: command, capturedAt: binding.capturedAt,
            expiresAt: binding.expiresAt, digest: digest, now: now).receipt(binding)
    }
    private static func decision(_ raw: Any?, command: NativeTurnDataCommand, capturedAt: Date, expiresAt: Date, digest: String, now: Date) throws -> NativeTurnDataDecision {
        let w = NativeCommunityWire.self, s = NativeTurnDataWire.self
        let v = try w.object(raw as Any, ["requestDigest", "decidedAt", "graph", "erasedCounts", "redactedCounts", "retainedCounts", "clearedPreviews", "retainedFences", "sourceTurn", "parentData", "sourceTrip", "explicitMemory", "financialData", "externalCopies"])
        let decided = try s.time(v["decidedAt"]), graph = try NativeTurnDataGraph(v["graph"])
        let erase = try s.counts(v["erasedCounts"], keys: s.erasedKeys), redact = try s.counts(v["redactedCounts"], keys: s.redactedKeys), retain = try s.counts(v["retainedCounts"], keys: s.retainedKeys)
        let cleared = try s.integer(v["clearedPreviews"], minimum: 0), fences = try s.integer(v["retainedFences"], minimum: 0)
        guard now.timeIntervalSince1970.isFinite, try w.hash(v["requestDigest"]) == digest, decided >= capturedAt, decided < expiresAt, decided <= now,
              v["parentData"] as? String == ((redact["taskDigests"] ?? 0) > 0 ? "selected_digest_redacted" : "not_modified"), v["sourceTrip"] as? String == "not_modified", v["explicitMemory"] as? String == "not_modified", v["financialData"] as? String == "not_modified",
              v["externalCopies"] as? String == "not_erased", root(graph, command: command) else { throw NativeDataError.invalidResponse }
        if command.scope == .sensitive {
            guard v["sourceTurn"] as? String == "erased", cleared == 0, fences == graph.fenceCount,
                  effects(graph, command: command, erased: erase, redacted: redact, retained: retain) else { throw NativeDataError.invalidResponse }
        } else {
            guard v["sourceTurn"] as? String == "not_modified", cleared <= command.objectIDs.count, fences == command.objectIDs.count,
                  [erase, redact, retain].allSatisfy({ $0.values.allSatisfy { $0 == 0 } }) else { throw NativeDataError.invalidResponse }
        }
        return .init(requestDigest: digest, decidedAt: decided, graph: graph, erased: erase, redacted: redact,
            retained: retain, clearedPreviews: cleared, retainedFences: fences)
    }
    private static func operation(_ v: [String: Any], owner: String, now: Date) throws -> NativeTurnDataObject {
        let w = NativeCommunityWire.self, s = NativeTurnDataWire.self
        _ = try w.object(v, ["requestId", "ownerId", "sessionId", "mobileEpoch", "scope", "turnId", "objectIds", "sourceDigest", "previewDigest", "sourceAuthorities", "capturedAt", "expiresAt", "requestDigest", "state", "previewErased", "graph", "eraseCounts", "redactCounts", "retainCounts", "retainedReferences", "conflicts", "decision"])
        var input: [String: Any] = ["action": "preview"]
        for key in ["scope", "requestId", "turnId", "objectIds"] { input[key] = v[key] }
        let command = try NativeTurnDataCommand(body: w.bytes(input)), authorities = try NativeTurnDataSourceAuthority.parse(v["sourceAuthorities"])
        guard command.scope != .sensitive || !authorities.isEmpty,
              try NativeTurnDataCommand.id(v["ownerId"]) == owner.lowercased(),
              let state = v["state"] as? String, ["previewed", "erased"].contains(state) else { throw NativeDataError.invalidResponse }
        _ = try NativeTurnDataCommand.id(v["sessionId"]); _ = try s.integer(v["mobileEpoch"])
        _ = try w.hash(v["sourceDigest"]); _ = try w.hash(v["previewDigest"])
        let capture = try s.integer(v["capturedAt"]), expiry = try s.integer(v["expiresAt"])
        guard capture <= 9_007_199_254_740_991 - 30_000, expiry == capture + 30_000, try s.time(capture) <= now else { throw NativeDataError.invalidResponse }
        let cleared = try w.bool(v["previewErased"])
        if cleared {
            guard ["graph", "eraseCounts", "redactCounts", "retainCounts", "retainedReferences", "conflicts"].allSatisfy({ v[$0] is NSNull }) else { throw NativeDataError.invalidResponse }
        } else {
            let graph = try NativeTurnDataGraph(v["graph"]), erase = try s.counts(v["eraseCounts"], keys: s.erasedKeys), redact = try s.counts(v["redactCounts"], keys: s.redactedKeys), retain = try s.counts(v["retainCounts"], keys: s.retainedKeys)
            _ = try NativeTurnDataReferences(v["retainedReferences"])
            if try conflictList(v["conflicts"]).isEmpty {
                guard root(graph, command: command), effects(graph, command: command, erased: erase, redacted: redact, retained: retain) else { throw NativeDataError.invalidResponse }
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
        return .init(id: command.requestID ?? "", createdAt: try s.time(capture), threadID: nil, taskID: nil, erasedSource: nil, operationFields: fields)
    }
}

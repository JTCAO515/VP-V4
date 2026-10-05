import Foundation

struct NativeCommunitySafetyActor: Equatable {
    let scope: NativeDataScope
    let sessionID: String
}

enum NativeCommunitySafetyWire {
    static let schema = "community-safety-j2/1"
    static let retained = ["operation_fences", "record_tombstones", "audit_metadata"]
    static let actions = ["report", "disposition", "appeal", "appealReview", "block", "unblock", "delete"]
    static let collections = ["reports", "dispositions", "appeals", "blocks"]
    static let affiliations = ["registered_user", "community_reviewer", "official", "employee", "unknown"]
    static func collectionKind(_ value: String) -> String? {
        ["reports": "report", "dispositions": "disposition", "appeals": "appeal", "blocks": "block"][value]
    }
    static func revision(_ raw: Any?, minimum: Int = 0) throws -> Int {
        try NativeCommunityWire.integer(raw, max: 2_147_483_647, minimum: minimum)
    }
    static func dateValue(_ raw: Any?) throws -> Date {
        let text = try NativeCommunityWire.date(raw)
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let result = formatter.date(from: text) { return result }
        formatter.formatOptions = [.withInternetDateTime]
        guard let result = formatter.date(from: text) else { throw NativeDataError.invalidResponse }
        return result
    }
}

struct NativeCommunitySafetyObject: Identifiable, Equatable {
    let id: String
    let submissionVersion: Int
    let safetyVersion: Int
    let title: String
    let content: String
    let contentKind: String
    let benefit: String?
    let authorDisclosure: String
    let reviewerDisclosure: String?
    let source: String
    let canReport: Bool
    let canBlock: Bool
    let expiresAt: Date
    init(_ raw: Any) throws {
        let w = NativeCommunityWire.self, s = NativeCommunitySafetyWire.self
        let v = try w.object(raw, ["id", "submissionVersion", "safetyVersion", "title", "content", "contentKind", "benefitDisclosure", "authorDisclosure", "reviewerDisclosure", "source", "copyright", "visibility", "publiclyVisible", "retrievalEligible", "canReport", "canBlock", "expiresAt"])
        id = try w.id(v["id"]); submissionVersion = try s.revision(v["submissionVersion"], minimum: 1); safetyVersion = try s.revision(v["safetyVersion"])
        title = try w.text(v["title"], max: 160); content = try w.text(v["content"], max: 4000); contentKind = try w.text(v["contentKind"], max: 10)
        benefit = try w.optional(v["benefitDisclosure"]) { try w.text($0, max: 400, empty: true) }
        authorDisclosure = try w.text(v["authorDisclosure"], max: 24)
        reviewerDisclosure = try w.optional(v["reviewerDisclosure"]) { try w.text($0, max: 24) }
        source = try w.text(v["source"], max: 20)
        canReport = try w.bool(v["canReport"]); canBlock = try w.bool(v["canBlock"]); expiresAt = try s.dateValue(v["expiresAt"])
        guard ["experience": "user_experience", "help": "user_help", "unknown": "unknown"][contentKind] == source,
              s.affiliations.contains(authorDisclosure), reviewerDisclosure == nil || s.affiliations.contains(reviewerDisclosure!),
              v["copyright"] as? String == "unknown", v["visibility"] as? String == "internal",
              try w.bool(v["publiclyVisible"]) == false, try w.bool(v["retrievalEligible"]) == false else { throw NativeDataError.invalidResponse }
    }
}

/// Closed safe projection. Fields irrelevant to this record kind remain nil.
struct NativeCommunitySafetyRecord: Identifiable, Equatable {
    let kind: String
    let id: String
    let submissionID: String?
    let state: String
    let version: Int?
    let submissionVersion: Int?
    let safetyVersion: Int?
    let category: String?
    let basis: String?
    let explanation: String?
    let note: String?
    let createdAt: String?
    let endedAt: String?
    let j1Status: String?
    let appealable: Bool
    var canUnblock: Bool { kind == "block" && state == "blocked" && version == 1 }
    var appealBasis: String? {
        guard kind == "disposition", appealable else { return nil }
        if state == "removed" { return "safety_removal" }
        return j1Status == "rejected" ? "j1_rejection" : nil
    }
    init(_ raw: Any) throws {
        let w = NativeCommunityWire.self, s = NativeCommunitySafetyWire.self
        guard let v = raw as? [String: Any] else { throw NativeDataError.invalidResponse }
        kind = try w.text(v["kind"], max: 12); id = try w.id(v["id"])
        state = try w.text(v["state"], max: 12)
        if kind == "disposition" {
            _ = try w.object(v, ["kind", "id", "submissionId", "submissionVersion", "safetyVersion", "state", "j1Status", "note", "appealable"])
            submissionID = try w.id(v["submissionId"]); submissionVersion = try s.revision(v["submissionVersion"], minimum: 1); safetyVersion = try s.revision(v["safetyVersion"])
            j1Status = try w.text(v["j1Status"], max: 12); note = try w.optional(v["note"]) { try w.text($0, max: 400) }
            appealable = try w.bool(v["appealable"])
            version = nil; category = nil; basis = nil; explanation = nil; createdAt = nil; endedAt = nil
            guard submissionID == id, ["clear", "removed", "unavailable"].contains(state), ["pending", "published", "rejected", "withdrawn", "deleted"].contains(j1Status!),
                  !["withdrawn", "deleted"].contains(j1Status!) || (state == "unavailable" && !appealable) else { throw NativeDataError.invalidResponse }
            return
        }
        version = try s.revision(v["version"], minimum: 1); createdAt = try w.date(v["createdAt"])
        submissionVersion = nil; safetyVersion = nil; j1Status = nil; appealable = false
        if kind == "block" {
            _ = try w.object(v, ["kind", "id", "submissionId", "state", "version", "createdAt", "endedAt"])
            submissionID = try w.optional(v["submissionId"], w.id); endedAt = try w.optional(v["endedAt"], w.date)
            category = nil; basis = nil; explanation = nil; note = nil
            guard ["blocked", "unblocked", "erased"].contains(state), state == "blocked" ? (version == 1 && endedAt == nil) : (version! >= 2 && endedAt != nil), state != "erased" || submissionID == nil else { throw NativeDataError.invalidResponse }
            return
        }
        guard ["report", "appeal"].contains(kind) else { throw NativeDataError.invalidResponse }
        let discriminator = kind == "report" ? "category" : "basis", body = kind == "report" ? "details" : "statement"
        _ = try w.object(v, ["kind", "id", "submissionId", discriminator, body, "state", "version", "createdAt", "resolvedAt", "note"])
        submissionID = try w.id(v["submissionId"]); endedAt = try w.optional(v["resolvedAt"], w.date)
        note = try w.optional(v["note"]) { try w.text($0, max: 400) }; explanation = try w.optional(v[body]) { try w.text($0, max: 1000) }
        let value = try w.text(v[discriminator], max: 20)
        category = kind == "report" ? value : nil; basis = kind == "appeal" ? value : nil
        guard (kind == "report" ? ["abuse", "rights", "misleading", "other"] : ["j1_rejection", "safety_removal"]).contains(value),
              (kind == "report" ? ["pending", "dismissed", "removed", "erased"] : ["pending", "upheld", "restored", "erased"]).contains(state),
              state == "erased" ? (explanation == nil && note == nil) : explanation != nil,
              state == "pending" ? (version == 1 && endedAt == nil && note == nil) : (version! >= 2 && endedAt != nil) else { throw NativeDataError.invalidResponse }
    }
}

struct NativeCommunitySafetyCommand: Equatable {
    let body: Data
    let action: String
    let operationID: String
    let recordID: String?
    let submissionID: String?
    let submissionVersion: Int?
    let safetyVersion: Int?
    init(body: Data) throws {
        let w = NativeCommunityWire.self, s = NativeCommunitySafetyWire.self
        guard body.count <= 24000, let text = String(data: body, encoding: .utf8), text.utf16.count <= 10000,
              let v = try JSONSerialization.jsonObject(with: body) as? [String: Any] else { throw NativeDataError.invalidResponse }
        action = try w.text(v["action"], max: 12); operationID = try w.id(v["operationId"]); self.body = body
        switch action {
        case "delete":
            _ = try w.object(v, ["action", "operationId", "confirmed"])
            guard try w.bool(v["confirmed"]) else { throw NativeDataError.invalidResponse }
            recordID = nil; submissionID = nil; submissionVersion = nil; safetyVersion = nil
        case "unblock":
            _ = try w.object(v, ["action", "operationId", "blockId", "expectedVersion"])
            guard try s.revision(v["expectedVersion"], minimum: 1) == 1 else { throw NativeDataError.invalidResponse }
            recordID = try w.id(v["blockId"]); submissionID = nil; submissionVersion = nil; safetyVersion = nil
        case "report", "appeal", "block":
            let idKey = action == "report" ? "reportId" : action == "appeal" ? "appealId" : "blockId"
            var keys: Set<String> = ["action", "operationId", idKey, "submissionId", "expectedSubmissionVersion", "expectedSafetyVersion"]
            if action == "report" { keys.formUnion(["category", "details", "consent"]) }
            if action == "appeal" { keys.formUnion(["basis", "statement", "consent"]) }
            _ = try w.object(v, keys)
            recordID = try w.id(v[idKey]); submissionID = try w.id(v["submissionId"])
            submissionVersion = try s.revision(v["expectedSubmissionVersion"], minimum: 1); safetyVersion = try s.revision(v["expectedSafetyVersion"])
            if action != "block" {
                let choice = try w.text(v[action == "report" ? "category" : "basis"], max: 20)
                guard (action == "report" ? ["abuse", "rights", "misleading", "other"] : ["j1_rejection", "safety_removal"]).contains(choice), v["consent"] as? String == "internal-safety-v1" else { throw NativeDataError.invalidResponse }
                _ = try w.text(v[action == "report" ? "details" : "statement"], max: 1000)
            }
        default: throw NativeDataError.invalidResponse // Operator mutations belong solely to TSOps.
        }
    }
    static func object(_ object: NativeCommunitySafetyObject, action: String, category: String? = nil, explanation: String? = nil) throws -> Self {
        guard action == "report" ? object.canReport : action == "block" && object.canBlock else { throw NativeDataError.invalidResponse }
        var input: [String: Any] = ["action": action, "operationId": UUID().uuidString.lowercased(), action == "report" ? "reportId" : "blockId": UUID().uuidString.lowercased(), "submissionId": object.id, "expectedSubmissionVersion": object.submissionVersion, "expectedSafetyVersion": object.safetyVersion]
        if action == "report" { input["category"] = category; input["details"] = explanation; input["consent"] = "internal-safety-v1" }
        return try .init(body: NativeCommunityWire.bytes(input))
    }
    static func appeal(_ record: NativeCommunitySafetyRecord, explanation: String) throws -> Self {
        guard let basis = record.appealBasis, let submission = record.submissionID, let version = record.submissionVersion, let safety = record.safetyVersion else { throw NativeDataError.invalidResponse }
        return try .init(body: NativeCommunityWire.bytes(["action": "appeal", "operationId": UUID().uuidString.lowercased(), "appealId": UUID().uuidString.lowercased(), "submissionId": submission, "expectedSubmissionVersion": version, "expectedSafetyVersion": safety, "basis": basis, "statement": explanation, "consent": "internal-safety-v1"]))
    }
    static func unblock(_ record: NativeCommunitySafetyRecord) throws -> Self {
        guard record.canUnblock else { throw NativeDataError.invalidResponse }
        return try .init(body: NativeCommunityWire.bytes(["action": "unblock", "operationId": UUID().uuidString.lowercased(), "blockId": record.id, "expectedVersion": 1]))
    }
    static func delete() throws -> Self { try .init(body: NativeCommunityWire.bytes(["action": "delete", "operationId": UUID().uuidString.lowercased(), "confirmed": true])) }
    func recovery(abandon: Bool = false) throws -> Data {
        guard let text = String(data: body, encoding: .utf8) else { throw NativeDataError.invalidResponse }
        let bytes = try NativeCommunityWire.bytes(["action": abandon ? "abandon" : "operation", "operationId": operationID, "mutationBytes": text])
        guard bytes.count <= 49152 else { throw NativeDataError.invalidResponse }; return bytes
    }
}

enum NativeCommunitySafetyOutcome {
    case objects([NativeCommunitySafetyObject], cursor: String?, complete: Bool)
    case object(NativeCommunitySafetyObject)
    case page(String, records: [NativeCommunitySafetyRecord], cursor: String?, complete: Bool)
    case record(NativeCommunitySafetyRecord)
    case operation(String, state: String, record: NativeCommunitySafetyRecord?)
    case deleted(String)
    case export(Data)
    static func decode(_ bytes: Data, actor: NativeCommunitySafetyActor) throws -> Self {
        let w = NativeCommunityWire.self, s = NativeCommunitySafetyWire.self
        guard bytes.count <= 1_000_000 else { throw NativeDataError.invalidResponse }
        let outer = try w.object(JSONSerialization.jsonObject(with: bytes), ["data"])
        guard let v = outer["data"] as? [String: Any], v["schemaVersion"] as? String == s.schema,
              try w.id(v["actorId"]) == actor.scope.subject.lowercased(), try w.id(v["sessionId"]) == actor.sessionID else { throw NativeDataError.invalidResponse }
        let base: Set<String> = ["schemaVersion", "kind", "actorId", "sessionId"]
        switch v["kind"] as? String {
        case "objects":
            _ = try w.object(v, base.union(["objects", "nextCursor", "complete"]))
            let rows = try w.rows(v["objects"], max: 50, NativeCommunitySafetyObject.init)
            let cursor = try w.optional(v["nextCursor"], w.id), complete = try w.bool(v["complete"])
            try page(rows.map(\.id), cursor: cursor, complete: complete)
            return .objects(rows, cursor: cursor, complete: complete)
        case "object":
            _ = try w.object(v, base.union(["object"])); return try .object(NativeCommunitySafetyObject(v["object"] as Any))
        case "page":
            _ = try w.object(v, base.union(["collection", "records", "nextCursor", "complete"]))
            let collection = try w.text(v["collection"], max: 12)
            guard let kind = s.collectionKind(collection) else { throw NativeDataError.invalidResponse }
            let rows = try w.rows(v["records"], max: 50, NativeCommunitySafetyRecord.init)
            guard rows.allSatisfy({ $0.kind == kind }) else { throw NativeDataError.invalidResponse }
            let cursor = try w.optional(v["nextCursor"], w.id), complete = try w.bool(v["complete"])
            try page(rows.map(\.id), cursor: cursor, complete: complete)
            return .page(collection, records: rows, cursor: cursor, complete: complete)
        case "record":
            _ = try w.object(v, base.union(["record"])); return try .record(NativeCommunitySafetyRecord(v["record"] as Any))
        case "operation":
            _ = try w.object(v, base.union(["operationId", "state", "record"]))
            let id = try w.id(v["operationId"]), state = try w.text(v["state"], max: 10)
            let record = try w.optional(v["record"]) { try NativeCommunitySafetyRecord($0 as Any) }
            guard ["absent", "committed", "abandoned"].contains(state), state == "committed" || record == nil else { throw NativeDataError.invalidResponse }
            return .operation(id, state: state, record: record)
        case "deleted":
            _ = try w.object(v, base.union(["operationId", "scope", "retained"]))
            guard v["scope"] as? String == "community_safety_module", v["retained"] as? [String] == s.retained else { throw NativeDataError.invalidResponse }
            return try .deleted(w.id(v["operationId"]))
        case "export":
            _ = try w.object(v, base.union(["scope", "coverage", "reports", "dispositions", "appeals", "blocks", "authoredDecisions", "receipts", "audits", "qualification", "readerGrants", "retained"]))
            guard v["scope"] as? String == "community_safety_module", v["coverage"] as? String == "complete_for_community_safety", v["retained"] as? [String] == s.retained else { throw NativeDataError.invalidResponse }
            for collection in s.collections {
                let rows = try w.rows(v[collection], max: 100, NativeCommunitySafetyRecord.init)
                guard rows.allSatisfy({ $0.kind == s.collectionKind(collection) }) else { throw NativeDataError.invalidResponse }
            }
            _ = try w.rows(v["authoredDecisions"], max: 100) { raw in
                let r = try w.object(raw, ["recordId", "kind", "decision", "note", "createdAt"])
                _ = try w.id(r["recordId"]); _ = try w.date(r["createdAt"])
                _ = try w.optional(r["note"]) { try w.text($0, max: 400) }
                guard r["kind"] as? String == "report" ? ["dismiss", "remove"].contains(r["decision"] as? String ?? "") : (r["kind"] as? String == "appeal" && ["uphold", "restore"].contains(r["decision"] as? String ?? "")) else { throw NativeDataError.invalidResponse }
            }
            _ = try w.rows(v["receipts"], max: 100) { raw in
                let r = try w.object(raw, ["operationId", "recordId", "action", "state", "digest"])
                _ = try w.id(r["operationId"]); _ = try w.optional(r["recordId"], w.id); _ = try w.hash(r["digest"])
                guard s.actions.contains(r["action"] as? String ?? ""), ["committed", "abandoned"].contains(r["state"] as? String ?? "") else { throw NativeDataError.invalidResponse }
            }
            _ = try w.rows(v["audits"], max: 100) { raw in
                let r = try w.object(raw, ["recordId", "action", "createdAt"])
                _ = try w.optional(r["recordId"], w.id); _ = try w.date(r["createdAt"])
                guard s.actions.contains(r["action"] as? String ?? "") else { throw NativeDataError.invalidResponse }
            }
            _ = try w.rows(v["readerGrants"], max: 100) { raw in
                let r = try w.object(raw, ["submissionId", "submissionVersion", "expiresAt", "revoked"])
                _ = try w.id(r["submissionId"]); _ = try s.revision(r["submissionVersion"], minimum: 1)
                _ = try w.date(r["expiresAt"]); _ = try w.bool(r["revoked"])
            }
            _ = try w.optional(v["qualification"]) { raw in
                let r = try w.object(raw as Any, ["active"]); return try w.bool(r["active"])
            }
            return .export(bytes)
        default: throw NativeDataError.invalidResponse
        }
    }
    private static func page(_ ids: [String], cursor: String?, complete: Bool) throws {
        guard complete == (cursor == nil), cursor == nil || ids.last == cursor, Set(ids).count == ids.count else { throw NativeDataError.invalidResponse }
    }
    func terminal(for command: NativeCommunitySafetyCommand, recovery: Bool) throws -> Bool {
        switch self {
        case .deleted(let id):
            guard command.action == "delete", command.operationID == id, !recovery else { throw NativeDataError.invalidResponse }; return true
        case .operation(let id, let state, let record):
            guard command.operationID == id else { throw NativeDataError.invalidResponse }
            if state == "committed" {
                if command.action == "delete" { guard record == nil else { throw NativeDataError.invalidResponse } }
                else {
                    let kind = ["report": "report", "appeal": "appeal", "block": "block", "unblock": "block"][command.action]
                    guard record?.kind == kind, record?.id == command.recordID,
                          command.submissionID == nil || record?.submissionID == command.submissionID || (record?.kind == "block" && record?.submissionID == nil) else { throw NativeDataError.invalidResponse }
                }
                return true
            }
            guard recovery else { throw NativeDataError.invalidResponse }
            return state == "abandoned"
        default: throw NativeDataError.invalidResponse
        }
    }
}

struct NativeCommunitySafetyInput {
    private let body: Data
    let mutation: NativeCommunitySafetyCommand?
    let recovery: NativeCommunitySafetyCommand?
    let action: String
    init(body: Data) throws {
        self.body = body
        let w = NativeCommunityWire.self
        guard body.count <= 49152, let text = String(data: body, encoding: .utf8),
              let v = try JSONSerialization.jsonObject(with: body) as? [String: Any] else { throw NativeDataError.invalidResponse }
        action = try w.text(v["action"], max: 12)
        guard ["operation", "abandon"].contains(action) || (body.count <= 24000 && text.utf16.count <= 10000) else { throw NativeDataError.invalidResponse }
        mutation = ["report", "appeal", "block", "unblock", "delete"].contains(action) ? try NativeCommunitySafetyCommand(body: body) : nil
        if mutation != nil { recovery = nil; return }
        switch action {
        case "objects": _ = try w.object(v, ["action", "cursor"]); _ = try w.optional(v["cursor"], w.id); recovery = nil
        case "object": _ = try w.object(v, ["action", "submissionId"]); _ = try w.id(v["submissionId"]); recovery = nil
        case "mine":
            _ = try w.object(v, ["action", "collection", "cursor"]); _ = try w.optional(v["cursor"], w.id)
            guard NativeCommunitySafetyWire.collections.contains(v["collection"] as? String ?? "") else { throw NativeDataError.invalidResponse }; recovery = nil
        case "read":
            _ = try w.object(v, ["action", "collection", "id"]); _ = try w.id(v["id"])
            guard NativeCommunitySafetyWire.collections.contains(v["collection"] as? String ?? "") else { throw NativeDataError.invalidResponse }; recovery = nil
        case "export": _ = try w.object(v, ["action"]); recovery = nil
        case "operation", "abandon":
            _ = try w.object(v, ["action", "operationId", "mutationBytes"])
            let bytes = try w.text(v["mutationBytes"], max: 10000)
            recovery = try NativeCommunitySafetyCommand(body: Data(bytes.utf8))
            guard try w.id(v["operationId"]) == recovery?.operationID else { throw NativeDataError.invalidResponse }
        default: throw NativeDataError.invalidResponse
        }
    }
}


extension NativeCommunitySafetyInput {
    func matches(_ outcome: NativeCommunitySafetyOutcome) throws -> Bool {
        if let command = mutation { return try outcome.terminal(for: command, recovery: false) }
        if let command = recovery {
            _ = try outcome.terminal(for: command, recovery: true)
            return true // Exact absent receipt is valid, but does not authorize a new operation.
        }
        guard let input = try JSONSerialization.jsonObject(with: body) as? [String: Any] else { return false }
        switch (action, outcome) {
        case ("objects", .objects(let values, _, _)):
            return input["cursor"] is NSNull || values.allSatisfy({ $0.id > (input["cursor"] as? String ?? "").lowercased() })
        case ("object", .object(let value)): return value.id == (input["submissionId"] as? String)?.lowercased()
        case ("mine", .page(let collection, let values, _, _)):
            return collection == input["collection"] as? String && (input["cursor"] is NSNull || values.allSatisfy({ $0.id > (input["cursor"] as? String ?? "").lowercased() }))
        case ("read", .record(let value)):
            return value.id == (input["id"] as? String)?.lowercased() && value.kind == NativeCommunitySafetyWire.collectionKind(input["collection"] as? String ?? "")
        case ("export", .export): return true
        default: return false
        }
    }
}

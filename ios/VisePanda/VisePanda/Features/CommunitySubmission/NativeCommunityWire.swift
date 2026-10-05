import Foundation
import CoreFoundation

struct NativeCommunityActor: Equatable {
    let scope: NativeDataScope
    let sessionID: String
}

enum NativeCommunityWire {
    static let schema = "community-j1/1"
    static let retained = ["operation_fences", "submission_tombstones", "audit_metadata"]
    static func object(_ raw: Any, _ keys: Set<String>) throws -> [String: Any] {
        guard let v = raw as? [String: Any], Set(v.keys) == keys else { throw NativeDataError.invalidResponse }; return v
    }
    static func bytes(_ v: [String: Any]) throws -> Data { try JSONSerialization.data(withJSONObject: v, options: [.sortedKeys, .withoutEscapingSlashes]) }
    static func id(_ raw: Any?) throws -> String {
        let v = try text(raw, max: 36)
        guard v.range(of: "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", options: [.regularExpression, .caseInsensitive]) != nil else { throw NativeDataError.invalidResponse }
        return v.lowercased()
    }
    static func text(_ raw: Any?, max: Int, empty: Bool = false) throws -> String {
        guard let s = raw as? String, s.utf16.count <= max, !s.contains("\u{0}"), empty || !s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw NativeDataError.invalidResponse }; return s
    }
    static func integer(_ raw: Any?, max: Int = 3, minimum: Int = 1) throws -> Int {
        guard let n = raw as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(), n.doubleValue.rounded() == n.doubleValue, n.doubleValue >= Double(minimum), n.doubleValue <= Double(max) else { throw NativeDataError.invalidResponse }; return n.intValue
    }
    static func bool(_ raw: Any?) throws -> Bool {
        guard let n = raw as? NSNumber, CFGetTypeID(n) == CFBooleanGetTypeID() else { throw NativeDataError.invalidResponse }; return n.boolValue
    }
    static func date(_ raw: Any?) throws -> String {
        let s = try text(raw, max: 64)
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if f.date(from: s) == nil { f.formatOptions = [.withInternetDateTime]; guard f.date(from: s) != nil else { throw NativeDataError.invalidResponse } }; return s
    }
    static func optional<T>(_ raw: Any?, _ parse: (Any?) throws -> T) throws -> T? {
        guard let raw else { throw NativeDataError.invalidResponse }
        return raw is NSNull ? nil : try parse(raw)
    }
    static func rows<T>(_ raw: Any?, max: Int, _ parse: (Any) throws -> T) throws -> [T] {
        guard let rows = raw as? [Any], rows.count <= max else { throw NativeDataError.invalidResponse }; return try rows.map(parse)
    }
    static func hash(_ raw: Any?) throws -> String {
        let s = try text(raw, max: 64); guard s.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { throw NativeDataError.invalidResponse }; return s
    }
}

struct NativeCommunityCommand: Equatable {
    let body: Data
    let action: String
    let operationID: String
    let submissionID: String?
    init(body: Data) throws {
        guard body.count <= 24_000, let utf8 = String(data: body, encoding: .utf8), utf8.utf16.count <= 10000 else { throw NativeDataError.invalidResponse }
        let w = NativeCommunityWire.self
        guard let v = try JSONSerialization.jsonObject(with: body) as? [String: Any], let action = v["action"] as? String else { throw NativeDataError.invalidResponse }
        self.operationID = try w.id(v["operationId"]); self.action = action; self.body = body
        switch action {
        case "submit":
            _ = try w.object(v, ["action", "operationId", "submissionId", "contentKind", "title", "content", "benefitDisclosure", "place", "consent"])
            submissionID = try w.id(v["submissionId"])
            guard ["experience", "help"].contains(v["contentKind"] as? String ?? ""), v["consent"] as? String == "internal-review-v1" else { throw NativeDataError.invalidResponse }
            _ = try w.text(v["title"], max: 160); _ = try w.text(v["content"], max: 4000); _ = try w.text(v["benefitDisclosure"], max: 400, empty: true)
            _ = try w.optional(v["place"]) { value in let p = try w.object(value as Any, ["tripId", "placeReferenceId", "expectedTripVersion", "mappingDigest"]); _ = try w.integer(p["expectedTripVersion"], max: 2_147_483_647, minimum: 0); _ = try w.hash(p["mappingDigest"]); return (try w.id(p["tripId"]), try w.id(p["placeReferenceId"])) }
        case "withdraw":
            _ = try w.object(v, ["action", "operationId", "submissionId", "expectedVersion"]); submissionID = try w.id(v["submissionId"])
            _ = try w.integer(v["expectedVersion"], max: 2)
        case "delete":
            _ = try w.object(v, ["action", "operationId", "confirmed"]); submissionID = nil
            guard try w.bool(v["confirmed"]) else { throw NativeDataError.invalidResponse }
        default: throw NativeDataError.invalidResponse
        }
    }
    static func submit(_ draft: NativeCommunityDraft) throws -> Self {
        guard draft.valid else { throw NativeDataError.invalidResponse }
        let place: Any = draft.place.map { ["tripId": $0.tripID, "placeReferenceId": $0.referenceID, "expectedTripVersion": $0.tripVersion, "mappingDigest": $0.row.mappingDigest] as [String: Any] } ?? NSNull()
        return try .init(body: NativeCommunityWire.bytes(["action": "submit", "operationId": UUID().uuidString.lowercased(), "submissionId": UUID().uuidString.lowercased(), "contentKind": draft.kind, "title": draft.title, "content": draft.content, "benefitDisclosure": draft.benefitDisclosure, "place": place, "consent": "internal-review-v1"]))
    }
    static func withdraw(_ item: NativeCommunityItem) throws -> Self {
        guard item.canWithdraw else { throw NativeDataError.invalidResponse }
        return try .init(body: NativeCommunityWire.bytes(["action": "withdraw", "operationId": UUID().uuidString.lowercased(), "submissionId": item.id, "expectedVersion": item.version]))
    }
    static func delete() throws -> Self { try .init(body: NativeCommunityWire.bytes(["action": "delete", "operationId": UUID().uuidString.lowercased(), "confirmed": true])) }
    func recovery(abandon: Bool = false) throws -> Data {
        guard let text = String(data: body, encoding: .utf8) else { throw NativeDataError.invalidResponse }
        return try NativeCommunityWire.bytes(["action": abandon ? "abandon" : "operation", "operationId": operationID, "mutationBytes": text])
    }
}

struct NativeCommunityEvent: Equatable {
    let action: String
    let version: Int
    let createdAt: String
    init(_ raw: Any) throws {
        let w = NativeCommunityWire.self, v = try w.object(raw, ["action", "version", "createdAt"])
        action = try w.text(v["action"], max: 12); version = try w.integer(v["version"]); createdAt = try w.date(v["createdAt"])
        guard ["submitted", "reviewed", "published", "rejected", "withdrawn", "deleted"].contains(action) else { throw NativeDataError.invalidResponse }
    }
}
struct NativeCommunityPlace: Equatable {
    let tripID: String
    let referenceID: String
    let canonicalID: String
    let digest: String
    let label: String?
    init(_ raw: Any) throws {
        let w = NativeCommunityWire.self, v = try w.object(raw, ["tripId", "placeReferenceId", "canonicalPoiId", "mappingDigest", "label"])
        tripID = try w.id(v["tripId"]); referenceID = try w.id(v["placeReferenceId"]); canonicalID = try w.id(v["canonicalPoiId"])
        digest = try w.hash(v["mappingDigest"]); label = try w.optional(v["label"]) { try w.text($0, max: 160) }
    }
}
struct NativeCommunityItem: Identifiable, Equatable {
    let id: String
    let title: String
    let content: String
    let kind: String
    let benefit: String?
    let disclosure: String
    let reviewerDisclosure: String?
    let status: String
    let version: Int
    let createdAt: String
    let reviewedAt: String?
    let withdrawnAt: String?
    let reviewNote: String?
    let place: NativeCommunityPlace?
    let history: [NativeCommunityEvent]
    var canWithdraw: Bool { ["pending", "published", "rejected"].contains(status) && version <= 2 }
    init(_ raw: Any) throws {
        let w = NativeCommunityWire.self
        let v = try w.object(raw, ["id", "title", "content", "contentKind", "benefitDisclosure", "authorDisclosure", "reviewerDisclosure", "status", "version", "createdAt", "reviewedAt", "withdrawnAt", "reviewNote", "place", "history", "visibility", "publiclyVisible", "retrievalEligible"])
        id = try w.id(v["id"]); title = try w.text(v["title"], max: 160, empty: true); content = try w.text(v["content"], max: 4000, empty: true)
        reviewerDisclosure = try w.optional(v["reviewerDisclosure"]) { try w.text($0, max: 24) }
        kind = try w.text(v["contentKind"], max: 10); disclosure = try w.text(v["authorDisclosure"], max: 24); status = try w.text(v["status"], max: 12)
        benefit = try w.optional(v["benefitDisclosure"]) { try w.text($0, max: 400, empty: true) }
        version = try w.integer(v["version"]); createdAt = try w.date(v["createdAt"])
        reviewedAt = try w.optional(v["reviewedAt"], w.date); withdrawnAt = try w.optional(v["withdrawnAt"], w.date)
        reviewNote = try w.optional(v["reviewNote"]) { try w.text($0, max: 400) }
        place = try w.optional(v["place"]) { try NativeCommunityPlace($0 as Any) }
        history = try w.rows(v["history"], max: 5, NativeCommunityEvent.init)
        guard ["experience", "help", "unknown"].contains(kind), ["registered_user", "community_reviewer", "official", "employee", "unknown"].contains(disclosure), ["pending", "published", "rejected", "withdrawn", "deleted"].contains(status),
              v["visibility"] as? String == "internal", try w.bool(v["publiclyVisible"]) == false, try w.bool(v["retrievalEligible"]) == false, history.allSatisfy({ $0.version <= version }) else { throw NativeDataError.invalidResponse }
        if ["withdrawn", "deleted"].contains(status) {
            guard title.isEmpty, content.isEmpty, benefit == nil, place == nil, withdrawnAt != nil, version >= 2 else { throw NativeDataError.invalidResponse }
        } else {
            guard !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, withdrawnAt == nil else { throw NativeDataError.invalidResponse }
        }
        guard reviewerDisclosure == nil || ["registered_user", "community_reviewer", "official", "employee", "unknown"].contains(reviewerDisclosure!) else { throw NativeDataError.invalidResponse }
        if status == "pending" { guard version == 1, reviewedAt == nil, reviewNote == nil, reviewerDisclosure == nil else { throw NativeDataError.invalidResponse } }
        if ["published", "rejected"].contains(status) { guard version == 2, reviewedAt != nil else { throw NativeDataError.invalidResponse } }
    }
}

enum NativeCommunityOutcome {
    case page([NativeCommunityItem], cursor: String?, complete: Bool)
    case item(NativeCommunityItem)
    case operation(String, state: String, item: NativeCommunityItem?)
    case deleted(String)
    case export(Data)
    static func decode(_ bytes: Data, actor: NativeCommunityActor) throws -> Self {
        let w = NativeCommunityWire.self
        guard bytes.count <= 1_000_000 else { throw NativeDataError.invalidResponse }
        let envelope = try w.object(JSONSerialization.jsonObject(with: bytes), ["data"])
        guard let v = envelope["data"] as? [String: Any], v["schemaVersion"] as? String == w.schema,
              try w.id(v["actorId"]) == actor.scope.subject.lowercased(), try w.id(v["sessionId"]) == actor.sessionID else { throw NativeDataError.invalidResponse }
        let base: Set<String> = ["schemaVersion", "kind", "actorId", "sessionId"]
        switch v["kind"] as? String {
        case "page":
            _ = try w.object(v, base.union(["submissions", "nextCursor", "complete"]))
            let items = try w.rows(v["submissions"], max: 50, NativeCommunityItem.init)
            let cursor = try w.optional(v["nextCursor"], w.id), complete = try w.bool(v["complete"])
            guard complete == (cursor == nil), cursor == nil || items.last?.id == cursor,
                  Set(items.map(\.id)).count == items.count else { throw NativeDataError.invalidResponse }
            return .page(items, cursor: cursor, complete: complete)
        case "item":
            _ = try w.object(v, base.union(["submission"])); return try .item(NativeCommunityItem(v["submission"] as Any))
        case "operation":
            _ = try w.object(v, base.union(["operationId", "state", "submission"]))
            let id = try w.id(v["operationId"]), state = try w.text(v["state"], max: 10)
            let item = try w.optional(v["submission"]) { try NativeCommunityItem($0 as Any) }
            guard ["absent", "committed", "abandoned"].contains(state), state == "committed" || item == nil else { throw NativeDataError.invalidResponse }
            return .operation(id, state: state, item: item)
        case "deleted":
            _ = try w.object(v, base.union(["operationId", "scope", "retained"]))
            guard v["scope"] as? String == "community_module", v["retained"] as? [String] == w.retained else { throw NativeDataError.invalidResponse }
            return try .deleted(w.id(v["operationId"]))
        case "export":
            _ = try w.object(v, base.union(["scope", "coverage", "submissions", "reviews", "receipts", "audits", "retained"]))
            guard v["scope"] as? String == "community_module", v["coverage"] as? String == "complete_for_community", v["retained"] as? [String] == w.retained else { throw NativeDataError.invalidResponse }
            _ = try w.rows(v["submissions"], max: 100, NativeCommunityItem.init)
            _ = try w.rows(v["reviews"], max: 100) { raw in
                let r = try w.object(raw, ["submissionId", "decision", "note", "createdAt"])
                _ = try w.id(r["submissionId"]); _ = try w.date(r["createdAt"])
                _ = try w.optional(r["note"]) { try w.text($0, max: 400) }
                guard ["approve", "reject"].contains(r["decision"] as? String ?? "") else { throw NativeDataError.invalidResponse }
            }
            _ = try w.rows(v["receipts"], max: 100) { raw in
                let r = try w.object(raw, ["operationId", "submissionId", "action", "state", "digest"])
                _ = try w.id(r["operationId"]); _ = try w.optional(r["submissionId"], w.id); _ = try w.hash(r["digest"])
                guard ["submit", "review", "withdraw", "delete"].contains(r["action"] as? String ?? ""), ["committed", "abandoned"].contains(r["state"] as? String ?? "") else { throw NativeDataError.invalidResponse }
            }
            _ = try w.rows(v["audits"], max: 100) { raw in
                let r = try w.object(raw, ["submissionId", "action", "version", "createdAt"])
                _ = try w.id(r["submissionId"])
                _ = try NativeCommunityEvent(["action": r["action"] as Any, "version": r["version"] as Any, "createdAt": r["createdAt"] as Any])
            }
            return .export(bytes)
        default: throw NativeDataError.invalidResponse
        }
    }
    func terminal(for command: NativeCommunityCommand, recovery: Bool) throws -> Bool {
        switch self {
        case .deleted(let id):
            guard command.action == "delete", id == command.operationID, !recovery else { throw NativeDataError.invalidResponse }; return true
        case .operation(let id, let state, let item):
            guard id == command.operationID else { throw NativeDataError.invalidResponse }
            if state == "committed" {
                guard command.action == "delete" ? item == nil : item?.id == command.submissionID else { throw NativeDataError.invalidResponse }; return true
            }
            guard recovery else { throw NativeDataError.invalidResponse }; return state == "abandoned"
        default: throw NativeDataError.invalidResponse
        }
    }
}

struct NativeCommunityInput {
    let mutation: NativeCommunityCommand?
    let recovery: NativeCommunityCommand?
    init(body: Data) throws {
        let w = NativeCommunityWire.self
        guard body.count <= 24_000, let value = String(data: body, encoding: .utf8), value.utf16.count <= 10000,
              let v = try JSONSerialization.jsonObject(with: body) as? [String: Any], let action = v["action"] as? String else { throw NativeDataError.invalidResponse }
        mutation = ["submit", "withdraw", "delete"].contains(action) ? try NativeCommunityCommand(body: body) : nil
        if mutation != nil { recovery = nil; return }
        switch action {
        case "mine": _ = try w.object(v, ["action", "cursor"]); _ = try w.optional(v["cursor"], w.id); recovery = nil
        case "read": _ = try w.object(v, ["action", "submissionId"]); _ = try w.id(v["submissionId"]); recovery = nil
        case "export": _ = try w.object(v, ["action"]); recovery = nil
        case "operation", "abandon":
            _ = try w.object(v, ["action", "operationId", "mutationBytes"])
            let text = try w.text(v["mutationBytes"], max: 10000)
            recovery = try NativeCommunityCommand(body: Data(text.utf8))
            guard recovery?.operationID == (try w.id(v["operationId"])) else { throw NativeDataError.invalidResponse }
        default: throw NativeDataError.invalidResponse
        }
    }
}

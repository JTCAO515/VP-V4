import Foundation
import CryptoKit

struct NativeTravelerBriefCommand: Equatable {
    let body: Data
    let action: String
    let operationID: String
    let caseID: String
    let recipientID: String
    let grantRevision: Int
    let expectedRevision: Int
    let previewID: String?
    let sourceDigest: String?
    let selectedKeys: [String]
    var digest: String { SHA256.hash(data: body).map { String(format: "%02x", $0) }.joined() }

    init(body: Data) throws {
        let w = NativeTravelerBriefWire.self
        guard body.count <= 24_000, String(data: body, encoding: .utf8) != nil,
              let raw = try JSONSerialization.jsonObject(with: body) as? [String: Any], let action = raw["action"] as? String,
              ["share", "withdraw", "delete"].contains(action) else { throw NativeDataError.invalidResponse }
        let base: Set<String> = ["action", "operationId", "caseId", "recipientId", "grantRevision", "expectedRevision", "confirmed"]
        let v = try w.object(raw, keys: base.union(action == "share" ? ["previewId", "sourceDigest", "selectedKeys", "noticeVersion"] : []))
        guard try w.bool(v["confirmed"]) else { throw NativeDataError.invalidResponse }
        operationID = try w.uuid(v["operationId"]); caseID = try w.uuid(v["caseId"]); recipientID = try w.uuid(v["recipientId"])
        grantRevision = try w.integer(v["grantRevision"]); expectedRevision = try w.integer(v["expectedRevision"])
        if action == "share" {
            previewID = try w.uuid(v["previewId"]); sourceDigest = try w.digest(v["sourceDigest"])
            guard v["noticeVersion"] as? String == w.notice, let rows = v["selectedKeys"] as? [Any], !rows.isEmpty, rows.count <= 7 else { throw NativeDataError.invalidResponse }
            let keys = try rows.map(w.key)
            guard Set(keys).count == keys.count else { throw NativeDataError.invalidResponse }
            selectedKeys = keys.sorted()
        } else { previewID = nil; sourceDigest = nil; selectedKeys = [] }
        self.body = body; self.action = action
    }

    init(action: String, snapshot: NativeTravelerBriefSnapshot, actor: NativeDataScope,
         selection: NativeTravelerBriefSelection? = nil) throws {
        let w = NativeTravelerBriefWire.self
        guard snapshot.ownerID == actor.subject.lowercased(), snapshot.expiresAt > Date().timeIntervalSince1970 * 1000 else { throw NativeDataError.staleSessionResponse }
        var fields: [String: Any] = ["action": action, "operationId": UUID().uuidString.lowercased(), "caseId": snapshot.caseID,
                                    "recipientId": snapshot.recipientID, "grantRevision": snapshot.grantRevision,
                                    "expectedRevision": snapshot.revision, "confirmed": true]
        if action == "share" {
            guard snapshot.kind == "preview", let preview = snapshot.previewID, let selection else { throw NativeDataError.invalidResponse }
            let keys = try selection.authorizedKeys(current: snapshot.boundary(actor: actor))
            guard Set(keys).isSubset(of: Set(snapshot.fields.filter(\.available).map(\.key))) else { throw NativeDataError.invalidResponse }
            fields["previewId"] = preview; fields["sourceDigest"] = snapshot.sourceDigest
            fields["selectedKeys"] = keys; fields["noticeVersion"] = w.notice
        }
        try self.init(body: w.bytes(fields))
    }

    init(cleanup action: String, caseID: String, recipientID: String, grantRevision: Int, revision: Int) throws {
        guard ["withdraw", "delete"].contains(action) else { throw NativeDataError.invalidResponse }
        try self.init(body: NativeTravelerBriefWire.bytes(["action": action, "operationId": UUID().uuidString.lowercased(),
            "caseId": caseID, "recipientId": recipientID, "grantRevision": grantRevision, "expectedRevision": revision, "confirmed": true]))
    }

    func recoveryBody(abandon: Bool = false) throws -> Data {
        if abandon {
            guard let text = String(data: body, encoding: .utf8) else { throw NativeDataError.invalidResponse }
            return try NativeTravelerBriefWire.bytes(["action": "abandon", "operationId": operationID, "mutationBytes": text])
        }
        return try NativeTravelerBriefWire.bytes(["action": "read_operation", "operationId": operationID])
    }
}

struct NativeTravelerBriefReceipt: Equatable {
    let outcome: String
    let action: String
    let revision: Int
    let createdAt: Double

    init(raw: Any, command: NativeTravelerBriefCommand) throws {
        let w = NativeTravelerBriefWire.self
        let v = try w.object(raw, keys: ["schemaVersion", "kind", "operationId", "requestDigest", "action", "outcome", "caseId", "revision", "grantRevision", "createdAt"])
        guard v["schemaVersion"] as? String == w.version, v["kind"] as? String == "receipt",
              try w.uuid(v["operationId"]) == command.operationID, try w.digest(v["requestDigest"]) == command.digest,
              try w.uuid(v["caseId"]) == command.caseID, v["action"] as? String == command.action,
              let outcome = v["outcome"] as? String, ["applied", "cancelled"].contains(outcome),
              try w.integer(v["grantRevision"]) == command.grantRevision else { throw NativeDataError.invalidResponse }
        revision = try w.integer(v["revision"])
        guard outcome == "applied" ? revision == command.expectedRevision + 1 : revision >= command.expectedRevision else { throw NativeDataError.invalidResponse }
        self.outcome = outcome; action = command.action; createdAt = try w.timestamp(v["createdAt"])
    }
}

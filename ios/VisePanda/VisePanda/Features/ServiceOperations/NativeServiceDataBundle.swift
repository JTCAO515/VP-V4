import Foundation
import CoreFoundation

struct NativeServiceDataBundle {
    static let domains = ["case", "grant_audit", "service", "minutes", "service_audit", "operation"]
    let bytes: Data
    let ownerId: String
    let sessionId: String
    let requestId: String
    let sourceDigest: String
    let expiresAt: Date
    let rowCount: Int
    let counts: [String: Int]
    static func decode(_ bytes: Data, actor: NativeDataScope, sessionId: String, requestId: String, now: Date = Date()) throws -> Self {
        guard bytes.count <= 524_288 else { throw NativeDataError.invalidResponse }
        let w = NativeServiceOperationWire.self
        let envelope = try w.object(JSONSerialization.jsonObject(with: bytes), keys: ["data"])
        let value = try w.object(envelope["data"] as Any, keys: ["schemaVersion", "kind", "requestId", "ownerId", "sessionId", "capturedAt", "expiresAt", "sourceDigest", "corePackageEnrollment", "allUserDataCompleted", "coverage", "rows"])
        guard value["schemaVersion"] as? String == "service-case-data/1", value["kind"] as? String == "bundle",
              try w.identifier(value["ownerId"]) == actor.subject.lowercased(), try w.identifier(value["requestId"]) == requestId,
              try w.identifier(value["sessionId"]) == sessionId, value["corePackageEnrollment"] as? String == "not_enrolled",
              let complete = value["allUserDataCompleted"] as? NSNumber, CFGetTypeID(complete) == CFBooleanGetTypeID(), !complete.boolValue,
              let digest = value["sourceDigest"] as? String, digest.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { throw NativeDataError.invalidResponse }
        let captured = try NativeServiceProjection.timestamp(value["capturedAt"]), expiry = try NativeServiceProjection.timestamp(value["expiresAt"]), current = now.timeIntervalSince1970 * 1000
        guard expiry > current, expiry > captured, expiry - captured <= 30_000, abs(current - captured) <= 30_000 else { throw NativeDataError.invalidResponse }
        let coverage = try w.object(value["coverage"] as Any, keys: Set(domains + ["brief", "attachments"]))
        guard domains.allSatisfy({ coverage[$0] as? String == "complete" }), coverage["brief"] as? String == "unavailable", coverage["attachments"] as? String == "unavailable",
              let rows = value["rows"] as? [[String: Any]], rows.count <= 10_000 else { throw NativeDataError.invalidResponse }
        var keys = Set<String>(), counts: [String: Int] = [:]
        for row in rows {
            _ = try w.object(row, keys: ["key", "domain", "value"])
            let key = try w.string(row["key"], max: 180), domain = try w.string(row["domain"], max: 32)
            guard !key.contains("\0"), domains.contains(domain), row["value"] is [String: Any], keys.insert(key).inserted else { throw NativeDataError.invalidResponse }
            counts[domain, default: 0] += 1
        }
        return .init(bytes: try w.bytes(value), ownerId: actor.subject, sessionId: sessionId, requestId: requestId, sourceDigest: digest, expiresAt: .init(timeIntervalSince1970: expiry / 1000), rowCount: rows.count, counts: counts)
    }
}

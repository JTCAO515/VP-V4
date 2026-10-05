import Foundation
import CryptoKit
import CoreFoundation

struct NativeServiceCapacity: Decodable {
    let state: String
    let checkedAt: Double
}
struct NativeServiceEvidence: Decodable {
    let kind: String
    let note: String
    let reference: String
    let observedAt: Double
    func label(zh: Bool) -> String {
        switch kind {
        case "tutorial": zh ? "已提供教程" : "Tutorial provided"
        case "contacted_provider": zh ? "已联系服务方" : "Provider contacted"
        default: zh ? "外部解决依据" : "External resolution evidence"
        }
    }
}
struct NativeServiceProjection: Decodable, Identifiable {
    struct Staff: Decodable { let actorId: String; let label: String; let acceptedAt: Double; let shiftEndsAt: Double }
    struct Binding: Decodable { let kind: String; let tripId: String?; let headVersion: Int? }
    struct Unknown: Decodable { let kind: String }
    struct Proposal: Decodable { let proposalId: String; let tripId: String; let baseVersion: Int }
    let caseId: String
    let revision: Int
    let grantRevision: Int
    let status: NativeServiceOperationStatus
    let category: String
    let problem: String
    let grantState: String
    let expiresAt: Double?
    let updatedAt: Double
    let urgency: String
    let capacity: NativeServiceCapacity
    let staff: Staff?
    let brief: Unknown
    let sources: Unknown
    let trip: Binding
    let evidence: [NativeServiceEvidence]
    let manualMinutes: Int
    let manualMinutesScope: String
    let proposal: Proposal?
    var id: String { caseId }
    static func decode(_ value: Any) throws -> Self {
        let w = NativeServiceOperationWire.self
        let v = try w.object(value, keys: ["caseId", "revision", "grantRevision", "status", "category", "problem", "grantState", "expiresAt", "updatedAt", "urgency", "capacity", "staff", "brief", "sources", "trip", "evidence", "manualMinutes", "manualMinutesScope", "proposal"])
        _ = try w.identifier(v["caseId"])
        for key in ["revision", "grantRevision", "manualMinutes"] { _ = try w.integer(v[key]) }
        guard ["queued", "accepted", "assigned", "waiting_external", "resolved", "unresolved", "cancelled"].contains(v["status"] as? String),
              ["transport", "accommodation", "on_trip", "general"].contains(v["category"] as? String),
              ["active", "expired", "revoked"].contains(v["grantState"] as? String),
              ["normal", "urgent"].contains(v["urgency"] as? String) else { throw NativeDataError.invalidResponse }
        _ = try w.string(v["problem"])
        _ = try timestamp(v["updatedAt"])
        if !(v["expiresAt"] is NSNull) { _ = try timestamp(v["expiresAt"]) }
        _ = try capacity(v["capacity"])
        for key in ["brief", "sources"] {
            let unknown = try w.object(v[key] as Any, keys: ["kind"])
            guard unknown["kind"] as? String == "unknown" else { throw NativeDataError.invalidResponse }
        }
        let trip = try w.object(v["trip"] as Any, keys: ["kind"], optional: ["tripId", "headVersion"])
        if trip["kind"] as? String == "unknown" { guard trip.count == 1 else { throw NativeDataError.invalidResponse } }
        else {
            guard trip["kind"] as? String == "bound", trip.count == 3 else { throw NativeDataError.invalidResponse }
            _ = try w.identifier(trip["tripId"]); _ = try w.integer(trip["headVersion"], minimum: 0)
        }
        if !(v["staff"] is NSNull) {
            let staff = try w.object(v["staff"] as Any, keys: ["actorId", "label", "acceptedAt", "shiftEndsAt"])
            _ = try w.identifier(staff["actorId"]); _ = try w.string(staff["label"], max: 80)
            guard try timestamp(staff["shiftEndsAt"]) > timestamp(staff["acceptedAt"]) else { throw NativeDataError.invalidResponse }
        }
        guard let evidence = v["evidence"] as? [[String: Any]], evidence.count <= 100 else { throw NativeDataError.invalidResponse }
        for item in evidence {
            _ = try w.object(item, keys: ["kind", "note", "reference", "observedAt"])
            guard ["tutorial", "contacted_provider", "external_resolution"].contains(item["kind"] as? String) else { throw NativeDataError.invalidResponse }
            _ = try w.string(item["note"]); _ = try w.string(item["reference"], max: 300); _ = try timestamp(item["observedAt"])
        }
        if !(v["proposal"] is NSNull) {
            let proposal = try w.object(v["proposal"] as Any, keys: ["proposalId", "tripId", "baseVersion"])
            _ = try w.identifier(proposal["proposalId"]); _ = try w.identifier(proposal["tripId"])
            guard trip["kind"] as? String == "bound", proposal["tripId"] as? String == trip["tripId"] as? String,
                  try w.integer(proposal["baseVersion"], minimum: 0) == w.integer(trip["headVersion"], minimum: 0) else { throw NativeDataError.invalidResponse }
        }
        guard v["manualMinutesScope"] as? String == "recorded_only" else { throw NativeDataError.invalidResponse }
        let result = try JSONDecoder().decode(Self.self, from: w.bytes(v))
        if result.status == .queued {
            guard result.staff == nil, result.manualMinutes == 0, result.evidence.isEmpty, result.proposal == nil else { throw NativeDataError.invalidResponse }
        }
        if result.status.mayShowAcceptance { guard result.staff != nil else { throw NativeDataError.invalidResponse } }
        if result.status == .resolved { guard result.evidence.contains(where: { ["tutorial", "external_resolution"].contains($0.kind) }) else { throw NativeDataError.invalidResponse } }
        return result
    }
    static func timestamp(_ value: Any?) throws -> Double {
        guard let n = value as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(), n.doubleValue.isFinite,
              n.doubleValue.rounded() == n.doubleValue, n.doubleValue > 0, n.doubleValue < 8_640_000_000_000_000 else { throw NativeDataError.invalidResponse }; return n.doubleValue
    }
    static func capacity(_ value: Any?) throws -> NativeServiceCapacity {
        let v = try NativeServiceOperationWire.object(value as Any, keys: ["state", "checkedAt"])
        guard ["available", "full", "unknown"].contains(v["state"] as? String) else { throw NativeDataError.invalidResponse }
        _ = try timestamp(v["checkedAt"])
        return try JSONDecoder().decode(NativeServiceCapacity.self, from: NativeServiceOperationWire.bytes(v))
    }
}

struct NativeServiceOperationReceipt: Decodable {
    let operationId: String
    let requestDigest: String
    let action: String
    let outcome: String
    let caseId: String?
    let revision: Int?
    let grantRevision: Int?
    let createdAt: Double
    static func decode(_ value: Any, command: NativeServiceOperationCommand) throws -> Self {
        let w = NativeServiceOperationWire.self
        if try command.isData {
            let v = try w.object(value, keys: ["schemaVersion", "kind", "operationId", "requestDigest", "outcome", "createdAt", "allUserDataCompleted"])
            let digest = SHA256.hash(data: command.body).map { String(format: "%02x", $0) }.joined()
            guard v["schemaVersion"] as? String == "service-case-data/1", v["kind"] as? String == "receipt",
                  try w.identifier(v["operationId"]) == command.operationId, v["requestDigest"] as? String == digest,
                  ["deleted", "cancelled"].contains(v["outcome"] as? String), let complete = v["allUserDataCompleted"] as? NSNumber,
                  CFGetTypeID(complete) == CFBooleanGetTypeID(), !complete.boolValue else { throw NativeDataError.invalidResponse }
            return .init(operationId: try command.operationId, requestDigest: digest, action: "delete", outcome: try w.string(v["outcome"], max: 16), caseId: nil, revision: nil, grantRevision: nil, createdAt: try NativeServiceProjection.timestamp(v["createdAt"]))
        }
        let v = try w.object(value, keys: ["operationId", "requestDigest", "action", "outcome", "caseId", "revision", "grantRevision", "createdAt"])
        let digest = SHA256.hash(data: command.body).map { String(format: "%02x", $0) }.joined()
        guard try w.identifier(v["operationId"]) == command.operationId, try w.identifier(v["caseId"]) == command.caseId,
              try v["action"] as? String == command.action, v["requestDigest"] as? String == digest,
              ["applied", "cancelled"].contains(v["outcome"] as? String) else { throw NativeDataError.invalidResponse }
        _ = try w.integer(v["revision"]); _ = try w.integer(v["grantRevision"])
        _ = try NativeServiceProjection.timestamp(v["createdAt"])
        return try JSONDecoder().decode(Self.self, from: w.bytes(v))
    }
}

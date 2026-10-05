import Foundation
import CryptoKit
import SwiftUI
import UIKit

struct NativeTravelerBriefBundle {
    let bytes: Data
    let expiresAt: Date
    let rowCount: Int
    init(bytes: Data, actor: NativeDataScope, sessionID: String, requestID: String, now: Date = Date()) throws {
        let w = NativeTravelerBriefWire.self
        guard bytes.count <= 524_288 else { throw NativeDataError.invalidResponse }
        let root = try w.object(JSONSerialization.jsonObject(with: bytes), keys: ["data"])
        let v = try w.object(root["data"], keys: ["schemaVersion", "kind", "requestId", "ownerId", "sessionId", "capturedAt", "expiresAt", "sourceDigest", "corePackageEnrollment", "allUserDataCompleted", "coverage", "rows"])
        guard v["schemaVersion"] as? String == "traveler-brief-data/1", v["kind"] as? String == "bundle",
              try w.uuid(v["ownerId"]) == actor.subject.lowercased(), try w.uuid(v["sessionId"]) == sessionID,
              try w.uuid(v["requestId"]) == requestID, v["corePackageEnrollment"] as? String == "not_enrolled",
              try !w.bool(v["allUserDataCompleted"]) else { throw NativeDataError.invalidResponse }
        let captured = try w.timestamp(v["capturedAt"]), expiry = try w.timestamp(v["expiresAt"]), current = now.timeIntervalSince1970 * 1000
        guard expiry > current, expiry > captured, expiry - captured <= 30_000, abs(current - captured) <= 30_000 else { throw NativeDataError.invalidResponse }
        _ = try w.digest(v["sourceDigest"])
        let coverage = try w.object(v["coverage"], keys: ["brief", "previews", "audit", "operations", "sourceValues", "attachments"])
        guard ["brief", "previews", "audit", "operations"].allSatisfy({ coverage[$0] as? String == "complete" }),
              coverage["sourceValues"] as? String == "not_copied", coverage["attachments"] as? String == "unavailable",
              let rows = v["rows"] as? [[String: Any]], rows.count <= 10_000 else { throw NativeDataError.invalidResponse }
        var keys = Set<String>()
        for raw in rows {
            let row = try w.object(raw, keys: ["key", "domain", "value"]), key = try w.text(row["key"], maximum: 180)
            guard keys.insert(key).inserted, let domain = row["domain"] as? String else { throw NativeDataError.invalidResponse }
            try Self.validateRow(row["value"], domain: domain)
        }
        self.bytes = try w.bytes(v); expiresAt = Date(timeIntervalSince1970: expiry / 1000); rowCount = rows.count
    }
    private static func validateSources(_ raw: Any?) throws {
        let w = NativeTravelerBriefWire.self
        let v = try w.object(raw, keys: ["profilePace", "memories", "intakeMessageId"])
        _ = try w.bool(v["profilePace"])
        if !(v["intakeMessageId"] is NSNull) { _ = try w.uuid(v["intakeMessageId"]) }
        guard let rows = v["memories"] as? [Any], rows.count <= 3 else { throw NativeDataError.invalidResponse }
        var ids = Set<String>()
        for raw in rows {
            let row = try w.object(raw, keys: ["id", "revision"]), id = try w.uuid(row["id"])
            guard ids.insert(id).inserted else { throw NativeDataError.invalidResponse }; _ = try w.integer(row["revision"], minimum: 1)
        }
    }
    private static func validateRow(_ raw: Any?, domain: String) throws {
        let w = NativeTravelerBriefWire.self
        if domain == "audit" {
            let v = try w.object(raw, keys: ["caseId", "event"]); _ = try w.uuid(v["caseId"]); _ = try NativeTravelerBriefAudit.event(v["event"] as Any); return
        }
        if domain == "operation" {
            let v = try w.object(raw, keys: ["operationId", "caseId", "sessionId", "requestDigest", "requestBytes", "receipt", "erased", "createdAt"])
            let operation = try w.uuid(v["operationId"]); _ = try w.uuid(v["sessionId"]); _ = try w.digest(v["requestDigest"]); _ = try w.timestamp(v["createdAt"])
            if try w.bool(v["erased"]) {
                guard ["caseId", "requestBytes", "receipt"].allSatisfy({ v[$0] is NSNull }) else { throw NativeDataError.invalidResponse }; return
            }
            let request = try w.text(v["requestBytes"], maximum: 24_000), command = try NativeTravelerBriefCommand(body: Data(request.utf8))
            guard command.operationID == operation, command.caseID == (try w.uuid(v["caseId"])), command.digest == (try w.digest(v["requestDigest"])) else { throw NativeDataError.invalidResponse }
            _ = try NativeTravelerBriefReceipt(raw: v["receipt"] as Any, command: command); return
        }
        guard ["brief", "preview"].contains(domain) else { throw NativeDataError.invalidResponse }
        let briefKeys: Set<String> = ["caseId", "revision", "recipientId", "grantRevision", "state", "selectedKeys", "sourceDigest", "sources", "updatedAt", "expiresAt"]
        let previewKeys: Set<String> = ["previewId", "caseId", "revision", "recipientId", "grantRevision", "sourceDigest", "sources", "createdAt", "expiresAt"]
        let v = try w.object(raw, keys: domain == "brief" ? briefKeys : previewKeys)
        _ = try w.uuid(v["caseId"]); _ = try w.integer(v["revision"]); _ = try w.integer(v["grantRevision"])
        if domain == "brief" {
            guard let state = v["state"] as? String, ["shared", "withdrawn", "deleted", "invalidated"].contains(state),
                  let fields = v["selectedKeys"] as? [Any], fields.count <= 7 else { throw NativeDataError.invalidResponse }
            let keys = try fields.map(w.key); guard Set(keys).count == keys.count else { throw NativeDataError.invalidResponse }
            if state != "shared" {
                guard keys.isEmpty, ["sourceDigest", "sources", "expiresAt"].allSatisfy({ v[$0] is NSNull }) else { throw NativeDataError.invalidResponse }
            }
            if !(v["recipientId"] is NSNull) { _ = try w.uuid(v["recipientId"]) }
            if !(v["sourceDigest"] is NSNull) { _ = try w.digest(v["sourceDigest"]) }
            if !(v["sources"] is NSNull) { try validateSources(v["sources"]) }
            _ = try w.timestamp(v["updatedAt"])
            if !(v["expiresAt"] is NSNull) { _ = try w.timestamp(v["expiresAt"]) }
        } else {
            _ = try w.uuid(v["previewId"]); _ = try w.uuid(v["recipientId"]); _ = try w.digest(v["sourceDigest"]); try validateSources(v["sources"])
            let start = try w.timestamp(v["createdAt"]), expiry = try w.timestamp(v["expiresAt"])
            guard expiry > start, expiry - start <= 300_000 else { throw NativeDataError.invalidResponse }
        }
    }
}

struct NativeTravelerBriefExportFile: Identifiable {
    @MainActor private static var active = Set<UUID>()
    let id: UUID
    let url: URL
    let artifactDigest: String
    let actor: NativeDataScope
    let expiresAt: Date
    let deadline: Double
    func current(_ actor: NativeDataScope?, now: Date = Date(), uptime: Double = ProcessInfo.processInfo.systemUptime) -> Bool {
        actor == self.actor && now < expiresAt && uptime < deadline && FileManager.default.fileExists(atPath: url.path)
    }
    @MainActor static func create(_ bundle: NativeTravelerBriefBundle, actor: NativeDataScope, started: Double,
                                 root: URL = FileManager.default.temporaryDirectory, now: Date = Date(), uptime: Double = ProcessInfo.processInfo.systemUptime) throws -> Self {
        guard bundle.expiresAt > now, uptime >= started, uptime - started < 30 else { throw NativeDataError.invalidResponse }
        let id = UUID(), directory = root.appendingPathComponent("vp-traveler-brief-export-" + id.uuidString, isDirectory: true), url = directory.appendingPathComponent("traveler-brief-data.json")
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
            var excluded = URLResourceValues(); excluded.isExcludedFromBackup = true; var protected = directory; try protected.setResourceValues(excluded)
            try bundle.bytes.write(to: url, options: [.atomic, .completeFileProtection])
            guard try Data(contentsOf: url) == bundle.bytes else { throw NativeDataError.sessionUnavailable }
            active.insert(id)
            return .init(id: id, url: url, artifactDigest: SHA256.hash(data: bundle.bytes).map { String(format: "%02x", $0) }.joined(), actor: actor,
                         expiresAt: bundle.expiresAt, deadline: min(started + 30, uptime + bundle.expiresAt.timeIntervalSince(now)))
        } catch { try? FileManager.default.removeItem(at: directory); throw error }
    }
    @MainActor static func erase(_ file: Self) throws {
        guard file.url.lastPathComponent == "traveler-brief-data.json", file.url.deletingLastPathComponent().lastPathComponent == "vp-traveler-brief-export-" + file.id.uuidString else { throw NativeDataError.invalidResponse }
        let directory = file.url.deletingLastPathComponent()
        if FileManager.default.fileExists(atPath: directory.path) { try FileManager.default.removeItem(at: directory) }
        guard !FileManager.default.fileExists(atPath: directory.path) else { throw NativeDataError.sessionUnavailable }; active.remove(file.id)
    }
    @MainActor static func sweepOrphans(root: URL = FileManager.default.temporaryDirectory) throws {
        let prefix = "vp-traveler-brief-export-"
        for url in try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) {
            guard url.lastPathComponent.hasPrefix(prefix), let id = UUID(uuidString: String(url.lastPathComponent.dropFirst(prefix.count))), !active.contains(id) else { continue }
            try FileManager.default.removeItem(at: url)
        }
    }
}

struct NativeTravelerBriefExportShare: UIViewControllerRepresentable {
    let file: NativeTravelerBriefExportFile
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: file.current(file.actor) ? [file.url] : [], applicationActivities: nil)
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

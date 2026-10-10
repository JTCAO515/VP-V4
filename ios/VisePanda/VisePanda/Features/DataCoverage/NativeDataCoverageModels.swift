import Foundation
import CryptoKit

enum NativeDataCoverageWire {
    static let schema = "data-coverage/1"
    static let catalog = "data-coverage-catalog/2026-10-07.11"
    static let moduleIDs: Set<String> = ["trip", "conversations", "results", "profile", "memory", "turn", "user_artifact", "brief", "entitlements", "case", "ugc", "safety", "publication", "notifications", "notification_devices", "notification_exit_progress", "lifecycle", "coverage_progress", "guide", "order_references", "pdf_intake", "material_exit_progress", "case_attachments", "archive", "materials", "app_group", "local_share", "guide_cache", "offline", "local_journals", "provider", "backup", "external_copies", "financial_records"]
    static func digest(_ bytes: Data) -> String { SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined() }
    static func actor(_ v: [String: Any], _ actor: NativeCommunitySafetyActor) throws {
        let w = NativeCommunityWire.self
        guard v["schemaVersion"] as? String == schema, v["catalogVersion"] as? String == catalog,
              try w.id(v["actorId"]) == actor.scope.subject.lowercased(), try w.id(v["sessionId"]) == actor.sessionID,
              try w.integer(v["mobileEpoch"], max: 9_007_199_254_740_991, minimum: 1) == actor.scope.mobileEpoch,
              try !w.bool(v["allUserDataCompleted"]) else { throw NativeDataError.invalidResponse }
    }
}

struct NativeDataCoverageModule: Identifiable, Equatable {
    enum Location: String { case server, device, external }
    let id: String
    let location: Location
    let version: String
    let scope: String
    let exportHandler: String?
    let deleteHandler: String?
    let selection: String
    let capacity: String
    let retention: [String]
    let missing: [String]

    init(_ raw: Any) throws {
        let w = NativeCommunityWire.self
        let v = try w.object(raw, ["id", "location", "version", "scope", "exportHandler", "deleteHandler", "selection", "capacity", "retention", "missing"])
        id = try w.text(v["id"], max: 40)
        guard NativeDataCoverageWire.moduleIDs.contains(id), let location = Location(rawValue: try w.text(v["location"], max: 8)) else { throw NativeDataError.invalidResponse }
        self.location = location; version = try w.text(v["version"], max: 80); scope = try w.text(v["scope"], max: 80)
        exportHandler = try w.optional(v["exportHandler"]) { try w.text($0, max: 20) }
        deleteHandler = try w.optional(v["deleteHandler"]) { try w.text($0, max: 20) }
        selection = try w.text(v["selection"], max: 20); capacity = try w.text(v["capacity"], max: 400)
        retention = try w.rows(v["retention"], max: 20) { try w.text($0, max: 100) }
        missing = try w.rows(v["missing"], max: 20) { try w.text($0, max: 100) }
        guard ["owner", "trip", "memory_plan", "case", "guide_reference", "device_files", "material_records", "notification_records", "coverage_records", "none"].contains(selection),
              Set(retention).count == retention.count, Set(missing).count == missing.count else { throw NativeDataError.invalidResponse }
    }
    func handler(_ action: NativeDataCoverageAction) -> String? { action == .export ? exportHandler : deleteHandler }
}

struct NativeDataCoverageCatalog {
    let modules: [NativeDataCoverageModule]
    init(bytes: Data, actor: NativeCommunitySafetyActor) throws {
        guard bytes.count <= 65_536 else { throw NativeDataError.invalidResponse }
        let w = NativeCommunityWire.self
        let v = try w.object(JSONSerialization.jsonObject(with: bytes), ["schemaVersion", "catalogVersion", "actorId", "sessionId", "mobileEpoch", "modules", "allUserDataCompleted"])
        try NativeDataCoverageWire.actor(v, actor)
        modules = try w.rows(v["modules"], max: 64, NativeDataCoverageModule.init)
        guard Set(modules.map(\.id)) == NativeDataCoverageWire.moduleIDs, modules.count == NativeDataCoverageWire.moduleIDs.count else { throw NativeDataError.invalidResponse }
    }
}

enum NativeDataCoverageAction: String { case export, delete }
enum NativeDataCoveragePhase: String { case execute, recover, preview }
enum NativeDataCoverageState: String { case scopedComplete = "scoped_complete", queued, partial, unknown, unavailable, preview }

struct NativeDataCoverageReceipt {
    let moduleID: String
    let moduleVersion: String
    let operationID: String
    let action: NativeDataCoverageAction
    let phase: NativeDataCoveragePhase
    let state: NativeDataCoverageState
    let reason: String
    /// Raw original handler reply is decoded by its existing native consumer before it can complete a row.
    let result: Data?

    init(bytes: Data, actor: NativeCommunitySafetyActor, command: NativeDataCoverageCommand) throws {
        guard bytes.count <= 1_000_000 else { throw NativeDataError.invalidResponse }
        let w = NativeCommunityWire.self
        let v = try w.object(JSONSerialization.jsonObject(with: bytes), ["schemaVersion", "catalogVersion", "actorId", "sessionId", "mobileEpoch", "moduleId", "moduleVersion", "operationId", "action", "phase", "requestDigest", "state", "reason", "result", "allUserDataCompleted"])
        try NativeDataCoverageWire.actor(v, actor)
        guard v["moduleId"] as? String == command.moduleID, v["moduleVersion"] as? String == command.moduleVersion,
              try w.id(v["operationId"]) == command.operationID, v["action"] as? String == command.action.rawValue,
              v["phase"] as? String == command.phase.rawValue, try w.hash(v["requestDigest"]) == NativeDataCoverageWire.digest(command.body),
              let state = NativeDataCoverageState(rawValue: try w.text(v["state"], max: 20)) else { throw NativeDataError.invalidResponse }
        moduleID = command.moduleID; moduleVersion = command.moduleVersion; operationID = command.operationID
        action = command.action; phase = command.phase; self.state = state; reason = try w.text(v["reason"], max: 120)
        guard reason.range(of: "^[A-Za-z0-9_]{1,120}$", options: .regularExpression) != nil else { throw NativeDataError.invalidResponse }
        if v["result"] is NSNull { result = nil }
        else {
            guard let result = v["result"], JSONSerialization.isValidJSONObject(result) else { throw NativeDataError.invalidResponse }
            self.result = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys, .withoutEscapingSlashes])
        }
        guard state != .scopedComplete || (phase != .preview && reason == "NONE" && result != nil),
              phase != .preview || state == .preview || state == .unavailable || state == .unknown else { throw NativeDataError.invalidResponse }
    }
}

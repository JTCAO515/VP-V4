import Foundation

struct NativeDataCoverageCommand: Equatable {
    let body: Data
    let moduleID: String
    let moduleVersion: String
    let operationID: String
    let action: NativeDataCoverageAction
    let phase: NativeDataCoveragePhase
    let tripID: String?
    let commandBytes: Data
    let actorID: String
    let sessionID: String
    let epoch: Int

    init(body: Data) throws {
        guard body.count <= 192_000 else { throw NativeDataError.invalidResponse }
        let w = NativeCommunityWire.self
        let v = try w.object(JSONSerialization.jsonObject(with: body), ["schemaVersion", "catalogVersion", "actorId", "sessionId", "mobileEpoch", "moduleId", "moduleVersion", "operationId", "action", "phase", "confirmed", "tripId", "commandBytes"])
        guard v["schemaVersion"] as? String == NativeDataCoverageWire.schema, v["catalogVersion"] as? String == NativeDataCoverageWire.catalog,
              try w.bool(v["confirmed"]), let action = NativeDataCoverageAction(rawValue: try w.text(v["action"], max: 6)),
              let phase = NativeDataCoveragePhase(rawValue: try w.text(v["phase"], max: 7)) else { throw NativeDataError.invalidResponse }
        self.body = body; self.action = action; self.phase = phase
        moduleID = try w.text(v["moduleId"], max: 40); moduleVersion = try w.text(v["moduleVersion"], max: 80)
        guard NativeDataCoverageWire.moduleIDs.contains(moduleID) else { throw NativeDataError.invalidResponse }
        operationID = try w.id(v["operationId"]); actorID = try w.id(v["actorId"]); sessionID = try w.id(v["sessionId"])
        epoch = try w.integer(v["mobileEpoch"], max: 9_007_199_254_740_991, minimum: 1)
        tripID = try w.optional(v["tripId"], w.id)
        let text = try w.text(v["commandBytes"], max: 150_000)
        guard text.utf8.count <= 150_000, let inner = try JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any] else { throw NativeDataError.invalidResponse }
        commandBytes = Data(text.utf8)
        if let id = inner["operationId"] { guard try w.id(id) == operationID else { throw NativeDataError.invalidResponse } }
        if let id = inner["requestId"] { guard try w.id(id) == operationID else { throw NativeDataError.invalidResponse } }
        // Mutation authority remains the original module's closed parser and handler.
        // This layer forbids endpoint/RPC/lease selectors and binds the raw bytes to the displayed scope.
        guard !inner.keys.contains(where: { ["endpoint", "rpc", "leaseId", "ownerId", "actorId"].contains($0) }) else { throw NativeDataError.invalidResponse }
    }

    init(module: NativeDataCoverageModule, actor: NativeCommunitySafetyActor, operationID: String,
         action: NativeDataCoverageAction, phase: NativeDataCoveragePhase = .execute, tripID: String? = nil, commandBytes: Data) throws {
        guard module.location == .server, let text = String(data: commandBytes, encoding: .utf8) else { throw NativeDataError.invalidResponse }
        try self.init(body: NativeCommunityWire.bytes(["schemaVersion": NativeDataCoverageWire.schema, "catalogVersion": NativeDataCoverageWire.catalog,
            "actorId": actor.scope.subject.lowercased(), "sessionId": actor.sessionID, "mobileEpoch": actor.scope.mobileEpoch,
            "moduleId": module.id, "moduleVersion": module.version, "operationId": operationID, "action": action.rawValue,
            "phase": phase.rawValue, "confirmed": true, "tripId": tripID as Any? ?? NSNull(), "commandBytes": text]))
    }

    func matches(_ actor: NativeCommunitySafetyActor) -> Bool {
        actorID == actor.scope.subject.lowercased() && sessionID == actor.sessionID && epoch == actor.scope.mobileEpoch
    }

    /// The registry builds the original read-operation envelope. Frozen module bytes never change.
    func recovery() throws -> Self {
        guard phase == .execute,
              var v = try JSONSerialization.jsonObject(with: body) as? [String: Any] else { throw NativeDataError.invalidResponse }
        v["phase"] = NativeDataCoveragePhase.recover.rawValue
        return try .init(body: NativeCommunityWire.bytes(v))
    }
}

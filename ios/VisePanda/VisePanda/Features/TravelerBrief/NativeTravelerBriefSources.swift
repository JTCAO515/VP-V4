import Foundation

/// Current owner metadata only. Audit availability and active sharing do not grant or remove cleanup authority.
struct NativeTravelerBriefOwnerState: Equatable {
    let caseID: String
    let ownerID: String
    let recipientID: String?
    let grantRevision: Int
    let briefRevision: Int
    let state: String
    init(raw: Any, actor: NativeDataScope, caseID: String) throws {
        let w = NativeTravelerBriefWire.self
        let v = try w.object(raw, keys: ["schemaVersion", "kind", "caseId", "ownerId", "recipientId", "grantRevision", "briefRevision", "state"])
        guard v["schemaVersion"] as? String == w.version, v["kind"] as? String == "owner_state",
              try w.uuid(v["caseId"]) == caseID, try w.uuid(v["ownerId"]) == actor.subject.lowercased(),
              let state = v["state"] as? String, ["absent", "shared", "withdrawn", "deleted", "invalidated"].contains(state) else { throw NativeDataError.invalidResponse }
        self.caseID = caseID; ownerID = actor.subject.lowercased()
        recipientID = v["recipientId"] is NSNull ? nil : try w.uuid(v["recipientId"])
        guard recipientID != ownerID else { throw NativeDataError.invalidResponse }
        grantRevision = try w.integer(v["grantRevision"]); briefRevision = try w.integer(v["briefRevision"])
        guard (state == "absent") == (briefRevision == 0) else { throw NativeDataError.invalidResponse }
        self.state = state
    }
}

struct NativeTravelerBriefSources: Equatable {
    struct Intake: Equatable {
        let messageID: String
        let revision: Int
        let updatedAt: Double
        let fields: [NativeTravelerBriefField]
    }
    let caseID: String
    let ownerID: String
    let recipientID: String
    let grantRevision: Int
    let expiresAt: Double
    let profilePace: NativeTravelerBriefField?
    let memories: [NativeTravelerBriefField]
    let intake: Intake?

    init(raw: Any, actor: NativeDataScope, caseID: String) throws {
        let w = NativeTravelerBriefWire.self
        let v = try w.object(raw, keys: ["schemaVersion", "kind", "caseId", "ownerId", "recipientId", "grantRevision", "expiresAt", "profilePace", "memories", "memoryScope", "intake"])
        guard v["schemaVersion"] as? String == w.version, v["kind"] as? String == "source_options",
              v["memoryScope"] as? String == "latest_three_preferences", try w.uuid(v["caseId"]) == caseID,
              try w.uuid(v["ownerId"]) == actor.subject.lowercased() else { throw NativeDataError.invalidResponse }
        self.caseID = caseID; ownerID = actor.subject.lowercased(); recipientID = try w.uuid(v["recipientId"])
        guard ownerID != recipientID else { throw NativeDataError.invalidResponse }
        grantRevision = try w.integer(v["grantRevision"]); expiresAt = try w.timestamp(v["expiresAt"])
        profilePace = v["profilePace"] is NSNull ? nil : try NativeTravelerBriefField.decode(v["profilePace"] as Any)
        if let profilePace {
            guard profilePace.available, profilePace.field == "travel_pace", profilePace.source?.kind == "profile_pace", profilePace.source?.id == ownerID else { throw NativeDataError.invalidResponse }
        }
        guard let rows = v["memories"] as? [Any], rows.count <= 3 else { throw NativeDataError.invalidResponse }
        memories = try rows.map(NativeTravelerBriefField.decode)
        guard Set(memories.map(\.key)).count == memories.count, memories.allSatisfy({ $0.field == "preference" && $0.available }) else { throw NativeDataError.invalidResponse }
        if v["intake"] is NSNull { intake = nil }
        else {
            let i = try w.object(v["intake"], keys: ["messageId", "revision", "updatedAt", "fields"])
            let id = try w.uuid(i["messageId"]), revision = try w.integer(i["revision"]), updated = try w.timestamp(i["updatedAt"])
            guard let fields = i["fields"] as? [Any], fields.count <= 3 else { throw NativeDataError.invalidResponse }
            let decoded = try fields.map(NativeTravelerBriefField.decode)
            guard Set(decoded.map(\.key)).count == decoded.count,
                  decoded.allSatisfy({ $0.available && ["travel_pace", "budget", "requirements"].contains($0.field) && $0.source?.kind == "intake" && $0.source?.id == id && $0.source?.revision == revision && $0.source?.updatedAt == updated }) else { throw NativeDataError.invalidResponse }
            intake = .init(messageID: id, revision: revision, updatedAt: updated, fields: decoded)
        }
    }

    func previewBody(includePace: Bool, memoryKeys: Set<String>, includeIntake: Bool) throws -> Data {
        guard (!includePace || profilePace != nil), memoryKeys.isSubset(of: Set(memories.map(\.key))), !includeIntake || intake != nil else { throw NativeDataError.invalidResponse }
        let rows = try memories.filter { memoryKeys.contains($0.key) }.map { field -> [String: Any] in
            guard let source = field.source else { throw NativeDataError.invalidResponse }; return ["id": source.id, "revision": source.revision]
        }
        let intakeID: Any
        if includeIntake { guard let intake else { throw NativeDataError.invalidResponse }; intakeID = intake.messageID }
        else { intakeID = NSNull() }
        return try NativeTravelerBriefWire.bytes(["action": "preview", "caseId": caseID, "recipientId": recipientID, "grantRevision": grantRevision,
                                                  "sources": ["profilePace": includePace, "memories": rows, "intakeMessageId": intakeID]])
    }
}

struct NativeTravelerBriefAudit {
    struct Event: Identifiable {
        let id: String
        let revision: Int
        let actorID: String
        let action: String
        let recipientID: String?
        let grantRevision: Int
        let fieldKeys: [String]
        let createdAt: Double
    }
    let revision: Int
    let events: [Event]
    static func event(_ raw: Any) throws -> Event {
        let w = NativeTravelerBriefWire.self
        let v = try w.object(raw, keys: ["eventId", "revision", "actorId", "action", "recipientId", "grantRevision", "fieldKeys", "createdAt"])
        guard let action = v["action"] as? String, ["previewed", "shared", "withdrawn", "deleted", "read", "invalidated"].contains(action),
              let keys = v["fieldKeys"] as? [Any], keys.count <= 7 else { throw NativeDataError.invalidResponse }
        let fields = try keys.map(w.key)
        guard Set(fields).count == fields.count else { throw NativeDataError.invalidResponse }
        return .init(id: try w.uuid(v["eventId"]), revision: try w.integer(v["revision"]), actorID: try w.uuid(v["actorId"]), action: action,
                     recipientID: v["recipientId"] is NSNull ? nil : try w.uuid(v["recipientId"]), grantRevision: try w.integer(v["grantRevision"]),
                     fieldKeys: fields, createdAt: try w.timestamp(v["createdAt"]))
    }
    init(raw: Any, actor: NativeDataScope, caseID: String) throws {
        let w = NativeTravelerBriefWire.self
        let v = try w.object(raw, keys: ["schemaVersion", "kind", "caseId", "ownerId", "revision", "events", "complete"])
        guard v["schemaVersion"] as? String == w.version, v["kind"] as? String == "audit", try w.uuid(v["caseId"]) == caseID,
              try w.uuid(v["ownerId"]) == actor.subject.lowercased(), try w.bool(v["complete"]),
              let rows = v["events"] as? [Any], rows.count <= 200 else { throw NativeDataError.invalidResponse }
        revision = try w.integer(v["revision"]); events = try rows.map(Self.event)
        guard Set(events.map(\.id)).count == events.count else { throw NativeDataError.invalidResponse }
    }
}

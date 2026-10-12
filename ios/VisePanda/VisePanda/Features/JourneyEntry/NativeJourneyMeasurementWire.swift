import Foundation
import CoreFoundation

/// Exact current Server acceptance/contract/protocol. No transport, restore
/// journal, caller actor, plaintext source content or lifecycle enablement here.
enum NativeJourneyMeasurementWire {
    typealias M = NativeJourneyMeasurement
    typealias A = NativeJourneyMeasurementAdmission
    struct Actor: Equatable { let ownerID: UUID; let sessionID: UUID; let mobileEpoch: Int }
    enum Invalid: Error { case wire }
    static let capabilities = ["receive", "aggregate", "export", "erase", "restoreFence", "purge"]
    static let ttl: Double = 30 * 86400000
    static func id(_ value: UUID) -> String { value.uuidString.lowercased() }
    static func source(_ attempt: A.Attempt) -> [String: Any] {
        switch attempt.anchor {
        case .task(let task): return ["kind": "service_task", "id": id(task), "revision": NSNull()]
        case .nativeEntry(let trip, let version, let medium):
            return ["kind": "native_entry", "logicalId": id(attempt.logicalID), "entry": "e2",
                "anchor": ["kind": "trip", "tripId": id(trip), "tripVersion": version, "medium": medium.rawValue]]
        case .goal(let goal):
            return ["kind": "native_entry", "logicalId": id(goal.goalID), "entry": "e3",
                "anchor": ["kind": "goal", "conversationId": id(goal.conversationID), "goalId": id(goal.goalID),
                    "goalVersion": goal.goalVersion, "parentMessageId": id(goal.parentMessageID), "inputSequence": goal.inputSequence]]
        }
    }
    static func entry(_ attempt: A.Attempt) -> M.Entry {
        switch attempt.anchor { case .task: return .e1; case .nativeEntry: return .e2; case .goal: return .e3 }
    }
    static func command(_ action: String, fields: [String: Any] = [:]) throws -> Data {
        let shapes: [String: Set<String>] = ["policy": [], "consent": ["operationId", "noticeVersion", "entries"],
            "withdraw": ["operationId", "consentId"], "admit": ["operationId", "consentId", "entry", "source", "clockOrigin"],
            "receive": ["consentId", "admissionId", "reportId", "source", "entry", "signal", "clock"],
            "aggregate": ["consentId", "entry"], "preview": ["operationId"],
            "erase": ["operationId", "sourceDigest", "previewDigest"], "recover": ["operationId", "mutationBytes"]]
        guard shapes[action] == Set(fields.keys) else { throw Invalid.wire }
        var value: [String: Any] = ["schemaVersion": M.schema, "purpose": M.purpose, "action": action]
        guard Set(fields.keys).isDisjoint(with: Set(value.keys)) else { throw Invalid.wire }
        value.merge(fields) { _, new in new }
        let bytes = try JSONSerialization.data(withJSONObject: value, options: .sortedKeys)
        guard bytes.count <= 8192 else { throw Invalid.wire }; return bytes
    }
    static func admission(_ attempt: A.Attempt, consentID: UUID) throws -> Data {
        guard attempt.anchor.valid else { throw Invalid.wire }
        switch attempt.anchor {
        case .task(let task): guard attempt.logicalID == task else { throw Invalid.wire }
        case .goal(let goal): guard attempt.logicalID == goal.goalID else { throw Invalid.wire }
        case .nativeEntry: break
        }
        let origin: [String: Any] = attempt.nativeStart == nil ? ["kind": "unknown"]
            : ["kind": "native_monotonic", "processId": id(attempt.process)]
        return try command("admit", fields: ["operationId": id(attempt.operationID), "consentId": id(consentID),
            "entry": entry(attempt).rawValue, "source": source(attempt), "clockOrigin": origin])
    }
    static func receive(_ envelope: M.Envelope, attempt: A.Attempt) throws -> Data {
        guard envelope.admission.entry == entry(attempt), attempt.anchor.valid else { throw Invalid.wire }
        var clock: [String: Any] = ["kind": "unknown"]
        if case .nativeElapsedMilliseconds(let value) = envelope.time {
            guard attempt.nativeStart != nil, attempt.process == envelope.processID, (0...Int(Int32.max)).contains(value) else { throw Invalid.wire }
            clock = ["kind": "local_elapsed", "processId": id(attempt.process), "elapsedMs": value]
        }
        return try command("receive", fields: ["consentId": id(envelope.consentID), "admissionId": id(envelope.admission.id),
            "reportId": id(envelope.reportID), "source": source(attempt), "entry": entry(attempt).rawValue,
            "signal": signal(envelope.signal), "clock": clock])
    }
    private static func artifact(_ value: M.Artifact) -> [String: Any] { ["id": id(value.id), "revision": value.revision] }
    private static func outcome(_ value: M.Outcome) -> String { value == .technicalFailure ? "technical_failure" : value.rawValue }
    static func signal(_ value: M.Signal) -> [String: Any] {
        switch value {
        case .accepted: return ["kind": "accepted"]
        case .zeroQuestions: return ["kind": "zero_questions"]
        case .serverReady(let ref): return ["kind": "server_ready", "artifact": artifact(ref)]
        case .presented(let ref, let result): return ["kind": "presented", "artifact": artifact(ref), "outcome": outcome(result)]
        case .writer(let receipt):
            let names: [M.Writer: String] = [.directionsSelected: "directions_selected", .directionsSaved: "directions_saved",
                .decisionChosen: "decision_chosen", .tripConfirmed: "trip_confirmed"]
            return ["kind": "writer", "artifact": artifact(receipt.artifact), "writer": names[receipt.writer]!, "operationId": id(receipt.operationID)]
        case .declined(let ref, let reason):
            let names: [M.DeclineReason: String] = [.notUseful: "not_useful", .changedNeed: "changed_need", .other: "other", .unspecified: "unspecified"]
            return ["kind": "declined", "artifact": artifact(ref), "reason": names[reason]!]
        case .terminal(let result): return ["kind": "terminal", "outcome": outcome(result)]
        case .question(let field, let basis, let questionID):
            let names: [M.QuestionBasis: String] = [.alreadyKnownApplicable: "already_known_applicable", .genuinelyMissing: "genuinely_missing",
                .userChanged: "user_changed", .sourceConflict: "source_conflict", .unknown: "unknown"]
            return ["kind": "question", "field": field.rawValue, "basis": names[basis]!, "questionId": id(questionID)]
        }
    }
    static func object(_ raw: Any?, keys: Set<String>) throws -> [String: Any] {
        guard let value = raw as? [String: Any], Set(value.keys) == keys else { throw Invalid.wire }; return value
    }
    static func number(_ raw: Any?, minimum: Double = 0, maximum: Double = 9007199254740991) throws -> Double {
        guard let n = raw as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(), n.doubleValue.isFinite,
              n.doubleValue.rounded() == n.doubleValue, n.doubleValue >= minimum, n.doubleValue <= maximum else { throw Invalid.wire }
        return n.doubleValue
    }
    static func boolean(_ raw: Any?) throws -> Bool {
        guard let value = raw as? NSNumber, CFGetTypeID(value) == CFBooleanGetTypeID() else { throw Invalid.wire }
        return value.boolValue
    }
    static func retained(_ value: [String: Any], now: Double) throws {
        let received = try number(value["receivedAt"], minimum: 1), expiry = try number(value["expiresAt"], minimum: 1)
        guard now.isFinite, received <= now, expiry > now, expiry > received, expiry <= received + ttl else { throw Invalid.wire }
    }
    static func response(_ bytes: Data, action: String, actor: Actor, additional: Set<String>, now: Double) throws -> [String: Any] {
        guard bytes.count <= 65536, now.isFinite, actor.mobileEpoch > 0 else { throw Invalid.wire }
        let root = try object(JSONSerialization.jsonObject(with: bytes), keys: action == "policy" ? ["data", "notice"] : ["data"])
        let value = try object(root["data"], keys: additional.union(["schemaVersion", "purpose", "kind", "ownerId", "sessionId", "mobileEpoch"]))
        guard value["schemaVersion"] as? String == M.schema, value["purpose"] as? String == M.purpose,
              value["ownerId"] as? String == id(actor.ownerID), value["sessionId"] as? String == id(actor.sessionID),
              try number(value["mobileEpoch"], minimum: 1) == Double(actor.mobileEpoch) else { throw Invalid.wire }
        if action == "policy" {
            let notice = try object(root["notice"], keys: ["schemaVersion", "purpose", "noticeVersion", "retentionMs", "zh", "en"])
            guard notice["schemaVersion"] as? String == M.schema, notice["purpose"] as? String == M.purpose,
                  notice["noticeVersion"] as? String == M.noticeVersion, try number(notice["retentionMs"]) == ttl,
                  (notice["zh"] as? String)?.isEmpty == false, (notice["en"] as? String)?.isEmpty == false else { throw Invalid.wire }
        }
        return value
    }
    static func uuid(_ raw: Any?) throws -> UUID {
        guard let s = raw as? String, NativeJourneyGoalReturnWire.canonicalUUID(s), let id = UUID(uuidString: s) else { throw Invalid.wire }; return id
    }
    static func entries(_ raw: Any?) throws -> [M.Entry] {
        guard let raw = raw as? [String], !raw.isEmpty, raw.count <= 3 else { throw Invalid.wire }
        let values = try raw.map { s in guard let e = M.Entry(rawValue: s) else { throw Invalid.wire }; return e }
        guard values == [.e1, .e2, .e3].filter(values.contains) else { throw Invalid.wire }; return values
    }
    struct PolicyRead {
        let enabled: Bool
        let consentID: UUID?
        let entries: [M.Entry]
        let capturedAt: Double
        let expiresAt: Double
        // A true policy bit is NOT independently live K1/whole-lifecycle proof.
        // Actual protected lifecycle source must also qualify before configure.
    }
    static func policy(_ bytes: Data, actor: Actor, now: Double) throws -> PolicyRead {
        let v = try response(bytes, action: "policy", actor: actor,
            additional: ["enabled", "noticeVersion", "capabilities", "capturedAt", "expiresAt", "consent"], now: now)
        let enabled = try boolean(v["enabled"])
        guard v["kind"] as? String == "policy",
              v["noticeVersion"] as? String == M.noticeVersion, v["capabilities"] as? [String] == capabilities else { throw Invalid.wire }
        let captured = try number(v["capturedAt"], minimum: 1), expires = try number(v["expiresAt"], minimum: 1)
        guard captured <= now, expires == captured + 20000, expires > now else { throw Invalid.wire }
        if v["consent"] is NSNull { return .init(enabled: enabled, consentID: nil, entries: [], capturedAt: captured, expiresAt: expires) }
        let c = try object(v["consent"], keys: ["id", "entries", "noticeVersion", "receivedAt", "expiresAt"])
        guard c["noticeVersion"] as? String == M.noticeVersion else { throw Invalid.wire }
        try retained(c, now: now)
        return .init(enabled: enabled, consentID: try uuid(c["id"]), entries: try entries(c["entries"]), capturedAt: captured, expiresAt: expires)
    }
    static func consent(_ bytes: Data, actor: Actor, operation: UUID, expectedEntries: [M.Entry], now: Double) throws -> UUID {
        let v = try response(bytes, action: "consent", actor: actor,
            additional: ["operationId", "consentId", "noticeVersion", "entries", "receivedAt", "expiresAt", "reused"], now: now)
        guard v["kind"] as? String == "consent", try uuid(v["operationId"]) == operation,
              v["noticeVersion"] as? String == M.noticeVersion, try entries(v["entries"]) == expectedEntries,
              (try? boolean(v["reused"])) != nil else { throw Invalid.wire }
        try retained(v, now: now); return try uuid(v["consentId"])
    }
    struct Ticket { let id: UUID; let firstEver: String; let authority: String; let admittedAt: Double?; let expiresAt: Double }
    static func ticket(_ bytes: Data, actor: Actor, attempt: A.Attempt, consent: UUID, now: Double) throws -> Ticket {
        let v = try response(bytes, action: "admit", actor: actor,
            additional: ["operationId", "consentId", "admissionId", "entry", "source", "clockOrigin", "authority", "admittedAt", "firstEver", "receivedAt", "expiresAt", "reused"], now: now)
        let expected = try object(JSONSerialization.jsonObject(with: admission(attempt, consentID: consent)),
            keys: ["schemaVersion", "purpose", "action", "operationId", "consentId", "entry", "source", "clockOrigin"])
        guard v["kind"] as? String == "admission", try uuid(v["operationId"]) == attempt.operationID,
              try uuid(v["consentId"]) == consent, v["entry"] as? String == entry(attempt).rawValue,
              try JSONSerialization.data(withJSONObject: v["source"] as Any, options: .sortedKeys) == JSONSerialization.data(withJSONObject: expected["source"] as Any, options: .sortedKeys),
              try JSONSerialization.data(withJSONObject: v["clockOrigin"] as Any, options: .sortedKeys) == JSONSerialization.data(withJSONObject: expected["clockOrigin"] as Any, options: .sortedKeys),
              let first = v["firstEver"] as? String, ["proven", "unknown"].contains(first), (try? boolean(v["reused"])) != nil else { throw Invalid.wire }
        let authority: String, at: Double?
        if case .task = attempt.anchor {
            authority = "service_task"; at = try number(v["admittedAt"], minimum: 1)
            guard at! <= now else { throw Invalid.wire }
        } else {
            authority = "authenticated_native_acceptance_report"; at = nil
            guard v["admittedAt"] is NSNull else { throw Invalid.wire }
        }
        guard v["authority"] as? String == authority else { throw Invalid.wire }
        try retained(v, now: now)
        return .init(id: try uuid(v["admissionId"]), firstEver: first, authority: authority, admittedAt: at,
            expiresAt: try number(v["expiresAt"], minimum: 1))
    }
    static func received(_ bytes: Data, actor: Actor, envelope: M.Envelope, now: Double) throws {
        let v = try response(bytes, action: "receive", actor: actor,
            additional: ["reportId", "admissionId", "consentId", "state", "receivedAt", "expiresAt", "reused"], now: now)
        guard v["kind"] as? String == "received", try uuid(v["reportId"]) == envelope.reportID,
              try uuid(v["admissionId"]) == envelope.admission.id, try uuid(v["consentId"]) == envelope.consentID,
              v["state"] as? String == "recorded", (try? boolean(v["reused"])) != nil else { throw Invalid.wire }
        try retained(v, now: now)
    }
}

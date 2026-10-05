import Foundation

/// Direct column mirror of the sole producer; unexpected or missing fields,
/// foreign owners and broken outbox/attempt/source relationships fail closed.
enum NativeNotificationDataRows {
    private indirect enum Rule {
        case id, hash, timestamp, positive, natural, text, boolean, source, quiet, zone, outcome, receipt, token, topic
        case one([String]), nullable(Rule)
    }
    private static let actions = ["schedule", "watch", "cancel", "complete", "dismiss", "unwatch", "register_device", "revoke_device"]
    private static let status = ["saved", "cancelled", "completed"]
    private static let tables: [String: [String: Rule]] = [
        "reminders": ["id": .id, "owner_id": .id, "trip_id": .id, "user_reminder_id": .nullable(.id), "operation_id": .id,
            "session_id": .id, "epoch": .positive, "base_version": .natural, "purpose": .one(["user_set_travel", "accepted_task_result", "qualified_watch"]),
            "source": .source, "reason": .nullable(.text), "due_at": .timestamp, "expires_at": .timestamp, "time_zone": .zone,
            "quiet_hours": .quiet, "consent_at": .timestamp, "status": .one(status), "revision": .positive, "created_at": .timestamp],
        "watches": ["id": .id, "owner_id": .id, "trip_id": .id, "session_id": .id, "epoch": .positive, "base_version": .natural,
            "source": .source, "baseline_digest": .hash, "expires_at": .timestamp, "time_zone": .zone, "quiet_hours": .quiet,
            "consent_at": .timestamp, "status": .one(["active", "cancelled"]), "stop_reason": .nullable(.one(["user", "source_unavailable", "recheck"])),
            "revision": .positive, "next_check_at": .timestamp],
        "dismissals": ["owner_id": .id, "trip_id": .id, "next_step_id": .id, "source_kind": .one(["current_trip", "user_reminder", "task_result", "qualified_watch"]),
            "source_id": .id, "semantic_digest": .hash, "created_at": .timestamp],
        "outbox": ["id": .id, "reminder_id": .id, "device_id": .nullable(.id), "device_revision": .nullable(.positive),
            "recheck_receipt_id": .nullable(.id), "recheck_review_digest": .nullable(.hash),
            "state": .one(["scheduled", "suppressed", "attempting", "accepted", "unknown", "error"]), "outcome": .nullable(.outcome),
            "watch_id": .nullable(.id), "semantic_digest": .nullable(.hash), "created_at": .timestamp],
        "attempts": ["notification_id": .id, "attempt_id": .id, "device_id": .id, "device_revision": .positive,
            "state": .one(["attempting", "accepted", "unknown", "error"]), "outcome": .nullable(.outcome), "authorized_at": .timestamp, "lease_expires_at": .timestamp],
        "operations": ["owner_id": .id, "operation_id": .id, "trip_id": .id, "action": .one(actions), "request_digest": .hash, "receipt": .receipt, "created_at": .timestamp],
        "travelReminders": ["id": .id, "owner_id": .id, "trip_id": .id, "session_id": .id, "base_version": .natural, "reason": .text,
            "due_at": .timestamp, "expires_at": .timestamp, "time_zone": .zone, "purpose": .one(["user_set_travel"]), "consent_at": .timestamp,
            "status": .one(status), "created_at": .timestamp],
        "device": ["id": .id, "owner_id": .id, "session_id": .id, "epoch": .positive, "revision": .positive, "token": .token,
            "environment": .one(["sandbox", "production"]), "topic": .topic, "permission": .one(["authorized", "denied", "not_determined"]),
            "time_zone": .zone, "active": .boolean, "updated_at": .timestamp]
    ]
    private static let tripTables = ["reminders", "watches", "dismissals", "outbox", "attempts", "operations", "travelReminders"]
    private static let w = NativeCommunityWire.self

    static func parse(_ raw: Any, binding: NativeNotificationDataBinding, now: Date) throws -> NativeNotificationDataItem {
        guard let row = raw as? [String: Any] else { throw NativeDataError.invalidResponse }
        let id = try NativeNotificationDataCommand.id(row["objectId"])
        guard binding.objectIDs.contains(id) else { throw NativeDataError.invalidResponse }
        var parsed: [String: [[String: Any]]] = [:]
        switch binding.scope {
        case .trip:
            _ = try w.object(row, Set(["objectId", "fences"] + tripTables))
            for name in tripTables { parsed[name] = try table(name, raw: row[name], binding: binding, objectID: id) }
            let fences = try fenceRows(row["fences"])
            guard tripTables.reduce(0, { $0 + (parsed[$1]?.count ?? 0) }) + fences.count <= 10_000,
                  fences.allSatisfy({ $0["tripId"] as? String == id }) else { throw NativeDataError.invalidResponse }
            let reminders = parsed["reminders"] ?? [], watches = parsed["watches"] ?? [], outbox = parsed["outbox"] ?? []
            let reminderIDs = Set(reminders.compactMap { $0["id"] as? String })
            let watchIDs = Set(watches.compactMap { $0["id"] as? String })
            let travelIDs = Set((parsed["travelReminders"] ?? []).compactMap { $0["id"] as? String })
            for o in outbox {
                guard reminderIDs.contains(o["reminder_id"] as? String ?? ""),
                      o["watch_id"] is NSNull || watchIDs.contains(o["watch_id"] as? String ?? "") else { throw NativeDataError.invalidResponse }
            }
            for r in reminders {
                guard r["user_reminder_id"] is NSNull || travelIDs.contains(r["user_reminder_id"] as? String ?? "") else { throw NativeDataError.invalidResponse }
            }
            for a in parsed["attempts"] ?? [] {
                guard outbox.contains(where: { same($0["id"], a["notification_id"]) && same($0["device_id"], a["device_id"]) && same($0["device_revision"], a["device_revision"]) }) else { throw NativeDataError.invalidResponse }
            }
        case .device:
            _ = try w.object(row, ["objectId", "device", "outbox", "attempts", "fences"])
            var deviceCount = 0
            if !(row["device"] is NSNull) {
                let device = try fields(row["device"], rules: tables["device"]!)
                guard device["id"] as? String == id, device["owner_id"] as? String == binding.ownerID else { throw NativeDataError.invalidResponse }
                deviceCount = 1
            }
            let outbox = try table("outbox", raw: row["outbox"], binding: binding, objectID: id)
            let attempts = try table("attempts", raw: row["attempts"], binding: binding, objectID: id)
            let fences = try fenceRows(row["fences"])
            guard outbox.count + attempts.count + fences.count + deviceCount <= 10_000 else { throw NativeDataError.invalidResponse }
            for o in outbox { guard o["device_id"] as? String == id else { throw NativeDataError.invalidResponse } }
            for a in attempts {
                guard a["device_id"] as? String == id, outbox.contains(where: { same($0["id"], a["notification_id"]) && same($0["device_revision"], a["device_revision"]) }) else { throw NativeDataError.invalidResponse }
            }
        case .progress:
            _ = try w.object(row, ["objectId", "scope", "objectIds", "sourceDigest", "previewDigest", "requestDigest", "state", "capturedAt", "expiresAt", "decidedAt", "pages", "rows", "progressErased", "receipt", "fences"])
            guard NativeNotificationDataScope(rawValue: row["scope"] as? String ?? "") != nil,
                  let ids = row["objectIds"] as? [String], !ids.isEmpty, ids.count <= 20, ids == ids.sorted(), Set(ids).count == ids.count,
                  ["previewed", "exporting", "exported", "erased", "expired"].contains(row["state"] as? String ?? "") else { throw NativeDataError.invalidResponse }
            for object in ids { _ = try NativeNotificationDataCommand.id(object) }
            _ = try w.hash(row["sourceDigest"]); _ = try w.hash(row["previewDigest"])
            _ = try w.optional(row["requestDigest"], w.hash)
            let captured = try w.integer(row["capturedAt"], max: 9_007_199_254_740_991)
            let expiry = try w.integer(row["expiresAt"], max: 9_007_199_254_740_991)
            let decided = try w.optional(row["decidedAt"], { try w.integer($0, max: 9_007_199_254_740_991) })
            guard expiry == captured + 30_000, decided == nil || decided! >= captured else { throw NativeDataError.invalidResponse }
            _ = try w.integer(row["pages"], max: 4, minimum: 0); _ = try w.integer(row["rows"], max: 20, minimum: 0)
            _ = try w.bool(row["progressErased"]); _ = try fenceRows(row["fences"])
            if !(row["receipt"] is NSNull) {
                guard let receipt = row["receipt"] as? [String: Any] else { throw NativeDataError.invalidResponse }
                let decoded = try NativeNotificationDataProtocol.retainedReceipt(receipt, actorOwner: binding.ownerID, now: now)
                guard decoded.requestID == id, decoded.scope.rawValue == row["scope"] as? String,
                      decoded.objectIDs == ids, decoded.sourceDigest == row["sourceDigest"] as? String,
                      decoded.previewDigest == row["previewDigest"] as? String,
                      receipt["requestDigest"] as? String == row["requestDigest"] as? String,
                      row["state"] as? String == "erased" else { throw NativeDataError.invalidResponse }
            }
        }
        let displayed = try row.keys.sorted().map { name -> NativeNotificationDataField in
            let bytes = try JSONSerialization.data(withJSONObject: row[name] as Any, options: [.fragmentsAllowed, .sortedKeys, .prettyPrinted, .withoutEscapingSlashes])
            guard let value = String(data: bytes, encoding: .utf8) else { throw NativeDataError.invalidResponse }
            return .init(name: name, value: value)
        }
        return .init(id: id, fields: displayed)
    }

    static func fenceRows(_ raw: Any?) throws -> [[String: Any]] {
        let rules: [String: Rule] = ["kind": .one(["reminder", "watch", "dismissal", "operation", "outbox", "attempt", "device", "exit_request"]),
            "objectId": .id, "tripId": .nullable(.id), "requestId": .id, "requestDigest": .nullable(.hash), "erasedAt": .positive]
        let values = try w.rows(raw, max: 10_000) { try fields($0, rules: rules) }
        var previous = ""
        for value in values {
            let key = (value["kind"] as? String ?? "") + ":" + (value["objectId"] as? String ?? "")
            guard key > previous else { throw NativeDataError.invalidResponse }; previous = key
        }
        return values
    }
    private static func table(_ name: String, raw: Any?, binding: NativeNotificationDataBinding, objectID: String) throws -> [[String: Any]] {
        guard let rules = tables[name] else { throw NativeDataError.invalidResponse }
        let values = try w.rows(raw, max: 10_000) { try fields($0, rules: rules) }
        var previous = ""
        for row in values {
            if row.keys.contains("owner_id"), row["owner_id"] as? String != binding.ownerID { throw NativeDataError.invalidResponse }
            if row.keys.contains("trip_id"), row["trip_id"] as? String != objectID { throw NativeDataError.invalidResponse }
            let keyName = name == "operations" ? "operation_id" : name == "attempts" ? "notification_id" : "id"
            let key = name == "dismissals" ? ["source_kind", "source_id", "semantic_digest"].map { row[$0] as? String ?? "" }.joined(separator: ":") : row[keyName] as? String ?? ""
            guard key > previous else { throw NativeDataError.invalidResponse }; previous = key
            if name == "operations" {
                guard let receipt = row["receipt"] as? [String: Any], same(receipt["operationId"], row["operation_id"]),
                      same(receipt["action"], row["action"]), same(receipt["requestDigest"], row["request_digest"]) else { throw NativeDataError.invalidResponse }
            }
            if name == "attempts" {
                let authorized = try instant(row["authorized_at"]), expires = try instant(row["lease_expires_at"])
                guard expires > authorized, expires.timeIntervalSince(authorized) <= 5 else { throw NativeDataError.invalidResponse }
            }
        }
        return values
    }
    private static func same(_ a: Any?, _ b: Any?) -> Bool {
        guard let a = a as? NSObject, let b = b as? NSObject else { return false }; return a == b
    }
    private static func fields(_ raw: Any?, rules: [String: Rule]) throws -> [String: Any] {
        let v = try w.object(raw as Any, Set(rules.keys))
        for (name, rule) in rules { try check(v[name], rule: rule) }
        return v
    }
    private static func instant(_ raw: Any?) throws -> Date {
        let text = try w.text(raw, max: 64)
        guard let date = NativeNotificationWire.date(text) else { throw NativeDataError.invalidResponse }; return date
    }
    private static func check(_ raw: Any?, rule: Rule) throws {
        switch rule {
        case .id: _ = try NativeNotificationDataCommand.id(raw)
        case .hash: _ = try w.hash(raw)
        case .timestamp: _ = try instant(raw)
        case .positive: _ = try w.integer(raw, max: 9_007_199_254_740_991)
        case .natural: _ = try w.integer(raw, max: 9_007_199_254_740_991, minimum: 0)
        case .text: _ = try w.text(raw, max: 512, empty: true)
        case .boolean: _ = try w.bool(raw)
        case .nullable(let inner): guard let raw else { throw NativeDataError.invalidResponse }; if !(raw is NSNull) { try check(raw, rule: inner) }
        case .one(let values): guard let text = raw as? String, values.contains(text) else { throw NativeDataError.invalidResponse }
        case .zone: guard let zone = raw as? String, zone.utf16.count <= 100, TimeZone(identifier: zone) != nil else { throw NativeDataError.invalidResponse }
        case .source:
            let source = try fields(raw, rules: ["kind": .one(["current_trip", "user_reminder", "task_result", "qualified_watch"]), "sourceId": .id, "revision": .natural, "contentDigest": .hash])
            _ = try w.integer(source["revision"], max: 2_147_483_647, minimum: 0)
        case .quiet:
            let v = try w.object(raw as Any, ["startMinute", "endMinute"])
            _ = try w.integer(v["startMinute"], max: 1439, minimum: 0); _ = try w.integer(v["endMinute"], max: 1439, minimum: 0)
        case .outcome:
            guard let row = raw as? [String: Any] else { throw NativeDataError.invalidResponse }
            switch row["kind"] as? String {
            case "accepted": _ = try fields(raw, rules: ["kind": .one(["accepted"]), "apnsId": .id, "acceptedAt": .timestamp])
            case "unknown": _ = try fields(raw, rules: ["kind": .one(["unknown"]), "code": .one(["ACK_UNKNOWN"])])
            case "error": _ = try fields(raw, rules: ["kind": .one(["error"]), "code": .one(["TOKEN_REVOKED", "PROVIDER_REJECTED", "TRANSPORT_UNAVAILABLE"])])
            default: throw NativeDataError.invalidResponse
            }
        case .receipt:
            let v = try fields(raw, rules: ["operationId": .id, "action": .one(actions), "requestDigest": .hash, "resultId": .id, "revision": .natural, "terminal": .boolean, "outcome": .one(["applied", "cancelled"])])
            guard try w.bool(v["terminal"]) else { throw NativeDataError.invalidResponse }
        case .token:
            guard let token = raw as? String, token.utf8.count % 2 == 0, token.range(of: "^[a-f0-9]{2,512}$", options: .regularExpression) != nil else { throw NativeDataError.invalidResponse }
        case .topic:
            guard let topic = raw as? String, topic.range(of: "^[A-Za-z0-9.-]{1,200}$", options: .regularExpression) != nil else { throw NativeDataError.invalidResponse }
        }
    }
}

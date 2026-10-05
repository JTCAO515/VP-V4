import Foundation

/// Sole TS coverage-module-export/1 wire; row projection reuses the existing Notification/Lifecycle value contracts.
struct NativeDataCoverageOwnerBundle {
    let bytes: Data
    let expiresAt: Date
    init(bytes: Data, actor: NativeCommunitySafetyActor, command: NativeDataCoverageCommand, now: Date = Date()) throws {
        let w = NativeCommunityWire.self
        guard bytes.count <= 1_000_000, command.action == .export else { throw NativeDataError.invalidResponse }
        let outer = try w.object(JSONSerialization.jsonObject(with: bytes), ["data"])
        let v = try w.object(outer["data"] as Any, ["schemaVersion", "kind", "requestId", "scope", "ownerId", "sessionId", "mobileEpoch", "sourceDigest", "capturedAt", "expiresAt", "allUserDataCompleted", "sections", "limits", "proof"])
        let notifications = command.moduleID == "notifications"
        guard notifications || command.moduleID == "lifecycle",
              v["schemaVersion"] as? String == "coverage-module-export/1", v["kind"] as? String == "bundle",
              v["scope"] as? String == (notifications ? "notification-metadata/1" : "trip-lifecycle-metadata/1"),
              try w.id(v["requestId"]) == command.operationID, try w.id(v["ownerId"]) == actor.scope.subject.lowercased(),
              try w.id(v["sessionId"]) == actor.sessionID, try w.integer(v["mobileEpoch"], max: 9_007_199_254_740_991) == actor.scope.mobileEpoch,
              try !w.bool(v["allUserDataCompleted"]) else { throw NativeDataError.invalidResponse }
        _ = try w.hash(v["sourceDigest"])
        let captured = try w.integer(v["capturedAt"], max: 9_007_199_254_740_991), expiry = try w.integer(v["expiresAt"], max: 9_007_199_254_740_991)
        guard expiry == captured + 30_000, Double(captured) <= now.timeIntervalSince1970 * 1000, Double(expiry) > now.timeIntervalSince1970 * 1000 else { throw NativeDataError.staleSessionResponse }
        expiresAt = Date(timeIntervalSince1970: Double(expiry) / 1000)
        let limits = try w.object(v["limits"] as Any, ["pageSize", "maxPages", "maxRows", "maxBytes"])
        let size = notifications ? 100 : 50, maxPages = notifications ? 100 : 400, maxRows = notifications ? 10_000 : 20_000
        guard try w.integer(limits["pageSize"], max: 100) == size, try w.integer(limits["maxPages"], max: 400) == maxPages,
              try w.integer(limits["maxRows"], max: 20_000) == maxRows, try w.integer(limits["maxBytes"], max: 1_000_000) == 1_000_000 else { throw NativeDataError.invalidResponse }
        let sections = try w.object(v["sections"] as Any, notifications ? ["notifications"] : ["trips", "operations"])
        var count = 0, pages = 0
        for key in sections.keys {
            guard let rows = sections[key] as? [Any], rows.count <= 10_000 else { throw NativeDataError.invalidResponse }
            let ids = try rows.map { row -> String in
                if key == "notifications" { return try NativeDataCoverageNotificationRow.key(row) }
                if key == "trips" {
                    let r = try w.object(row, ["tripId", "title", "headVersion", "state", "archivedVersion", "archivedAt"])
                    let trip = try JSONDecoder().decode(NativeTripLifecycleTrip.self, from: w.bytes(r))
                    guard trip.valid else { throw NativeDataError.invalidResponse }; return trip.id
                }
                return try NativeDataCoverageLifecycleRow.key(row, actor: actor)
            }
            guard ids == ids.sorted(), Set(ids).count == ids.count else { throw NativeDataError.invalidResponse }
            count += rows.count; pages += max(1, (rows.count + size - 1) / size)
        }
        let proof = try w.object(v["proof"] as Any, ["coverage", "pages", "rows"])
        guard proof["coverage"] as? String == "complete", count <= maxRows, pages <= maxPages,
              try w.integer(proof["rows"], max: maxRows, minimum: 0) == count, try w.integer(proof["pages"], max: maxPages) == pages else { throw NativeDataError.invalidResponse }
        self.bytes = try w.bytes(v)
    }
}

enum NativeDataCoverageNotificationRow {
    static func key(_ raw: Any) throws -> String {
        let w = NativeCommunityWire.self
        guard let v = raw as? [String: Any], let domain = v["domain"] as? String else { throw NativeDataError.invalidResponse }
        let key = try w.text(v["key"], max: 60), parts = key.split(separator: ":")
        guard parts.count == 2, String(parts[0]) == domain else { throw NativeDataError.invalidResponse }
        let id = try w.id(String(parts[1]))
        if domain == "device" {
            _ = try w.object(v, ["key", "domain", "deviceId", "revision", "permission", "active", "environment", "timeZone"])
            guard try w.id(v["deviceId"]) == id, ["authorized", "denied", "not_determined"].contains(v["permission"] as? String ?? ""),
                  ["sandbox", "production"].contains(v["environment"] as? String ?? "") else { throw NativeDataError.invalidResponse }
            _ = try w.bool(v["active"]); _ = try w.integer(v["revision"], max: 2_147_483_647); try zone(v["timeZone"])
            return key
        }
        _ = try w.id(v["tripId"])
        if domain == "dismissal" {
            _ = try w.object(v, ["key", "domain", "tripId", "id", "sourceKind", "sourceId", "semanticDigest"])
            guard try w.id(v["id"]) == id, ["current_trip", "user_reminder", "task_result", "qualified_watch"].contains(v["sourceKind"] as? String ?? "") else { throw NativeDataError.invalidResponse }
            _ = try w.id(v["sourceId"]); _ = try w.hash(v["semanticDigest"]); return key
        }
        if domain == "operation" {
            _ = try w.object(v, ["key", "domain", "tripId", "operationId", "action", "requestDigest", "receipt"])
            let receipt = try w.object(v["receipt"] as Any, ["operationId", "action", "requestDigest", "resultId", "revision", "terminal", "outcome"])
            guard try w.id(v["operationId"]) == id, try w.id(receipt["operationId"]) == id,
                  ["schedule", "watch", "cancel", "complete", "dismiss", "unwatch", "register_device", "revoke_device"].contains(v["action"] as? String ?? ""),
                  receipt["action"] as? String == v["action"] as? String, try w.hash(receipt["requestDigest"]) == w.hash(v["requestDigest"]),
                  try w.bool(receipt["terminal"]), ["applied", "cancelled"].contains(receipt["outcome"] as? String ?? "") else { throw NativeDataError.invalidResponse }
            _ = try w.id(receipt["resultId"]); _ = try w.integer(receipt["revision"], max: 2_147_483_647, minimum: 0); return key
        }
        let common: Set<String> = ["key", "domain", "tripId", "id", "source", "expiresAt", "timeZone", "quietHours", "consentAt", "status"]
        _ = try w.object(v, common.union(domain == "watch" ? ["baselineDigest"] : ["baseVersion", "purpose", "reason", "dueAt", "deliveryState", "outcome"]))
        guard try w.id(v["id"]) == id, ["watch", "reminder"].contains(domain) else { throw NativeDataError.invalidResponse }
        let source = try w.object(v["source"] as Any, ["kind", "sourceId", "revision", "contentDigest"])
        let decoded = try JSONDecoder().decode(NativeNoticeSource.self, from: w.bytes(source)); guard decoded.valid else { throw NativeDataError.invalidResponse }
        try date(v["expiresAt"]); try date(v["consentAt"]); try zone(v["timeZone"])
        let quiet = try w.object(v["quietHours"] as Any, ["startMinute", "endMinute"])
        guard try JSONDecoder().decode(NativeQuietHours.self, from: w.bytes(quiet)).valid else { throw NativeDataError.invalidResponse }
        if domain == "watch" {
            guard decoded.kind == "qualified_watch", ["active", "cancelled"].contains(v["status"] as? String ?? "") else { throw NativeDataError.invalidResponse }
            _ = try w.hash(v["baselineDigest"]); return key
        }
        _ = try w.integer(v["baseVersion"], max: 2_147_483_647, minimum: 0); try date(v["dueAt"])
        _ = try w.optional(v["reason"]) { try w.text($0, max: 240) }
        guard ["user_set_travel", "accepted_task_result", "qualified_watch"].contains(v["purpose"] as? String ?? ""),
              ["saved", "cancelled", "completed"].contains(v["status"] as? String ?? ""),
              ["scheduled", "suppressed", "attempting", "accepted", "unknown", "error"].contains(v["deliveryState"] as? String ?? "") else { throw NativeDataError.invalidResponse }
        if !(v["outcome"] is NSNull) {
            guard let outcome = v["outcome"] as? [String: Any], let kind = outcome["kind"] as? String else { throw NativeDataError.invalidResponse }
            _ = try w.object(outcome, kind == "accepted" ? ["kind", "apnsId", "acceptedAt"] : ["kind", "code"])
            let parsed = try JSONDecoder().decode(NativeDeliveryReceipt.Outcome.self, from: w.bytes(outcome)); guard parsed.valid else { throw NativeDataError.invalidResponse }
        }
        return key
    }
    private static func date(_ raw: Any?) throws { guard let value = raw as? String, NativeNotificationWire.date(value) != nil else { throw NativeDataError.invalidResponse } }
    private static func zone(_ raw: Any?) throws { guard let value = raw as? String, value.utf16.count <= 100, TimeZone(identifier: value) != nil else { throw NativeDataError.invalidResponse } }
}

enum NativeDataCoverageLifecycleRow {
    static func key(_ raw: Any, actor: NativeCommunitySafetyActor) throws -> String {
        let w = NativeCommunityWire.self, v = try w.object(raw, ["operationId", "sessionId", "receipt", "erasedReason"])
        let id = try w.id(v["operationId"])
        if !(v["erasedReason"] is NSNull) {
            guard ["FORBIDDEN", "MEMORY_CONFLICT"].contains(v["erasedReason"] as? String ?? ""), v["sessionId"] is NSNull, v["receipt"] is NSNull else { throw NativeDataError.invalidResponse }; return id
        }
        let session = try w.id(v["sessionId"])
        guard let receipt = v["receipt"] as? [String: Any], let status = receipt["status"] as? String else { throw NativeDataError.invalidResponse }
        let base: Set<String> = ["version", "ownerId", "sessionId", "operationId", "requestDigest", "action", "tripId", "status", "revision"]
        _ = try w.object(receipt, base.union(status == "declined" ? ["reason"] : ["state", "capacity", "archivedVersion", "archivedAt", "preference", "memoryRefs"]))
        guard receipt["version"] as? String == NativeTripLifecycleWire.version, try w.id(receipt["ownerId"]) == actor.scope.subject.lowercased(),
              try w.id(receipt["operationId"]) == id, try w.id(receipt["sessionId"]) == session,
              ["create", "activate", "reconcile", "archive"].contains(receipt["action"] as? String ?? "") else { throw NativeDataError.invalidResponse }
        _ = try w.id(receipt["tripId"]); _ = try w.hash(receipt["requestDigest"])
        _ = try w.integer(receipt["revision"], max: 9_007_199_254_740_990, minimum: status == "declined" ? 0 : 1)
        if status == "declined" {
            guard ["LIFECYCLE_CONFLICT", "TRIP_CAPACITY", "LEGACY_RECONCILIATION_REQUIRED", "STALE_TRIP_VERSION", "PROPOSAL_NOT_CONFIRMABLE", "MEMORY_CONFLICT", "IDEMPOTENCY_KEY_REUSE", "USER_ABANDONED"].contains(receipt["reason"] as? String ?? "") else { throw NativeDataError.invalidResponse }; return id
        }
        guard status == "applied" else { throw NativeDataError.invalidResponse }
        _ = try NativeTripLifecycleWire.capacity(receipt["capacity"])
        let refs = try w.rows(receipt["memoryRefs"], max: 100) { raw -> String in
            let r = try w.object(raw, ["memoryId", "revision", "sourceReceiptId", "consentId"])
            _ = try w.integer(r["revision"], max: 9_007_199_254_740_990); _ = try w.id(r["sourceReceiptId"]); _ = try w.id(r["consentId"]); return try w.id(r["memoryId"])
        }
        guard Set(refs).count == refs.count else { throw NativeDataError.invalidResponse }
        let action = receipt["action"] as? String, state = receipt["state"] as? String
        guard ["draft", "active", "retained", "archived"].contains(state ?? "") else { throw NativeDataError.invalidResponse }
        if action == "archive" {
            _ = try w.integer(receipt["archivedVersion"], max: Int(Int32.max)); _ = try w.date(receipt["archivedAt"])
            guard state == "archived", receipt["preference"] as? String == (refs.isEmpty ? "skipped" : "kept") else { throw NativeDataError.invalidResponse }
        } else {
            guard receipt["archivedVersion"] is NSNull, receipt["archivedAt"] is NSNull, refs.isEmpty, receipt["preference"] as? String == "not_requested",
                  action != "create" || state == "draft", action != "activate" || state == "active", action != "reconcile" || ["draft", "retained"].contains(state ?? "") else { throw NativeDataError.invalidResponse }
        }
        return id
    }
}

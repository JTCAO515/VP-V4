import CoreFoundation
import CryptoKit
import Foundation

/// Retain the exact request before sending. A timeout cannot create a new operation.
struct NativeNoticeCommand: Codable, Equatable, Sendable {
    let tripId: String
    let body: Data
    var path: String { "api/trips/native/v2/\(tripId)/reminders/delivery" }
    var object: [String: Any] { (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] ?? [:] }
    var action: String { object["action"] as? String ?? "" }
    var input: [String: Any] { object["input"] as? [String: Any] ?? [:] }
    var operationId: String { input["operationId"] as? String ?? "" }

    init(tripId: String, action: String, input: [String: Any]) throws {
        self.tripId = tripId
        body = try JSONSerialization.data(withJSONObject: ["action": action, "input": input], options: [.sortedKeys, .withoutEscapingSlashes])
        try validate()
    }

    static func operation() -> String { UUID().uuidString.lowercased() }
    var requestDigest: String {
        guard let canonical = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys, .withoutEscapingSlashes]) else { return "" }
        return SHA256.hash(data: canonical).map { String(format: "%02x", $0) }.joined()
    }
    var resultId: String { input["deviceId"] as? String ?? input["nextStepId"] as? String ?? input["id"] as? String ?? "" }
    static func sourceObject(_ source: NativeNoticeSource) throws -> [String: Any] {
        guard source.valid else { throw NativeDataError.invalidResponse }
        return ["kind": source.kind, "sourceId": source.sourceId, "revision": source.revision, "contentDigest": source.contentDigest]
    }
    static func revokeDevice(tripId: String, deviceId: String, permission: NativeNotificationPermission) throws -> Self {
        guard let declaration = permission.wireDeclaration else { throw NativeDataError.invalidResponse }
        return try .init(tripId: tripId, action: "revoke_device", input:
            ["operationId": operation(), "deviceId": deviceId, "permission": declaration])
    }

    static func schedule(tripId: String, version: Int, source: NativeNoticeSource, reason: String?, due: Date,
                         expiry: Date, timeZone: String, quietHours: NativeQuietHours) throws -> Self {
        guard let purpose = source.purpose else { throw NativeDataError.invalidResponse }
        return try .init(tripId: tripId, action: "schedule", input: ["operationId": operation(), "id": operation(),
            "baseVersion": version, "source": sourceObject(source), "purpose": purpose.rawValue,
            "reason": reason as Any? ?? NSNull(), "dueAt": due.ISO8601Format(), "expiresAt": expiry.ISO8601Format(),
            "timeZone": timeZone, "quietHours": ["startMinute": quietHours.startMinute, "endMinute": quietHours.endMinute], "consent": true])
    }

    func validate() throws {
        guard NativeNotificationWire.uuid(tripId), body.count <= 8192, Set(object.keys) == Set(["action", "input"]),
              !input.isEmpty, let op = input["operationId"] as? String, NativeNotificationWire.uuid(op) else { throw NativeDataError.invalidResponse }
        let x = input
        switch action {
        case "cancel", "complete", "unwatch":
            guard Set(x.keys) == Set(["operationId", "id"]), validID(x["id"]) else { throw NativeDataError.invalidResponse }
        case "dismiss":
            guard Set(x.keys) == Set(["operationId", "nextStepId", "source"]), validID(x["nextStepId"]) else { throw NativeDataError.invalidResponse }
            _ = try Self.source(x["source"])
        case "register_device":
            guard Set(x.keys) == Set(["operationId", "deviceId", "token", "environment", "permission", "timeZone"]), validID(x["deviceId"]),
                  let token = x["token"] as? String, token.range(of: "^[a-f0-9]{2,512}$", options: .regularExpression) != nil, token.count % 2 == 0,
                  ["sandbox", "production"].contains(x["environment"] as? String ?? ""), x["permission"] as? String == "authorized", validZone(x["timeZone"]) else { throw NativeDataError.invalidResponse }
        case "revoke_device":
            guard Set(x.keys) == Set(["operationId", "deviceId", "permission"]), validID(x["deviceId"]),
                  ["authorized", "denied", "not_determined"].contains(x["permission"] as? String ?? "") else { throw NativeDataError.invalidResponse }
        case "schedule", "watch":
            let required = action == "schedule" ? ["operationId", "id", "baseVersion", "purpose", "source", "reason", "dueAt", "expiresAt", "timeZone", "quietHours", "consent"] :
                ["operationId", "id", "baseVersion", "source", "expiresAt", "timeZone", "quietHours", "consent"]
            guard Set(x.keys) == Set(required), validID(x["id"]), Self.integer(x["baseVersion"]) != nil,
                  let consent = x["consent"] as? NSNumber, CFGetTypeID(consent) == CFBooleanGetTypeID(), consent.boolValue,
                  validZone(x["timeZone"]), let expiryText = x["expiresAt"] as? String, let expiry = NativeNotificationWire.date(expiryText) else { throw NativeDataError.invalidResponse }
            let source = try Self.source(x["source"])
            guard let hours = x["quietHours"] as? [String: Any], Set(hours.keys) == Set(["startMinute", "endMinute"]),
                  let start = Self.integer(hours["startMinute"]), let end = Self.integer(hours["endMinute"]),
                  NativeQuietHours(startMinute: start, endMinute: end).valid else { throw NativeDataError.invalidResponse }
            if action == "watch" {
                guard source.kind == "qualified_watch" else { throw NativeDataError.invalidResponse }
            } else {
                guard let dueText = x["dueAt"] as? String, let due = NativeNotificationWire.date(dueText), expiry > due,
                      expiry.timeIntervalSince(due) <= 86400, x["purpose"] as? String == source.purpose?.rawValue else { throw NativeDataError.invalidResponse }
                if source.purpose == .userSetTravel {
                    guard let reason = x["reason"] as? String, NativeNoticeView.reasonValid(reason) else { throw NativeDataError.invalidResponse }
                } else {
                    guard x["reason"] is NSNull else { throw NativeDataError.invalidResponse }
                }
            }
        default: throw NativeDataError.invalidResponse
        }
    }

    private func validID(_ value: Any?) -> Bool { (value as? String).map(NativeNotificationWire.uuid) == true }
    private func validZone(_ value: Any?) -> Bool { (value as? String).flatMap(TimeZone.init(identifier:)) != nil }
    static func integer(_ value: Any?) -> Int? {
        guard let value = value as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID(),
              value.doubleValue.isFinite, value.doubleValue.rounded() == value.doubleValue,
              value.doubleValue >= 0, value.doubleValue <= Double(Int32.max) else { return nil }
        return value.intValue
    }
    static func source(_ value: Any?) throws -> NativeNoticeSource {
        guard let raw = value as? [String: Any], Set(raw.keys) == Set(["kind", "sourceId", "revision", "contentDigest"]), integer(raw["revision"]) != nil else { throw NativeDataError.invalidResponse }
        let source = try JSONDecoder().decode(NativeNoticeSource.self, from: JSONSerialization.data(withJSONObject: raw))
        guard source.valid else { throw NativeDataError.invalidResponse }; return source
    }

    static func requireKeys(_ value: Any?, _ keys: Set<String>) throws {
        guard let rows = value as? [[String: Any]], rows.allSatisfy({ Set($0.keys) == keys }) else { throw NativeDataError.invalidResponse }
        for row in rows {
            if row["source"] != nil { _ = try source(row["source"]) }
            if let hours = row["quietHours"] as? [String: Any] {
                guard Set(hours.keys) == Set(["startMinute", "endMinute"]), integer(hours["startMinute"]) != nil, integer(hours["endMinute"]) != nil else { throw NativeDataError.invalidResponse }
            }
            if let outcome = row["outcome"] as? [String: Any] {
                let expected: Set<String> = outcome["kind"] as? String == "accepted" ? ["kind", "apnsId", "acceptedAt"] : ["kind", "code"]
                guard Set(outcome.keys) == expected else { throw NativeDataError.invalidResponse }
            }
        }
    }
}

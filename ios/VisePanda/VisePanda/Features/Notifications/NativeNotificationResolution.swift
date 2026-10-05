import Foundation

struct NativeNotificationResolution: Decodable, Equatable, Identifiable, Sendable {
    let version: Int
    let kind: String
    let notificationId: String
    let tripId: String
    let tripVersion: Int
    let source: NativeNoticeSource
    let expiresAt: String
    let current: Bool
    var id: String { notificationId }

    static func decode(_ bytes: Data, reference: String, now: Date = Date()) throws -> Self {
        guard bytes.count <= 8192, let raw = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              Set(raw.keys) == Set(["version", "kind", "notificationId", "tripId", "tripVersion", "source", "expiresAt", "current"]),
              NativeNoticeCommand.integer(raw["tripVersion"]) != nil else { throw NativeDataError.invalidResponse }
        _ = try NativeNoticeCommand.source(raw["source"])
        let result = try JSONDecoder().decode(Self.self, from: bytes)
        guard result.version == 2, result.kind == "resolved", result.notificationId == reference,
              NativeNotificationWire.uuid(reference), NativeNotificationWire.uuid(result.tripId), result.current,
              let expiry = NativeNotificationWire.date(result.expiresAt), expiry > now else { throw NativeDataError.invalidResponse }
        return result
    }
}

struct NativeNotificationDestination: Equatable, Identifiable {
    let scope: NativeDataScope
    let resolution: NativeNotificationResolution
    var id: String { resolution.notificationId }
}

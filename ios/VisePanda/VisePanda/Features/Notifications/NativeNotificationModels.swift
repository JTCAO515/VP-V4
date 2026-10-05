import Foundation

enum NativeReminderPurpose: String, Codable, CaseIterable, Sendable {
    case userSetTravel = "user_set_travel"
    case acceptedTaskResult = "accepted_task_result"
    case qualifiedWatch = "qualified_watch"
}

struct NativeQuietHours: Codable, Equatable, Sendable {
    let startMinute: Int
    let endMinute: Int
    var valid: Bool { (0..<1440).contains(startMinute) && (0..<1440).contains(endMinute) }
}

enum NativeDeliveryState: String, Codable, Sendable {
    case scheduled, suppressed, cancelled, completed, attempting, accepted, unknown, error
}

struct NativeDeliveryReceipt: Decodable, Equatable, Sendable {
    let operationId: String
    let reminderId: String
    let tripId: String
    let state: NativeDeliveryState
    let outcome: Outcome?

    struct Outcome: Decodable, Equatable, Sendable {
        let kind: String
        let apnsId: String?
        let acceptedAt: String?
        let code: String?
        var valid: Bool {
            switch kind {
            case "accepted":
                return apnsId.flatMap(UUID.init(uuidString:)) != nil && acceptedAt.flatMap(NativeNotificationWire.date) != nil && code == nil
            case "unknown": return code == "ACK_UNKNOWN" && apnsId == nil && acceptedAt == nil
            case "error": return ["TOKEN_REVOKED", "PROVIDER_REJECTED", "TRANSPORT_UNAVAILABLE"].contains(code ?? "") && apnsId == nil && acceptedAt == nil
            default: return false
            }
        }
    }

    var valid: Bool {
        guard [operationId, reminderId, tripId].allSatisfy(NativeNotificationWire.uuid), outcome?.valid != false else { return false }
        switch state {
        case .accepted: return outcome?.kind == "accepted"
        case .unknown: return outcome?.kind == "unknown"
        case .error: return outcome?.kind == "error"
        case .attempting: return outcome == nil
        // A close receipt may retain an earlier accepted or uncertain transport acknowledgement.
        case .scheduled, .suppressed, .cancelled, .completed: return true
        }
    }
}

enum NativeNotificationWire {
    nonisolated static func uuid(_ value: String) -> Bool {
        UUID(uuidString: value) != nil && value == value.lowercased() && value.count == 36
    }
    nonisolated static func date(_ value: String) -> Date? {
        guard let regex = try? NSRegularExpression(pattern: "^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2})(?:\\.\\d{1,3})?(Z|[+-]\\d{2}:\\d{2})$"),
              let match = regex.firstMatch(in: value, range: NSRange(value.startIndex..., in: value)) else { return nil }
        func part(_ index: Int) -> String { Range(match.range(at: index), in: value).map { String(value[$0]) } ?? "" }
        guard let year = Int(part(1)), year > 0, let month = Int(part(2)), let day = Int(part(3)),
              let hour = Int(part(4)), let minute = Int(part(5)), let second = Int(part(6)),
              (0...23).contains(hour), (0...59).contains(minute), (0...59).contains(second) else { return nil }
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let components = DateComponents(year: year, month: month, day: day, hour: hour, minute: minute, second: second)
        guard components.isValidDate(in: calendar) else { return nil }
        let zone = part(7)
        if zone != "Z" {
            let digits = zone.dropFirst().split(separator: ":").compactMap { Int($0) }
            guard digits.count == 2, digits[0] <= 14, digits[1] <= 59, digits[0] < 14 || digits[1] == 0 else { return nil }
        }
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = parser.date(from: value) { return date }
        parser.formatOptions = [.withInternetDateTime]
        return parser.date(from: value)
    }

    /// Only this opaque reference crosses the lock-screen boundary. Private destinations
    /// are obtained by an authenticated fresh read, never trusted from the push payload.
    nonisolated static func opaqueReference(_ userInfo: [AnyHashable: Any]) -> String? {
        guard let value = userInfo["notificationRef"] as? String, uuid(value) else { return nil }
        let allowed: Set<String> = ["aps", "notificationRef"]
        guard userInfo.keys.allSatisfy({ ($0 as? String).map(allowed.contains) == true }) else { return nil }
        return value
    }
    nonisolated static func opaqueReference(_ url: URL) -> String? {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false), parts.scheme == "visepanda",
              parts.host == "notifications", parts.user == nil, parts.password == nil, parts.port == nil,
              parts.query == nil, parts.fragment == nil else { return nil }
        let reference = String(parts.path.dropFirst())
        guard uuid(reference), parts.percentEncodedPath == "/" + reference else { return nil }
        return reference
    }
}

import Foundation

/// System permission is independent from a user's consent to a travel purpose.
/// Reading permission never requests it, registers a device, or schedules a notification.
enum NativeNotificationPermission: String, Codable, Sendable {
    case unknown, notDetermined, denied, authorized, provisional, ephemeral

    var allowsAlerts: Bool {
        self == .authorized || self == .provisional || self == .ephemeral
    }
    var wireDeclaration: String? {
        switch self {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .notDetermined: return "not_determined"
        case .unknown, .provisional, .ephemeral: return nil
        }
    }

}

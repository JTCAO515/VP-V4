import Foundation
import UIKit
import UserNotifications

extension NativeNotificationPermission {
    init(_ status: UNAuthorizationStatus) {
        switch status {
        case .notDetermined: self = .notDetermined
        case .denied: self = .denied
        case .authorized: self = .authorized
        case .provisional: self = .provisional
        case .ephemeral: self = .ephemeral
        @unknown default: self = .unknown
        }
    }

    static func current() async -> Self {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        return Self(settings.authorizationStatus)
    }

    static func requestForTravel() async -> Self {
        do {
            _ = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
            return await current()
        } catch { return .unknown }
    }
}

/// The app has no APNs configuration by default. This reads installed configuration;
/// it does not add entitlements or infer a team, environment, or topic.
struct NativeNotificationConfiguration: Equatable {
    let environment: String
    let topic: String

    static func installed(bundle: Bundle = .main) -> Self? {
        guard bundle.object(forInfoDictionaryKey: "VisePandaTravelPushEnabled") as? Bool == true,
              let environment = bundle.object(forInfoDictionaryKey: "VisePandaAPNsEnvironment") as? String,
              ["sandbox", "production"].contains(environment),
              let topic = bundle.object(forInfoDictionaryKey: "VisePandaAPNsTopic") as? String,
              !topic.isEmpty, topic == bundle.bundleIdentifier else { return nil }
        return .init(environment: environment, topic: topic)
    }
}

@MainActor
final class NativeNotificationSystem {
    static let shared = NativeNotificationSystem()
    private var registrationScope: NativeDataScope?
    private var currentScope: (() -> NativeDataScope?)?
    private var tokenReceived: ((Data, NativeDataScope) -> Void)?
    private var tapped: ((String, NativeDataScope) -> Void)?
    private var failed: (() -> Void)?
    private var restoring = true
    private var launchReference: String?

    func attach(current: @escaping () -> NativeDataScope?,
                token: @escaping (Data, NativeDataScope) -> Void,
                tap: @escaping (String, NativeDataScope) -> Void,
                failure: @escaping () -> Void) {
        currentScope = current; tokenReceived = token; tapped = tap; failed = failure
    }

    func register(scope: NativeDataScope, configured: Bool) {
        guard configured, currentScope?() == scope else { return }
        registrationScope = scope
        UIApplication.shared.registerForRemoteNotifications()
    }

    func received(token: Data) {
        guard let scope = registrationScope, currentScope?() == scope,
              !token.isEmpty, token.count <= 256 else { return }
        tokenReceived?(token, scope)
    }

    func registrationFailed() { registrationScope = nil; failed?() }

    func receive(reference: String, scope: NativeDataScope) {
        guard NativeNotificationWire.uuid(reference), currentScope?() == scope else { return }
        tapped?(reference, scope)
    }

    var scope: NativeDataScope? { currentScope?() }

    func receivedWhileRestoring(reference: String) {
        guard restoring, NativeNotificationWire.uuid(reference) else { return }
        launchReference = reference // Opaque memory only; no destination or retained private content.
    }
    func finishRestoration() -> String? {
        restoring = false
        defer { launchReference = nil }
        return launchReference
    }

    func invalidate() {
        registrationScope = nil
        UIApplication.shared.unregisterForRemoteNotifications()
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
    }
}

/// Foreground notifications remain quiet. A tap resolves through the current session;
/// no route or private result is decoded from the operating-system payload.
final class NativeNotificationDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NativeNotificationSystem.shared.received(token: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NativeNotificationSystem.shared.registrationFailed()
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                           withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([])
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                           withCompletionHandler completionHandler: @escaping () -> Void) {
        let reference = NativeNotificationWire.opaqueReference(response.notification.request.content.userInfo)
        let opens = response.actionIdentifier == UNNotificationDefaultActionIdentifier
        completionHandler()
        Task { @MainActor in
            guard opens, let reference else { return }
            guard let scope = NativeNotificationSystem.shared.scope else {
                NativeNotificationSystem.shared.receivedWhileRestoring(reference: reference)
                return
            }
            NativeNotificationSystem.shared.receive(reference: reference, scope: scope)
        }
    }
}

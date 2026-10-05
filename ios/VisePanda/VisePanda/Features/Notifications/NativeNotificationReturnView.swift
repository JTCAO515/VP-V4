import SwiftUI

/// Resolves again on reopen/foreground, then lets the existing Trip reader fetch
/// the exact current version. A cached notification never supplies private content.
struct NativeNotificationReturnView: View {
    let destination: NativeNotificationDestination
    let session: NativeSession
    let chinese: Bool
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dismiss) private var dismiss
    @State private var current: NativeNotificationResolution?
    @State private var unavailable = false

    var body: some View {
        NavigationStack {
            Group {
                if let current, session.dataScope == destination.scope,
                   NativeNotificationWire.date(current.expiresAt).map({ $0 > Date() }) == true {
                    NativeTripView(initialTripID: current.tripId, initialTripScope: destination.scope,
                                   initialTripVersion: current.tripVersion)
                } else if unavailable {
                    ContentUnavailableView(chinese ? "提醒已不可用" : "Reminder unavailable", systemImage: "bell.slash",
                        description: Text(chinese ? "来源、行程、权限或有效期已变化，请从当前行程继续。" : "The source, trip, permission or expiry changed. Continue from your current trip."))
                } else { ProgressView() }
            }
            .toolbar { ToolbarItem(placement: .topBarLeading) { Button(chinese ? "返回" : "Back") { dismiss() } } }
        }
        .task(id: scenePhase) {
            current = nil; unavailable = false
            guard scenePhase == .active, session.dataScope == destination.scope else { unavailable = true; return }
            do {
                let bytes = try await session.tripRequest(path: "api/trips/native/v2/notifications/resolve", method: "POST",
                    body: JSONSerialization.data(withJSONObject: ["notificationRef": destination.resolution.notificationId]))
                guard session.dataScope == destination.scope, !Task.isCancelled, scenePhase == .active else { return }
                let fresh = try NativeNotificationResolution.decode(bytes, reference: destination.resolution.notificationId)
                guard fresh.tripId == destination.resolution.tripId, fresh.tripVersion == destination.resolution.tripVersion,
                      fresh.source == destination.resolution.source else { throw NativeDataError.invalidResponse }
                current = fresh
            } catch { if session.dataScope == destination.scope, !Task.isCancelled { unavailable = true } }
        }
        .task(id: current?.expiresAt) {
            guard let current, let expiry = NativeNotificationWire.date(current.expiresAt) else { return }
            let delay = expiry.timeIntervalSinceNow
            if delay > 0 { try? await Task.sleep(for: .seconds(delay)) }
            guard !Task.isCancelled, self.current?.notificationId == current.notificationId else { return }
            self.current = nil; unavailable = true
        }
    }
}

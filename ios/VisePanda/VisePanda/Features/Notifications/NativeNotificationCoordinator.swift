import Foundation
import Observation

@MainActor @Observable
final class NativeNotificationCoordinator {
    private(set) var permission: NativeNotificationPermission = .unknown
    private(set) var notice: String?
    private(set) var destination: NativeNotificationDestination?
    private(set) var resolutionUnavailable = false
    private(set) var scope: NativeDataScope?
    private var generation = UUID()
    private var resolveGeneration = UUID()
    private var registrationTrip: String?
    private var registrationDevice: String?
    private var registrationAllowed = false
    private var busy = false
    private weak var session: NativeSession?

    func attach(session: NativeSession) {
        self.session = session
        NativeNotificationSystem.shared.attach(current: { [weak session] in session?.dataScope },
            token: { [weak self] token, scope in
                guard let self else { return }
                Task { await self.upload(token: token, scope: scope) }
            }, tap: { [weak self] reference, scope in
                guard let self else { return }
                Task { await self.resolve(reference: reference, scope: scope) }
            }, failure: { [weak self] in self?.notice = "PUSH_UNAVAILABLE" })
        actorChanged(to: session.dataScope)
    }

    func actorChanged(to scope: NativeDataScope?) {
        guard self.scope != scope else { return }
        self.scope = scope; generation = UUID(); resolveGeneration = UUID(); permission = .unknown; notice = nil; destination = nil; resolutionUnavailable = false; busy = false
        stopRegistration()
    }

    func stopRegistration() {
        registrationAllowed = false; registrationTrip = nil; registrationDevice = nil
        NativeNotificationSystem.shared.invalidate()
    }

    func dismissDestination() { destination = nil }
    func dismissResolutionFailure() { resolutionUnavailable = false }
    func finishRestoration(session: NativeSession) async {
        attach(session: session)
        if let reference = NativeNotificationSystem.shared.finishRestoration(), let scope = session.dataScope {
            await resolve(reference: reference, scope: scope)
        }
        await refreshPermission(session: session)
    }

    func refreshPermission(session: NativeSession) async {
        actorChanged(to: session.dataScope)
        guard let scope = session.dataScope, !busy else { return }
        let own = generation
        let current = await NativeNotificationPermission.current()
        guard generation == own, session.dataScope == scope, !Task.isCancelled else { return }
        permission = current
        do {
            if let pending = try session.notificationRecovery() {
                if pending.command.action == "register_device", current != .authorized { stopRegistration() }
                notice = "NOTIFICATION_RECOVERY_REQUIRED"; return
            }
            guard let binding = try session.notificationDeviceBinding() else { return }
            if current == .denied || current == .notDetermined {
                stopRegistration()
                let command = try NativeNoticeCommand(tripId: binding.tripId, action: "revoke_device", input:
                    ["operationId": NativeNoticeCommand.operation(), "deviceId": binding.deviceId,
                     "permission": current == .denied ? "denied" : "not_determined"])
                await mutateDevice(command, session: session, scope: scope)
            } else if current == .authorized, NativeNotificationConfiguration.installed() != nil {
                let bytes = try await session.tripRequest(path: "api/trips/native/v2/\(binding.tripId)/reminders/delivery", method: "GET")
                guard generation == own, session.dataScope == scope, !Task.isCancelled else { return }
                let view = try NativeNoticeView.decode(bytes, tripId: binding.tripId)
                guard view.mutationReceipt == nil, view.transport == "configured", view.device?.active == true,
                      view.device?.deviceId == binding.deviceId, view.hasRetainedConsentedPurpose() else { stopRegistration(); return }
                beginRegistration(tripId: binding.tripId, deviceId: binding.deviceId, scope: scope)
            } else { stopRegistration() }
        } catch { if generation == own, session.dataScope == scope { notice = NativeNoticeStore.code(error) } }
    }

    func requestPermission(session: NativeSession, view: NativeNoticeView?) async {
        guard !busy, let scope = session.dataScope, let view, view.transport == "configured",
              view.hasRetainedConsentedPurpose(), NativeNotificationConfiguration.installed() != nil else { notice = "PUSH_UNAVAILABLE"; return }
        actorChanged(to: scope)
        let own = generation
        let current = await NativeNotificationPermission.requestForTravel()
        guard generation == own, session.dataScope == scope, !Task.isCancelled else { return }
        permission = current
        guard current == .authorized else { notice = "PERMISSION_DENIED"; stopRegistration(); return }
        do {
            guard try session.notificationRecovery() == nil else { notice = "NOTIFICATION_RECOVERY_REQUIRED"; return }
            // Re-read current purpose, Trip and server configuration after the OS dialog.
            let bytes = try await session.tripRequest(path: "api/trips/native/v2/\(view.tripId)/reminders/delivery", method: "GET")
            guard generation == own, session.dataScope == scope, !Task.isCancelled else { return }
            let fresh = try NativeNoticeView.decode(bytes, tripId: view.tripId)
            guard fresh.mutationReceipt == nil, fresh.transport == "configured", fresh.tripVersion == view.tripVersion,
                  fresh.hasRetainedConsentedPurpose() else { notice = "SOURCE_UNAVAILABLE"; return }
            beginRegistration(tripId: view.tripId, deviceId: fresh.device?.deviceId ?? NativeNoticeCommand.operation(), scope: scope)
        } catch { if generation == own, session.dataScope == scope { notice = NativeNoticeStore.code(error) } }
    }

    private func beginRegistration(tripId: String, deviceId: String, scope: NativeDataScope) {
        guard session?.dataScope == scope else { return }
        registrationTrip = tripId; registrationDevice = deviceId; registrationAllowed = true
        NativeNotificationSystem.shared.register(scope: scope, configured: NativeNotificationConfiguration.installed() != nil)
    }

    private func upload(token: Data, scope: NativeDataScope) async {
        guard !busy, registrationAllowed, self.scope == scope, let session, session.dataScope == scope,
              let tripId = registrationTrip, let deviceId = registrationDevice, let config = NativeNotificationConfiguration.installed() else { return }
        let own = generation
        let current = await NativeNotificationPermission.current()
        guard generation == own, session.dataScope == scope, current == .authorized, registrationAllowed else { return }
        do {
            guard try session.notificationRecovery() == nil else { notice = "NOTIFICATION_RECOVERY_REQUIRED"; return }
            let command = try NativeNoticeCommand(tripId: tripId, action: "register_device", input:
                ["operationId": NativeNoticeCommand.operation(), "deviceId": deviceId,
                 "token": token.map { String(format: "%02x", $0) }.joined(), "environment": config.environment,
                 "permission": "authorized", "timeZone": TimeZone.current.identifier])
            await mutateDevice(command, session: session, scope: scope)
        } catch { if generation == own, session.dataScope == scope { notice = NativeNoticeStore.code(error) } }
    }

    private func mutateDevice(_ command: NativeNoticeCommand, session: NativeSession, scope: NativeDataScope) async {
        guard !busy, session.dataScope == scope else { return }
        let own = generation; busy = true
        defer { if generation == own { busy = false } }
        do {
            let pending = try session.retainNotification(command, scope: scope)
            let bytes = try await session.tripRequest(path: command.path, method: "POST", body: command.body)
            guard generation == own, session.dataScope == scope, !Task.isCancelled else { return }
            let result = try NativeNoticeView.decode(bytes, tripId: command.tripId)
            guard let receipt = result.mutationReceipt, receipt.matches(command) else { throw NativeDataError.invalidResponse }
            try session.completeNotification(pending, receipt: receipt, scope: scope)
            notice = receipt.outcome == "applied" ? "REMINDER_OPERATION_CONFIRMED" : "REMINDER_OPERATION_CANCELLED"
        } catch { if generation == own, session.dataScope == scope { notice = NativeNoticeStore.code(error) } }
    }

    func resolve(reference: String, scope: NativeDataScope) async {
        guard let session, session.dataScope == scope, self.scope == scope, NativeNotificationWire.uuid(reference) else { return }
        destination = nil; resolutionUnavailable = false
        let own = generation
        let requestID = UUID(); resolveGeneration = requestID
        do {
            let body = try JSONSerialization.data(withJSONObject: ["notificationRef": reference])
            let bytes = try await session.tripRequest(path: "api/trips/native/v2/notifications/resolve", method: "POST", body: body)
            guard generation == own, resolveGeneration == requestID, session.dataScope == scope, !Task.isCancelled else { return }
            let result = try NativeNotificationResolution.decode(bytes, reference: reference)
            destination = .init(scope: scope, resolution: result)
        } catch {
            if generation == own, resolveGeneration == requestID, session.dataScope == scope {
                notice = "SOURCE_UNAVAILABLE"; resolutionUnavailable = true
            }
        }
    }
}

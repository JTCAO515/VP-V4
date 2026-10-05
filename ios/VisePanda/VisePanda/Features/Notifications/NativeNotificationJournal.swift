import Foundation
import Security

struct NativeNotificationPending: Codable, Equatable, Sendable {
    let endpoint: String
    let owner: String
    let epoch: Int
    let command: NativeNoticeCommand
    init(scope: NativeDataScope, command: NativeNoticeCommand) {
        endpoint = scope.endpoint; owner = scope.subject; epoch = scope.mobileEpoch; self.command = command
    }
    func matches(_ scope: NativeDataScope) -> Bool {
        endpoint == scope.endpoint && owner == scope.subject && epoch == scope.mobileEpoch
    }
    func validate() throws {
        guard !endpoint.isEmpty, NativeNotificationWire.uuid(owner), epoch >= 0 else { throw NativeDataError.invalidResponse }
        try command.validate()
    }

    /// Safe recovery metadata. Exact request bytes may contain a device token or reason
    /// and never enter a user export, trace, log, or notification payload.
    func exportMetadata() throws -> Data {
        try validate()
        return try JSONSerialization.data(withJSONObject: ["schemaVersion": "notification-pending/1",
            "action": command.action, "operationId": command.operationId, "tripId": command.tripId,
            "mobileEpoch": epoch, "acknowledgement": "unknown", "secretRequestExcluded": true], options: [.sortedKeys])
    }
}

/// Safe device identity only; APNs token bytes are never retained here.
struct NativeNotificationDeviceBinding: Codable, Equatable, Sendable {
    let endpoint: String
    let owner: String
    let epoch: Int
    let deviceId: String
    let tripId: String
    let revision: Int
    func matches(_ scope: NativeDataScope) -> Bool {
        endpoint == scope.endpoint && owner == scope.subject && epoch == scope.mobileEpoch
    }
    var valid: Bool {
        !endpoint.isEmpty && NativeNotificationWire.uuid(owner) && epoch >= 0 &&
        NativeNotificationWire.uuid(deviceId) && NativeNotificationWire.uuid(tripId) && (1...Int(Int32.max)).contains(revision)
    }
    func exportMetadata() throws -> Data {
        guard valid else { throw NativeDataError.invalidResponse }
        return try JSONSerialization.data(withJSONObject: ["schemaVersion": "notification-device/1", "deviceId": deviceId,
            "tripId": tripId, "mobileEpoch": epoch, "revision": revision, "secretRequestExcluded": true], options: [.sortedKeys])
    }
}

@MainActor
struct NativeNotificationJournal {
    let vault: any NativeCredentialVault
    static func service(_ endpoint: String) -> String { "com.visepanda.native.notifications.v2." + endpoint }
    static func bindingService(_ endpoint: String) -> String { service(endpoint) + ".device" }
    func binding(_ scope: NativeDataScope) throws -> NativeNotificationDeviceBinding? {
        let (status, bytes) = vault.read(service: Self.bindingService(scope.endpoint), owner: scope.subject)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let bytes, bytes.count <= 4096 else { throw NativeDataError.sessionUnavailable }
        let value = try JSONDecoder().decode(NativeNotificationDeviceBinding.self, from: bytes)
        guard value.valid else { throw NativeDataError.invalidResponse }
        return value.matches(scope) ? value : nil
    }
    func acknowledgeDevice(_ pending: NativeNotificationPending, receipt: NativeNoticeView.MutationReceipt, scope: NativeDataScope) throws {
        guard pending.matches(scope), receipt.matches(pending.command) else { throw NativeDataError.invalidResponse }
        guard receipt.outcome == "applied" else { return }
        if pending.command.action == "register_device" {
            let value = NativeNotificationDeviceBinding(endpoint: scope.endpoint, owner: scope.subject, epoch: scope.mobileEpoch,
                deviceId: receipt.resultId, tripId: pending.command.tripId, revision: receipt.revision)
            guard value.valid, vault.write(try JSONEncoder().encode(value), service: Self.bindingService(scope.endpoint), owner: scope.subject) == errSecSuccess,
                  try binding(scope) == value else { throw NativeDataError.sessionUnavailable }
        } else if pending.command.action == "revoke_device" {
            try Self.eraseBinding(endpoint: scope.endpoint, owner: scope.subject, vault: vault)
        }
    }
    func read(_ scope: NativeDataScope) throws -> NativeNotificationPending? {
        let (status, bytes) = vault.read(service: Self.service(scope.endpoint), owner: scope.subject)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let bytes, bytes.count <= 16384 else { throw NativeDataError.sessionUnavailable }
        let value = try JSONDecoder().decode(NativeNotificationPending.self, from: bytes)
        try value.validate()
        guard value.matches(scope) else { throw NativeDataError.staleSessionResponse }; return value
    }
    func retain(_ command: NativeNoticeCommand, scope: NativeDataScope) throws -> NativeNotificationPending {
        try command.validate()
        let value = NativeNotificationPending(scope: scope, command: command)
        if let old = try read(scope) {
            guard old == value else { throw NativeDataError.server(code: "NOTIFICATION_RECOVERY_REQUIRED") }; return old
        }
        let bytes = try JSONEncoder().encode(value)
        guard bytes.count <= 16384, vault.write(bytes, service: Self.service(scope.endpoint), owner: scope.subject) == errSecSuccess,
              try read(scope) == value else { throw NativeDataError.sessionUnavailable }
        return value
    }
    func complete(_ value: NativeNotificationPending, scope: NativeDataScope) throws {
        guard value.matches(scope), try read(scope) == value else { throw NativeDataError.staleSessionResponse }
        try Self.erase(endpoint: scope.endpoint, owner: scope.subject, vault: vault)
    }
    static func erase(endpoint: String, owner: String, vault: any NativeCredentialVault) throws {
        let status = vault.remove(service: service(endpoint), owner: owner)
        guard status == errSecSuccess || status == errSecItemNotFound,
              vault.read(service: service(endpoint), owner: owner).0 == errSecItemNotFound else { throw NativeDataError.sessionUnavailable }
    }
    static func eraseBinding(endpoint: String, owner: String, vault: any NativeCredentialVault) throws {
        let status = vault.remove(service: bindingService(endpoint), owner: owner)
        guard status == errSecSuccess || status == errSecItemNotFound,
              vault.read(service: bindingService(endpoint), owner: owner).0 == errSecItemNotFound else { throw NativeDataError.sessionUnavailable }
    }
}

import Foundation
import Security

struct NativeServiceOperationPending: Codable, Equatable {
    let schemaVersion: Int
    let endpoint: String
    let owner: String
    let epoch: Int
    let body: Data
    func matches(_ scope: NativeDataScope) -> Bool {
        schemaVersion == 1 && endpoint == scope.endpoint && owner == scope.subject && epoch == scope.mobileEpoch
    }
}

/// One durable unknown write per actor and endpoint. Neither another case nor a new operation may replace it.
@MainActor struct NativeServiceOperationJournal {
    let vault: any NativeCredentialVault
    init(vault: any NativeCredentialVault) { self.vault = vault }
    init() { self.vault = NativeKeychainVault() }
    static func service(_ endpoint: String) -> String { "com.visepanda.native.service-operations.v1." + endpoint }
    func read(_ scope: NativeDataScope) throws -> NativeServiceOperationPending? {
        let (status, bytes) = vault.read(service: Self.service(scope.endpoint), owner: scope.subject)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let bytes, bytes.count <= 32_000 else { throw NativeDataError.sessionUnavailable }
        let value = try JSONDecoder().decode(NativeServiceOperationPending.self, from: bytes)
        guard value.matches(scope) else { throw NativeDataError.staleSessionResponse }
        try NativeServiceOperationCommand(body: value.body).validate()
        return value
    }
    func retain(_ command: NativeServiceOperationCommand, scope: NativeDataScope) throws -> NativeServiceOperationPending {
        try command.validate()
        if let existing = try read(scope) {
            guard existing.body == command.body else { throw NativeDataError.staleSessionResponse }; return existing
        }
        let value = NativeServiceOperationPending(schemaVersion: 1, endpoint: scope.endpoint, owner: scope.subject, epoch: scope.mobileEpoch, body: command.body)
        let bytes = try JSONEncoder().encode(value)
        guard bytes.count <= 32_000, vault.write(bytes, service: Self.service(scope.endpoint), owner: scope.subject) == errSecSuccess,
              try read(scope) == value else { throw NativeDataError.sessionUnavailable }
        return value
    }
    func complete(_ value: NativeServiceOperationPending, scope: NativeDataScope) throws {
        guard value.matches(scope), try read(scope) == value else { throw NativeDataError.staleSessionResponse }
        try Self.erase(endpoint: scope.endpoint, owner: scope.subject, vault: vault)
    }
    static func erase(endpoint: String, owner: String, vault: any NativeCredentialVault) throws {
        let status = vault.remove(service: service(endpoint), owner: owner)
        guard status == errSecSuccess || status == errSecItemNotFound,
              vault.read(service: service(endpoint), owner: owner).0 == errSecItemNotFound else { throw NativeDataError.sessionUnavailable }
    }
}

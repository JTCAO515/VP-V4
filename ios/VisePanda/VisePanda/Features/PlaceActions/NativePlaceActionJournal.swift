import Foundation
import Security

struct NativePlaceActionPending: Codable, Equatable {
    let endpoint: String
    let owner: String
    let epoch: Int
    let command: NativePlaceActionCommand
    init(scope: NativeDataScope, command: NativePlaceActionCommand) {
        endpoint = scope.endpoint; owner = scope.subject; epoch = scope.mobileEpoch; self.command = command
    }
    func matches(_ scope: NativeDataScope) -> Bool {
        endpoint == scope.endpoint && owner == scope.subject && epoch == scope.mobileEpoch
    }
    func validate() throws {
        guard !endpoint.isEmpty, NativeMemoryWire.uuid(owner), epoch >= 0 else { throw NativeDataError.invalidResponse }
        try command.validate()
    }
}

/// Metadata-only unresolved user command. No source body, route or credentials.
/// One journal per owner/endpoint prevents another Trip from hiding an unknown ACK.
@MainActor struct NativePlaceActionJournal {
    let vault: any NativeCredentialVault
    static func service(_ endpoint: String) -> String { "com.visepanda.native.place-actions.v1." + endpoint }
    func read(_ scope: NativeDataScope) throws -> NativePlaceActionPending? {
        let (status, bytes) = vault.read(service: Self.service(scope.endpoint), owner: scope.subject)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let bytes, bytes.count <= 32000 else { throw NativeDataError.sessionUnavailable }
        let value = try JSONDecoder().decode(NativePlaceActionPending.self, from: bytes)
        try value.validate()
        guard value.matches(scope) else { throw NativeDataError.staleSessionResponse }; return value
    }
    func retain(_ command: NativePlaceActionCommand, scope: NativeDataScope) throws -> NativePlaceActionPending {
        try command.validate()
        let value = NativePlaceActionPending(scope: scope, command: command)
        if let existing = try read(scope) {
            guard existing == value else { throw NativeDataError.server(code: "PLACE_ACTION_RECOVERY_REQUIRED") }; return existing
        }
        let bytes = try JSONEncoder().encode(value)
        guard bytes.count <= 32000, vault.write(bytes, service: Self.service(scope.endpoint), owner: scope.subject) == errSecSuccess,
              try read(scope) == value else { throw NativeDataError.sessionUnavailable }
        return value
    }
    func complete(_ value: NativePlaceActionPending, scope: NativeDataScope) throws {
        guard value.matches(scope), try read(scope) == value else { throw NativeDataError.staleSessionResponse }
        try Self.erase(endpoint: scope.endpoint, owner: scope.subject, vault: vault)
    }
    static func erase(endpoint: String, owner: String, vault: any NativeCredentialVault) throws {
        let status = vault.remove(service: service(endpoint), owner: owner)
        guard status == errSecSuccess || status == errSecItemNotFound,
              vault.read(service: service(endpoint), owner: owner).0 == errSecItemNotFound else { throw NativeDataError.sessionUnavailable }
    }
}

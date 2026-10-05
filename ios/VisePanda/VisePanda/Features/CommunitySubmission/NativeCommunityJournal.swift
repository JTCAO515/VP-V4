import Foundation
import Security

struct NativeCommunityPending: Codable, Equatable {
    let schemaVersion: Int
    let endpoint: String
    let owner: String
    let epoch: Int
    let sessionID: String
    let body: Data
    func matches(_ scope: NativeDataScope, sessionID: String) -> Bool {
        schemaVersion == 1 && endpoint == scope.endpoint && owner == scope.subject && epoch == scope.mobileEpoch && self.sessionID == sessionID
    }
}

/// Protected exact-byte recovery. A different command cannot overwrite an unknown acknowledgement.
@MainActor struct NativeCommunityJournal {
    let vault: any NativeCredentialVault
    init(vault: any NativeCredentialVault) { self.vault = vault }
    init() { self.vault = NativeKeychainVault() }
    static func service(_ endpoint: String) -> String { "com.visepanda.native.community.v1." + endpoint }
    func read(_ scope: NativeDataScope, sessionID: String) throws -> NativeCommunityPending? {
        let (status, bytes) = vault.read(service: Self.service(scope.endpoint), owner: scope.subject)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let bytes, bytes.count <= 64_000 else { throw NativeDataError.sessionUnavailable }
        let value = try JSONDecoder().decode(NativeCommunityPending.self, from: bytes)
        guard value.matches(scope, sessionID: sessionID) else { throw NativeDataError.staleSessionResponse }
        try validateBody(value.body)
        return value
    }
    func retain(body: Data, scope: NativeDataScope, sessionID: String) throws -> NativeCommunityPending {
        try validateBody(body)
        if let existing = try read(scope, sessionID: sessionID) {
            guard existing.body == body else { throw NativeDataError.staleSessionResponse }
            return existing
        }
        let value = NativeCommunityPending(schemaVersion: 1, endpoint: scope.endpoint, owner: scope.subject, epoch: scope.mobileEpoch, sessionID: sessionID, body: body)
        let bytes = try JSONEncoder().encode(value)
        guard bytes.count <= 64_000, vault.write(bytes, service: Self.service(scope.endpoint), owner: scope.subject) == errSecSuccess,
              try read(scope, sessionID: sessionID) == value else { throw NativeDataError.sessionUnavailable }
        return value
    }
    func complete(_ value: NativeCommunityPending, scope: NativeDataScope, sessionID: String) throws {
        guard value.matches(scope, sessionID: sessionID), try read(scope, sessionID: sessionID) == value else { throw NativeDataError.staleSessionResponse }
        try Self.erase(endpoint: scope.endpoint, owner: scope.subject, vault: vault)
    }
    static func erase(endpoint: String, owner: String, vault: any NativeCredentialVault) throws {
        let result = vault.remove(service: service(endpoint), owner: owner)
        guard result == errSecSuccess || result == errSecItemNotFound,
              vault.read(service: service(endpoint), owner: owner).0 == errSecItemNotFound else { throw NativeDataError.sessionUnavailable }
    }
    private func validateBody(_ body: Data) throws {
        _ = try NativeCommunityCommand(body: body)
    }
}

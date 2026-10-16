import Foundation
import Security

/// Local recovery custody only. A loaded record permits GET reconciliation, never POST admission.
/// Main owns receipt validation and lifecycle registration. No network or credential access occurs here.
@MainActor
final class NativeQAPendingJournal {
    struct Metadata: Codable, Equatable {
        let requestID: String
        let sessionID: String
        let policyID: String
        let noticeHash: String
        let mobileEpoch: Int
    }

    private struct Record: Codable {
        let version: Int
        let identity: UUID
        let pending: NativeQAPending
    }
    private struct Snapshot {
        let scope: NativeDataScope
        let bytes: Data
        let pending: NativeQAPending
    }

    private static let service = "space.go2china.visepanda.nativeqa.pending.v1"
    // Shared across instances: vault primitives are synchronous, but injected callbacks can reenter.
    private static var busy = false
    private let vault: any NativeCredentialVault
    private let currentScope: () -> NativeDataScope?
    private var snapshot: Snapshot?

    init(vault: any NativeCredentialVault, currentScope: @escaping () -> NativeDataScope?) {
        self.vault = vault
        self.currentScope = currentScope
    }

    func load(scope: NativeDataScope) throws -> NativeQAPending? {
        try transaction(scope) {
            let value = try read(scope)
            snapshot = value
            return value?.pending
        }
    }

    /// Returns only after exact physical readback. Caller must still check live dispatch authority.
    func retain(_ pending: NativeQAPending, scope: NativeDataScope) throws {
        try transaction(scope) {
            guard pending.matches(scope) else { throw NativeQAError.stale }
            if let existing = try read(scope) {
                guard existing.pending == pending else { throw NativeQAError.journalUnavailable }
                snapshot = existing
                return
            }
            let record = Record(version: 1, identity: UUID(), pending: pending)
            let bytes = try JSONEncoder().encode(record)
            try check(scope)
            let status = vault.write(bytes, service: Self.service, owner: Self.account(scope.endpoint, scope.subject))
            try check(scope)
            guard status == errSecSuccess else { throw NativeQAError.journalUnavailable }
            guard let stored = try read(scope), stored.bytes == bytes, stored.pending == pending else {
                throw NativeQAError.journalUnavailable
            }
            snapshot = stored
        }
    }

    /// Low-level CAS only; Main/UI must have an exact authoritative terminal receipt first.
    /// A prior successful load/retain on this instance is required. Absent/403/cancel is not a receipt.
    func clearExact(_ pending: NativeQAPending, scope: NativeDataScope) throws {
        try transaction(scope) { try removeExact(pending, scope: scope) }
    }

    /// Explicit user abandonment discards local recovery custody; it does not undo/complete server work.
    func abandonLocally(_ pending: NativeQAPending, scope: NativeDataScope) throws {
        try transaction(scope) { try removeExact(pending, scope: scope) }
    }

    /// Safe JournalData projection; raw bytes and the private CAS identity never leave the journal.
    func metadata(scope: NativeDataScope) throws -> Metadata? {
        try transaction(scope) {
            guard let value = try read(scope) else { return nil }
            let pending = value.pending
            return Metadata(requestID: pending.requestID, sessionID: pending.sessionID,
                            policyID: pending.policyID, noticeHash: pending.noticeHash,
                            mobileEpoch: pending.mobileEpoch)
        }
    }

    /// Explicit account erase can remove corrupt/old-epoch custody at this fixed key. No enumeration.
    /// Main's private Session validates the exact endpoint/owner and explicit non-preserve cleanup
    /// intent in `authorized`, even after logout has fenced active dataScope to nil. Ordinary expiry,
    /// 401, revocation, absence or cancellation must preserve custody and never grant this authority.
    /// This does not synthesize an active scope, server undo or a successful completion receipt.
    static func erase(endpoint: String, owner: String, vault: any NativeCredentialVault,
                      authorized: () -> Bool) throws {
        guard !busy, !endpoint.isEmpty, !owner.isEmpty else { throw NativeQAError.stale }
        busy = true
        defer { busy = false }
        func check() throws {
            guard authorized() else { throw NativeQAError.stale }
        }
        let key = account(endpoint, owner)
        try check()
        let before = vault.read(service: service, owner: key)
        try check()
        guard before.0 == errSecSuccess || (before.0 == errSecItemNotFound && before.1 == nil) else {
            throw NativeQAError.journalUnavailable
        }
        if before.0 == errSecSuccess {
            guard let bytes = before.1 else { throw NativeQAError.journalUnavailable }
            // Compare physical bytes again immediately before remove, including corrupt records.
            let compare = vault.read(service: service, owner: key)
            try check()
            guard compare.0 == errSecSuccess, compare.1 == bytes else { throw NativeQAError.journalUnavailable }
            let status = vault.remove(service: service, owner: key)
            try check()
            guard status == errSecSuccess else { throw NativeQAError.journalUnavailable }
        }
        let after = vault.read(service: service, owner: key)
        try check()
        guard after.0 == errSecItemNotFound, after.1 == nil else { throw NativeQAError.journalUnavailable }
    }

    private func removeExact(_ pending: NativeQAPending, scope: NativeDataScope) throws {
        guard pending.matches(scope), let expected = snapshot, expected.scope == scope, expected.pending == pending,
              let actual = try read(scope), actual.bytes == expected.bytes, actual.pending == pending else {
            throw NativeQAError.journalUnavailable
        }
        // A second physical compare catches replacement during read callbacks; synchronous single writer.
        guard let compare = try read(scope), compare.bytes == expected.bytes else { throw NativeQAError.journalUnavailable }
        try check(scope)
        let status = vault.remove(service: Self.service, owner: Self.account(scope.endpoint, scope.subject))
        try check(scope)
        guard status == errSecSuccess else { throw NativeQAError.journalUnavailable }
        guard try read(scope) == nil else { throw NativeQAError.journalUnavailable }
        snapshot = nil
    }

    private func transaction<T>(_ scope: NativeDataScope, _ operation: () throws -> T) throws -> T {
        guard !Self.busy else { throw NativeQAError.journalUnavailable }
        Self.busy = true
        defer { Self.busy = false }
        try check(scope)
        do {
            let result = try operation()
            try check(scope)
            return result
        } catch {
            snapshot = nil
            throw error
        }
    }

    private func check(_ scope: NativeDataScope) throws {
        guard !scope.endpoint.isEmpty, !scope.subject.isEmpty, scope.mobileEpoch > 0,
              currentScope() == scope else { throw NativeQAError.stale }
    }

    private func read(_ scope: NativeDataScope) throws -> Snapshot? {
        try check(scope)
        let (status, bytes) = vault.read(service: Self.service, owner: Self.account(scope.endpoint, scope.subject))
        try check(scope)
        if status == errSecItemNotFound, bytes == nil { return nil }
        guard status == errSecSuccess, let bytes, bytes.count <= 100_000,
              let record = try? JSONDecoder().decode(Record.self, from: bytes), record.version == 1,
              record.pending.matches(scope) else { throw NativeQAError.journalUnavailable }
        return Snapshot(scope: scope, bytes: bytes, pending: record.pending)
    }

    private static func account(_ endpoint: String, _ owner: String) -> String {
        // Length prefix prevents delimiter ambiguity; this key is never exported or logged.
        "\(endpoint.utf8.count):\(endpoint)\(owner)"
    }
}

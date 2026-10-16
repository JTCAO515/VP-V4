import Foundation
import Security

/// Cancellation metadata custody only. Recovery, including observed tombstones, never admits a POST.
/// One bounded item per endpoint/subject makes capacity and retain one synchronous transaction.
@MainActor
final class NativeQACancellationJournal: NativeQACancellationPersistence {
    enum Failure: Error { case capacityExceeded, recordTooLarge }

    struct Metadata: Codable, Equatable {
        let mobileEpoch: Int
        let sessionID: String
        let requestID: String
        let observedState: NativeQACancellationReceipt.State?
    }
    struct Inventory: Codable, Equatable {
        /// Capacity includes all epochs; only this active epoch's identities are projected below.
        let totalRecords: Int
        let records: [Metadata]
    }

    private struct Entry: Codable, Equatable {
        let identity: UUID
        let recordBytes: Data
    }
    private struct Ledger: Codable {
        let version: Int
        let revision: UUID
        let entries: [Entry]
    }
    private struct Read {
        let bytes: Data?
        let entries: [Entry]
        let records: [NativeQACancellationRecord]
    }
    private struct Snapshot {
        let scope: NativeDataScope
        let entry: Entry
    }
    private struct Key: Hashable {
        let epoch: Int
        let session: String
        let request: String
        init(_ command: NativeQACancellationPending) {
            epoch = command.mobileEpoch; session = command.sessionID; request = command.requestID
        }
    }

    // Serializes all instances, including injected callback reentry. No suspension inside a transaction.
    private static var busy = false
    private static let maximumLedgerBytes = 200_000
    private let vault: any NativeCredentialVault
    private let currentScope: () -> NativeDataScope?
    private var snapshots: [Key: Snapshot] = [:]

    static func service(_ endpoint: String) -> String { "com.visepanda.native.qa-cancellation.v1." + endpoint }

    init(vault: any NativeCredentialVault, currentScope: @escaping () -> NativeDataScope?) {
        self.vault = vault
        self.currentScope = currentScope
    }

    func loadCancellation(target: NativeQACancellationTarget) throws -> NativeQACancellationRecord? {
        try transaction(target.scope) {
            guard target.valid else { throw NativeQACancellationError.invalidResponse }
            let stored = try read(target.scope)
            let command = try NativeQACancellationPending(target: target)
            guard let index = stored.records.firstIndex(where: { Key($0.command) == Key(command) }) else {
                snapshots[Key(command)] = nil
                return nil
            }
            let record = stored.records[index]
            guard record.command.matches(target) else { throw NativeQACancellationError.storageUnavailable }
            snapshots[Key(command)] = Snapshot(scope: target.scope, entry: stored.entries[index])
            return record
        }
    }

    func retainCancellation(_ command: NativeQACancellationPending, scope: NativeDataScope) throws {
        try transaction(scope) {
            try check(command, scope: scope)
            let stored = try read(scope)
            if let index = stored.records.firstIndex(where: { Key($0.command) == Key(command) }) {
                guard stored.records[index].command == command else { throw NativeQACancellationError.storageUnavailable }
                // Preserve an observed tombstone; retain is never a reset to unknown.
                snapshots[Key(command)] = Snapshot(scope: scope, entry: stored.entries[index])
                return
            }
            guard stored.entries.count < NativeQACancellationRecord.maximumRecordsPerActor else {
                throw Failure.capacityExceeded
            }
            let record = NativeQACancellationRecord(command: command, receipt: nil)
            let entry = Entry(identity: UUID(), recordBytes: try encode(record))
            try write(stored.entries + [entry], replacing: stored.bytes, scope: scope)
            snapshots[Key(command)] = Snapshot(scope: scope, entry: entry)
        }
    }

    func finishCancellation(_ command: NativeQACancellationPending, receipt: NativeQACancellationReceipt,
                            scope: NativeDataScope) throws {
        try transaction(scope) {
            try check(command, scope: scope)
            guard receipt.observed, receipt.matches(command), let expected = snapshots[Key(command)],
                  expected.scope == scope else { throw NativeQACancellationError.storageUnavailable }
            let stored = try read(scope)
            guard let index = stored.records.firstIndex(where: { Key($0.command) == Key(command) }),
                  stored.entries[index] == expected.entry, stored.records[index].command == command else {
                throw NativeQACancellationError.storageUnavailable
            }
            if let existing = stored.records[index].receipt {
                guard existing == receipt else { throw NativeQACancellationError.storageUnavailable }
                return
            }
            let sealed = NativeQACancellationRecord(command: command, receipt: receipt)
            let entry = Entry(identity: expected.entry.identity, recordBytes: try encode(sealed))
            var entries = stored.entries
            entries[index] = entry
            try write(entries, replacing: stored.bytes, scope: scope)
            snapshots[Key(command)] = Snapshot(scope: scope, entry: entry)
        }
    }

    /// Minimal companion projection; no body, raw ledger/record bytes or private CAS identities.
    func inventory(scope: NativeDataScope) throws -> Inventory {
        try transaction(scope) {
            let stored = try read(scope)
            let records = stored.records.filter { $0.command.mobileEpoch == scope.mobileEpoch }.map {
                Metadata(mobileEpoch: $0.command.mobileEpoch, sessionID: $0.command.sessionID,
                         requestID: $0.command.requestID, observedState: $0.receipt?.state)
            }
            return Inventory(totalRecords: stored.records.count, records: records)
        }
    }

    /// Main's private identity owner must verify exact endpoint/owner and explicit cleanup intent
    /// (including original epoch/credential authority) before and after every IO. Works after logout
    /// has fenced dataScope to nil. Offline, locked storage and background transitions grant nothing.
    /// Removes cancellation custody only, across epochs for this exact endpoint/subject. No server undo.
    static func erase(endpoint: String, owner: String, vault: any NativeCredentialVault,
                      authorized: () -> Bool) throws {
        guard !busy, !endpoint.isEmpty, endpoint.utf8.count <= 2048, NativeQAWire.uuid(owner) else {
            throw NativeQACancellationError.stale
        }
        busy = true
        defer { busy = false }
        func check() throws {
            guard authorized() else { throw NativeQACancellationError.stale }
        }
        func physicalRead() throws -> Data? {
            try check()
            let (status, bytes) = vault.read(service: service(endpoint), owner: owner)
            try check()
            if status == errSecItemNotFound, bytes == nil { return nil }
            guard status == errSecSuccess, let bytes else { throw NativeQACancellationError.storageUnavailable }
            return bytes
        }
        let before = try physicalRead()
        if let before {
            guard try physicalRead() == before else { throw NativeQACancellationError.storageUnavailable }
            try check()
            let status = vault.remove(service: service(endpoint), owner: owner)
            try check()
            guard status == errSecSuccess else { throw NativeQACancellationError.storageUnavailable }
        }
        guard try physicalRead() == nil else { throw NativeQACancellationError.storageUnavailable }
    }

    private func transaction<T>(_ scope: NativeDataScope, _ operation: () throws -> T) throws -> T {
        guard !Self.busy else { throw NativeQACancellationError.storageUnavailable }
        Self.busy = true
        defer { Self.busy = false }
        do {
            try check(scope)
            let result = try operation()
            try check(scope)
            return result
        } catch {
            snapshots.removeAll()
            throw error
        }
    }

    private func check(_ scope: NativeDataScope) throws {
        guard currentScope() == scope, !scope.endpoint.isEmpty, scope.endpoint.utf8.count <= 2048,
              NativeQAWire.uuid(scope.subject), scope.mobileEpoch > 0,
              scope.mobileEpoch <= 9_007_199_254_740_991 else { throw NativeQACancellationError.stale }
    }

    private func check(_ command: NativeQACancellationPending, scope: NativeDataScope) throws {
        try check(scope)
        guard command.valid, command.endpoint == scope.endpoint, command.subject == scope.subject,
              command.mobileEpoch == scope.mobileEpoch else { throw NativeQACancellationError.stale }
    }

    private func raw(_ scope: NativeDataScope) throws -> Data? {
        try check(scope)
        let (status, bytes) = vault.read(service: Self.service(scope.endpoint), owner: scope.subject)
        try check(scope)
        if status == errSecItemNotFound, bytes == nil { return nil }
        guard status == errSecSuccess, let bytes, bytes.count <= Self.maximumLedgerBytes else {
            throw NativeQACancellationError.storageUnavailable
        }
        return bytes
    }

    private func read(_ scope: NativeDataScope) throws -> Read {
        guard let bytes = try raw(scope) else { return Read(bytes: nil, entries: [], records: []) }
        guard let ledger = try? JSONDecoder().decode(Ledger.self, from: bytes), ledger.version == 1,
              ledger.entries.count <= NativeQACancellationRecord.maximumRecordsPerActor,
              exactKeys(bytes, required: ["version", "revision", "entries"]) else {
            throw NativeQACancellationError.storageUnavailable
        }
        var records: [NativeQACancellationRecord] = []
        var keys: Set<Key> = []
        var identities: Set<UUID> = []
        for entry in ledger.entries {
            guard entry.recordBytes.count <= NativeQACancellationRecord.maximumRecordBytes,
                  let record = try? JSONDecoder().decode(NativeQACancellationRecord.self, from: entry.recordBytes),
                  record.valid, record.command.endpoint == scope.endpoint, record.command.subject == scope.subject,
                  validRecordKeys(entry.recordBytes), keys.insert(Key(record.command)).inserted,
                  identities.insert(entry.identity).inserted else { throw NativeQACancellationError.storageUnavailable }
            records.append(record)
        }
        return Read(bytes: bytes, entries: ledger.entries, records: records)
    }

    private func encode(_ record: NativeQACancellationRecord) throws -> Data {
        guard record.valid else { throw NativeQACancellationError.invalidResponse }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        let bytes = try encoder.encode(record)
        guard bytes.count <= NativeQACancellationRecord.maximumRecordBytes else { throw Failure.recordTooLarge }
        return bytes
    }

    private func write(_ entries: [Entry], replacing original: Data?, scope: NativeDataScope) throws {
        let ledger = Ledger(version: 1, revision: UUID(), entries: entries)
        let bytes = try JSONEncoder().encode(ledger)
        guard bytes.count <= Self.maximumLedgerBytes else { throw NativeQACancellationError.storageUnavailable }
        // Exact opaque physical bytes, including unrelated/older-epoch records, participate in CAS.
        guard try raw(scope) == original else { throw NativeQACancellationError.storageUnavailable }
        try check(scope)
        let status = vault.write(bytes, service: Self.service(scope.endpoint), owner: scope.subject)
        try check(scope)
        guard status == errSecSuccess, try raw(scope) == bytes else { throw NativeQACancellationError.storageUnavailable }
    }

    private func exactKeys(_ data: Data, required: Set<String>, optional: Set<String> = []) -> Bool {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
        let keys = Set(object.keys)
        return required.isSubset(of: keys) && keys.isSubset(of: required.union(optional))
    }

    private func validRecordKeys(_ bytes: Data) -> Bool {
        guard exactKeys(bytes, required: ["command"], optional: ["receipt"]),
              let object = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              let command = object["command"],
              let commandBytes = try? JSONSerialization.data(withJSONObject: command),
              exactKeys(commandBytes, required: ["schemaVersion", "endpoint", "subject", "mobileEpoch", "sessionID", "requestID", "body"]) else { return false }
        if let receipt = object["receipt"] {
            guard let receiptBytes = try? JSONSerialization.data(withJSONObject: receipt),
                  exactKeys(receiptBytes, required: ["version", "sessionId", "requestId", "state", "ack"]) else { return false }
        }
        return true
    }
}

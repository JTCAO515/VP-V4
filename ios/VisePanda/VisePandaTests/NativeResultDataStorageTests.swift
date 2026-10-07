import Foundation
import Security
import Testing
@testable import VisePanda

@MainActor struct NativeResultDataStorageTests {
    private let actor = NativeCommunitySafetyActor(scope: .init(endpoint: "http://127.0.0.1:65170",
        subject: "22222222-2222-4222-8222-222222222222", mobileEpoch: 2, generation: 1),
        sessionID: "33333333-3333-4333-8333-333333333333")
    // Opaque storage evidence only, not a result-data command or server erasure proof.
    private let bytes = Data("local-result-confirmation-storage-fixture".utf8)
    private func journal(_ vault: ResultDataStorageVault) -> NativeResultDataJournal {
        .init(vault: vault, validateConfirmation: {
            guard $0.starts(with: Data("local-result-confirmation".utf8)) else { throw NativeDataError.invalidResponse }
        })
    }
    @Test func exactBytesSurviveRestartAndCannotCrossOwnerSessionEpochOrEndpoint() throws {
        let vault = ResultDataStorageVault(), saved = try journal(vault).retain(bytes, actor: actor)
        #expect(try journal(vault).read(actor) == saved)
        #expect(throws: (any Error).self) { try journal(vault).retain(Data("local-result-confirmation-replacement".utf8), actor: actor) }
        let epoch = NativeCommunitySafetyActor(scope: .init(endpoint: actor.scope.endpoint,
            subject: actor.scope.subject, mobileEpoch: 3, generation: 2), sessionID: actor.sessionID)
        let session = NativeCommunitySafetyActor(scope: actor.scope, sessionID: "44444444-4444-4444-8444-444444444444")
        #expect(throws: (any Error).self) { try journal(vault).read(epoch) }
        #expect(throws: (any Error).self) { try journal(vault).read(session) }
        for scope in [NativeDataScope(endpoint: "http://127.0.0.1:65171", subject: actor.scope.subject, mobileEpoch: 2, generation: 1),
                      NativeDataScope(endpoint: actor.scope.endpoint, subject: "55555555-5555-4555-8555-555555555555", mobileEpoch: 2, generation: 1)] {
            let other = NativeCommunitySafetyActor(scope: scope, sessionID: actor.sessionID)
            #expect(try journal(vault).read(other) == nil)
            #expect(throws: (any Error).self) { try journal(vault).complete(saved, actor: other) }
        }
        #expect(try journal(vault).read(actor)?.body == bytes)
    }
    @Test func storageFailuresNeverOverwriteOrDiscardPendingBytes() throws {
        let vault = ResultDataStorageVault(), store = journal(vault)
        let saved = try store.retain(bytes, actor: actor), writes = vault.writes
        vault.rejectRead = true
        #expect(throws: (any Error).self) { try store.retain(bytes, actor: actor) }
        #expect(throws: (any Error).self) { try store.complete(saved, actor: actor) }
        #expect(vault.writes == writes && vault.removals == 0)
        vault.rejectRead = false; vault.rejectRemoval = true
        #expect(throws: (any Error).self) { try store.complete(saved, actor: actor) }
        #expect(try store.read(actor) == saved)
        vault.rejectRemoval = false
        try store.complete(saved, actor: actor)
        #expect(try store.read(actor) == nil)
        _ = vault.write(Data("corrupt".utf8), service: NativeResultDataJournal.service(actor.scope.endpoint), owner: actor.scope.subject)
        let corruptWrites = vault.writes
        #expect(throws: (any Error).self) { try store.retain(bytes, actor: actor) }
        #expect(vault.writes == corruptWrites)
    }
    @Test func privateReceiptFilesRejectRootSymlinksAndVerifyCleanup() throws {
        let parent = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: parent) }
        let root = parent.appendingPathComponent("result-receipts", isDirectory: true)
        let unrelated = parent.appendingPathComponent("unselected-source.txt")
        try Data("keep".utf8).write(to: unrelated)
        let files = NativeResultDataReceiptFile(root: root)
        let receiptBytes = Data("opaque-private-receipt-file-fixture".utf8)
        let path = try files.write(receiptBytes)
        #expect(try Data(contentsOf: path) == receiptBytes)
        try files.clear()
        #expect(files.url == nil && files.ready)
        #expect(!FileManager.default.fileExists(atPath: path.path))
        #expect(try Data(contentsOf: unrelated) == Data("keep".utf8))
        let symlinkRoot = parent.appendingPathComponent("linked-root")
        try FileManager.default.createSymbolicLink(at: symlinkRoot, withDestinationURL: parent)
        let refused = NativeResultDataReceiptFile(root: symlinkRoot)
        #expect(!refused.ready)
        #expect(throws: (any Error).self) { try refused.write(receiptBytes) }
        #expect(try Data(contentsOf: unrelated) == Data("keep".utf8))
        let blocked = NativeResultDataReceiptFile(root: root, remove: { _ in throw NativeDataError.sessionUnavailable })
        _ = try blocked.write(receiptBytes)
        #expect(throws: (any Error).self) { try blocked.clear() }
        #expect(!blocked.ready && blocked.url == nil)
    }
    @Test func generationAndMonotonicDeadlineFenceLateResponses() throws {
        var lifetime = NativeResultDataLifetime(); lifetime.bind(actor)
        let generation = lifetime.generation
        #expect(lifetime.accepts(actor, generation: generation))
        lifetime.suspend(); lifetime.bind(actor)
        #expect(!lifetime.accepts(actor, generation: generation))
        let next = lifetime.generation
        lifetime.bind(nil)
        #expect(!lifetime.accepts(actor, generation: next))
        let wall = Date(timeIntervalSince1970: 1000)
        let lease = try NativeResultDataLease(start: 10, received: 15, now: wall, expiresAt: wall.addingTimeInterval(30))
        #expect(lease.valid(now: wall, uptime: 39))
        #expect(!lease.valid(now: wall.addingTimeInterval(-3600), uptime: 40))
        #expect(!lease.valid(now: wall, uptime: 9))
        #expect(!lease.valid(now: wall.addingTimeInterval(30), uptime: 20))
        #expect(throws: (any Error).self) { try NativeResultDataLease(start: 10, received: 40, now: wall, expiresAt: wall.addingTimeInterval(30)) }
        #expect(throws: (any Error).self) { try NativeResultDataLease(start: .nan, received: 15, now: wall, expiresAt: wall.addingTimeInterval(30)) }
    }
}

@MainActor private final class ResultDataStorageVault: NativeCredentialVault {
    private var values: [String: Data] = [:]
    var rejectRead = false
    var rejectRemoval = false
    private(set) var writes = 0
    private(set) var removals = 0
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        if rejectRead { return (errSecInteractionNotAllowed, nil) }
        guard let value = values[service + owner] else { return (errSecItemNotFound, nil) }
        return (errSecSuccess, value)
    }
    func write(_ data: Data, service: String, owner: String) -> OSStatus {
        writes += 1; values[service + owner] = data; return errSecSuccess
    }
    func remove(service: String, owner: String) -> OSStatus {
        if rejectRemoval { return errSecInteractionNotAllowed }
        removals += 1; values.removeValue(forKey: service + owner); return errSecSuccess
    }
}

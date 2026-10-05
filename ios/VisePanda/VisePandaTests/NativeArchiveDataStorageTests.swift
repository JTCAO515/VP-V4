import Foundation
import Security
import Testing
@testable import VisePanda

@MainActor struct NativeArchiveDataStorageTests {
    private let actor = NativeCommunitySafetyActor(scope: .init(endpoint: "http://127.0.0.1:65160",
        subject: "22222222-2222-4222-8222-222222222222", mobileEpoch: 2, generation: 1),
        sessionID: "33333333-3333-4333-8333-333333333333")
    private let wall = Date(timeIntervalSince1970: 1000)

    @Test func originalBytesSurviveRestartAndRefuseReplacementEpochAndSession() throws {
        let vault = ArchiveDataStorageVault()
        let bytes = Data("validated-export-fixture".utf8)
        let journal = NativeArchiveDataJournal(vault: vault, validateExport: {
            guard $0.starts(with: Data("validated-export".utf8)) else { throw NativeDataError.invalidResponse }
        })
        let saved = try journal.retain(bytes, actor: actor)
        let readback = try journal.read(actor)
        #expect(readback == saved)
        #expect(throws: (any Error).self) { try journal.retain(Data("validated-export-other".utf8), actor: actor) }
        let changedEpoch = NativeCommunitySafetyActor(scope: .init(endpoint: actor.scope.endpoint,
            subject: actor.scope.subject, mobileEpoch: 3, generation: 2), sessionID: actor.sessionID)
        #expect(throws: (any Error).self) { try journal.read(changedEpoch) }
        let changedSession = NativeCommunitySafetyActor(scope: actor.scope, sessionID: "55555555-5555-4555-8555-555555555555")
        #expect(throws: (any Error).self) { try journal.read(changedSession) }
        vault.rejectRemoval = true
        #expect(throws: (any Error).self) { try journal.complete(saved, actor: actor) }
        let preserved = try journal.read(actor)
        #expect(preserved == saved)
        vault.rejectRemoval = false
        try journal.complete(saved, actor: actor)
        let removed = try journal.read(actor)
        #expect(removed == nil)
    }

    @Test func lifetimeRejectsLateResponsesAndLeaseCannotBeRenewedByWallRollback() throws {
        var lifetime = NativeArchiveDataLifetime()
        lifetime.bind(actor)
        let generation = lifetime.generation
        #expect(lifetime.accepts(actor: actor, generation: generation))
        lifetime.suspend()
        #expect(!lifetime.accepts(actor: actor, generation: generation))
        lifetime.bind(actor)
        #expect(!lifetime.accepts(actor: actor, generation: generation))
        let lease = try NativeArchiveDataLease(start: 10, received: 15, now: wall, expiry: wall.addingTimeInterval(30))
        #expect(lease.valid(now: wall, uptime: 39))
        #expect(!lease.valid(now: wall.addingTimeInterval(-3600), uptime: 40))
        #expect(!lease.valid(now: wall, uptime: 9))
        #expect(throws: (any Error).self) { try NativeArchiveDataLease(start: 10, received: 40, now: wall, expiry: wall.addingTimeInterval(30)) }
    }

    @Test func fileHasExactBytesAndCleanupFailureBlocksPublicationAndNextWrite() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("archive-data-storage-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        var time: TimeInterval = 10, reject = false
        let file = NativeArchiveDataExportFile(root: root, remove: {
            if reject { throw NativeDataError.sessionUnavailable }
            try FileManager.default.removeItem(at: $0)
        }, now: { wall }, uptime: { time })
        let generation = UUID(), bytes = Data("exact-export-fixture".utf8)
        try file.write(bytes, actor: actor, generation: generation, started: 10, expiry: wall.addingTimeInterval(30),
            current: { actor }, currentGeneration: { generation })
        let path = try #require(file.visible(actor: actor, generation: generation))
        let readback = try Data(contentsOf: path)
        #expect(readback == bytes && path.lastPathComponent == "archive-data.json")
        let attributes = try FileManager.default.attributesOfItem(atPath: path.path)
        #expect((attributes[.posixPermissions] as? NSNumber)?.intValue == 0o600)
        #expect(try path.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true)
        time = 40; reject = true
        #expect(file.visible(actor: actor, generation: generation) == nil)
        #expect(throws: (any Error).self) { try file.tick(actor: actor, generation: generation) }
        #expect(!file.ready)
        #expect(throws: (any Error).self) {
            try file.write(bytes, actor: actor, generation: generation, started: 40, expiry: wall.addingTimeInterval(30),
                current: { actor }, currentGeneration: { generation })
        }
        reject = false; try file.clear()
        #expect(try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).isEmpty)
    }
}

@MainActor private final class ArchiveDataStorageVault: NativeCredentialVault {
    private var values: [String: Data] = [:]
    var rejectRemoval = false
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        guard let value = values[service + owner] else { return (errSecItemNotFound, nil) }
        return (errSecSuccess, value)
    }
    func write(_ data: Data, service: String, owner: String) -> OSStatus { values[service + owner] = data; return errSecSuccess }
    func remove(service: String, owner: String) -> OSStatus {
        if rejectRemoval { return errSecInteractionNotAllowed }
        values.removeValue(forKey: service + owner); return errSecSuccess
    }
}

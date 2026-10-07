import Foundation
import Security
import Testing
@testable import VisePanda

@MainActor struct NativeTurnDataTests {
    private var actor: NativeCommunitySafetyActor {
        .init(scope: .init(endpoint: "http://127.0.0.1:65170", subject: "00000000-0000-4000-8000-000000000001", mobileEpoch: 3, generation: 1),
              sessionID: "00000000-0000-4000-8000-000000000002")
    }
    private var otherTurn: String { "00000000-0000-4000-8000-000000000004" }
    private var erasedTurn: String { "00000000-0000-4000-8000-000000000003" }
    @Test func actorEpochAndBackgroundInvalidateLateReadAuthority() throws {
        var lifetime = NativeTurnDataLifetime()
        lifetime.bind(actor); let captured = lifetime.generation
        #expect(lifetime.accepts(actor, generation: captured))
        lifetime.suspend()
        #expect(!lifetime.accepts(actor, generation: captured))
        lifetime.bind(actor)
        #expect(!lifetime.accepts(actor, generation: captured))
        let changed = NativeCommunitySafetyActor(scope: .init(endpoint: actor.scope.endpoint, subject: actor.scope.subject,
            mobileEpoch: 4, generation: 1), sessionID: actor.sessionID)
        #expect(!lifetime.accepts(changed, generation: lifetime.generation))
    }
    @Test func previewAuthorityCannotRenewWithLateArrivalOrClockRollback() throws {
        let wall = Date(timeIntervalSince1970: 1_800_000_000)
        let lease = try NativeTurnDataLease(start: 100, received: 120, now: wall, expiresAt: wall.addingTimeInterval(30))
        #expect(lease.valid(now: wall.addingTimeInterval(9), uptime: 129))
        #expect(!lease.valid(now: wall.addingTimeInterval(-100), uptime: 130))
        #expect(!lease.valid(now: wall, uptime: 99))
        #expect(throws: (any Error).self) { try NativeTurnDataLease(start: 100, received: 130, now: wall, expiresAt: wall.addingTimeInterval(30)) }
    }
    @Test func erasureRejectsOldReadAndPreservesFreshUnselectedTurn() throws {
        var fence = NativeTurnDataProjectionFence(); fence.bind(actor)
        let old = try fence.capture(actor)
        let unselected = try fence.capture(actor, turnID: otherTurn)
        let selected = try fence.capture(actor, turnID: erasedTurn)
        try fence.recordVerifiedErasure(turnIDs: [erasedTurn], actor: actor)
        #expect(!fence.accepts(old))
        #expect(fence.accepts(unselected))
        #expect(!fence.accepts(selected))
        let fresh = try fence.capture(actor)
        #expect(fence.accepts(fresh))
        #expect(fence.turnIDs == [erasedTurn])
        #expect(throws: (any Error).self) { try fence.recordVerifiedErasure(turnIDs: ["invalid"], actor: actor) }
    }
    @Test func pendingJournalKeepsExactBytesAcrossUnknownAckAndRefusesReplacement() throws {
        let vault = TurnDataSafetyVault()
        // Local journal authority probe; not a server command or source fixture.
        let original = Data(" { \"localJournalProbe\" : true } ".utf8)
        let journal = NativeTurnDataJournal(vault: vault, validateConfirmation: { body in
            guard body == original else { throw NativeDataError.invalidResponse }
        })
        let pending = try journal.retain(original, actor: actor)
        #expect(try journal.read(actor)?.body == original)
        #expect(try journal.retain(original, actor: actor) == pending)
        #expect(throws: (any Error).self) { try journal.retain(Data("{}".utf8), actor: actor) }
        #expect(try journal.read(actor) == pending)
        vault.refuseRemoval = true
        #expect(throws: (any Error).self) { try journal.complete(pending, actor: actor) }
        #expect(try journal.read(actor) == pending)
        vault.refuseRemoval = false
        try journal.complete(pending, actor: actor)
        #expect(try journal.read(actor) == nil)
    }
    @Test func privateReceiptExpiresPhysicallyAndCannotCrossActor() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("turn-data-tests-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let file = NativeTurnDataReceiptFile(root: root)
        let wall = Date(timeIntervalSince1970: 1_800_000_000), bytes = Data("local verified receipt storage probe".utf8)
        let url = try file.write(bytes, actor: actor, now: wall, uptime: 100)
        #expect(try Data(contentsOf: url) == bytes)
        #expect(try file.selectedFile(actor, now: wall, uptime: 129) == url)
        #expect(try file.selectedFile(actor, now: wall.addingTimeInterval(-100), uptime: 130) == nil)
        #expect(!FileManager.default.fileExists(atPath: url.path))
        _ = try file.write(bytes, actor: actor, now: wall, uptime: 200)
        #expect(try file.selectedFile(nil, now: wall, uptime: 201) == nil)
        #expect(try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).isEmpty)
    }
    @Test func failedPhysicalPurgeDeniesAccessAndKeepsFailureVisible() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("turn-data-tests-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        var refuse = false
        let file = NativeTurnDataReceiptFile(root: root, remove: { path in
            if refuse { throw NativeDataError.sessionUnavailable }
            try FileManager.default.removeItem(at: path)
        })
        let wall = Date(timeIntervalSince1970: 1_800_000_000)
        _ = try file.write(Data("local receipt storage probe".utf8), actor: actor, now: wall, uptime: 100)
        refuse = true
        #expect(throws: (any Error).self) { try file.clear() }
        #expect(!file.ready)
        #expect(try file.selectedFile(actor, now: wall, uptime: 101) == nil)
    }
}

@MainActor private final class TurnDataSafetyVault: NativeCredentialVault {
    private var values: [String: Data] = [:]
    var refuseRemoval = false
    private func key(_ service: String, _ owner: String) -> String { service + "|" + owner }
    func write(_ data: Data, service: String, owner: String) -> OSStatus { values[key(service, owner)] = data; return errSecSuccess }
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        let value = values[key(service, owner)]; return (value == nil ? errSecItemNotFound : errSecSuccess, value)
    }
    func remove(service: String, owner: String) -> OSStatus {
        guard !refuseRemoval else { return errSecInteractionNotAllowed }
        values.removeValue(forKey: key(service, owner)); return errSecSuccess
    }
}

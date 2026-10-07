import Foundation
import Security
import Testing
@testable import VisePanda

@MainActor struct NativeConversationDataStorageTests {
    private let actor = NativeCommunitySafetyActor(scope: .init(endpoint: "http://127.0.0.1:65160",
        subject: "22222222-2222-4222-8222-222222222222", mobileEpoch: 2, generation: 1),
        sessionID: "33333333-3333-4333-8333-333333333333")
    // Opaque local storage fixture; this is not a producer command or source-graph proof.
    private let bytes = Data("local-confirmation-storage-fixture".utf8)

    private func journal(_ vault: ConversationDataStorageVault) -> NativeConversationDataJournal {
        .init(vault: vault, validateConfirmation: {
            guard $0.starts(with: Data("local-confirmation".utf8)) else { throw NativeDataError.invalidResponse }
        })
    }

    @Test func restartPreservesExactBytesAndSessionEpochOwnerFence() throws {
        let vault = ConversationDataStorageVault()
        let saved = try journal(vault).retain(bytes, actor: actor)
        let reopened = journal(vault)
        #expect(try reopened.read(actor)?.body == bytes)
        #expect(throws: (any Error).self) { try reopened.retain(Data("local-confirmation-other".utf8), actor: actor) }
        let epoch = NativeCommunitySafetyActor(scope: .init(endpoint: actor.scope.endpoint,
            subject: actor.scope.subject, mobileEpoch: 3, generation: 2), sessionID: actor.sessionID)
        let session = NativeCommunitySafetyActor(scope: actor.scope, sessionID: "55555555-5555-4555-8555-555555555555")
        #expect(throws: (any Error).self) { try reopened.read(epoch) }
        #expect(throws: (any Error).self) { try reopened.read(session) }
        let otherOwner = NativeCommunitySafetyActor(scope: .init(endpoint: actor.scope.endpoint,
            subject: "44444444-4444-4444-8444-444444444444", mobileEpoch: 2, generation: 1), sessionID: actor.sessionID)
        #expect(try reopened.read(otherOwner) == nil)
        #expect(throws: (any Error).self) { try reopened.complete(saved, actor: otherOwner) }
        #expect(try reopened.read(actor) == saved)
        vault.rejectRemoval = true
        #expect(throws: (any Error).self) { try reopened.complete(saved, actor: actor) }
        #expect(try reopened.read(actor) == saved)
        vault.rejectRemoval = false
        try reopened.complete(saved, actor: actor)
        #expect(try reopened.read(actor) == nil)
    }

    @Test func unreadableOrCorruptJournalCannotBeReplacedOrErased() throws {
        let vault = ConversationDataStorageVault(), store = journal(vault)
        _ = try store.retain(bytes, actor: actor)
        let writes = vault.writes
        vault.rejectRead = true
        #expect(throws: (any Error).self) { try store.retain(bytes, actor: actor) }
        #expect(throws: (any Error).self) {
            try NativeConversationDataJournal.erase(endpoint: actor.scope.endpoint, owner: actor.scope.subject, vault: vault)
        }
        #expect(vault.writes == writes && vault.removals == 0)
        vault.rejectRead = false
        _ = vault.write(Data("corrupt-envelope".utf8), service: NativeConversationDataJournal.service(actor.scope.endpoint), owner: actor.scope.subject)
        let corruptedWrites = vault.writes
        #expect(throws: (any Error).self) { try store.retain(bytes, actor: actor) }
        #expect(vault.writes == corruptedWrites && vault.removals == 0)
    }

    @Test func lateResponsesAndClockRollbackCannotRenewAuthority() throws {
        var lifetime = NativeConversationDataLifetime()
        lifetime.bind(actor)
        let generation = lifetime.generation
        #expect(lifetime.accepts(actor: actor, generation: generation))
        lifetime.invalidate()
        #expect(!lifetime.accepts(actor: actor, generation: generation))
        let next = lifetime.generation
        lifetime.suspend()
        lifetime.bind(actor)
        #expect(!lifetime.accepts(actor: actor, generation: next))
        lifetime.bind(nil)
        #expect(!lifetime.accepts(actor: nil, generation: lifetime.generation))
        let wall = Date(timeIntervalSince1970: 1000)
        let lease = try NativeConversationDataLease(start: 10, received: 15, now: wall,
            expiresAt: wall.addingTimeInterval(30), maximumAge: 30)
        #expect(lease.valid(now: wall, uptime: 39))
        #expect(!lease.valid(now: wall.addingTimeInterval(-3600), uptime: 40))
        #expect(!lease.valid(now: wall, uptime: 9))
        #expect(!lease.valid(now: wall.addingTimeInterval(30), uptime: 20))
        #expect(throws: (any Error).self) {
            try NativeConversationDataLease(start: 10, received: 40, now: wall,
                expiresAt: wall.addingTimeInterval(30), maximumAge: 30)
        }
    }
}

@MainActor private final class ConversationDataStorageVault: NativeCredentialVault {
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
        removals += 1
        if rejectRemoval { return errSecInteractionNotAllowed }
        values.removeValue(forKey: service + owner); return errSecSuccess
    }
}

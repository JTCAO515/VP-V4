import Foundation
import Security
import Testing
@testable import VisePanda

@MainActor
struct NativeQACancellationJournalTests {
    private var scope: NativeDataScope {
        NativeDataScope(endpoint: "https://synthetic.invalid", subject: "11111111-1111-4111-8111-111111111111", mobileEpoch: 1, generation: 1)
    }
    private func target(_ scope: NativeDataScope, request: String = UUID().uuidString.lowercased()) -> NativeQACancellationTarget {
        NativeQACancellationTarget(scope: scope, sessionID: "22222222-2222-4222-8222-222222222222", requestID: request, canRequestStop: false)
    }
    private func receipt(_ command: NativeQACancellationPending, state: NativeQACancellationReceipt.State = .cancelled,
                         ack: NativeQACancellationReceipt.Ack = .observed) -> NativeQACancellationReceipt {
        .init(version: "qa-cancellation/1", sessionId: command.sessionID, requestId: command.requestID, state: state, ack: ack)
    }
    private func changed(_ field: String) -> NativeDataScope? {
        if field == "nil" { return nil }
        return NativeDataScope(endpoint: field == "endpoint" ? "https://other.invalid" : scope.endpoint,
            subject: field == "owner" ? "33333333-3333-4333-8333-333333333333" : scope.subject,
            mobileEpoch: field == "epoch" ? 2 : scope.mobileEpoch, generation: field == "generation" ? 2 : scope.generation)
    }

    @Test func custodyReadbackUnknownReopenAndExactBody() throws {
        let vault = SyntheticCancellationVault(), live = CancellationLiveScope(scope)
        let selected = target(scope), journal = NativeQACancellationJournal(vault: vault, currentScope: { live.value })
        let command = try NativeQACancellationPending(target: selected)
        try journal.retainCancellation(command, scope: scope)
        #expect(vault.events.map(\.operation) == ["read", "read", "write", "read"])
        #expect(command.body == Data("{}".utf8))
        let original = vault.item(scope)
        try journal.retainCancellation(command, scope: scope)
        #expect(vault.item(scope) == original)
        #expect(vault.writes == 1)
        live.value = NativeDataScope(endpoint: scope.endpoint, subject: scope.subject, mobileEpoch: scope.mobileEpoch, generation: 2)
        let next = target(try #require(live.value), request: selected.requestID)
        let reopened = NativeQACancellationJournal(vault: vault, currentScope: { live.value })
        let restored = try #require(try reopened.loadCancellation(target: next))
        #expect(restored.command == command)
        #expect(restored.receipt == nil)
        #expect(try NativeQARequest.requestCancellation(restored.command).body == command.body)
        #expect(NativeQARequest.readCancellation(sessionID: command.sessionID, requestID: command.requestID).method == "GET")
        #expect(vault.events.allSatisfy { $0.service == NativeQACancellationJournal.service(scope.endpoint) && $0.owner == scope.subject })
    }

    @Test(arguments: [NativeQACancellationReceipt.State.cancelled, .terminal])
    func observedTombstoneSurvivesReopenAndRetain(state: NativeQACancellationReceipt.State) throws {
        let vault = SyntheticCancellationVault(), selected = target(scope)
        let journal = NativeQACancellationJournal(vault: vault, currentScope: { scope })
        let command = try NativeQACancellationPending(target: selected)
        let proof = receipt(command, state: state)
        try journal.retainCancellation(command, scope: scope)
        try journal.finishCancellation(command, receipt: proof, scope: scope)
        #expect(vault.removes == 0)
        let bytes = vault.item(scope)
        try journal.finishCancellation(command, receipt: proof, scope: scope)
        try journal.retainCancellation(command, scope: scope)
        #expect(vault.item(scope) == bytes)
        let restored = try #require(try NativeQACancellationJournal(vault: vault, currentScope: { scope }).loadCancellation(target: selected))
        #expect(restored.command == command)
        #expect(restored.receipt == proof)
        #expect(vault.writes == 2)
    }

    @Test(arguments: ["write", "readbackMismatch", "readbackFailure", "readbackAbsent"])
    func retainFailuresDoNotReturnCustody(mode: String) throws {
        let vault = SyntheticCancellationVault()
        if mode == "write" { vault.writeStatus = errSecAuthFailed }
        vault.onWrite = {
            if mode == "readbackMismatch" { vault.set(Data("corrupt".utf8), scope: scope) }
            if mode == "readbackFailure" { vault.readStatus = errSecAuthFailed }
            if mode == "readbackAbsent" { vault.set(nil, scope: scope) }
        }
        let journal = NativeQACancellationJournal(vault: vault, currentScope: { scope })
        #expect(throws: (any Error).self) { try journal.retainCancellation(NativeQACancellationPending(target: target(scope)), scope: scope) }
        #expect(vault.removes == 0)
    }

    @Test func retainedLedgerCASDetectsReplacementBeforeWrite() throws {
        let vault = SyntheticCancellationVault()
        let journal = NativeQACancellationJournal(vault: vault, currentScope: { scope })
        let first = try NativeQACancellationPending(target: target(scope))
        try journal.retainCancellation(first, scope: scope)
        let original = try #require(vault.item(scope))
        let replacement = try changedRevision(original)
        var once = true
        vault.onRead = {
            if once { once = false; vault.set(replacement, scope: scope) }
        }
        #expect(throws: (any Error).self) { try journal.retainCancellation(NativeQACancellationPending(target: target(scope)), scope: scope) }
        #expect(vault.item(scope) == replacement)
        #expect(vault.writes == 1)
    }

    @Test func full32IncludesObservedAndUnknownAndNeverEvicts() throws {
        let vault = SyntheticCancellationVault()
        let store = NativeQACancellationJournal(vault: vault, currentScope: { scope })
        var commands: [NativeQACancellationPending] = []
        for index in 0..<32 {
            let command = try NativeQACancellationPending(target: target(scope))
            commands.append(command)
            try store.retainCancellation(command, scope: scope)
            if index.isMultiple(of: 2) { try store.finishCancellation(command, receipt: receipt(command), scope: scope) }
        }
        let original = vault.item(scope)
        #expect(try store.inventory(scope: scope).totalRecords == 32)
        #expect(throws: NativeQACancellationJournal.Failure.capacityExceeded) {
            try store.retainCancellation(NativeQACancellationPending(target: target(scope)), scope: scope)
        }
        #expect(vault.item(scope) == original)
        try store.retainCancellation(commands[0], scope: scope)
        #expect(vault.item(scope) == original)
        for (index, command) in commands.enumerated() {
            let record = try #require(try store.loadCancellation(target: target(scope, request: command.requestID)))
            #expect(record.command == command)
            #expect((record.receipt != nil) == index.isMultiple(of: 2))
        }
    }

    @Test func capacityIsAcrossEpochsAndOldEpochIsNeverRebound() throws {
        let vault = SyntheticCancellationVault(), live = CancellationLiveScope(scope)
        let journal = NativeQACancellationJournal(vault: vault, currentScope: { live.value })
        var first: NativeQACancellationPending?
        for _ in 0..<16 {
            let command = try NativeQACancellationPending(target: target(scope))
            first = command
            try journal.retainCancellation(command, scope: scope)
        }
        let next = try #require(changed("epoch"))
        live.value = next
        let sameIDs = target(next, request: try #require(first).requestID)
        try journal.retainCancellation(NativeQACancellationPending(target: sameIDs), scope: next)
        for _ in 0..<15 { try journal.retainCancellation(NativeQACancellationPending(target: target(next)), scope: next) }
        let inventory = try journal.inventory(scope: next)
        #expect(inventory.totalRecords == 32)
        #expect(inventory.records.count == 16)
        #expect(inventory.records.allSatisfy { $0.mobileEpoch == 2 })
        let original = vault.item(scope)
        #expect(throws: NativeQACancellationJournal.Failure.capacityExceeded) {
            try journal.retainCancellation(NativeQACancellationPending(target: target(next)), scope: next)
        }
        #expect(throws: (any Error).self) { try journal.loadCancellation(target: target(scope, request: try #require(first).requestID)) }
        #expect(vault.item(scope) == original)
    }

    @Test func encodedRecord4096LimitRejectsBeforeWriting() throws {
        let endpoint = "https://synthetic.invalid/" + String(repeating: "\u{0001}", count: 1900)
        let oversized = NativeDataScope(endpoint: endpoint, subject: scope.subject, mobileEpoch: 1, generation: 1)
        let vault = SyntheticCancellationVault()
        let store = NativeQACancellationJournal(vault: vault, currentScope: { oversized })
        let command = try NativeQACancellationPending(target: target(oversized))
        #expect(command.valid)
        #expect(throws: NativeQACancellationJournal.Failure.recordTooLarge) { try store.retainCancellation(command, scope: oversized) }
        #expect(vault.writes == 0)
    }

    @Test(arguments: ["endpoint", "owner", "epoch", "generation", "nil"])
    func scopeFenceBeforeAndDuringWrite(field: String) throws {
        let vault = SyntheticCancellationVault(), live = CancellationLiveScope(scope)
        let journal = NativeQACancellationJournal(vault: vault, currentScope: { live.value })
        let command = try NativeQACancellationPending(target: target(scope))
        live.value = changed(field)
        #expect(throws: (any Error).self) { try journal.retainCancellation(command, scope: scope) }
        #expect(vault.events.isEmpty)
        live.value = scope
        vault.onWrite = { live.value = changed(field) }
        #expect(throws: (any Error).self) { try journal.retainCancellation(command, scope: scope) }
        #expect(vault.removes == 0)
    }

    @Test func lateGenerationFinishNeedsFreshLoadAndCannotTouchSuccessor() throws {
        let vault = SyntheticCancellationVault(), live = CancellationLiveScope(scope)
        let journal = NativeQACancellationJournal(vault: vault, currentScope: { live.value })
        let selected = target(scope), command = try NativeQACancellationPending(target: selected)
        try journal.retainCancellation(command, scope: scope)
        let next = try #require(changed("generation"))
        live.value = next
        let original = vault.item(scope)
        #expect(throws: (any Error).self) { try journal.finishCancellation(command, receipt: receipt(command), scope: scope) }
        #expect(throws: (any Error).self) { try journal.finishCancellation(command, receipt: receipt(command), scope: next) }
        #expect(vault.item(scope) == original)
        _ = try journal.loadCancellation(target: target(next, request: selected.requestID))
        try journal.finishCancellation(command, receipt: receipt(command), scope: next)
        #expect(vault.item(scope) != original)
    }

    @Test func finishRejectsUnobservedOrWrongReceiptsAndNeverOverwritesSeal() throws {
        let vault = SyntheticCancellationVault()
        let store = NativeQACancellationJournal(vault: vault, currentScope: { scope })
        let command = try NativeQACancellationPending(target: target(scope))
        try store.retainCancellation(command, scope: scope)
        let unknown = vault.item(scope)
        let invalid: [NativeQACancellationReceipt] = [receipt(command, state: .pending, ack: .unknown),
            receipt(command, state: .notObserved, ack: .unknown), receipt(command, ack: .unknown),
            .init(version: "qa-cancellation/1", sessionId: command.sessionID, requestId: UUID().uuidString.lowercased(), state: .cancelled, ack: .observed)]
        for proof in invalid {
            _ = try store.loadCancellation(target: target(scope, request: command.requestID))
            #expect(throws: (any Error).self) { try store.finishCancellation(command, receipt: proof, scope: scope) }
            #expect(vault.item(scope) == unknown)
        }
        _ = try store.loadCancellation(target: target(scope, request: command.requestID))
        try store.finishCancellation(command, receipt: receipt(command), scope: scope)
        let sealed = vault.item(scope)
        #expect(throws: (any Error).self) { try store.finishCancellation(command, receipt: receipt(command, state: .terminal), scope: scope) }
        #expect(vault.item(scope) == sealed)
        #expect(vault.removes == 0)
    }

    @Test(arguments: ["write", "mismatch", "cas"])
    func finishFailureKeepsUnknownOrFailsClosed(mode: String) throws {
        let vault = SyntheticCancellationVault()
        let store = NativeQACancellationJournal(vault: vault, currentScope: { scope })
        let command = try NativeQACancellationPending(target: target(scope))
        try store.retainCancellation(command, scope: scope)
        let original = try #require(vault.item(scope))
        if mode == "write" { vault.writeStatus = errSecAuthFailed }
        if mode == "mismatch" { vault.onWrite = { vault.set(Data("corrupt".utf8), scope: scope) } }
        if mode == "cas" {
            let replacement = try changedRevision(original)
            var once = true
            vault.onRead = { if once { once = false; vault.set(replacement, scope: scope) } }
        }
        #expect(throws: (any Error).self) { try store.finishCancellation(command, receipt: receipt(command), scope: scope) }
        if mode == "write" { #expect(vault.item(scope) == original) }
        #expect(vault.removes == 0)
    }

    @Test func replacementIdentityCannotBeSealedByOldCallback() throws {
        let vault = SyntheticCancellationVault()
        let store = NativeQACancellationJournal(vault: vault, currentScope: { scope })
        let selected = target(scope), command = try NativeQACancellationPending(target: selected)
        try store.retainCancellation(command, scope: scope)
        try NativeQACancellationJournal.erase(endpoint: scope.endpoint, owner: scope.subject, vault: vault, authorized: { true })
        try NativeQACancellationJournal(vault: vault, currentScope: { scope }).retainCancellation(command, scope: scope)
        let replacement = vault.item(scope)
        #expect(throws: (any Error).self) { try store.finishCancellation(command, receipt: receipt(command), scope: scope) }
        #expect(vault.item(scope) == replacement)
    }

    @Test(arguments: ["corrupt", "foreign", "oversized", "duplicate", "body"])
    func invalidLedgerNeverGetsOverwritten(mode: String) throws {
        let vault = SyntheticCancellationVault()
        let journal = NativeQACancellationJournal(vault: vault, currentScope: { scope })
        let selected = target(scope), command = try NativeQACancellationPending(target: selected)
        try journal.retainCancellation(command, scope: scope)
        if mode == "corrupt" { vault.set(Data("broken".utf8), scope: scope) }
        else {
            let originalBytes = try #require(vault.item(scope))
            var object = try #require(JSONSerialization.jsonObject(with: originalBytes) as? [String: Any])
            var entries = try #require(object["entries"] as? [[String: Any]])
            if mode == "duplicate" { entries.append(entries[0]) }
            else if mode == "oversized" { entries[0]["recordBytes"] = Data(repeating: 32, count: 4097).base64EncodedString() }
            else {
                let base64 = try #require(entries[0]["recordBytes"] as? String)
                let bytes = try #require(Data(base64Encoded: base64))
                var record = try #require(JSONSerialization.jsonObject(with: bytes) as? [String: Any])
                var pending = try #require(record["command"] as? [String: Any])
                if mode == "foreign" { pending["subject"] = "33333333-3333-4333-8333-333333333333" }
                if mode == "body" { pending["body"] = Data("{ }".utf8).base64EncodedString() }
                record["command"] = pending
                entries[0]["recordBytes"] = try JSONSerialization.data(withJSONObject: record).base64EncodedString()
            }
            object["entries"] = entries
            vault.set(try JSONSerialization.data(withJSONObject: object), scope: scope)
        }
        let original = vault.item(scope)
        #expect(throws: (any Error).self) { try journal.loadCancellation(target: selected) }
        #expect(throws: (any Error).self) { try journal.retainCancellation(command, scope: scope) }
        #expect(vault.item(scope) == original)
        #expect(vault.writes == 1)
    }

    @Test func inventoryIsMetadataOnlyAndScopeReadChangesFailClosed() throws {
        let vault = SyntheticCancellationVault(), live = CancellationLiveScope(scope)
        let journal = NativeQACancellationJournal(vault: vault, currentScope: { live.value })
        try journal.retainCancellation(NativeQACancellationPending(target: target(scope)), scope: scope)
        let inventory = try journal.inventory(scope: scope)
        let object = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(inventory)) as? [String: Any])
        #expect(Set(object.keys) == ["totalRecords", "records"])
        let row = try #require((object["records"] as? [[String: Any]])?.first)
        #expect(Set(row.keys) == ["mobileEpoch", "sessionID", "requestID"])
        vault.onRead = { live.value = nil }
        #expect(throws: (any Error).self) { try journal.inventory(scope: scope) }
        live.value = scope
        #expect(throws: (any Error).self) { try journal.loadCancellation(target: target(scope)) }
    }

    @Test func reentrantCapacityWriterIsRefused() throws {
        let vault = SyntheticCancellationVault()
        let journal = NativeQACancellationJournal(vault: vault, currentScope: { scope })
        let second = NativeQACancellationJournal(vault: vault, currentScope: { scope })
        vault.onWrite = {
            #expect(throws: (any Error).self) { try second.retainCancellation(NativeQACancellationPending(target: target(scope)), scope: scope) }
        }
        try journal.retainCancellation(NativeQACancellationPending(target: target(scope)), scope: scope)
        #expect(vault.writes == 1)
    }

    @Test func authorizedCleanupAfterScopeNilOnlyDeletesExactCancellationItem() throws {
        let vault = SyntheticCancellationVault(), live = CancellationLiveScope(scope)
        let journal = NativeQACancellationJournal(vault: vault, currentScope: { live.value })
        try journal.retainCancellation(NativeQACancellationPending(target: target(scope)), scope: scope)
        let other = try #require(changed("owner"))
        let foreign = NativeQACancellationJournal(vault: vault, currentScope: { other })
        try foreign.retainCancellation(NativeQACancellationPending(target: target(other)), scope: other)
        let preserved = vault.item(other)
        let generationService = "com.visepanda.native.qa-submission.v1." + scope.endpoint
        vault.put(Data("synthetic generation custody".utf8), service: generationService, owner: scope.subject)
        live.value = nil
        let permit = CancellationCleanupAuthority(scope)
        #expect(throws: (any Error).self) {
            try NativeQACancellationJournal.erase(endpoint: scope.endpoint, owner: scope.subject, vault: vault,
                authorized: { permit.allows(scope) })
        }
        #expect(vault.item(scope) != nil)
        permit.explicit = true
        permit.preserve = false
        #expect(!permit.allows(other))
        try NativeQACancellationJournal.erase(endpoint: scope.endpoint, owner: scope.subject, vault: vault,
            authorized: { permit.allows(scope) })
        #expect(vault.item(scope) == nil)
        #expect(vault.item(other) == preserved)
        #expect(vault.get(service: generationService, owner: scope.subject) == Data("synthetic generation custody".utf8))
    }

    @Test(arguments: ["denied", "read", "cas", "remove", "absence", "revoked"])
    func cleanupFailuresAreNotReportedAsErased(mode: String) throws {
        let vault = SyntheticCancellationVault(), permit = CancellationCleanupAuthority(scope)
        permit.explicit = true; permit.preserve = false
        vault.set(Data("synthetic corrupt metadata".utf8), scope: scope)
        if mode == "denied" { permit.preserve = true }
        if mode == "read" { vault.readStatus = errSecAuthFailed }
        if mode == "cas" { vault.onRead = { vault.set(Data("replacement".utf8), scope: scope) } }
        if mode == "remove" { vault.removeStatus = errSecAuthFailed }
        if mode == "absence" { vault.keepOnRemove = true }
        if mode == "revoked" { vault.onRemove = { permit.explicit = false } }
        #expect(throws: (any Error).self) {
            try NativeQACancellationJournal.erase(endpoint: scope.endpoint, owner: scope.subject, vault: vault,
                authorized: { permit.allows(scope) })
        }
        if ["denied", "read", "cas"].contains(mode) { #expect(vault.removes == 0) }
    }

    private func changedRevision(_ bytes: Data) throws -> Data {
        var object = try #require(JSONSerialization.jsonObject(with: bytes) as? [String: Any])
        object["revision"] = UUID().uuidString
        return try JSONSerialization.data(withJSONObject: object)
    }
}

/// Synthetic fault-injection only. No actual Keychain/credentials/provider calls.
@MainActor private final class SyntheticCancellationVault: NativeCredentialVault {
    private struct Key: Hashable { let service: String; let owner: String }
    struct Event { let operation: String; let service: String; let owner: String }
    private var values: [Key: Data] = [:]
    var writeStatus = errSecSuccess, readStatus = errSecSuccess, removeStatus = errSecSuccess
    var onRead: (() -> Void)?, onWrite: (() -> Void)?, onRemove: (() -> Void)?
    var keepOnRemove = false
    var events: [Event] = []
    var writes = 0, removes = 0
    func put(_ bytes: Data?, service: String, owner: String) { values[Key(service: service, owner: owner)] = bytes }
    func get(service: String, owner: String) -> Data? { values[Key(service: service, owner: owner)] }
    func set(_ bytes: Data?, scope: NativeDataScope) { put(bytes, service: NativeQACancellationJournal.service(scope.endpoint), owner: scope.subject) }
    func item(_ scope: NativeDataScope) -> Data? { get(service: NativeQACancellationJournal.service(scope.endpoint), owner: scope.subject) }
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        events.append(.init(operation: "read", service: service, owner: owner))
        let bytes = values[Key(service: service, owner: owner)]
        let result: (OSStatus, Data?) = readStatus == errSecSuccess ? (bytes == nil ? errSecItemNotFound : errSecSuccess, bytes) : (readStatus, nil)
        onRead?()
        return result
    }
    func write(_ data: Data, service: String, owner: String) -> OSStatus {
        events.append(.init(operation: "write", service: service, owner: owner)); writes += 1
        if writeStatus == errSecSuccess { values[Key(service: service, owner: owner)] = data }
        onWrite?()
        return writeStatus
    }
    func remove(service: String, owner: String) -> OSStatus {
        events.append(.init(operation: "remove", service: service, owner: owner)); removes += 1
        if removeStatus == errSecSuccess && !keepOnRemove { values[Key(service: service, owner: owner)] = nil }
        onRemove?()
        return removeStatus
    }
}
@MainActor private final class CancellationLiveScope {
    var value: NativeDataScope?
    init(_ scope: NativeDataScope) { value = scope }
}
@MainActor private final class CancellationCleanupAuthority {
    let scope: NativeDataScope
    var explicit = false, preserve = true
    init(_ scope: NativeDataScope) { self.scope = scope }
    func allows(_ original: NativeDataScope) -> Bool { explicit && !preserve && scope == original }
}

import Foundation
import Security
import Testing
@testable import VisePanda

@MainActor
struct NativeQAPendingJournalTests {
    private let scope = NativeDataScope(endpoint: "https://synthetic.invalid", subject: "synthetic-owner", mobileEpoch: 1, generation: 1)

    private func pending(_ scope: NativeDataScope, text: String = "synthetic question") throws -> NativeQAPending {
        let policy = NativeQAPolicy(id: UUID().uuidString, noticeHash: String(repeating: "a", count: 64),
                                    noticeZh: "synthetic", noticeEn: "synthetic", provider: "synthetic",
                                    recipient: "synthetic", consentState: .accepted, contextMode: "current_input_v1", maxTurns: nil)
        return try NativeQAPending(scope: scope, sessionID: UUID().uuidString, policy: policy, text: text)
    }

    @Test func retainPhysicallyReadsBeforeReturningAndIsIdempotent() throws {
        let vault = SyntheticQAVault()
        let journal = NativeQAPendingJournal(vault: vault, currentScope: { scope })
        let command = try pending(scope)
        try journal.retain(command, scope: scope)
        #expect(vault.events == ["read", "write", "read"])
        let original = vault.bytes
        try journal.retain(command, scope: scope)
        #expect(vault.bytes == original)
        #expect(vault.writes == 1)
        #expect(try journal.load(scope: scope) == command)
        #expect(vault.services == ["space.go2china.visepanda.nativeqa.pending.v1"])
    }

    @Test func unknownACKReopenPreservesNoncanonicalOriginalBody() throws {
        let vault = SyntheticQAVault()
        let original = try pending(scope)
        var object = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(original)) as? [String: Any])
        let body = Data("{ \"text\" : \"synthetic question\", \"requestId\" : \"\(original.requestID)\" }\n".utf8)
        object["body"] = body.base64EncodedString()
        let command = try JSONDecoder().decode(NativeQAPending.self, from: JSONSerialization.data(withJSONObject: object))
        #expect(command.valid)
        try NativeQAPendingJournal(vault: vault, currentScope: { scope }).retain(command, scope: scope)
        let reopened = NativeQAPendingJournal(vault: vault, currentScope: { scope })
        let recovered = try #require(try reopened.load(scope: scope))
        #expect(recovered.body == body)
        #expect(try NativeQARequest.submit(recovered).body == body)
        #expect(NativeQARequest.recover(sessionID: recovered.sessionID, requestID: recovered.requestID).method == "GET")
        #expect(vault.writes == 1)
    }

    @Test func differentPendingAndWrongRequestCannotOverwriteOrClear() throws {
        let vault = SyntheticQAVault()
        let journal = NativeQAPendingJournal(vault: vault, currentScope: { scope })
        let first = try pending(scope), other = try pending(scope)
        try journal.retain(first, scope: scope)
        let bytes = vault.bytes
        #expect(throws: (any Error).self) { try journal.retain(other, scope: scope) }
        #expect(vault.bytes == bytes)
        _ = try journal.load(scope: scope)
        #expect(throws: (any Error).self) { try journal.clearExact(other, scope: scope) }
        #expect(vault.removes == 0)
    }

    @Test(arguments: ["write", "mismatch", "readFailure", "missing"])
    func failedCustodyNeverReturnsSuccess(mode: String) throws {
        let vault = SyntheticQAVault()
        vault.writeStatus = mode == "write" ? errSecAuthFailed : errSecSuccess
        vault.onWrite = {
            if mode == "mismatch" { vault.bytes = Data("corrupt".utf8) }
            if mode == "readFailure" { vault.readStatus = errSecAuthFailed }
            if mode == "missing" { vault.bytes = nil }
        }
        let journal = NativeQAPendingJournal(vault: vault, currentScope: { scope })
        let command = try pending(scope)
        #expect(throws: (any Error).self) { try journal.retain(command, scope: scope) }
        #expect(vault.removes == 0)
    }

    @Test(arguments: ["endpoint", "owner", "epoch", "generation", "nil"])
    func scopeChangeDuringWriteFailsClosed(field: String) throws {
        let vault = SyntheticQAVault()
        let live = SyntheticQAScope(scope)
        let journal = NativeQAPendingJournal(vault: vault, currentScope: { live.value })
        let changed = changedScope(field)
        vault.onWrite = { live.value = changed }
        #expect(throws: (any Error).self) { try journal.retain(pending(scope), scope: scope) }
        #expect(vault.removes == 0)
    }

    @Test(arguments: ["endpoint", "owner", "epoch", "generation", "nil"])
    func staleScopeRefusesAllEntryPoints(field: String) throws {
        let vault = SyntheticQAVault()
        let changed = changedScope(field)
        let journal = NativeQAPendingJournal(vault: vault, currentScope: { changed })
        let command = try pending(scope)
        #expect(throws: (any Error).self) { try journal.load(scope: scope) }
        #expect(throws: (any Error).self) { try journal.retain(command, scope: scope) }
        #expect(throws: (any Error).self) { try journal.clearExact(command, scope: scope) }
        #expect(throws: (any Error).self) { try journal.metadata(scope: scope) }
        #expect(vault.events.isEmpty)
    }

    @Test func corruptRecordAndOldEpochRefuseReplacement() throws {
        let vault = SyntheticQAVault()
        let journal = NativeQAPendingJournal(vault: vault, currentScope: { scope })
        vault.bytes = Data("broken synthetic record".utf8)
        #expect(throws: (any Error).self) { try journal.retain(pending(scope), scope: scope) }
        #expect(vault.writes == 0)
        vault.bytes = nil
        try journal.retain(pending(scope), scope: scope)
        let epoch = NativeDataScope(endpoint: scope.endpoint, subject: scope.subject, mobileEpoch: 2, generation: 2)
        let reopened = NativeQAPendingJournal(vault: vault, currentScope: { epoch })
        #expect(throws: (any Error).self) { try reopened.load(scope: epoch) }
        #expect(throws: (any Error).self) { try reopened.retain(pending(epoch), scope: epoch) }
        #expect(vault.writes == 1)
    }

    @Test func sameCommandReplacementHasPrivateCASIdentity() throws {
        let vault = SyntheticQAVault()
        let journal = NativeQAPendingJournal(vault: vault, currentScope: { scope })
        let command = try pending(scope)
        try journal.retain(command, scope: scope)
        let old = vault.bytes
        vault.bytes = nil
        try NativeQAPendingJournal(vault: vault, currentScope: { scope }).retain(command, scope: scope)
        #expect(vault.bytes != old)
        #expect(throws: (any Error).self) { try journal.clearExact(command, scope: scope) }
        #expect(vault.removes == 0)
    }

    @Test(arguments: ["remove", "absence", "absenceError"])
    func deleteRequiresSuccessfulRemoveAndPhysicalAbsence(mode: String) throws {
        let vault = SyntheticQAVault()
        let journal = NativeQAPendingJournal(vault: vault, currentScope: { scope })
        let command = try pending(scope)
        try journal.retain(command, scope: scope)
        vault.removeStatus = mode == "remove" ? errSecAuthFailed : errSecSuccess
        vault.keepOnRemove = mode == "absence"
        if mode == "absenceError" { vault.onRemove = { vault.readStatus = errSecAuthFailed } }
        #expect(throws: (any Error).self) { try journal.clearExact(command, scope: scope) }
    }

    @Test func metadataIsMinimalAndClearAndAbandonAreExplicit() throws {
        let vault = SyntheticQAVault()
        let journal = NativeQAPendingJournal(vault: vault, currentScope: { scope })
        let command = try pending(scope)
        try journal.retain(command, scope: scope)
        let metadata = try #require(try journal.metadata(scope: scope))
        let object = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(metadata)) as? [String: Any])
        #expect(Set(object.keys) == ["requestID", "sessionID", "policyID", "noticeHash", "mobileEpoch"])
        #expect(metadata.requestID == command.requestID)
        try journal.clearExact(command, scope: scope)
        #expect(vault.bytes == nil)
        try journal.retain(command, scope: scope)
        try journal.abandonLocally(command, scope: scope)
        #expect(vault.bytes == nil)
    }

    @Test func eraseCorruptCustodyChecksScopeAndFixedKeyAndAbsence() throws {
        let vault = SyntheticQAVault()
        vault.bytes = Data("corrupt synthetic".utf8)
        try NativeQAPendingJournal.erase(endpoint: scope.endpoint, owner: scope.subject, vault: vault, authorized: { true })
        #expect(vault.bytes == nil)
        #expect(vault.removes == 1)
        #expect(vault.events == ["read", "read", "remove", "read"])
        try NativeQAPendingJournal.erase(endpoint: scope.endpoint, owner: scope.subject, vault: vault, authorized: { true })
        #expect(vault.removes == 1)
        #expect(throws: (any Error).self) {
            try NativeQAPendingJournal.erase(endpoint: scope.endpoint, owner: "other", vault: vault, authorized: { false })
        }
    }

    @Test func scopeChangesDuringReadExportAndEraseAreRejected() throws {
        let vault = SyntheticQAVault(), live = SyntheticQAScope(scope)
        let journal = NativeQAPendingJournal(vault: vault, currentScope: { live.value })
        try journal.retain(pending(scope), scope: scope)
        vault.onRead = { live.value = nil }
        #expect(throws: (any Error).self) { try journal.load(scope: scope) }
        live.value = scope
        #expect(throws: (any Error).self) { try journal.metadata(scope: scope) }
        live.value = scope
        #expect(throws: (any Error).self) {
            try NativeQAPendingJournal.erase(endpoint: scope.endpoint, owner: scope.subject, vault: vault, authorized: { live.value == scope })
        }
        #expect(vault.removes == 0)
    }

    @Test func reentrantWriterCannotInterleave() throws {
        let vault = SyntheticQAVault()
        let journal = NativeQAPendingJournal(vault: vault, currentScope: { scope })
        let second = NativeQAPendingJournal(vault: vault, currentScope: { scope })
        let command = try pending(scope)
        vault.onWrite = {
            #expect(throws: (any Error).self) { try second.retain(command, scope: scope) }
        }
        try journal.retain(command, scope: scope)
        #expect(vault.writes == 1)
    }

    @Test(arguments: ["owner", "endpoint"])
    func foreignStoredRecordFailsClosed(field: String) throws {
        let vault = SyntheticQAVault()
        let foreign = try #require(changedScope(field))
        try NativeQAPendingJournal(vault: vault, currentScope: { foreign }).retain(pending(foreign), scope: foreign)
        // Fault-inject the foreign item at the current key; never accept a matching key alone.
        let journal = NativeQAPendingJournal(vault: vault, currentScope: { scope })
        let bytes = vault.bytes
        #expect(throws: (any Error).self) { try journal.load(scope: scope) }
        #expect(throws: (any Error).self) { try journal.retain(pending(scope), scope: scope) }
        #expect(vault.bytes == bytes)
        #expect(vault.writes == 1)
    }

    @Test func generationNeedsNewSnapshotBeforeClearButReopenCanRecover() throws {
        let vault = SyntheticQAVault(), live = SyntheticQAScope(scope)
        let journal = NativeQAPendingJournal(vault: vault, currentScope: { live.value })
        let command = try pending(scope)
        try journal.retain(command, scope: scope)
        let next = try #require(changedScope("generation"))
        live.value = next
        #expect(throws: (any Error).self) { try journal.clearExact(command, scope: next) }
        #expect(vault.removes == 0)
        #expect(try journal.load(scope: next) == command)
        try journal.clearExact(command, scope: next)
        #expect(vault.bytes == nil)
    }

    @Test func replacementDuringFirstDeleteReadIsNotRemoved() throws {
        let vault = SyntheticQAVault()
        let journal = NativeQAPendingJournal(vault: vault, currentScope: { scope })
        let command = try pending(scope)
        try journal.retain(command, scope: scope)
        vault.onRead = { vault.bytes = Data("replacement synthetic".utf8) }
        #expect(throws: (any Error).self) { try journal.clearExact(command, scope: scope) }
        #expect(vault.removes == 0)
    }

    @Test(arguments: ["remove", "absence", "readFailure", "replacement", "scopeOnRemove"])
    func eraseFailuresNeverReportCompletion(mode: String) throws {
        let vault = SyntheticQAVault(), live = SyntheticQAScope(scope)
        vault.bytes = Data("synthetic corrupt".utf8)
        if mode == "remove" { vault.removeStatus = errSecAuthFailed }
        if mode == "absence" { vault.keepOnRemove = true }
        if mode == "readFailure" { vault.readStatus = errSecAuthFailed }
        if mode == "replacement" { vault.onRead = { vault.bytes = Data("replacement synthetic".utf8) } }
        if mode == "scopeOnRemove" { vault.onRemove = { live.value = nil } }
        #expect(throws: (any Error).self) {
            try NativeQAPendingJournal.erase(endpoint: scope.endpoint, owner: scope.subject, vault: vault, authorized: { live.value == scope })
        }
    }

    @Test func scopeChangeDuringClearNeverReturnsSuccess() throws {
        let vault = SyntheticQAVault(), live = SyntheticQAScope(scope)
        let journal = NativeQAPendingJournal(vault: vault, currentScope: { live.value })
        let command = try pending(scope)
        try journal.retain(command, scope: scope)
        vault.onRemove = { live.value = nil }
        #expect(throws: (any Error).self) { try journal.clearExact(command, scope: scope) }
    }

    @Test func explicitCleanupAfterLogoutNeedsIndependentAuthority() throws {
        let vault = SyntheticQAVault(), live = SyntheticQAScope(scope)
        let journal = NativeQAPendingJournal(vault: vault, currentScope: { live.value })
        let command = try pending(scope)
        try journal.retain(command, scope: scope)
        live.value = nil // Real Session fences its scope before explicit account cleanup.
        let cleanup = SyntheticQACleanup(endpoint: scope.endpoint, owner: scope.subject)
        #expect(throws: (any Error).self) { try journal.load(scope: scope) }
        #expect(throws: (any Error).self) {
            try NativeQAPendingJournal.erase(endpoint: scope.endpoint, owner: scope.subject, vault: vault,
                authorized: { cleanup.allows(endpoint: scope.endpoint, owner: scope.subject) })
        }
        #expect(vault.bytes != nil) // Expiry/401 preserve=true never erases.
        cleanup.explicit = true
        cleanup.preserve = false
        #expect(!cleanup.allows(endpoint: scope.endpoint, owner: "different"))
        #expect(!cleanup.allows(endpoint: "https://other.invalid", owner: scope.subject))
        try NativeQAPendingJournal.erase(endpoint: scope.endpoint, owner: scope.subject, vault: vault,
            authorized: { cleanup.allows(endpoint: scope.endpoint, owner: scope.subject) })
        #expect(vault.bytes == nil)
    }

    @Test func cleanupAuthorityRevokedAfterReadOrRemoveFailsClosed() throws {
        for revokeAtRemove in [false, true] {
            let vault = SyntheticQAVault()
            vault.bytes = Data("synthetic".utf8)
            let cleanup = SyntheticQACleanup(endpoint: scope.endpoint, owner: scope.subject)
            cleanup.explicit = true
            cleanup.preserve = false
            let revoke = { cleanup.explicit = false }
            if revokeAtRemove { vault.onRemove = revoke } else { vault.onRead = revoke }
            #expect(throws: (any Error).self) {
                try NativeQAPendingJournal.erase(endpoint: scope.endpoint, owner: scope.subject, vault: vault,
                    authorized: { cleanup.allows(endpoint: scope.endpoint, owner: scope.subject) })
            }
            #expect(vault.removes == (revokeAtRemove ? 1 : 0))
        }
    }

    private func changedScope(_ field: String) -> NativeDataScope? {
        if field == "nil" { return nil }
        return NativeDataScope(endpoint: field == "endpoint" ? "https://other.invalid" : scope.endpoint,
                               subject: field == "owner" ? "other" : scope.subject,
                               mobileEpoch: field == "epoch" ? 2 : scope.mobileEpoch,
                               generation: field == "generation" ? 2 : scope.generation)
    }
}

/// Synthetic in-memory fault injection; never accesses Keychain or live credentials.
@MainActor private final class SyntheticQAVault: NativeCredentialVault {
    var bytes: Data?
    var writeStatus = errSecSuccess
    var readStatus = errSecSuccess
    var removeStatus = errSecSuccess
    var keepOnRemove = false
    var onWrite: (() -> Void)?
    var onRead: (() -> Void)?
    var onRemove: (() -> Void)?
    var events: [String] = []
    var services: Set<String> = []
    var writes = 0
    var removes = 0
    func write(_ data: Data, service: String, owner: String) -> OSStatus {
        events.append("write"); services.insert(service); writes += 1
        if writeStatus == errSecSuccess { bytes = data }
        onWrite?()
        return writeStatus
    }
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        events.append("read"); services.insert(service)
        let result: (OSStatus, Data?) = readStatus == errSecSuccess ? (bytes == nil ? errSecItemNotFound : errSecSuccess, bytes) : (readStatus, nil)
        onRead?()
        return result
    }
    func remove(service: String, owner: String) -> OSStatus {
        events.append("remove"); services.insert(service); removes += 1
        if removeStatus == errSecSuccess && !keepOnRemove { bytes = nil }
        onRemove?()
        return removeStatus
    }
}
@MainActor private final class SyntheticQAScope {
    var value: NativeDataScope?
    init(_ value: NativeDataScope) { self.value = value }
}

/// Synthetic stand-in for Main's private explicit-account cleanup authority, never dispatch eligibility.
@MainActor private final class SyntheticQACleanup {
    let endpoint: String
    let owner: String
    var explicit = false
    var preserve = true
    init(endpoint: String, owner: String) { self.endpoint = endpoint; self.owner = owner }
    func allows(endpoint: String, owner: String) -> Bool {
        explicit && !preserve && self.endpoint == endpoint && self.owner == owner
    }
}

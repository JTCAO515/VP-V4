import Foundation
import Security
import Testing
@testable import VisePanda

@MainActor struct NativeCommunitySubmissionTests {
    static let actor = NativeDataScope(endpoint: "http://127.0.0.1:65148", subject: "22222222-2222-4222-8222-222222222222", mobileEpoch: 2, generation: 1)

    @Test func previewRequiresExplicitConsentAndCountsUTF16() {
        var draft = NativeCommunityDraft(title: "Experience", content: "Text", consent: false)
        #expect(!draft.valid)
        draft.consent = true; #expect(draft.valid)
        draft.title = String(repeating: "😀", count: 81); #expect(!draft.valid)
        draft.title = "Experience"; draft.content = String(repeating: "😀", count: 2001); #expect(!draft.valid)
        draft.content = " \n "; #expect(!draft.valid)
    }

    @Test func journalIsExactAndBoundToActorEndpointEpoch() throws {
        let vault = CommunityTestVault(), journal = NativeCommunityJournal(vault: vault)
        let body = Data("{\"action\":\"test\"}".utf8)
        let stored = try journal.retain(body: body, scope: Self.actor)
        #expect(try journal.read(Self.actor) == stored)
        #expect(throws: (any Error).self) { try journal.retain(body: Data("{\"action\":\"other\"}".utf8), scope: Self.actor) }
        let epoch = NativeDataScope(endpoint: Self.actor.endpoint, subject: Self.actor.subject, mobileEpoch: 3, generation: 1)
        #expect(throws: (any Error).self) { try journal.read(epoch) }
        let endpoint = NativeDataScope(endpoint: "http://127.0.0.1:65149", subject: Self.actor.subject, mobileEpoch: 2, generation: 1)
        #expect(try journal.read(endpoint) == nil)
        try journal.complete(stored, scope: Self.actor)
        #expect(try journal.read(Self.actor) == nil)
    }

    @Test func journalNeverClaimsStoredOrErasedAfterFailure() throws {
        let vault = CommunityTestVault(), journal = NativeCommunityJournal(vault: vault)
        let body = Data("{\"action\":\"test\"}".utf8)
        vault.failWrite = true
        #expect(throws: (any Error).self) { try journal.retain(body: body, scope: Self.actor) }
        vault.failWrite = false
        let pending = try journal.retain(body: body, scope: Self.actor)
        vault.failRemove = true
        #expect(throws: (any Error).self) { try journal.complete(pending, scope: Self.actor) }
        #expect(try journal.read(Self.actor) == pending)
        vault.failRemove = false
        try journal.complete(pending, scope: Self.actor)
    }

    @Test func exportPurgesAbandonedCopiesAndFencesFailedDeletion() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("CommunityTest-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        var refuse = false
        let files = NativeCommunityExportFile(root: root, remove: { url in
            if refuse { throw NativeDataError.sessionUnavailable }
            try FileManager.default.removeItem(at: url)
        })
        let first = try files.write(Data("{\"first\":true}".utf8))
        #expect(FileManager.default.fileExists(atPath: first.path))
        let relaunched = NativeCommunityExportFile(root: root)
        #expect(relaunched.ready && !FileManager.default.fileExists(atPath: first.path))
        _ = try files.write(Data("{\"second\":true}".utf8))
        refuse = true
        #expect(throws: (any Error).self) { try files.clear() }
        #expect(!files.ready && files.url == nil)
        refuse = false; try files.clear(); #expect(files.ready)
    }

    @Test func exportRejectsSymlinkRoot() throws {
        let base = FileManager.default.temporaryDirectory.appendingPathComponent("CommunityLinkTest-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: base) }
        let target = base.appendingPathComponent("target"), link = base.appendingPathComponent("link")
        try FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)
        let sentinel = target.appendingPathComponent("keep")
        try Data("private unrelated".utf8).write(to: sentinel)
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: target)
        let files = NativeCommunityExportFile(root: link)
        #expect(!files.ready)
        #expect(throws: (any Error).self) { try files.write(Data("{}".utf8)) }
        #expect(FileManager.default.fileExists(atPath: sentinel.path))
    }
}

@MainActor private final class CommunityTestVault: NativeCredentialVault {
    private var entries: [String: Data] = [:]
    var failWrite = false
    var failRemove = false
    private func key(_ service: String, _ owner: String) -> String { service + "\u{0}" + owner }
    func write(_ data: Data, service: String, owner: String) -> OSStatus {
        if failWrite { return errSecInteractionNotAllowed }
        entries[key(service, owner)] = data; return errSecSuccess
    }
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        guard let data = entries[key(service, owner)] else { return (errSecItemNotFound, nil) }
        return (errSecSuccess, data)
    }
    func remove(service: String, owner: String) -> OSStatus {
        if failRemove { return errSecInteractionNotAllowed }
        entries.removeValue(forKey: key(service, owner)); return errSecSuccess
    }
}

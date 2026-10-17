import XCTest
import Security
@testable import VisePanda

nonisolated final class NativeTranslationRecoveryJournalTests: XCTestCase {
    @MainActor private final class FakeVault: NativeCredentialVault {
        var items: [String: Data] = [:]
        var readStatus: OSStatus?
        var writeStatus: OSStatus = errSecSuccess
        var removeStatus: OSStatus = errSecSuccess
        var omitWrite = false
        var omitRemove = false
        var writeTransform: ((Data) -> Data)?
        var writes = 0
        var removes = 0
        private func key(_ service: String, _ owner: String) -> String { service + "|" + owner }
        func write(_ data: Data, service: String, owner: String) -> OSStatus {
            writes += 1
            if writeStatus == errSecSuccess && !omitWrite { items[key(service, owner)] = writeTransform?(data) ?? data }
            return writeStatus
        }
        func read(service: String, owner: String) -> (OSStatus, Data?) {
            let data = items[key(service, owner)]
            return (readStatus ?? (data == nil ? errSecItemNotFound : errSecSuccess), data)
        }
        func remove(service: String, owner: String) -> OSStatus {
            removes += 1
            if removeStatus == errSecSuccess && !omitRemove { items.removeValue(forKey: key(service, owner)) }
            return removeStatus
        }
        func replace(_ data: Data, scope: NativeDataScope) {
            items[key(NativeTranslationRecoveryJournal.service(scope.endpoint), scope.subject)] = data
        }
    }
    private let text = "请不要放花生 🥜 e\u{301}"
    @MainActor private func scope(owner: String = "00000000-0000-4000-8000-000000000001", epoch: Int = 1,
                       endpoint: String = "https://example.test/", generation: Int = 1) -> NativeDataScope {
        .init(endpoint: endpoint, subject: owner, mobileEpoch: epoch, generation: generation)
    }
    @MainActor private func identity(text: String? = nil, turn: String = "00000000-0000-4000-8000-000000000003") throws -> NativeTranslationRecoveryIdentity {
        try .init(threadId: "00000000-0000-4000-8000-000000000002", turnId: turn,
                  idempotencyKey: "00000000-0000-4000-8000-000000000004", policyId: "00000000-0000-4000-8000-000000000005",
                  noticeHash: String(repeating: "a", count: 64), sourceLocale: "zh", targetLocale: "en",
                  inputHash: NativeTranslationRecoveryIdentity.hashInput(text ?? self.text))
    }
    @MainActor private func receipt(_ identity: NativeTranslationRecoveryIdentity, state: String = "translated", includePhrase: Bool = true,
                         original: String? = nil, mutate: ((inout [String: Any]) -> Void)? = nil) throws -> Data {
        var phrase: [String: Any] = ["turnId": identity.turnId, "sourceLocale": identity.sourceLocale,
                                    "targetLocale": identity.targetLocale, "original": original ?? text, "state": state,
                                    "translation": state == "translated" ? "No peanuts" : NSNull(),
                                    "backTranslation": state == "translated" ? "不要花生" : NSNull()]
        if state != "translated" { phrase.removeValue(forKey: "translation"); phrase.removeValue(forKey: "backTranslation") }
        var result: [String: Any] = ["version": 1, "kind": "translation_recovery",
                                   "identity": try JSONSerialization.jsonObject(with: JSONEncoder().encode(identity)),
                                   "state": state, "phrase": includePhrase ? phrase : NSNull()]
        mutate?(&result)
        return try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
    }
    @MainActor func testReconstructedJournalPreservesPhysicalBytesAndIgnoresGeneration() async throws {
        let vault = FakeVault(), id = try identity(), s = scope()
        let record = try NativeTranslationRecoveryJournal(vault: vault).retain(id, scope: s)
        let reopened = NativeTranslationRecoveryJournal(vault: vault)
        XCTAssertEqual(try reopened.read(scope(generation: 999)), record)
        XCTAssertEqual(try reopened.read(s)?.bytes, record.bytes)
        XCTAssertEqual(vault.writes, 1)
        XCTAssertThrowsError(try reopened.retain(id, scope: s))
        XCTAssertThrowsError(try reopened.retain(identity(turn: "00000000-0000-4000-8000-000000000006"), scope: s))
        XCTAssertEqual(vault.writes, 1)
        let raw = String(decoding: record.bytes, as: UTF8.self)
        for forbidden in [text, "original", "translation\"", "tripId", "generation", "token", "prompt", "audio"] {
            XCTAssertFalse(raw.contains(forbidden), forbidden)
        }
    }
    @MainActor func testOwnerEndpointAndEpochIsolation() async throws {
        let vault = FakeVault(), journal = NativeTranslationRecoveryJournal(vault: FakeVault())
        XCTAssertNil(try journal.read(scope()))
        let j = NativeTranslationRecoveryJournal(vault: vault), a = try j.retain(identity(), scope: scope())
        XCTAssertNil(try j.read(scope(owner: "00000000-0000-4000-8000-000000000009")))
        XCTAssertNil(try j.read(scope(endpoint: "https://other.test/")))
        XCTAssertThrowsError(try j.read(scope(epoch: 2)))
        XCTAssertThrowsError(try j.retain(identity(), scope: scope(epoch: 2)))
        XCTAssertThrowsError(try j.abandonLocally(a, scope: scope(epoch: 2)))
        XCTAssertEqual(try j.read(scope()), a)
    }
    @MainActor func testStorageErrorsNeverMeanAbsent() async throws {
        for status in [errSecInteractionNotAllowed, errSecAuthFailed, errSecDecode, errSecSuccess] {
            let v = FakeVault(); v.readStatus = status
            let j = NativeTranslationRecoveryJournal(vault: v)
            XCTAssertThrowsError(try j.read(scope()))
            XCTAssertThrowsError(try j.retain(identity(), scope: scope()))
            XCTAssertEqual(v.writes, 0)
        }
        let v = FakeVault(), j = NativeTranslationRecoveryJournal(vault: v)
        _ = try j.retain(identity(), scope: scope()); v.readStatus = errSecItemNotFound
        XCTAssertThrowsError(try j.read(scope())) // NotFound plus bytes is contradictory.
    }
    @MainActor func testWriteFailureAndPhysicalReadbackFailureDenySendPermit() async throws {
        let v = FakeVault(), j = NativeTranslationRecoveryJournal(vault: v)
        v.writeStatus = errSecInteractionNotAllowed
        XCTAssertThrowsError(try j.retain(identity(), scope: scope()))
        v.writeStatus = errSecSuccess; v.omitWrite = true
        XCTAssertThrowsError(try j.retain(identity(), scope: scope()))
        v.omitWrite = false; v.writeTransform = { _ in Data("{}".utf8) }
        XCTAssertThrowsError(try j.retain(identity(), scope: scope()))
        XCTAssertThrowsError(try j.read(scope()))
    }
    @MainActor func testCorruptionUnknownFieldsTypesDuplicatesAndSizeFailClosed() async throws {
        let v = FakeVault(), j = NativeTranslationRecoveryJournal(vault: v), s = scope()
        let r = try j.retain(identity(), scope: s)
        let good = String(decoding: r.bytes, as: UTF8.self)
        let broken = ["{", "[]", "{}", String(repeating: "x", count: 4097),
                      good.replacingOccurrences(of: "\"version\":1", with: "\"version\":true"),
                      good.replacingOccurrences(of: "\"version\":1", with: "\"version\":2"),
                      good.replacingOccurrences(of: "\"mobileEpoch\":1", with: "\"mobileEpoch\":\"1\""),
                      good.replacingOccurrences(of: "\"version\":1", with: "\"version\":1,\"version\":1"),
                      good.replacingOccurrences(of: "\"version\":1", with: "\"version\":1,\"ver\\u0073ion\":1"),
                      good.replacingOccurrences(of: "\"inputHash\":", with: "\"inputHash\":\"bad\",\"inputHash\":"),
                      good.replacingOccurrences(of: "\"version\":1", with: "\"version\":1,\"privateText\":\"secret\"")]
        for b in broken {
            v.replace(Data(b.utf8), scope: s)
            XCTAssertThrowsError(try j.read(s), b)
            XCTAssertThrowsError(try j.retain(identity(), scope: s))
        }
        XCTAssertEqual(v.writes, 1)
    }
    @MainActor func testCompareUsesExactBytesAndMissingIsNotCompletion() async throws {
        let v = FakeVault(), j = NativeTranslationRecoveryJournal(vault: v), s = scope()
        let r = try j.retain(identity(), scope: s)
        v.replace(r.bytes + Data(" ".utf8), scope: s)
        XCTAssertThrowsError(try j.abandonLocally(r, scope: s))
        XCTAssertEqual(v.removes, 0)
        let current = try XCTUnwrap(j.read(s))
        try j.abandonLocally(current, scope: s)
        XCTAssertThrowsError(try j.abandonLocally(current, scope: s))
        XCTAssertEqual(v.removes, 1)
    }
    @MainActor func testUnknownPendingAndNullTerminalCannotComplete() async throws {
        let v = FakeVault(), j = NativeTranslationRecoveryJournal(vault: v), s = scope(), id = try identity()
        let r = try j.retain(id, scope: s)
        for state in ["unknown", "pending", "cancelled", "unavailable", "needs_review"] {
            let proof = try NativeTranslationRecoveryReceipt.verify(receipt(id, state: state, includePhrase: false), original: id)
            XCTAssertFalse(proof.permitsCompletion)
            XCTAssertThrowsError(try j.complete(r, verifiedReceipt: proof, scope: s))
            XCTAssertEqual(try j.read(s), r)
        }
        let pending = try NativeTranslationRecoveryReceipt.verify(receipt(id, state: "pending"), original: id)
        XCTAssertThrowsError(try j.complete(r, verifiedReceipt: pending, scope: s))
        XCTAssertEqual(v.removes, 0)
    }
    @MainActor func testEachSourceTerminalCompletesAndLocalAbandonNeedsNoReceipt() async throws {
        for state in ["translated", "cancelled", "unavailable", "needs_review"] {
            let v = FakeVault(), j = NativeTranslationRecoveryJournal(vault: v), s = scope(), id = try identity()
            let r = try j.retain(id, scope: s)
            let proof = try NativeTranslationRecoveryReceipt.verify(receipt(id, state: state), original: id)
            XCTAssertTrue(proof.permitsCompletion)
            try j.complete(r, verifiedReceipt: proof, scope: s)
            XCTAssertNil(try j.read(s))
            XCTAssertEqual(v.removes, 1)
        }
        let v = FakeVault(), j = NativeTranslationRecoveryJournal(vault: v)
        let r = try j.retain(identity(), scope: scope())
        try j.abandonLocally(r, scope: scope())
        XCTAssertNil(try j.read(scope()))
        XCTAssertEqual(v.writes, 1)
    }
    @MainActor func testRemoveFailureAndReadbackFailureRemainErrors() async throws {
        for status in [errSecAuthFailed, errSecItemNotFound] {
            let v = FakeVault(), j = NativeTranslationRecoveryJournal(vault: v)
            let r = try j.retain(identity(), scope: scope()); v.removeStatus = status
            XCTAssertThrowsError(try j.abandonLocally(r, scope: scope()))
            XCTAssertEqual(try j.read(scope()), r)
        }
        let v = FakeVault(), j = NativeTranslationRecoveryJournal(vault: v)
        let r = try j.retain(identity(), scope: scope()); v.omitRemove = true
        XCTAssertThrowsError(try j.abandonLocally(r, scope: scope()))
        XCTAssertEqual(try j.read(scope()), r)
    }
    @MainActor func testReceiptRejectsWrongIdentityOriginalDirectionAndGenericCancel() async throws {
        let id = try identity()
        let other = try identity(turn: "00000000-0000-4000-8000-000000000006")
        XCTAssertThrowsError(try NativeTranslationRecoveryReceipt.verify(receipt(other), original: id))
        XCTAssertThrowsError(try NativeTranslationRecoveryReceipt.verify(receipt(id, original: text + " "), original: id))
        XCTAssertThrowsError(try NativeTranslationRecoveryReceipt.verify(receipt(id), original: id, httpStatus: 503))
        XCTAssertThrowsError(try NativeTranslationRecoveryReceipt.verify(receipt(id, state: "unknown"), original: id))
        XCTAssertThrowsError(try NativeTranslationRecoveryReceipt.verify(Data("{\"version\":1,\"kind\":\"translation\",\"state\":\"cancelled\"}".utf8), original: id))
        let mutations: [(inout [String: Any]) -> Void] = [
            { $0["version"] = true }, { $0["kind"] = "translation" }, { $0["extra"] = "bad" },
            { $0["phrase"] = NSNull() },
            { var p = $0["phrase"] as! [String: Any]; p["targetLocale"] = "zh"; $0["phrase"] = p },
            { var p = $0["phrase"] as! [String: Any]; p["turnId"] = other.turnId; $0["phrase"] = p },
            { var p = $0["phrase"] as! [String: Any]; p["state"] = "cancelled"; $0["phrase"] = p },
            { var p = $0["phrase"] as! [String: Any]; p["translation"] = " "; $0["phrase"] = p }
        ]
        for mutation in mutations {
            XCTAssertThrowsError(try NativeTranslationRecoveryReceipt.verify(receipt(id, mutate: mutation), original: id))
        }
        let v = FakeVault(), j = NativeTranslationRecoveryJournal(vault: v), r = try j.retain(id, scope: scope())
        let wrongProof = try NativeTranslationRecoveryReceipt.verify(receipt(other), original: other)
        XCTAssertThrowsError(try j.complete(r, verifiedReceipt: wrongProof, scope: scope()))
        XCTAssertEqual(try j.read(scope()), r)
    }
    @MainActor func testLandedWriteWithFailedReadbackRecoversWithoutNewRetain() async throws {
        let v = FakeVault(), j = NativeTranslationRecoveryJournal(vault: v), s = scope(), id = try identity()
        v.writeTransform = { data in v.readStatus = errSecInteractionNotAllowed; return data }
        XCTAssertThrowsError(try j.retain(id, scope: s))
        v.readStatus = nil; v.writeTransform = nil
        let restored = try XCTUnwrap(NativeTranslationRecoveryJournal(vault: v).read(s))
        XCTAssertEqual(restored.identity, id)
        XCTAssertThrowsError(try j.retain(id, scope: s))
        XCTAssertEqual(v.writes, 1)
    }
    @MainActor func testValidButChangedPhysicalReadbackNeverGrantsSend() async throws {
        let v = FakeVault(), j = NativeTranslationRecoveryJournal(vault: v), s = scope()
        v.writeTransform = { $0 + Data(" ".utf8) }
        XCTAssertThrowsError(try j.retain(identity(), scope: s))
        XCTAssertNotNil(try j.read(s))
        XCTAssertThrowsError(try j.retain(identity(), scope: s))
        XCTAssertEqual(v.writes, 1)
    }
    @MainActor func testStaleCompletionCannotRemoveSuccessorAndReceiptDuplicateKeysReject() async throws {
        let v = FakeVault(), j = NativeTranslationRecoveryJournal(vault: v), s = scope(), id = try identity()
        let old = try j.retain(id, scope: s)
        let proof = try NativeTranslationRecoveryReceipt.verify(receipt(id), original: id)
        try j.abandonLocally(old, scope: s)
        let successor = try j.retain(identity(turn: "00000000-0000-4000-8000-000000000006"), scope: s)
        XCTAssertThrowsError(try j.complete(old, verifiedReceipt: proof, scope: s))
        XCTAssertEqual(try j.read(s), successor)
        XCTAssertEqual(v.removes, 1)
        let raw = String(decoding: try receipt(id), as: UTF8.self)
        let duplicate = raw.replacingOccurrences(of: "\"version\":1", with: "\"version\":1,\"version\":1")
        XCTAssertThrowsError(try NativeTranslationRecoveryReceipt.verify(Data(duplicate.utf8), original: id))
        let leaked = try receipt(id, state: "cancelled", mutate: { value in
            var p = value["phrase"] as! [String: Any]
            p["translation"] = "private"; p["backTranslation"] = NSNull(); value["phrase"] = p
        })
        XCTAssertThrowsError(try NativeTranslationRecoveryReceipt.verify(leaked, original: id))
    }
    @MainActor func testExplicitSessionEraseHandlesOldEpochCorruptionAndOnlyExactServiceOwner() async throws {
        let v = FakeVault(), j = NativeTranslationRecoveryJournal(vault: v), s = scope()
        _ = try j.retain(identity(), scope: s)
        let b = scope(owner: "00000000-0000-4000-8000-000000000009")
        let other = try j.retain(identity(), scope: b)
        v.replace(Data("corrupt old metadata".utf8), scope: s)
        XCTAssertThrowsError(try j.read(scope(epoch: 9)))
        try NativeTranslationRecoveryJournal.erase(endpoint: s.endpoint, owner: s.subject, vault: v)
        XCTAssertNil(try j.read(s))
        XCTAssertEqual(try j.read(b), other)
        v.removeStatus = errSecItemNotFound
        try NativeTranslationRecoveryJournal.erase(endpoint: s.endpoint, owner: s.subject, vault: v)
        v.replace(Data("still present".utf8), scope: s)
        XCTAssertThrowsError(try NativeTranslationRecoveryJournal.erase(endpoint: s.endpoint, owner: s.subject, vault: v))
        v.removeStatus = errSecAuthFailed
        XCTAssertThrowsError(try NativeTranslationRecoveryJournal.erase(endpoint: s.endpoint, owner: s.subject, vault: v))
    }
    @MainActor func testUTF8HashPreservesUnicodeAndIdentityCanonicality() async throws {
        XCTAssertEqual(NativeTranslationRecoveryIdentity.hashInput("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
        XCTAssertNotEqual(NativeTranslationRecoveryIdentity.hashInput("é"), NativeTranslationRecoveryIdentity.hashInput("e\u{301}"))
        XCTAssertNotEqual(NativeTranslationRecoveryIdentity.hashInput(text), NativeTranslationRecoveryIdentity.hashInput(text + " "))
        let id = try identity()
        let data = try JSONEncoder().encode(id)
        let good = String(decoding: data, as: UTF8.self)
        for candidate in [good.replacingOccurrences(of: id.noticeHash, with: id.noticeHash.uppercased()),
                          good.replacingOccurrences(of: "\"sourceLocale\":\"zh\"", with: "\"sourceLocale\":\"en\""),
                          good.replacingOccurrences(of: id.turnId, with: "not-a-uuid")] {
            XCTAssertThrowsError(try NativeTranslationRecoveryIdentity.decode(JSONSerialization.jsonObject(with: Data(candidate.utf8))))
        }
        XCTAssertFalse(NativeTranslationRecoveryIdentity.canonicalUUID("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"))
        XCTAssertFalse(NativeTranslationRecoveryIdentity.canonicalUUID("00000000-0000-0000-0000-000000000000"))
        XCTAssertFalse(NativeTranslationRecoveryIdentity.canonicalUUID("00000000-0000-7000-8000-000000000001"))
    }
}

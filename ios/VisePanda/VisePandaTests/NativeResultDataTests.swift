import Foundation
import Security
import Testing
@testable import VisePanda

@MainActor struct NativeResultDataTests {
    private func bytes(_ file: String) throws -> Data {
        #if SWIFT_PACKAGE
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Fixtures/ResultData/" + file + ".json")
        #else
        let url = try #require(Bundle(for: ResultDataFixtureAnchor.self).url(forResource: file, withExtension: "json", subdirectory: "ResultData"))
        #endif
        return try Data(contentsOf: url)
    }
    private func root(_ file: String) throws -> [String: Any] { try NativeResultDataWire.root(bytes(file)) }
    private func commands() throws -> [String: Any] { try #require(JSONSerialization.jsonObject(with: bytes("commands")) as? [String: Any]) }
    private func command(_ key: String) throws -> NativeResultDataCommand {
        let values = try commands()
        return try .init(body: Data(try #require(values[key] as? String).utf8))
    }
    private var actor: NativeCommunitySafetyActor {
        .init(scope: .init(endpoint: "http://127.0.0.1:65170", subject: "00000000-0000-4000-8000-000000000001", mobileEpoch: 3, generation: 1),
            sessionID: "00000000-0000-4000-8000-000000000002")
    }
    private func date(_ added: Double = 0) throws -> Date { try NativeResultDataWire.time(commands()["now"]).addingTimeInterval(added) }
    private func envelope(_ value: [String: Any]) throws -> Data { try NativeCommunityWire.bytes(["data": value]) }
    private func file(_ name: String = UUID().uuidString) -> NativeResultDataReceiptFile {
        .init(root: FileManager.default.temporaryDirectory.appendingPathComponent("result-data-tests-" + name, isDirectory: true))
    }
    @Test func soleTSProducerAllEnvelopesAndExactBytesDecode() throws {
        #expect(try commands()["synthetic"] as? Bool == true)
        let preview = try command("previewBytes"), erase = try command("eraseBytes"), recover = try command("recoverBytes")
        let progress = try command("progressPreviewBytes"), progressErase = try command("progressEraseBytes")
        #expect(recover.mutationBytes == erase.body)
        #expect(try erase.recovery().mutationBytes == erase.body)
        let page = try NativeResultDataProtocol.list(bytes("list"), command: command("listBytes"), actor: actor, now: date(0.001))
        #expect(page.objects.count == 1 && page.objects.first?.revisionCount == 2 && page.objects.first?.eventCount == 3)
        let proposal = try NativeResultDataProtocol.list(bytes("proposal-list"), command: command("listBytes"), actor: actor, now: date(0.001))
        #expect(proposal.objects.first?.resultTypes == ["change-proposal-reference/1"])
        var obsoleteList = try root("proposal-list"), obsoleteItems = try #require(try root("proposal-list")["items"] as? [[String: Any]])
        obsoleteItems[0]["resultTypes"] = ["change-proposal/1"]; obsoleteList["items"] = obsoleteItems
        #expect(throws: (any Error).self) { try NativeResultDataProtocol.list(envelope(obsoleteList), command: command("listBytes"), actor: actor, now: date(0.001)) }
        let value = try NativeResultDataProtocol.preview(bytes("preview"), command: preview, actor: actor, now: date(0.001))
        #expect(value.eligible && value.graph.revisions == [1, 2] && value.graph.eventIDs == ["2", "10", "9223372036854775807"])
        #expect(value.references.ids["conversationIds"]?.count == 1)
        #expect(try !NativeResultDataProtocol.preview(bytes("blocked-preview"), command: preview, actor: actor, now: date(0.001)).eligible)
        #expect(try NativeResultDataProtocol.preview(bytes("plain-preview"), command: preview, actor: actor, now: date(0.001)).graph.ids["executionIds"]?.isEmpty == true)
        let receipt = try #require(try NativeResultDataProtocol.receipt(bytes("receipt"), command: recover, actor: actor, now: date(40)))
        #expect(receipt.requestDigest == NativeResultDataWire.digest(erase.body) && receipt.retainedFences == 5)
        #expect(try NativeResultDataProtocol.receipt(bytes("plain-receipt"), command: recover, actor: actor, now: date(40))?.retainedFences == 3)
        #expect(try NativeResultDataProtocol.receipt(bytes("unknown"), command: recover, actor: actor, now: date(40)) == nil)
        #expect(try NativeResultDataProtocol.preview(bytes("progress-preview"), command: progress, actor: actor, now: date(40.001)).progressCount == 1)
        #expect(try NativeResultDataProtocol.receipt(bytes("progress-receipt"), command: progressErase.recovery(), actor: actor, now: date(80.001))?.clearedPreviews == 1)
        let inventory = try NativeResultDataProtocol.list(bytes("progress-list"), command: command("progressListBytes"), actor: actor, now: date(80.001))
        #expect(inventory.objects.count == 2 && inventory.objects.allSatisfy { $0.operationFields?.contains("publicationKeys") == true })
    }
    @Test func closedDecoderRejectsPartialRevisionNumericEventLossAndAuthorityMismatch() throws {
        let command = try command("previewBytes"), original = try root("preview")
        var cases: [[String: Any]] = []
        for (key, value) in [("ownerId", "00000000-0000-4000-8000-000000000099" as Any), ("sessionId", "00000000-0000-4000-8000-000000000098"), ("mobileEpoch", 4), ("allUserDataCompleted", true), ("sourceAuthorities", [[String: String]]()), ("expiresAt", Int(try date().timeIntervalSince1970 * 1000) + 30001)] {
            var changed = original; changed[key] = value; cases.append(changed)
        }
        for events in [["10", "2"], ["02", "10"], ["9223372036854775808"]] {
            var changed = original, graph = try #require(original["graph"] as? [String: Any]); graph["eventIds"] = events; changed["graph"] = graph; cases.append(changed)
        }
        var partial = original, graph = try #require(original["graph"] as? [String: Any]); graph["revisions"] = [2]; partial["graph"] = graph; cases.append(partial)
        var badRefs = original, refs = try #require(original["retainedReferences"] as? [String: Any]); refs["messageIds"] = [String](); badRefs["retainedReferences"] = refs; cases.append(badRefs)
        var extensionField = original; extensionField["silentCascade"] = true; cases.append(extensionField)
        for value in cases { #expect(throws: (any Error).self) { try NativeResultDataProtocol.preview(envelope(value), command: command, actor: actor, now: date(0.001)) } }
        #expect(throws: (any Error).self) { try NativeResultDataProtocol.receipt(bytes("unknown"), command: self.command("eraseBytes"), actor: actor, now: date(40)) }
    }
    @Test func explicitSelectionAndExactConfirmationEnforceOriginalDeadline() async throws {
        let vault = ResultDataBehaviorVault(), privateFile = file()
        defer { try? FileManager.default.removeItem(at: privateFile.root) }
        let base = try date(0.001); var wall = base; var monotonic: TimeInterval = 10, erases = 0, consumed = 0
        var selectedPreview: [String: Any]?
        let client = NativeResultDataClient(current: { actor }, request: { body, _ in
            let command = try NativeResultDataCommand(body: body)
            if command.action == "list" { return try bytes("list") }
            if command.action == "preview" {
                var response = try root("preview"); response["requestId"] = command.requestID
                selectedPreview = response; return try envelope(response)
            }
            guard command.action == "erase" else { throw NativeDataError.invalidResponse }
            erases += 1
            var response = try #require(selectedPreview), decision = try #require(try root("receipt")["decision"] as? [String: Any])
            decision["requestDigest"] = NativeResultDataWire.digest(body)
            for key in ["graph", "eraseCounts", "retainCounts", "retainedReferences", "conflicts", "eligible", "progressCount"] { response.removeValue(forKey: key) }
            response["kind"] = "receipt"; response["state"] = "erased"; response["decision"] = decision
            return try envelope(response)
        }, consumeReceipt: { _, _ in consumed += 1 })
        let store = NativeResultDataStore(scope: .sensitive, vault: vault, privateFile: privateFile, now: { wall }, uptime: { monotonic })
        await store.load(client: client)
        let item = try #require(store.visibleObjects(actor).first)
        store.toggle(item, actor: actor)
        await store.review(client: client)
        let expiredBinding = try #require(store.visiblePreview(actor)?.binding)
        monotonic = 40
        await store.erase(reviewed: expiredBinding, client: client)
        #expect(erases == 0 && consumed == 0 && store.pending == nil)
        monotonic = 100
        await store.load(client: client); store.toggle(item, actor: actor); await store.review(client: client)
        let reviewed = try #require(store.visiblePreview(actor)?.binding)
        wall = base.addingTimeInterval(0.02)
        await store.erase(reviewed: reviewed, client: client)
        #expect(erases == 1 && consumed == 1 && store.pending == nil && store.visibleReceipt(actor)?.binding == reviewed)
    }
    @Test func unknownACKRequiresExplicitOriginalBytesRecoveryAndReceiptBoundCleanup() async throws {
        let vault = ResultDataBehaviorVault(), privateFile = file(); defer { try? FileManager.default.removeItem(at: privateFile.root) }
        let original = try command("eraseBytes")
        _ = try NativeResultDataJournal(vault: vault, validateConfirmation: NativeResultDataCommand.validateConfirmation).retain(original.body, actor: actor)
        let wall = try date(40)
        let store = NativeResultDataStore(scope: .sensitive, vault: vault, privateFile: privateFile, now: { wall }, uptime: { 10 })
        var rejectCleanup = true, sends = 0
        let client = NativeResultDataClient(current: { actor }, request: { bytes, _ in
            sends += 1
            #expect(try NativeResultDataCommand(body: bytes).mutationBytes == original.body)
            return try self.bytes("receipt")
        }, consumeReceipt: { receipt, current in
            #expect(current == actor && receipt.binding.actor == actor)
            if rejectCleanup { throw NativeDataError.sessionUnavailable }
        })
        store.bind(actor)
        #expect(sends == 0 && store.pending?.body == original.body)
        await store.resolve(client: client)
        #expect(store.pending?.body == original.body && store.visibleReceipt(actor) == nil && store.visibleReceiptFile(actor) == nil)
        rejectCleanup = false
        await store.resolve(client: client)
        #expect(store.pending == nil && store.completion != nil && sends == 2)
        let url = try #require(store.visibleReceiptFile(actor))
        #expect(try Data(contentsOf: url) == bytes("receipt"))
        store.suspend()
        #expect(!FileManager.default.fileExists(atPath: url.path) && store.visibleReceipt(actor) == nil)
    }
    @Test func malformedRecoveryCannotEnableResendAndLateResponseCannotPublish() async throws {
        let vault = ResultDataBehaviorVault(), original = try command("eraseBytes"), privateFile = file()
        defer { try? FileManager.default.removeItem(at: privateFile.root) }
        _ = try NativeResultDataJournal(vault: vault, validateConfirmation: NativeResultDataCommand.validateConfirmation).retain(original.body, actor: actor)
        let wall = try date(40), store = NativeResultDataStore(scope: .sensitive, vault: vault, privateFile: privateFile, now: { wall }, uptime: { 10 })
        var unknown = try root("unknown"); unknown["requestDigest"] = String(repeating: "0", count: 64)
        let malformed = NativeResultDataClient(current: { actor }, request: { _, _ in try envelope(unknown) }, consumeReceipt: { _, _ in Issue.record("malformed receipt consumed") })
        await store.resolve(client: malformed)
        #expect(!store.canResend(actor) && store.pending?.body == original.body && store.completion == nil)
        var continuation: CheckedContinuation<Data, any Error>?
        let delayed = NativeResultDataClient(current: { actor }, request: { _, _ in try await withCheckedThrowingContinuation { continuation = $0 } }, consumeReceipt: { _, _ in Issue.record("late receipt consumed") })
        let work = Task { @MainActor in await store.resolve(client: delayed) }
        while continuation == nil { await Task.yield() }
        store.suspend(); store.bind(actor)
        try #require(continuation).resume(returning: bytes("receipt"))
        await work.value
        #expect(store.pending?.body == original.body && store.completion == nil && store.visibleReceiptFile(actor) == nil)
        let validUnknown = NativeResultDataClient(current: { actor }, request: { _, _ in try bytes("unknown") }, consumeReceipt: { _, _ in Issue.record("unknown consumed") })
        await store.resolve(client: validUnknown)
        #expect(store.canResend(actor) && store.pending?.body == original.body && store.completion == nil)
    }
}

private final class ResultDataFixtureAnchor: NSObject {}
@MainActor private final class ResultDataBehaviorVault: NativeCredentialVault {
    private var values: [String: Data] = [:]
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        values[service + owner].map { (errSecSuccess, $0) } ?? (errSecItemNotFound, nil)
    }
    func write(_ data: Data, service: String, owner: String) -> OSStatus { values[service + owner] = data; return errSecSuccess }
    func remove(service: String, owner: String) -> OSStatus { values.removeValue(forKey: service + owner); return errSecSuccess }
}

import Foundation
import Security
import Testing
@testable import VisePanda

@MainActor struct NativeTurnDataTests {
    private var actor: NativeCommunitySafetyActor {
        .init(scope: .init(endpoint: "http://127.0.0.1:65170", subject: "00000000-0000-4000-8000-000000000001", mobileEpoch: 3, generation: 1),
              sessionID: "00000000-0000-4000-8000-000000000002")
    }
    private func bytes(_ name: String) throws -> Data {
        let url = try #require(Bundle(for: TurnDataFixtureAnchor.self).url(forResource: name, withExtension: "json", subdirectory: "TurnData"))
        return try Data(contentsOf: url)
    }
    private func commands() throws -> [String: Any] { try #require(JSONSerialization.jsonObject(with: bytes("commands")) as? [String: Any]) }
    private func command(_ name: String) throws -> NativeTurnDataCommand {
        try .init(body: Data(try #require(try commands()[name] as? String).utf8))
    }
    private func date(_ offset: TimeInterval = 0) throws -> Date {
        try NativeTurnDataWire.time(commands()["now"]).addingTimeInterval(offset)
    }
    private func envelope(_ value: [String: Any]) throws -> Data { try NativeCommunityWire.bytes(["data":value]) }
    private func root(_ name: String) throws -> [String: Any] { try NativeTurnDataWire.root(bytes(name)) }
    @Test func soleTSProducerEnvelopesAdmitExactMutationBytesAndFiniteProgress() throws {
        #expect(try commands()["synthetic"] as? Bool == true)
        let erase = try command("eraseBytes"), recover = try command("recoverBytes")
        #expect(recover.mutationBytes == erase.body)
        #expect(try erase.recovery().mutationBytes == erase.body)
        let list = try NativeTurnDataProtocol.list(bytes("list"), command: command("listBytes"), actor: actor, now: date(0.001))
        #expect(list.objects.count == 1 && list.objects[0].erasedSource == false && list.objects[0].taskID != nil)
        let preview = try NativeTurnDataProtocol.preview(bytes("preview"), command: command("previewBytes"), actor: actor, now: date(0.001))
        #expect(preview.eligible && preview.graph.ids["turnIds"] == [erase.turnID!])
        #expect(preview.redacted["taskDigests"] == 1 && preview.retained["tasks"] == 1)
        #expect(try !NativeTurnDataProtocol.preview(bytes("blocked-preview"), command: command("previewBytes"), actor: actor, now: date(0.001)).eligible)
        #expect(try NativeTurnDataProtocol.receipt(bytes("receipt"), command: recover, actor: actor, now: date(40))?.requestDigest == NativeTurnDataWire.digest(erase.body))
        #expect(try NativeTurnDataProtocol.receipt(bytes("unknown"), command: recover, actor: actor, now: date(40)) == nil)
        let progress = try NativeTurnDataProtocol.preview(bytes("progress-preview"), command: command("progressPreviewBytes"), actor: actor, now: date(0.001))
        #expect(progress.graph.empty && progress.progressCount == 1 && progress.redacted.values.allSatisfy { $0 == 0 })
        #expect(try NativeTurnDataProtocol.receipt(bytes("progress-receipt"), command: command("progressEraseBytes").recovery(), actor: actor, now: date(40))?.clearedPreviews == 1)
        #expect(try NativeTurnDataProtocol.list(bytes("progress-list"), command: command("progressListBytes"), actor: actor, now: date(40.001)).objects[0].operationFields != nil)
    }
    @Test func parentDigestTruthfulnessOwnerEpochAndClosedFieldsFailBeforeCompletion() throws {
        let recover = try command("recoverBytes"), original = try root("receipt")
        var wrongParent = original
        var decision = try #require(original["decision"] as? [String: Any]); decision["parentData"] = "not_modified"; wrongParent["decision"] = decision
        #expect(throws: (any Error).self) { try NativeTurnDataProtocol.receipt(envelope(wrongParent), command: recover, actor: actor, now: date(40)) }
        var inputs = [wrongParent]
        for (key,value) in [("ownerId","00000000-0000-4000-8000-000000000099" as Any),("mobileEpoch",4),("allUserDataCompleted",true),("rawInput","private")] {
            var v = original; v[key] = value; inputs.append(v)
        }
        for input in inputs { #expect(throws: (any Error).self) { try NativeTurnDataProtocol.receipt(envelope(input), command: recover, actor: actor, now: date(40)) } }
        #expect(throws: (any Error).self) { try NativeTurnDataProtocol.preview(bytes("preview"), command: command("previewBytes"), actor: actor, now: date(30)) }
    }
    @Test func explicitReviewUnknownAckAndReadOnlyRecoveryRetainOriginalBytes() async throws {
        let vault = TurnDataSafetyVault(), root = FileManager.default.temporaryDirectory.appendingPathComponent("turn-state-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let wall = try date(0.001); var monotonic: TimeInterval = 100, erases = 0, reads = 0, consumes = 0
        var originalMutation: Data?, reviewed: [String: Any]?
        let client = NativeTurnDataClient(current: { actor }, request: { body,_ in
            let command = try NativeTurnDataCommand(body: body)
            if command.action == "list" { return try bytes("list") }
            if command.action == "preview" {
                var value = try self.root("preview"); value["requestId"] = command.requestID; reviewed = value; return try envelope(value)
            }
            if command.action == "erase" { erases += 1; originalMutation = body; throw NativeDataError.server(code:"TURN_ACK_UNKNOWN") }
            #expect(command.action == "recover" && command.mutationBytes == originalMutation)
            reads += 1
            if reads == 1 {
                var value = try self.root("unknown"); value["requestId"] = command.requestID
                value["requestDigest"] = NativeTurnDataWire.digest(try #require(originalMutation)); return try envelope(value)
            }
            var value = try self.root("receipt"), decision = try #require(value["decision"] as? [String: Any])
            value["requestId"] = command.requestID; decision["requestDigest"] = NativeTurnDataWire.digest(try #require(originalMutation)); value["decision"] = decision
            #expect(value["previewDigest"] as? String == reviewed?["previewDigest"] as? String)
            return try envelope(value)
        }, consumeReceipt: { receipt,current in
            #expect(receipt.binding.actor == current && receipt.redacted["taskDigests"] == 1); consumes += 1
        })
        let store = NativeTurnDataStore(scope:.sensitive,vault:vault,privateFile:.init(root:root),now:{wall},uptime:{monotonic})
        await store.load(client:client)
        #expect(store.preview == nil && erases == 0)
        let object = try #require(store.visibleObjects(actor).first)
        store.toggle(object,actor:actor); await store.review(client:client)
        let selected = try #require(store.visiblePreview(actor))
        await store.erase(reviewed:selected.binding,client:client)
        #expect(erases == 1 && consumes == 0 && store.completion == nil)
        #expect(store.pending?.body == originalMutation)
        await store.resolve(client:client)
        #expect(reads == 1 && erases == 1 && store.canResend(actor))
        monotonic += 31; store.tick(client:client)
        #expect(!store.canResend(actor) && store.pending?.body == originalMutation)
        await store.resolve(client:client)
        #expect(reads == 2 && erases == 1 && consumes == 1 && store.pending == nil)
        #expect(store.visibleReceipt(actor) != nil && store.visibleReceiptFile(actor) != nil)
    }
    @Test func lateActorResponseCannotConsumeReceiptOrErasePendingJournal() async throws {
        let vault = TurnDataSafetyVault(), root = FileManager.default.temporaryDirectory.appendingPathComponent("turn-late-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        var current: NativeCommunitySafetyActor? = actor, mutation: Data?, consumed = 0
        let wall = try date(0.001)
        let client = NativeTurnDataClient(current:{current},request:{body,_ in
            let command = try NativeTurnDataCommand(body:body)
            if command.action == "list" { return try bytes("list") }
            if command.action == "preview" { var v = try self.root("preview");v["requestId"] = command.requestID;return try envelope(v) }
            mutation = body; current = nil
            var v = try self.root("receipt"), d = try #require(v["decision"] as? [String:Any]);v["requestId"] = command.requestID;d["requestDigest"] = NativeTurnDataWire.digest(body);v["decision"] = d
            return try envelope(v)
        },consumeReceipt:{_,_ in consumed += 1})
        let store = NativeTurnDataStore(scope:.sensitive,vault:vault,privateFile:.init(root:root),now:{wall},uptime:{100})
        await store.load(client:client);store.toggle(try #require(store.visibleObjects(actor).first),actor:actor);await store.review(client:client)
        await store.erase(reviewed:try #require(store.visiblePreview(actor)).binding,client:client)
        #expect(consumed == 0 && store.completion == nil && store.visibleReceipt(current) == nil)
        let journal = NativeTurnDataJournal(vault:vault,validateConfirmation:NativeTurnDataCommand.validateConfirmation)
        #expect(try journal.read(actor)?.body == mutation)
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

private final class TurnDataFixtureAnchor: NSObject {}

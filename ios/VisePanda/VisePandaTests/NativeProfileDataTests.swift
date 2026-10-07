import Foundation
import Security
import Testing
@testable import VisePanda

/// Original sole TS 3b870971 fixtures; behavioral transport fixtures are explicitly synthetic.
@MainActor struct NativeProfileDataTests {
    private func id(_ n: Int) -> String { String(format: "00000000-0000-4000-8000-%012d", n) }
    private var actor: NativeCommunitySafetyActor {
        .init(scope: .init(endpoint: "http://127.0.0.1:65200", subject: id(1), mobileEpoch: 3, generation: 1), sessionID: id(2))
    }
    private var wall: Date { Date(timeIntervalSince1970: 1_791_369_600) }
    private func bytes(_ name: String) throws -> Data {
        #if SWIFT_PACKAGE
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Fixtures/ProfileData/" + name + ".json")
        #else
        let url = try #require(Bundle(for: ProfileDataFixtureAnchor.self).url(forResource: name, withExtension: "json", subdirectory: "ProfileData"))
        #endif
        return try Data(contentsOf: url)
    }
    private func command(_ key: String) throws -> NativeProfileDataCommand {
        let v = try #require(JSONSerialization.jsonObject(with: bytes("commands")) as? [String: Any])
        if let original = v[key] as? String { return try .init(body: Data(original.utf8)) }
        return try .init(body: NativeCommunityWire.bytes(try #require(v[key] as? [String: Any])))
    }
    private func fixture(_ name: String) throws -> [String: Any] { try NativeProfileDataWire.root(bytes(name)) }
    private func envelope(_ value: [String: Any]) throws -> Data { try NativeCommunityWire.bytes(["data": value]) }
    private func rebound(_ name: String, _ command: NativeProfileDataCommand, original: Data? = nil) throws -> Data {
        var value = try fixture(name)
        if command.action != "list" {
            value["requestId"] = command.requestID as Any; value["profileId"] = command.profileID as Any? ?? NSNull(); value["objectIds"] = command.objectIDs
        }
        if let original, name == "receipt" {
            var decision = try #require(value["decision"] as? [String: Any]); decision["requestDigest"] = NativeProfileDataWire.digest(original); value["decision"] = decision
        }
        if let original, name == "unknown" { value["requestDigest"] = NativeProfileDataWire.digest(original) }
        return try envelope(value)
    }
    private func files() -> NativeProfileDataReceiptFile {
        NativeProfileDataReceiptFile(root: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true))
    }

    @Test func profileTimePreservesPostgresEndOfDayAndRejectsInvalidTwentyFourHourValues() throws {
        let c = try command("preview"), now = wall.addingTimeInterval(0.001)
        for time in ["00:00:00", "23:59:59.999999", "24:00:00", "24:00:00.0", "24:00:00.000000"] {
            var value = try fixture("preview"), fields = try #require(value["profile"] as? [String: Any])
            fields["defaultDepartureTime"] = time; value["profile"] = fields
            let decoded = try NativeProfileDataProtocol.preview(envelope(value), command: c, actor: actor, now: now)
            #expect(decoded.profile?.values["defaultDepartureTime"] == time)
        }
        for time in ["24:01:00", "24:00:01", "24:00:00.1", "24:00:00.000001", "24:00:00.0000000", "23:59:59.1234567", "24:00:00.", "25:00:00"] {
            var value = try fixture("preview"), fields = try #require(value["profile"] as? [String: Any])
            fields["defaultDepartureTime"] = time; value["profile"] = fields
            #expect(throws: (any Error).self) {
                try NativeProfileDataProtocol.preview(envelope(value), command: c, actor: actor, now: now)
            }
        }
    }

    @Test func soleProducerEightEnvelopesDecodeWithExactOriginalBytesAndFloors() throws {
        let previewCommand = try command("preview"), erase = try command("eraseBytes"), progress = try command("progressPreview"), progressErase = try command("progressEraseBytes")
        let now = wall.addingTimeInterval(0.001)
        let preview = try NativeProfileDataProtocol.preview(bytes("preview"), command: previewCommand, actor: actor, now: now)
        #expect(preview.profile?.values["displayName"] == "Synthetic owner" && preview.summary?.paceRevision == 7)
        #expect(preview.summary?.profileErasureFloor == 0 && preview.summary?.paceErasureFloor == 0)
        #expect(preview.profile?.hasPaceRequest == true && preview.profile?.hasPaceUndo == true)
        for name in [String(repeating: "🐼", count: 80), "\u{00A0}", " ", "\t", String(repeating: "e\u{0301}", count: 40)] {
            var value = try fixture("preview"), fields = try #require(value["profile"] as? [String: Any])
            fields["displayName"] = name; value["profile"] = fields
            let decoded = try NativeProfileDataProtocol.preview(envelope(value), command: previewCommand, actor: actor, now: now)
            #expect(decoded.profile?.values["displayName"] == name)
        }
        for name in [String(repeating: "🐼", count: 81), String(repeating: "e\u{0301}", count: 41), "", "old\0name"] {
            var value = try fixture("preview"), fields = try #require(value["profile"] as? [String: Any])
            fields["displayName"] = name; value["profile"] = fields
            #expect(throws: (any Error).self) {
                try NativeProfileDataProtocol.preview(envelope(value), command: previewCommand, actor: actor, now: now)
            }
        }
        #expect(try !NativeProfileDataProtocol.preview(bytes("blocked"), command: previewCommand, actor: actor, now: now).eligible)
        let decodedReceipt = try NativeProfileDataProtocol.receipt(bytes("receipt"), command: erase.recovery(), actor: actor, now: wall.addingTimeInterval(40))
        let receipt = try #require(decodedReceipt)
        #expect(receipt.requestDigest == NativeProfileDataWire.digest(erase.body) && receipt.decision.afterPaceRevision == 8)
        #expect(try erase.recovery().mutationBytes == erase.body)
        #expect(try NativeProfileDataProtocol.receipt(bytes("unknown"), command: erase.recovery(), actor: actor, now: now) == nil)
        #expect(try NativeProfileDataProtocol.preview(bytes("progress-preview"), command: progress, actor: actor, now: now).profile == nil)
        #expect(try NativeProfileDataProtocol.receipt(bytes("progress-receipt"), command: progressErase, actor: actor, now: wall.addingTimeInterval(40))?.decision.clearedPreviews == 1)
        #expect(try NativeProfileDataProtocol.list(bytes("profile-list"), command: .list(scope: .sensitive), actor: actor, now: now).objects.first?.id == actor.scope.subject)
        let page = try NativeProfileDataProtocol.list(bytes("progress-list"), command: .list(scope: .progress), actor: actor, now: wall.addingTimeInterval(40.001))
        #expect(page.objects.first?.operationInventory?.contains("requestDigest") == true)
    }

    @Test func closedSourceRejectsWrongActorsFloorsPaceHistoryAndFalseCompletion() throws {
        let c = try command("preview"), now = wall.addingTimeInterval(0.001)
        for delta: [String: Any] in [["ownerId": id(90)], ["sessionId": id(91)], ["mobileEpoch": 4], ["allUserDataCompleted": true], ["kind": "queued"], ["extra": true]] {
            var v = try fixture("preview"); v.merge(delta) { _, new in new }
            #expect(throws: (any Error).self) { try NativeProfileDataProtocol.preview(envelope(v), command: c, actor: actor, now: now) }
        }
        for delta: [String: Any] in [["profileErasureFloor": 5], ["paceRevision": 6], ["hasPaceUndo": false], ["presentFields": ["currency", "locale"]], ["profileRevision": 9_007_199_254_740_991]] {
            var v = try fixture("preview"), summary = try #require(v["summary"] as? [String: Any]); summary.merge(delta) { _, new in new }; v["summary"] = summary
            #expect(throws: (any Error).self) { try NativeProfileDataProtocol.preview(envelope(v), command: c, actor: actor, now: now) }
        }
        var v = try fixture("preview"), profile = try #require(v["profile"] as? [String: Any]); profile["paceOperation"] = id(99); v["profile"] = profile
        #expect(throws: (any Error).self) { try NativeProfileDataProtocol.preview(envelope(v), command: c, actor: actor, now: now) }
        let erase = try command("eraseBytes")
        for delta: [String: Any] in [["account": "erased"], ["explicitMemory": "erased"], ["sourceTrip": "erased"], ["externalCopies": "erased"], ["afterPaceRevision": 7], ["decidedAt": Int(wall.timeIntervalSince1970 * 1000) + 30000]] {
            var receipt = try fixture("receipt"), decision = try #require(receipt["decision"] as? [String: Any]); decision.merge(delta) { _, new in new }; receipt["decision"] = decision
            #expect(throws: (any Error).self) { try NativeProfileDataProtocol.receipt(envelope(receipt), command: erase, actor: actor, now: wall.addingTimeInterval(40)) }
        }
    }

    @Test func lostAckRestartPreservesBytesUntilReceiptAndProjectionCleanupBothSucceed() async throws {
        let vault = ProfileDataBehaviorVault(), file = files()
        var clock: TimeInterval = 10, now = wall.addingTimeInterval(0.02), original: Data?, denyConsumer = true
        let client = NativeProfileDataClient(current: { actor }, request: { body, _ in
            let c = try NativeProfileDataCommand(body: body)
            switch c.action {
            case "list": return try bytes("profile-list")
            case "preview": return try rebound("preview", c)
            case "erase": original = body; throw NativeDataError.sessionUnavailable
            case "recover":
                #expect(c.mutationBytes == original)
                guard let original else { throw NativeDataError.invalidResponse }
                return try rebound("receipt", c, original: original)
            default: throw NativeDataError.invalidResponse
            }
        }, consumeReceipt: { _, _ in if denyConsumer { throw NativeDataError.sessionUnavailable } })
        let store = NativeProfileDataStore(scope: .sensitive, vault: vault, privateFile: file, now: { now }, uptime: { clock })
        await store.load(client: client); store.toggle(try #require(store.visibleObjects(actor).first), actor: actor)
        await store.review(client: client); await store.erase(reviewed: try #require(store.visiblePreview(actor)?.binding), client: client)
        #expect(store.pending?.body == original && store.completion == nil)
        store.suspend(); clock = 70; now = wall.addingTimeInterval(60)
        let restarted = NativeProfileDataStore(scope: .sensitive, vault: vault, privateFile: file, now: { now }, uptime: { clock })
        await restarted.resolve(client: client)
        #expect(restarted.pending?.body == original && restarted.completion == nil && restarted.visibleReceiptFile(actor) == nil)
        denyConsumer = false; await restarted.resolve(client: client)
        #expect(restarted.pending == nil && restarted.completion != nil)
        let url = try #require(restarted.visibleReceiptFile(actor))
        let originalCommand = try NativeProfileDataCommand(body: #require(original))
        #expect(try Data(contentsOf: url) == rebound("receipt", originalCommand, original: original))
        clock += 30; restarted.tick(client: client)
        #expect(restarted.visibleReceipt(actor) == nil && !FileManager.default.fileExists(atPath: url.path))
    }

    @Test func onlyAuthoritativeUnknownEnablesExplicitExactResendWithinRequestStartDeadline() async throws {
        let vault = ProfileDataBehaviorVault(), file = files(), c = try command("eraseBytes")
        _ = try NativeProfileDataJournal(vault: vault, validateConfirmation: NativeProfileDataCommand.validateConfirmation).retain(c.body, actor: actor)
        var clock: TimeInterval = 10, requests: [Data] = [], unknown = false
        let client = NativeProfileDataClient(current: { actor }, request: { body, _ in
            requests.append(body)
            let sent = try NativeProfileDataCommand(body: body)
            if sent.action == "recover", unknown { return try bytes("unknown") }
            throw NativeDataError.sessionUnavailable
        }, consumeReceipt: { _, _ in })
        let store = NativeProfileDataStore(scope: .sensitive, vault: vault, privateFile: file, now: { wall.addingTimeInterval(40) }, uptime: { clock })
        await store.resolve(client: client); #expect(!store.canResend(actor) && requests.count == 1)
        await store.resolve(client: client, resend: true); #expect(requests.count == 1)
        unknown = true; await store.resolve(client: client); #expect(store.canResend(actor))
        await store.resolve(client: client, resend: true); #expect(requests.last == c.body && !store.canResend(actor))
        await store.resolve(client: client); clock = 40; store.tick(client: client)
        #expect(!store.canResend(actor) && store.pending?.body == c.body)
    }

    @Test func backgroundGenerationAndDelayedResponseCannotExposeOrRenewFields() async throws {
        let vault = ProfileDataBehaviorVault(), file = files()
        var clock: TimeInterval = 10
        let store = NativeProfileDataStore(scope: .sensitive, vault: vault, privateFile: file, now: { wall.addingTimeInterval(0.001) }, uptime: { clock })
        let late = NativeProfileDataClient(current: { actor }, request: { _, _ in clock = 40; return try bytes("profile-list") }, consumeReceipt: { _, _ in })
        await store.load(client: late); #expect(store.visibleObjects(actor).isEmpty)
        clock = 50
        let background = NativeProfileDataClient(current: { actor }, request: { _, _ in store.suspend(); return try bytes("profile-list") }, consumeReceipt: { _, _ in })
        await store.load(client: background); #expect(store.visibleObjects(actor).isEmpty && !store.busy)
    }

    @Test func receiptFenceInvalidatesOldReadsAndDuplicateRecoveryPreservesFreshEditGeneration() throws {
        let c = try command("eraseBytes")
        let decoded = try NativeProfileDataProtocol.receipt(bytes("receipt"), command: c, actor: actor, now: wall.addingTimeInterval(40))
        let r = try #require(decoded)
        var fence = NativeProfileDataProjectionFence(); fence.bind(actor)
        let old = try fence.capture(actor); #expect(fence.accepts(old))
        #expect(try fence.record(r, actor: actor)); #expect(!fence.accepts(old) && fence.paceFloor == 8 && fence.profileFloor == 5)
        let newEdit = try fence.capture(actor); #expect(fence.accepts(newEdit))
        #expect(try !fence.record(r, actor: actor) && fence.accepts(newEdit))
        let other = NativeCommunitySafetyActor(scope: actor.scope, sessionID: id(99))
        #expect(throws: (any Error).self) { try fence.record(r, actor: other) }
        fence.bind(other); #expect(!fence.accepts(newEdit) && fence.paceFloor == 0)
    }

    @Test func verifiedCleanupDropsOldSavedPacePendingUndoAndLateAckButAllowsFreshExplicitSave() async throws {
        let c = try command("eraseBytes")
        let decoded = try NativeProfileDataProtocol.receipt(bytes("receipt"), command: c, actor: actor, now: wall.addingTimeInterval(40))
        let receipt = try #require(decoded), erasure = try NativeProfileDataErasure(receipt: receipt, actor: actor)
        let store = NativeTravelPaceStore(); store.reset(for: actor.scope)
        func response(revision: Int, state: String, operation: UUID? = nil) throws -> Data {
            let explicit = state == "explicit"
            return try NativeCommunityWire.bytes(["schemaVersion": "travel-pace/1", "revision": revision, "state": state,
                "travelPace": explicit ? "packed" : NSNull(), "scope": explicit ? "account" : NSNull(),
                "purpose": explicit ? "local_trip_planning" : NSNull(), "noticeVersion": explicit ? NativeTravelPaceStore.noticeVersion : NSNull(),
                "operationId": operation?.uuidString as Any? ?? NSNull(), "reused": false])
        }
        let old = NativeTravelPaceCommand(action: "save", operationId: UUID(), expectedRevision: 7,
            travelPace: .packed, noticeVersion: NativeTravelPaceStore.noticeVersion)
        await store.perform(currentScope: { actor.scope }, command: old) {
            store.applyProfileErasure(erasure)
            return try response(revision: 8, state: "explicit", operation: old.operationId)
        }
        #expect(store.snapshot == nil && store.pending == nil && store.toast == nil && !store.busy)
        await store.perform(currentScope: { actor.scope }, command: nil) { try response(revision: 8, state: "revoked") }
        #expect(store.snapshot?.state == "revoked" && store.snapshot?.travelPace == nil)
        await store.perform(currentScope: { actor.scope }, command: nil) { try response(revision: 8, state: "explicit", operation: UUID()) }
        #expect(store.snapshot?.state == "revoked" && store.toast == nil)
        let fresh = NativeTravelPaceCommand(action: "save", operationId: UUID(), expectedRevision: 8,
            travelPace: .packed, noticeVersion: NativeTravelPaceStore.noticeVersion)
        await store.perform(currentScope: { actor.scope }, command: fresh) { try response(revision: 9, state: "explicit", operation: fresh.operationId) }
        #expect(store.snapshot?.state == "explicit" && store.snapshot?.revision == 9 && store.toast?.operationId == fresh.operationId)
        store.applyProfileErasure(erasure)
        #expect(store.snapshot?.revision == 9 && store.toast?.operationId == fresh.operationId)
    }
}

private final class ProfileDataFixtureAnchor: NSObject {}

@MainActor private final class ProfileDataBehaviorVault: NativeCredentialVault {
    private var values: [String: Data] = [:]
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        guard let value = values[service + owner] else { return (errSecItemNotFound, nil) }
        return (errSecSuccess, value)
    }
    func write(_ data: Data, service: String, owner: String) -> OSStatus { values[service + owner] = data; return errSecSuccess }
    func remove(service: String, owner: String) -> OSStatus { values.removeValue(forKey: service + owner); return errSecSuccess }
}

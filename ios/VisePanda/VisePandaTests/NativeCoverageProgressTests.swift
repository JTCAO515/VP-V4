import Foundation
import Security
import Testing
@testable import VisePanda

@MainActor struct NativeCoverageProgressTests {
    private let actor = NativeCommunitySafetyActor(scope: .init(endpoint: "http://127.0.0.1:65160",
        subject: "00000000-0000-4000-8000-000000000001", mobileEpoch: 2, generation: 1),
        sessionID: "00000000-0000-4000-8000-000000000002")
    private let wall = Date(timeIntervalSince1970: 1_801_800_000)
    private func fixture() throws -> [String: Any] {
        let url = try #require(Bundle(for: CoverageProgressFixtureAnchor.self).url(forResource: "producer", withExtension: "json", subdirectory: "CoverageProgressData"))
        return try #require(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }
    private func bytes(_ v: [String: Any], _ key: String) throws -> Data { try JSONSerialization.data(withJSONObject: #require(v[key])) }
    private func command(_ v: [String: Any], _ key: String) throws -> NativeCoverageProgressCommand {
        try .init(body: Data(#require(v[key] as? String).utf8))
    }
    private func changed(_ fixture: [String: Any], _ key: String, _ modify: (inout [String: Any]) throws -> Void) throws -> Data {
        var outer = try #require(fixture[key] as? [String: Any]), value = try #require(outer["data"] as? [String: Any])
        try modify(&value); outer["data"] = value
        return try JSONSerialization.data(withJSONObject: outer)
    }

    @Test func soleProducerAllFieldsHistoricalFencesAndFlatExitInventoryDecode() throws {
        let v = try fixture(), preview = try command(v, "previewBytes")
        let result = try NativeCoverageProgressProtocol.preview(bytes(v, "preview"), command: preview, actor: actor, now: wall)
        #expect(result.items.count == 3 && result.items[0].fields.contains("fence"))
        #expect(result.items[1].fields.contains("lastLimit") && result.items[1].fields.contains("mobileEpoch"))
        #expect(result.items[2].domain == "exit" && result.items[2].fields.contains("requestDigest"))
        let foreign = try changed(v, "preview") {
            var rows = try #require($0["items"] as? [[String: Any]]), fence = try #require(rows[0]["fence"] as? [String: Any])
            fence["ownerId"] = "00000000-0000-4000-8000-000000000009"; rows[0]["fence"] = fence; $0["items"] = rows
        }
        #expect(throws: (any Error).self) { try NativeCoverageProgressProtocol.preview(foreign, command: preview, actor: actor, now: wall) }
        let recursive = try changed(v, "preview") {
            var rows = try #require($0["items"] as? [[String: Any]]), request = try #require(rows[2]["request"] as? [String: Any])
            request["items"] = rows; rows[2]["request"] = request; $0["items"] = rows
        }
        #expect(throws: (any Error).self) { try NativeCoverageProgressProtocol.preview(recursive, command: preview, actor: actor, now: wall) }
        let missing = try changed(v, "preview") {
            var rows = try #require($0["items"] as? [[String: Any]]), request = try #require(rows[2]["request"] as? [String: Any])
            request.removeValue(forKey: "effects"); rows[2]["request"] = request; $0["items"] = rows
        }
        #expect(throws: (any Error).self) { try NativeCoverageProgressProtocol.preview(missing, command: preview, actor: actor, now: wall) }
    }

    @Test func exactExportBytesAndProofBoundariesMustMatchReviewedSelection() throws {
        let v = try fixture(), preview = try command(v, "previewBytes"), export = try command(v, "exportBytes")
        let reviewed = try NativeCoverageProgressProtocol.preview(bytes(v, "preview"), command: preview, actor: actor, now: wall).binding
        let binding = try NativeCoverageProgressProtocol.bundle(bytes(v, "bundle"), command: export, reviewed: reviewed, actor: actor, now: wall)
        #expect(binding == reviewed)
        let normalized = try NativeCoverageProgressCommand(body: NativeCommunityWire.bytes(#require(JSONSerialization.jsonObject(with: export.body) as? [String: Any])))
        #expect(throws: (any Error).self) { try NativeCoverageProgressProtocol.bundle(bytes(v, "bundle"), command: normalized, reviewed: reviewed, actor: actor, now: wall) }
        let partial = try changed(v, "bundle") { $0["proof"] = ["coverage": "partial", "pages": 1, "rows": 3] }
        #expect(throws: (any Error).self) { try NativeCoverageProgressProtocol.bundle(partial, command: export, reviewed: reviewed, actor: actor, now: wall) }
        let truncated = try changed(v, "bundle") { var rows = try #require($0["items"] as? [[String: Any]]); rows.removeLast(); $0["items"] = rows }
        #expect(throws: (any Error).self) { try NativeCoverageProgressProtocol.bundle(truncated, command: export, reviewed: reviewed, actor: actor, now: wall) }
        #expect(throws: (any Error).self) { try NativeCoverageProgressProtocol.preview(bytes(v, "preview"), command: preview, actor: actor, now: wall.addingTimeInterval(30)) }
        var raw = try #require(JSONSerialization.jsonObject(with: preview.body) as? [String: Any])
        raw["requestId"] = "00000000-0000-4000-8000-00000000000A"
        #expect(throws: (any Error).self) { try NativeCoverageProgressCommand(body: NativeCommunityWire.bytes(raw)) }
    }

    @Test func unknownAckQueriesOriginalBytesAndTerminalRecoveryAfterTTLCannotRenewOrDropFences() async throws {
        let v = try fixture(), original = try command(v, "eraseBytes"), vault = CoverageProgressTestVault()
        let journal = NativeCoverageProgressJournal(vault: vault, validateErase: NativeCoverageProgressCommand.validateErase)
        _ = try journal.retain(original.body, actor: actor)
        let root = temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let store = NativeCoverageProgressStore(vault: vault, file: .init(root: root), now: { wall.addingTimeInterval(60) }, uptime: { 10 })
        var dispatches = 0
        await store.recover(client: .init(current: { actor }, request: { data, _ in
            dispatches += 1
            let recovery = try NativeCoverageProgressCommand(body: data)
            #expect(recovery.action == "recover" && recovery.mutationBytes == original.body)
            return try bytes(v, "unknown")
        }))
        let unresolved = try journal.read(actor)
        #expect(dispatches == 1 && unresolved?.body == original.body && store.completion == nil)
        let badFence = try changed(v, "receipt") { var effects = try #require($0["effects"] as? [String: Any]); effects["retainedFences"] = 0; $0["effects"] = effects }
        #expect(throws: (any Error).self) { try NativeCoverageProgressProtocol.erased(badFence, command: original.recovery(), actor: actor, now: wall.addingTimeInterval(60)) }
        let lateDecision = try changed(v, "receipt") { $0["decidedAt"] = 1_801_800_000_002 }
        #expect(throws: (any Error).self) { try NativeCoverageProgressProtocol.erased(lateDecision, command: original.recovery(), actor: actor, now: wall.addingTimeInterval(60)) }
        await store.recover(client: .init(current: { actor }, request: { data, _ in
            let recovery = try NativeCoverageProgressCommand(body: data)
            #expect(recovery.action == "recover" && recovery.mutationBytes == original.body)
            return try bytes(v, "receipt")
        }))
        #expect(store.visibleReceipt(actor)?.retainedFences == 3 && store.completion?.action == "delete")
        let completed = try journal.read(actor)
        #expect(completed == nil)
    }

    @Test func selectedStoreCreatesExactPrivateFileOnlyAfterValidatedBundleAndClearsOnSuspend() async throws {
        let v = try fixture(), root = temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let store = NativeCoverageProgressStore(vault: CoverageProgressTestVault(), file: .init(root: root, now: { wall }, uptime: { 10 }), now: { wall }, uptime: { 10 })
        var delivered: Data?
        let client = NativeCoverageProgressClient(current: { actor }, request: { data, _ in
            let command = try NativeCoverageProgressCommand(body: data)
            if command.action == "list" { return try bytes(v, "list") }
            let key = command.action == "preview" ? "preview" : "bundle"
            let result = try changed(v, key) {
                $0["requestId"] = command.requestID; $0["objectIds"] = command.objectIDs
                if command.action == "export" { $0["requestDigest"] = NativeCoverageProgressWire.digest(data) }
            }
            if command.action == "export" { delivered = result }
            return result
        })
        await store.load(client: client)
        for row in store.visibleObjects(actor) { store.toggle(row, actor: actor) }
        #expect(store.completion == nil && store.exportURL(actor) == nil)
        await store.review(client: client)
        let reviewed = try #require(store.visiblePreview(actor))
        #expect(store.completion == nil)
        await store.execute(action: "export", reviewed: reviewed.binding, client: client)
        let path = try #require(store.exportURL(actor)), persisted = try Data(contentsOf: path)
        #expect(persisted == delivered && store.completion?.objectIDs.count == 3)
        store.suspend()
        #expect(store.exportURL(actor) == nil && store.completion == nil)
        #expect(try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).isEmpty)
    }

    @Test func lateOwnerEpochResponseAndExpiredPreviewCannotPublishOrDispatch() async throws {
        let v = try fixture(), root = temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        var current: NativeCommunitySafetyActor? = actor
        let store = NativeCoverageProgressStore(vault: CoverageProgressTestVault(), file: .init(root: root), now: { wall }, uptime: { 10 })
        await store.load(client: .init(current: { current }, request: { _, _ in
            current = .init(scope: .init(endpoint: actor.scope.endpoint, subject: actor.scope.subject, mobileEpoch: 3, generation: 2), sessionID: actor.sessionID)
            return try bytes(v, "list")
        }))
        #expect(store.visibleObjects(current).isEmpty && store.completion == nil)
        current = actor
        await store.load(client: .init(current: { current }, request: { _, _ in store.suspend(); return try bytes(v, "list") }))
        #expect(store.visibleObjects(actor).isEmpty && store.exportURL(actor) == nil)
    }
    private func temporaryRoot() -> URL { FileManager.default.temporaryDirectory.appendingPathComponent("coverage-progress-test-" + UUID().uuidString) }
}

private final class CoverageProgressFixtureAnchor: NSObject {}
@MainActor private final class CoverageProgressTestVault: NativeCredentialVault {
    private var values: [String: Data] = [:]
    func read(service: String, owner: String) -> (OSStatus, Data?) { values[service + owner].map { (errSecSuccess, $0) } ?? (errSecItemNotFound, nil) }
    func write(_ data: Data, service: String, owner: String) -> OSStatus { values[service + owner] = data; return errSecSuccess }
    func remove(service: String, owner: String) -> OSStatus { values.removeValue(forKey: service + owner); return errSecSuccess }
}

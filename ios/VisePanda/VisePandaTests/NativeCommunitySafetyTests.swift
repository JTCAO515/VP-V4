import Foundation
import Security
import Testing
@testable import VisePanda

@MainActor struct NativeCommunitySafetyTests {
    static let scope = NativeDataScope(endpoint: "http://127.0.0.1:65164", subject: "22222222-2222-4222-8222-222222222222", mobileEpoch: 2, generation: 1)
    static let session = "33333333-3333-4333-8333-333333333333"

    @Test func explicitExplanationUsesUTF16WithoutTruncation() {
        var draft = NativeCommunitySafetyDraft(explanation: "Reason", confirmed: false)
        #expect(!draft.isValid(limit: 4))
        draft.confirmed = true; draft.explanation = "😀😀"
        #expect(draft.isValid(limit: 4))
        draft.explanation += "😀"; #expect(!draft.isValid(limit: 4))
        draft.explanation = " \n "; #expect(!draft.isValid(limit: 4))
    }

    @Test func ownJournalDoesNotOverwriteUnknownOperationOrCrossSession() throws {
        let vault = SafetyTestVault()
        let journal = NativeCommunitySafetyJournal(vault: vault, validate: { bytes in
            guard !bytes.isEmpty else { throw NativeDataError.invalidResponse }
        })
        let bytes = Data("frozen original bytes".utf8)
        let original = try journal.retain(body: bytes, scope: Self.scope, sessionID: Self.session)
        #expect(try journal.retain(body: bytes, scope: Self.scope, sessionID: Self.session) == original)
        #expect(throws: (any Error).self) { try journal.retain(body: Data("new operation".utf8), scope: Self.scope, sessionID: Self.session) }
        #expect(throws: (any Error).self) { try journal.read(Self.scope, sessionID: Self.scope.subject) }
        let replaced = NativeDataScope(endpoint: Self.scope.endpoint, subject: Self.scope.subject, mobileEpoch: 3, generation: 2)
        #expect(throws: (any Error).self) { try journal.read(replaced, sessionID: Self.session) }
        let other = NativeDataScope(endpoint: Self.scope.endpoint, subject: Self.session, mobileEpoch: 2, generation: 1)
        #expect(try journal.read(other, sessionID: Self.session) == nil)
        #expect(try vault.read(service: "com.visepanda.native.community.v1." + Self.scope.endpoint, owner: Self.scope.subject).0 == errSecItemNotFound)
        try journal.complete(original, scope: Self.scope, sessionID: Self.session)
        #expect(try journal.read(Self.scope, sessionID: Self.session) == nil)
    }

    @Test func failedStorageReadbackAndErasureNeverClaimSuccess() throws {
        let vault = SafetyTestVault()
        let journal = NativeCommunitySafetyJournal(vault: vault, validate: { _ in })
        vault.dropWrite = true
        #expect(throws: (any Error).self) { try journal.retain(body: Data("original".utf8), scope: Self.scope, sessionID: Self.session) }
        vault.dropWrite = false
        let pending = try journal.retain(body: Data("original".utf8), scope: Self.scope, sessionID: Self.session)
        vault.dropRemoval = true
        #expect(throws: (any Error).self) { try journal.complete(pending, scope: Self.scope, sessionID: Self.session) }
        #expect(try journal.read(Self.scope, sessionID: Self.session) == pending)
        vault.dropRemoval = false
        try journal.complete(pending, scope: Self.scope, sessionID: Self.session)
    }

    @Test func exportPurgesAllAbandonedCopiesAndFencesFailure() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("SafetyTests-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        var deny = false
        let files = NativeCommunitySafetyExportFile(root: root, remove: { path in
            if deny { throw NativeDataError.sessionUnavailable }
            try FileManager.default.removeItem(at: path)
        })
        let first = try files.write(Data("{\"bounded\":true}".utf8))
        let old = root.appendingPathComponent("abandoned-unrecognized-copy.json")
        try Data("old personal copy".utf8).write(to: old)
        let restarted = NativeCommunitySafetyExportFile(root: root)
        #expect(restarted.ready)
        #expect(!FileManager.default.fileExists(atPath: first.path))
        #expect(!FileManager.default.fileExists(atPath: old.path))
        let current = try files.write(Data("{\"current\":true}".utf8))
        #expect(try Data(contentsOf: current) == Data("{\"current\":true}".utf8))
        deny = true
        #expect(throws: (any Error).self) { try files.clear() }
        #expect(!files.ready && files.url == nil)
        deny = false; try files.clear(); #expect(files.ready)
    }

    @Test func exportDoesNotFollowSymlinkRootOrChild() throws {
        let base = FileManager.default.temporaryDirectory.appendingPathComponent("SafetySymlinkTests-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: base) }
        let target = base.appendingPathComponent("unrelated"), link = base.appendingPathComponent("root-link")
        try FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)
        let sentinel = target.appendingPathComponent("keep")
        try Data("unrelated private data".utf8).write(to: sentinel)
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: target)
        let rejected = NativeCommunitySafetyExportFile(root: link)
        #expect(!rejected.ready)
        #expect(throws: (any Error).self) { try rejected.write(Data("{}".utf8)) }
        let root = base.appendingPathComponent("owned-root")
        let files = NativeCommunitySafetyExportFile(root: root)
        try FileManager.default.createSymbolicLink(at: root.appendingPathComponent("child"), withDestinationURL: target)
        try files.clear()
        #expect(try Data(contentsOf: sentinel) == Data("unrelated private data".utf8))
    }
    static var actor: NativeCommunitySafetyActor { .init(scope: scope, sessionID: session) }
    static let objectID = "44444444-4444-4444-8444-444444444444"
    static var object: [String: Any] {
        ["id": objectID, "submissionVersion": 2, "safetyVersion": 0, "title": "Controlled content", "content": "Internal experience",
         "contentKind": "experience", "benefitDisclosure": "Self-reported only", "authorDisclosure": "unknown", "reviewerDisclosure": "employee",
         "source": "user_experience", "copyright": "unknown", "visibility": "internal", "publiclyVisible": false, "retrievalEligible": false,
         "canReport": true, "canBlock": true, "expiresAt": "2026-10-05T10:00:30Z"]
    }
    static func response(_ raw: [String: Any]) throws -> Data {
        var data: [String: Any] = ["schemaVersion": NativeCommunitySafetyWire.schema, "actorId": scope.subject, "sessionId": session]
        data.merge(raw) { _, next in next }; return try NativeCommunityWire.bytes(["data": data])
    }
    static func report(_ id: String, state: String = "pending") -> [String: Any] {
        ["kind": "report", "id": id, "submissionId": objectID, "category": "other", "details": state == "erased" ? NSNull() : "Own explanation",
         "state": state, "version": state == "pending" ? 1 : 2, "createdAt": "2026-10-05T10:00:00Z", "resolvedAt": state == "pending" ? NSNull() : "2026-10-05T10:00:01Z", "note": NSNull()]
    }
    static func files() -> NativeCommunitySafetyExportFile { .init(root: FileManager.default.temporaryDirectory.appendingPathComponent("SafetyStoreTests-" + UUID().uuidString)) }
    static func journal(_ vault: SafetyTestVault) -> NativeCommunitySafetyJournal {
        .init(vault: vault, validate: { _ = try NativeCommunitySafetyCommand(body: $0) })
    }

    @Test func canonicalModelsRejectStaffInferenceForeignReporterAndExtraKeys() throws {
        let object = try NativeCommunitySafetyObject(Self.object)
        #expect(object.authorDisclosure == "unknown" && object.reviewerDisclosure == "employee")
        var invalid = Self.object; invalid["isStaff"] = true
        #expect(throws: (any Error).self) { try NativeCommunitySafetyObject(invalid) }
        invalid = Self.object; invalid["canReport"] = 1
        #expect(throws: (any Error).self) { try NativeCommunitySafetyObject(invalid) }
        let disposition: [String: Any] = ["kind": "disposition", "id": Self.objectID, "submissionId": Self.objectID, "submissionVersion": 2, "safetyVersion": 1, "state": "removed", "j1Status": "published", "note": "Author-visible note", "appealable": true]
        let own = try NativeCommunitySafetyRecord(disposition)
        #expect(own.appealBasis == "safety_removal")
        var leaked = disposition; leaked["reporterId"] = Self.scope.subject
        #expect(throws: (any Error).self) { try NativeCommunitySafetyRecord(leaked) }
        leaked = disposition; leaked["details"] = "Foreign sensitive report"
        #expect(throws: (any Error).self) { try NativeCommunitySafetyRecord(leaked) }
        var erased = Self.report(Self.objectID, state: "erased"); erased["details"] = "Old receipt text"
        #expect(throws: (any Error).self) { try NativeCommunitySafetyRecord(erased) }
    }

    @Test func canonicalCommandPreservesCASAndRejectsOperatorAndMalformedConsent() throws {
        let object = try NativeCommunitySafetyObject(Self.object)
        let command = try NativeCommunitySafetyCommand.object(object, action: "report", category: "rights", explanation: "Explicit complaint")
        let raw = try #require(JSONSerialization.jsonObject(with: command.body) as? [String: Any])
        #expect(raw["expectedSubmissionVersion"] as? Int == 2)
        #expect(raw["expectedSafetyVersion"] as? Int == 0)
        let input = try NativeCommunitySafetyInput(body: command.recovery())
        #expect(input.recovery?.body == command.body)
        var invalid = raw; invalid["expectedSafetyVersion"] = false
        #expect(throws: (any Error).self) { try NativeCommunitySafetyCommand(body: NativeCommunityWire.bytes(invalid)) }
        invalid = raw; invalid["action"] = "disposition"
        #expect(throws: (any Error).self) { try NativeCommunitySafetyCommand(body: NativeCommunityWire.bytes(invalid)) }
        invalid = raw; invalid["consent"] = "assumed"
        #expect(throws: (any Error).self) { try NativeCommunitySafetyCommand(body: NativeCommunityWire.bytes(invalid)) }
        invalid = raw; invalid["details"] = "NUL\u{0}rejected"
        #expect(throws: (any Error).self) { try NativeCommunitySafetyCommand(body: NativeCommunityWire.bytes(invalid)) }
    }

    @Test func serverExpiryStartDeadlineAndGenerationHidePrivateContent() async throws {
        var time = 100.0, wall = try NativeCommunitySafetyWire.dateValue("2026-10-05T10:00:00Z")
        let files = Self.files(); defer { try? FileManager.default.removeItem(at: files.root) }
        let store = NativeCommunitySafetyStore(files: files, uptime: { time }, now: { wall })
        store.bind(Self.actor)
        await store.load(current: { Self.actor }) { _ in time += 25; return try Self.response(["kind": "objects", "objects": [Self.object], "nextCursor": NSNull(), "complete": true]) }
        #expect(store.visibleObjects(Self.actor).count == 1)
        time = 131; store.tick(current: Self.actor)
        #expect(store.objects.isEmpty && !store.isFresh(Self.actor))
        time = 200
        await store.read(objectID: Self.objectID, current: { Self.actor }) { _ in try Self.response(["kind": "object", "object": Self.object]) }
        #expect(store.visibleObject(Self.actor) != nil)
        wall = wall.addingTimeInterval(31); store.tick(current: Self.actor)
        #expect(store.selectedObject == nil)
        wall = wall.addingTimeInterval(-31)
        await store.load(current: { Self.actor }) { _ in store.suspend(); return try Self.response(["kind": "objects", "objects": [Self.object], "nextCursor": NSNull(), "complete": true]) }
        #expect(store.objects.isEmpty && !store.loaded)
        await store.load(current: { Self.actor }) { _ in throw NativeDataError.server(code: "SAFETY_DISABLED") }
        #expect(store.notice == "SAFETY_DISABLED" && store.objects.isEmpty)
    }

    @Test func unknownACKRequiresSameBytesAndExplicitRecoveryBeforeRetry() async throws {
        let files = Self.files(); defer { try? FileManager.default.removeItem(at: files.root) }
        let vault = SafetyTestVault(), journal = Self.journal(vault)
        let now = try NativeCommunitySafetyWire.dateValue("2026-10-05T10:00:00Z")
        let store = NativeCommunitySafetyStore(files: files, now: { now })
        store.bind(Self.actor)
        await store.read(objectID: Self.objectID, current: { Self.actor }) { _ in try Self.response(["kind": "object", "object": Self.object]) }
        let object = try #require(store.visibleObject(Self.actor)), command = try NativeCommunitySafetyCommand.object(object, action: "report", category: "other", explanation: "Own explanation")
        var writes = 0
        await store.perform(command, current: { Self.actor }, read: { try journal.read(Self.scope, sessionID: Self.session) }, retain: { try journal.retain(body: $0, scope: Self.scope, sessionID: Self.session) }, complete: { try journal.complete($0, scope: Self.scope, sessionID: Self.session) }) { bytes in
            writes += 1; #expect(bytes == command.body); throw URLError(.networkConnectionLost)
        }
        #expect(store.pending?.body == command.body && store.notice == "ACK_UNKNOWN")
        #expect(!store.canPerform(try .delete(), current: Self.actor))
        await store.retry(current: { Self.actor }, read: { try journal.read(Self.scope, sessionID: Self.session) }, complete: { try journal.complete($0, scope: Self.scope, sessionID: Self.session) }) { _ in writes += 1; return Data() }
        #expect(writes == 1)
        await store.recover(current: { Self.actor }, complete: { try journal.complete($0, scope: Self.scope, sessionID: Self.session) }) { bytes in
            #expect(try NativeCommunitySafetyInput(body: bytes).recovery?.body == command.body)
            return try Self.response(["kind": "operation", "operationId": command.operationID, "state": "absent", "record": NSNull()])
        }
        #expect(store.canRetry(Self.actor))
        await store.retry(current: { Self.actor }, read: { try journal.read(Self.scope, sessionID: Self.session) }, complete: { try journal.complete($0, scope: Self.scope, sessionID: Self.session) }) { bytes in
            writes += 1; #expect(bytes == command.body)
            return try Self.response(["kind": "operation", "operationId": command.operationID, "state": "committed", "record": Self.report(try #require(command.recordID))])
        }
        #expect(writes == 2 && store.pending == nil && store.visibleRecord(Self.actor)?.id == command.recordID)
        #expect(try journal.read(Self.scope, sessionID: Self.session) == nil)
    }

    @Test func exportRequiresCompleteInventoryAndExpiresPhysicalCopy() async throws {
        var time = 100.0
        let files = Self.files(); defer { try? FileManager.default.removeItem(at: files.root) }
        let store = NativeCommunitySafetyStore(files: files, uptime: { time })
        store.bind(Self.actor)
        let export: [String: Any] = ["kind": "export", "scope": "community_safety_module", "coverage": "complete_for_community_safety", "reports": [], "dispositions": [], "appeals": [], "blocks": [], "authoredDecisions": [["recordId": Self.objectID, "kind": "report", "decision": "dismiss", "note": "My authored decision on foreign report", "createdAt": "2026-10-05T10:00:00Z"]], "receipts": [], "audits": [], "qualification": ["active": true], "retained": NativeCommunitySafetyWire.retained]
        let bytes = try Self.response(export)
        _ = try NativeCommunitySafetyOutcome.decode(bytes, actor: Self.actor)
        var invalid = export; invalid.removeValue(forKey: "qualification")
        #expect(throws: (any Error).self) { try NativeCommunitySafetyOutcome.decode(Self.response(invalid), actor: Self.actor) }
        invalid = export; invalid["qualification"] = ["active": 1]
        #expect(throws: (any Error).self) { try NativeCommunitySafetyOutcome.decode(Self.response(invalid), actor: Self.actor) }
        invalid = export; invalid.removeValue(forKey: "authoredDecisions")
        #expect(throws: (any Error).self) { try NativeCommunitySafetyOutcome.decode(Self.response(invalid), actor: Self.actor) }
        invalid = export; invalid["authoredDecisions"] = [["recordId": Self.objectID, "kind": "report", "decision": "dismiss", "note": "Mine", "createdAt": "2026-10-05T10:00:00Z", "details": "Foreign reason must never appear"]]
        #expect(throws: (any Error).self) { try NativeCommunitySafetyOutcome.decode(Self.response(invalid), actor: Self.actor) }
        await store.export(current: { Self.actor }) { _ in time += 20; return bytes }
        let path = try #require(store.exportURL(Self.actor)); #expect(FileManager.default.fileExists(atPath: path.path))
        time = 131; store.tick(current: Self.actor)
        #expect(store.exportURL(Self.actor) == nil && !FileManager.default.fileExists(atPath: path.path))
        let erase = try NativeCommunitySafetyCommand.delete()
        let ack = try NativeCommunitySafetyOutcome.decode(Self.response(["kind": "deleted", "operationId": erase.operationID, "scope": "community_safety_module", "retained": NativeCommunitySafetyWire.retained]), actor: Self.actor)
        #expect(try ack.terminal(for: erase, recovery: false))
        let wrong = try NativeCommunitySafetyOutcome.decode(Self.response(["kind": "operation", "operationId": UUID().uuidString.lowercased(), "state": "committed", "record": NSNull()]), actor: Self.actor)
        #expect(throws: (any Error).self) { try wrong.terminal(for: erase, recovery: true) }
    }

}

@MainActor final class SafetyTestVault: NativeCredentialVault {
    var values: [String: Data] = [:]
    var dropWrite = false
    var dropRemoval = false
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        guard let value = values[service + "|" + owner] else { return (errSecItemNotFound, nil) }
        return (errSecSuccess, value)
    }
    func write(_ data: Data, service: String, owner: String) -> OSStatus {
        if !dropWrite { values[service + "|" + owner] = data }
        return errSecSuccess
    }
    func remove(service: String, owner: String) -> OSStatus {
        if !dropRemoval { values.removeValue(forKey: service + "|" + owner) }
        return errSecSuccess
    }
}

import Foundation
import Testing
import Security
@testable import VisePanda

private final class CoverageFixtureMarker: NSObject {}

@MainActor struct NativeDataCoverageTests {
    private func producer() throws -> [String: Any] {
        let url = try #require(Bundle(for: CoverageFixtureMarker.self).url(forResource: "coverage-producer", withExtension: "json"))
        return try NativeCommunityWire.object(JSONSerialization.jsonObject(with: Data(contentsOf: url)), ["evidence", "catalog", "requestBytes", "receipt"])
    }
    private func actor(_ epoch: Int = 1) -> NativeCommunitySafetyActor {
        .init(scope: .init(endpoint: "https://fixture.invalid/", subject: "12345678-1234-4123-8123-123456789abc", mobileEpoch: epoch, generation: epoch),
              sessionID: "22345678-1234-4123-8123-123456789abc")
    }
    private func catalogBytes() throws -> Data { try NativeCommunityWire.bytes(producer()["catalog"] as! [String: Any]) }
    private func module(_ id: String) throws -> NativeDataCoverageModule {
        try #require(NativeDataCoverageCatalog(bytes: catalogBytes(), actor: actor()).modules.first { $0.id == id })
    }
    private func deletion() throws -> NativeDataCoverageCommand {
        let original = try NativeCommunityCommand.delete()
        return try .init(module: module("ugc"), actor: actor(), operationID: original.operationID, action: .delete, commandBytes: original.body)
    }
    private func result(_ command: NativeDataCoverageCommand, state: String, original: Any? = nil) throws -> Data {
        var v = try NativeCommunityWire.object(JSONSerialization.jsonObject(with: command.body), ["schemaVersion", "catalogVersion", "actorId", "sessionId", "mobileEpoch", "moduleId", "moduleVersion", "operationId", "action", "phase", "confirmed", "tripId", "commandBytes"])
        v.removeValue(forKey: "confirmed"); v.removeValue(forKey: "tripId"); v.removeValue(forKey: "commandBytes")
        v["requestDigest"] = NativeDataCoverageWire.digest(command.body); v["state"] = state
        v["reason"] = state == "scoped_complete" ? "NONE" : state == "partial" ? "ORIGINAL_OPERATION_CANCELLED" : state == "queued" ? "ORIGINAL_JOB_PENDING" : "ORIGINAL_ACK_ABSENT"; v["result"] = original ?? NSNull(); v["allUserDataCompleted"] = false
        return try NativeCommunityWire.bytes(v)
    }
    private func original(_ command: NativeDataCoverageCommand, state: String? = nil) -> [String: Any] {
        var v: [String: Any] = ["schemaVersion": NativeCommunityWire.schema, "actorId": actor().scope.subject, "sessionId": actor().sessionID,
                                "operationId": command.operationID]
        if let state { v["kind"] = "operation"; v["state"] = state; v["submission"] = NSNull() }
        else { v["kind"] = "deleted"; v["scope"] = "community_module"; v["retained"] = NativeCommunityWire.retained }
        return ["data": v]
    }
    private func files(root: URL, uptime: @escaping () -> TimeInterval = { 100 }, now: @escaping () -> Date = Date.init) -> NativeDataCoverageExportFile {
        .init(root: root, uptime: uptime, now: now)
    }
    private func journal(_ vault: CoverageTestVault) -> NativeDataCoverageJournal {
        .init(vault: vault, validate: { body in
            let command = try NativeDataCoverageCommand(body: body)
            guard command.action == .delete, command.phase == .execute else { throw NativeDataError.invalidResponse }
        })
    }
    private func client(current: @escaping () -> NativeCommunitySafetyActor?, vault: CoverageTestVault,
                        request: @escaping (String, Data?, NativeCommunitySafetyActor) async throws -> Data,
                        completeOriginal: @escaping (NativeDataCoverageCommand, NativeDataCoverageReceipt, NativeCommunitySafetyActor) throws -> Void = { _, _, _ in }) -> NativeDataCoverageClient {
        let journal = journal(vault)
        return .init(current: current, request: request, saved: { try journal.read($0) }, retain: { try journal.retain($0, actor: $1) },
                     complete: { try journal.complete($0, actor: $1) }, retainOriginal: { _, _ in }, completeOriginal: completeOriginal)
    }

    @Test func closedCatalogPreservesMissingDenominatorAndRejectsOldVersionActorBoolean() throws {
        let a = actor(), p = try producer(), valid = try catalogBytes()
        let decoded = try NativeDataCoverageCatalog(bytes: valid, actor: a)
        #expect(decoded.modules.count == 31)
        #expect(Set(decoded.modules.map(\.id)) == Set(NativeDataCoverageCopy.order))
        #expect(decoded.modules.contains { $0.id == "coverage_progress" && $0.exportHandler == nil && !$0.missing.isEmpty })
        #expect(decoded.modules.contains { $0.id == "app_group" && $0.location == .device })
        var value = try #require(p["catalog"] as? [String: Any])
        let rows = try #require(value["modules"] as? [[String: Any]])
        for mutation in ["missing", "duplicate", "catalog", "actor", "boolean", "all"] {
            var bad = value
            switch mutation {
            case "missing": bad["modules"] = Array(rows.dropLast())
            case "duplicate": bad["modules"] = Array(rows.dropLast()) + [rows[0]]
            case "catalog": bad["catalogVersion"] = "data-coverage-catalog/2026-10-06.1"
            case "actor": bad["actorId"] = "32345678-1234-4123-8123-123456789abc"
            case "boolean": bad["mobileEpoch"] = true
            default: bad["allUserDataCompleted"] = true
            }
            #expect(throws: (any Error).self) { _ = try NativeDataCoverageCatalog(bytes: NativeCommunityWire.bytes(bad), actor: a) }
        }
        value["modules"] = rows + [rows[0]]
        #expect(throws: (any Error).self) { _ = try NativeDataCoverageCatalog(bytes: NativeCommunityWire.bytes(value), actor: a) }
    }

    @Test func realProducerEnvelopeAndIndependentChildDecoderRejectSubstitution() throws {
        let p = try producer(), a = actor()
        let raw = try #require(p["requestBytes"] as? String), command = try NativeDataCoverageCommand(body: Data(raw.utf8))
        let r = try #require(p["receipt"] as? [String: Any])
        let receipt = try NativeDataCoverageReceipt(bytes: NativeCommunityWire.bytes(r), actor: a, command: command)
        let verified = try NativeDataCoverageOriginal.verify(receipt, original: command, actor: a)
        #expect(verified.artifact != nil && verified.state == .scopedComplete)
        for key in ["operationId", "moduleVersion", "requestDigest", "actorId", "allUserDataCompleted"] {
            var bad = r
            bad[key] = key == "allUserDataCompleted" ? true : key == "requestDigest" ? String(repeating: "f", count: 64) : "42345678-1234-4123-8123-123456789abc"
            #expect(throws: (any Error).self) { _ = try NativeDataCoverageReceipt(bytes: NativeCommunityWire.bytes(bad), actor: a, command: command) }
        }
        var bad = r
        bad["result"] = ["data": ["schemaVersion": "community-j1/1", "kind": "session", "actorId": a.scope.subject, "sessionId": a.sessionID]]
        let outer = try NativeDataCoverageReceipt(bytes: NativeCommunityWire.bytes(bad), actor: a, command: command)
        #expect(throws: (any Error).self) { _ = try NativeDataCoverageOriginal.verify(outer, original: command, actor: a) }
    }

    @Test func exactFrozenBytesAndSessionFenceSurviveRelaunchAndRejectReplacementOrEraseFailure() throws {
        let a = actor(), vault = CoverageTestVault(), j = journal(vault), command = try deletion()
        let padded = Data(" \n".utf8) + command.body + Data("\n ".utf8)
        let saved = try j.retain(padded, actor: a)
        #expect(try j.read(a)?.body == padded)
        #expect(throws: (any Error).self) { _ = try j.retain(deletion().body, actor: a) }
        #expect(throws: (any Error).self) { _ = try j.read(actor(2)) }
        let restored = try NativeDataCoverageCommand(body: saved.body), recovery = try restored.recovery()
        #expect(recovery.commandBytes == restored.commandBytes && recovery.operationID == restored.operationID)
        #expect(recovery.body != restored.body && NativeDataCoverageWire.digest(recovery.body) != NativeDataCoverageWire.digest(restored.body))
        vault.dropRemoval = true
        #expect(throws: (any Error).self) { try j.complete(saved, actor: a) }
        #expect(try j.read(a)?.body == padded)
        vault.dropRemoval = false; try j.complete(saved, actor: a)
        #expect(try j.read(a) == nil)
        vault.dropWrite = true
        #expect(throws: (any Error).self) { _ = try j.retain(command.body, actor: a) }
    }

    @Test func unknownWriteRestoresSameOperationOnlyAndMissingOrCancelledIsNeverComplete() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let a = actor(), vault = CoverageTestVault(), j = journal(vault), c = try deletion()
        var writes: [Data] = [], finished = 0
        let first = client(current: { a }, vault: vault, request: { method, body, _ in
            if method == "GET" { return try catalogBytes() }
            writes.append(try #require(body)); throw NativeDataError.server(code: "COVERAGE_UNAVAILABLE")
        })
        let store = NativeDataCoverageStore(files: files(root: root), uptime: { 100 }, now: Date.init)
        await store.load(first); await store.perform(c, selection: "explicit module", client: first)
        #expect(writes == [c.body] && store.pending?.body == c.body && store.visibleRows(a).isEmpty)
        let second = client(current: { a }, vault: vault, request: { method, body, _ in
            if method == "GET" { return try catalogBytes() }
            let input = try NativeDataCoverageCommand(body: #require(body))
            #expect(input.phase == .recover && input.commandBytes == c.commandBytes && input.operationID == c.operationID)
            return try result(input, state: "unknown", original: original(c, state: "absent"))
        }, completeOriginal: { _, _, _ in finished += 1 })
        let restored = NativeDataCoverageStore(files: files(root: root), uptime: { 100 }, now: Date.init)
        await restored.load(second); await restored.recover(second)
        #expect(restored.pending?.body == c.body && restored.visibleRows(a).first?.state == .unknown && finished == 0)
        let recover = try c.recovery()
        let absent = try NativeDataCoverageReceipt(bytes: result(recover, state: "scoped_complete", original: original(c, state: "absent")), actor: a, command: recover)
        #expect(throws: (any Error).self) { _ = try NativeDataCoverageOriginal.verify(absent, original: c, actor: a) }
        let cancelled = try NativeDataCoverageReceipt(bytes: result(recover, state: "partial", original: original(c, state: "abandoned")), actor: a, command: recover)
        let verified = try NativeDataCoverageOriginal.verify(cancelled, original: c, actor: a)
        #expect(verified.state == .partial && verified.terminal)
        let final = client(current: { a }, vault: vault, request: { method, body, _ in
            if method == "GET" { return try catalogBytes() }
            let input = try NativeDataCoverageCommand(body: #require(body))
            return try result(input, state: "scoped_complete", original: original(c, state: "committed"))
        }, completeOriginal: { _, _, _ in finished += 1 })
        await restored.recover(final)
        #expect(finished == 1 && restored.pending == nil && restored.visibleRows(a).first?.state == .scopedComplete)
        #expect(try j.read(a) == nil)
    }

    @Test func backgroundAndAccountSwitchRejectLateCoverageBodyAndClockRollback() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        var current: NativeCommunitySafetyActor? = actor(), clock = 100.0
        let store = NativeDataCoverageStore(files: files(root: root), uptime: { clock }, now: Date.init), vault = CoverageTestVault()
        var continuation: CheckedContinuation<Data, Never>?
        let c = client(current: { current }, vault: vault, request: { _, _, _ in await withCheckedContinuation { continuation = $0 } })
        let task = Task { await store.load(c) }
        while continuation == nil { await Task.yield() }
        store.suspend(); current = actor(2)
        continuation?.resume(returning: try catalogBytes()); await task.value
        #expect(store.visibleModules(current).isEmpty && store.visibleRows(current).isEmpty)
        current = actor()
        let normal = client(current: { current }, vault: vault, request: { _, _, _ in try catalogBytes() })
        await store.load(normal); #expect(store.visibleModules(current).count == 31)
        clock = 130; store.tick(normal); #expect(store.visibleModules(current).isEmpty)
        clock = 100; #expect(store.visibleModules(current).isEmpty)
    }

    @Test func canonicalCancelledFixtureAndAllOriginalCancelledKindsRejectCompletedOuter() throws {
        let url = try #require(Bundle(for: CoverageFixtureMarker.self).url(forResource: "coverage-cancelled", withExtension: "json"))
        let fixture = try NativeCommunityWire.object(JSONSerialization.jsonObject(with: Data(contentsOf: url)), ["evidence", "requestBytes", "valid", "tampered"])
        let c = try NativeDataCoverageCommand(body: Data((try #require(fixture["requestBytes"] as? String)).utf8))
        let valid = try NativeDataCoverageReceipt(bytes: NativeCommunityWire.bytes(fixture["valid"] as! [String: Any]), actor: actor(), command: c)
        let cancelled = try NativeDataCoverageOriginal.verify(valid, original: c, actor: actor())
        #expect(cancelled.terminal && cancelled.state == .partial)
        let tampered = try NativeDataCoverageReceipt(bytes: NativeCommunityWire.bytes(fixture["tampered"] as! [String: Any]), actor: actor(), command: c)
        #expect(throws: (any Error).self) { _ = try NativeDataCoverageOriginal.verify(tampered, original: c, actor: actor()) }
        for id in ["ugc", "safety", "publication", "case", "brief"] {
            let inner: Data, op: String
            switch id {
            case "ugc": let v = try NativeCommunityCommand.delete(); inner = v.body; op = v.operationID
            case "safety": let v = try NativeCommunitySafetyCommand.delete(); inner = v.body; op = v.operationID
            case "publication": let v = try NativeExperienceCommand.delete(); inner = v.body; op = v.operationID
            case "case":
                op = UUID().uuidString.lowercased()
                inner = try NativeCommunityWire.bytes(["action": "delete", "operationId": op, "caseId": "32345678-1234-4123-8123-123456789abc", "grantRevision": 1, "confirmed": true])
            default:
                let v = try NativeTravelerBriefCommand(cleanup: "delete", caseID: "32345678-1234-4123-8123-123456789abc", recipientID: "42345678-1234-4123-8123-123456789abc", grantRevision: 1, revision: 1)
                inner = v.body; op = v.operationID
            }
            let originalCommand = try NativeDataCoverageCommand(module: module(id), actor: actor(), operationID: op, action: .delete, commandBytes: inner)
            let recover = try originalCommand.recovery(), body: [String: Any]
            if id == "brief" {
                body = ["data": ["receipt": ["schemaVersion": NativeTravelerBriefWire.version, "kind": "receipt", "operationId": op,
                    "requestDigest": NativeDataCoverageWire.digest(inner), "action": "delete", "outcome": "cancelled", "caseId": "32345678-1234-4123-8123-123456789abc",
                    "revision": 1, "grantRevision": 1, "createdAt": Int(Date().timeIntervalSince1970 * 1000)]]]
            } else if id == "case" {
                body = ["data": ["receipt": ["schemaVersion": "service-case-data/1", "kind": "receipt", "operationId": op,
                    "requestDigest": NativeDataCoverageWire.digest(inner), "outcome": "cancelled", "createdAt": Int(Date().timeIntervalSince1970 * 1000), "allUserDataCompleted": false]]]
            } else {
                var v: [String: Any] = ["schemaVersion": id == "ugc" ? NativeCommunityWire.schema : id == "safety" ? NativeCommunitySafetyWire.schema : NativeExperienceWire.schema,
                    "actorId": actor().scope.subject, "sessionId": actor().sessionID, "kind": "operation", "operationId": op, "state": "abandoned"]
                if id == "ugc" { v["submission"] = NSNull() }
                else if id == "safety" { v["record"] = NSNull() }
                else { v["publication"] = NSNull(); v["reference"] = NSNull() }
                body = ["data": v]
            }
            let honest = try NativeDataCoverageReceipt(bytes: result(recover, state: "partial", original: body), actor: actor(), command: recover)
            let meaning = try NativeDataCoverageOriginal.verify(honest, original: originalCommand, actor: actor())
            #expect(meaning.terminal && meaning.state == .partial)
            let lie = try NativeDataCoverageReceipt(bytes: result(recover, state: "scoped_complete", original: body), actor: actor(), command: recover)
            #expect(throws: (any Error).self) { _ = try NativeDataCoverageOriginal.verify(lie, original: originalCommand, actor: actor()) }
        }
    }

    @Test func protectedExportPurgesOnExpiryAndCleanupFailureFencesDelivery() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let a = actor(), wall = Date(timeIntervalSince1970: 1000)
        var clock = 100.0, block = false
        let f = NativeDataCoverageExportFile(root: root, remove: { path in if block { throw NativeDataError.sessionUnavailable }; try FileManager.default.removeItem(at: path) }, uptime: { clock }, now: { wall })
        try f.write(Data("synthetic owned bytes".utf8), actor: a, started: 100, expiresAt: wall.addingTimeInterval(30), current: { a })
        let path = try #require(f.visible(current: a)); #expect(FileManager.default.fileExists(atPath: path.path))
        clock = 130; block = true
        #expect(throws: (any Error).self) { try f.tick(current: a) }
        #expect(!f.ready && f.visible(current: a) == nil)
        block = false; try f.clear()
        #expect(!FileManager.default.fileExists(atPath: path.path))
        #expect(throws: (any Error).self) { try f.write(Data("late".utf8), actor: a, started: 100, expiresAt: wall.addingTimeInterval(30), current: { a }) }
    }

    @Test func ownerModuleBundleProvesCountsAndOriginalRowsAndRejectsForeignHiddenOrExpiredData() throws {
        let a = actor(), now = Date(timeIntervalSince1970: 1000), id = "32345678-1234-4123-8123-123456789abc"
        let row: [String: Any] = ["key": "device:" + id, "domain": "device", "deviceId": id, "revision": 1, "permission": "denied", "active": false, "environment": "sandbox", "timeZone": "UTC"]
        let command = try NativeDataCoverageCommand(module: module("notifications"), actor: a, operationID: id, action: .export,
                                                   commandBytes: NativeCommunityWire.bytes(["action": "export", "requestId": id, "confirmed": true]))
        let bundle: [String: Any] = ["schemaVersion": "coverage-module-export/1", "kind": "bundle", "requestId": id, "scope": "notification-metadata/1",
            "ownerId": a.scope.subject, "sessionId": a.sessionID, "mobileEpoch": 1, "sourceDigest": String(repeating: "a", count: 64), "capturedAt": 1_000_000, "expiresAt": 1_030_000,
            "allUserDataCompleted": false, "sections": ["notifications": [row]], "limits": ["pageSize": 100, "maxPages": 100, "maxRows": 10_000, "maxBytes": 1_000_000],
            "proof": ["coverage": "complete", "pages": 1, "rows": 1]]
        _ = try NativeDataCoverageOwnerBundle(bytes: NativeCommunityWire.bytes(["data": bundle]), actor: a, command: command, now: now)
        for mutation in ["token", "foreign", "proof", "expiry", "scope"] {
            var bad = bundle
            switch mutation {
            case "token": var secret = row; secret["token"] = "synthetic-prohibited-token"; bad["sections"] = ["notifications": [secret]]
            case "foreign": bad["ownerId"] = id
            case "proof": bad["proof"] = ["coverage": "complete", "pages": 1, "rows": 0]
            case "expiry": bad["expiresAt"] = 1_040_000
            default: bad["scope"] = "trip-lifecycle-metadata/1"
            }
            #expect(throws: (any Error).self) { _ = try NativeDataCoverageOwnerBundle(bytes: NativeCommunityWire.bytes(["data": bad]), actor: a, command: command, now: now) }
        }
        #expect(throws: (any Error).self) { _ = try NativeDataCoverageOwnerBundle(bytes: NativeCommunityWire.bytes(["data": bundle]), actor: a, command: command, now: now.addingTimeInterval(30)) }
    }

    @Test func corePreparationAndDeviceHandoffCannotPromoteWholeAccountOrOtherBriefScope() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let a = actor(), store = NativeDataCoverageStore(files: files(root: root), uptime: { 100 }, now: Date.init)
        let c = client(current: { a }, vault: CoverageTestVault(), request: { _, _, _ in try catalogBytes() })
        await store.load(c)
        let receipt = NativeCoreExportReceipt(kind: "privacy_export_job/1", requestId: "32345678-1234-4123-8123-123456789abc", scope: "core-export-d2/1", state: "ready_complete", generation: 1,
            createdAt: "2026-10-06T00:00:00.000Z", completedAt: "2026-10-06T00:00:00.000Z", artifactDigest: String(repeating: "a", count: 64), artifactBytes: 1,
            artifactExpiresAt: "2026-10-06T00:05:00.000Z", modules: NativeCoreExportReceipt.modules.map { .init(module: $0, status: "complete", reason: "NONE", pages: 1, rows: 1, digest: String(repeating: "a", count: 64)) }, allUserDataCompleted: false)
        store.recordCore(receipt, delivered: false, current: a); #expect(store.visibleRows(a).isEmpty)
        store.recordCore(receipt, delivered: true, current: a)
        #expect(store.visibleRows(a).count == 8)
        #expect(!store.visibleRows(a).contains { $0.moduleID == "brief" })
        #expect(!store.visibleRows(a).contains { $0.moduleID == "ugc" || $0.moduleID == "notifications" })
        store.recordDevice(moduleID: "materials", action: .export, operationID: UUID().uuidString, selection: "selected fixture", state: .partial, current: a)
        #expect(store.visibleRows(a).first { $0.moduleID == "materials" }?.state == .partial)
        store.suspend(); #expect(store.visibleRows(a).isEmpty)
    }

    @Test func emitRealSwiftCoverageCommandsForCanonicalTSParser() throws {
        let a = actor(), command = try deletion(), folder = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("NativeDataCoverageWireFixtures", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        var values: [String: Data] = ["native-ugc-delete.json": command.body, "native-ugc-recover.json": try command.recovery().body]
        for id in ["case", "brief", "notifications", "lifecycle"] {
            let op = UUID().uuidString.lowercased()
            let wrapped = try NativeDataCoverageCommand(module: module(id), actor: a, operationID: op, action: .export,
                commandBytes: NativeCommunityWire.bytes(["action": "export", "requestId": op, "confirmed": true]))
            values["native-" + id + "-export.json"] = wrapped.body
        }
        for (name, bytes) in values { try bytes.write(to: folder.appendingPathComponent(name)) }
        print("COVERAGE_FIXTURE_ROOT=" + folder.path)
    }

    @Test func actualNativeSessionCoverageTransportRequiresFrozenBytesAndDenialErasesBeforeLegacyPreserve() async throws {
        let name = "coverage-session-fixture-" + UUID().uuidString
        let defaults = try #require(UserDefaults(suiteName: name)); defer { defaults.removePersistentDomain(forName: name) }
        let vault = CoverageTestVault(), configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [CoverageSessionProtocol.self]
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", "http://127.0.0.1:65458"], defaults: defaults, configuration: configuration, bundleConfiguration: [:], vault: vault)
        await session.login(email: "coverage-synthetic@example.invalid", password: "synthetic-only")
        let a = try session.communitySafetyActor(), m = try module("ugc"), original = try NativeCommunityCommand.delete()
        let c = try NativeDataCoverageCommand(module: m, actor: a, operationID: original.operationID, action: .delete, commandBytes: original.body)
        do { _ = try await session.dataCoverageRequest(method: "POST", body: c.body, actor: a); Issue.record("Unjournaled write was sent") } catch { }
        #expect(session.dataScope == a.scope)
        let bytes = try await session.dataCoverageRequest(method: "GET", actor: a)
        #expect(try NativeDataCoverageCatalog(bytes: bytes, actor: a).modules.count == 31)
        let pending = try session.rememberDataCoverage(body: c.body, actor: a)
        let j = journal(vault)
        #expect(try j.read(a)?.body == c.body)
        let wrong = NativeCommunitySafetyActor(scope: a.scope, sessionID: "42345678-1234-4123-8123-123456789abc")
        do { _ = try await session.dataCoverageRequest(method: "GET", actor: wrong); Issue.record("Foreign session accepted") } catch { }
        #expect(session.dataScope == a.scope)
        vault.dropRemoval = true
        do { _ = try await session.dataCoverageRequest(method: "POST", body: c.body, actor: a) } catch { }
        #expect(session.dataScope == nil && session.status == "storageError")
        #expect(session.failureCode == "dataCoverageJournalCleanupRequired")
        #expect(try j.read(a) == pending)
        vault.dropRemoval = false; await session.logout()
        #expect(session.status == "signedOut")
        #expect(try j.read(a) == nil)
    }
}

@MainActor private final class CoverageTestVault: NativeCredentialVault {
    var values: [String: Data] = [:]
    var dropWrite = false
    var dropRemoval = false
    func read(service: String, owner: String) -> (OSStatus, Data?) { values[service + "|" + owner].map { (errSecSuccess, $0) } ?? (errSecItemNotFound, nil) }
    func write(_ data: Data, service: String, owner: String) -> OSStatus { if !dropWrite { values[service + "|" + owner] = data }; return errSecSuccess }
    func remove(service: String, owner: String) -> OSStatus { if !dropRemoval { values.removeValue(forKey: service + "|" + owner) }; return errSecSuccess }
}

/// URLProtocol fixture, no listening service, real credentials, target grant or network request.
nonisolated private final class CoverageSessionProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "127.0.0.1" && request.url?.port == 65458 }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let owner = "12345678-1234-4123-8123-123456789abc", session = "22345678-1234-4123-8123-123456789abc"
        let path = request.url!.path
        var status = 200, value: [String: Any]
        if path.hasSuffix("/credentials") {
            let claim = try! JSONSerialization.data(withJSONObject: ["sub": owner, "session_id": session]).base64EncodedString()
                .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
            value = ["subject": owner, "accessToken": "synthetic." + claim + ".unsigned-fixture", "refreshToken": "synthetic-only", "expiresAt": Date().timeIntervalSince1970 + 3600]
        } else if path.hasSuffix("/login") { value = ["subject": owner, "mobileEpoch": 1] }
        else if path.hasSuffix("/profile") { value = ["subject": owner, "displayName": "Synthetic"] }
        else if path.hasSuffix("/logout") { value = [:] }
        else if path == "/api/privacy/native/v1/coverage", request.value(forHTTPHeaderField: "Cookie") == nil,
                request.value(forHTTPHeaderField: "Origin") == nil, request.value(forHTTPHeaderField: "Authorization")?.hasPrefix("Bearer synthetic.") == true {
            if request.httpMethod == "GET" {
                let url = Bundle(for: CoverageFixtureMarker.self).url(forResource: "coverage-producer", withExtension: "json")!
                value = (try! JSONSerialization.jsonObject(with: Data(contentsOf: url)) as! [String: Any])["catalog"] as! [String: Any]
            } else { status = 401; value = ["error": ["code": "UNAUTHENTICATED"]] }
        } else { status = 400; value = ["error": ["code": "INVALID_FIXTURE_TRANSPORT"]] }
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: try! JSONSerialization.data(withJSONObject: value)); client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

import Foundation
import Security
import Testing
@testable import VisePanda

@MainActor struct NativeMaterialReferenceDataTests {
    private let actor = NativeCommunitySafetyActor(scope: .init(endpoint: "http://127.0.0.1:65158",
        subject: "22222222-2222-4222-8222-222222222222", mobileEpoch: 2, generation: 1),
        sessionID: "33333333-3333-4333-8333-333333333333")
    private let trip = "44444444-4444-4444-8444-444444444444"
    private let object = "55555555-5555-4555-8555-555555555555"

    @Test func foregroundAndReplacementSessionInvalidateCapturedAuthority() {
        var lifetime = NativeMaterialReferenceLifetime()
        lifetime.bind(actor, active: true)
        let first = lifetime.generation
        #expect(lifetime.accepts(first, actor: actor, current: actor))
        lifetime.bind(actor, active: false); lifetime.bind(actor, active: true)
        #expect(!lifetime.accepts(first, actor: actor, current: actor))
        let second = lifetime.generation
        let changed = NativeCommunitySafetyActor(scope: actor.scope, sessionID: "66666666-6666-4666-8666-666666666666")
        #expect(!lifetime.accepts(second, actor: actor, current: changed))
        lifetime.bind(changed, active: true)
        #expect(!lifetime.accepts(second, actor: actor, current: actor))
    }

    @Test func requestStartAndServerExpiryCannotRenewOnLateReplyOrClockRollback() throws {
        let now = Date(timeIntervalSince1970: 1000)
        let lease = try NativeMaterialReferenceLease(started: 10, received: 25, now: now, expiresAt: now.addingTimeInterval(30))
        #expect(lease.valid(uptime: 39.9, now: now.addingTimeInterval(1)))
        #expect(!lease.valid(uptime: 40, now: now.addingTimeInterval(1)))
        #expect(!lease.valid(uptime: 9, now: now))
        #expect(!lease.valid(uptime: 26, now: now.addingTimeInterval(30)))
        #expect(throws: (any Error).self) { try NativeMaterialReferenceLease(started: 10, received: 40, now: now, expiresAt: now.addingTimeInterval(30)) }
    }

    @Test func recoveryRetainsExactMutationBytesAndRejectsChangedSelectionAndPrivilegeSelectors() throws {
        let preview = try NativeMaterialReferenceCommand.preview(scope: .pdf, tripID: trip, objectIDs: [object])
        let mutation = try preview.confirmed(action: "erase", previewDigest: String(repeating: "a", count: 64))
        let recovery = try mutation.recovery()
        #expect(recovery.mutationBytes == mutation.body)
        #expect(recovery.requestID == mutation.requestID && recovery.objectIDs == mutation.objectIDs)
        var foreign = try #require(JSONSerialization.jsonObject(with: recovery.body) as? [String: Any])
        foreign["tripId"] = "77777777-7777-4777-8777-777777777777"
        #expect(throws: (any Error).self) { try NativeMaterialReferenceCommand(body: NativeCommunityWire.bytes(foreign)) }
        var privileged = try #require(JSONSerialization.jsonObject(with: mutation.body) as? [String: Any])
        privileged["ownerId"] = actor.scope.subject
        #expect(throws: (any Error).self) { try NativeMaterialReferenceCommand(body: NativeCommunityWire.bytes(privileged)) }
        var uppercase = try #require(JSONSerialization.jsonObject(with: mutation.body) as? [String: Any])
        uppercase["tripId"] = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa".uppercased()
        #expect(throws: (any Error).self) { try NativeMaterialReferenceCommand(body: NativeCommunityWire.bytes(uppercase)) }
    }

    @Test func unknownEraseJournalSurvivesRelaunchAndCannotBeOverwrittenOrCrossSession() throws {
        let vault = MaterialReferenceTestVault(), journal = NativeMaterialReferenceJournal(vault: vault)
        let preview = try NativeMaterialReferenceCommand.preview(scope: .reservations, tripID: trip, objectIDs: [object])
        let mutation = try preview.confirmed(action: "erase", previewDigest: String(repeating: "a", count: 64))
        let saved = try journal.retain(mutation, actor: actor)
        let restarted = NativeMaterialReferenceJournal(vault: vault)
        #expect(try restarted.read(actor)?.body == mutation.body)
        let changed = try NativeMaterialReferenceCommand.preview(scope: .reservations, tripID: trip, objectIDs: [object])
            .confirmed(action: "erase", previewDigest: String(repeating: "a", count: 64))
        #expect(throws: (any Error).self) { try restarted.retain(changed, actor: actor) }
        let replaced = NativeCommunitySafetyActor(scope: actor.scope, sessionID: "66666666-6666-4666-8666-666666666666")
        #expect(throws: (any Error).self) { try restarted.read(replaced) }
        vault.failErase = true
        #expect(throws: (any Error).self) { try restarted.complete(saved, actor: actor) }
        #expect(try restarted.read(actor) == saved)
        vault.failErase = false
        try restarted.complete(saved, actor: actor)
        #expect(try restarted.read(actor) == nil)
    }

    @Test func expiredPrivateExportAndCleanupFailureHideFileAndFenceNewWrite() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("vpj58-material-fixture-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        var time: TimeInterval = 10, failErase = false
        let wall = Date(timeIntervalSince1970: 1000), generation = UUID()
        let file = NativeMaterialReferenceExportFile(root: root, remove: { url in
            if failErase { throw NativeDataError.sessionUnavailable }; try FileManager.default.removeItem(at: url)
        }, uptime: { time }, now: { wall })
        let bytes = Data("{\"fixture\":true}".utf8)
        try file.write(bytes, actor: actor, generation: generation, started: 10, expiresAt: wall.addingTimeInterval(30),
            current: { actor }, currentGeneration: { generation })
        let path = try #require(file.visible(current: actor, generation: generation))
        #expect(try Data(contentsOf: path) == bytes)
        #expect(file.visible(current: actor, generation: UUID()) == nil)
        time = 40; failErase = true
        #expect(file.visible(current: actor, generation: generation) == nil)
        #expect(throws: (any Error).self) { try file.tick(current: actor, generation: generation) }
        #expect(!file.ready)
        #expect(throws: (any Error).self) {
            try file.write(bytes, actor: actor, generation: generation, started: 40, expiresAt: wall.addingTimeInterval(30),
                current: { actor }, currentGeneration: { generation })
        }
        failErase = false; try file.clear()
        #expect(try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).isEmpty)
    }

    @Test func scopedTripDiscoveryIncludesArchivedAndRetainedContextsWithoutBodyReadOrGuessedTitles() async throws {
        var time: TimeInterval = 10
        let wall = Date(timeIntervalSince1970: 1000)
        let picker = NativeMaterialReferenceTrips(uptime: { time }, now: { wall })
        let row = NativeMaterialReferenceTrip(id: trip, label: "Archived Trip", headVersion: 4, state: "archived")
        func data(_ scope: NativeMaterialReferenceScope, label: Any, state: String) throws -> Data {
            try envelope(["schemaVersion": NativeMaterialReferenceWire.schema, "kind": "trip_list", "scope": scope.rawValue,
                "ownerId": actor.scope.subject, "sessionId": actor.sessionID, "mobileEpoch": actor.scope.mobileEpoch,
                "sourceDigest": String(repeating: "a", count: 64), "capturedAt": 1_000_000, "expiresAt": 1_030_000,
                "items": [["tripId": trip, "tripVersion": 4, "label": label, "state": state]],
                "hasMore": false, "nextCursor": NSNull(), "allUserDataCompleted": false])
        }
        let first = NativeMaterialReferenceClient(current: { actor }, request: { bytes, _ in
            let command = try NativeMaterialReferenceCommand(body: bytes)
            #expect(command.action == "trip_list" && command.tripID == nil)
            return try data(.pdf, label: "Archived Trip", state: "archived")
        })
        await picker.load(scope: .pdf, client: first)
        #expect(picker.visible(actor) == [row])
        let forged = NativeMaterialReferenceTrip(id: "77777777-7777-4777-8777-777777777777", label: row.label, headVersion: 4, state: "archived")
        picker.select(forged, current: actor)
        #expect(picker.currentSelection(actor) == nil)
        picker.select(row, current: actor)
        #expect(picker.currentSelection(actor)?.state == "archived")
        let retained = NativeMaterialReferenceClient(current: { actor }, request: { _, _ in try data(.progress, label: NSNull(), state: "deleted") })
        await picker.load(scope: .progress, client: retained)
        #expect(picker.visible(actor).first?.label == nil && picker.visible(actor).first?.state == "deleted")
        let historical = try #require(picker.visible(actor).first)
        picker.select(historical, current: actor)
        #expect(picker.currentSelection(actor)?.id == trip)
        let wrong = NativeCommunitySafetyActor(scope: actor.scope, sessionID: "66666666-6666-4666-8666-666666666666")
        #expect(picker.visible(wrong).isEmpty)
        time = 40
        #expect(picker.currentSelection(actor) == nil && picker.visible(actor).isEmpty)
    }

    @Test func originalPdfConfirmedProofTakesPrecedenceOverCancellationAndExpiredMaterial() throws {
        let now = Date(timeIntervalSince1970: 1_000_000)
        var row = pdfRow(state: "confirmed")
        let value = try NativeMaterialReferenceRows.parse(row, scope: .pdf, tripID: trip, epoch: actor.scope.mobileEpoch, now: now)
        #expect(value.fields.first { $0.name == "originalState" }?.value == "confirmed")
        var op = try #require(row["operation"] as? [String: Any]); op["confirmationEventId"] = NSNull()
        row["operation"] = op
        #expect(throws: (any Error).self) { try NativeMaterialReferenceRows.parse(row, scope: .pdf, tripID: trip, epoch: actor.scope.mobileEpoch, now: now) }
        row = pdfRow(state: "cancelled")
        #expect(try NativeMaterialReferenceRows.parse(row, scope: .pdf, tripID: trip, epoch: actor.scope.mobileEpoch, now: now)
            .fields.first { $0.name == "originalState" }?.value == "cancelled")
    }

    @Test func closedPreviewRejectsHiddenBoundaryAndCancelledReceiptCannotPromoteToErase() throws {
        let now = Date(timeIntervalSince1970: 1000)
        let command = try NativeMaterialReferenceCommand.preview(scope: .pdf, tripID: trip, objectIDs: [object])
        var data = binding(command, captured: now)
        data["kind"] = "preview"; data["items"] = [pdfRow(state: "cancelled")]; data["requiresExplicitConfirmation"] = true
        let preview = try NativeMaterialReferenceProtocol.preview(envelope(data), command: command, actor: actor, now: now)
        #expect(preview.items.count == 1)
        var boundaries = try #require(data["boundaries"] as? [String: Any]); boundaries["missing"] = []
        data["boundaries"] = boundaries
        #expect(throws: (any Error).self) { try NativeMaterialReferenceProtocol.preview(envelope(data), command: command, actor: actor, now: now) }
        let mutation = try command.confirmed(action: "erase", previewDigest: String(repeating: "b", count: 64))
        var receipt = binding(command, captured: now)
        receipt["kind"] = "receipt"; receipt["state"] = "cancelled"; receipt["requestDigest"] = NativeMaterialReferenceProtocol.digest(mutation.body)
        receipt["decidedAt"] = 1_001_000
        receipt["effects"] = ["objects": 1, "temporaryRecords": 0, "unappliedProposals": 0, "tripMutation": "none", "externalOrders": "not_contacted", "financialRecords": "not_modified"]
        #expect(throws: (any Error).self) { try NativeMaterialReferenceProtocol.erased(envelope(receipt), command: mutation, actor: actor, now: now.addingTimeInterval(2)) }
    }

    @Test func lostEraseAckRestartsFromOriginalBytesAndRecoversImmutableReceiptAfterPreviewExpiry() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("vpj58-material-recovery-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let vault = MaterialReferenceTestVault()
        var wall = Date(timeIntervalSince1970: 1000), time: TimeInterval = 10
        let first = NativeMaterialReferenceStore(scope: .pdf, vault: vault, file: NativeMaterialReferenceExportFile(root: root), now: { wall }, uptime: { time })
        let row = NativeMaterialReferenceTrip(id: trip, label: "Owned Trip", headVersion: 4, state: "active")
        var previewCommand: NativeMaterialReferenceCommand?
        var mutationBytes: Data?
        let initial = NativeMaterialReferenceClient(current: { actor }, request: { bytes, capturedActor in
            #expect(capturedActor == actor)
            let command = try NativeMaterialReferenceCommand(body: bytes)
            if command.action == "list" {
                return try envelope(["schemaVersion": NativeMaterialReferenceWire.schema, "kind": "list", "scope": command.scope.rawValue,
                    "tripId": trip, "ownerId": actor.scope.subject, "sessionId": actor.sessionID, "mobileEpoch": actor.scope.mobileEpoch,
                    "sourceDigest": String(repeating: "a", count: 64), "capturedAt": 1_000_000, "expiresAt": 1_030_000,
                    "items": [["objectId": object, "revision": NSNull(), "label": NSNull(), "materialExpiresAt": NSNull(), "sourceState": "cancelled"]],
                    "hasMore": false, "nextCursor": NSNull(), "allUserDataCompleted": false])
            }
            if command.action == "preview" {
                previewCommand = command
                var value = binding(command, captured: wall); value["kind"] = "preview"
                value["items"] = [pdfRow(state: "cancelled")]; value["requiresExplicitConfirmation"] = true
                return try envelope(value)
            }
            #expect(command.action == "erase")
            #expect(try NativeMaterialReferenceJournal(vault: vault).read(actor)?.body == bytes)
            mutationBytes = bytes
            throw NativeDataError.server(code: "MATERIAL_ACK_UNKNOWN")
        })
        await first.load(trip: row, client: initial)
        first.toggle(try #require(first.visibleObjects(actor).first), actor: actor)
        await first.review(client: initial)
        let reviewed = try #require(first.visiblePreview(actor)?.binding)
        await first.execute(action: "erase", reviewed: reviewed, client: initial)
        #expect(first.pending != nil && first.completion == nil)
        first.suspend()
        let frozen = try #require(mutationBytes), command = try #require(previewCommand)
        wall = wall.addingTimeInterval(60); time += 60
        let restarted = NativeMaterialReferenceStore(scope: .pdf, vault: vault, file: NativeMaterialReferenceExportFile(root: root), now: { wall }, uptime: { time })
        let recovery = NativeMaterialReferenceClient(current: { actor }, request: { bytes, _ in
            let read = try NativeMaterialReferenceCommand(body: bytes)
            #expect(read.action == "recover" && read.mutationBytes == frozen)
            var value = binding(command, captured: Date(timeIntervalSince1970: 1000))
            value["kind"] = "receipt"; value["state"] = "erased"
            value["requestDigest"] = NativeMaterialReferenceProtocol.digest(frozen); value["decidedAt"] = 1_005_000
            value["effects"] = ["objects": 1, "temporaryRecords": 0, "unappliedProposals": 0, "tripMutation": "none", "externalOrders": "not_contacted", "financialRecords": "not_modified"]
            return try envelope(value)
        })
        await restarted.recover(client: recovery)
        #expect(restarted.pending == nil && restarted.visibleReceipt(actor)?.objects == 1)
        #expect(restarted.visiblePreview(actor) == nil && restarted.exportURL(actor) == nil)
        #expect(restarted.completion?.action == "delete" && restarted.completion?.requestID == command.requestID)
    }

    @Test func actualSessionTransportRequiresRetainedBytesAndDenialPreservesUntilExplicitLogout() async throws {
        let name = "vpj58.material-session." + UUID().uuidString
        let defaults = try #require(UserDefaults(suiteName: name))
        defer { defaults.removePersistentDomain(forName: name) }
        let vault = MaterialReferenceTestVault(), configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MaterialReferenceSessionProtocol.self]
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", actor.scope.endpoint], defaults: defaults,
            configuration: configuration, bundleConfiguration: [:], vault: vault)
        await session.login(email: "material-fixture@example.invalid", password: "synthetic-only")
        let current = try session.communitySafetyActor()
        let command = try NativeMaterialReferenceCommand.preview(scope: .pdf, tripID: trip, objectIDs: [object])
            .confirmed(action: "erase", previewDigest: String(repeating: "b", count: 64))
        do {
            _ = try await session.materialReferenceRequest(body: command.body, actor: current)
            Issue.record("Unretained erase was dispatched")
        } catch NativeDataError.staleSessionResponse { }
        let journal = NativeMaterialReferenceJournal(vault: vault), saved = try journal.retain(command, actor: current)
        do {
            _ = try await session.materialReferenceRequest(body: command.body, actor: current)
            Issue.record("Fixture lost ACK was accepted")
        } catch NativeDataError.server(let code) { #expect(code == "MATERIAL_ACK_UNKNOWN") }
        #expect(try journal.read(current) == saved && session.dataScope == current.scope)
        do {
            _ = try await session.materialReferenceRequest(body: command.recovery().body, actor: current)
            Issue.record("Fixture denial was accepted")
        } catch NativeDataError.server(let code) { #expect(code == "UNAUTHENTICATED") }
        #expect(session.dataScope == nil)
        #expect(try journal.read(current) == saved)
        let ownerKey = "native.v2.activeSubject." + current.scope.endpoint + ".pendingJournalCleanupOwner"
        #expect(defaults.string(forKey: ownerKey) == current.scope.subject)
        vault.failErase = true
        await session.logout()
        #expect(session.status == "storageError")
        #expect(session.failureCode == "materialReferenceJournalCleanupRequired")
        #expect(defaults.string(forKey: ownerKey) == current.scope.subject)
        #expect(try journal.read(current) == saved)
        await session.login(email: "replacement@example.invalid", password: "synthetic-only")
        #expect(session.dataScope == nil && session.status == "storageError")
        vault.failErase = false
        await session.logout()
        #expect(session.status == "signedOut")
        #expect(try journal.read(current) == nil)
        #expect(defaults.object(forKey: ownerKey) == nil)
    }

    @Test func immutableProducerInteroperatesForAllThreeSelectedScopesAndHistoricalTripContexts() throws {
        let url = try #require(Bundle(for: MaterialReferenceFixtureMarker.self).url(forResource: "material-reference-producer", withExtension: "json"))
        let fixture = try NativeCommunityWire.object(JSONSerialization.jsonObject(with: Data(contentsOf: url)), ["evidence", "now", "actor", "scopes"])
        let actorValue = try NativeCommunityWire.object(fixture["actor"] as Any, ["ownerId", "sessionId", "mobileEpoch"])
        let current = NativeCommunitySafetyActor(scope: .init(endpoint: actor.scope.endpoint,
            subject: try NativeMaterialReferenceCommand.id(actorValue["ownerId"]),
            mobileEpoch: try NativeCommunityWire.integer(actorValue["mobileEpoch"], max: 9_007_199_254_740_991), generation: 1),
            sessionID: try NativeMaterialReferenceCommand.id(actorValue["sessionId"]))
        let wall = try NativeMaterialReferenceWire.time(fixture["now"] as Any)
        let scopes = try NativeCommunityWire.object(fixture["scopes"] as Any, Set(NativeMaterialReferenceScope.allCases.map(\.rawValue)))
        for scope in NativeMaterialReferenceScope.allCases {
            let value = try NativeCommunityWire.object(scopes[scope.rawValue] as Any,
                ["previewBytes", "exportBytes", "eraseBytes", "recoverBytes", "preview", "bundle", "receipt", "tripListBytes", "tripList"])
            func command(_ key: String) throws -> NativeMaterialReferenceCommand {
                let text = try NativeCommunityWire.text(value[key], max: 16_384)
                return try .init(body: Data(text.utf8))
            }
            let previewCommand = try command("previewBytes"), exportCommand = try command("exportBytes"), eraseCommand = try command("eraseBytes")
            let preview = try NativeMaterialReferenceProtocol.preview(envelope(value["preview"] as! [String: Any]), command: previewCommand, actor: current, now: wall)
            let bundle = try NativeMaterialReferenceProtocol.bundle(envelope(value["bundle"] as! [String: Any]), command: exportCommand,
                preview: preview.binding, actor: current, now: wall)
            #expect(bundle.scope == scope && preview.items.map(\.id) == eraseCommand.objectIDs)
            let recovery = try command("recoverBytes")
            #expect(recovery.mutationBytes == eraseCommand.body)
            let reply = try NativeMaterialReferenceProtocol.erased(envelope(value["receipt"] as! [String: Any]), command: recovery,
                actor: current, now: wall.addingTimeInterval(60))
            guard case .erased(let receipt) = reply else { Issue.record("Immutable producer receipt was not erased"); continue }
            #expect(receipt.binding.scope == scope && receipt.objects == eraseCommand.objectIDs.count)
            let discovery = try command("tripListBytes")
            let trips = try NativeMaterialReferenceProtocol.trips(envelope(value["tripList"] as! [String: Any]), command: discovery, actor: current, now: wall)
            #expect(trips.trips.first?.id == preview.binding.tripID)
            if scope == .progress { #expect(trips.trips.first?.label == nil && trips.trips.first?.state == "deleted") }
            if scope == .pdf { #expect(trips.trips.first?.state == "active") }
        }
    }

    private func envelope(_ value: [String: Any]) throws -> Data { try NativeCommunityWire.bytes(["data": value]) }
    private func binding(_ command: NativeMaterialReferenceCommand, captured: Date) -> [String: Any] {
        let bounds = NativeMaterialReferenceBoundaries.expected(command.scope)
        return ["schemaVersion": NativeMaterialReferenceWire.schema, "scope": command.scope.rawValue, "requestId": command.requestID as Any? ?? NSNull(),
            "tripId": command.tripID as Any? ?? NSNull(), "objectIds": command.objectIDs, "ownerId": actor.scope.subject, "sessionId": actor.sessionID,
            "mobileEpoch": actor.scope.mobileEpoch, "sourceDigest": String(repeating: "a", count: 64), "previewDigest": String(repeating: "b", count: 64),
            "capturedAt": Int(captured.timeIntervalSince1970 * 1000), "expiresAt": Int(captured.timeIntervalSince1970 * 1000) + 30_000,
            "tripVersion": 4, "boundaries": ["exportFields": bounds.exportFields, "eraseFields": bounds.eraseFields, "retained": bounds.retained, "missing": bounds.missing],
            "allUserDataCompleted": false]
    }
    private func pdfRow(state: String) -> [String: Any] {
        let bound = state == "confirmed", hash = String(repeating: "a", count: 64)
        let metadata: [String: Any] = ["requestDigest": bound ? hash : NSNull(), "commandDigest": bound ? hash : NSNull(),
            "previewDigest": bound ? hash : NSNull(), "expiresAt": bound ? "1970-01-01T00:15:00.000Z" : NSNull(),
            "proposalId": bound ? "88888888-8888-4888-8888-888888888888" : NSNull(), "proposalRevision": bound ? 1 : NSNull(), "baseTripVersion": bound ? 4 : NSNull()]
        var operation = metadata
        operation.merge(["kind": "pdf_intake_operation/1", "operationId": object, "tripId": trip,
            "sessionEpoch": actor.scope.mobileEpoch, "state": state, "confirmationEventId": bound ? "99999999-9999-4999-8999-999999999999" : NSNull(),
            "resultingVersion": bound ? 5 : NSNull()], uniquingKeysWith: { _, next in next })
        var row = metadata
        row.merge(["operationId": object, "tripId": trip, "sessionEpoch": actor.scope.mobileEpoch, "cancelled": true,
            "fields": NSNull(), "contentHash": NSNull(), "rawPdfIncluded": false, "fullTextIncluded": false,
            "evidenceTier": "user_checked_local_pdf", "sourceAvailability": "local_only", "orderVerification": "unavailable", "operation": operation],
            uniquingKeysWith: { _, next in next })
        return row
    }
}

private final class MaterialReferenceFixtureMarker: NSObject {}

/// Unsigned URLProtocol fixture exercises actual NativeSession control flow.
/// No network listener, GoTrue credentials, target grant or provider is involved.
nonisolated private final class MaterialReferenceSessionProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "127.0.0.1" && request.url?.port == 65158 }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}
    override func startLoading() {
        let owner = "22222222-2222-4222-8222-222222222222", session = "33333333-3333-4333-8333-333333333333"
        let path = request.url!.path
        var status = 200
        let value: [String: Any]
        if path.hasSuffix("/credentials") {
            let claims = try! JSONSerialization.data(withJSONObject: ["sub": owner, "session_id": session]).base64EncodedString()
                .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
            value = ["subject": owner, "accessToken": "synthetic." + claims + ".unsigned-fixture", "refreshToken": "synthetic-only", "expiresAt": Date().timeIntervalSince1970 + 3600]
        } else if path.hasSuffix("/login") { value = ["subject": owner, "mobileEpoch": 2] }
        else if path.hasSuffix("/profile") { value = ["subject": owner, "displayName": "Synthetic"] }
        else if path.hasSuffix("/logout") { value = [:] }
        else if path == "/api/privacy/native/v1/material-references", request.httpMethod == "POST",
                request.value(forHTTPHeaderField: "Cookie") == nil, request.value(forHTTPHeaderField: "Origin") == nil,
                request.value(forHTTPHeaderField: "Authorization")?.hasPrefix("Bearer synthetic.") == true {
            let input = body().flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            status = input?["action"] as? String == "erase" ? 503 : 401
            value = ["error": ["code": status == 503 ? "MATERIAL_ACK_UNKNOWN" : "UNAUTHENTICATED"]]
        } else { status = 400; value = ["error": ["code": "INVALID_FIXTURE_TRANSPORT"]] }
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: try! JSONSerialization.data(withJSONObject: value)); client?.urlProtocolDidFinishLoading(self)
    }
    private func body() -> Data? {
        if let data = request.httpBody { return data }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open(); defer { stream.close() }
        var bytes = Data(), buffer = [UInt8](repeating: 0, count: 2048)
        while true {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count < 0 { return nil }; if count == 0 { return bytes }
            bytes.append(contentsOf: buffer.prefix(count))
        }
    }
}

@MainActor private final class MaterialReferenceTestVault: NativeCredentialVault {
    private var values: [String: Data] = [:]
    var failErase = false
    private func key(_ service: String, _ owner: String) -> String { service + "|" + owner }
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        guard let bytes = values[key(service, owner)] else { return (errSecItemNotFound, nil) }
        return (errSecSuccess, bytes)
    }
    func write(_ bytes: Data, service: String, owner: String) -> OSStatus { values[key(service, owner)] = bytes; return errSecSuccess }
    func remove(service: String, owner: String) -> OSStatus {
        if failErase, service == NativeMaterialReferenceJournal.service("http://127.0.0.1:65158") { return errSecInteractionNotAllowed }
        values.removeValue(forKey: key(service, owner)); return errSecSuccess
    }
}

import Foundation
import Testing
import Security
@testable import VisePanda

@MainActor struct NativeCommunityExperienceTests {
    private func actor(_ epoch: Int = 1) -> NativeCommunitySafetyActor {
        .init(scope: .init(endpoint: "https://fixture.invalid/", subject: "00000000-0000-4000-8000-000000000001", mobileEpoch: epoch, generation: epoch),
              sessionID: "00000000-0000-4000-8000-000000000002")
    }

    @Test func delayedReadDoesNotRenewTTLOrSurviveClockRollback() throws {
        let wall = Date(timeIntervalSince1970: 1000)
        let lease = try NativeExperienceLifetime(started: 100, received: 129, now: wall, expiresAt: wall.addingTimeInterval(60))
        #expect(lease.valid(uptime: 129, now: wall))
        #expect(!lease.valid(uptime: 130, now: wall.addingTimeInterval(-60)))
        #expect(!lease.valid(uptime: 99, now: wall))
        #expect(!lease.valid(uptime: 129, now: wall.addingTimeInterval(61)))
        #expect(throws: NativeDataError.self) {
            _ = try NativeExperienceLifetime(started: 100, received: 130, now: wall, expiresAt: wall.addingTimeInterval(60))
        }
    }

    @Test func clearedPageRejectsLateReply() async throws {
        let current = actor(), wall = Date(timeIntervalSince1970: 1000)
        let window = NativeExperienceReadWindow<String>(uptime: { 100 }, now: { wall })
        var continuation: CheckedContinuation<(String, Date), Never>?
        let work = Task { await window.load(current: { current }) {
            await withCheckedContinuation { continuation = $0 }
        } }
        while continuation == nil { await Task.yield() }
        window.clear()
        continuation?.resume(returning: ("private fixture body", wall.addingTimeInterval(30)))
        await work.value
        #expect(window.visible(current: current) == nil)
        #expect(!window.busy)
    }

    @Test func accountChangeAndFailedRefreshErasePreviousBody() async throws {
        var current: NativeCommunitySafetyActor? = actor(), clock = 100.0
        let wall = Date(timeIntervalSince1970: 1000)
        let window = NativeExperienceReadWindow<String>(uptime: { clock }, now: { wall })
        await window.load(current: { current }) { ("old private body", wall.addingTimeInterval(30)) }
        #expect(window.visible(current: current) == "old private body")
        await window.load(current: { current }) { throw NativeDataError.server(code: "NOT_FOUND") }
        #expect(window.visible(current: current) == nil)
        await window.load(current: { current }) { ("second private body", wall.addingTimeInterval(30)) }
        current = actor(2); window.tick(current: current)
        #expect(window.visible(current: current) == nil)
        await window.load(current: { current }) { ("expires", wall.addingTimeInterval(30)) }
        clock = 130; window.tick(current: current)
        clock = 100 // Rolling the clock back cannot revive a body after tick erased it.
        #expect(window.visible(current: current) == nil)
    }

    @Test func exportExpiryErasesOwnedFilesAndFailureFences() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        var clock = 100.0, blockErase = false
        let wall = Date(timeIntervalSince1970: 1000), current = actor()
        let file = NativeExperienceExportFile(root: root, remove: { path in
            if blockErase { throw NativeDataError.sessionUnavailable }
            try FileManager.default.removeItem(at: path)
        }, uptime: { clock }, now: { wall })
        try file.write(Data("owned fixture".utf8), actor: current, started: clock, expiresAt: wall.addingTimeInterval(30), current: { current })
        let path = try #require(file.visible(current: current))
        #expect(FileManager.default.fileExists(atPath: path.path))
        clock = 130; blockErase = true
        #expect(throws: NativeDataError.self) { try file.tick(current: current) }
        #expect(!file.ready)
        #expect(file.visible(current: current) == nil)
        blockErase = false; try file.clear()
        #expect(file.ready)
        #expect(!FileManager.default.fileExists(atPath: path.path))
    }

    @Test func exactJournalRecoveryRejectsOpsAndUnknownWriteNeedsReadback() async throws {
        let actor = actor(), vault = SafetyTestVault()
        let journal = NativeExperienceJournal(vault: vault, validate: { body in
            let input = try NativeExperienceInput(body: body); guard input.mutation != nil else { throw NativeDataError.invalidResponse }
        })
        let command = try NativeExperienceCommand.delete()
        let store = NativeExperienceStore(); store.restore(actor) { try journal.read(actor) }
        var writes = 0
        await store.perform(command, current: { actor }, read: { try journal.read(actor) }, retain: { try journal.retain($0, actor: actor) },
                            complete: { try journal.complete($0, actor: actor) }) { body in
            writes += 1; #expect(body == command.body); throw URLError(.networkConnectionLost)
        }
        #expect(store.pending?.body == command.body)
        #expect(!store.canRetry(current: actor))
        #expect(!store.canPerform(try .delete(), current: actor))
        await store.recover(retry: true, current: { actor }, complete: { try journal.complete($0, actor: actor) }) { _ in writes += 1; return Data() }
        #expect(writes == 1)
        func result(_ state: String) throws -> Data {
            try NativeCommunityWire.bytes(["schemaVersion": NativeExperienceWire.schema, "actorId": actor.scope.subject, "sessionId": actor.sessionID,
                                          "kind": "operation", "operationId": command.operationID, "state": state, "publication": NSNull(), "reference": NSNull()])
        }
        await store.recover(current: { actor }, complete: { try journal.complete($0, actor: actor) }) { body in
            #expect(try NativeExperienceInput(body: body).recovery?.body == command.body); return try result("absent")
        }
        #expect(store.canRetry(current: actor))
        await store.recover(retry: true, current: { actor }, complete: { try journal.complete($0, actor: actor) }) { body in
            writes += 1; #expect(body == command.body); return try result("committed")
        }
        #expect(writes == 2 && store.pending == nil)
        #expect(try journal.read(actor) == nil)
        #expect(store.visible(current: actor) == nil) // ACK cannot supply display permission.

        var padded = Data(repeating: 9, count: 10_000 - command.body.count); padded.append(command.body)
        let original = try NativeExperienceCommand(body: padded), recovery = try original.recovery()
        #expect(try NativeExperienceInput(body: recovery).recovery?.body == padded)
        _ = try journal.retain(padded, actor: actor)
        #expect(try journal.read(actor)?.body == padded)
        vault.dropRemoval = true
        let restored = try journal.read(actor), retained = try #require(restored)
        #expect(throws: (any Error).self) { try journal.complete(retained, actor: actor) }
        vault.dropRemoval = false; try NativeExperienceJournal.erase(endpoint: actor.scope.endpoint, owner: actor.scope.subject, vault: vault)
        for action in NativeExperienceInput.forbidden {
            #expect(throws: (any Error).self) { try NativeExperienceInput(body: NativeCommunityWire.bytes(["action": action])) }
        }
        let originalOps = try NativeCommunityWire.bytes(["action": "revoke", "operationId": UUID().uuidString.lowercased(), "publicationId": UUID().uuidString.lowercased(), "expectedPublicationVersion": 1])
        let ops = try NativeExperienceCommand(body: originalOps)
        #expect(throws: (any Error).self) { try NativeExperienceInput(body: ops.recovery()) }
    }

    @Test func actualSessionPublicationHeadersAndVerifiedEraseFence() async throws {
        let name = "experience-session-" + UUID().uuidString
        let defaults = try #require(UserDefaults(suiteName: name)); defer { defaults.removePersistentDomain(forName: name) }
        let vault = SafetyTestVault(), config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [ExperienceSessionProtocol.self]
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", "http://127.0.0.1:65368"], defaults: defaults, configuration: config, bundleConfiguration: [:], vault: vault)
        await session.login(email: "synthetic@example.invalid", password: "synthetic-only")
        let actor = try session.communitySafetyActor(), command = try NativeExperienceCommand.delete()
        let journal = NativeExperienceJournal(vault: vault, validate: { _ = try NativeExperienceInput(body: $0) })
        let pending = try session.rememberCommunityExperience(body: command.body, actor: actor)
        _ = try await session.communityExperienceRequest(body: NativeCommunityWire.bytes(["action": "session"]), actor: actor)
        vault.dropRemoval = true
        do { _ = try await session.communityExperienceRequest(body: command.body, actor: actor) } catch { }
        #expect(session.dataScope == nil && session.status == "storageError")
        #expect(session.failureCode == "communityExperienceJournalCleanupRequired")
        #expect(try journal.read(actor) == pending)
        vault.dropRemoval = false; await session.logout()
        #expect(session.status == "signedOut")
        #expect(try journal.read(actor) == nil)
    }

    @Test func typedCallerSavesOpaqueReferenceAndDenialCannotReviveBody() async throws {
        let actor = actor(), publicationID = UUID().uuidString.lowercased(), submissionID = UUID().uuidString.lowercased()
        let expiry = ISO8601DateFormatter().string(from: Date().addingTimeInterval(30))
        let e: [String: Any] = ["id": publicationID, "submissionId": submissionID, "submissionVersion": 2, "safetyVersion": 0, "publicationVersion": 3,
                                "title": "Owned fixture experience", "content": "Synthetic text", "contentKind": "experience", "benefitDisclosure": "self-reported fixture",
                                "authorDisclosure": "registered_user", "reviewerDisclosure": "community_reviewer", "source": "user_experience",
                                "copyright": "author_declared_own_text_independently_reviewed", "rightsPurpose": "controlled_experience_display",
                                "audience": "controlled_registered", "publiclyVisible": false, "retrievalEligible": false, "canReport": true, "canBlock": true,
                                "place": NSNull(), "expiresAt": expiry]
        func response(_ values: [String: Any]) throws -> Data {
            var v = values; v["schemaVersion"] = NativeExperienceWire.schema; v["actorId"] = actor.scope.subject; v["sessionId"] = actor.sessionID
            return try NativeCommunityWire.bytes(v)
        }
        let request: [String: Any] = ["action": "detail", "publicationId": publicationID]
        let store = NativeExperienceStore(); store.restore(actor) { nil }
        await store.load(request, current: { actor }) { _ in try response(["kind": "detail", "experience": e]) }
        guard case .detail(let experience) = store.visible(current: actor) else { Issue.record("Qualified fixture not decoded"); return }
        let command = try NativeExperienceCommand.save(experience), value = try JSONSerialization.jsonObject(with: command.body) as? [String: Any]
        #expect(value?["content"] == nil && value?["rightsDeclaration"] == nil)
        #expect(store.canPerform(command, current: actor))
        let refID = try #require(command.referenceID)
        var ref: [String: Any] = ["id": refID, "publicationId": publicationID, "submissionVersion": 2, "safetyVersion": 0, "publicationVersion": 3,
                                  "version": 1, "state": "saved", "availability": "current", "experience": e, "createdAt": expiry, "endedAt": NSNull()]
        await store.load(["action": "reference", "referenceId": refID], current: { actor }) { _ in try response(["kind": "reference", "reference": ref]) }
        #expect(store.visible(current: actor)?.experiences.count == 1)
        ref["availability"] = "unavailable"; ref["experience"] = NSNull()
        await store.load(["action": "reference", "referenceId": refID], current: { actor }) { _ in try response(["kind": "reference", "reference": ref]) }
        guard case .reference(let unavailable) = store.visible(current: actor) else { Issue.record("Unavailable reference missing"); return }
        let unavailableUnsave = try NativeExperienceCommand.unsave(unavailable)
        #expect(unavailable.experience == nil && store.canPerform(unavailableUnsave, current: actor))
        await store.load(request, current: { actor }) { _ in throw NativeDataError.server(code: "PUBLICATION_NOT_FOUND") }
        #expect(store.visible(current: actor) == nil)
        var invalid = e; invalid["publiclyVisible"] = true
        #expect(throws: (any Error).self) { try NativeExperienceOutcome.decode(response(["kind": "detail", "experience": invalid]), actor: actor) }
        invalid = e; invalid["copyright"] = "unknown"
        #expect(throws: (any Error).self) { try NativeExperienceOutcome.decode(response(["kind": "detail", "experience": invalid]), actor: actor) }
        invalid = e; invalid["canReport"] = 1
        #expect(throws: (any Error).self) { try NativeExperienceOutcome.decode(response(["kind": "detail", "experience": invalid]), actor: actor) }
        ref["experience"] = e // Unavailable rows cannot smuggle cached foreign content.
        #expect(throws: (any Error).self) { try NativeExperienceOutcome.decode(response(["kind": "reference", "reference": ref]), actor: actor) }

        let object: [String: Any] = ["id": submissionID, "submissionVersion": 2, "safetyVersion": 0, "title": "Owned fixture experience", "content": "Synthetic text",
                                     "contentKind": "experience", "benefitDisclosure": "self-reported fixture", "authorDisclosure": "registered_user", "reviewerDisclosure": "community_reviewer",
                                     "source": "user_experience", "copyright": "unknown", "visibility": "internal", "publiclyVisible": false, "retrievalEligible": false,
                                     "canReport": true, "canBlock": false, "expiresAt": expiry]
        let preview = try NativeExperiencePreview(["object": object, "previewDigest": String(repeating: "a", count: 64), "audience": "controlled_registered", "rightsDeclarationRequired": "own-text-v1", "expiresAt": expiry])
        let requestPublication = try NativeExperienceCommand.request(preview), unsave = try NativeExperienceCommand.unsave(unavailable), deletion = try NativeExperienceCommand.delete()
        let folder = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("NativeExperienceWireFixtures", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let fixtures = ["native-request.json": requestPublication.body, "native-save.json": command.body, "native-unsave.json": unsave.body,
                        "native-delete.json": deletion.body, "native-operation.json": try requestPublication.recovery(), "native-abandon.json": try requestPublication.recovery(abandon: true)]
        for (name, bytes) in fixtures { try bytes.write(to: folder.appendingPathComponent(name)); _ = try NativeExperienceInput(body: bytes) }
        print("EXPERIENCE_FIXTURE_ROOT=" + folder.path)
    }
}

nonisolated private final class ExperienceSessionProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "127.0.0.1" && request.url?.port == 65368 }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let owner = "22222222-2222-4222-8222-222222222222", session = "33333333-3333-4333-8333-333333333333"
        let path = request.url!.path
        let status: Int, value: [String: Any]
        if path.hasSuffix("/credentials") {
            let payload = try! JSONSerialization.data(withJSONObject: ["sub": owner, "session_id": session]).base64EncodedString()
                .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
            status = 200; value = ["subject": owner, "accessToken": "synthetic." + payload + ".unsigned-fixture", "refreshToken": "synthetic-only", "expiresAt": Date().timeIntervalSince1970 + 3600]
        } else if path.hasSuffix("/login") { status = 200; value = ["subject": owner, "mobileEpoch": 2] }
        else if path.hasSuffix("/profile") { status = 200; value = ["subject": owner, "displayName": "Synthetic"] }
        else if path.hasSuffix("/logout") { status = 200; value = [:] }
        else if path == "/api/community/publication/native/v1", request.httpMethod == "POST", request.value(forHTTPHeaderField: "x-community-publication-expected-actor") == owner,
                request.value(forHTTPHeaderField: "x-community-publication-expected-session") == session, request.value(forHTTPHeaderField: "Cookie") == nil,
                request.value(forHTTPHeaderField: "Authorization")?.hasPrefix("Bearer synthetic.") == true {
            if (try? JSONSerialization.jsonObject(with: requestBody()) as? [String: Any])?["action"] as? String == "session" {
                status = 200; value = ["schemaVersion": "community-publication-j3j4/1", "kind": "session", "actorId": owner, "sessionId": session]
            } else { status = 401; value = ["error": "UNAUTHENTICATED"] }
        } else { status = 400; value = ["error": "INVALID_FIXTURE_TRANSPORT"] }
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: try! JSONSerialization.data(withJSONObject: value)); client?.urlProtocolDidFinishLoading(self)
    }
    private func requestBody() -> Data {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return Data() }
        stream.open(); defer { stream.close() }
        var bytes = Data(), buffer = [UInt8](repeating: 0, count: 1024)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count <= 0 { break }; bytes.append(contentsOf: buffer.prefix(count))
        }
        return bytes
    }
    override func stopLoading() {}
}

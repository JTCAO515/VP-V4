import XCTest
import SwiftUI
@testable import VisePanda

nonisolated final class NativeAskStateTests: XCTestCase {
    func testAiAssistAcceptsResponseInsideDeadline() async throws {
        let data = try await NativeAskStore.aiAssistData(until: .now.advanced(by: .seconds(5))) {
            Data("ready".utf8)
        }
        XCTAssertEqual(data, Data("ready".utf8))
    }

    func testAiAssistRejectsExpiredDeadlineBeforeDispatch() async {
        do {
            _ = try await NativeAskStore.aiAssistData(until: .now.advanced(by: .seconds(-1))) {
                XCTFail("An expired search must not dispatch another request")
                return Data()
            }
            XCTFail("Expected the shared deadline to expire")
        } catch {
            XCTAssertEqual((error as? URLError)?.code, .timedOut)
        }
    }

    func testAiAssistCancelsRequestAtDeadlineAndRejectsLateData() async {
        do {
            _ = try await NativeAskStore.aiAssistData(until: .now.advanced(by: .milliseconds(20))) {
                // Model a transport which yields a final payload on cancellation.
                // That payload must never turn an expired search into success.
                do { try await Task.sleep(for: .seconds(30)) } catch {}
                return Data("late".utf8)
            }
            XCTFail("A late transport result must not be accepted")
        } catch {
            XCTAssertEqual((error as? URLError)?.code, .timedOut)
        }
    }

    @MainActor func testEventParserRequiresCompleteFrameAndMonotonicMatchingCursor() throws {
        let id = "30000000-0000-4000-8000-000000000001"
        let json = "{\"schemaVersion\":\"grounded-events/1\",\"turnId\":\"\(id)\",\"sequence\":1,\"eventId\":\"accepted\",\"type\":\"accepted\",\"state\":\"accepted\",\"turn\":null}"
        let wire = "id: 1\nevent: turn\ndata: \(json)\n\n"
        var parser = NativeAskEventDecoder()
        var frames: [NativeAskEventDecoder.Frame] = []
        for byte in wire.utf8 { if let frame = try parser.append(byte) { frames.append(frame) } }
        try parser.finish()
        XCTAssertEqual(frames.count, 1)
        let frame = try XCTUnwrap(frames.first)
        let event = try JSONDecoder().decode(NativeAskEvent.self, from: frame.data)
        XCTAssertEqual(try event.validate(frame: frame, expected: id, cursor: 0), 1)
        XCTAssertThrowsError(try event.validate(frame: frame, expected: id, cursor: 1))
        XCTAssertThrowsError(try event.validate(frame: frame, expected: UUID().uuidString, cursor: 0))
        for length in [1, 8, wire.utf8.count - 1] {
            var truncated = NativeAskEventDecoder()
            for byte in wire.utf8.prefix(length) { XCTAssertNil(try truncated.append(byte)) }
            XCTAssertThrowsError(try truncated.finish())
        }
    }

    @MainActor func testEventParserRejectsOversizedOrAmbiguousFrames() throws {
        for wire in ["id: 01\n", "id: 1\nid: 2\n", "event: turn\nevent: projection\n", "data: {}\ndata: {}\n", "event: invented\n"] {
            var parser = NativeAskEventDecoder()
            XCTAssertThrowsError(try wire.utf8.forEach { _ = try parser.append($0) })
        }
        var parser = NativeAskEventDecoder()
        XCTAssertThrowsError(try (0...262_144).forEach { _ in _ = try parser.append(65) })
    }

    @MainActor private func session(grounded: Bool = false) throws -> NativeSession {
        TextStateProtocol.reset()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [TextStateProtocol.self]
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "vpj07.state.\(UUID().uuidString)"))
        return NativeSession(arguments: ["-VisePandaNativeAPI", "http://127.0.0.1:59651"] + (grounded ? ["-VisePandaGroundedMode"] : []), defaults: defaults, configuration: configuration)
    }
    @MainActor func testGroundedConsentScreenDoesNotPollEverySecond() async throws {
        let session = try session(grounded: true)
        TextStateProtocol.immediatePolicy()
        await session.login(email: "text-owner-a", password: "unit-only")
        let store = NativeAskStore(mode: .grounded)
        await store.reload(using: session)
        XCTAssertEqual(store.policy?.consentState, .notAccepted)
        XCTAssertGreaterThan(store.groundedRefreshDelay, 25)
        XCTAssertLessThanOrEqual(store.groundedRefreshDelay, 30)
        XCTAssertFalse(store.busy); XCTAssertFalse(store.canSend)
        store.suspendReads()
        XCTAssertFalse(store.groundedCurrent); XCTAssertNil(store.policy)
        await session.logout()
    }

    @MainActor func testGroundedAcceptedReadRefreshesBeforeLeaseExpires() async throws {
        let session = try session(grounded: true)
        TextStateProtocol.immediatePolicy()
        TextStateProtocol.acceptGroundedPolicy()
        await session.login(email: "text-owner-a", password: "unit-only")
        let store = NativeAskStore(mode: .grounded)
        await store.reload(using: session)
        XCTAssertEqual(store.policy?.consentState, .accepted)
        XCTAssertTrue(store.groundedCurrent)
        XCTAssertGreaterThan(store.groundedRefreshDelay, 20)
        XCTAssertLessThanOrEqual(store.groundedRefreshDelay, 25)
        store.draft = "Shanghai four days, food and walks"
        store.suspendReads()
        XCTAssertFalse(store.groundedCurrent)
        XCTAssertNil(store.policy)
        XCTAssertTrue(store.turns.isEmpty)
        XCTAssertTrue(store.aiAssist.isEmpty)
        XCTAssertEqual(store.draft, "Shanghai four days, food and walks")
        await store.reload(using: session)
        XCTAssertTrue(store.groundedCurrent)
        XCTAssertEqual(store.policy?.consentState, .accepted)
        XCTAssertEqual(store.draft, "Shanghai four days, food and walks")
        store.reset(for: nil)
        XCTAssertNil(store.scope)
        XCTAssertTrue(store.draft.isEmpty)
        XCTAssertNil(store.policy)
        await session.logout()
    }

    @MainActor func testTaskChainRejectsMissingRootForkAndCrossThread() throws {
        func turn(_ id: String, parent: String?, relationship: String, thread: String = "10000000-0000-0000-0000-000000000001") throws -> NativeTextTurn {
            let data = try JSONSerialization.data(withJSONObject: ["turnId": id, "threadId": thread, "locale": "en", "input": "test", "outcome": "clarification", "output": "Which one?", "status": "completed", "createdAt": "2026-09-12", "serviceTaskId": "20000000-0000-0000-0000-000000000001", "scopeVersion": 1, "relationship": relationship, "parentTurnId": parent as Any? ?? NSNull()])
            return try JSONDecoder().decode(NativeTextTurn.self, from: data)
        }
        let root = try turn("30000000-0000-0000-0000-000000000001", parent: nil, relationship: "new_goal")
        let child = try turn("30000000-0000-0000-0000-000000000002", parent: root.id, relationship: "clarification")
        XCTAssertEqual(NativeTaskChain(containing: child, history: [child, root])?.turns.map(\.id), [root.id, child.id])
        XCTAssertNil(NativeTaskChain(containing: child, history: [child]))
        let fork = try turn("30000000-0000-0000-0000-000000000003", parent: root.id, relationship: "clarification")
        XCTAssertNil(NativeTaskChain(containing: child, history: [root, child, fork]))
        let foreign = try turn(child.id, parent: root.id, relationship: "clarification", thread: "10000000-0000-0000-0000-000000000002")
        XCTAssertNil(NativeTaskChain(containing: foreign, history: [root, foreign]))
        let repair = try turn(child.id, parent: root.id, relationship: "repair")
        XCTAssertNil(NativeTaskChain(containing: repair, history: [root, repair]))
        let link = NativeServiceTaskLink(id: root.serviceTaskId!, scopeVersion: 1, relationship: "new_goal", parentTurnId: nil)
        let encoded = try JSONSerialization.jsonObject(with: JSONEncoder().encode(link)) as? [String: Any]
        XCTAssertTrue(encoded?["parentTurnId"] is NSNull)
    }

    @MainActor func testAcceptedTurnSurvivesFailedHistoryRefresh() async throws {
        ObsoleteTaskProtocol.reset(acknowledge: true)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ObsoleteTaskProtocol.self]
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", "http://127.0.0.1:59651", "-VisePandaTaskContext"], defaults: try XCTUnwrap(UserDefaults(suiteName: "vpj07.ack.\(UUID().uuidString)")), configuration: configuration)
        await session.login(email: "fixture", password: "fixture")
        let store = NativeAskStore(mode: .taskContext)
        await store.reload(using: session)
        store.draft = "Acknowledged synthetic request"
        await store.send(locale: "en", using: session)
        XCTAssertNotNil(store.pending)
        XCTAssertEqual(try session.retainedPendingAsk()?.acknowledged, true)
        XCTAssertNil(store.policy)
        guard case .awaiting(let id) = store.intent else { XCTFail("Lost acknowledged task after refresh failure"); return }
        XCTAssertFalse(store.canStartNew)
        XCTAssertFalse(store.canSend)
        await store.reload(using: session)
        let restored = try XCTUnwrap(store.turns.first)
        XCTAssertEqual(restored.id, id)
        XCTAssertNil(store.pending)
        XCTAssertNil(try session.retainedPendingAsk())
        XCTAssertEqual(store.intent, .continuation(restored))
        await session.logout()
    }

    @MainActor func testLostReceiptPolicyChangeRequiresStoppingOldSharingBeforeNewQuestion() async throws {
        ObsoleteTaskProtocol.reset()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ObsoleteTaskProtocol.self]
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", "http://127.0.0.1:59651", "-VisePandaTaskContext"], defaults: try XCTUnwrap(UserDefaults(suiteName: "vpj07.obsolete.\(UUID().uuidString)")), configuration: configuration)
        await session.login(email: "fixture", password: "fixture")
        let store = NativeAskStore(mode: .taskContext)
        await store.reload(using: session)
        store.draft = "Uncertain synthetic request"
        await store.send(locale: "en", using: session)
        let original = try XCTUnwrap(store.pending)
        XCTAssertNil(store.policy)
        await store.reload(using: session)
        XCTAssertTrue(store.canSend)
        ObsoleteTaskProtocol.changePolicy()
        await store.reload(using: session)
        XCTAssertTrue(store.hasObsoletePending)
        XCTAssertFalse(store.canSend); XCTAssertFalse(store.canStartNew)
        XCTAssertEqual(store.pending?.turnId, original.turnId)
        // Another reload must not silently rebind the original text to the new notice.
        await store.reload(using: session)
        XCTAssertFalse(store.canSend)
        await store.withdraw(using: session)
        XCTAssertNotEqual(ObsoleteTaskProtocol.withdrawnPolicy, original.policyId)
        XCTAssertEqual(store.pending?.turnId, original.turnId)
        XCTAssertTrue(store.hasObsoletePending)
        await store.stopPreviousRequest(using: session)
        XCTAssertEqual(ObsoleteTaskProtocol.withdrawnPolicy, original.policyId)
        XCTAssertNil(store.pending)
        XCTAssertFalse(store.canSend) // Current policy was also deliberately withdrawn.
        XCTAssertTrue(store.draft.isEmpty)
        await session.logout()
    }

    @MainActor func testTemporaryAuthLossKeepsHiddenDraftAndLogoutClearsIt() async throws {
        let session = try session()
        await session.login(email: "text-owner-a", password: "unit-only")
        let identity = try XCTUnwrap(session.dataScope)
        let store = NativeAskStore(); store.reset(for: identity); store.draft = "Unsent private draft"
        TextStateProtocol.failRefresh(true)
        await session.validate()
        XCTAssertNil(session.dataScope); XCTAssertEqual(session.retainedDataScope, identity)
        await store.reload(using: session)
        XCTAssertEqual(store.draft, "Unsent private draft"); XCTAssertNil(store.policy); XCTAssertTrue(store.turns.isEmpty)
        TextStateProtocol.failRefresh(false)
        await session.validate()
        XCTAssertEqual(session.dataScope, identity)
        XCTAssertEqual(store.draft, "Unsent private draft")
        await session.logout(); await store.reload(using: session)
        XCTAssertTrue(store.draft.isEmpty); XCTAssertNil(store.scope)
    }
    @MainActor func testViewObservesPermanentClearAfterActiveScopeIsAlreadyNil() async throws {
        let session = try session()
        TextStateProtocol.immediatePolicy()
        await session.login(email: "text-owner-a", password: "unit-only")
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let oldWindow = scene.windows.first(where: \.isKeyWindow)
        let window = UIWindow(windowScene: scene)
        let store = NativeAskStore()
        window.rootViewController = UIHostingController(rootView: NativeAskView(store: store).environment(AppSettings(selectedLocale: .en, nativeSession: session)))
        window.makeKeyAndVisible()
        defer { window.isHidden = true; window.rootViewController = nil; oldWindow?.makeKeyAndVisible() }
        for _ in 0..<200 where store.policy == nil { try await Task.sleep(for: .milliseconds(10)) }
        XCTAssertNotNil(store.policy)
        store.draft = "Private draft before temporary failure"
        TextStateProtocol.failRefresh(true)
        await session.validate()
        for _ in 0..<200 where store.policy != nil { try await Task.sleep(for: .milliseconds(10)) }
        XCTAssertNil(session.dataScope); XCTAssertNotNil(session.retainedDataScope)
        XCTAssertEqual(store.draft, "Private draft before temporary failure")
        await session.logout()
        for _ in 0..<200 where store.scope != nil { try await Task.sleep(for: .milliseconds(10)) }
        // No manual reset/reload: production View observation must handle nil -> nil active scope.
        XCTAssertNil(store.scope); XCTAssertNil(store.pending); XCTAssertTrue(store.draft.isEmpty)
    }
    @MainActor func testLatePolicyCannotEnterAnotherAccount() async throws {
        let session = try session()
        await session.login(email: "text-owner-a", password: "unit-only")
        let original = try XCTUnwrap(session.dataScope)
        let store = NativeAskStore()
        let load = Task { await store.reload(using: session) }
        for _ in 0..<200 where !TextStateProtocol.hasPending { try await Task.sleep(for: .milliseconds(10)) }
        guard TextStateProtocol.hasPending else { load.cancel(); XCTFail("Policy did not reach controlled transport"); return }
        await session.login(email: "text-owner-b", password: "unit-only")
        XCTAssertNotEqual(session.dataScope, original)
        TextStateProtocol.finishPolicy()
        await load.value
        XCTAssertNil(store.policy); XCTAssertTrue(store.turns.isEmpty)
        XCTAssertEqual(store.scope, session.retainedDataScope)
        await session.logout()
    }
}

nonisolated final class AssistantResultIdentityTests: XCTestCase {
    @MainActor func testResultReadWindowExpiresAndClearsAcrossNavigationAndAccountChanges() {
        let scope = NativeDataScope(endpoint: "http://127.0.0.1:59651", subject: UUID().uuidString, mobileEpoch: 1, generation: 1)
        var fence = AssistantResultReadFence()
        let first = fence.begin(scope: scope, now: 100)
        XCTAssertTrue(fence.isCurrent(scope: scope, generation: first, active: true, now: 129))
        XCTAssertFalse(fence.isCurrent(scope: scope, generation: first, active: true, now: 130), "30 seconds includes request time")
        XCTAssertFalse(fence.isCurrent(scope: scope, generation: first, active: false, now: 110), "a hidden/background VP cannot render this read")
        fence.clear()
        XCTAssertFalse(fence.owns(scope: scope, generation: first), "Memory navigation, withdrawal or backgrounding invalidates a late result")
        let returned = fence.begin(scope: scope, now: 140)
        XCTAssertFalse(fence.isCurrent(scope: scope, generation: first, active: true, now: 141))
        XCTAssertTrue(fence.isCurrent(scope: scope, generation: returned, active: true, now: 141))
        let replacement = NativeDataScope(endpoint: scope.endpoint, subject: scope.subject, mobileEpoch: 2, generation: 2)
        XCTAssertFalse(fence.isCurrent(scope: replacement, generation: returned, active: true, now: 141))
        XCTAssertFalse(fence.isCurrent(scope: nil, active: true, now: 141))
    }

    @MainActor func testRestartReopensEarlierTaskThroughExactReferenceAndFencesLateData() async throws {
        let task = UUID().uuidString.lowercased(), artifact = UUID().uuidString.lowercased(), other = UUID().uuidString.lowercased()
        func reference(_ kind: String = "result_reference") throws -> Data {
            let value: [String: Any] = kind == "result_reference"
                ? ["kind": kind, "taskId": task, "artifactId": artifact, "revision": 2] : ["kind": kind]
            return try JSONSerialization.data(withJSONObject: ["version": 1, "data": value])
        }
        func body(_ source: String, current: Bool = true) throws -> Data {
            try JSONSerialization.data(withJSONObject: ["version": 1, "data": ["kind": "result_artifact", "artifactId": artifact,
                "revision": 2, "current": current, "lifecycle": "active", "source": ["taskId": source],
                "content": ["schemaVersion": "comparison/1", "title": "Synthetic", "summary": "Two options",
                    "options": [["id": "a", "title": "A", "tradeoff": "Unknown"], ["id": "b", "title": "B", "tradeoff": "Unknown"]]]]])
        }
        let expected = try body(task)
        let opened = try await AssistantTaskResultReader.open(taskID: task, isCurrent: { true }, resolve: { try reference() }, exact: { id, revision in
            XCTAssertEqual(id, artifact); XCTAssertEqual(revision, 2); return expected
        })
        XCTAssertEqual(opened, expected) // No selectedArtifactID or global-latest request exists.
        for kind in ["empty", "unavailable"] {
            do {
                _ = try await AssistantTaskResultReader.open(taskID: task, isCurrent: { true }, resolve: { try reference(kind) }, exact: { _, _ in
                    XCTFail("Missing reference must never fall back"); return expected
                })
                XCTFail("Missing reference must fail")
            } catch {}
        }
        for invalid in [try body(other), try body(task, current: false)] {
            do {
                _ = try await AssistantTaskResultReader.open(taskID: task, isCurrent: { true }, resolve: { try reference() }, exact: { _, _ in invalid })
                XCTFail("Wrong Task or stale body must fail")
            } catch {}
        }
        var currentGeneration = true
        do {
            _ = try await AssistantTaskResultReader.open(taskID: task, isCurrent: { currentGeneration }, resolve: { try reference() }, exact: { _, _ in
                currentGeneration = false; return expected
            })
            XCTFail("A late response cannot enter a changed session/generation")
        } catch NativeDataError.staleSessionResponse { }
        catch { XCTFail("Expected a stale session response, got \(error)") }
    }
    @MainActor func testOnlyCurrentResultFromSelectedTaskCanOpen() throws {
        let task = UUID().uuidString.lowercased()
        let other = UUID().uuidString.lowercased()
        let artifact = UUID().uuidString.lowercased()
        func result(taskID: String, current: Bool, lifecycle: String) throws -> AssistantResult {
            let wire: [String: Any] = ["version": 1, "data": [
                "kind": "result_artifact", "artifactId": artifact, "revision": 1,
                "current": current, "lifecycle": lifecycle,
                "source": ["taskId": taskID],
                "content": ["schemaVersion": "comparison/1", "title": "Stay areas", "summary": "Two options",
                            "options": [["id": "a", "title": "Area A", "tradeoff": "Close to rail"],
                                        ["id": "b", "title": "Area B", "tradeoff": "Quieter"]]]
            ]]
            return try JSONDecoder().decode(AssistantResultEnvelope.self,
                from: JSONSerialization.data(withJSONObject: wire)).data
        }
        XCTAssertTrue(try result(taskID: task, current: true, lifecycle: "active").belongs(to: task))
        XCTAssertFalse(try result(taskID: other, current: true, lifecycle: "active").belongs(to: task))
        XCTAssertFalse(try result(taskID: task, current: false, lifecycle: "active").belongs(to: task))
        XCTAssertFalse(try result(taskID: task, current: true, lifecycle: "withdrawn").belongs(to: task))
    }
}

nonisolated final class AssistantTaskProjectionTests: XCTestCase {
    @MainActor func testOnlyCurrentConversationTasksDriveCardsAndPolling() throws {
        let taskA = UUID().uuidString.lowercased()
        let taskB = UUID().uuidString.lowercased()
        let unrelated = UUID().uuidString.lowercased()
        let activeTurn = UUID().uuidString.lowercased()
        func message(_ sequence: Int, taskID: String?) throws -> AssistantMessage {
            let value: [String: Any] = ["messageId": UUID().uuidString.lowercased(), "sequence": sequence,
                "locale": "en", "text": "Compare", "relationship": "follow_up", "taskId": taskID as Any,
                "status": "recorded"]
            return try JSONDecoder().decode(AssistantMessage.self, from: JSONSerialization.data(withJSONObject: value))
        }
        func turn(_ id: String, taskID: String, status: String, validCompletion: Bool = true) throws -> NativeTextTurn {
            var value: [String: Any] = ["turnId": id, "threadId": UUID().uuidString.lowercased(),
                "locale": "en", "input": "Compare", "status": status, "createdAt": "2026-09-30",
                "serviceTaskId": taskID, "scopeVersion": 1, "relationship": "new_goal"]
            if status == "completed" && validCompletion {
                value["outcome"] = "answered"; value["output"] = "Comparison ready"
            }
            return try JSONDecoder().decode(NativeTextTurn.self, from: JSONSerialization.data(withJSONObject: value))
        }
        let messages = try [message(1, taskID: taskA), message(2, taskID: taskB), message(3, taskID: taskA)]
        let history = try [turn(UUID().uuidString.lowercased(), taskID: unrelated, status: "accepted"),
                           turn(activeTurn, taskID: taskA, status: "accepted"),
                           turn(UUID().uuidString.lowercased(), taskID: taskB, status: "completed", validCompletion: false),
                           turn(UUID().uuidString.lowercased(), taskID: taskB, status: "completed")]
        XCTAssertEqual(AssistantTaskProjection.latestMessages(messages).map(\.sequence), [2, 3])
        XCTAssertEqual(AssistantTaskProjection.waitingTurnIDs(messages: messages, history: history), [activeTurn])
        let eligible = AssistantTaskProjection.eligibleHistory(history, messages: messages)
        XCTAssertEqual(eligible.count, 1)
        XCTAssertNil(AssistantTaskProjection.turn(for: messages[1], in: eligible), "invalid latest row cannot reveal an older completion")
        let validLatest = AssistantTaskProjection.eligibleHistory([history[0], history[1], history[3]], messages: messages)
        XCTAssertEqual(AssistantTaskProjection.turn(for: messages[1], in: validLatest)?.status, "completed")
    }
}

/// Only test callback state is shared, under one lock; no production credential.
nonisolated private final class TextStateProtocol: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var pending: TextStateProtocol?
    nonisolated(unsafe) private static var refreshFails = false
    nonisolated(unsafe) private static var holdPolicy = true
    nonisolated(unsafe) private static var groundedAccepted = false
    static var hasPending: Bool { lock.withLock { pending != nil } }
    static func failRefresh(_ value: Bool) { lock.withLock { refreshFails = value } }
    static func reset() { lock.withLock { pending = nil; refreshFails = false; holdPolicy = true; groundedAccepted = false } }
    static func acceptGroundedPolicy() { lock.withLock { groundedAccepted = true } }
    static func immediatePolicy() { lock.withLock { holdPolicy = false } }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}
    override func startLoading() {
        let path = request.url?.path ?? ""
        let owner = request.value(forHTTPHeaderField: "Authorization")?.contains("text-owner-b") == true ? "text-owner-b" : "text-owner-a"
        if path.hasSuffix("/policy") {
            if Self.lock.withLock({ Self.holdPolicy }) { Self.lock.withLock { Self.pending = self } }
            else {
                var response = Self.policyReply()
                if path.contains("/v4/") {
                    response["version"] = 4
                    var policy = response["policy"] as! [String: Any]
                    policy["consentState"] = Self.lock.withLock({ Self.groundedAccepted }) ? "accepted" : "not_accepted"; response["policy"] = policy
                }
                reply(response)
            }
            return
        }
        if path.hasSuffix("/turns") { reply(["version": path.contains("/v4/") ? 4 : 1, "kind": path.contains("/v4/") ? "grounded_history" : "history", "turns": []]); return }
        if path.hasSuffix("/refresh") && Self.lock.withLock({ Self.refreshFails }) { client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet)); return }
        if path.hasSuffix("/credentials") || path.hasSuffix("/refresh") {
            let subject = Self.hasPending ? "text-owner-b" : owner
            reply(["subject": subject, "accessToken": subject, "refreshToken": subject, "expiresAt": Date().timeIntervalSince1970 + 3600, "mobileEpoch": 1])
        } else if path.hasSuffix("/profile") { reply(["subject": owner, "displayName": owner]) }
        else { reply(["subject": owner, "mobileEpoch": 1]) }
    }
    static func finishPolicy() {
        let held = lock.withLock { let old = pending; pending = nil; return old }
        held?.reply(policyReply())
    }
    private static func policyReply() -> [String: Any] {
        ["version": 1, "kind": "policy", "policy": ["id": "11111111-1111-4111-8111-111111111111", "provider": "qwen", "recipient": "old owner fixture", "sourceRegion": "fixture", "processingRegion": "fixture", "storageRegion": "fixture", "termsVersion": "fixture", "noticeVersion": "fixture", "noticeHash": String(repeating: "a", count: 64), "noticeZh": "旧账号内容", "noticeEn": "Old owner content", "retention": "retain_after_hide_v1", "expiresAt": "2099-01-01", "consentState": "accepted"]]
    }
    private func reply(_ value: [String: Any]) {
        guard let url = request.url, let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"]), let data = try? JSONSerialization.data(withJSONObject: value) else { return }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data); client?.urlProtocolDidFinishLoading(self)
    }
}

/// Controlled transport: the original POST loses its receipt; no actual provider call.
nonisolated private final class ObsoleteTaskProtocol: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var changed = false
    nonisolated(unsafe) private static var withdrawn: String?
    nonisolated(unsafe) private static var withdrawnIDs: Set<String> = []
    nonisolated(unsafe) private static var acknowledge = false
    nonisolated(unsafe) private static var failNextHistory = false
    nonisolated(unsafe) private static var stored: [String: Any]?
    static var withdrawnPolicy: String? { lock.withLock { withdrawn } }
    static func reset(acknowledge: Bool = false) { lock.withLock { changed = false; withdrawn = nil; withdrawnIDs = []; Self.acknowledge = acknowledge; failNextHistory = false; stored = nil } }
    static func changePolicy() { lock.withLock { changed = true } }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}
    override func startLoading() {
        let path = request.url?.path ?? ""
        let newPolicy = Self.lock.withLock { Self.changed }
        let activeID = newPolicy ? "22222222-2222-4222-8222-222222222222" : "11111111-1111-4111-8111-111111111111"
        let state = Self.lock.withLock { Self.withdrawnIDs.contains(activeID) ? "withdrawn" : "accepted" }
        if path.hasSuffix("/turns") && request.httpMethod == "POST" {
            if Self.lock.withLock({ Self.acknowledge }), let body = requestBody(),
               let input = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any],
               let task = input["serviceTask"] as? [String: Any] {
                Self.lock.withLock { Self.stored = input; Self.failNextHistory = true }
                reply(["version": 3, "kind": "accepted", "reused": false, "turnId": input["turnId"]!, "serviceTaskId": task["id"]!, "scopeVersion": task["scopeVersion"]!, "relationship": task["relationship"]!, "parentTurnId": task["parentTurnId"]!])
            } else { client?.urlProtocol(self, didFailWithError: URLError(.networkConnectionLost)) }
            return
        }
        if path.hasSuffix("/turns"), Self.lock.withLock({ let fail = Self.failNextHistory; Self.failNextHistory = false; return fail }) {
            client?.urlProtocol(self, didFailWithError: URLError(.networkConnectionLost)); return
        }
        var result: [String: Any]
        if path.hasSuffix("/policy") {
            result = ["version": 3, "kind": "policy", "policy": ["id": newPolicy ? "22222222-2222-4222-8222-222222222222" : "11111111-1111-4111-8111-111111111111", "provider": "qwen", "recipient": "fixture", "sourceRegion": "fixture", "processingRegion": "fixture", "storageRegion": "fixture", "termsVersion": "fixture", "noticeVersion": newPolicy ? "new" : "old", "noticeHash": String(repeating: newPolicy ? "b" : "a", count: 64), "noticeZh": "合成同意条款", "noticeEn": "Synthetic terms", "retention": "retain_after_hide_v1", "expiresAt": "2099-01-01", "consentState": state]]
        } else if path.hasSuffix("/turns") {
            var turns: [[String: Any]] = []
            if let input = Self.lock.withLock({ Self.stored }), let task = input["serviceTask"] as? [String: Any] {
                turns = [["turnId": input["turnId"]!, "threadId": input["threadId"]!, "locale": input["locale"]!, "input": input["text"]!, "outcome": "clarification", "output": "Which direction?", "status": "completed", "createdAt": "2026-09-12", "serviceTaskId": task["id"]!, "scopeVersion": task["scopeVersion"]!, "relationship": task["relationship"]!, "parentTurnId": task["parentTurnId"]!]]
            }
            result = ["version": 3, "kind": "history", "turns": turns]
        }
        else if path.hasSuffix("/consent") && request.httpMethod == "DELETE" {
            let parsed = requestBody().flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: String] }
            Self.lock.withLock { Self.withdrawn = parsed?["policyId"]; if let id = parsed?["policyId"] { Self.withdrawnIDs.insert(id) } }
            result = ["version": 3, "kind": "withdrawn"]
        } else if path.hasSuffix("/credentials") || path.hasSuffix("/refresh") {
            result = ["subject": "task-fixture-owner", "accessToken": "task-fixture-owner", "refreshToken": "fixture", "expiresAt": Date().timeIntervalSince1970 + 3600, "mobileEpoch": 1]
        } else if path.hasSuffix("/profile") { result = ["subject": "task-fixture-owner", "displayName": "fixture"] }
        else { result = ["subject": "task-fixture-owner", "mobileEpoch": 1] }
        reply(result)
    }
    private func requestBody() -> Data? {
        if let data = request.httpBody { return data }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open(); defer { stream.close() }
        var data = Data(); var buffer = [UInt8](repeating: 0, count: 1024)
        while stream.hasBytesAvailable { let n = stream.read(&buffer, maxLength: buffer.count); if n <= 0 { break }; data.append(buffer, count: n) }
        return data
    }
    private func reply(_ result: [String: Any]) {
        guard let url = request.url, let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"]), let data = try? JSONSerialization.data(withJSONObject: result) else { return }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data); client?.urlProtocolDidFinishLoading(self)
    }
}

nonisolated final class AssistantConversationSelectionTests: XCTestCase {
    @MainActor func testReaderRejectsWrongConversationAndActualLateCompletion() async throws {
        let first = UUID().uuidString, second = UUID().uuidString
        func body(_ id: String) throws -> Data {
            try JSONSerialization.data(withJSONObject: ["version": 5, "kind": "conversation", "conversationId": id,
                "nextSequence": 1, "messages": [], "goals": []])
        }
        let bytes = try body(first)
        var selection = AssistantConversationSelection()
        selection.select(first)
        let token = selection.generation
        let read = try await AssistantConversationReader.read(requestedID: first, isCurrent: { selection.owns(token) }, load: { bytes })
        XCTAssertEqual(read.conversationId, first)
        do {
            _ = try await AssistantConversationReader.read(requestedID: second, isCurrent: { true }, load: { bytes })
            XCTFail("Wrong conversation cannot enter selected state")
        } catch NativeDataError.invalidResponse {} catch { XCTFail("Unexpected error: \(error)") }
        do {
            _ = try await AssistantConversationReader.read(requestedID: first, isCurrent: { selection.owns(token) }, load: {
                selection.select(second)
                await Task.yield()
                return bytes
            })
            XCTFail("Response arriving after a switch cannot enter selected state")
        } catch NativeDataError.staleSessionResponse {} catch { XCTFail("Unexpected error: \(error)") }
    }

    @MainActor func testSwitchAndReturnToLatestRejectLateReadsEvenForSameConversation() {
        var selection = AssistantConversationSelection()
        let first = UUID().uuidString, second = UUID().uuidString
        selection.select(first)
        let old = selection.generation
        selection.select(second)
        XCTAssertEqual(selection.conversationID, second)
        XCTAssertFalse(selection.owns(old))
        let secondRead = selection.generation
        selection.select(selection.conversationID)
        XCTAssertEqual(selection.conversationID, second, "same retained scope reconnect pins immutable intake to its original ID")
        XCTAssertFalse(selection.owns(secondRead))
        selection.select(first)
        XCTAssertFalse(selection.owns(old), "returning to the same ID cannot revive an old response")
        XCTAssertFalse(selection.owns(secondRead))
        selection.select(nil)
        XCTAssertNil(selection.conversationID)
        XCTAssertTrue(selection.owns(selection.generation))
    }
}

nonisolated final class AssistantConversationRefreshTests: XCTestCase {
    @MainActor func testMutationSupersedesActualLateReadWithoutFinishingNewReadback() async throws {
        let id = UUID().uuidString
        let bytes = try JSONSerialization.data(withJSONObject: ["version": 5, "kind": "conversation", "conversationId": id,
            "nextSequence": 1, "messages": [], "goals": []])
        var refresh = AssistantConversationRefreshState()
        let old = refresh.begin()
        var newer: UUID?
        do {
            _ = try await AssistantConversationReader.read(requestedID: id, isCurrent: { refresh.owns(old) }, load: {
                refresh.invalidate()
                newer = refresh.begin()
                await Task.yield()
                return bytes
            })
            XCTFail("A refresh started before a send cannot publish afterwards")
        } catch NativeDataError.staleSessionResponse {} catch { XCTFail("Unexpected error: \(error)") }
        refresh.finish(old)
        XCTAssertTrue(refresh.busy, "Old completion cannot unlock a newer authoritative readback")
        XCTAssertTrue(refresh.owns(try XCTUnwrap(newer)))
        refresh.finish(try XCTUnwrap(newer))
        XCTAssertFalse(refresh.busy)
    }
}

nonisolated final class AssistantConversationTaskPageTests: XCTestCase {
    @MainActor func testMembershipBeyondTranscriptAndLatestStateDriveProjection() throws {
        let task = UUID().uuidString, turn = UUID().uuidString, message = UUID().uuidString, goal = UUID().uuidString
        func page(status: String, outcome: String? = nil, taskID: String? = nil, goalVersion: Int = 1, currentGoalVersion: Int = 1) throws -> AssistantConversationTaskPage {
            let member: [String: Any] = ["messageId": message, "sequence": 2, "locale": "en", "text": "Earlier task reference",
                "relationship": "follow_up", "goalId": goal, "scopeVersion": 1, "taskId": task, "parentMessageId": NSNull(),
                "turnId": NSNull(), "status": "recorded", "outcome": NSNull(), "output": NSNull()]
            let state: [String: Any] = ["turnId": turn, "serviceTaskId": taskID ?? task, "scopeVersion": 1,
                "relationship": "new_goal", "parentTurnId": NSNull(), "status": status, "outcome": outcome.map { $0 as Any } ?? NSNull(),
                "goalScopeVersion": goalVersion, "currentGoalScopeVersion": currentGoalVersion]
            return try JSONDecoder().decode(AssistantConversationTaskPage.self, from: JSONSerialization.data(withJSONObject:
                ["version": 5, "kind": "conversation_tasks", "conversationId": UUID().uuidString,
                 "conversationSequence": 90, "limit": 20, "messages": [member], "turns": [state], "nextCursor": NSNull()]))
        }
        let completed = try page(status: "completed", outcome: "answered")
        XCTAssertTrue(completed.valid)
        XCTAssertEqual(AssistantTaskProjection.turn(for: completed.messages[0], in: completed.turns)?.status, "completed")
        for status in ["failed", "cancelled"] {
            let latest = try page(status: status)
            XCTAssertTrue(latest.valid)
            XCTAssertEqual(AssistantTaskProjection.turn(for: latest.messages[0], in: latest.turns)?.status, status)
            XCTAssertTrue(AssistantTaskProjection.waitingTurnIDs(messages: latest.messages, history: latest.turns).isEmpty)
        }
        let terminal = try page(status: "completed", outcome: "answered", currentGoalVersion: 10001)
        XCTAssertTrue(terminal.valid); XCTAssertFalse(terminal.turns[0].goalScopeCurrent)
        XCTAssertFalse(try page(status: "failed", outcome: "answered").valid)
        XCTAssertFalse(try page(status: "completed", outcome: "answered", taskID: UUID().uuidString).valid)
        XCTAssertFalse(try page(status: "completed", outcome: "answered", goalVersion: 2).valid, "Member and status goal basis must agree")
    }

    @MainActor func testLatePageCannotPublishAcrossSelectionAndMutationGeneration() async throws {
        var selection = AssistantConversationSelection()
        selection.select(UUID().uuidString)
        var refresh = AssistantConversationRefreshState()
        let selectionToken = selection.generation, readToken = refresh.begin()
        let reply = Task { @MainActor in
            await Task.yield()
            return selection.owns(selectionToken) && refresh.owns(readToken)
        }
        selection.select(UUID().uuidString); refresh.invalidate()
        let belongs = await reply.value
        XCTAssertFalse(belongs)
    }
}

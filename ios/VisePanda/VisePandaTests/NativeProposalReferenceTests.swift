import XCTest
import SwiftUI
@testable import VisePanda

nonisolated final class NativeProposalReferenceTests: XCTestCase {
    /// Dedicated disposable Auth/HTTP/SQL acceptance; never supplies a production entry source.
    @MainActor func testOwnedLocalAuthExactCard() async throws {
        let env = ProcessInfo.processInfo.environment
        guard env["VP_PROPOSAL_NATIVE_TEST"] == "1" else { throw XCTSkip("Dedicated disposable runner required") }
        let endpoint = try XCTUnwrap(env["VP_PROPOSAL_API"])
        guard let url = URL(string: endpoint), url.scheme == "http", url.host == "127.0.0.1" else { throw NativeDataError.invalidResponse }
        let artifact = try XCTUnwrap(env["VP_PROPOSAL_ARTIFACT"])
        let proposal = try XCTUnwrap(env["VP_PROPOSAL_ID"])
        let suite = "ProposalReference." + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", endpoint], defaults: defaults, bundleConfiguration: [:])
        await session.login(email: try XCTUnwrap(env["VP_PROPOSAL_EMAIL"]), password: try XCTUnwrap(env["VP_PROPOSAL_PASSWORD"]))
        let scope = try XCTUnwrap(session.dataScope)
        let store = NativeProposalReferenceStore()
        await store.load(artifactID: artifact, revision: 1, scope: scope, active: true, currentScope: { session.dataScope }) {
            try await session.proposalReferenceRequest(artifactID: $0, revision: $1)
        }
        XCTAssertEqual(store.visible(scope: session.dataScope)?.proposalID, proposal.lowercased())
        XCTAssertEqual(store.visible(scope: session.dataScope)?.tripID, env["VP_PROPOSAL_TRIP"])
        let host = UIHostingController(rootView: NativeProposalReferenceView(store: store, scope: scope, isActive: true, chinese: true).environment(\.scenePhase, .active))
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 568))
        window.rootViewController = host; window.makeKeyAndVisible()
        defer { window.isHidden = true }
        host.view.frame = window.bounds; host.view.layoutIfNeeded()
        try await Task.sleep(for: .milliseconds(150))
        let image = UIGraphicsImageRenderer(bounds: host.view.bounds).image { _ in host.view.drawHierarchy(in: host.view.bounds, afterScreenUpdates: true) }
        let attachment = XCTAttachment(image: image); attachment.name = "Owned-local-Auth-exact-proposal-reference"; attachment.lifetime = .keepAlways; add(attachment)
        await session.logout()
        XCTAssertNil(store.visible(scope: session.dataScope))
        store.clear()
        await session.login(email: try XCTUnwrap(env["VP_PROPOSAL_OTHER_EMAIL"]), password: try XCTUnwrap(env["VP_PROPOSAL_OTHER_PASSWORD"]))
        let other = try XCTUnwrap(session.dataScope)
        await store.load(artifactID: artifact, revision: 1, scope: other, active: true, currentScope: { session.dataScope }) {
            try await session.proposalReferenceRequest(artifactID: $0, revision: $1)
        }
        XCTAssertNil(store.visible(scope: session.dataScope)); XCTAssertEqual(store.state, .unavailable)
        await session.logout()
    }
    private let id = "11111111-1111-4111-8111-111111111111"
    @MainActor private var owner: NativeDataScope { .init(endpoint: "http://127.0.0.1", subject: "synthetic-owner", mobileEpoch: 1, generation: 1) }
    private func payload() -> [String: Any] {
        ["kind": "result_artifact", "artifactId": id, "revision": 1, "currentRevision": 1, "current": true,
         "historicalReadable": true, "lifecycle": "active", "createdAt": "2026-10-02T00:00:00Z",
         "source": ["taskId": id, "taskTurnId": id, "goalId": id, "goalVersion": 1, "inputMessageId": id, "inputSequence": 1, "tripId": id, "tripVersion": 0],
         "basis": ["memories": [], "evidence": []],
         "content": ["schemaVersion": "change-proposal-reference/1", "proposalId": id, "proposalRevision": 2, "actions": []]]
    }
    private func bytes(_ data: [String: Any]) throws -> Data { try JSONSerialization.data(withJSONObject: ["version": 1, "data": data]) }

    @MainActor func testTripDiscoveryExactUsesSharedDeadlineAndSource() async throws {
        var now: TimeInterval = 100
        let store = NativeProposalReferenceStore(uptime: { now })
        let discovery = try bytes(["kind": "result_reference", "tripId": id, "artifactId": id, "revision": 1])
        let exact = try bytes(payload())
        await store.loadTrip(tripID: id, scope: owner, active: true, currentScope: { self.owner }, selectedTrip: { self.id }, discover: { _ in now = 110; return discovery }, read: { _, _ in now = 119; return exact })
        XCTAssertNotNil(store.visible(scope: owner)); now = 120; XCTAssertNil(store.visible(scope: owner))
        var mismatch = payload(), source = try XCTUnwrap(mismatch["source"] as? [String: Any])
        source["tripId"] = UUID().uuidString; mismatch["source"] = source
        let wrongTrip = try bytes(mismatch)
        await store.loadTrip(tripID: id, scope: owner, active: true, currentScope: { self.owner }, selectedTrip: { self.id }, discover: { _ in discovery }, read: { _, _ in wrongTrip })
        XCTAssertNil(store.visible(scope: owner)); XCTAssertEqual(store.state, .unavailable)
    }
    @MainActor func testTripDiscoveryCannotOpenAfterSelectionOrAuthorityChanges() async throws {
        let discovery = try bytes(["kind": "result_reference", "tripId": id, "artifactId": id, "revision": 1])
        let store = NativeProposalReferenceStore()
        var selected: String? = id, live: NativeDataScope? = owner, calls = 0
        await store.loadTrip(tripID: id, scope: owner, active: true, currentScope: { live }, selectedTrip: { selected }, discover: { _ in selected = nil; return discovery }, read: { _, _ in calls += 1; return Data() })
        XCTAssertEqual(calls, 0); XCTAssertNil(store.visible(scope: owner))
        selected = id
        await store.loadTrip(tripID: id, scope: owner, active: true, currentScope: { live }, selectedTrip: { selected }, discover: { _ in live = nil; return discovery }, read: { _, _ in calls += 1; return Data() })
        XCTAssertEqual(calls, 0); XCTAssertNil(store.visible(scope: owner))
    }
    @MainActor func testFrozenTripDiscoveryIsClosedAndBindsSelectedTrip() throws {
        let reference: [String: Any] = ["kind": "result_reference", "tripId": id, "artifactId": id, "revision": 1]
        let value = try XCTUnwrap(NativeTripProposalReference.decode(bytes(reference), expectedTripID: id))
        XCTAssertEqual(value.artifactID, id); XCTAssertEqual(value.revision, 1)
        XCTAssertThrowsError(try NativeTripProposalReference.decode(bytes(reference), expectedTripID: UUID().uuidString))
        for field in ["content", "proposalId", "actions", "current", "url"] {
            var extra = reference; extra[field] = "unexpected"
            XCTAssertThrowsError(try NativeTripProposalReference.decode(bytes(extra), expectedTripID: id))
        }
        for revision: Any in [0, 1001, true, "1"] {
            var invalid = reference; invalid["revision"] = revision
            XCTAssertThrowsError(try NativeTripProposalReference.decode(bytes(invalid), expectedTripID: id))
        }
        for kind in ["empty", "unavailable"] {
            XCTAssertNil(try NativeTripProposalReference.decode(bytes(["kind": kind]), expectedTripID: id))
            XCTAssertThrowsError(try NativeTripProposalReference.decode(bytes(["kind": kind, "tripId": id]), expectedTripID: id))
        }
    }
    @MainActor func testFrozenReferenceAndClosedAuthorityProjection() throws {
        let value = try XCTUnwrap(NativeProposalReferenceRecord.decode(bytes(payload())))
        XCTAssertEqual(value.proposalRevision, 2); XCTAssertEqual(value.tripVersion, 0)
        for key in ["patch", "digest", "confirmPayload", "title", "url"] {
            var data = payload(), content = try XCTUnwrap(data["content"] as? [String: Any])
            content[key] = "prohibited"; data["content"] = content
            XCTAssertThrowsError(try NativeProposalReferenceRecord.decode(bytes(data)), key)
        }
        for change in ["actions", "schema", "revision", "boolean", "trip", "basis", "sourceExtra", "rootExtra"] {
            var data = payload(), content = try XCTUnwrap(data["content"] as? [String: Any]), source = try XCTUnwrap(data["source"] as? [String: Any])
            switch change {
            case "actions": content["actions"] = [["type": "confirm"]]
            case "schema": content["schemaVersion"] = "change-proposal-reference/2"
            case "revision": content["proposalRevision"] = 2_147_483_648
            case "boolean": content["proposalRevision"] = true
            case "trip": source["tripId"] = NSNull()
            case "basis": data["basis"] = ["memories": [], "evidence": [["id": id]]]
            case "sourceExtra": source["producer"] = "task"
            default: data["ownerId"] = id
            }
            data["content"] = content; data["source"] = source
            XCTAssertThrowsError(try NativeProposalReferenceRecord.decode(bytes(data)), change)
        }
    }
    @MainActor func testNonCurrentAndUnavailableCannotYieldReference() throws {
        for field in ["current", "historicalReadable", "lifecycle", "currentRevision"] {
            var data = payload()
            data[field] = field == "lifecycle" ? "withdrawn" : field == "currentRevision" ? 2 : false
            XCTAssertThrowsError(try NativeProposalReferenceRecord.decode(bytes(data)))
        }
        XCTAssertNil(try NativeProposalReferenceRecord.decode(bytes(["kind": "unavailable"])))
        XCTAssertNil(try NativeProposalReferenceRecord.decode(bytes(["kind": "empty"])))
    }
    @MainActor func testExistingComparisonReaderRemainsCompatibleWithoutCoercion() throws {
        var data = payload()
        data["content"] = ["schemaVersion": "comparison/1", "title": "Synthetic comparison", "summary": "Fixture only",
                           "options": [["id": "one", "title": "One", "tradeoff": "Unknown"], ["id": "two", "title": "Two", "tradeoff": "Unknown"]], "actions": []]
        let wire = try bytes(data)
        XCTAssertTrue(try JSONDecoder().decode(NativeResultEnvelope.self, from: wire).data.valid)
        XCTAssertThrowsError(try NativeProposalReferenceRecord.decode(wire))
    }
    @MainActor func testExactReadAndRequestStartExpiry() async throws {
        var now: TimeInterval = 100
        let store = NativeProposalReferenceStore(uptime: { now }), wire = try bytes(payload())
        await store.load(artifactID: id, revision: 1, scope: owner, active: true, currentScope: { self.owner }) { artifact, revision in
            XCTAssertEqual(artifact, self.id); XCTAssertEqual(revision, 1); now = 119; return wire
        }
        XCTAssertNotNil(store.visible(scope: owner)); now = 120; XCTAssertNil(store.visible(scope: owner))
        await store.load(artifactID: id, revision: 2, scope: owner, active: true, currentScope: { self.owner }) { _, _ in wire }
        XCTAssertNil(store.visible(scope: owner)); XCTAssertEqual(store.state, .unavailable)
        await store.load(artifactID: UUID().uuidString, revision: 1, scope: owner, active: true, currentScope: { self.owner }) { _, _ in wire }
        XCTAssertNil(store.visible(scope: owner))
    }
    @MainActor func testScopeBackgroundAndLateReadCannotReviveContent() async throws {
        let store = NativeProposalReferenceStore(), wire = try bytes(payload())
        let other = NativeDataScope(endpoint: owner.endpoint, subject: "other", mobileEpoch: 1, generation: 2)
        var live: NativeDataScope? = owner
        await store.load(artifactID: id, revision: 1, scope: owner, active: true, currentScope: { live }) { _, _ in live = other; return wire }
        XCTAssertNil(store.visible(scope: owner)); XCTAssertNil(store.visible(scope: other))
        let barrier = ProposalReadBarrier()
        let pending = Task { await store.load(artifactID: self.id, revision: 1, scope: self.owner, active: true, currentScope: { self.owner }) { _, _ in await barrier.wait() } }
        await barrier.started(); store.clear(); await barrier.finish(wire); await pending.value
        XCTAssertNil(store.visible(scope: owner))
        var calls = 0
        await store.load(artifactID: id, revision: 1, scope: owner, active: false, currentScope: { self.owner }) { _, _ in calls += 1; return wire }
        XCTAssertEqual(calls, 0)
        await store.load(artifactID: id, revision: 1, scope: owner, active: true, currentScope: { self.owner }) { _, _ in wire }
        XCTAssertNil(store.visible(scope: owner, active: false)); store.clear(); XCTAssertNil(store.visible(scope: owner))
    }
    @MainActor func testReadonlyNativeCardRendersRecordWithoutPlanningContent() async throws {
        let store = NativeProposalReferenceStore(), wire = try bytes(payload())
        await store.load(artifactID: id, revision: 1, scope: owner, active: true, currentScope: { self.owner }) { _, _ in wire }
        let host = UIHostingController(rootView: NativeProposalReferenceView(store: store, scope: owner, isActive: true, chinese: true).environment(\.scenePhase, .active))
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 568))
        window.rootViewController = host; window.makeKeyAndVisible()
        defer { window.isHidden = true }
        host.view.frame = window.bounds; host.view.layoutIfNeeded()
        try await Task.sleep(for: .milliseconds(150))
        let image = UIGraphicsImageRenderer(bounds: host.view.bounds).image { _ in host.view.drawHierarchy(in: host.view.bounds, afterScreenUpdates: true) }
        let attachment = XCTAttachment(image: image); attachment.name = "Readonly-proposal-reference-local-fixture"; attachment.lifetime = .keepAlways; add(attachment)
        XCTAssertEqual(store.visible(scope: owner)?.proposalRevision, 2)
    }
}

private actor ProposalReadBarrier {
    private var continuation: CheckedContinuation<Data, Never>?
    func wait() async -> Data { await withCheckedContinuation { continuation = $0 } }
    func started() async { while continuation == nil { await Task.yield() } }
    func finish(_ bytes: Data) { continuation?.resume(returning: bytes); continuation = nil }
}

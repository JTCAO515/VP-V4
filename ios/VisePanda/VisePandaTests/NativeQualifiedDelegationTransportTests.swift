import XCTest
import Security
@testable import VisePanda

@MainActor private final class QualifiedDelegationMemoryVault: NativeCredentialVault {
    var bytes: Data?
    func write(_ data: Data, service: String, owner: String) -> OSStatus { bytes = data; return errSecSuccess }
    func read(service: String, owner: String) -> (OSStatus, Data?) { bytes == nil ? (errSecItemNotFound, nil) : (errSecSuccess, bytes) }
    func remove(service: String, owner: String) -> OSStatus { bytes = nil; return errSecSuccess }
}
nonisolated final class NativeQualifiedDelegationTransportTests: XCTestCase {
    @MainActor func testLocalNativeTransportRetryStaleLateAndRevokedAuthority() async throws {
        let env = ProcessInfo.processInfo.environment
        guard env["VP_NATIVE_QUALIFIED_DELEGATION_TRANSPORT"] == "1" else { throw XCTSkip("UNRUN: explicit local transport process required") }
        let api = try XCTUnwrap(env["VP_NATIVE_QUALIFIED_DELEGATION_API"]), email = try XCTUnwrap(env["VP_NATIVE_QUALIFIED_DELEGATION_EMAIL"])
        guard URL(string: api)?.host == "127.0.0.1", URL(string: api)?.port == 63252 else { throw NativeDataError.invalidResponse }
        let conversation = try XCTUnwrap(env["VP_NATIVE_QUALIFIED_DELEGATION_CONVERSATION"]), goal = try XCTUnwrap(env["VP_NATIVE_QUALIFIED_DELEGATION_GOAL"])
        let textPolicy = try XCTUnwrap(env["VP_NATIVE_QUALIFIED_DELEGATION_TEXT_POLICY"]), planning = try XCTUnwrap(env["VP_NATIVE_QUALIFIED_DELEGATION_PLANNING_POLICY"])
        let controlURL = try XCTUnwrap(URL(string: api + "/__qualified/control"))
        func control(_ op: String? = nil) async throws -> [String: Int] {
            var request = URLRequest(url: controlURL)
            if let op { request.httpMethod = "POST"; request.httpBody = try JSONSerialization.data(withJSONObject: [op: true]) }
            let (bytes, response) = try await URLSession.shared.data(for: request)
            XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
            return try XCTUnwrap(JSONSerialization.jsonObject(with: bytes) as? [String: Int])
        }
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "vp-qualified-local-" + UUID().uuidString))
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", api, "-VisePandaAssistantConversation"], defaults: defaults,
            bundleConfiguration: [:], vault: QualifiedDelegationMemoryVault())
        await session.login(email: email, password: "VPJ07-Local-Synthetic-Only-195!")
        func context() async throws -> NativeQualifiedDelegationContext {
            let scope = try XCTUnwrap(session.dataScope)
            let basis = try NativeTravelIntakeBasis.decode(await session.travelIntakeRequest(conversationID: conversation, goalID: goal))
            let policyBytes = try await session.askRequest(path: "api/chat/native/v5/planning/policy", method: "GET")
            let wrapper = try XCTUnwrap(JSONSerialization.jsonObject(with: policyBytes) as? [String: Any])
            let policy = try XCTUnwrap(wrapper["data"] as? [String: Any])
            XCTAssertEqual(wrapper["version"] as? Int, 1); XCTAssertEqual(policy["kind"] as? String, "planning_policy")
            XCTAssertEqual(policy["policyId"] as? String, planning); XCTAssertEqual(policy["consentState"] as? String, "accepted")
            XCTAssertEqual(session.dataScope, scope)
            return .init(selection: .init(scope: scope, conversationID: conversation, goalID: goal, goalVersion: basis.goalVersion,
                parentMessageID: basis.messageId, policyID: textPolicy), basisScope: scope, basis: basis,
                planningPolicy: .init(id: planning, scope: scope, textPolicyID: textPolicy, consentAccepted: true, current: true))
        }
        let c = try await context(), store = NativeQualifiedDelegationStore(); store.bind(c); store.draft = "Explicit local synthetic comparison delegation"
        let r = try store.prepareLocalFixture(locale: "en"), bytes = try NativeQualifiedDelegationHTTPRequest(rpc: r).bytes()
        let first = try NativeQualifiedDelegationHTTPReceipt.decode(await session.submitQualifiedIntakeDelegationRequest(bytes))
        XCTAssertTrue(first.matches(r)); XCTAssertFalse(first.reused); XCTAssertTrue(first.current)
        XCTAssertFalse(first.executionAvailable); XCTAssertFalse(first.readyForProvider); XCTAssertFalse(store.canStartRealWork)
        await store.inspectLocalHTTPReceipt(current: { c }, response: { try await session.submitQualifiedIntakeDelegationRequest($0.bytes()) })
        XCTAssertEqual(store.receipt?.artifactId, first.artifactId); XCTAssertEqual(store.receipt?.reused, true)
        _ = try await control("correct")
        await store.inspectLocalHTTPReceipt(current: { c }, response: { try await session.submitQualifiedIntakeDelegationRequest($0.bytes()) })
        XCTAssertEqual(store.state, .needsReview); XCTAssertEqual(store.receipt?.current, false)
        XCTAssertNil(store.receipt?.intakeContextDigest); XCTAssertNil(store.receipt?.planningContextDigest)
        _ = try await control("arm")
        let late = Task { await store.inspectLocalHTTPReceipt(current: { session.dataScope == c.selection.scope ? store.context : nil },
            response: { try await session.submitQualifiedIntakeDelegationRequest($0.bytes()) }) }
        for _ in 0..<100 { if try await control()["held"] == 1 { break }; try await Task.sleep(for: .milliseconds(50)) }
        let held = try await control(); XCTAssertEqual(held["held"], 1)
        _ = try await control("replace")
        do { _ = try await session.submitQualifiedIntakeDelegationRequest(bytes); XCTFail("Replaced native session must receive401") }
        catch { XCTAssertNil(session.dataScope) }
        store.bind(nil); _ = try await control("release"); await late.value
        XCTAssertNil(store.context); XCTAssertNil(store.request); XCTAssertNil(store.receipt); XCTAssertEqual(store.draft, "")
        await session.login(email: email, password: "VPJ07-Local-Synthetic-Only-195!")
        let new = try await context(); XCTAssertNotEqual(new.selection.scope, c.selection.scope)
        let denied = NativeQualifiedDelegationStore(); denied.bind(new); denied.draft = "Explicit current delegation after new login"
        _ = try denied.prepareLocalFixture(locale: "en"); let identity = denied.pendingIdentity
        _ = try await control("withdraw")
        await denied.inspectLocalHTTPReceipt(current: { new }, response: { try await session.submitQualifiedIntakeDelegationRequest($0.bytes()) })
        XCTAssertNil(denied.context); XCTAssertNil(denied.request); XCTAssertNil(denied.receipt); XCTAssertEqual(denied.draft, "")
        XCTAssertEqual(denied.pendingIdentity, identity); XCTAssertFalse(denied.canStartRealWork)
        let counts = try await control(); XCTAssertEqual(counts["admissions"], 1); XCTAssertEqual(counts["unauthorized401"], 1); XCTAssertEqual(counts["blocked403"], 1)
    }
}

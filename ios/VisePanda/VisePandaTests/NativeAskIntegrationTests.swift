import XCTest
@testable import VisePanda

nonisolated final class NativeAskIntegrationTests: XCTestCase {
    @MainActor
    func testRealLocalConsentPersistenceCancelWithdrawalAndAccountIsolation() async throws {
        let environment = ProcessInfo.processInfo.environment
        guard environment["VP_NATIVE_TEXT_TEST"] == "1" else { throw XCTSkip("UNRUN: explicit disposable native text environment is not configured") }
        let api = try XCTUnwrap(environment["VP_NATIVE_TEXT_API_URL"])
        let email = try XCTUnwrap(environment["VP_NATIVE_TEXT_EMAIL"])
        let otherEmail = try XCTUnwrap(environment["VP_NATIVE_TEXT_OTHER_EMAIL"])
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "vpj07.real.\(UUID().uuidString)"))
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", api], defaults: defaults)
        await session.login(email: email, password: "VPJ07-Local-Synthetic-Only-195!")
        XCTAssertNotNil(session.dataScope)
        let store = NativeAskStore()
        await store.reload(using: session)
        let policy = try XCTUnwrap(store.policy)
        XCTAssertEqual(policy.consentState, .notAccepted)
        store.draft = "Synthetic native request"
        XCTAssertFalse(store.canSend)
        await store.accept(reviewed: policy, using: session)
        XCTAssertEqual(store.policy?.consentState, .accepted)
        await store.send(locale: "en", using: session)
        XCTAssertNil(store.pending)
        let id = try XCTUnwrap(store.turns.first?.id)
        for _ in 0..<40 where store.turns.first?.outcome == nil {
            try await Task.sleep(for: .milliseconds(250))
            await store.reload(using: session)
        }
        XCTAssertEqual(store.turns.first?.outcome, .answered)
        XCTAssertEqual(store.turns.first?.output, "Local synthetic answer: request completed.")
        // New store reads durable history without resubmitting a prompt.
        let restored = NativeAskStore()
        await restored.reload(using: session)
        XCTAssertEqual(restored.turns.first?.id, id)
        XCTAssertEqual(restored.turns.first?.output, store.turns.first?.output)
        restored.draft = "Synthetic HOLD native request"
        await restored.send(locale: "en", using: session)
        let held = try XCTUnwrap(restored.turns.first)
        XCTAssertTrue(held.waiting)
        await restored.cancel(held, using: session)
        XCTAssertEqual(restored.turns.first?.status, "cancelled")
        if let raw = environment["VP_NATIVE_TEXT_CONTROL_URL"], let url = URL(string: raw) { _ = try await URLSession.shared.data(from: url) }
        await restored.withdraw(using: session)
        XCTAssertEqual(restored.policy?.consentState, .withdrawn)
        XCTAssertTrue(restored.turns.isEmpty)
        XCTAssertFalse(restored.canSend)
        await session.login(email: otherEmail, password: "VPJ07-Local-Synthetic-Only-195!")
        await restored.reload(using: session)
        XCTAssertTrue(restored.turns.isEmpty)
        XCTAssertEqual(restored.policy?.consentState, .notAccepted)
        await session.logout()
        restored.reset(for: session.dataScope)
        XCTAssertNil(restored.policy)
        XCTAssertTrue(restored.draft.isEmpty)
    }
}

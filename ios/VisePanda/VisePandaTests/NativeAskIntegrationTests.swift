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
    @MainActor
    func testRealLocalTaskClarificationRestorationAndFourTurnLimit() async throws {
        let environment = ProcessInfo.processInfo.environment
        guard environment["VP_NATIVE_TEXT_TEST"] == "1" else { throw XCTSkip("UNRUN: explicit local text environment required") }
        let api = try XCTUnwrap(environment["VP_NATIVE_TEXT_API_URL"])
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "vpj07.context.\(UUID().uuidString)"))
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", api, "-VisePandaTaskContext"], defaults: defaults)
        await session.login(email: try XCTUnwrap(environment["VP_NATIVE_TEXT_EMAIL"]), password: "VPJ07-Local-Synthetic-Only-195!")
        var store = NativeAskStore(mode: .taskContext)
        await store.reload(using: session)
        await store.accept(reviewed: try XCTUnwrap(store.policy), using: session)
        var taskID: String?
        var previousID: String?
        for index in 0..<4 {
            store.draft = "Synthetic kind=clarification step \(index)"
            XCTAssertTrue(store.canSend)
            await store.send(locale: "en", using: session)
            XCTAssertNil(store.pending)
            for _ in 0..<80 where !store.pollKey.isEmpty {
                try await Task.sleep(for: .milliseconds(250))
                await store.reload(using: session)
            }
            let latest = try XCTUnwrap(store.turns.max { $0.createdAt < $1.createdAt })
            XCTAssertEqual(latest.outcome, .clarification)
            if index == 0 { taskID = latest.serviceTaskId }
            XCTAssertEqual(latest.serviceTaskId, taskID)
            XCTAssertEqual(latest.parentTurnId, previousID)
            XCTAssertEqual(latest.relationship, index == 0 ? "new_goal" : "clarification")
            previousID = latest.id
            // Restore through actual scoped HTTP history between turns.
            store = NativeAskStore(mode: .taskContext)
            await store.reload(using: session)
            if index < 3 { XCTAssertEqual(store.intent, .continuation(latest)) }
            else { XCTAssertEqual(store.intent, .blocked) }
        }
        store.draft = "No implicit budget reset"
        XCTAssertFalse(store.canSend)
        XCTAssertTrue(store.canStartNew)
        store.startNewQuestion()
        XCTAssertEqual(store.intent, .newGoal)
        store.draft = "Synthetic kind=technical_failure"
        await store.send(locale: "en", using: session)
        for _ in 0..<80 where !store.pollKey.isEmpty {
            try await Task.sleep(for: .milliseconds(250)); await store.reload(using: session)
        }
        let failed = try XCTUnwrap(store.turns.max { $0.createdAt < $1.createdAt })
        XCTAssertEqual(failed.outcome, .technicalFailure)
        XCTAssertEqual(store.draft, failed.input)
        XCTAssertEqual(store.intent, .continuation(failed))
        store.draft = "Synthetic repair response"
        await store.send(locale: "en", using: session)
        for _ in 0..<80 where !store.pollKey.isEmpty {
            try await Task.sleep(for: .milliseconds(250)); await store.reload(using: session)
        }
        let repaired = try XCTUnwrap(store.turns.max { $0.createdAt < $1.createdAt })
        XCTAssertEqual(repaired.relationship, "repair")
        XCTAssertEqual(repaired.parentTurnId, failed.id)
        XCTAssertEqual(repaired.serviceTaskId, failed.serviceTaskId)
        XCTAssertEqual(repaired.outcome, .answered)
        store.startNewQuestion()
        store.draft = "Synthetic HOLD task"
        await store.send(locale: "en", using: session)
        let held = try XCTUnwrap(store.turns.max { $0.createdAt < $1.createdAt })
        await store.cancel(held, using: session)
        XCTAssertEqual(store.turns.first(where: { $0.id == held.id })?.status, "cancelled")
        if let raw = environment["VP_NATIVE_TEXT_CONTROL_URL"], let url = URL(string: raw) { _ = try await URLSession.shared.data(from: url) }
        do { _ = try await session.askRequest(path: "api/chat/native/v1/policy", method: "GET"); XCTFail("Task mode admitted a legacy policy request") }
        catch NativeDataError.invalidResponse { }
        await store.withdraw(using: session)
        XCTAssertTrue(store.turns.isEmpty)
        await session.logout()
    }
}

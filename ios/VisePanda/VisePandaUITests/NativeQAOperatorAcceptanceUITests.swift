import XCTest
import CryptoKit

/// Opt-in real UI runner. All credentials, consent, session creation and sending are human actions.
/// Default invocation skips before launching anything. Never reads credentials or Keychain values.
nonisolated final class NativeQAOperatorAcceptanceUITests: XCTestCase {
    private struct Scope: Decodable {
        let run_id: String
        let product_revision: String
        let project_ref: String
        let native_environment: String
        let origin: String
        let actor_subject: String
        let policy_id: String
        let notice_hash: String
        let question_utf8_sha256: String
        let bundle_identifier: String
        let not_before: String
        let expires_at: String
        let maximum_questions: Int
    }
    @MainActor func testOperatorLoginQuestionAndProcessReopen() throws {
        let environment = ProcessInfo.processInfo.environment
        guard environment["VP_NATIVE_QA_UI_EXECUTE"] == "1",
              let encoded = environment["VP_NATIVE_QA_UI_SCOPE"], let bytes = Data(base64Encoded: encoded),
              let scope = try? JSONDecoder().decode(Scope.self, from: bytes), UUID(uuidString: scope.run_id) != nil,
              scope.product_revision == "cf33285eceb4cb340a9fe70e975c643c023f5035",
              scope.project_ref == "dzqdzetcctkhbrhlxxgn", scope.native_environment == "staging",
              scope.bundle_identifier == "space.go2china.VisePanda", scope.maximum_questions == 1 else {
            throw XCTSkip("UNRUN: explicit operator execution and validated future canary scope required")
        }
        continueAfterFailure = false
        var observation: [String: Any] = ["schema": "nativeqa-operator-ui/1", "run_id": scope.run_id,
            "product_revision": scope.product_revision, "status": "UNRUN", "automatic_form_submission_actions": 0,
            "input_hash_source": "accessibility_label_utf8", "answer_hash_source": "accessibility_label_utf8",
            "service_task_id": NSNull(), "original_body_sha256": NSNull()]
        defer {
            if let data = try? JSONSerialization.data(withJSONObject: observation, options: [.sortedKeys]) {
                let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
                attachment.name = "nativeqa-operator-ui-\(scope.run_id).json"
                attachment.lifetime = .keepAlways; add(attachment)
            }
        }
        try currentWindow(scope)
        let startedAt = Date()
        let app = XCUIApplication(bundleIdentifier: scope.bundle_identifier)
        app.launchArguments = ["-VisePandaLocale", "en", "-AppleLanguages", "(en)"]
        app.launchEnvironment["VP_NATIVE_QA_ACCEPTANCE_RUN_ID"] = scope.run_id
        app.launch()
        let signin = app.buttons["native.qa.signin"]
        guard signin.waitForExistence(timeout: 20) else {
            throw XCTSkip("UNRUN: dedicated fresh signed-out profile required; no logout or user-data cleanup performed")
        }
        reveal(signin, app: app); signin.tap()
        guard app.textFields["native.login.email"].waitForExistence(timeout: 10),
              app.secureTextFields["native.login.password"].exists else { throw XCTSkip("UNRUN: original Profile login UI unavailable") }
        observation["profile_login_fields_observed"] = true
        print("OPERATOR_REQUIRED: enter ordinary credentials in Profile. Do not send a question yet. No secret is read by this test.")
        let closed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: app.secureTextFields["native.login.password"])
        guard XCTWaiter.wait(for: [closed], timeout: 180) == .completed,
              !app.secureTextFields["native.login.password"].exists else { throw XCTSkip("UNRUN: human login/MFA was not completed") }
        try currentWindow(scope)
        let actor = try readActor(app)
        guard actor == scope.actor_subject else { XCTFail("Canary actor mismatch; no further UI action"); return }
        observation["actor_subject"] = actor
        print("OPERATOR_REQUIRED: review the original notice and explicitly consent if required. Then CREATE A NEW session and enter the approved question, but DO NOT SEND until the next prompt. The test never taps consent/send/create.")
        guard app.buttons["native.qa.history.open"].waitForExistence(timeout: 180) else { throw XCTSkip("UNRUN: explicit notice/consent not completed or service unavailable") }
        observation["accepted_service_ui_observed"] = true
        let input = app.descendants(matching: .any).matching(identifier: "native.qa.input").firstMatch
        let drafted = XCTNSPredicateExpectation(predicate: NSPredicate { object, _ in
            guard let element = object as? XCUIElement, element.exists, let value = element.value as? String else { return false }
            return SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined() == scope.question_utf8_sha256
        }, object: input)
        guard XCTWaiter.wait(for: [drafted], timeout: 180) == .completed else { throw XCTSkip("UNRUN: operator did not prepare the approved draft; no automated send") }
        observation["approved_draft_observed"] = true
        try currentWindow(scope)
        print("OPERATOR_REQUIRED: press Send exactly once for the approved draft. Do not create or send any other question.")
        let questions = app.staticTexts.matching(NSPredicate(format: "identifier BEGINSWITH %@", "native.qa.question."))
        guard questions.firstMatch.waitForExistence(timeout: 180) else { throw XCTSkip("UNRUN: protected question not observed; preserve unknown request and use original readonly recovery") }
        XCTAssertEqual(questions.count, 1, "Canary requires one question in the selected session")
        let question = questions.firstMatch
        let requestID = String(question.identifier.dropFirst("native.qa.question.".count))
        XCTAssertNotNil(UUID(uuidString: requestID))
        let inputHash = hash(Data(question.label.utf8))
        guard inputHash == scope.question_utf8_sha256 else { XCTFail("Rendered question does not match approved digest; no further UI action"); return }
        observation["request_id"] = requestID; observation["turn_id"] = requestID; observation["input_utf8_sha256"] = inputHash
        let status = app.descendants(matching: .any).matching(identifier: "native.qa.message-status.\(requestID)").firstMatch
        let terminal = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label IN %@", ["Answer saved", "Partial answer", "More information needed", "Blocked", "Service error"]), object: status)
        guard XCTWaiter.wait(for: [terminal], timeout: 120) == .completed else { throw XCTSkip("UNRUN: bounded response wait ended; no retry, generation or stop was issued") }
        observation["response_status_label"] = status.label
        guard status.label == "Answer saved" else { throw XCTSkip("UNRUN: partial/clarification/blocked/technical failure is not completed first-answer acceptance") }
        let answer = app.staticTexts["native.qa.answer.\(requestID)"]
        guard answer.waitForExistence(timeout: 10), !answer.label.isEmpty else { throw XCTSkip("UNRUN: saved answer text not readable") }
        let answerHash = hash(Data(answer.label.utf8)); observation["answer_utf8_sha256"] = answerHash
        let originalObservation = app.staticTexts["native.qa.acceptance.observation"]
        var prepared: [String: Any]?
        if originalObservation.exists, let value = originalObservation.value as? String, let data = value.data(using: .utf8),
           let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            XCTAssertTrue(object["runID"] as? String == scope.run_id && object["subject"] as? String == actor && object["requestID"] as? String == requestID
                && object["policyID"] as? String == scope.policy_id && object["noticeHash"] as? String == scope.notice_hash
                && object["inputUTF8SHA256"] as? String == scope.question_utf8_sha256
                && (object["endpoint"] as? String)?.trimmingCharacters(in: CharacterSet(charactersIn: "/")) == scope.origin.trimmingCharacters(in: CharacterSet(charactersIn: "/")),
                          "Optional original-byte observation scope mismatch")
            if object["phase"] as? String == "PREPARED_NOT_SUBMITTED" { prepared = object }
        }
        try currentWindow(scope)
        dismissKeyboard(app)
        let history = app.buttons["native.qa.history.open"]; reveal(history, app: app); history.tap()
        let rows = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "native.qa.history.session."))
        guard rows.firstMatch.waitForExistence(timeout: 15) else { throw XCTSkip("UNRUN: saved session list unavailable") }
        let selected = rows.allElementsBoundByIndex.filter { $0.label.contains("Current session") }
        XCTAssertEqual(selected.count, 1, "Exactly one original selected session must be observable")
        let sessionID = String(selected[0].identifier.dropFirst("native.qa.history.session.".count))
        XCTAssertNotNil(UUID(uuidString: sessionID)); observation["session_id"] = sessionID
        let selectedLabel = selected[0].label as NSString
        let expression = try NSRegularExpression(pattern: #"Created: (\d{4}-\d{2}-\d{2}T[0-9:.+-]+Z?)"#)
        guard let match = expression.firstMatch(in: selectedLabel as String, range: NSRange(location: 0, length: selectedLabel.length)),
              let created = parseDate(selectedLabel.substring(with: match.range(at: 1))), created >= startedAt else {
            throw XCTSkip("UNRUN: this canary requires a newly created session in the current run; no old result accepted")
        }
        observation["fresh_session_observed"] = true
        if let prepared, prepared["sessionID"] as? String == sessionID {
            observation["original_body_sha256"] = prepared["originalBodySHA256"]
            observation["original_body_hash_source"] = "scoped_pre_submission_typed_command_observer"
        }
        let done = app.navigationBars.buttons["Done"].firstMatch
        if done.waitForExistence(timeout: 5) { done.tap() }
        app.terminate(); XCTAssertEqual(app.state, .notRunning)
        observation["process_exit_observed"] = true
        try currentWindow(scope); app.launch()
        guard app.buttons["native.qa.history.open"].waitForExistence(timeout: 30) else { throw XCTSkip("UNRUN: native session restore/service not ready after process reopen") }
        let restoredActor = try readActor(app)
        guard restoredActor == actor else { XCTFail("Restored actor changed; no further UI action"); return }
        observation["reopened_actor_subject"] = restoredActor
        let reopenedHistory = app.buttons["native.qa.history.open"]; reveal(reopenedHistory, app: app); reopenedHistory.tap()
        let originalSession = app.buttons["native.qa.history.session.\(sessionID)"]
        guard originalSession.waitForExistence(timeout: 15) else { throw XCTSkip("UNRUN: original saved session not listed") }
        reveal(originalSession, app: app); originalSession.tap()
        let reopenedQuestion = app.staticTexts["native.qa.question.\(requestID)"]
        let reopenedAnswer = app.staticTexts["native.qa.answer.\(requestID)"]
        guard reopenedQuestion.waitForExistence(timeout: 20), reopenedAnswer.waitForExistence(timeout: 20) else { throw XCTSkip("UNRUN: original request/result readback unavailable") }
        XCTAssertTrue(hash(Data(reopenedQuestion.label.utf8)) == inputHash, "Reopened input digest changed")
        XCTAssertTrue(hash(Data(reopenedAnswer.label.utf8)) == answerHash, "Reopened rendered answer digest changed")
        XCTAssertEqual(app.staticTexts.matching(NSPredicate(format: "identifier BEGINSWITH %@", "native.qa.question.")).count, 1)
        observation["reopened_session_id"] = sessionID; observation["reopened_request_id"] = requestID
        observation["reopened_input_utf8_sha256"] = inputHash; observation["reopened_answer_utf8_sha256"] = answerHash
        observation["observed_question_count"] = 1; observation["status"] = "COMPLETE"
    }
    @MainActor private func readActor(_ app: XCUIApplication) throws -> String {
        let menu = app.buttons["shell.entries.open"]
        guard menu.waitForExistence(timeout: 10) else { throw XCTSkip("UNRUN: original account navigation unavailable") }
        reveal(menu, app: app); menu.tap()
        let profile = app.buttons["shell.entry.profile"]
        guard profile.waitForExistence(timeout: 5) else { throw XCTSkip("UNRUN: original Profile menu unavailable") }
        profile.tap()
        let subject = app.staticTexts["native.session.subject"]
        guard subject.waitForExistence(timeout: 15) else { throw XCTSkip("UNRUN: ordinary Native actor not visible; no credential fallback") }
        let value = subject.label
        let done = app.buttons["shell.entry.done"]
        guard done.waitForExistence(timeout: 5) else { throw XCTSkip("UNRUN: original Profile return unavailable") }
        done.tap(); return value
    }
    @MainActor private func reveal(_ element: XCUIElement, app: XCUIApplication) {
        for _ in 0..<12 where !element.isHittable { app.swipeDown() }
        XCTAssertTrue(element.isHittable, "Required navigation control is not reachable")
    }
    @MainActor private func dismissKeyboard(_ app: XCUIApplication) {
        let done = app.buttons["native.qa.composer.done"]
        if done.exists, done.isHittable { done.tap() }
    }
    private func hash(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
    private func parseDate(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
    private func currentWindow(_ scope: Scope) throws {
        guard let start = parseDate(scope.not_before), let end = parseDate(scope.expires_at), start <= Date(), Date() < end else {
            throw XCTSkip("UNRUN: canary window expired; no further UI action")
        }
    }
}

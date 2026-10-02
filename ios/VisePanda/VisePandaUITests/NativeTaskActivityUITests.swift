import XCTest

nonisolated final class NativeTaskActivityUITests: XCTestCase {
    @MainActor func testActivityReadSwitchBackgroundExpiryAndRevocation() async throws {
        let env = ProcessInfo.processInfo.environment
        guard env["VP_NATIVE_ASSISTANT_ACTIVITY"] == "1" else { throw XCTSkip("UNRUN: owned local Task activity Auth fixture required") }
        continueAfterFailure = false
        let api = try XCTUnwrap(env["VP_NATIVE_TEXT_API_URL"])
        let controlURL = try XCTUnwrap(URL(string: env["VP_NATIVE_ACTIVITY_CONTROL"] ?? ""))
        func control(_ action: [String: Bool]? = nil) async throws -> Int {
            var request = URLRequest(url: controlURL)
            if let action { request.httpMethod = "POST"; request.httpBody = try JSONSerialization.data(withJSONObject: action) }
            let (bytes, response) = try await URLSession.shared.data(for: request)
            let http = try XCTUnwrap(response as? HTTPURLResponse)
            let operation = action?.keys.sorted().joined(separator: "+") ?? "state"
            let contentType = http.value(forHTTPHeaderField: "Content-Type") ?? "missing"
            XCTAssertEqual(http.statusCode, 200, "Synthetic control \(operation), type \(contentType), bytes \(bytes.count)")
            XCTAssertTrue(contentType.hasPrefix("application/json")); XCTAssertFalse(bytes.isEmpty)
            guard http.statusCode == 200, contentType.hasPrefix("application/json"), !bytes.isEmpty else { throw URLError(.badServerResponse) }
            return (try JSONSerialization.jsonObject(with: bytes) as? [String: Int])?["held"] ?? 0
        }
        let app = XCUIApplication()
        app.launchArguments = ["-VisePandaNativeAPI", api, "-VisePandaAssistantConversation", "-VisePandaActivityTrace", "-VisePandaLocale", "en", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch(); app.tabBars.buttons["Profile"].tap()
        let signOut = app.buttons["Sign out"]
        if signOut.waitForExistence(timeout: 2) { signOut.tap() }
        let email = app.textFields["native.login.email"]
        XCTAssertTrue(email.waitForExistence(timeout: 15)); email.tap(); email.typeText(try XCTUnwrap(env["VP_NATIVE_TEXT_UI_EN_EMAIL"]))
        let password = app.secureTextFields["native.login.password"]
        password.tap(); password.typeText("VPJ07-Local-Synthetic-Only-195!")
        app.buttons["native.login.submit"].tap()
        let a = app.buttons["assistant.task.activity.2"], b = app.buttons["assistant.task.activity.3"]
        let composer = app.descendants(matching: .any).matching(identifier: "assistant.composer").firstMatch
        func revealActivityAction(_ button: XCUIElement) {
            for _ in 0..<15 where !button.isHittable || button.frame.maxY >= min(composer.frame.minY, app.scrollViews.firstMatch.frame.maxY) {
                app.swipeUp()
            }
            XCTAssertTrue(button.isHittable)
            XCTAssertLessThan(button.frame.maxY, min(composer.frame.minY, app.scrollViews.firstMatch.frame.maxY), "Activity action must be inside the visible scroll region above the composer inset")
        }
        for _ in 0..<15 where !a.isHittable { app.swipeUp() }
        XCTAssertTrue(a.waitForExistence(timeout: 20)); revealActivityAction(a); a.tap()
        let unknown = app.staticTexts["Outcome unknown"], unrecorded = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "No readable activity receipt")).firstMatch
        XCTAssertTrue(unknown.waitForExistence(timeout: 20)); XCTAssertTrue(app.staticTexts["Task cancelled"].exists)
        XCTAssertFalse(app.staticTexts["Task completed"].exists)
        capture("Activity-real-Auth-unknown-cancelled", app)
        app.buttons["assistant.activity.done"].tap()
        revealActivityAction(b); b.tap(); XCTAssertTrue(unrecorded.waitForExistence(timeout: 20)); XCTAssertTrue(app.staticTexts["Task accepted"].exists)
        XCUIDevice.shared.press(.home); app.activate()
        XCTAssertFalse(app.buttons["assistant.activity.done"].exists, "Backgrounding clears the activity sheet")
        await fulfillment(of: [expectation(for: NSPredicate(format: "enabled == true"), evaluatedWith: app.buttons["Refresh"])], timeout: 15)
        composer.tap()
        await fulfillment(of: [expectation(for: NSPredicate(format: "exists == true"), evaluatedWith: app.keyboards.firstMatch)], timeout: 5)
        composer.typeText("Synthetic composer remains usable")
        XCTAssertTrue(app.buttons["assistant.send"].isEnabled, "Activity reads do not set composer writer busy")
        _ = try await control(["arm": true]); revealActivityAction(a); a.tap()
        for _ in 0..<100 { if try await control() == 1 { break }; try await Task.sleep(for: .milliseconds(50)) }
        let held = try await control(); XCTAssertEqual(held, 1)
        XCTAssertTrue(app.buttons["assistant.activity.done"].exists); app.buttons["assistant.activity.done"].tap()
        revealActivityAction(b); b.tap(); XCTAssertTrue(unrecorded.waitForExistence(timeout: 20))
        _ = try await control(["release": true])
        try await Task.sleep(for: .milliseconds(500))
        XCTAssertFalse(unknown.exists, "Late Task A cannot replace selected Task B")
        XCTAssertTrue(unrecorded.exists)
        await fulfillment(of: [expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: app.buttons["assistant.activity.done"])], timeout: 40)
        XCTAssertTrue(app.buttons["assistant.send"].isEnabled, "Expiry closes sheet without clearing the composer draft")
        revealActivityAction(b); b.tap(); XCTAssertTrue(unrecorded.waitForExistence(timeout: 20))
        _ = try await control(["goal": true])
        await fulfillment(of: [expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: app.buttons["assistant.activity.done"])], timeout: 20)
        _ = try await control(["resetGoal": true])
        await fulfillment(of: [expectation(for: NSPredicate(format: "exists == true"), evaluatedWith: b)], timeout: 20)
        revealActivityAction(b); b.tap(); XCTAssertTrue(unrecorded.waitForExistence(timeout: 20))
        app.buttons["assistant.activity.done"].tap()
        _ = try await control(["arm": true]); revealActivityAction(a); a.tap()
        for _ in 0..<100 { if try await control() == 1 { break }; try await Task.sleep(for: .milliseconds(50)) }
        let actorHeld = try await control(); XCTAssertEqual(actorHeld, 1)
        _ = try await control(["replace": true])
        await fulfillment(of: [expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: app.buttons["assistant.activity.done"])], timeout: 20)
        _ = try await control(["release": true])
        try await Task.sleep(for: .milliseconds(500))
        XCTAssertFalse(unknown.exists); XCTAssertFalse(unrecorded.exists)
        app.tabBars.buttons["Profile"].tap()
        XCTAssertTrue(email.waitForExistence(timeout: 20)); email.tap()
        if let value = email.value as? String, value != "Email" { email.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: value.count)) }
        email.typeText(try XCTUnwrap(env["VP_NATIVE_TEXT_UI_EN_EMAIL"]))
        password.tap(); password.typeText("VPJ07-Local-Synthetic-Only-195!")
        app.buttons["native.login.submit"].tap()
        XCTAssertTrue(b.waitForExistence(timeout: 20)); revealActivityAction(b); b.tap()
        XCTAssertTrue(unrecorded.waitForExistence(timeout: 20))
        _ = try await control(["revoke": true])
        app.buttons["assistant.activity.refresh"].tap()
        let unavailable = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Activity is unavailable")).firstMatch
        XCTAssertTrue(unavailable.waitForExistence(timeout: 20)); XCTAssertFalse(unrecorded.exists); XCTAssertFalse(unknown.exists)
        capture("Activity-real-planning-consent-withdrawn", app)
        app.buttons["assistant.activity.done"].tap()

    }
    @MainActor private func capture(_ name: String, _ app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}

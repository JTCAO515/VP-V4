import XCTest

nonisolated final class NativeTravelIntakeUITests: XCTestCase {
    @MainActor func testExplicitInputCorrectionClearAndCurrentStatus() async throws {
        let env = ProcessInfo.processInfo.environment
        guard env["VP_NATIVE_TRAVEL_INTAKE"] == "1" else { throw XCTSkip("UNRUN: backend-frozen owned Auth intake fixture required") }
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-VisePandaNativeAPI", try XCTUnwrap(env["VP_NATIVE_TEXT_API_URL"]), "-VisePandaAssistantConversation", "-VisePandaLocale", "en", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch(); app.tabBars.buttons["Profile"].tap()
        if app.buttons["Sign out"].waitForExistence(timeout: 2) { app.buttons["Sign out"].tap() }
        let email = app.textFields["native.login.email"]
        XCTAssertTrue(email.waitForExistence(timeout: 15)); email.tap(); email.typeText(try XCTUnwrap(env["VP_NATIVE_TEXT_UI_EN_EMAIL"]))
        let password = app.secureTextFields["native.login.password"]; password.tap(); password.typeText("VPJ07-Local-Synthetic-Only-195!")
        app.buttons["native.login.submit"].tap()
        let open = app.buttons["assistant.intake.open"]
        XCTAssertTrue(open.waitForExistence(timeout: 20)); for _ in 0..<8 where !open.isHittable { app.swipeUp() }; open.tap()
        let adopt = app.buttons["Recheck the current goal and enter requirements"]
        XCTAssertTrue(adopt.waitForExistence(timeout: 20)); adopt.tap()
        let city = app.textFields["assistant.intake.city"]
        XCTAssertTrue(city.waitForExistence(timeout: 20)); city.tap(); city.typeText("shanghai")
        let target = app.buttons["assistant.intake.target"]
        XCTAssertTrue(target.exists); target.tap(); app.buttons["Stay areas and transport"].tap()
        func confirm() {
            let review = app.buttons["assistant.intake.review"]
            for _ in 0..<16 where !review.isHittable { app.swipeUp() }
            XCTAssertTrue(review.isHittable); XCTAssertTrue(review.isEnabled); review.tap()
            let submit = app.buttons["assistant.intake.submit"]
            XCTAssertTrue(submit.waitForExistence(timeout: 5)); XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Unknown")).firstMatch.exists)
            submit.tap()
        }
        confirm()
        let status = app.staticTexts["assistant.intake.status"]
        XCTAssertTrue(status.waitForExistence(timeout: 20))
        XCTAssertTrue(status.label.contains("transport screening"))
        XCTAssertTrue(app.staticTexts["Planning and background processing have not started."].exists)
        func replaceCity(_ value: String) {
            for _ in 0..<15 where !city.isHittable { app.swipeDown() }
            XCTAssertTrue(city.isHittable); city.tap()
            let old = city.value as? String ?? ""
            city.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: old.count)); if !value.isEmpty { city.typeText(value) }
        }
        replaceCity("beijing"); confirm()
        await fulfillment(of: [expectation(for: NSPredicate(format: "label CONTAINS %@", "not covered"), evaluatedWith: status)], timeout: 20)
        replaceCity(""); confirm()
        await fulfillment(of: [expectation(for: NSPredicate(format: "label CONTAINS %@", "Waiting"), evaluatedWith: status)], timeout: 20)
        let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = "Explicit-intake-clear-waiting-current"; shot.lifetime = .keepAlways; add(shot)
        XCUIDevice.shared.press(.home); app.activate()
        XCTAssertFalse(app.buttons["assistant.intake.review"].exists, "Background discards editor and old qualification")
    }
}

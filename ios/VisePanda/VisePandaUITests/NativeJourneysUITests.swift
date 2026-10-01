import XCTest

@MainActor
final class NativeJourneysUITests: XCTestCase {
    func testSignedOutJourneysAndExistingEntriesInBothLanguagesAtMaximumText() {
        continueAfterFailure = false
        for locale in ["en", "zh-Hans"] {
            let app = XCUIApplication()
            app.launchArguments = ["-VisePandaFourTabShell", "-VisePandaLocale", locale,
                "-AppleLanguages", "(\(locale))", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
            app.launch()
            XCTAssertTrue(app.tabBars.buttons["VP"].waitForExistence(timeout: 10))
            app.tabBars.buttons[locale == "en" ? "Journeys" : "旅程"].tap()
            let vp = app.buttons["journeys.open-vp"]
            for _ in 0..<6 where !vp.exists || !vp.isHittable { app.swipeUp() }
            XCTAssertTrue(vp.isHittable)
            vp.tap()
            XCTAssertTrue(app.tabBars.buttons["VP"].isSelected)
            app.tabBars.buttons[locale == "en" ? "Journeys" : "旅程"].tap()
            let trips = app.buttons["journeys.open-trips"]
            for _ in 0..<6 where !trips.exists || !trips.isHittable { app.swipeUp() }
            XCTAssertTrue(trips.isHittable)
            trips.tap()
            XCTAssertTrue(app.navigationBars[locale == "en" ? "Trip" : "行程"].waitForExistence(timeout: 3))
            app.tabBars.buttons["Memory"].tap()
            app.tabBars.buttons[locale == "en" ? "Journeys" : "旅程"].tap()
            XCTAssertTrue(app.navigationBars[locale == "en" ? "Trip" : "行程"].exists)
            app.buttons["shell.entries.open"].tap()
            app.buttons["shell.entry.trip"].tap()
            app.tabBars.buttons[locale == "en" ? "Journeys" : "旅程"].tap()
            XCTAssertTrue(app.navigationBars[locale == "en" ? "Journeys" : "旅程"].waitForExistence(timeout: 3))
            let screenshot = XCTAttachment(screenshot: app.screenshot())
            screenshot.name = "Journeys-existing-Trip-maximum-text-\(locale)"
            screenshot.lifetime = .keepAlways; add(screenshot)
            app.terminate()
        }
    }
    func testAuthenticatedShellSwitchPreservesSessionAndModeLocalPaths() throws {
        let env = ProcessInfo.processInfo.environment
        guard env["VP_SHELL_SWITCH_TEST"] == "1" else { throw XCTSkip("UNRUN: disposable local Auth switch environment required") }
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-VisePandaNativeAPI", try XCTUnwrap(env["VP_NATIVE_TEXT_API_URL"]),
            "-VisePandaAssistantConversation", "-VisePandaLocale", "en", "-AppleLanguages", "(en)"]
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["Profile"].waitForExistence(timeout: 10))
        app.tabBars.buttons["Profile"].tap()
        let email = app.textFields["native.login.email"]
        XCTAssertTrue(email.waitForExistence(timeout: 10))
        email.tap(); email.typeText(try XCTUnwrap(env["VP_NATIVE_TEXT_UI_EN_EMAIL"]))
        let password = app.secureTextFields["native.login.password"]
        password.tap(); password.typeText("VPJ07-Local-Synthetic-Only-195!")
        app.buttons["native.login.submit"].tap()
        XCTAssertTrue(app.tabBars.buttons["Ask"].waitForExistence(timeout: 20))
        // Shell returns to its default tab after the actual native actor changes.
        app.tabBars.buttons["Profile"].tap()
        let subject = app.staticTexts["native.session.subject"]
        XCTAssertTrue(subject.waitForExistence(timeout: 15))
        let actor = subject.label
        func changeMode() {
            app.buttons["shell.entries.open"].tap()
            let toggle = app.buttons["shell.mode.toggle"]
            XCTAssertTrue(toggle.isEnabled); toggle.tap()
        }
        changeMode()
        XCTAssertTrue(app.tabBars.buttons["Library"].waitForExistence(timeout: 10))
        app.tabBars.buttons["Library"].tap()
        XCTAssertTrue(app.navigationBars["Explore"].waitForExistence(timeout: 5))
        app.tabBars.buttons["Journeys"].tap()
        app.buttons["journeys.open-trips"].tap()
        XCTAssertTrue(app.navigationBars["Trip"].waitForExistence(timeout: 5))
        app.tabBars.buttons["Library"].tap(); app.tabBars.buttons["Journeys"].tap()
        XCTAssertTrue(app.navigationBars["Trip"].exists)
        app.buttons["shell.entries.open"].tap(); app.buttons["shell.entry.trip"].tap()
        XCTAssertTrue(app.navigationBars["Journeys"].waitForExistence(timeout: 5))
        let control = try XCTUnwrap(URL(string: env["VP_SHELL_SWITCH_CONTROL"] ?? ""))
        func fault(_ armed: Bool) throws {
            let done = expectation(description: "Local controlled fault")
            var request = URLRequest(url: control); request.httpMethod = "POST"
            request.httpBody = try JSONSerialization.data(withJSONObject: ["arm": armed])
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            URLSession.shared.dataTask(with: request) { _, response, error in
                XCTAssertNil(error); XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200); done.fulfill()
            }.resume()
            wait(for: [done], timeout: 10)
        }
        app.tabBars.buttons["VP"].tap()
        let composer = app.descendants(matching: .any).matching(identifier: "assistant.composer").firstMatch
        XCTAssertTrue(composer.waitForExistence(timeout: 15))
        try fault(true)
        composer.tap(); composer.typeText("Pending shell switch proof")
        app.buttons["assistant.send"].tap()
        XCTAssertTrue(app.staticTexts["assistant.notice"].waitForExistence(timeout: 20))
        app.buttons["shell.entries.open"].tap()
        app.buttons["shell.entry.knowledge"].tap()
        app.buttons["shell.entries.open"].tap()
        XCTAssertFalse(app.buttons["shell.mode.toggle"].isEnabled)
        app.buttons["shell.entry.ask"].tap()
        try fault(false)
        let retry = app.buttons["assistant.send"]
        XCTAssertTrue(retry.waitForExistence(timeout: 10)); XCTAssertTrue(retry.isEnabled); retry.tap()
        XCTAssertTrue(app.staticTexts["assistant.message.1"].waitForExistence(timeout: 20))
        app.swipeDown()
        app.tabBars.buttons["Library"].tap()
        changeMode()
        XCTAssertTrue(app.tabBars.buttons["Profile"].waitForExistence(timeout: 10))
        app.tabBars.buttons["Profile"].tap()
        XCTAssertEqual(app.staticTexts["native.session.subject"].label, actor)
        app.buttons["Sign out"].tap()
        XCTAssertTrue(app.tabBars.buttons["Ask"].isSelected)
        app.tabBars.buttons["Profile"].tap()
        XCTAssertTrue(app.textFields["native.login.email"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.staticTexts["native.session.subject"].exists)
    }

}

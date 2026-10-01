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
            for _ in 0..<6 where !vp.isHittable { app.swipeUp() }
            XCTAssertTrue(vp.isHittable)
            vp.tap()
            XCTAssertTrue(app.tabBars.buttons["VP"].isSelected)
            app.tabBars.buttons[locale == "en" ? "Journeys" : "旅程"].tap()
            let trips = app.buttons["journeys.open-trips"]
            for _ in 0..<6 where !trips.isHittable { app.swipeUp() }
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
}

import XCTest

@MainActor
final class AppShellUITests: XCTestCase {
    private func launch(locale: String = "en", largeText: Bool = false) -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-VisePandaLocale", locale]
        if largeText {
            app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        }
        app.launch()
        return app
    }

    private func capture(_ name: String, app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testEnglishTabsTodayAndTranslationRoute() {
        let app = launch()
        XCTAssertTrue(app.tabBars.buttons["Ask"].isSelected)
        XCTAssertEqual(app.tabBars.buttons.count, 5)
        capture("Ask-English", app: app)
        XCTAssertFalse(app.buttons["Send"].isEnabled)
        for title in ["Trip", "Explore", "Ask", "Tools", "Profile"] {
            app.tabBars.buttons[title].tap()
            XCTAssertTrue(app.navigationBars[title].waitForExistence(timeout: 3))
        }
        app.tabBars.buttons["Trip"].tap()
        XCTAssertTrue(app.staticTexts["No saved trip yet"].exists)
        app.buttons["Today"].tap()
        XCTAssertTrue(app.navigationBars["Today"].waitForExistence(timeout: 3))
        app.tabBars.buttons["Ask"].tap()
        app.buttons["Help me prepare a bilingual address"].tap()
        XCTAssertTrue(app.navigationBars["Translation"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Translation"].exists)
        XCTAssertTrue(app.staticTexts["Planned bilingual text, speech, and image assistance."].exists)
        XCTAssertTrue(app.staticTexts["Preview only"].exists)
        // Each tab retains its own navigation stack; this creates no saved Trip.
        app.tabBars.buttons["Trip"].tap()
        XCTAssertTrue(app.navigationBars["Today"].exists)
    }

    func testChineseReleaseLanguagePickerAndEnglishSwitch() {
        let app = launch(locale: "zh-Hans")
        XCTAssertTrue(app.tabBars.buttons["问熊猫"].isSelected)
        capture("Ask-Chinese", app: app)
        let composer = app.textViews.firstMatch.exists ? app.textViews.firstMatch : app.textFields.firstMatch
        composer.tap()
        composer.typeText("Keep this draft")
        if app.staticTexts["Quickly Change Keyboards"].exists { app.buttons["Continue"].tap() }
        app.buttons["完成"].tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 3))
        for title in ["行程", "探索", "问熊猫", "工具", "我的"] {
            app.tabBars.buttons[title].tap()
            XCTAssertTrue(app.navigationBars[title].waitForExistence(timeout: 3))
        }
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "语言")).firstMatch.tap()
        XCTAssertTrue(app.buttons["English"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["中文"].exists)
        for legacy in ["Español", "Русский", "العربية"] {
            XCTAssertFalse(app.buttons[legacy].exists)
        }
        app.buttons["English"].tap()
        XCTAssertTrue(app.tabBars.buttons["Profile"].waitForExistence(timeout: 3))
        app.tabBars.buttons["Ask"].tap()
        XCTAssertTrue(app.navigationBars["Ask"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertEqual(composer.value as? String, "Keep this draft")
        XCTAssertFalse(app.buttons["Send"].isEnabled)
    }

    func testAccessibilityAtLargestTextSize() throws {
        let app = launch(largeText: true)
        XCTAssertTrue(app.tabBars.buttons["Ask"].isSelected)
        // Structural audit only; contrast, hit-region and VoiceOver device acceptance remain separate.
        try app.performAccessibilityAudit(for: [.elementDetection, .trait, .sufficientElementDescription, .textClipped]) { issue in
            print("AX issue: \(issue.compactDescription), element: \(String(describing: issue.element))")
            return false
        }
    }

    func testToolsAccessibilityAtLargestTextSize() throws {
        let app = launch(largeText: true)
        app.tabBars.buttons["Tools"].tap()
        for _ in 0..<5 where !app.buttons["Translation"].isHittable { app.swipeUp() }
        XCTAssertTrue(app.buttons["Translation"].isHittable)
        try app.performAccessibilityAudit(for: [.elementDetection, .trait, .sufficientElementDescription, .textClipped]) { issue in
            print("AX issue: \(issue.compactDescription), element: \(String(describing: issue.element))")
            return false
        }
        capture("Tools-largest-accessibility-text", app: app)
    }

    func testTodayAccessibilityAtLargestTextSize() throws {
        let app = launch(largeText: true)
        app.tabBars.buttons["Trip"].tap()
        for _ in 0..<5 where !app.buttons["Today"].isHittable { app.swipeUp() }
        XCTAssertTrue(app.buttons["Today"].isHittable)
        app.buttons["Today"].tap()
        XCTAssertTrue(app.navigationBars["Today"].exists)
        try app.performAccessibilityAudit(for: [.elementDetection, .trait, .sufficientElementDescription, .textClipped]) { issue in
            print("AX issue: \(issue.compactDescription), element: \(String(describing: issue.element))")
            return false
        }
        capture("Today-largest-accessibility-text", app: app)
    }
}

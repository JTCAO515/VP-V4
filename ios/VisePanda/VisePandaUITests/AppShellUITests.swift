import XCTest

@MainActor
final class AppShellUITests: XCTestCase {
    private func launch(locale: String = "en", largeText: Bool = false) -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = [
            "-VisePandaLocale", locale,
            "-AppleLanguages", "(\(locale))",
            "-AppleLocale", locale == "zh-Hans" ? "zh_CN" : "en_US"
        ]
        app.launchArguments += [
            "-UIPreferredContentSizeCategoryName",
            largeText ? "UICTContentSizeCategoryAccessibilityXXXL" : "UICTContentSizeCategoryL"
        ]
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

    func testAskAndTripFullAccessibilityInReleaseLanguages() throws {
        let previousAppearance = XCUIDevice.shared.appearance
        XCUIDevice.shared.appearance = .light
        defer { XCUIDevice.shared.appearance = previousAppearance }
        for locale in ["en", "zh-Hans"] {
            let app = launch(locale: locale)
            XCTAssertEqual(XCUIDevice.shared.appearance, .light)
            XCTAssertTrue(app.staticTexts["ask-availability-notice"].isHittable)
            try app.performAccessibilityAudit { issue in
                print("Full AX issue: \(issue.compactDescription), element: \(String(describing: issue.element))")
                return false
            }
            let tripLabel = locale == "en" ? "Trip" : "行程"
            app.tabBars.buttons[tripLabel].tap()
            XCTAssertTrue(app.navigationBars[tripLabel].waitForExistence(timeout: 3))
            try app.performAccessibilityAudit { issue in
                print("Full AX issue: \(issue.compactDescription), element: \(String(describing: issue.element))")
                return false
            }
            capture("Trip-full-AX-\(locale)", app: app)
            app.terminate()
        }
    }

    func testAskAndTripFullAccessibilityInDarkMode() throws {
        let previousAppearance = XCUIDevice.shared.appearance
        XCUIDevice.shared.appearance = .dark
        defer { XCUIDevice.shared.appearance = previousAppearance }
        for locale in ["en", "zh-Hans"] {
            let app = launch(locale: locale)
            XCTAssertEqual(XCUIDevice.shared.appearance, .dark)
            capture("Ask-dark-top-\(locale)", app: app)
            try app.performAccessibilityAudit()
            XCTAssertTrue(app.staticTexts["ask-availability-notice"].isHittable)
            capture("Ask-dark-\(locale)", app: app)
            let tripLabel = locale == "en" ? "Trip" : "行程"
            app.tabBars.buttons[tripLabel].tap()
            XCTAssertTrue(app.navigationBars[tripLabel].waitForExistence(timeout: 3))
            try app.performAccessibilityAudit()
            capture("Trip-dark-\(locale)", app: app)
            app.terminate()
        }
    }

    func testAccessibilityAtLargestTextSize() throws {
        let previousAppearance = XCUIDevice.shared.appearance
        defer { XCUIDevice.shared.appearance = previousAppearance }
        for appearance in [XCUIDevice.Appearance.light, .dark] {
            XCUIDevice.shared.appearance = appearance
            for locale in ["en", "zh-Hans"] {
                let app = launch(locale: locale, largeText: true)
                let layoutChecks: XCUIAccessibilityAuditType = [
                    .elementDetection, .hitRegion, .sufficientElementDescription,
                    .dynamicType, .textClipped, .trait
                ]
                // Contrast is checked in both themes at normal size. The retained
                // maximum-size contrast diagnostic remains FAIL, not an accepted pass.
                try app.performAccessibilityAudit(for: layoutChecks)
                let notice = app.staticTexts["ask-availability-notice"]
                revealFully(notice, in: app)
                try app.performAccessibilityAudit(for: layoutChecks)
                capture("Ask-largest-\(locale)-\(appearance.rawValue)", app: app)
                let tripLabel = locale == "en" ? "Trip" : "行程"
                app.tabBars.buttons[tripLabel].tap()
                XCTAssertTrue(app.navigationBars[tripLabel].waitForExistence(timeout: 3))
                try app.performAccessibilityAudit(for: layoutChecks)
                capture("Trip-largest-\(locale)-\(appearance.rawValue)", app: app)
                app.terminate()
            }
        }
    }

    private func revealFully(_ element: XCUIElement, in app: XCUIApplication) {
        let scroll = app.scrollViews.firstMatch
        let composer = app.otherElements["ask-composer"]
        XCTAssertTrue(composer.exists)
        let top = max(scroll.frame.minY, app.navigationBars.firstMatch.frame.maxY)
        let bottom = min(scroll.frame.maxY, composer.frame.minY)
        for _ in 0..<10 {
            let frame = element.frame
            let distance: CGFloat
            if frame.maxY > bottom { distance = min(frame.maxY - bottom + 20, (bottom - top) * 0.4) }
            else if frame.minY < top { distance = -min(top - frame.minY + 20, (bottom - top) * 0.4) }
            else { break }
            let start = scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
            let end = start.withOffset(CGVector(dx: 0, dy: -distance))
            start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        XCTAssertGreaterThanOrEqual(element.frame.minY, top)
        XCTAssertLessThanOrEqual(element.frame.maxY, bottom)
        XCTAssertTrue(element.isHittable)
    }

    func testToolsAccessibilityAtLargestTextSize() throws {
        let app = launch(largeText: true)
        app.tabBars.buttons["Tools"].tap()
        for _ in 0..<5 where !app.buttons["Translation"].isHittable { app.swipeUp() }
        let translation = app.buttons["Translation"]
        XCTAssertTrue(translation.isHittable)
        for _ in 0..<8 {
            let distance = translation.frame.minY - app.navigationBars.firstMatch.frame.maxY - 8
            if abs(distance) < 2 { break }
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.6))
            let end = start.withOffset(CGVector(dx: 0, dy: -min(max(distance, -200), 200)))
            start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        XCTAssertTrue(translation.isHittable)
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

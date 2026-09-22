import XCTest
import UIKit

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
        // A cold Simulator may return from launch before the accessibility target
        // is available. Wait for the actual shell before starting an AX audit.
        XCTAssertTrue(app.tabBars.buttons[locale == "zh-Hans" ? "问熊猫" : "Ask"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["ask-introduction"].waitForExistence(timeout: 10))
        return app
    }

    private func capture(_ name: String, app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    // The runner sets Simulator's actual system text size. No app size override.
    func testWorkflowBadgeBackgroundAtSystemTextSize() throws {
        continueAfterFailure = false
        let previousAppearance = XCUIDevice.shared.appearance
        XCUIDevice.shared.appearance = .light
        defer { XCUIDevice.shared.appearance = previousAppearance }
        for locale in ["en", "zh-Hans"] {
            let app = XCUIApplication()
            app.launchArguments = ["-VisePandaLocale", locale, "-AppleLanguages", "(\(locale))",
                                   "-AppleLocale", locale == "en" ? "en_US" : "zh_CN"]
            app.launch()
            app.tabBars.buttons[locale == "en" ? "Trip" : "行程"].tap()
            let last = app.staticTexts["3"]
            for _ in 0..<8 where !last.isHittable { app.swipeUp() }
            // Settle at the bottom so every badge is fully visible above the tab bar.
            app.swipeUp()
            capture("Workflow-system-text-\(locale)", app: app)
            let screenshot = app.screenshot().image
            let cgImage = try XCTUnwrap(screenshot.cgImage)
            let width = cgImage.width
            let height = cgImage.height
            var pixels = [UInt8](repeating: 0, count: width * height * 4)
            let context = try XCTUnwrap(CGContext(data: &pixels, width: width, height: height,
                bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
            context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
            let scale = CGFloat(width) / app.frame.width
            for number in ["1", "2", "3"] {
                let text = app.staticTexts[number]
                XCTAssertTrue(text.isHittable)
                let frame = text.frame
                // These points sit beyond the actual text frame. White/pale pixels
                // mean the number has outgrown its painted purple background.
                let probes = [CGPoint(x: frame.midX, y: frame.minY - 2),
                              CGPoint(x: frame.midX, y: frame.maxY + 2),
                              CGPoint(x: frame.minX - 2, y: frame.midY),
                              CGPoint(x: frame.maxX + 2, y: frame.midY)]
                for point in probes {
                    let x = Int(point.x * scale), y = Int(point.y * scale)
                    XCTAssertTrue(x >= 0 && x < width && y >= 0 && y < height)
                    let offset = (y * width + x) * 4
                    let r = Int(pixels[offset]), g = Int(pixels[offset + 1]), b = Int(pixels[offset + 2])
                    XCTAssertTrue(r > g * 2 && b > g * 2 && r < 180,
                        "Badge \(number) background missing at \(point): RGB \(r),\(g),\(b); text frame \(frame)")
                }
                print("Badge background passed: \(locale) \(number), text frame \(frame)")
            }
            app.terminate()
        }
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
        // VPJ-26 replaced the preview placeholder with the real bilingual composer;
        // assert the actual reachable screen instead of retired preview-only copy.
        XCTAssertTrue(app.staticTexts["Say it clearly"].exists)
        XCTAssertTrue(app.staticTexts["Sign in in Profile to translate."].exists)
        XCTAssertFalse(app.buttons["translation.submit"].isEnabled)
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

import XCTest

@MainActor
final class AppShellUITests: XCTestCase {
    private func launch(locale: String = "en", largeText: Bool = false) -> XCUIApplication {
        continueAfterFailure = true
        let app = XCUIApplication()
        app.launchArguments = ["-VisePandaLocale", locale, "-AppleLanguages", "(\(locale))", "-AppleLocale", locale == "zh-Hans" ? "zh_CN" : "en_US", "-UIPreferredContentSizeCategoryName", largeText ? "UICTContentSizeCategoryAccessibilityXXXL" : "UICTContentSizeCategoryL"]
        app.launch()
        return app
    }
    private func capture(_ name: String, app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
    func testChineseBannerComparison() throws {
        let previous = XCUIDevice.shared.appearance
        XCUIDevice.shared.appearance = .light
        defer { XCUIDevice.shared.appearance = previous }
        let app = launch(locale: "zh-Hans")
        let message = "此版本尚未连接实时数据、账号、AI、预订或支付。"
        let banner = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", message)).firstMatch
        XCTAssertTrue(banner.exists)
        let top = app.navigationBars.firstMatch.frame.maxY
        let bottom = app.tabBars.firstMatch.frame.minY
        print("Comparison banner: \(banner.frame), navigation/tab bounds \(top)...\(bottom)")
        XCTAssertGreaterThanOrEqual(banner.frame.minY, top)
        XCTAssertLessThanOrEqual(banner.frame.maxY, bottom)
        capture("Chinese-banner-before-all-audit", app: app)
        try app.performAccessibilityAudit { issue in
            print("Comparison AX: \(issue.compactDescription), element: \(String(describing: issue.element))")
            return false
        }
    }
    func testToolsViewportComparison() throws {
        let previous = XCUIDevice.shared.appearance
        XCUIDevice.shared.appearance = .light
        defer { XCUIDevice.shared.appearance = previous }
        let app = launch(largeText: true)
        app.tabBars.buttons["Tools"].tap()
        capture("Tools-initial", app: app)
        let translation = app.buttons["Translation"]
        for _ in 0..<5 where !translation.isHittable { app.swipeUp() }
        for index in 0..<8 {
            let distance = translation.frame.minY - app.navigationBars.firstMatch.frame.maxY - 8
            print("Comparison tools position \(index): \(translation.frame), distance \(distance)")
            if abs(distance) < 2 { break }
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.55))
            let end = start.withOffset(CGVector(dx: 0, dy: -min(max(distance, -200), 200)))
            start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        let top = app.navigationBars.firstMatch.frame.maxY
        let bottom = app.tabBars.firstMatch.frame.minY
        for name in ["Translation", "Address card", "Safe phrases"] {
            let element = app.buttons[name]
            print("Comparison tools full frame: \(name) \(element.frame), bounds \(top)...\(bottom)")
            XCTAssertGreaterThanOrEqual(element.frame.minY, top)
            XCTAssertLessThanOrEqual(element.frame.maxY, bottom)
            XCTAssertTrue(element.isHittable)
        }
        capture("Tools-before-all-audit", app: app)
        try app.performAccessibilityAudit { issue in
            print("Comparison AX: \(issue.compactDescription), element: \(String(describing: issue.element))")
            return false
        }
    }
}

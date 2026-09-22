import XCTest

nonisolated final class NativeHotelHandoffUITests: XCTestCase {
    @MainActor func testEnglishReviewAndCancel() throws { try review(locale: "en") }
    @MainActor func testChineseReviewAndCancel() throws { try review(locale: "zh-Hans") }

    @MainActor private func review(locale: String) throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-VisePandaLocale", locale]
        app.launch()
        let tools = app.tabBars.buttons[locale == "en" ? "Tools" : "工具"]
        XCTAssertTrue(tools.waitForExistence(timeout: 10)); tools.tap()
        let entry = app.buttons["tools.hotels"]
        XCTAssertTrue(entry.waitForExistence(timeout: 10)); entry.tap()
        let query = app.textFields["hotel.query"]
        XCTAssertTrue(query.waitForExistence(timeout: 5)); query.tap(); query.typeText("Shanghai")
        app.swipeUp()
        let prepare = app.buttons["hotel.prepare.booking"]
        reveal(prepare, app); prepare.tap()
        let disclosure = app.staticTexts["hotel.disclosure"]
        XCTAssertTrue(disclosure.waitForExistence(timeout: 5))
        XCTAssertTrue(disclosure.label.contains(locale == "en" ? "Filters are not sent" : "筛选条件不会传递"))
        let cancel = app.buttons["hotel.cancel"]; reveal(cancel, app); cancel.tap()
        XCTAssertTrue(query.exists)
        let fallback = app.buttons["hotel.prepare.trip"]; reveal(fallback, app); fallback.tap()
        XCTAssertTrue(disclosure.waitForExistence(timeout: 5))
        XCTAssertTrue(disclosure.label.contains(locale == "en" ? "not sent" : "均不会传递"))
        capture("VPJ22-\(locale)-review", app)
        reveal(cancel, app); cancel.tap()
        let children = app.switches["hotel.children"]; reveal(children, app); children.switches.firstMatch.tap()
        reveal(prepare, app); prepare.tap()
        XCTAssertTrue(disclosure.waitForExistence(timeout: 5))
        XCTAssertTrue(disclosure.label.contains(locale == "en" ? "Guest and room counts are not sent" : "不会传递任何人数和房间数"))
        capture("VPJ22-\(locale)-children", app)
    }

    @MainActor func testRealOfficialExit() throws {
        guard ProcessInfo.processInfo.environment["VP_HOTEL_REAL_EXIT"] == "1" else {
            throw XCTSkip("UNRUN: opt in to opening official sites with synthetic Shanghai query")
        }
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-VisePandaLocale", "en"]
        app.launch()
        let tools = app.tabBars.buttons["Tools"]
        XCTAssertTrue(tools.waitForExistence(timeout: 10)); tools.tap()
        let entry = app.buttons["tools.hotels"]
        XCTAssertTrue(entry.waitForExistence(timeout: 10)); entry.tap()
        let query = app.textFields["hotel.query"]; query.tap(); query.typeText("Shanghai")
        let prepare = app.buttons["hotel.prepare.booking"]; reveal(prepare, app); prepare.tap()
        let open = app.buttons["hotel.open"]; reveal(open, app); open.tap()
        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        XCTAssertTrue(safari.wait(for: .runningForeground, timeout: 20))
        capture("VPJ22-official-exit-safari", safari)
        app.activate()
        let status = app.staticTexts["hotel.status"]; reveal(status, app)
        XCTAssertTrue(status.label.contains("Booking status is unknown"))
    }
    @MainActor private func reveal(_ element: XCUIElement, _ app: XCUIApplication) {
        for _ in 0..<12 {
            if element.isHittable && element.frame.midY > 120 && element.frame.midY < app.frame.height - 80 { return }
            if element.exists && element.frame.midY < 120 { app.swipeDown() } else { app.swipeUp() }
        }
    }
    @MainActor private func capture(_ name: String, _ app: XCUIApplication) {
        let a = XCTAttachment(screenshot: app.screenshot()); a.name = name; a.lifetime = .keepAlways; add(a)
    }
}

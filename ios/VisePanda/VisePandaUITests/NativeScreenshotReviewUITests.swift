import XCTest

nonisolated final class NativeScreenshotReviewUITests: XCTestCase {
    @MainActor
    func testLocalReviewOpensAndClosesWithoutSelectingPhoto() {
        let application = XCUIApplication()
        application.launchArguments = ["-VisePandaLocale", "en"]
        application.launch()
        application.tabBars.buttons["Trip"].tap()

        let review = application.buttons["trip.screenshot.localReview"]
        XCTAssertTrue(review.waitForExistence(timeout: 10))
        review.tap()
        XCTAssertTrue(application.staticTexts["screenshot.localOnly"].waitForExistence(timeout: 10))
        XCTAssertTrue(application.buttons["screenshot.choose"].exists)
        let attachment = XCTAttachment(screenshot: application.screenshot())
        attachment.name = "Local screenshot review, no selection"
        attachment.lifetime = .keepAlways
        add(attachment)
        application.buttons["Close"].tap()
        XCTAssertTrue(review.waitForExistence(timeout: 10))
    }

    @MainActor
    func testChineseLocalReviewEntry() {
        let application = XCUIApplication()
        application.launchArguments = ["-VisePandaLocale", "zh-Hans"]
        application.launch()
        application.tabBars.buttons["行程"].tap()

        let review = application.buttons["trip.screenshot.localReview"]
        XCTAssertTrue(review.waitForExistence(timeout: 10))
        review.tap()
        XCTAssertTrue(application.staticTexts["screenshot.localOnly"].waitForExistence(timeout: 10))
        XCTAssertTrue(application.buttons["screenshot.choose"].exists)
    }
}

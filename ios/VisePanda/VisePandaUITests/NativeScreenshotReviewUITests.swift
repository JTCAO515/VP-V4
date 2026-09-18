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

    @MainActor
    func testRealPickerRecognizesOneSimulatorScreenshot() throws {
        guard ProcessInfo.processInfo.environment["VP_SCREENSHOT_PICKER_TEST"] == "1" else {
            throw XCTSkip("UNRUN: one synthetic screenshot must be added to the simulator Photos library")
        }
        let application = XCUIApplication()
        application.launchArguments = ["-VisePandaLocale", "en"]
        application.launch()
        application.tabBars.buttons["Trip"].tap()
        application.buttons["trip.screenshot.localReview"].tap()
        application.buttons["screenshot.choose"].tap()
        let photo = application.images.matching(NSPredicate(format: "label CONTAINS[c] %@ OR label CONTAINS[c] %@", "截屏", "Screenshot")).firstMatch
        XCTAssertTrue(photo.waitForExistence(timeout: 10), application.debugDescription)
        // PhotosUI's out-of-process grid exposes the image but not a hittable AX
        // action on this simulator runtime. Tap its verified visible center.
        photo.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(application.buttons["screenshot.line.1"].waitForExistence(timeout: 20), application.debugDescription)
        XCTAssertFalse(application.buttons["screenshot.propose"].exists)
        application.buttons["Close"].tap()
    }

}

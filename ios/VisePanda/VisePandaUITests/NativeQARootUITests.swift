import XCTest

final class NativeQARootUITests: XCTestCase {
    func testConfiguredLocalEntryShowsNativeQALoginWithoutPreviewConversation() {
        continueAfterFailure = false
        for locale in ["en", "zh"] {
            let app = XCUIApplication()
            app.launchArguments = ["-V10RealServiceFrontend", "-VisePandaNativeAPI", "http://127.0.0.1:59997",
                                   "-VisePandaLocale", locale, "-AppleLanguages", "(\(locale))",
                                   "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
            app.launch()
            let signIn = app.buttons["native.qa.signin"]
            XCTAssertTrue(signIn.waitForExistence(timeout: 10))
            XCTAssertEqual(app.tabBars.buttons.count, 4)
            XCTAssertFalse(app.textFields["ask-composer-input"].exists)
            XCTAssertFalse(app.scrollViews["native.real-service.disconnected"].exists)
            for _ in 0..<3 where !signIn.isHittable { app.scrollViews.firstMatch.swipeUp() }
            XCTAssertTrue(signIn.isHittable)
            signIn.tap()
            XCTAssertTrue(app.secureTextFields.firstMatch.waitForExistence(timeout: 5))
            XCTAssertTrue(app.textFields.firstMatch.exists)
            // No credential, consent, message or provider submission is performed.
            app.terminate()
        }
    }
}

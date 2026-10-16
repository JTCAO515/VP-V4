import XCTest

final class NativeRealServiceEntryUITests: XCTestCase {
    func testUnconfiguredRealServiceKeepsFourTabsAndBlocksPreviewAcrossAskEntries() {
        continueAfterFailure = false
        for locale in ["en", "zh"] {
            let app = XCUIApplication()
            app.launchArguments = ["-V10RealServiceFrontend", "-VisePandaLocale", locale,
                                   "-AppleLanguages", "(\(locale))",
                                   "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
            app.launch()
            let disconnected = app.scrollViews["native.real-service.disconnected"]
            XCTAssertTrue(disconnected.waitForExistence(timeout: 10))
            XCTAssertEqual(app.tabBars.buttons.count, 4)
            XCTAssertFalse(app.textFields["ask-composer-input"].exists)
            app.buttons["shell.entries.open"].tap()
            let askEntry = app.buttons["shell.entry.ask"]
            XCTAssertTrue(askEntry.waitForExistence(timeout: 5))
            askEntry.tap()
            XCTAssertTrue(disconnected.waitForExistence(timeout: 5))
            XCTAssertFalse(app.textFields["ask-composer-input"].exists)
            let title = app.descendants(matching: .any).matching(identifier: "native.real-service.disconnected.title").firstMatch
            XCTAssertTrue(title.exists)
            XCTAssertEqual(title.label, locale == "zh" ? "真实服务尚未连接" : "Real service is not connected")
            app.terminate()
        }
    }
}

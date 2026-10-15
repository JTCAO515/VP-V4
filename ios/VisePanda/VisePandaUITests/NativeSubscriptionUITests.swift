import XCTest

final class NativeSubscriptionUITests: XCTestCase {
    @MainActor func testPublicDirectoryIsReachableWithoutPurchasingOrPrivateEntitlement() {
        continueAfterFailure = false
        for locale in ["en", "zh-Hans"] {
            let zh = locale == "zh-Hans"
            let app = XCUIApplication()
            app.launchArguments = ["-VisePandaLegacyShell", "-VisePandaLocale", locale,
                "-AppleLanguages", "(\(locale))", "-AppleLocale", zh ? "zh_CN" : "en_US"]
            app.launch()
            let profile = app.tabBars.buttons[zh ? "我的" : "Profile"]
            XCTAssertTrue(profile.waitForExistence(timeout: 10))
            profile.tap()
            let entry = app.buttons["profile.subscription.open"]
            XCTAssertTrue(entry.waitForExistence(timeout: 5))
            entry.tap()
            XCTAssertTrue(app.staticTexts["subscription.purchase-unavailable"].waitForExistence(timeout: 5))
            XCTAssertTrue(app.staticTexts[zh ? "月订阅" : "Monthly subscription"].exists)
            XCTAssertEqual(app.staticTexts["subscription.status"].label,
                zh ? "登录后核验当前状态" : "Sign in to verify current status")
            XCTAssertEqual(app.staticTexts["subscription.capacity-unknown"].label,
                zh ? "剩余容量：未知" : "Remaining capacity: unknown")
            let legacy = app.buttons["subscription.legacy-entitlements"]
            if !legacy.isHittable { app.swipeUp() }
            XCTAssertTrue(legacy.waitForExistence(timeout: 3))
            legacy.tap()
            XCTAssertFalse(app.buttons["profile.subscription.open"].exists)
            XCTAssertTrue(app.navigationBars[zh ? "我的" : "Profile"].exists)
            app.terminate()
        }
    }
}

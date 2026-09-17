import XCTest

nonisolated final class NativeIdentityUITests: XCTestCase {
    @MainActor
    private func app() throws -> XCUIApplication {
        guard ProcessInfo.processInfo.environment["VP_NATIVE_LOCAL_UI"] == "1" else {
            throw XCTSkip("UNRUN: explicit disposable local identity environment is not configured")
        }
        let application = XCUIApplication()
        let origin = ProcessInfo.processInfo.environment["VP_NATIVE_API_ORIGIN"] ?? "http://127.0.0.1:59731"
        application.launchArguments = ["-VisePandaNativeAPI", origin, "-VisePandaLocale", "en"]
        application.launch()
        application.tabBars.buttons["Profile"].tap()
        return application
    }

    @MainActor
    func testLoginShowsRealOwnerProfile() throws {
        let application = try app()
        let email = try XCTUnwrap(ProcessInfo.processInfo.environment["VP_NATIVE_LOCAL_EMAIL"])
        let emailField = application.textFields["native.login.email"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 10))
        emailField.tap()
        emailField.typeText(email)
        let password = application.secureTextFields["native.login.password"]
        password.tap()
        password.typeText("VPJ04-Local-Synthetic-Only-191!")
        application.buttons["native.login.submit"].tap()
        let profile = application.staticTexts["native.profile.name"]
        XCTAssertTrue(profile.waitForExistence(timeout: 20))
        XCTAssertEqual(profile.label, "Local Phone Owner A")
        let evidence = XCTAttachment(screenshot: application.screenshot())
        evidence.name = "Real local owner profile"
        evidence.lifetime = .keepAlways
        add(evidence)
        XCTAssertEqual(application.staticTexts["native.session.status"].label, "Session active")
    }

    @MainActor
    func testLogoutClearsAccount() throws {
        let application = try app()
        let profile = application.staticTexts["native.profile.name"]
        XCTAssertTrue(profile.waitForExistence(timeout: 20))
        application.buttons["Sign out"].tap()
        XCTAssertTrue(application.textFields["native.login.email"].waitForExistence(timeout: 10))
        XCTAssertFalse(profile.exists)
        XCTAssertEqual(application.staticTexts["native.session.status"].label, "Signed out")
    }

    @MainActor
    func testReplacedPhoneCannotRestoreOldSession() throws {
        let application = try app()
        let status = application.staticTexts["native.session.status"]
        XCTAssertTrue(status.waitForExistence(timeout: 10))
        let replaced = NSPredicate(format: "label == %@", "Session expired or replaced on another phone. Sign in again.")
        expectation(for: replaced, evaluatedWith: status)
        waitForExpectations(timeout: 20)
        XCTAssertFalse(application.staticTexts["native.profile.name"].exists)
        XCTAssertTrue(application.textFields["native.login.email"].exists)
    }
}

import XCTest

nonisolated final class NativeTripShareUITests: XCTestCase {
    @MainActor func testEnglishSharing() async throws { try await sharing(locale: "en") }
    @MainActor func testChineseSharing() async throws { try await sharing(locale: "zh-Hans") }

    @MainActor private func control(_ action: String) async throws {
        let url = try XCTUnwrap(URL(string: "http://127.0.0.1:59941/control/" + action))
        let (_, reply) = try await URLSession.shared.data(from: url)
        XCTAssertEqual((reply as? HTTPURLResponse)?.statusCode, 200)
    }

    @MainActor private func sharing(locale: String) async throws {
        guard ProcessInfo.processInfo.environment["VP_NATIVE_SHARE_UI"] == "1" else { throw XCTSkip("UNRUN: explicit sharing HTTP fixture required") }
        continueAfterFailure = false
        try await control("reset")
        let zh = locale == "zh-Hans", app = XCUIApplication()
        app.launchArguments = ["-VisePandaNativeAPI", "http://127.0.0.1:59941", "-VisePandaLocale", locale, "-AppleLanguages", "(\(locale))", "-AppleLocale", zh ? "zh_CN" : "en_US"]
        app.launch()
        app.tabBars.buttons[zh ? "我的" : "Profile"].tap()
        let logout = app.buttons[zh ? "退出登录" : "Sign out"]
        if logout.waitForExistence(timeout: 2) { reveal(logout, app); logout.tap() }
        let email = app.textFields["native.login.email"]
        XCTAssertTrue(email.waitForExistence(timeout: 10)); reveal(email, app); email.tap(); email.typeText("share@example.test")
        let password = app.secureTextFields["native.login.password"]
        reveal(password, app); password.tap(); password.typeText("synthetic-not-a-credential")
        let login = app.buttons["native.login.submit"]; reveal(login, app); login.tap()
        let active = NSPredicate(format: "label == %@", zh ? "会话有效" : "Session active")
        let activeExpectation = expectation(for: active, evaluatedWith: app.staticTexts["native.session.status"])
        await fulfillment(of: [activeExpectation], timeout: 15)
        app.tabBars.buttons[zh ? "行程" : "Trip"].tap()
        let select = app.buttons["trip.select.11111111-1111-4111-8111-111111111111"]
        XCTAssertTrue(select.waitForExistence(timeout: 10)); select.tap()
        let share = app.buttons["trip.share"]; XCTAssertTrue(share.waitForExistence(timeout: 10)); reveal(share, app); share.tap()
        XCTAssertEqual(app.switches["share.title"].value as? String, "0")
        XCTAssertEqual(app.switches["share.dates"].value as? String, "0")
        let museum = app.switches["share.item.museum"]; reveal(museum, app); museum.switches.firstMatch.tap(); XCTAssertEqual(museum.value as? String, "1")
        let preview = app.buttons["share.preview"]; reveal(preview, app); preview.tap()
        let image = app.images["share.preview.0"]; XCTAssertTrue(image.waitForExistence(timeout: 10))
        XCTAssertTrue(image.label.contains("Museum"), image.label); XCTAssertFalse(image.label.contains("Alice")); XCTAssertFalse(image.label.contains("2026-10-02"))
        capture("VPJ49-preview-\(locale)", app)
        let send = app.buttons["share.send"]
        let edit = app.buttons["share.edit"]; XCTAssertTrue(edit.waitForExistence(timeout: 5)); reveal(edit, app); edit.tap()
        let range = app.buttons["share.range"]
        reveal(range, app); range.tap()
        app.buttons[zh ? "第 2 天" : "Day 2"].tap()
        let park = app.switches["share.item.park"]; reveal(park, app); park.switches.firstMatch.tap(); XCTAssertEqual(park.value as? String, "1")
        reveal(preview, app); preview.tap(); XCTAssertTrue(image.waitForExistence(timeout: 10))
        XCTAssertTrue(image.label.contains("Park")); XCTAssertFalse(image.label.contains("Museum"))
        // A later saved revision must invalidate the already-previewed images.
        try await control("update")
        reveal(send, app); send.tap()
        XCTAssertTrue(app.staticTexts["share.stale"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.images["share.preview.0"].exists)
        capture("VPJ49-stale-\(locale)", app)
        app.buttons["share.close"].tap()
        reveal(share, app); share.tap()
        reveal(preview, app); preview.tap()
        XCTAssertTrue(image.waitForExistence(timeout: 10))
        reveal(send, app); send.tap()
        // Apple's actual activity controller, not an application mock.
        XCTAssertTrue(app.otherElements["ActivityListView"].waitForExistence(timeout: 10), app.debugDescription)
        capture("VPJ49-system-share-\(locale)", app)
        app.terminate()
    }

    @MainActor private func reveal(_ element: XCUIElement, _ app: XCUIApplication) {
        for _ in 0..<12 {
            if element.isHittable && element.frame.midY > 160 && element.frame.midY < app.frame.height - 90 { return }
            if element.exists && element.frame.midY < 160 { app.swipeDown() }
            else { app.swipeUp() }
        }
    }
    @MainActor private func capture(_ name: String, _ app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}

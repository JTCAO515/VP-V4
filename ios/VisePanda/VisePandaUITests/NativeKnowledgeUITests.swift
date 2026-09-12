import XCTest

nonisolated final class NativeKnowledgeUITests: XCTestCase, @unchecked Sendable {
    @MainActor func testEnglishRefreshCredentialsReadAndWithdraw() async throws { try await exercise(chinese: false) }
    @MainActor func testChineseRefreshCredentialsReadAndWithdraw() async throws { try await exercise(chinese: true) }

    private func control(_ values: [String: Bool]) async throws -> [String: Any] {
        var request = URLRequest(url: URL(string: "http://127.0.0.1:59654/control")!)
        request.httpMethod = "POST"; request.httpBody = try JSONEncoder().encode(values)
        let (data, _) = try await URLSession.shared.data(for: request)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    @MainActor private func exercise(chinese: Bool) async throws {
        guard ProcessInfo.processInfo.environment["VP_NATIVE_KNOWLEDGE_UI_TEST"] == "1" else {
            throw XCTSkip("UNRUN: explicit loopback knowledge UI fixture not configured")
        }
        _ = try await control(["reset": true]); continueAfterFailure = false
        let app = XCUIApplication(), locale = chinese ? "zh-Hans" : "en"
        app.launchArguments = ["-VisePandaNativeAPI", "http://127.0.0.1:59654", "-VisePandaLocale", locale, "-AppleLanguages", "(\(locale))", "-AppleLocale", chinese ? "zh_CN" : "en_US"]
        app.launch()
        app.tabBars.buttons[chinese ? "我的" : "Profile"].tap()
        let signOut = app.buttons[chinese ? "退出登录" : "Sign out"]
        if signOut.waitForExistence(timeout: 2) { reveal(signOut, app); signOut.tap() }
        let email = app.textFields["native.login.email"]
        XCTAssertTrue(email.waitForExistence(timeout: 10)); reveal(email, app); email.tap(); email.typeText("knowledge-ui@example.test")
        let password = app.secureTextFields["native.login.password"]
        reveal(password, app); password.tap(); password.typeText("Synthetic-Only!")
        let login = app.buttons["native.login.submit"]; reveal(login, app); login.tap()
        let status = app.staticTexts["native.session.status"]
        let active = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", chinese ? "会话有效" : "Session active"), object: status)
        await fulfillment(of: [active], timeout: 20)
        // Wait through the actual login transaction before switching views.
        XCTAssertTrue(app.staticTexts[chinese ? "会话有效" : "Session active"].waitForExistence(timeout: 20))
        let before = try await control([:])
        XCTAssertEqual(before["reads"] as? Int, 0, "Hidden Explore must not read knowledge")
        app.tabBars.buttons[chinese ? "探索" : "Explore"].tap()
        XCTAssertTrue(app.staticTexts["knowledge.empty"].waitForExistence(timeout: 20))
        let state = try await control([:])
        XCTAssertGreaterThanOrEqual(state["refreshes"] as? Int ?? 0, (before["refreshes"] as? Int ?? 0) + 1, "Near-expiry token must refresh without its view cancelling it")
        let picker = app.buttons["knowledge.scene"]
        XCTAssertTrue(picker.exists); picker.tap(); app.buttons[chinese ? "支付" : "Payment"].tap()
        let note = app.staticTexts["knowledge.note.11111111-1111-4111-8111-111111111111"]
        XCTAssertTrue(note.waitForExistence(timeout: 20)); reveal(note, app)
        XCTAssertEqual(note.label, chinese ? "本机合成知识：核对商户受理方式。" : "Local synthetic note: check merchant acceptance.")
        XCTAssertTrue(app.staticTexts[chinese ? "适用条件" : "Applies when"].exists)
        XCTAssertTrue(app.staticTexts[chinese ? "不包含" : "Not covered"].exists)
        capture("knowledge-\(locale)-read", app)
        _ = try await control(["revoked": true])
        reveal(app.buttons["knowledge.refresh"], app); app.buttons["knowledge.refresh"].tap()
        XCTAssertTrue(app.staticTexts["knowledge.empty"].waitForExistence(timeout: 20)); XCTAssertFalse(note.exists)
        _ = try await control(["disabled": true]); app.buttons["knowledge.refresh"].tap()
        XCTAssertTrue(app.staticTexts["knowledge.unavailable"].waitForExistence(timeout: 20)); XCTAssertFalse(note.exists)
        capture("knowledge-\(locale)-disabled", app)
        app.terminate()
    }

    @MainActor private func reveal(_ element: XCUIElement, _ app: XCUIApplication) {
        for _ in 0..<8 where !element.isHittable { app.swipeUp() }
        XCTAssertTrue(element.isHittable)
    }
    @MainActor private func capture(_ name: String, _ app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}

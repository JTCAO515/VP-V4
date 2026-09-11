import XCTest

nonisolated final class NativeAskUITests: XCTestCase {
    @MainActor func testEnglishConsentSendAndRelaunch() throws { try exercise(locale: "en", userKey: "VP_NATIVE_TEXT_UI_EN_EMAIL") }
    @MainActor func testChineseConsentSendAndRelaunch() throws { try exercise(locale: "zh-Hans", userKey: "VP_NATIVE_TEXT_UI_ZH_EMAIL") }

    @MainActor func testEnglishTaskClarificationAndRelaunch() throws { try exercise(locale: "en", userKey: "VP_NATIVE_TEXT_UI_EN_EMAIL", taskContext: true) }
    @MainActor func testChineseTaskClarificationAndRelaunch() throws { try exercise(locale: "zh-Hans", userKey: "VP_NATIVE_TEXT_UI_ZH_EMAIL", taskContext: true) }

    @MainActor private func exercise(locale: String, userKey: String, taskContext: Bool = false) throws {
        let environment = ProcessInfo.processInfo.environment
        guard environment["VP_NATIVE_TEXT_TEST"] == "1" else { throw XCTSkip("UNRUN: explicit local native text UI environment is not configured") }
        continueAfterFailure = false
        let api = try XCTUnwrap(environment["VP_NATIVE_TEXT_API_URL"])
        let email = try XCTUnwrap(environment[userKey])
        let chinese = locale == "zh-Hans"
        let app = XCUIApplication()
        app.launchArguments = ["-VisePandaNativeAPI", api, "-VisePandaLocale", locale, "-AppleLanguages", "(\(locale))", "-AppleLocale", chinese ? "zh_CN" : "en_US"]
        if taskContext { app.launchArguments += ["-VisePandaTaskContext"] }
        app.launch()
        app.tabBars.buttons[chinese ? "我的" : "Profile"].tap()
        let signOut = app.buttons[chinese ? "退出登录" : "Sign out"]
        if signOut.waitForExistence(timeout: 2) { reveal(signOut, app); signOut.tap() }
        let emailField = app.textFields["native.login.email"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 15)); reveal(emailField, app); emailField.tap(); emailField.typeText(email)
        let password = app.secureTextFields["native.login.password"]
        reveal(password, app); password.tap(); password.typeText("VPJ07-Local-Synthetic-Only-195!")
        let login = app.buttons["native.login.submit"]; reveal(login, app); login.tap()
        expectation(for: NSPredicate(format: "label == %@", chinese ? "本机会话有效" : "Local session active"), evaluatedWith: app.staticTexts["native.session.status"])
        waitForExpectations(timeout: 30)
        app.tabBars.buttons[chinese ? "问熊猫" : "Ask"].tap()
        let agree = app.switches["native-ask.agree"]
        XCTAssertTrue(agree.waitForExistence(timeout: 20)); reveal(agree, app)
        XCTAssertTrue(app.staticTexts["native-ask.notice"].exists)
        capture("Native-Ask-notice-\(locale)", app)
        agree.tap()
        let accept = app.buttons["native-ask.accept"]; reveal(accept, app); accept.tap()
        let input = app.descendants(matching: .any).matching(identifier: "native-ask.input").firstMatch
        XCTAssertTrue(input.waitForExistence(timeout: 20)); reveal(input, app); input.tap()
        input.typeText((chinese ? "中文合成请求" : "Synthetic UI request") + (taskContext ? " kind=clarification" : ""))
        let send = app.buttons["native-ask.send"]; send.tap()
        let answer = app.staticTexts.matching(NSPredicate(format: "identifier BEGINSWITH %@", "native-ask.answer.")).firstMatch
        XCTAssertTrue(answer.waitForExistence(timeout: 30)); reveal(answer, app)
        XCTAssertEqual(answer.label, chinese ? "本机合成回答：请求已完成。" : "Local synthetic answer: request completed.")
        let id = answer.identifier
        capture("Native-Ask-answer-\(locale)", app)
        app.terminate(); app.launch()
        let restored = app.staticTexts[id]
        XCTAssertTrue(restored.waitForExistence(timeout: 30)); reveal(restored, app)
        XCTAssertEqual(restored.label, chinese ? "本机合成回答：请求已完成。" : "Local synthetic answer: request completed.")
        capture("Native-Ask-reloaded-\(locale)", app)
        if taskContext {
            XCTAssertEqual(app.staticTexts["native-ask.intent"].label, chinese ? "补充当前问题" : "Continue this question")
            let followup = app.descendants(matching: .any).matching(identifier: "native-ask.input").firstMatch
            reveal(followup, app); followup.tap()
            followup.typeText(chinese ? "中文合成补充" : "Synthetic clarification reply")
            app.buttons["native-ask.send"].tap()
            let answers = app.staticTexts.matching(NSPredicate(format: "identifier BEGINSWITH %@", "native-ask.answer."))
            expectation(for: NSPredicate(format: "count == 2"), evaluatedWith: answers)
            waitForExpectations(timeout: 30)
            let newQuestion = app.buttons["native-ask.new-question"]
            XCTAssertTrue(newQuestion.isEnabled)
            newQuestion.tap()
            XCTAssertEqual(app.staticTexts["native-ask.intent"].label, chinese ? "新问题" : "New question")
            capture("Native-Ask-task-context-\(locale)", app)
        }
    }
    @MainActor private func reveal(_ element: XCUIElement, _ app: XCUIApplication) {
        for _ in 0..<12 where !element.isHittable { app.swipeUp() }
        XCTAssertTrue(element.isHittable)
    }
    @MainActor private func capture(_ name: String, _ app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}

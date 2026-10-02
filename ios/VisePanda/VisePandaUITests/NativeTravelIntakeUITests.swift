import XCTest

nonisolated final class NativeTravelIntakeUITests: XCTestCase {
    @MainActor func testExplicitInputCorrectionClearAndCurrentStatus() async throws {
        let env = ProcessInfo.processInfo.environment
        guard env["VP_NATIVE_TRAVEL_INTAKE"] == "1" else { throw XCTSkip("UNRUN: backend-frozen owned Auth intake fixture required") }
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-VisePandaNativeAPI", try XCTUnwrap(env["VP_NATIVE_TEXT_API_URL"]), "-VisePandaAssistantConversation", "-VisePandaLocale", "en", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch(); app.tabBars.buttons["Profile"].tap()
        if app.buttons["Sign out"].waitForExistence(timeout: 2) { app.buttons["Sign out"].tap() }
        let email = app.textFields["native.login.email"]
        XCTAssertTrue(email.waitForExistence(timeout: 15)); email.tap(); email.typeText(try XCTUnwrap(env["VP_NATIVE_TEXT_UI_EN_EMAIL"]))
        let password = app.secureTextFields["native.login.password"]; password.tap(); password.typeText("VPJ07-Local-Synthetic-Only-195!")
        app.buttons["native.login.submit"].tap()
        let open = app.buttons["assistant.intake.open"]
        XCTAssertTrue(open.waitForExistence(timeout: 20)); for _ in 0..<8 where !open.isHittable { app.swipeUp() }; open.tap()
        let adopt = app.buttons["Recheck the current goal and enter requirements"]
        XCTAssertTrue(adopt.waitForExistence(timeout: 20)); adopt.tap()
        let city = app.textFields["assistant.intake.city"]
        XCTAssertTrue(city.waitForExistence(timeout: 20)); city.tap(); city.typeText("shanghai")
        let target = app.buttons["assistant.intake.target"]
        XCTAssertTrue(target.exists); target.tap(); app.buttons["Stay areas and transport"].tap()
        func confirm() {
            let review = app.buttons["assistant.intake.review"]
            for _ in 0..<16 where !review.isHittable { app.swipeUp() }
            XCTAssertTrue(review.isHittable); XCTAssertTrue(review.isEnabled); review.tap()
            let submit = app.buttons["assistant.intake.submit"]
            XCTAssertTrue(submit.waitForExistence(timeout: 5)); XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Unknown")).firstMatch.exists)
            submit.tap()
        }
        confirm()
        let status = app.staticTexts["assistant.intake.status"]
        XCTAssertTrue(status.waitForExistence(timeout: 20))
        XCTAssertTrue(status.label.contains("transport screening"))
        XCTAssertTrue(app.staticTexts["Planning and background processing have not started."].exists)
        func replaceCity(_ value: String) {
            for _ in 0..<15 where !city.isHittable { app.swipeDown() }
            XCTAssertTrue(city.isHittable); city.tap()
            let old = city.value as? String ?? ""
            city.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: old.count)); if !value.isEmpty { city.typeText(value) }
        }
        replaceCity("beijing"); confirm()
        await fulfillment(of: [expectation(for: NSPredicate(format: "label CONTAINS %@", "not covered"), evaluatedWith: status)], timeout: 20)
        replaceCity(""); confirm()
        await fulfillment(of: [expectation(for: NSPredicate(format: "label CONTAINS %@", "Waiting"), evaluatedWith: status)], timeout: 20)
        let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = "Explicit-intake-clear-waiting-current"; shot.lifetime = .keepAlways; add(shot)
        XCUIDevice.shared.press(.home); app.activate()
        XCTAssertFalse(app.buttons["assistant.intake.review"].exists, "Background discards editor and old qualification")
    }
    @MainActor func testInjectedEnglishEditingAndConflict() async throws { try await injectedEditor(locale: "en") }
    @MainActor func testInjectedChineseEditingAndConflict() async throws { try await injectedEditor(locale: "zh") }
    @MainActor private func injectedEditor(locale: String) async throws {
        guard ProcessInfo.processInfo.environment["VP_NATIVE_INTAKE_INJECTED"] == "1" else { throw XCTSkip("UNRUN: explicit local injected-response UI harness required") }
        continueAfterFailure = false
        print("INTAKE_INJECTED_UI_SOURCE_V8_" + locale)
        let zh = locale == "zh", app = XCUIApplication()
        app.launchArguments = ["-VisePandaNativeAPI", "http://127.0.0.1:63251", "-VisePandaAssistantConversation", "-VisePandaTravelIntakeInjected", "-VisePandaLocale", locale, "-AppleLanguages", "(" + locale + ")"]
        app.launch()
        let banner = app.staticTexts["intake.injected.banner"]
        if !banner.waitForExistence(timeout: 3) {
            let vp = app.tabBars.buttons["VP"]
            if vp.exists { vp.tap() } else { app.tabBars.buttons.element(boundBy: 0).tap() }
        }
        XCTAssertTrue(banner.waitForExistence(timeout: 10))
        let open = app.buttons["intake.injected.open"]
        open.tap()
        let city = app.textFields["assistant.intake.city"]
        XCTAssertTrue(city.waitForExistence(timeout: 10))
        func reveal(_ element: XCUIElement, down: Bool = false) {
            for _ in 0..<18 where !element.isHittable { if down { app.swipeDown() } else { app.swipeUp() } }
            XCTAssertTrue(element.isHittable)
        }
        func replace(_ id: String, _ value: String, down: Bool = false) {
            let field = app.textFields[id]; reveal(field, down: down); field.tap()
            let old = field.value as? String ?? ""
            if !old.isEmpty && old != field.placeholderValue { field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: old.count)) }
            if !value.isEmpty { field.typeText(value) }
            let hide = app.buttons[zh ? "收起键盘" : "Hide keyboard"]
            XCTAssertTrue(hide.waitForExistence(timeout: 3)); hide.tap(); XCTAssertFalse(app.keyboards.firstMatch.exists)
        }
        replace("assistant.intake.city", zh ? "北京：明确填写的较长目的地名称，用于验证用户输入保持可纠正且不会被自动替换" : "Beijing explicitly entered long destination text for editable requirements")
        replace("assistant.intake.days", "12")
        replace("assistant.intake.party", "3")
        replace("assistant.intake.budget", "10000001")
        let review = app.buttons["assistant.intake.review"]; reveal(review)
        XCTAssertFalse(review.isEnabled, "Invalid budget cannot silently become unknown")
        replace("assistant.intake.budget", "45000", down: true); reveal(review); XCTAssertTrue(review.isEnabled); review.tap()
        XCTAssertTrue(app.buttons["assistant.intake.submit"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "45000")).firstMatch.exists)
        let fullReview = XCTAttachment(screenshot: app.screenshot()); fullReview.name = "LOCAL-INJECTED-" + locale + "-complete-review"; fullReview.lifetime = .keepAlways; add(fullReview)
        app.buttons[zh ? "返回修改" : "Back to edit"].tap()
        reveal(city, down: true)
        XCTAssertEqual(app.textFields["assistant.intake.city"].value as? String, zh ? "北京：明确填写的较长目的地名称，用于验证用户输入保持可纠正且不会被自动替换" : "Beijing explicitly entered long destination text for editable requirements")
        reveal(review); review.tap(); XCTAssertTrue(app.buttons["assistant.intake.submit"].waitForExistence(timeout: 5)); app.buttons["assistant.intake.submit"].tap()
        let status = app.staticTexts["assistant.intake.status"]
        reveal(status, down: true)
        await fulfillment(of: [expectation(for: NSPredicate(format: "label CONTAINS %@", zh ? "尚不支持" : "not covered"), evaluatedWith: status)], timeout: 10)
        let clearBudget = app.buttons["assistant.intake.budget.clear"]; reveal(clearBudget); clearBudget.tap()
        XCTAssertEqual(app.textFields["assistant.intake.budget"].value as? String, app.textFields["assistant.intake.budget"].placeholderValue)
        let clearCity = app.buttons["assistant.intake.city.clear"]; reveal(clearCity, down: true); clearCity.tap()
        XCTAssertEqual(city.value as? String, city.placeholderValue)
        reveal(review); review.tap(); XCTAssertTrue(app.buttons["assistant.intake.submit"].waitForExistence(timeout: 5)); app.buttons["assistant.intake.submit"].tap()
        reveal(status, down: true)
        await fulfillment(of: [expectation(for: NSPredicate(format: "label CONTAINS %@", zh ? "等待" : "Waiting"), evaluatedWith: status)], timeout: 10)
        let capture = XCTAttachment(screenshot: app.screenshot()); capture.name = "LOCAL-INJECTED-" + locale + "-null-current-status"; capture.lifetime = .keepAlways; add(capture)
        app.buttons["intake.injected.cancel"].tap()
        XCTAssertTrue(app.staticTexts["intake.injected.counts"].label.contains("writes=2 revision=3"))
        app.buttons["intake.injected.arm409"].tap(); open.tap()
        replace("assistant.intake.city", "beijing")
        reveal(review); review.tap(); XCTAssertTrue(app.buttons["assistant.intake.submit"].waitForExistence(timeout: 5)); app.buttons["assistant.intake.submit"].tap()
        let preserved = app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", zh ? "草稿已保留" : "draft is retained")).firstMatch
        XCTAssertTrue(preserved.waitForExistence(timeout: 10))
        XCTAssertFalse(review.isEnabled)
        reveal(city, down: true); XCTAssertEqual(city.value as? String, "beijing")
        let recheck = app.buttons[zh ? "重新核对目标并读取（保留草稿）" : "Recheck goal and read (keep draft)"]
        reveal(recheck); recheck.tap(); reveal(review); XCTAssertTrue(review.isEnabled)
        let correctionNotice = app.staticTexts["assistant.intake.correction.notice"]; reveal(correctionNotice, down: true)
        XCTAssertTrue(correctionNotice.label.contains(zh ? "旧 Memory 选择已清空" : "prior Memory references were cleared"))
        reveal(city); XCTAssertEqual(city.value as? String, "beijing")
        app.buttons["intake.injected.cancel"].tap(); open.tap()
        XCTAssertTrue(city.waitForExistence(timeout: 10)); reveal(city)
        XCTAssertTrue((city.value as? String ?? "") != "beijing", "Cancel/reopen reads current basis and discards unsent conflict draft")
        let final = XCTAttachment(screenshot: app.screenshot()); final.name = "LOCAL-INJECTED-" + locale + "-reopened"; final.lifetime = .keepAlways; add(final)
        app.buttons["intake.injected.cancel"].tap()
        XCTAssertTrue(app.staticTexts["intake.injected.counts"].label.contains("writes=3 revision=3"), "409 does not mutate basis or retry")
    }
}

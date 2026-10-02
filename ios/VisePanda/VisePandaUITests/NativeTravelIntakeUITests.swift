import XCTest

nonisolated final class NativeTravelIntakeUITests: XCTestCase {
    @MainActor func testExplicitInputCorrectionClearAndCurrentStatus() async throws {
        let env = ProcessInfo.processInfo.environment
        guard env["VP_NATIVE_TRAVEL_INTAKE"] == "1" else { throw XCTSkip("UNRUN: backend-frozen owned Auth intake fixture required") }
        continueAfterFailure = false
        print("INTAKE_REAL_AUTH_UI_SOURCE_V1")
        let app = XCUIApplication(), emailValue = try XCTUnwrap(env["VP_NATIVE_TEXT_UI_EN_EMAIL"])
        let controlURL = try XCTUnwrap(URL(string: env["VP_NATIVE_INTAKE_CONTROL"] ?? ""))
        func control(_ operation: String? = nil) async throws -> [String: Int] {
            var request = URLRequest(url: controlURL)
            if let operation { request.httpMethod = "POST"; request.httpBody = try JSONSerialization.data(withJSONObject: [operation: true]) }
            let (bytes, response) = try await URLSession.shared.data(for: request)
            let http = try XCTUnwrap(response as? HTTPURLResponse)
            XCTAssertEqual(http.statusCode, 200); XCTAssertTrue(http.value(forHTTPHeaderField: "Content-Type")?.hasPrefix("application/json") == true)
            return try XCTUnwrap(JSONSerialization.jsonObject(with: bytes) as? [String: Int])
        }
        app.launchArguments = ["-VisePandaNativeAPI", try XCTUnwrap(env["VP_NATIVE_TEXT_API_URL"]), "-VisePandaAssistantConversation", "-VisePandaLocale", "en", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        func login() {
            app.tabBars.buttons["Profile"].tap()
            if app.buttons["Sign out"].waitForExistence(timeout: 2) { app.buttons["Sign out"].tap() }
            let email = app.textFields["native.login.email"]
            XCTAssertTrue(email.waitForExistence(timeout: 15)); email.tap()
            let previous = email.value as? String ?? ""
            if previous != email.placeholderValue { email.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: previous.count)) }
            email.typeText(emailValue); XCTAssertEqual(email.value as? String, emailValue)
            let password = app.secureTextFields["native.login.password"]; password.tap(); password.typeText("VPJ07-Local-Synthetic-Only-195!")
            app.buttons["native.login.submit"].tap()
        }
        func reveal(_ element: XCUIElement, down: Bool = false) {
            for _ in 0..<16 where !element.isHittable { if down { app.swipeDown() } else { app.swipeUp() } }
            XCTAssertTrue(element.isHittable)
        }
        func fill(_ id: String, _ text: String, down: Bool = false) {
            let field = app.descendants(matching: .any).matching(identifier: id).firstMatch
            reveal(field, down: down); field.tap()
            let previous = field.value as? String ?? ""
            if previous != field.placeholderValue { field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: previous.count)) }
            field.typeText(text)
            XCTAssertEqual(field.value as? String, text)
            XCTAssertTrue(app.buttons["Hide keyboard"].waitForExistence(timeout: 3)); app.buttons["Hide keyboard"].tap()
            XCTAssertFalse(app.keyboards.firstMatch.exists)
        }
        func enableSwitch(_ label: String) {
            let row = app.switches[label]; reveal(row)
            let control = row.descendants(matching: .switch).firstMatch
            XCTAssertTrue(control.exists); reveal(control); control.tap()
            XCTAssertEqual(row.value as? String, "1", "Actual switch must change before dependent fields are used")
        }
        let open = app.buttons["assistant.intake.open"], review = app.buttons["assistant.intake.review"], status = app.staticTexts["assistant.intake.status"]
        func openEditor() {
            if !open.waitForExistence(timeout: 3), app.tabBars.buttons["Ask"].exists { app.tabBars.buttons["Ask"].tap() }
            XCTAssertTrue(open.waitForExistence(timeout: 20)); reveal(open); open.tap()
        }
        func confirm() {
            reveal(review); XCTAssertTrue(review.isEnabled); review.tap()
            let submit = app.buttons["assistant.intake.submit"]; XCTAssertTrue(submit.waitForExistence(timeout: 5)); submit.tap()
        }
        func currentStatus(_ text: String) async {
            reveal(status, down: true)
            await fulfillment(of: [expectation(for: NSPredicate(format: "label CONTAINS %@", text), evaluatedWith: status)], timeout: 20)
            XCTAssertTrue(app.staticTexts["Planning and background processing have not started."].exists)
        }
        login(); openEditor()
        let adopt = app.buttons["Recheck the current goal and enter requirements"]
        XCTAssertTrue(adopt.waitForExistence(timeout: 20)); adopt.tap()
        fill("assistant.intake.city", "shanghai")
        app.buttons["assistant.intake.target"].tap(); app.buttons["Stay areas and transport"].tap()
        fill("assistant.intake.days", "10"); fill("assistant.intake.party", "2")
        let pace = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Travel pace")).firstMatch
        reveal(pace); pace.tap(); app.buttons["Relaxed"].tap()
        enableSwitch("Interests are known (none is allowed)")
        enableSwitch("Food"); enableSwitch("Photography")
        fill("assistant.intake.start", "2026-10-03"); fill("assistant.intake.end", "2026-10-10")
        enableSwitch("Mobility constraints are known (none is allowed)")
        fill("assistant.intake.mobility", "Prefer fewer stairs\nNeed regular rest breaks")
        confirm(); await currentStatus("transport screening")
        fill("assistant.intake.city", "beijing", down: true); fill("assistant.intake.days", "12"); fill("assistant.intake.party", "3")
        fill("assistant.intake.budget", "450.00"); confirm(); await currentStatus("not covered")
        let clearBudget = app.buttons["assistant.intake.budget.clear"]; reveal(clearBudget); clearBudget.tap()
        let clearCity = app.buttons["assistant.intake.city.clear"]; reveal(clearCity, down: true); clearCity.tap()
        XCTAssertEqual(app.textFields["assistant.intake.city"].value as? String, app.textFields["assistant.intake.city"].placeholderValue)
        confirm(); await currentStatus("Waiting")
        fill("assistant.intake.city", "beijing", down: true); _ = try await control("armCAS"); confirm()
        let retained = app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "draft is retained")).firstMatch
        reveal(retained); XCTAssertTrue(retained.exists); XCTAssertFalse(review.isEnabled)
        let city = app.textFields["assistant.intake.city"]; reveal(city, down: true); XCTAssertEqual(city.value as? String, "beijing")
        let recheck = app.buttons["Recheck goal and read (keep draft)"]; reveal(recheck); recheck.tap()
        let notice = app.staticTexts["assistant.intake.correction.notice"]; reveal(notice, down: true)
        XCTAssertTrue(notice.label.contains("prior Memory references were cleared"))
        fill("assistant.intake.city", "shanghai"); confirm(); await currentStatus("transport screening")
        let capture = XCTAttachment(screenshot: app.screenshot()); capture.name = "REAL-AUTH-intake-CAS-recovered-current"; capture.lifetime = .keepAlways; add(capture)
        app.buttons["Done"].tap(); _ = try await control("armRead"); openEditor()
        for _ in 0..<100 { if try await control()["held"] == 1 { break }; try await Task.sleep(for: .milliseconds(50)) }
        let held = try await control(); XCTAssertEqual(held["held"], 1)
        let done = app.buttons["Done"]; XCTAssertTrue(done.exists, "Held-read modal must exist before replacement")
        let beforeReplacement = try await control()
        _ = try await control("replaceSession")
        app.buttons["assistant.intake.refresh"].tap()
        await fulfillment(of: [expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: done)], timeout: 20)
        let replaced = try await control(); XCTAssertGreaterThan(replaced["nativeDenied401"] ?? 0, beforeReplacement["nativeDenied401"] ?? 0)
        _ = try await control("release")
        XCTAssertFalse(status.exists, "Late old-session response cannot restore the editor")
        login(); openEditor(); await currentStatus("transport screening")
        XCTAssertTrue(done.exists)
        _ = try await control("withdraw")
        app.buttons["assistant.intake.refresh"].tap()
        await fulfillment(of: [expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: done)], timeout: 20)
        XCTAssertFalse(status.exists); XCTAssertFalse(city.exists)
        let counts = try await control(); XCTAssertGreaterThanOrEqual(counts["denied401"] ?? 0, 1); XCTAssertGreaterThanOrEqual(counts["denied403"] ?? 0, 1)
        XCTAssertEqual(counts["rivalWrites"], 1); XCTAssertEqual(counts["withdrawals"], 1); XCTAssertEqual(counts["sessionReplacements"], 1)
    }
    @MainActor func testRealRequestBoundaryGuardsOnly() async throws {
        let env = ProcessInfo.processInfo.environment
        guard env["VP_NATIVE_TRAVEL_INTAKE_GUARDS"] == "1" else { throw XCTSkip("UNRUN: owned real guard-only Auth fixture required") }
        continueAfterFailure = false
        let app = XCUIApplication(), emailValue = try XCTUnwrap(env["VP_NATIVE_TEXT_UI_EN_EMAIL"])
        let controlURL = try XCTUnwrap(URL(string: env["VP_NATIVE_INTAKE_CONTROL"] ?? ""))
        func control(_ op: String? = nil) async throws -> [String: Int] {
            var req = URLRequest(url: controlURL)
            if let op { req.httpMethod = "POST"; req.httpBody = try JSONSerialization.data(withJSONObject: [op: true]) }
            let (bytes, response) = try await URLSession.shared.data(for: req)
            XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
            return try XCTUnwrap(JSONSerialization.jsonObject(with: bytes) as? [String: Int])
        }
        app.launchArguments = ["-VisePandaNativeAPI", try XCTUnwrap(env["VP_NATIVE_TEXT_API_URL"]), "-VisePandaAssistantConversation", "-VisePandaIntakeAuthTrace", "-VisePandaLocale", "en", "-AppleLanguages", "(en)"]
        app.launch()
        func login() {
            app.tabBars.buttons["Profile"].tap()
            if app.buttons["Sign out"].waitForExistence(timeout: 2) { app.buttons["Sign out"].tap() }
            let email = app.textFields["native.login.email"]; XCTAssertTrue(email.waitForExistence(timeout: 15)); email.tap()
            let old = email.value as? String ?? ""
            if old != email.placeholderValue { email.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: old.count)) }
            email.typeText(emailValue); XCTAssertEqual(email.value as? String, emailValue)
            app.secureTextFields["native.login.password"].tap(); app.secureTextFields["native.login.password"].typeText("VPJ07-Local-Synthetic-Only-195!")
            app.buttons["native.login.submit"].tap()
        }
        let open = app.buttons["assistant.intake.open"], done = app.buttons["Done"], status = app.staticTexts["assistant.intake.status"]
        func openEditor() {
            if !open.waitForExistence(timeout: 3), app.tabBars.buttons["Ask"].exists { app.tabBars.buttons["Ask"].tap() }
            XCTAssertTrue(open.waitForExistence(timeout: 20))
            for _ in 0..<8 where !open.isHittable { app.swipeUp() }; XCTAssertTrue(open.isHittable); open.tap()
            XCTAssertTrue(done.waitForExistence(timeout: 5))
        }
        login(); openEditor(); XCTAssertTrue(status.waitForExistence(timeout: 20)); XCTAssertTrue(status.label.contains("transport screening"))
        done.tap(); _ = try await control("armRead"); openEditor()
        for _ in 0..<100 { if try await control()["held"] == 1 { break }; try await Task.sleep(for: .milliseconds(50)) }
        let before = try await control(); XCTAssertEqual(before["held"], 1); XCTAssertTrue(done.exists)
        _ = try await control("replaceSession"); app.buttons["assistant.intake.refresh"].tap()
        await fulfillment(of: [expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: done)], timeout: 20)
        let invalid = try await control(); XCTAssertGreaterThan(invalid["nativeDenied401"] ?? 0, before["nativeDenied401"] ?? 0)
        _ = try await control("release"); XCTAssertFalse(status.exists); XCTAssertFalse(app.textFields["assistant.intake.city"].exists)
        login(); openEditor(); XCTAssertTrue(status.waitForExistence(timeout: 20)); XCTAssertTrue(status.label.contains("transport screening"))
        XCTAssertTrue(done.exists); _ = try await control("withdraw"); app.buttons["assistant.intake.refresh"].tap()
        await fulfillment(of: [expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: done)], timeout: 20)
        XCTAssertFalse(status.exists); XCTAssertFalse(app.textFields["assistant.intake.city"].exists)
        let final = try await control(); XCTAssertEqual(final["withdrawals"], 1); XCTAssertGreaterThanOrEqual(final["denied403"] ?? 0, 2)
        let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "REAL-AUTH-request-boundary-cleared"; screenshot.lifetime = .keepAlways; add(screenshot)
    }
    @MainActor func testInjectedConventionalBudgetSubmission() async throws {
        guard ProcessInfo.processInfo.environment["VP_NATIVE_INTAKE_INJECTED"] == "1" else { throw XCTSkip("UNRUN: local injected budget fixture required") }
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-VisePandaNativeAPI", "http://127.0.0.1:63251", "-VisePandaAssistantConversation", "-VisePandaTravelIntakeInjected", "-VisePandaLocale", "en", "-AppleLanguages", "(en)"]
        app.launch(); let open = app.buttons["intake.injected.open"]
        if !open.waitForExistence(timeout: 3), app.tabBars.buttons["Ask"].exists { app.tabBars.buttons["Ask"].tap() }
        XCTAssertTrue(open.waitForExistence(timeout: 10)); open.tap()
        let budget = app.textFields["assistant.intake.budget"], review = app.buttons["assistant.intake.review"]
        func reveal(_ e: XCUIElement, down: Bool = false) {
            for _ in 0..<12 where !e.isHittable { if down { app.swipeDown() } else { app.swipeUp() } }; XCTAssertTrue(e.isHittable)
        }
        reveal(budget); budget.tap(); budget.typeText("450.001"); app.buttons["Hide keyboard"].tap()
        reveal(review); XCTAssertFalse(review.isEnabled, "A third decimal digit is rejected, not rounded")
        let clear = app.buttons["assistant.intake.budget.clear"]; reveal(clear, down: true); clear.tap()
        budget.tap(); budget.typeText("450.00"); app.buttons["Hide keyboard"].tap()
        reveal(review); XCTAssertTrue(review.isEnabled); review.tap()
        XCTAssertTrue(app.buttons["assistant.intake.submit"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "CNY 450.00 /night")).firstMatch.exists)
        let capture = XCTAttachment(screenshot: app.screenshot()); capture.name = "LOCAL-INJECTED-conventional-budget-confirmation"; capture.lifetime = .keepAlways; add(capture)
        app.buttons["assistant.intake.submit"].tap(); reveal(budget)
        await fulfillment(of: [expectation(for: NSPredicate(format: "value == %@", "450.00"), evaluatedWith: budget)], timeout: 10)
        app.buttons["intake.injected.cancel"].tap()
        XCTAssertTrue(app.staticTexts["intake.injected.counts"].label.contains("writes=1 revision=2"))
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
        replace("assistant.intake.budget", "450.00", down: true); reveal(review); XCTAssertTrue(review.isEnabled); review.tap()
        XCTAssertTrue(app.buttons["assistant.intake.submit"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "450.00")).firstMatch.exists)
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

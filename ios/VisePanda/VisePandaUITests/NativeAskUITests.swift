import XCTest

nonisolated final class NativeAskUITests: XCTestCase {
    @MainActor func testEnglishAssistantTripPrivacyPagination() throws {
        let environment = ProcessInfo.processInfo.environment
        guard environment["VP_NATIVE_ASSISTANT_PRIVACY_PAGINATION"] == "1" else { throw XCTSkip("UNRUN: disposable 101-link privacy fixture required") }
        continueAfterFailure = false
        let api = try XCTUnwrap(environment["VP_NATIVE_TEXT_API_URL"])
        let email = try XCTUnwrap(environment["VP_NATIVE_TEXT_UI_EN_EMAIL"])
        let marker = try XCTUnwrap(environment["VP_NATIVE_ASSISTANT_LAST_GOAL"])
        let app = XCUIApplication()
        app.launchArguments = ["-VisePandaNativeAPI", api, "-VisePandaAssistantConversation", "-VisePandaLocale", "en", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        app.tabBars.buttons["Profile"].tap()
        let signOut = app.buttons["Sign out"]
        if signOut.waitForExistence(timeout: 2) { reveal(signOut, app); signOut.tap() }
        let emailField = app.textFields["native.login.email"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 15)); reveal(emailField, app); emailField.tap(); emailField.typeText(email)
        let password = app.secureTextFields["native.login.password"]
        reveal(password, app); password.tap(); password.typeText("VPJ07-Local-Synthetic-Only-195!")
        let login = app.buttons["native.login.submit"]; reveal(login, app); login.tap()
        expectation(for: NSPredicate(format: "label == %@", "Session active"), evaluatedWith: app.staticTexts["native.session.status"])
        waitForExpectations(timeout: 30)
        app.tabBars.buttons["Ask"].tap()
        XCTAssertTrue(app.staticTexts["assistant.consent.withdrawn"].waitForExistence(timeout: 20))
        XCTAssertFalse(app.switches["assistant.agree"].exists)
        let more = app.buttons["assistant.trip.privacy-more"]
        XCTAssertTrue(more.waitForExistence(timeout: 20))
        func revealFar(_ element: XCUIElement) {
            for _ in 0..<80 where !element.isHittable { app.swipeUp() }
            XCTAssertTrue(element.isHittable)
        }
        revealFar(more); more.tap()
        XCTAssertTrue(more.waitForExistence(timeout: 10), "A second page must expose the third-page cursor")
        revealFar(more); more.tap()
        let unlink = app.buttons["assistant.trip.privacy-unlink.\(marker)"]
        XCTAssertTrue(unlink.waitForExistence(timeout: 15), "The 101st link must be reachable after two page advances")
        revealFar(unlink)
        capture("Assistant-goal-Trip-privacy-page-101-en", app)
        unlink.tap()
        let confirm = app.buttons["Confirm privacy unlink"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 10)); confirm.tap()
        XCTAssertTrue(app.staticTexts["assistant.consent.withdrawn"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.switches["assistant.agree"].exists)
        XCTAssertTrue(more.waitForExistence(timeout: 15))
        revealFar(more); more.tap()
        XCTAssertFalse(more.exists, "100 remaining links fit exactly in two complete pages")
        XCTAssertFalse(unlink.exists, "The far-page link was removed without reviving consent")
    }

    @MainActor func testEnglishAssistantGoalTripLinkReadback() throws {
        let environment = ProcessInfo.processInfo.environment
        guard environment["VP_NATIVE_ASSISTANT_TRIP_TEST"] == "1" else { throw XCTSkip("UNRUN: disposable goal Trip fixture required") }
        continueAfterFailure = false
        let api = try XCTUnwrap(environment["VP_NATIVE_TEXT_API_URL"])
        let email = try XCTUnwrap(environment["VP_NATIVE_TEXT_UI_EN_EMAIL"])
        let tripA = try XCTUnwrap(environment["VP_NATIVE_ASSISTANT_TRIP_A"])
        let tripB = try XCTUnwrap(environment["VP_NATIVE_ASSISTANT_TRIP_B"])
        let app = XCUIApplication()
        app.launchArguments = ["-VisePandaNativeAPI", api, "-VisePandaAssistantConversation", "-VisePandaLocale", "en", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        app.tabBars.buttons["Profile"].tap()
        let signOut = app.buttons["Sign out"]
        if signOut.waitForExistence(timeout: 2) { reveal(signOut, app); signOut.tap() }
        let emailField = app.textFields["native.login.email"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 15)); reveal(emailField, app); emailField.tap(); emailField.typeText(email)
        let password = app.secureTextFields["native.login.password"]
        reveal(password, app); password.tap(); password.typeText("VPJ07-Local-Synthetic-Only-195!")
        let login = app.buttons["native.login.submit"]; reveal(login, app); login.tap()
        expectation(for: NSPredicate(format: "label == %@", "Session active"), evaluatedWith: app.staticTexts["native.session.status"])
        waitForExpectations(timeout: 30)
        app.tabBars.buttons["Ask"].tap()
        let agree = app.switches["assistant.agree"]
        XCTAssertTrue(agree.waitForExistence(timeout: 20)); reveal(agree, app); agree.tap()
        app.buttons["assistant.accept"].tap()
        let composer = app.descendants(matching: .any).matching(identifier: "assistant.composer").firstMatch
        XCTAssertTrue(composer.waitForExistence(timeout: 20))
        app.buttons["assistant.operation"].tap(); app.buttons["Start goal"].tap()
        reveal(composer, app); composer.tap(); composer.typeText("Plan a rail journey before dates are known")
        app.buttons["assistant.send"].tap()
        let goal = app.staticTexts["assistant.current-goal"]
        XCTAssertTrue(goal.waitForExistence(timeout: 20)); XCTAssertTrue(goal.label.contains("Current goal v1"))
        let choose = app.buttons["assistant.trip.choose"]
        XCTAssertTrue(choose.waitForExistence(timeout: 20)); reveal(choose, app); choose.tap()
        let first = app.buttons["assistant.trip.select.\(tripA)"]
        XCTAssertTrue(first.waitForExistence(timeout: 15)); first.tap()
        let confirm = app.buttons["Confirm link"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 10)); confirm.tap()
        let linked = app.staticTexts["assistant.trip.linked"]
        expectation(for: NSPredicate(format: "label CONTAINS %@", "Synthetic Goal Trip A"), evaluatedWith: linked)
        waitForExpectations(timeout: 20)
        XCTAssertTrue(goal.label.contains("Current goal v2"))
        app.terminate(); app.launch(); app.tabBars.buttons["Ask"].tap()
        XCTAssertTrue(linked.waitForExistence(timeout: 30)); XCTAssertTrue(linked.label.contains("Synthetic Goal Trip A"))
        XCTAssertTrue(goal.label.contains("Current goal v2"))
        XCTAssertTrue(composer.exists)
        capture("Assistant-goal-existing-Trip-reload-en", app)
        let change = app.buttons["assistant.trip.choose"]; reveal(change, app); change.tap()
        let second = app.buttons["assistant.trip.select.\(tripB)"]
        XCTAssertTrue(second.waitForExistence(timeout: 15)); second.tap()
        XCTAssertTrue(confirm.waitForExistence(timeout: 10)); confirm.tap()
        expectation(for: NSPredicate(format: "label CONTAINS %@", "Synthetic Goal Trip B"), evaluatedWith: linked)
        waitForExpectations(timeout: 20)
        XCTAssertTrue(goal.label.contains("Current goal v3"))
        app.buttons["assistant.trip.unlink"].tap()
        let confirmUnlink = app.buttons["Confirm unlink"]
        XCTAssertTrue(confirmUnlink.waitForExistence(timeout: 10)); confirmUnlink.tap()
        XCTAssertTrue(app.staticTexts["assistant.trip.unlinked"].waitForExistence(timeout: 20))
        XCTAssertTrue(goal.label.contains("Current goal v4"))
        capture("Assistant-goal-Trip-unlinked-en", app)
        choose.tap()
        XCTAssertTrue(first.waitForExistence(timeout: 15)); first.tap()
        XCTAssertTrue(confirm.waitForExistence(timeout: 10)); confirm.tap()
        expectation(for: NSPredicate(format: "label CONTAINS %@", "Synthetic Goal Trip A"), evaluatedWith: linked)
        waitForExpectations(timeout: 20)
        app.buttons["Withdraw text consent"].tap()
        let privacyUnlink = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "assistant.trip.privacy-unlink.")).firstMatch
        XCTAssertTrue(privacyUnlink.waitForExistence(timeout: 20), "A withdrawn account must still reach unlink")
        XCTAssertFalse(goal.exists, "Withdrawing text consent hides the goal body")
        XCTAssertTrue(app.staticTexts["assistant.consent.withdrawn"].exists)
        XCTAssertFalse(app.switches["assistant.agree"].exists, "A withdrawn policy cannot be silently reaccepted")
        capture("Assistant-goal-Trip-privacy-control-en", app)
        privacyUnlink.tap()
        let confirmPrivacy = app.buttons["Confirm privacy unlink"]
        XCTAssertTrue(confirmPrivacy.waitForExistence(timeout: 10)); confirmPrivacy.tap()
        XCTAssertFalse(privacyUnlink.waitForExistence(timeout: 5), "The owner privacy list no longer contains the detached Trip")
        app.tabBars.buttons["Ask"].tap()
        XCTAssertTrue(app.staticTexts["assistant.consent.withdrawn"].waitForExistence(timeout: 10),
                      "The revoked state remains readable after unlink")
        capture("Assistant-goal-Trip-privacy-unlinked-en", app)
    }

    @MainActor func testEnglishAssistantConversationSelection() throws {
        let environment = ProcessInfo.processInfo.environment
        guard environment["VP_NATIVE_ASSISTANT_CONVERSATION_SELECTION"] == "1" else {
            throw XCTSkip("UNRUN: disposable two-conversation environment required")
        }
        continueAfterFailure = false
        let api = try XCTUnwrap(environment["VP_NATIVE_TEXT_API_URL"])
        let email = try XCTUnwrap(environment["VP_NATIVE_TEXT_UI_EN_EMAIL"])
        let first = try XCTUnwrap(environment["VP_NATIVE_ASSISTANT_CONVERSATION_FIRST"])
        let second = try XCTUnwrap(environment["VP_NATIVE_ASSISTANT_CONVERSATION_SECOND"])
        let app = XCUIApplication()
        app.launchArguments = ["-VisePandaNativeAPI", api, "-VisePandaAssistantConversation", "-VisePandaLocale", "en", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        app.tabBars.buttons["Profile"].tap()
        let signOut = app.buttons["Sign out"]
        if signOut.waitForExistence(timeout: 2) { reveal(signOut, app); signOut.tap() }
        let emailField = app.textFields["native.login.email"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 15)); reveal(emailField, app); emailField.tap(); emailField.typeText(email)
        let password = app.secureTextFields["native.login.password"]
        reveal(password, app); password.tap(); password.typeText("VPJ07-Local-Synthetic-Only-195!")
        let login = app.buttons["native.login.submit"]; reveal(login, app); login.tap()
        // Session activation restores the default Ask tab; the selected read proves login completed.
        let selected = app.staticTexts["assistant.conversation.selected"]
        XCTAssertTrue(selected.waitForExistence(timeout: 20))
        expectation(for: NSPredicate(format: "label == %@", "Synthetic latest conversation"), evaluatedWith: selected)
        waitForExpectations(timeout: 20)
        let composer = app.descendants(matching: .any).matching(identifier: "assistant.composer").firstMatch
        reveal(composer, app); composer.tap(); composer.typeText("Unsent latest draft")
        let choose = app.buttons["assistant.conversation.choose"]
        reveal(choose, app); choose.tap()
        app.buttons["assistant.conversation.select.\(first)"].tap()
        expectation(for: NSPredicate(format: "label == %@", "Synthetic earlier conversation"), evaluatedWith: selected)
        waitForExpectations(timeout: 20)
        XCTAssertFalse(String(describing: composer.value).contains("Unsent latest draft"))
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label == %@", "Synthetic latest conversation")).firstMatch.exists)
        let send = app.buttons["assistant.send"]
        app.buttons["assistant.operation"].tap(); app.buttons["Start goal"].tap()
        reveal(composer, app); composer.tap(); composer.typeText("Synthetic selected conversation continuation")
        expectation(for: NSPredicate(format: "enabled == true"), evaluatedWith: send); waitForExpectations(timeout: 20)
        send.tap()
        let message = app.staticTexts["assistant.message.2"]
        XCTAssertTrue(message.waitForExistence(timeout: 20)); XCTAssertEqual(message.label, "Synthetic selected conversation continuation")
        capture("Assistant-earlier-selected-send-en", app)
        let latest = app.buttons["assistant.conversation.latest"]; reveal(latest, app); latest.tap()
        expectation(for: NSPredicate(format: "label == %@", "Synthetic latest conversation"), evaluatedWith: selected)
        waitForExpectations(timeout: 20)
        XCTAssertFalse(message.exists)
        choose.tap(); app.buttons["assistant.conversation.select.\(second)"].tap()
        app.terminate(); app.launch(); app.tabBars.buttons["Ask"].tap()
        XCTAssertTrue(selected.waitForExistence(timeout: 20))
        expectation(for: NSPredicate(format: "label == %@", "Synthetic latest conversation"), evaluatedWith: selected)
        waitForExpectations(timeout: 20)
        capture("Assistant-return-latest-relaunch-en", app)
    }

    @MainActor func testEnglishAssistantConversationReadback() throws {
        let environment = ProcessInfo.processInfo.environment
        guard environment["VP_NATIVE_ASSISTANT_TEST"] == "1" else { throw XCTSkip("UNRUN: disposable assistant v5 environment required") }
        continueAfterFailure = false
        let api = try XCTUnwrap(environment["VP_NATIVE_TEXT_API_URL"])
        let email = try XCTUnwrap(environment["VP_NATIVE_TEXT_UI_EN_EMAIL"])
        let app = XCUIApplication()
        app.launchArguments = ["-VisePandaNativeAPI", api, "-VisePandaAssistantConversation", "-VisePandaLocale", "en", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        app.tabBars.buttons["Profile"].tap()
        let signOut = app.buttons["Sign out"]
        if signOut.waitForExistence(timeout: 2) { reveal(signOut, app); signOut.tap() }
        let emailField = app.textFields["native.login.email"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 15)); reveal(emailField, app); emailField.tap(); emailField.typeText(email)
        let password = app.secureTextFields["native.login.password"]
        reveal(password, app); password.tap(); password.typeText("VPJ07-Local-Synthetic-Only-195!")
        let login = app.buttons["native.login.submit"]; reveal(login, app); login.tap()
        expectation(for: NSPredicate(format: "label == %@", "Session active"), evaluatedWith: app.staticTexts["native.session.status"])
        waitForExpectations(timeout: 30)
        app.tabBars.buttons["Ask"].tap()
        let agree = app.switches["assistant.agree"]
        XCTAssertTrue(agree.waitForExistence(timeout: 20)); reveal(agree, app); agree.tap()
        app.buttons["assistant.accept"].tap()
        let composer = app.descendants(matching: .any).matching(identifier: "assistant.composer").firstMatch
        XCTAssertTrue(composer.waitForExistence(timeout: 20)); reveal(composer, app); composer.tap()
        composer.typeText("Synthetic assistant v5 question")
        app.buttons["assistant.send"].tap()
        let answer = app.staticTexts["assistant.answer.1"]
        XCTAssertTrue(answer.waitForExistence(timeout: 30)); XCTAssertEqual(answer.label, "Local synthetic answer: request completed.")
        app.buttons["assistant.operation"].tap()
        app.buttons["Start goal"].tap()
        reveal(composer, app); composer.tap(); composer.typeText("Plan China before dates are known")
        app.buttons["assistant.send"].tap()
        let goal = app.staticTexts["assistant.current-goal"]
        XCTAssertTrue(goal.waitForExistence(timeout: 20)); XCTAssertTrue(goal.label.contains("Current goal v1"))
        app.buttons["assistant.operation"].tap()
        app.buttons["Change goal"].tap()
        reveal(composer, app); composer.tap(); composer.typeText("Prefer rail and fewer transfers")
        app.buttons["assistant.send"].tap()
        expectation(for: NSPredicate(format: "label CONTAINS %@", "Current goal v2"), evaluatedWith: goal)
        waitForExpectations(timeout: 20)
        app.terminate(); app.launch()
        app.tabBars.buttons["Ask"].tap()
        XCTAssertTrue(answer.waitForExistence(timeout: 30))
        XCTAssertTrue(goal.waitForExistence(timeout: 30)); XCTAssertTrue(goal.label.contains("Current goal v2"))
        XCTAssertTrue(composer.exists, "The composer remains available after durable readback")
        capture("Assistant-v5-question-goal-amendment-readback-en", app)
    }

    @MainActor func testEnglishConsentSendAndRelaunch() throws { try exercise(locale: "en", userKey: "VP_NATIVE_TEXT_UI_EN_EMAIL") }
    @MainActor func testChineseConsentSendAndRelaunch() throws { try exercise(locale: "zh-Hans", userKey: "VP_NATIVE_TEXT_UI_ZH_EMAIL") }

    @MainActor func testEnglishTaskClarificationAndRelaunch() throws { try exercise(locale: "en", userKey: "VP_NATIVE_TEXT_UI_EN_EMAIL", taskContext: true) }
    @MainActor func testChineseTaskClarificationAndRelaunch() throws { try exercise(locale: "zh-Hans", userKey: "VP_NATIVE_TEXT_UI_ZH_EMAIL", taskContext: true) }

    @MainActor func testEnglishGroundedAnswerAndRelaunch() throws { try exercise(locale: "en", userKey: "VP_NATIVE_TEXT_UI_EN_EMAIL", grounded: true) }
    @MainActor func testChineseGroundedAnswerAndRelaunch() throws { try exercise(locale: "zh-Hans", userKey: "VP_NATIVE_TEXT_UI_ZH_EMAIL", grounded: true) }
    @MainActor func testEnglishGroundedBackgroundNetworkReconnect() async throws {
        try await exerciseBackgroundReconnect()
    }

    @MainActor private func exerciseBackgroundReconnect() async throws {
        let environment = ProcessInfo.processInfo.environment
        guard environment["VP_NATIVE_GROUNDED_TEST"] == "1" else { throw XCTSkip("UNRUN: disposable grounded environment required") }
        continueAfterFailure = false
        let api = try XCTUnwrap(environment["VP_NATIVE_TEXT_API_URL"])
        let control = try XCTUnwrap(environment["VP_NATIVE_GROUNDED_READ_CONTROL_URL"])
        let model = try XCTUnwrap(environment["VP_NATIVE_TEXT_CONTROL_URL"])
        let app = XCUIApplication()
        app.launchArguments = ["-VisePandaNativeAPI", api, "-VisePandaGroundedMode", "-VisePandaLocale", "en", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        defer { setReadGate("resume-events", url: control) }
        app.tabBars.buttons["Profile"].tap()
        let signOut = app.buttons["Sign out"]
        if signOut.waitForExistence(timeout: 2) { reveal(signOut, app); signOut.tap() }
        let email = app.textFields["native.login.email"]
        XCTAssertTrue(email.waitForExistence(timeout: 15)); reveal(email, app); email.tap()
        email.typeText(try XCTUnwrap(environment["VP_NATIVE_TEXT_UI_RECONNECT_EMAIL"]))
        let password = app.secureTextFields["native.login.password"]
        reveal(password, app); password.tap(); password.typeText("VPJ07-Local-Synthetic-Only-195!")
        let login = app.buttons["native.login.submit"]; reveal(login, app); login.tap()
        let active = expectation(for: NSPredicate(format: "label == %@", "Session active"), evaluatedWith: app.staticTexts["native.session.status"])
        await fulfillment(of: [active], timeout: 30)
        app.tabBars.buttons["Ask"].tap()
        let agree = app.switches["native-ask.agree"]
        XCTAssertTrue(agree.waitForExistence(timeout: 20)); reveal(agree, app); agree.tap()
        let accept = app.buttons["native-ask.accept"]; reveal(accept, app); accept.tap()
        let input = app.descendants(matching: .any).matching(identifier: "native-ask.input").firstMatch
        XCTAssertTrue(input.waitForExistence(timeout: 20)); reveal(input, app); input.tap()
        input.typeText("Synthetic HOLD native stream document question")
        app.buttons["native-ask.send"].tap()
        let cancel = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "native-ask.cancel.")).firstMatch
        XCTAssertTrue(cancel.waitForExistence(timeout: 20))
        let turnId = String(cancel.identifier.dropFirst("native-ask.cancel.".count))
        let pendingURL = try XCTUnwrap(URL(string: model)?.deletingLastPathComponent().appendingPathComponent("pending"))
        var pending = false
        for _ in 0..<50 {
            let (data, _) = try await URLSession.shared.data(from: pendingURL)
            pending = ((try JSONSerialization.jsonObject(with: data) as? [String: Int])?["count"] ?? 0) == 1
            if pending { break }
            try await Task.sleep(for: .milliseconds(100))
        }
        XCTAssertTrue(pending, "The accepted task must be held inside the model attempt")
        let observationURL = try XCTUnwrap(URL(string: control)?.deletingLastPathComponent().appendingPathComponent("__event-observation"))
        var initialSeen = false
        for _ in 0..<30 {
            let (data, _) = try await URLSession.shared.data(from: observationURL)
            let requests = (try JSONSerialization.jsonObject(with: data) as? [String: Any])?["requests"] as? [[String: String]] ?? []
            initialSeen = requests.contains { $0["turnId"] == turnId && $0["cursor"] == "0" }
            if initialSeen { break }
            try await Task.sleep(for: .milliseconds(100))
        }
        XCTAssertTrue(initialSeen)
        try await Task.sleep(for: .milliseconds(500))
        setReadGate("drop-events", url: control)
        XCUIDevice.shared.press(.home)
        setReadGate("resume-events", url: control)
        app.activate()
        var resumed = false
        for _ in 0..<100 {
            let (data, _) = try await URLSession.shared.data(from: observationURL)
            let requests = (try JSONSerialization.jsonObject(with: data) as? [String: Any])?["requests"] as? [[String: String]] ?? []
            resumed = requests.contains { $0["turnId"] == turnId && ($0["cursor"] ?? "0") != "0" }
            if resumed { break }
            try await Task.sleep(for: .milliseconds(100))
        }
        XCTAssertTrue(resumed, "Foreground must reconnect the same Turn from its acknowledged cursor")
        _ = try await URLSession.shared.data(from: try XCTUnwrap(URL(string: model)))
        let answer = app.staticTexts.matching(NSPredicate(format: "identifier BEGINSWITH %@", "knowledge.note.")).firstMatch
        XCTAssertTrue(answer.waitForExistence(timeout: 30)); reveal(answer, app)
        XCTAssertTrue(answer.label.contains("Synthetic reviewed"))
        XCTAssertTrue(app.staticTexts["Synthetic HOLD native stream document question"].exists)
        XCTAssertFalse(app.buttons["native-ask.cancel.\(turnId)"].exists)
        capture("Grounded-background-reconnect-en", app)
    }

    @MainActor func testEnglishMessageOpensOutlineAndReturnsToInput() throws { try exercise(locale: "en", userKey: "VP_NATIVE_TEXT_UI_EN_EMAIL", planning: true) }
    @MainActor func testChineseMessageOpensOutlineAndReturnsToInput() throws { try exercise(locale: "zh-Hans", userKey: "VP_NATIVE_TEXT_UI_ZH_EMAIL", planning: true) }
    @MainActor func testEnglishGroundedMessageOpensOutlineAndReturnsToInput() throws { try exercise(locale: "en", userKey: "VP_NATIVE_TEXT_UI_EN_EMAIL", grounded: true, planning: true) }
    @MainActor func testChineseGroundedMessageOpensOutlineAndReturnsToInput() throws { try exercise(locale: "zh-Hans", userKey: "VP_NATIVE_TEXT_UI_ZH_EMAIL", grounded: true, planning: true) }

    @MainActor private func exercise(locale: String, userKey: String, taskContext: Bool = false, grounded: Bool = false, planning: Bool = false) throws {
        let environment = ProcessInfo.processInfo.environment
        guard environment["VP_NATIVE_TEXT_TEST"] == "1" else { throw XCTSkip("UNRUN: explicit local native text UI environment is not configured") }
        if grounded && environment["VP_NATIVE_GROUNDED_TEST"] != "1" { throw XCTSkip("UNRUN: grounded native fixture not configured") }
        continueAfterFailure = false
        let api = try XCTUnwrap(environment["VP_NATIVE_TEXT_API_URL"])
        let email = try XCTUnwrap(environment[userKey])
        let chinese = locale == "zh-Hans"
        let app = XCUIApplication()
        app.launchArguments = ["-VisePandaNativeAPI", api, "-VisePandaLocale", locale, "-AppleLanguages", "(\(locale))", "-AppleLocale", chinese ? "zh_CN" : "en_US"]
        if grounded { app.launchArguments += ["-VisePandaGroundedMode"] }
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
        expectation(for: NSPredicate(format: "label == %@", chinese ? "会话有效" : "Session active"), evaluatedWith: app.staticTexts["native.session.status"])
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
        if planning {
            let request = chinese ? "第一次去上海四天，喜欢吃和散步，日期未定" : "First time in Shanghai for four days, food and walks, dates unknown"
            input.typeText(request)
            let plan = app.buttons["native-ask.plan"]
            XCTAssertTrue(plan.waitForExistence(timeout: 5)); reveal(plan, app); plan.tap()
            let day = app.descendants(matching: .any).matching(identifier: "trip.outline.day.1").firstMatch
            XCTAssertTrue(day.waitForExistence(timeout: 15), "The original input must generate an outline without retyping or choosing a Trip")
            XCTAssertEqual(app.keyboards.count, 0)
            let copied = app.descendants(matching: .any).matching(identifier: "trip.outline.request").firstMatch
            XCTAssertEqual(copied.value as? String, request)
            XCTAssertTrue(app.buttons["trip.outline.food"].exists)
            XCTAssertTrue(app.buttons["trip.outline.walk"].exists)
            capture("Native-Ask-outline-\(locale)", app)
            app.buttons["trip.outline.return"].tap()
            app.buttons[chinese ? "返回并放弃未提交编辑" : "Return and discard unsubmitted edits"].tap()
            XCTAssertTrue(input.waitForExistence(timeout: 10))
            XCTAssertEqual(input.value as? String, request)
            XCTAssertEqual(app.keyboards.count, 0)
            XCTAssertTrue(app.buttons["native-ask.plan"].isHittable)
            capture("Native-Ask-outline-return-\(locale)", app)
            return
        }
        input.typeText((chinese ? "中文合成请求" : "Synthetic UI request") + (taskContext ? " kind=clarification" : ""))
        let send = app.buttons["native-ask.send"]; send.tap()
        if grounded {
            let answer = app.staticTexts.matching(NSPredicate(format: "identifier BEGINSWITH %@", "knowledge.note.")).firstMatch
            XCTAssertTrue(answer.waitForExistence(timeout: 30)); reveal(answer, app)
            XCTAssertTrue(answer.label.contains(chinese ? "合成审核" : "Synthetic reviewed"))
            let identifier = answer.identifier
            capture("Grounded-answer-\(locale)", app)
            app.terminate(); app.launch()
            let restored = app.staticTexts[identifier]
            XCTAssertTrue(restored.waitForExistence(timeout: 30)); reveal(restored, app)
            XCTAssertTrue(restored.label.contains(chinese ? "合成审核" : "Synthetic reviewed"))
            XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "identifier BEGINSWITH %@", "native-ask.answer.")).firstMatch.exists)
            capture("Grounded-recovered-\(locale)", app)
            // Hold only the loopback history read across its real evidence
            // deadline. The notice must remain in the viewport while the old
            // facts are hidden, then the same answer resumes at the same offset.
            let readingY = restored.frame.minY
            let control = try XCTUnwrap(environment["VP_NATIVE_GROUNDED_READ_CONTROL_URL"])
            setReadGate("hold", url: control)
            defer { setReadGate("release", url: control) }
            let rechecking = app.staticTexts["grounded.rechecking"]
            XCTAssertTrue(rechecking.waitForExistence(timeout: 40))
            XCTAssertFalse(restored.exists)
            XCTAssertGreaterThanOrEqual(rechecking.frame.minY, 100)
            XCTAssertLessThan(rechecking.frame.maxY, app.frame.height / 2)
            XCTAssertTrue(rechecking.label.contains(chinese ? "重新核对" : "Rechecking"))
            capture("Grounded-expired-visible-notice-\(locale)", app)
            setReadGate("release", url: control)
            XCTAssertTrue(restored.waitForExistence(timeout: 10))
            XCTAssertEqual(restored.frame.minY, readingY, accuracy: 3)
            capture("Grounded-reading-refresh-\(locale)", app)
            app.tabBars.buttons[chinese ? "我的" : "Profile"].tap()
            XCTAssertFalse(app.staticTexts[identifier].exists)
            app.tabBars.buttons[chinese ? "问熊猫" : "Ask"].tap()
            XCTAssertTrue(app.staticTexts[identifier].waitForExistence(timeout: 30))
            return
        }
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
    @MainActor private func setReadGate(_ command: String, url: String) {
        let completed = expectation(description: "Local history gate \(command)")
        var request = URLRequest(url: URL(string: url)!)
        request.httpMethod = "POST"; request.httpBody = Data(command.utf8)
        URLSession.shared.dataTask(with: request) { _, response, error in
            XCTAssertNil(error)
            XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
            completed.fulfill()
        }.resume()
        wait(for: [completed], timeout: 5)
    }
    @MainActor private func reveal(_ element: XCUIElement, _ app: XCUIApplication) {
        let scroll = app.scrollViews.firstMatch
        for _ in 0..<12 where !element.isHittable {
            if scroll.exists {
                let from = scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.38))
                let to = scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.08))
                from.press(forDuration: 0.05, thenDragTo: to)
            } else { app.swipeUp() }
        }
        XCTAssertTrue(element.isHittable)
    }
    @MainActor private func capture(_ name: String, _ app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}

/// Actual application termination with the fixture running outside its process.
nonisolated final class NativeAskProcessRecoveryUITests: XCTestCase, @unchecked Sendable {
    @MainActor func testEnglishLostReceiptAcrossProcessRestart() async throws { try await exercise(drop: true, chinese: false) }
    @MainActor func testChineseAcknowledgedButHiddenHistoryAcrossProcessRestart() async throws { try await exercise(drop: false, chinese: true) }

    private func control(_ body: [String: Bool]? = nil) async throws -> Int {
        var request = URLRequest(url: URL(string: "http://127.0.0.1:59653/" + (body == nil ? "state" : "control"))!)
        if let body { request.httpMethod = "POST"; request.httpBody = try JSONEncoder().encode(body) }
        let (data, _) = try await URLSession.shared.data(for: request)
        return try XCTUnwrap((JSONSerialization.jsonObject(with: data) as? [String: Int])?["posts"])
    }
    @MainActor private func exercise(drop: Bool, chinese: Bool) async throws {
        guard ProcessInfo.processInfo.environment["VP_NATIVE_PENDING_UI_TEST"] == "1" else {
            throw XCTSkip("UNRUN: synthetic loopback process-recovery fixture is not configured")
        }
        continueAfterFailure = false
        _ = try await control(["reset": true, "drop": drop])
        let app = XCUIApplication(), locale = chinese ? "zh-Hans" : "en"
        app.launchArguments = ["-VisePandaNativeAPI", "http://127.0.0.1:59653", "-VisePandaTaskContext", "-VisePandaLocale", locale,
                               "-AppleLanguages", "(\(locale))", "-AppleLocale", chinese ? "zh_CN" : "en_US"]
        app.launch()
        app.tabBars.buttons[chinese ? "我的" : "Profile"].tap()
        let signOut = app.buttons[chinese ? "退出登录" : "Sign out"]
        if signOut.waitForExistence(timeout: 2) { signOut.tap() }
        let email = app.textFields["native.login.email"]
        XCTAssertTrue(email.waitForExistence(timeout: 10)); email.tap(); email.typeText("synthetic@example.test")
        let password = app.secureTextFields["native.login.password"]
        password.tap(); password.typeText("SyntheticOnly!")
        app.buttons["native.login.submit"].tap()
        let status = app.staticTexts["native.session.status"]
        let active = NSPredicate(format: "label == %@", chinese ? "会话有效" : "Session active")
        await fulfillment(of: [expectation(for: active, evaluatedWith: status)], timeout: 15)
        app.tabBars.buttons[chinese ? "问熊猫" : "Ask"].tap()
        let input = app.descendants(matching: .any).matching(identifier: "native-ask.input").firstMatch
        XCTAssertTrue(input.waitForExistence(timeout: 15)); input.tap(); input.typeText("Synthetic process recovery")
        app.buttons["native-ask.send"].tap()
        for _ in 0..<50 {
            if try await control() == 1 { break }
            try await Task.sleep(for: .milliseconds(100))
        }
        let postsBefore = try await control(); XCTAssertEqual(postsBefore, 1)
        if !drop {
            // Store is not busy once its first post-ack history read has completed.
            let reload = app.buttons["native-ask.reload"]
            await fulfillment(of: [expectation(for: NSPredicate(format: "enabled == true"), evaluatedWith: reload)], timeout: 10)
        }
        app.terminate(); app.launch()
        XCTAssertTrue(app.buttons["native-ask.reload"].waitForExistence(timeout: 15))
        if !drop {
            XCTAssertTrue(input.waitForExistence(timeout: 15))
            XCTAssertFalse(app.buttons["native-ask.send"].isEnabled)
            XCTAssertFalse(app.buttons["native-ask.new-question"].isEnabled)
        }
        let postsAfter = try await control(); XCTAssertEqual(postsAfter, 1)
        _ = try await control(["release": true])
        app.buttons["native-ask.reload"].tap()
        let answer = app.staticTexts.matching(NSPredicate(format: "identifier BEGINSWITH %@", "native-ask.answer.")).firstMatch
        XCTAssertTrue(answer.waitForExistence(timeout: 20))
        XCTAssertEqual(answer.label, "Synthetic recovered answer")
        let finalPosts = try await control(); XCTAssertEqual(finalPosts, 1)
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = chinese ? "pending-ack-recovered-zh" : "pending-receipt-recovered-en"
        attachment.lifetime = .keepAlways; add(attachment)
        app.tabBars.buttons[chinese ? "我的" : "Profile"].tap()
        XCTAssertTrue(signOut.waitForExistence(timeout: 10)); signOut.tap()
    }
}

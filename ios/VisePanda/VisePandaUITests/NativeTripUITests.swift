import XCTest

nonisolated final class NativeTripUITests: XCTestCase {
    @MainActor
    func testReloadSameTripAfterWebConfirmation() throws {
        guard ProcessInfo.processInfo.environment["VP_NATIVE_TRIP_TEST"] == "1",
              let tripID = ProcessInfo.processInfo.environment["VP_NATIVE_TRIP_SHARED_ID"],
              let expectedTitle = ProcessInfo.processInfo.environment["VP_NATIVE_TRIP_WEB_TITLE"] else {
            throw XCTSkip("UNRUN: browser-confirmed shared Trip is not configured")
        }
        continueAfterFailure = false
        let application = XCUIApplication()
        application.launchArguments = ["-VisePandaNativeAPI", "http://127.0.0.1:59931", "-VisePandaLocale", "en"]
        application.launch()
        application.tabBars.buttons["Trip"].tap()
        let select = application.buttons["trip.select.\(tripID)"]
        XCTAssertTrue(select.waitForExistence(timeout: 30))
        reveal(select, application); select.tap()
        let title = application.staticTexts["trip.confirmed.title"]
        XCTAssertTrue(title.waitForExistence(timeout: 20))
        XCTAssertEqual(title.label, expectedTitle)
        XCTAssertEqual(application.staticTexts["trip.selected.id"].label, tripID)
        if let itemTitle = ProcessInfo.processInfo.environment["VP_NATIVE_TRIP_WEB_ITEM_TITLE"] {
            let item = application.staticTexts.matching(NSPredicate(format: "identifier BEGINSWITH %@", "trip.confirmed.item.")).firstMatch
            XCTAssertTrue(item.waitForExistence(timeout: 20))
            XCTAssertEqual(item.label, itemTitle)
        }
        if let day = ProcessInfo.processInfo.environment["VP_NATIVE_TRIP_WEB_DAY"] { XCTAssertTrue(application.staticTexts[day].exists) }
        if let version = ProcessInfo.processInfo.environment["VP_NATIVE_TRIP_WEB_VERSION"] {
            XCTAssertEqual(application.staticTexts["trip.confirmed.version"].label, "Confirmed version \(version)")
        }
        positionNearTop(application.staticTexts["trip.confirmed.version"], application)
        capture("Native-Trip-after-real-Web-confirmation", application)
    }

    @MainActor
    func testRealLocalTripDraftReviewConfirmAndRelaunch() throws {
        guard ProcessInfo.processInfo.environment["VP_NATIVE_TRIP_TEST"] == "1" else {
            throw XCTSkip("UNRUN: explicit local synthetic Trip environment is not configured")
        }
        continueAfterFailure = false
        let email = try XCTUnwrap(ProcessInfo.processInfo.environment["VP_NATIVE_TRIP_EMAIL"])
        let password = try XCTUnwrap(ProcessInfo.processInfo.environment["VP_NATIVE_TRIP_PASSWORD"])
        let locale = ProcessInfo.processInfo.environment["VP_NATIVE_TRIP_LOCALE"] ?? "en"
        let chinese = locale == "zh-Hans"
        let application = XCUIApplication()
        // Actual Simulator content size is set by the runner, not an app override.
        application.launchArguments = ["-VisePandaNativeAPI", "http://127.0.0.1:59931", "-VisePandaLocale", locale,
                                       "-AppleLanguages", "(\(locale))", "-AppleLocale", chinese ? "zh_CN" : "en_US"]
        application.launch()
        application.tabBars.buttons[chinese ? "我的" : "Profile"].tap()
        let signOut = application.buttons[chinese ? "退出登录" : "Sign out"]
        if signOut.waitForExistence(timeout: 3) { reveal(signOut, application); signOut.tap() }
        let emailField = application.textFields["native.login.email"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 15))
        reveal(emailField, application)
        emailField.tap(); emailField.typeText(email)
        let passwordField = application.secureTextFields["native.login.password"]
        reveal(passwordField, application)
        passwordField.tap(); passwordField.typeText(password)
        let login = application.buttons["native.login.submit"]
        reveal(login, application); login.tap()
        let active = NSPredicate(format: "label == %@", chinese ? "会话有效" : "Session active")
        expectation(for: active, evaluatedWith: application.staticTexts["native.session.status"])
        waitForExpectations(timeout: 30)
        application.tabBars.buttons[chinese ? "行程" : "Trip"].tap()

        let title = "iOS UI \(locale) \(UUID().uuidString.prefix(6))"
        let titleField = element("trip.create.title", application)
        XCTAssertTrue(titleField.waitForExistence(timeout: 15))
        reveal(titleField, application)
        titleField.tap(); titleField.typeText(title)
        let create = application.buttons["trip.create.submit"]
        reveal(create, application); create.tap()
        let confirmedTitle = application.staticTexts["trip.confirmed.title"]
        XCTAssertTrue(confirmedTitle.waitForExistence(timeout: 20))
        XCTAssertEqual(confirmedTitle.label, title)
        let tripID = application.staticTexts["trip.selected.id"].label
        XCTAssertNotNil(UUID(uuidString: tripID))
        print("VPJ05 actual iOS UI Trip: \(tripID), locale: \(locale)")
        let edit = application.buttons["trip.draft.begin"]
        reveal(edit, application); edit.tap()
        let addDay = application.buttons["trip.draft.addDay"]
        reveal(addDay, application); addDay.tap()
        reveal(addDay, application); addDay.tap()
        let removeDays = application.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "trip.draft.removeDay."))
        XCTAssertEqual(removeDays.count, 2)
        let removeDay = removeDays.element(boundBy: 1)
        reveal(removeDay, application); removeDay.tap()
        XCTAssertEqual(removeDays.count, 1)
        let addItem = application.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "trip.draft.addItem.")).firstMatch
        reveal(addItem, application); addItem.tap()
        reveal(addItem, application); addItem.tap()
        let removeItems = application.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "trip.draft.removeItem."))
        XCTAssertEqual(removeItems.count, 2)
        let removeItem = removeItems.element(boundBy: 1)
        reveal(removeItem, application); removeItem.tap()
        XCTAssertEqual(removeItems.count, 1)
        let item = application.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", "trip.draft.item.")).firstMatch
        reveal(item, application); item.tap()
        let itemTitle = chinese ? "合成测试：博物馆" : "Synthetic museum visit"
        item.typeText(itemTitle)
        let done = application.buttons["trip.draft.done"]
        reveal(done, application); done.tap()
        let propose = application.buttons["trip.draft.propose"]
        reveal(propose, application); propose.tap()
        let confirm = application.buttons["trip.proposal.confirm"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 20))
        XCTAssertTrue(application.staticTexts["trip.confirmed.version"].label.contains("0"))
        XCTAssertEqual(application.staticTexts.matching(NSPredicate(format: "identifier BEGINSWITH %@", "trip.confirmed.item.")).count, 0)
        reveal(confirm, application)
        capture("Native-Trip-proposal-\(locale)", application)
        confirm.tap()
        application.buttons[chinese ? "确认并保存" : "Confirm and save"].tap()
        let savedItem = application.staticTexts.matching(NSPredicate(format: "identifier BEGINSWITH %@", "trip.confirmed.item.")).firstMatch
        XCTAssertTrue(savedItem.waitForExistence(timeout: 25))
        XCTAssertEqual(savedItem.label, itemTitle)
        XCTAssertTrue(application.staticTexts["trip.confirmed.version"].label.contains("1"))
        reveal(savedItem, application)
        capture("Native-Trip-confirmed-\(locale)", application)

        application.terminate()
        application.launch()
        application.tabBars.buttons[chinese ? "行程" : "Trip"].tap()
        let selected = application.buttons["trip.select.\(tripID)"]
        XCTAssertTrue(selected.waitForExistence(timeout: 25))
        reveal(selected, application); selected.tap()
        XCTAssertTrue(savedItem.waitForExistence(timeout: 20))
        XCTAssertEqual(savedItem.label, itemTitle)
        XCTAssertEqual(application.staticTexts["trip.selected.id"].label, tripID)
        reveal(savedItem, application)
        capture("Native-Trip-reloaded-\(locale)", application)
    }

    @MainActor
    private func element(_ id: String, _ app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: id).firstMatch
    }

    @MainActor
    private func reveal(_ element: XCUIElement, _ app: XCUIApplication) {
        XCTAssertTrue(element.waitForExistence(timeout: 30))
        let enabled = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: element)
        XCTAssertEqual(XCTWaiter.wait(for: [enabled], timeout: 30), .completed, "Wait for the actual request to finish before interacting")
        for _ in 0..<16 {
            let frame = element.frame
            let top = app.navigationBars.firstMatch.frame.maxY
            let bottom = app.keyboards.firstMatch.exists ? app.keyboards.firstMatch.frame.minY : app.tabBars.firstMatch.frame.minY
            if element.isHittable && frame.minY >= top && frame.maxY <= bottom { return }
            if element.exists && frame.minY < top { app.swipeDown(velocity: .slow) }
            else { app.swipeUp(velocity: .slow) }
        }
        XCTAssertTrue(element.isHittable, "Required control must be reachable by scrolling")
    }

    @MainActor
    private func positionNearTop(_ element: XCUIElement, _ app: XCUIApplication) {
        XCTAssertTrue(element.waitForExistence(timeout: 20))
        for _ in 0..<10 {
            let distance = element.frame.minY - app.navigationBars.firstMatch.frame.maxY - 20
            if abs(distance) < 8 { break }
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.55))
            let end = start.withOffset(CGVector(dx: 0, dy: -min(max(distance, -220), 220)))
            start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.1)
        }
    }

    @MainActor
    private func capture(_ name: String, _ app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}

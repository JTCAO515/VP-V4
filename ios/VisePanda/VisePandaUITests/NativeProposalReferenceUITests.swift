import XCTest

@MainActor
final class NativeProposalReferenceUITests: XCTestCase {
    func testLibraryOwnedTripDiscoveryExactAndInvalidation() throws {
        let env = ProcessInfo.processInfo.environment
        guard env["VP_PROPOSAL_ENTRY_TEST"] == "1" else { throw XCTSkip("Dedicated owned disposable entry runner required") }
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-VisePandaLegacyShell", "-VisePandaNativeAPI", try XCTUnwrap(env["VP_PROPOSAL_API"]), "-VisePandaLocale", "en", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        func reveal(_ element: XCUIElement) {
            for _ in 0..<14 where !element.isHittable {
                if app.keyboards.firstMatch.exists {
                    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.35)).press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.1)))
                } else if element.frame.minY < 100 { app.swipeDown(velocity: .slow) }
                else { app.swipeUp(velocity: .slow) }
            }
            XCTAssertTrue(element.isHittable)
        }
        func login(_ emailValue: String, _ passwordValue: String) {
            app.tabBars.buttons["Profile"].tap()
            let signOut = app.buttons["Sign out"]
            if signOut.waitForExistence(timeout: 2) {
                reveal(signOut); signOut.tap()
                let cleared = XCTNSPredicateExpectation(predicate: NSPredicate(format: "selected == true"), object: app.tabBars.buttons["Ask"])
                XCTAssertEqual(XCTWaiter.wait(for: [cleared], timeout: 15), .completed)
                app.tabBars.buttons["Profile"].tap()
            }
            let email = app.textFields["native.login.email"]
            XCTAssertTrue(email.waitForExistence(timeout: 15)); reveal(email); email.tap(); email.typeText(emailValue)
            let password = app.secureTextFields["native.login.password"]
            reveal(password); password.tap(); password.typeText(passwordValue)
            reveal(app.buttons["native.login.submit"]); app.buttons["native.login.submit"].tap()
            let transitioned = XCTNSPredicateExpectation(predicate: NSPredicate(format: "selected == true"), object: app.tabBars.buttons["Ask"])
            XCTAssertEqual(XCTWaiter.wait(for: [transitioned], timeout: 20), .completed, "login selected Ask in legacy shell")
            app.terminate()
            app.launchArguments.removeAll { $0 == "-VisePandaLegacyShell" }
            if !app.launchArguments.contains("-VisePandaFourTabShell") { app.launchArguments.append("-VisePandaFourTabShell") }
            app.launch()
            XCTAssertTrue(app.tabBars.buttons["Library"].waitForExistence(timeout: 20)); app.tabBars.buttons["Library"].tap()
        }
        login(try XCTUnwrap(env["VP_PROPOSAL_EMAIL"]), try XCTUnwrap(env["VP_PROPOSAL_PASSWORD"]))
        let qualifier = app.staticTexts["proposal.reference.qualifier"]
        let unavailable = app.staticTexts["proposal.reference.unavailable"]
        func select(_ key: String) throws {
            let button = app.buttons["library.proposal.trip." + (try XCTUnwrap(env[key]))]
            XCTAssertTrue(button.waitForExistence(timeout: 20)); reveal(button); button.tap()
        }
        try select("VP_PROPOSAL_TRIP")
        XCTAssertTrue(qualifier.waitForExistence(timeout: 15))
        if qualifier.frame.maxY > 600 { app.scrollViews.firstMatch.swipeUp(velocity: .slow) }
        XCTAssertTrue(qualifier.label.contains("Eligible at this read"))
        capture("Library-owned-Trip-discovery-exact", app)
        try select("VP_PROPOSAL_EMPTY_TRIP")
        XCTAssertTrue(unavailable.waitForExistence(timeout: 15)); XCTAssertFalse(qualifier.exists)
        try select("VP_PROPOSAL_TRIP")
        XCTAssertTrue(qualifier.waitForExistence(timeout: 15))
        try select("VP_PROPOSAL_RACE_TRIP")
        XCTAssertTrue(unavailable.waitForExistence(timeout: 15)); XCTAssertFalse(qualifier.exists)
        capture("Library-Proposal-revised-between-discovery-and-exact", app)
        try select("VP_PROPOSAL_TRIP")
        XCTAssertTrue(qualifier.waitForExistence(timeout: 15))
        let revoked = expectation(description: "actual owned consent withdrawal")
        var request = URLRequest(url: try XCTUnwrap(URL(string: try XCTUnwrap(env["VP_PROPOSAL_REVOKE"]))))
        request.httpMethod = "POST"
        URLSession.shared.dataTask(with: request) { _, response, error in
            XCTAssertNil(error); XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200); revoked.fulfill()
        }.resume()
        wait(for: [revoked], timeout: 15)
        let refresh = app.buttons["library.proposal.refresh"]; reveal(refresh); refresh.tap()
        XCTAssertTrue(unavailable.waitForExistence(timeout: 15)); XCTAssertFalse(qualifier.exists)
        capture("Library-reference-consent-withdrawn", app)
        app.terminate()
        app.launchArguments.removeAll { $0 == "-VisePandaFourTabShell" }; app.launchArguments.append("-VisePandaLegacyShell")
        app.launch()
        login(try XCTUnwrap(env["VP_PROPOSAL_OTHER_EMAIL"]), try XCTUnwrap(env["VP_PROPOSAL_OTHER_PASSWORD"]))
        try select("VP_PROPOSAL_OTHER_TRIP")
        XCTAssertTrue(unavailable.waitForExistence(timeout: 15)); XCTAssertFalse(qualifier.exists)
        XCTAssertFalse(app.buttons["library.proposal.trip." + (try XCTUnwrap(env["VP_PROPOSAL_TRIP"]))].exists)
        capture("Library-other-actor-owned-list", app)
    }
    private func capture(_ name: String, _ app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}

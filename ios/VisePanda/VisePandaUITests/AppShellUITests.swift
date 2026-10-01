import XCTest
import UIKit

@MainActor
final class AppShellUITests: XCTestCase {
    func testLibraryV2AuthenticatedOlderExactAndReturn() throws {
        let env = ProcessInfo.processInfo.environment
        guard env["VP_LIBRARY_UI_TEST"] == "1" else { throw XCTSkip("UNRUN: owned disposable Library environment required") }
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-VisePandaLegacyShell", "-VisePandaNativeAPI", try XCTUnwrap(env["VP_LIBRARY_API"]), "-VisePandaLocale", "en", "-AppleLanguages", "(en)", "-AppleLocale", "en_US", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        app.launch()
        func reveal(_ element: XCUIElement) {
            for _ in 0..<16 where !element.isHittable {
                if app.keyboards.firstMatch.exists {
                    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.35)).press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.1)))
                } else { app.swipeUp(velocity: .fast) }
            }
            if !element.isHittable { capture("Library-control-not-hittable", app: app) }
            XCTAssertTrue(element.isHittable)
        }
        app.tabBars.buttons["Profile"].tap()
        let signOut = app.buttons["Sign out"]
        if signOut.waitForExistence(timeout: 2) { reveal(signOut); signOut.tap() }
        let email = app.textFields["native.login.email"]
        XCTAssertTrue(email.waitForExistence(timeout: 15)); reveal(email); email.tap(); email.typeText(try XCTUnwrap(env["VP_LIBRARY_EMAIL"]))
        let password = app.secureTextFields["native.login.password"]
        reveal(password); password.tap(); password.typeText("VPJ07-Local-Synthetic-Only-195!")
        reveal(app.buttons["native.login.submit"]); app.buttons["native.login.submit"].tap()
        capture("Library-after-login-navigation", app: app)
        let proofURL = try XCTUnwrap(URL(string: try XCTUnwrap(env["VP_LIBRARY_SESSION_PROOF"])))
        func verifyOwnedSession() {
            let proof = expectation(description: "actual owned session readable")
            URLSession.shared.dataTask(with: proofURL) { data, response, error in
                XCTAssertNil(error); XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
                let value = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Bool] }
                XCTAssertEqual(value?["authenticated"], true); proof.fulfill()
            }.resume()
            wait(for: [proof], timeout: 15)
        }
        verifyOwnedSession()
        app.terminate()
        app.launchArguments.removeAll { $0 == "-VisePandaLegacyShell" }
        app.launchArguments.append("-VisePandaFourTabShell")
        app.launch()
        let restored = app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Local synthetic test only.")).firstMatch
        XCTAssertTrue(restored.waitForExistence(timeout: 20), "cold-start authenticated policy restored before tab navigation")
        verifyOwnedSession()
        XCTAssertTrue(app.tabBars.buttons["Library"].waitForExistence(timeout: 10)); app.tabBars.buttons["Library"].tap()
        let older = app.buttons["library.phrases.older"]
        XCTAssertTrue(older.waitForExistence(timeout: 30)); reveal(older); older.tap()
        let oldID = try XCTUnwrap(env["VP_LIBRARY_OLD_TURN"])
        let old = app.buttons["library.phrase.open." + oldID]
        XCTAssertTrue(old.waitForExistence(timeout: 20)); reveal(old)
        XCTAssertFalse(app.buttons["library.phrase.open." + (try XCTUnwrap(env["VP_LIBRARY_NEWEST_TURN"]))].exists, "second page replaces first")
        old.tap()
        let card = app.staticTexts["translation.largeText"]
        XCTAssertTrue(card.waitForExistence(timeout: 15)); XCTAssertEqual(card.label, "旧译50元")
        capture("Library-v2-old-exact-auth-synthetic", app: app)
        app.buttons["Done"].tap()
        XCTAssertTrue(older.waitForExistence(timeout: 20), "return refreshes first page")
        let control = try XCTUnwrap(URL(string: try XCTUnwrap(env["VP_LIBRARY_CONTROL"])))
        var revoke = URLRequest(url: control); revoke.httpMethod = "POST"
        let revoked = expectation(description: "owned consent revoked")
        URLSession.shared.dataTask(with: revoke) { _, response, error in
            XCTAssertNil(error); XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200); revoked.fulfill()
        }.resume()
        wait(for: [revoked], timeout: 15)
        let refresh = app.buttons["library.phrases.refresh"]
        reveal(refresh); refresh.tap()
        XCTAssertTrue(app.staticTexts["library.phrases.unavailable"].waitForExistence(timeout: 15))
        XCTAssertFalse(old.exists); XCTAssertFalse(app.buttons["library.phrases.older"].exists)
        capture("Library-v2-withdrawn-auth-synthetic", app: app)
        app.terminate()
    }

    func testFourTabShellRoutesAndFallback() {
        for locale in ["en", "zh-Hans"] {
            let app = launchFourTabShell(locale: locale)
            let titles = locale == "en" ? ["VP", "Journeys", "Library", "Memory"] : ["VP", "旅程", "资源库", "Memory"]
            XCTAssertEqual(app.tabBars.buttons.count, 4)
            XCTAssertTrue(app.tabBars.buttons["VP"].isSelected)
            XCTAssertFalse(app.staticTexts["specimen.fixture-banner"].exists)
            for title in titles {
                app.tabBars.buttons[title].tap()
                XCTAssertTrue(app.buttons["shell.search.open"].isHittable)
            }
            app.tabBars.buttons[titles[2]].tap()
            XCTAssertTrue(app.textFields["library.search"].exists)
            app.buttons["shell.search.open"].tap()
            XCTAssertTrue(app.buttons["shell.search.places"].waitForExistence(timeout: 3))
            app.buttons["shell.search.places"].tap()
            XCTAssertTrue(app.navigationBars[locale == "en" ? "Explore" : "探索"].waitForExistence(timeout: 3))
            app.buttons["shell.entry.done"].tap()
            XCTAssertTrue(app.tabBars.buttons[titles[2]].isSelected)
            for entry in ["profile", "today", "tools", "explore"] {
                app.buttons["shell.entries.open"].tap()
                app.buttons["shell.entry.\(entry)"].tap()
                XCTAssertTrue(app.buttons["shell.entry.done"].waitForExistence(timeout: 3))
                if entry == "profile" {
                    let privacy = app.staticTexts.matching(NSPredicate(format: "label ==[c] %@",
                        locale == "en" ? "Privacy in this version" : "此版本的隐私状态")).firstMatch
                    for _ in 0..<6 where !privacy.isHittable { app.swipeUp() }
                    capture("Profile-privacy-\(locale)", app: app)
                    XCTAssertTrue(privacy.isHittable)
                }
                app.buttons["shell.entry.done"].tap()
            }
            capture("Four-tab-shell-\(locale)", app: app)
            app.terminate()
        }
        let fallback = launch()
        XCTAssertEqual(fallback.tabBars.buttons.count, 5)
        XCTAssertTrue(fallback.tabBars.buttons["Ask"].isSelected)
        fallback.buttons["shell.entries.open"].tap()
        fallback.buttons["shell.mode.toggle"].tap()
        XCTAssertEqual(fallback.tabBars.buttons.count, 4)
        XCTAssertTrue(fallback.tabBars.buttons["VP"].isSelected)
        fallback.buttons["shell.entries.open"].tap()
        fallback.buttons["shell.mode.toggle"].tap()
        XCTAssertEqual(fallback.tabBars.buttons.count, 5)
        XCTAssertTrue(fallback.tabBars.buttons["Ask"].isSelected)
        fallback.buttons["shell.entries.open"].tap()
        fallback.buttons["shell.entry.knowledge"].tap()
        XCTAssertTrue(fallback.textFields["library.search"].waitForExistence(timeout: 3))
        fallback.buttons["shell.entry.done"].tap()
        fallback.buttons["shell.entries.open"].tap()
        fallback.buttons["shell.entry.memory"].tap()
        XCTAssertTrue(fallback.navigationBars["Saved travel pace"].waitForExistence(timeout: 3))
    }

    func testFourTabShellMaximumTextAndAccessibility() throws {
        for locale in ["en", "zh-Hans", "ar"] {
            let app = launchFourTabShell(locale: locale, largeText: true)
            let titles = locale == "zh-Hans" ? ["VP", "旅程", "资源库", "Memory"] : ["VP", "Journeys", "Library", "Memory"]
            for title in titles {
                app.tabBars.buttons[title].tap()
                XCTAssertTrue(app.buttons["shell.search.open"].isHittable)
                app.buttons["shell.search.open"].tap()
                XCTAssertTrue(app.buttons["shell.search.places"].isHittable)
                try app.performAccessibilityAudit(for: [.hitRegion, .elementDetection, .trait])
                app.buttons["shell.entry.done"].tap()
            }
            capture("Four-tab-maximum-text-\(locale)", app: app)
            app.terminate()
        }
    }

    private func launchFourTabShell(locale: String, largeText: Bool = false) -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-VisePandaFourTabShell", "-VisePandaLocale", locale,
                               "-AppleLanguages", "(\(locale))", "-UIPreferredContentSizeCategoryName",
                               largeText ? "UICTContentSizeCategoryAccessibilityXXXL" : "UICTContentSizeCategoryL"]
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["VP"].waitForExistence(timeout: 10))
        return app
    }

    func testVPJ77FixtureJourneyAndMemoryCorrection() {
        checkVPJ77FixtureJourneyAndMemoryCorrection(largeText: false)
    }

    func testVPJ77FixtureJourneyAndMemoryCorrectionAtLargestTextSize() {
        checkVPJ77FixtureJourneyAndMemoryCorrection(largeText: true)
    }

    private func tapVPJ77Fixture(_ element: XCUIElement, in app: XCUIApplication) {
        if element.identifier == "specimen.keyboard.correct" || element.identifier == "specimen.keyboard.done"
            || element.identifier == "specimen.search.open"
            || element.identifier == "specimen.states.open" || element.identifier == "specimen.memory.details"
            || element.label == "Done" || element.label == "关闭" {
            XCTAssertTrue(element.isHittable)
        } else {
            revealVPJ77Fixture(element, in: app)
        }
        element.tap()
    }

    private func revealVPJ77Fixture(_ element: XCUIElement, in app: XCUIApplication) {
        XCTAssertTrue(element.exists)
        let scroll = app.scrollViews.firstMatch
        guard scroll.exists else { XCTAssertTrue(element.isHittable); return }
        let top = app.navigationBars.firstMatch.frame.maxY + 4
        let inSheet = ["Example detail", "样例详情", "Global search", "全局搜索"]
            .contains { app.navigationBars[$0].exists }
        let bottom = !inSheet && app.tabBars.firstMatch.exists
            ? app.tabBars.firstMatch.frame.minY - 4 : app.frame.maxY - 4
        for _ in 0..<15 {
            let frame = element.frame
            if frame.minY >= top && frame.maxY <= bottom { break }
            let distance = frame.maxY > bottom
                ? min(max(frame.maxY - bottom + 12, 80), (bottom - top) * 0.4)
                : -min(max(top - frame.minY + 12, 80), (bottom - top) * 0.4)
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0))
                .withOffset(CGVector(dx: 0, dy: (top + bottom) / 2))
            start.press(forDuration: 0.05, thenDragTo: start.withOffset(CGVector(dx: 0, dy: -distance)),
                        withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        XCTAssertGreaterThanOrEqual(element.frame.minY, top)
        XCTAssertLessThanOrEqual(element.frame.maxY, bottom)
        XCTAssertTrue(element.isHittable)
    }

    private func checkVPJ77FixtureJourneyAndMemoryCorrection(largeText: Bool) {
        continueAfterFailure = false
        for locale in ["en", "zh-Hans"] {
            let app = XCUIApplication()
            app.launchArguments = ["-VPJ77Specimen", "-VisePandaLocale", locale,
                                   "-AppleLanguages", "(\(locale))",
                                   "-UIPreferredContentSizeCategoryName",
                                   largeText ? "UICTContentSizeCategoryAccessibilityXXXL" : "UICTContentSizeCategoryL"]
            app.launch()
            XCTAssertTrue(app.staticTexts["specimen.fixture-banner"].waitForExistence(timeout: 10))
            XCTAssertEqual(app.tabBars.buttons.count, 4)
            XCTAssertTrue(app.tabBars.buttons["VP"].exists)
            XCTAssertTrue(app.tabBars.buttons["Memory"].exists)
            tapVPJ77Fixture(app.buttons["specimen.first.compare"], in: app)
            tapVPJ77Fixture(app.buttons["specimen.comparison.open"], in: app)
            XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", locale == "en" ? "Option A" : "方向 A")).firstMatch.exists)
            tapVPJ77Fixture(app.buttons[locale == "en" ? "Done" : "关闭"], in: app)
            tapVPJ77Fixture(app.buttons["specimen.delegate"], in: app)
            tapVPJ77Fixture(app.buttons["specimen.task.open"], in: app)
            XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "fixture-task-1")).firstMatch.exists)
            tapVPJ77Fixture(app.buttons[locale == "en" ? "Done" : "关闭"], in: app)
            tapVPJ77Fixture(app.buttons["specimen.return"], in: app)
            app.tabBars.buttons[locale == "en" ? "Journeys" : "旅程"].tap()
            tapVPJ77Fixture(app.buttons["specimen.journeys.artifact"], in: app)
            XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "fixture-artifact-1")).firstMatch.exists)
            tapVPJ77Fixture(app.buttons[locale == "en" ? "Done" : "关闭"], in: app)
            app.tabBars.buttons[locale == "en" ? "Library" : "资源库"].tap()
            tapVPJ77Fixture(app.buttons["specimen.library.artifact"], in: app)
            XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "fixture-artifact-1")).firstMatch.exists)
            tapVPJ77Fixture(app.buttons[locale == "en" ? "Done" : "关闭"], in: app)
            tapVPJ77Fixture(app.buttons["specimen.search.open"], in: app)
            XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", locale == "en" ? "Discover a direction" : "发现值得探索")).firstMatch.exists)
            tapVPJ77Fixture(app.buttons["specimen.search.artifact"], in: app)
            XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "fixture-artifact-1")).firstMatch.waitForExistence(timeout: 5))
            tapVPJ77Fixture(app.buttons[locale == "en" ? "Done" : "关闭"], in: app)
            app.tabBars.buttons["Memory"].tap()
            let edit = app.textFields["specimen.memory.edit"]
            XCTAssertTrue(edit.exists)
            let hint = app.staticTexts["specimen.memory.correction-hint"]
            XCTAssertTrue(hint.exists)
            if !largeText {
                XCTAssertLessThanOrEqual(hint.frame.maxY, app.tabBars.firstMatch.frame.minY - 4)
                XCTAssertLessThanOrEqual(edit.frame.maxY, app.tabBars.firstMatch.frame.minY - 4)
            }
            XCTAssertFalse(app.buttons["specimen.memory.correct"].exists)
            capture("VPJ77 Memory empty correction \(locale)", app: app)
            revealVPJ77Fixture(edit, in: app)
            edit.tap()
            XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
            XCTAssertFalse(app.buttons["specimen.keyboard.correct"].exists)
            XCTAssertTrue(app.buttons["specimen.keyboard.done"].isHittable)
            edit.typeText(locale == "en" ? "Prefer slower days" : "喜欢慢节奏")
            XCTAssertTrue(app.buttons["specimen.memory.correct"].exists)
            tapVPJ77Fixture(app.buttons["specimen.keyboard.correct"], in: app)
            XCTAssertTrue(app.staticTexts["specimen.memory.corrected"].waitForExistence(timeout: 5))
            app.tabBars.buttons["VP"].tap()
            XCTAssertTrue(app.staticTexts["specimen.memory-impact"].waitForExistence(timeout: 5))
            app.tabBars.buttons["Memory"].tap()
            tapVPJ77Fixture(app.buttons["specimen.memory.details"], in: app)
            XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", locale == "en" ? "Memory authority seam" : "Memory 权威接线")).firstMatch.exists)
            capture("VPJ77 source seam \(locale) large=\(largeText)", app: app)
            app.terminate()
        }
    }

    func testVPJ77FixtureFullAccessibilityAudit() throws {
        checkVPJ77FixtureFullAccessibilityAudit(appearance: .light)
    }

    func testVPJ77FixtureFullAccessibilityAuditInDarkMode() throws {
        checkVPJ77FixtureFullAccessibilityAudit(appearance: .dark)
    }

    private func checkVPJ77FixtureFullAccessibilityAudit(appearance: XCUIDevice.Appearance) {
        continueAfterFailure = true
        for locale in ["en", "zh-Hans"] {
            let app = XCUIApplication()
            app.launchArguments = ["-VPJ77Specimen", "-VisePandaLocale", locale,
                                   "-AppleLanguages", "(\(locale))", "-VPJ77AppearanceProbe",
                                   "-VPJ77AuditAppearance", appearance == .dark ? "dark" : "light",
                                   "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
            app.launch()
            XCTAssertTrue(app.staticTexts["specimen.fixture-banner"].waitForExistence(timeout: 10))
            for tab in ["VP", "Memory"] {
                app.tabBars.buttons[tab].tap()
                let action = app.buttons[tab == "VP" ? "specimen.states.open" : "specimen.memory.details"]
                for position in ["initial", "detail"] {
                    XCTAssertTrue(action.isHittable)
                    if position == "detail" {
                        action.tap()
                        XCTAssertTrue(app.navigationBars[locale == "en" ? "Example detail" : "样例详情"].waitForExistence(timeout: 3))
                    }
                    let expectedStyle = appearance == .dark ? "dark" : "light"
                    let observedStyle = app.staticTexts.matching(identifier: "specimen.fixture-banner")
                        .firstMatch.value as? String
                    print("VPJ77 appearance requested=\(expectedStyle), device=\(XCUIDevice.shared.appearance.rawValue), fixture=\(observedStyle ?? "missing")")
                    guard observedStyle == expectedStyle else {
                        capture("VPJ77-appearance-mismatch-\(locale)-\(tab)-\(position)", app: app)
                        XCTFail("Requested \(expectedStyle), but fixture rendered \(observedStyle ?? "missing")")
                        app.terminate()
                        return
                    }
                    print("VPJ77 viewport \(locale) \(tab) \(position): action=\(action.frame), nav=\(app.navigationBars.firstMatch.frame), tabs=\(app.tabBars.firstMatch.frame)")
                    capture("VPJ77-full-AX-\(locale)-\(tab)-\(position)-theme\(appearance.rawValue)", app: app)
                    do {
                        try app.performAccessibilityAudit(for: .all) { issue in
                            print("VPJ77 full AX \(locale) \(tab) \(position): \(issue.compactDescription); \(String(describing: issue.element))")
                            return false
                        }
                    } catch {
                        XCTFail("VPJ77 full AX \(locale) \(tab) \(position): \(error)")
                    }
                }
                app.buttons[locale == "en" ? "Done" : "关闭"].tap()
            }
            app.terminate()
        }
    }

    func testVPJ77FixtureRemainsReachableAtAccessibilityTextSize() {
        let app = XCUIApplication()
        app.launchArguments = ["-VPJ77Specimen", "-VisePandaLocale", "en",
                               "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        app.launch()
        XCTAssertTrue(app.staticTexts["specimen.fixture-banner"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.tabBars.buttons["Memory"].exists)
        app.tabBars.buttons["Memory"].tap()
        XCTAssertTrue(app.textFields["specimen.memory.edit"].exists)
        app.buttons["specimen.search.open"].tap()
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Discover a direction")).firstMatch.exists)
    }

    private func launch(locale: String = "en", largeText: Bool = false) -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = [
            "-VisePandaLocale", locale,
            "-AppleLanguages", "(\(locale))",
            "-AppleLocale", locale == "zh-Hans" ? "zh_CN" : "en_US"
        ]
        app.launchArguments += [
            "-UIPreferredContentSizeCategoryName",
            largeText ? "UICTContentSizeCategoryAccessibilityXXXL" : "UICTContentSizeCategoryL"
        ]
        app.launch()
        // A cold Simulator may return from launch before the accessibility target
        // is available. Wait for the actual shell before starting an AX audit.
        XCTAssertTrue(app.tabBars.buttons[locale == "zh-Hans" ? "问熊猫" : "Ask"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["ask-introduction"].waitForExistence(timeout: 10))
        return app
    }

    private func capture(_ name: String, app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    // The runner sets Simulator's actual system text size. No app size override.
    func testWorkflowBadgeBackgroundAtSystemTextSize() throws {
        continueAfterFailure = false
        let previousAppearance = XCUIDevice.shared.appearance
        XCUIDevice.shared.appearance = .light
        defer { XCUIDevice.shared.appearance = previousAppearance }
        for locale in ["en", "zh-Hans"] {
            let app = XCUIApplication()
            app.launchArguments = ["-VisePandaLocale", locale, "-AppleLanguages", "(\(locale))",
                                   "-AppleLocale", locale == "en" ? "en_US" : "zh_CN"]
            app.launch()
            app.tabBars.buttons[locale == "en" ? "Trip" : "行程"].tap()
            let last = app.staticTexts["3"]
            for _ in 0..<8 where !last.isHittable { app.swipeUp() }
            // Settle at the bottom so every badge is fully visible above the tab bar.
            app.swipeUp()
            capture("Workflow-system-text-\(locale)", app: app)
            let screenshot = app.screenshot().image
            let cgImage = try XCTUnwrap(screenshot.cgImage)
            let width = cgImage.width
            let height = cgImage.height
            var pixels = [UInt8](repeating: 0, count: width * height * 4)
            let context = try XCTUnwrap(CGContext(data: &pixels, width: width, height: height,
                bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
            context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
            let scale = CGFloat(width) / app.frame.width
            for number in ["1", "2", "3"] {
                let text = app.staticTexts[number]
                XCTAssertTrue(text.isHittable)
                let frame = text.frame
                // These points sit beyond the actual text frame. White/pale pixels
                // mean the number has outgrown its painted purple background.
                let probes = [CGPoint(x: frame.midX, y: frame.minY - 2),
                              CGPoint(x: frame.midX, y: frame.maxY + 2),
                              CGPoint(x: frame.minX - 2, y: frame.midY),
                              CGPoint(x: frame.maxX + 2, y: frame.midY)]
                for point in probes {
                    let x = Int(point.x * scale), y = Int(point.y * scale)
                    XCTAssertTrue(x >= 0 && x < width && y >= 0 && y < height)
                    let offset = (y * width + x) * 4
                    let r = Int(pixels[offset]), g = Int(pixels[offset + 1]), b = Int(pixels[offset + 2])
                    XCTAssertTrue(r > g * 2 && b > g * 2 && r < 180,
                        "Badge \(number) background missing at \(point): RGB \(r),\(g),\(b); text frame \(frame)")
                }
                print("Badge background passed: \(locale) \(number), text frame \(frame)")
            }
            app.terminate()
        }
    }

    func testEnglishTabsTodayAndTranslationRoute() {
        let app = launch()
        XCTAssertTrue(app.tabBars.buttons["Ask"].isSelected)
        XCTAssertEqual(app.tabBars.buttons.count, 5)
        capture("Ask-English", app: app)
        XCTAssertFalse(app.buttons["Send"].isEnabled)
        for title in ["Trip", "Explore", "Ask", "Tools", "Profile"] {
            app.tabBars.buttons[title].tap()
            XCTAssertTrue(app.navigationBars[title].waitForExistence(timeout: 3))
        }
        app.tabBars.buttons["Trip"].tap()
        XCTAssertTrue(app.staticTexts["No saved trip yet"].exists)
        app.buttons["Today"].tap()
        XCTAssertTrue(app.navigationBars["Today"].waitForExistence(timeout: 3))
        app.tabBars.buttons["Ask"].tap()
        app.buttons["Help me prepare a bilingual address"].tap()
        XCTAssertTrue(app.navigationBars["Translation"].waitForExistence(timeout: 3))
        // VPJ-26 replaced the preview placeholder with the real bilingual composer;
        // assert the actual reachable screen instead of retired preview-only copy.
        XCTAssertTrue(app.staticTexts["Say it clearly"].exists)
        XCTAssertTrue(app.staticTexts["Sign in in Profile to translate."].exists)
        let input = app.descendants(matching: .any).matching(identifier: "translation.input").firstMatch
        XCTAssertTrue(input.waitForExistence(timeout: 3))
        let submit = app.buttons["translation.submit"]
        XCTAssertTrue(submit.exists)
        XCTAssertFalse(submit.isEnabled)
        // Check tab isolation before opening the keyboard, which hides the tab bar.
        // Each tab retains its own navigation stack; this creates no saved Trip.
        app.tabBars.buttons["Trip"].tap()
        XCTAssertTrue(app.navigationBars["Today"].exists)
        app.tabBars.buttons["Ask"].tap()
        XCTAssertTrue(app.navigationBars["Translation"].waitForExistence(timeout: 3))
        input.tap()
        input.typeText("No peanuts. CNY 50.")
        XCTAssertEqual(input.value as? String, "No peanuts. CNY 50.")
        // Drafting a phrase without an active session/consent cannot submit it.
        XCTAssertFalse(submit.isEnabled)
        capture("Translation-English-SignedOut", app: app)
    }

    func testChineseReleaseLanguagePickerAndEnglishSwitch() {
        let app = launch(locale: "zh-Hans")
        XCTAssertTrue(app.tabBars.buttons["问熊猫"].isSelected)
        capture("Ask-Chinese", app: app)
        func failState(_ message: String) {
            capture("Ask-Chinese-keyboard-state-failure", app: app)
            let hierarchy = XCTAttachment(string: app.debugDescription)
            hierarchy.name = "Ask keyboard state: \(message)"
            hierarchy.lifetime = .keepAlways
            add(hierarchy)
            XCTFail(message)
        }
        func requireReady(_ element: XCUIElement, _ message: String) -> Bool {
            let ready = XCTNSPredicateExpectation(
                predicate: NSPredicate(format: "exists == true AND hittable == true"), object: element)
            guard XCTWaiter.wait(for: [ready], timeout: 10) == .completed else {
                failState(message)
                return false
            }
            return true
        }
        let composer = app.otherElements["ask-composer"].descendants(matching: .any)
            .matching(identifier: "ask-composer-input").firstMatch
        let keyboard = app.keyboards.firstMatch
        let done = app.buttons["ask-keyboard-done"]
        guard requireReady(composer, "Ask composer must exist and be hittable before input") else { return }
        composer.tap()
        guard keyboard.waitForExistence(timeout: 10) else {
            failState("Software keyboard did not appear after focusing the Ask composer")
            return
        }
        composer.typeText("Keep this draft")
        if app.staticTexts["Quickly Change Keyboards"].exists { app.buttons["Continue"].tap() }
        guard (composer.value as? String) == "Keep this draft" else {
            failState("Ask draft was not entered before keyboard dismissal")
            return
        }
        guard keyboard.waitForExistence(timeout: 10) else {
            failState("Software keyboard disappeared before the explicit Done action")
            return
        }
        guard requireReady(done, "Keyboard Done must exist and be hittable before its single tap") else { return }
        guard done.label == "完成" else {
            failState("Keyboard Done did not retain its Chinese label")
            return
        }
        done.tap()
        guard keyboard.waitForNonExistence(timeout: 3) else {
            failState("Software keyboard remained after the single Done tap")
            return
        }
        for title in ["行程", "探索", "问熊猫", "工具", "我的"] {
            app.tabBars.buttons[title].tap()
            XCTAssertTrue(app.navigationBars[title].waitForExistence(timeout: 3))
        }
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "语言")).firstMatch.tap()
        XCTAssertTrue(app.buttons["English"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["中文"].exists)
        for legacy in ["Español", "Русский", "العربية"] {
            XCTAssertFalse(app.buttons[legacy].exists)
        }
        app.buttons["English"].tap()
        XCTAssertTrue(app.tabBars.buttons["Profile"].waitForExistence(timeout: 3))
        app.tabBars.buttons["Ask"].tap()
        XCTAssertTrue(app.navigationBars["Ask"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertEqual(composer.value as? String, "Keep this draft")
        XCTAssertFalse(app.buttons["Send"].isEnabled)
    }

    func testAskAndTripFullAccessibilityInReleaseLanguages() throws {
        let previousAppearance = XCUIDevice.shared.appearance
        XCUIDevice.shared.appearance = .light
        defer { XCUIDevice.shared.appearance = previousAppearance }
        for locale in ["en", "zh-Hans"] {
            let app = launch(locale: locale)
            XCTAssertEqual(XCUIDevice.shared.appearance, .light)
            XCTAssertTrue(app.staticTexts["ask-availability-notice"].isHittable)
            try app.performAccessibilityAudit { issue in
                print("Full AX issue: \(issue.compactDescription), element: \(String(describing: issue.element))")
                return false
            }
            let tripLabel = locale == "en" ? "Trip" : "行程"
            app.tabBars.buttons[tripLabel].tap()
            XCTAssertTrue(app.navigationBars[tripLabel].waitForExistence(timeout: 3))
            try app.performAccessibilityAudit { issue in
                print("Full AX issue: \(issue.compactDescription), element: \(String(describing: issue.element))")
                return false
            }
            capture("Trip-full-AX-\(locale)", app: app)
            app.terminate()
        }
    }

    func testAskAndTripFullAccessibilityInDarkMode() throws {
        let previousAppearance = XCUIDevice.shared.appearance
        XCUIDevice.shared.appearance = .dark
        defer { XCUIDevice.shared.appearance = previousAppearance }
        for locale in ["en", "zh-Hans"] {
            let app = launch(locale: locale)
            XCTAssertEqual(XCUIDevice.shared.appearance, .dark)
            capture("Ask-dark-top-\(locale)", app: app)
            try app.performAccessibilityAudit()
            XCTAssertTrue(app.staticTexts["ask-availability-notice"].isHittable)
            capture("Ask-dark-\(locale)", app: app)
            let tripLabel = locale == "en" ? "Trip" : "行程"
            app.tabBars.buttons[tripLabel].tap()
            XCTAssertTrue(app.navigationBars[tripLabel].waitForExistence(timeout: 3))
            try app.performAccessibilityAudit()
            capture("Trip-dark-\(locale)", app: app)
            app.terminate()
        }
    }

    func testAccessibilityAtLargestTextSize() throws {
        let previousAppearance = XCUIDevice.shared.appearance
        defer { XCUIDevice.shared.appearance = previousAppearance }
        for appearance in [XCUIDevice.Appearance.light, .dark] {
            XCUIDevice.shared.appearance = appearance
            for locale in ["en", "zh-Hans"] {
                let app = launch(locale: locale, largeText: true)
                let layoutChecks: XCUIAccessibilityAuditType = [
                    .elementDetection, .hitRegion, .sufficientElementDescription,
                    .dynamicType, .textClipped, .trait
                ]
                // Contrast is checked in both themes at normal size. The retained
                // maximum-size contrast diagnostic remains FAIL, not an accepted pass.
                try app.performAccessibilityAudit(for: layoutChecks)
                let notice = app.staticTexts["ask-availability-notice"]
                revealFully(notice, in: app)
                try app.performAccessibilityAudit(for: layoutChecks)
                capture("Ask-largest-\(locale)-\(appearance.rawValue)", app: app)
                let tripLabel = locale == "en" ? "Trip" : "行程"
                app.tabBars.buttons[tripLabel].tap()
                XCTAssertTrue(app.navigationBars[tripLabel].waitForExistence(timeout: 3))
                try app.performAccessibilityAudit(for: layoutChecks)
                capture("Trip-largest-\(locale)-\(appearance.rawValue)", app: app)
                app.terminate()
            }
        }
    }

    // Full audit at maximum Dynamic Type: never waive contrast or clipping.
    func testMaximumTextFullAccessibilityInBothThemesAndLanguages() throws {
        let previousAppearance = XCUIDevice.shared.appearance
        defer { XCUIDevice.shared.appearance = previousAppearance }
        for appearance in [XCUIDevice.Appearance.light, .dark] {
            XCUIDevice.shared.appearance = appearance
            for locale in ["en", "zh-Hans"] {
                let app = launch(locale: locale, largeText: true)
                continueAfterFailure = true
                func audit(_ position: String) {
                    capture("Maximum-full-\(locale)-\(appearance.rawValue)-\(position)", app: app)
                    do {
                        try app.performAccessibilityAudit(for: .all) { issue in
                            print("Maximum full AX \(locale) \(appearance.rawValue) \(position): \(issue.compactDescription); \(String(describing: issue.element))")
                            return false
                        }
                    } catch {
                        XCTFail("Maximum full audit \(locale) \(appearance.rawValue) \(position): \(error)")
                    }
                }
                audit("Ask-top")
                revealFully(app.staticTexts["ask-availability-notice"], in: app)
                audit("Ask-notice")
                app.tabBars.buttons[locale == "en" ? "Trip" : "行程"].tap()
                audit("Trip-top")
                app.terminate()
            }
        }
    }

    private func revealFully(_ element: XCUIElement, in app: XCUIApplication) {
        let scroll = app.scrollViews.firstMatch
        let composer = app.otherElements["ask-composer"]
        XCTAssertTrue(composer.exists)
        let top = max(scroll.frame.minY, app.navigationBars.firstMatch.frame.maxY)
        let bottom = min(scroll.frame.maxY, composer.frame.minY)
        for _ in 0..<10 {
            let frame = element.frame
            let distance: CGFloat
            if frame.maxY > bottom { distance = min(frame.maxY - bottom + 20, (bottom - top) * 0.4) }
            else if frame.minY < top { distance = -min(top - frame.minY + 20, (bottom - top) * 0.4) }
            else { break }
            let start = scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
            let end = start.withOffset(CGVector(dx: 0, dy: -distance))
            start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        XCTAssertGreaterThanOrEqual(element.frame.minY, top)
        XCTAssertLessThanOrEqual(element.frame.maxY, bottom)
        XCTAssertTrue(element.isHittable)
    }

    func testToolsAccessibilityAtLargestTextSize() throws {
        let app = launch(largeText: true)
        app.tabBars.buttons["Tools"].tap()
        for _ in 0..<5 where !app.buttons["Translation"].isHittable { app.swipeUp() }
        let translation = app.buttons["Translation"]
        XCTAssertTrue(translation.isHittable)
        for _ in 0..<8 {
            let distance = translation.frame.minY - app.navigationBars.firstMatch.frame.maxY - 8
            if abs(distance) < 2 { break }
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.6))
            let end = start.withOffset(CGVector(dx: 0, dy: -min(max(distance, -200), 200)))
            start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        XCTAssertTrue(translation.isHittable)
        try app.performAccessibilityAudit(for: [.elementDetection, .trait, .sufficientElementDescription, .textClipped]) { issue in
            print("AX issue: \(issue.compactDescription), element: \(String(describing: issue.element))")
            return false
        }
        capture("Tools-largest-accessibility-text", app: app)
    }

    func testToolsFullAccessibilityAndNavigationInBothLanguagesAndThemes() throws {
        let previousAppearance = XCUIDevice.shared.appearance
        defer { XCUIDevice.shared.appearance = previousAppearance }
        for locale in ["en", "zh-Hans"] {
            for appearance in [XCUIDevice.Appearance.light, .dark] {
                XCUIDevice.shared.appearance = appearance
                let app = launch(locale: locale, largeText: true)
                app.tabBars.buttons[locale == "en" ? "Tools" : "工具"].tap()
                app.swipeUp()
                let title = locale == "en" ? "Translation" : "翻译"
                let translation = app.buttons[title]
                XCTAssertTrue(translation.isHittable)
                try app.performAccessibilityAudit(for: .all)
                capture("Tools-full-\(locale)-\(appearance.rawValue)", app: app)
                translation.tap()
                XCTAssertTrue(app.navigationBars[title].waitForExistence(timeout: 3))
                app.terminate()
            }
        }
    }

    func testTodayAccessibilityAtLargestTextSize() throws {
        let app = launch(largeText: true)
        app.tabBars.buttons["Trip"].tap()
        for _ in 0..<5 where !app.buttons["Today"].isHittable { app.swipeUp() }
        XCTAssertTrue(app.buttons["Today"].isHittable)
        app.buttons["Today"].tap()
        XCTAssertTrue(app.navigationBars["Today"].exists)
        try app.performAccessibilityAudit(for: [.elementDetection, .trait, .sufficientElementDescription, .textClipped]) { issue in
            print("AX issue: \(issue.compactDescription), element: \(String(describing: issue.element))")
            return false
        }
        capture("Today-largest-accessibility-text", app: app)
    }
}

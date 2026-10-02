import XCTest

@MainActor
final class NativeAssistantFixtureDefaultAppearanceUITests: XCTestCase {
    func testDefaultSystemAppearanceSwitch() throws {
        let initial = ProcessInfo.processInfo.environment["VPJ77_SYSTEM_APPEARANCE"] ?? ""
        let target = ProcessInfo.processInfo.environment["VPJ77_SYSTEM_SWITCH_TO"] ?? ""
        guard ["light", "dark"].contains(initial), ["light", "dark"].contains(target), initial != target else {
            throw XCTSkip("The owned host harness must change the actual system appearance")
        }
        let app = XCUIApplication()
        app.launchArguments = ["-VPJ77Specimen", "-VisePandaLocale", "en",
                               "-VPJ77AppearanceProbe", "-VPJ77SystemAppearanceProbe"]
        app.launch()
        let banner = app.staticTexts.matching(identifier: "specimen.fixture-banner").firstMatch
        XCTAssertTrue(banner.waitForExistence(timeout: 10))
        XCTAssertEqual(banner.value as? String, initial)
        print("VPJ77_SWITCH_READY")
        let changed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", target), object: banner)
        XCTAssertEqual(XCTWaiter.wait(for: [changed], timeout: 30), .completed)
        let paragraphs = app.staticTexts.matching(NSPredicate(format: "value BEGINSWITH %@", "UIKitStyle:"))
            .allElementsBoundByIndex.filter(\.isHittable)
        XCTAssertFalse(paragraphs.isEmpty)
        for paragraph in paragraphs {
            XCTAssertEqual(paragraph.value as? String, target == "dark" ? "UIKitStyle:2" : "UIKitStyle:1")
        }
        print("VPJ77_SWITCH_OBSERVED initial=\(initial) target=\(target) swiftUI=\(banner.value ?? "missing") UIKit=\(paragraphs.map { $0.value ?? "missing" })")
        let capture = XCTAttachment(screenshot: app.screenshot())
        capture.name = "default-system-switch-\(initial)-to-\(target)"
        capture.lifetime = .keepAlways
        add(capture)
        app.terminate()
    }

    func testDefaultSystemAppearanceMatrix() throws {
        let style = ProcessInfo.processInfo.environment["VPJ77_SYSTEM_APPEARANCE"] ?? ""
        guard ["light", "dark"].contains(style) else {
            throw XCTSkip("Run the owned Simulator harness with a real system appearance readback")
        }
        continueAfterFailure = false
        for locale in ["en", "zh-Hans"] {
            let app = XCUIApplication()
            app.launchArguments = ["-VPJ77Specimen", "-VisePandaLocale", locale,
                                   "-AppleLanguages", "(\(locale))",
                                   "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL",
                                   "-VPJ77AppearanceProbe", "-VPJ77SystemAppearanceProbe"]
            XCTAssertFalse(app.launchArguments.contains("-VPJ77AuditAppearance"))
            app.launch()
            XCTAssertTrue(app.staticTexts["specimen.fixture-banner"].waitForExistence(timeout: 10))
            for tab in ["VP", "Memory"] {
                app.tabBars.buttons[tab].tap()
                for position in ["initial", "detail"] {
                    if position == "detail" {
                        app.buttons[tab == "VP" ? "specimen.states.open" : "specimen.memory.details"].tap()
                        XCTAssertTrue(app.navigationBars[locale == "en" ? "Example detail" : "样例详情"].waitForExistence(timeout: 5))
                    }
                    let swiftUI = app.staticTexts.matching(identifier: "specimen.fixture-banner").firstMatch
                    XCTAssertEqual(swiftUI.value as? String, style)
                    let paragraphs = app.staticTexts.matching(NSPredicate(format: "value BEGINSWITH %@", "UIKitStyle:"))
                        .allElementsBoundByIndex.filter(\.isHittable)
                    XCTAssertFalse(paragraphs.isEmpty, "Visible UIKit paragraph traits must be read, not inferred")
                    for paragraph in paragraphs {
                        XCTAssertEqual(paragraph.value as? String, style == "dark" ? "UIKitStyle:2" : "UIKitStyle:1")
                    }
                    print("VPJ77 DEFAULT \(style) \(locale) \(tab) \(position) swiftUI=\(swiftUI.value ?? "missing") UIKit=\(paragraphs.map { $0.value ?? "missing" })")
                    let capture = XCTAttachment(screenshot: app.screenshot())
                    capture.name = "default-\(style)-\(locale)-\(tab)-\(position)"
                    capture.lifetime = .keepAlways
                    add(capture)
                    if ProcessInfo.processInfo.environment["VPJ77_SYSTEM_SETUP_ONLY"] == "1" {
                        app.terminate()
                        return
                    }
                    try app.performAccessibilityAudit(for: .all) { issue in
                        print("VPJ77 DEFAULT AX \(issue.compactDescription); \(String(describing: issue.element))")
                        return false
                    }
                }
                app.buttons[locale == "en" ? "Done" : "关闭"].tap()
            }
            app.terminate()
        }
    }
}

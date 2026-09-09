# 最大字号对比度诊断：FAIL保留

2026-09-09，Xcode26.6/iOS26.5。此临时调查方法不属于原有CI门，不作为通过的回归测试。将下方方法加入AppShellUITests类（复用同类launch/capture），执行commands.jsonl中20260909-221340对应only-testing命令即可复现；在独立工作树操作，保留结果后移除临时方法。

实际结果：简介完整frame (16,146,368.33,435.33)，可视竖直区间124...694；下一次完整audit失败对象改为主标题。之前初始viewport仅露出简介上缘时，失败对象是简介。未改颜色；保留两次FAIL与截图，不能据此声称最大字号完整contrast通过。普通字号深浅完整audit与最大字号结构/滚动验证分别报告。VoiceOver真机仍需实际验收。

```swift
    func testLargeSubtitleContrastWhenVisible() throws {
        let previousAppearance = XCUIDevice.shared.appearance
        XCUIDevice.shared.appearance = .dark
        defer { XCUIDevice.shared.appearance = previousAppearance }
        let app = launch(largeText: true)
        let introduction = app.staticTexts["ask-introduction"]
        let scroll = app.scrollViews.firstMatch
        let composer = app.textViews.firstMatch.exists ? app.textViews.firstMatch : app.textFields.firstMatch
        let top = max(scroll.frame.minY, app.navigationBars.firstMatch.frame.maxY) + 8
        let bottom = min(scroll.frame.maxY, composer.frame.minY) - 12
        for _ in 0..<8 where introduction.frame.maxY > bottom { scroll.swipeUp(velocity: .slow) }
        XCTAssertGreaterThanOrEqual(introduction.frame.minY, top)
        XCTAssertLessThanOrEqual(introduction.frame.maxY, bottom)
        print("Introduction full frame: \(introduction.frame); visible vertical range: \(top)...\(bottom)")
        capture("Ask-dark-largest-introduction-visible", app: app)
        try app.performAccessibilityAudit { issue in
            print("Visible AX issue: \(issue.compactDescription), element: \(String(describing: issue.element))")
            return false
        }
    }

```

# iOS17.5 CJK audit reference comparison

## Conclusion

This bounded comparison found **no demonstrated production glyph-clipping defect to repair**. The same complete Chinese sentence was visible in the ordinary and maximum-size screenshots. A minimal SwiftUI `Text` retained `Text clipped` in both sizes, while a dynamic UIKit `UILabel` returned no issues in both complete `.all` audits. This supports a SwiftUI/CJK measurement or audit-classification difference, rather than the production banner's composition being the necessary cause.

It does **not** establish that every size/theme/accessibility mode is correct, conclusively identify an Apple framework bug, or waive minimum-runtime acceptance. No production replacement with UIKit was made merely to make the audit green. Original four iOS17.5 failures and the full maximum-size contrast **FAIL** remain unchanged.

## Scope and setup

- Base: main `9fb6a649b7417174ddc0f3498d22f57c2fba9a71` (exact recorded base is authoritative in observations.json).
- Existing isolated `VP-V4-iOS17-Accessibility` checkout fast-forwarded from e78ee21; old evidence was preserved.
- Dedicated iPhone15 Simulator, iOS17.5, Xcode26.6; no physical device or real Ask/session/network feature used.
- Same sentence: `此版本尚未连接实时数据、账号、AI、预订或支付。`
- Same footnote text style and nominal 333pt available width. UIKit uses `UIFont.preferredFont(forTextStyle:.footnote)` and `adjustsFontForContentSizeCategory=true`. Normal SwiftUI AX bounds follow intrinsic text width, while UIKit occupies its full available width; maximum-size bounds match.
- App-only launch arguments select normal or accessibilityXXXL; a temporary app-only preferred light appearance keeps the comparison consistent. No Simulator system content size, appearance or host/global setting was changed.
- One XCTest method ran all six scenarios with `continueAfterFailure=true`. Every audit callback returned **false**. No category was excluded and no issue was filtered.

## Actual results

The overall test exited **65 / FAIL**. There are six scenarios, not six independent XCTest test cases.

| Scenario | Message AX size, pt | Complete `.all` audit |
| --- | --- | --- |
| Production normal | 296.333 × 15.667 | **FAIL** — CJK Text clipped |
| Production maximum | 333 × 156.667 | **FAIL** — two Contrast failed findings |
| Minimal SwiftUI normal | 296.333 × 15.667 | **FAIL** — Text clipped |
| Minimal SwiftUI maximum | 333 × 156.667 | **FAIL** — Text clipped |
| UIKit normal | 333 × 15.667 | **PASS**, no issues returned |
| UIKit maximum | 333 × 156.667 | **PASS**, no issues returned |

The UIKit passes apply only to the temporary reference screens; they do not pass the production app or #188.

Before the production maximum audit, the message frame was y500.434…657.100 and its screenshot showed the complete sentence. During the audit callbacks, the preview title was reported at y786.4 and the message at y851.1…1007.8, beneath the visible content area. These different reported coordinates are retained. This run does not establish why the contrast findings occurred or clear the full contrast failure.

## Visual observations and limits

The element and full-screen images were inspected. All characters and the terminal punctuation were visible at the two tested sizes. Maximum SwiftUI and UIKit text both occupied 333×156.667pt, with different horizontal glyph spacing but no observed missing text. Dark-ink vertical margins in the maximum element images were 18/17px for SwiftUI and 18/18px for UIKit; production was 17/18px. Normal element images also retained vertical ink margins. Raster margins support the observation but are not a general clipping or VoiceOver oracle.

The two maximum full-screen PNGs are byte-identical, although their element captures show different horizontal spacing. This sequence therefore does not establish independent full-screen rasterization of the UIKit view at that exact capture instant. Per-scenario audit markers, distinct normal UIKit geometry and element captures remain available; this limitation is retained rather than rerunning further variants.

This is a stronger isolation than the earlier unsuccessful font/leading/fixedSize/width/grouping/viewport trials: production navigation, banner background and compositor were removed from the two reference screens, yet the SwiftUI finding persisted. It does not justify running endless variants, changing the copy, hiding elements, or switching all labels to UIKit. Tools' nil-element diagnostics, intermediate text categories, dark-mode combinations and VoiceOver were not investigated in this slice.

## Evidence, restoration and checks

- `observations.json`: six scenario markers/issues, geometry and image-margin measurements.
- `screenshots/`: all six full-screen and six element captures, with `screenshot-sha256.json`.
- `diagnostic.patch`: the temporary reference screens/test entry, not production code.
- `source-restoration.json`: original, diagnostic and restored hashes for all three touched source files.
- `commands.jsonl`: actual command and exit65. Full raw result remains in the named local cache.

The three original source files were restored byte-for-byte. `git diff --exit-code -- ios` and diagnostic patch applicability passed. The dedicated Simulator was shut down afterward. No tracker/PR/shared-handoff mutation was made; this submission contains evidence only.

# Reading-text accessibility repair — 2026-09-18

Related to #188; first repair in PR478. Base main2370391. Tools row conversion and
minimum-OS CI enforcement are a separate dependent repair. This is native
foundation acceptance, not #198 selected-object Ask or #242 TestFlight acceptance.

## What was reproduced and why the implementation changed

The installed Xcode27.0/27A266a CLI rejected the17.5 download, but Xcode's actual
Components → Add Platforms UI successfully installed release17.5/21F79. No manual
file retrieval remained necessary. The unmodified main source then reproduced
**all four original UI failures** on an owned iPhone15/17.5. See baseline17-r2.
The first run also completed four failed tests, then hung while collecting verbose
diagnostics; it was interrupted. The completed r2 disables only verbose system
diagnostics, retaining audits, screenshots and all original assertions.

Two different problems were established:

1. SwiftUI text accessibility measurement/sampling differs from UILabel on these
   OS versions. The Chinese preview sentence is visibly present but iOS17 reports
   clipping; scroll-edge contrast failures include text obscured by bars and even
   offscreen captures. In a matched one-paragraph substitution, same copy, text
   style, color and available width changed the initial maximum-size `.all` audit
   from FAIL to PASS. This is an accessibility-metadata/rendering compatibility
   repair; it is **not** evidence that the original screenshot lost Chinese glyphs.
2. The initial UIKit candidate used `UIColor(Color(...))`. iOS17 froze appearance
   during that round trip, causing real dark-mode contrast failures in the new
   renderer (and invalid dark measurements in the initial palette test). Shared
   dynamic UIColor providers now feed both SwiftUI Color and UILabel directly.
   Original RGB values are unchanged; no threshold or palette was lightened to
   make tests pass. The actual retained UILabel color is tested in both traits.

`VPReadableText` uses preferred UIFont text styles at every Dynamic Type size,
uncapped wrapping, the actual fitted height, live locale/layout direction, and
native UILabel accessibility. It replaces the affected Ask/Trip/banner/brand copy
and workflow digits. Title weight/tracking, badge scaling, original logo assets,
navigation, draft state, permissions and backend behavior are preserved. There is
no viewport-dependent accessibility hiding and no audit issue handler returns true.

The separate border/blur/clipping/List experiments did not establish a repair and
were reverted. Initial evidence remains in ../accessibility-20260918/verification.md.
Explicit Tools body font alone also failed; that row repair is separate.

## Automated evidence

| Check | Actual result |
| --- | --- |
| Unmodified main, four original tests, iPhone15/iOS17.5 | **4 FAIL**; baseline17-r2 |
| Matched initial maximum-size paragraph using UILabel, iOS26.5 | **PASS**, complete `.all`; uikit-paragraph26 |
| Reading slice after dynamic-color repair, iOS17.5 | Original dark and full maximum audit **PASS**; both unit tests **PASS**; Tools remained **FAIL** in dynamic-palette17 |
| Final shared reading source, iOS26.5 | **3/3 PASS**, normal light/dark plus full maximum audit; brand-readable26 |
| Final shared reading source, iOS17.5 | **3/3 PASS**, same full light/dark/maximum methods; brand-readable17 |
| Original normal/max navigation, draft-language and badge regressions | Recorded in combined-repair evidence; never replaced by a screenshot |

The full maximum test performs `.all` for en/zh × light/dark × Ask top/Ask notice/
Trip top:12 audited states. It retains the full-notice frame assertions. The four
original failed methods are unchanged. Palette Swift Testing covers12 sizes ×2
appearances ×2 contrast preferences at **4.5:1**, including normal-size text. The
rendered component test changes locale and maximum size in place, verifies its
actual fitting bounds and retained dynamic color, and covers legacy es/ru/ar with
Arabic RTL before restoring English. It does not use the production text as its
assertion oracle.

Two controlled negative checks verify that the new renderer is actually audited:

- Set only the new introduction foreground to white: `.all` reports **Contrast
  failed** on that UILabel. `readable-negative-r3-26` also retains an unrelated
  first test-host setup failure; attaching the host to a real UIWindowScene fixed
  that harness failure, and subsequent rendered-component runs passed.
- Limit only the preview message to one line: iOS17 `.all` reports **Text clipped**
  on the native label (`clipping-negative17`).

Both deliberately faulty changes were restored before committing. These raw
negative runs remain FAIL, not expected-failure waivers in the permanent suite.
An early CGSize type ambiguity and caption/caption1 API spelling error were fixed
before the completed candidate runs; neither failed build was called a test pass.

Selected original images are included; full local result bundles are named in
commands.jsonl. The source hashes identify the shared reading implementation.
Screenshots were inspected for actual copy, full wrapping and unchanged branding.

## Remaining boundaries

Tools' original17.5 audit needs the separate Tools repair; do not close #188 using
this reading PR alone. Physical VoiceOver, signed Store/TestFlight and the real
selected-object chain remain **UNRUN**, with per-Issue conditions in VPJ-10/40/42
accessibility-20260918 records. JTs17 exists and Developer Mode is on; launching
its installed app was rejected Locked. The real #198 selected-object Ask consumer
is absent on main. No phone setting, app installation, Trip or provider was changed.

CI/review/merge are separate from local target observations. Read the live PR
checks; this document does not predeclare their outcome. Roll back by reverting
the native reading component/call sites/tests; no migration or service rollout.

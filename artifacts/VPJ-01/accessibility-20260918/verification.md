# Initial native accessibility investigation — 2026-09-18

This is the retained initial FAIL snapshot. Later verified repairs are documented in
[reading-text verification](../readable-text-20260918/verification.md); do not use
this snapshot to infer current runtime availability or repair status.

Base `2370391`, isolated branch `codex/ios17-accessibility-20260918`.
Original checkout and its uncommitted Xcode/localization changes are untouched.
Scope: VPJ-01/#188 foundation defects; #198/#233/#242 acceptance readiness only.
No production deployment, real Trip mutation, purchase or external message.

## Live dependency assessment

- #198 (VPJ-10), OPEN: no registered hard start dependency. #197 remains OPEN;
  PR475 is open for relative-day outlines. Current `NativeTripView` supports
  draft/proposal review, explicit confirmation and rejection. Its sheets are share
  and screenshot review; it does not implement selected-day/item Ask sheet and
  return-anchor flow. A basic Trip/Ask tab audit cannot pass this criterion.
- #233 (VPJ-40), OPEN: registered hard dependency #241 is now CLOSED; local
  sharing implementation and its native tests are present. That historical
  dependency is not a reason to defer foundation development. Whole-flow
  VoiceOver, interruptions, performance and real selected-object Ask still require
  their actual consumers and environments.
- #242 (VPJ-42), OPEN: #241 CLOSED does not establish an accepted TestFlight build,
  controlled-user Plan/Ready/Travel, real owner/provider/network/permission results,
  or the #198 flow. No complete TestFlight acceptance is claimed.
- Recent Native CI successes use `scripts/ios/ci.py`, pinned Xcode27/iOS26.5 and
  iPhone17 Pro. They are not iOS17.5 or physical VoiceOver evidence.

Current issue text and labels: `issue-snapshot.json`. Labels were not used as
technical blockers and no parent acceptance was reduced.

## Environment actually observed

Xcode27.0 (27A266a); installed Simulator runtime only iOS26.5 (23F77).
Owned iPhone15 Simulator `74ADB60A-DFBD-46FC-A6CD-8DD4ACD7C6C0` is used to retain
small-screen coverage. The separately booted VPJ12 device was not used.

`xcodebuild -downloadPlatform iOS -buildVersion 17.5 -architectureVariant universal`
returned exit70: iOS17.5 unavailable for download. Official Apple downloadable
index still lists release17.5/21F79. User completed Apple Developer browser login;
retrieving the runtime file is pending. Historical four iOS17.5 FAILs remain FAIL;
current-head rerun is UNRUN until the runtime is installed and boots.

JTs17 is paired, iOS27.0 (24A437), Developer Mode enabled, VisePanda0.1.0/build1
installed, VoiceOver initially disabled. Actual app launch was rejected by
SBMainWorkspace with `Locked`; it is not an installation/signing or VoiceOver pass.
The user has been asked to unlock the phone. No VoiceOver setting changed.

## Actual test results

| Run | Result | Meaning |
| --- | --- | --- |
| `baseline26.xcresult` | 4 tests; 2 PASS / 2 FAIL | Original maximum-layout and Tools tests PASS; normal light/dark full audits FAIL at Trip on iPhone15 |
| `maximum-baseline26.xcresult` | token unit test PASS; maximum UI test FAIL (15 findings) | Full `.all` audit at maximum size, en/zh light/dark, Ask top/notice and Trip top; no category excluded |
| `edge-hidden26.xcresult` | FAIL | Disabling iOS26 scroll-edge effect does not solve full maximum audit; experiment not accepted |
| `viewport26.xcresult` | 3 tests FAIL | GeometryReader+frame+clip does not solve full audit; experiment not accepted |
| `reading-margin26.xcresult` | FAIL | Vertical reading margin constrains scroll frame (y121,h526), but full audit still fails; reverted |
| `system-largest-r2-26.xcresult` | FAIL | Actual system maximum text, no application size override; full audit still fails |

Swift Testing verifies foreground/background tokens over all12 content-size
categories ×2 themes ×2 accessibility-contrast settings, using WCAG relative
luminance and 4.5:1 threshold even for large text. This numerical PASS does not
replace the rendered UI audit. Full audit callbacks always return false.

Failure attachments include offscreen/partially obscured text. The normal Trip
finding has frame `(56,748.3,225.7,18)`. Maximum Ask findings include introduction
`(16,627.3,361.3,435.3)` and post-audit direction text at y1709.7. Some exported
failed-element captures are blank black; these cannot establish a low-contrast
color token defect. Full-screen and element captures plus logs are retained in
`/tmp/vp-ax-runs/`. A framework classification cause is not yet conclusively proven.

Prior evidence consulted: VPJ-01/native-acceptance, ios17-foundation,
ios17-cjk-reference, and VPJ-16/native-knowledge-20260913/ax-regression. The latter
records the earlier header-height regression; it did not clear these older gaps.

## Unmet acceptance

No iOS17.5 fix, complete maximum-size contrast fix, physical VoiceOver, selected
Ask sheet or signed Store/TestFlight acceptance has been declared PASS.
All experimental product changes have been reverted. Retained changes are the
unfiltered maximum-size XCTest regression and the Swift Testing palette checks.
The UI regression intentionally remains red: do not merge or mark the defect
resolved until the full original and new audits pass. No expected-failure marker,
issue filter, excluded audit category or hidden accessibility content is added.
The original four test methods are unchanged.

The first system-size attempt was INVALID/INTERRUPTED: simctl was invoked while
the destination was shut down. It is excluded from acceptance; r2 booted the
owned device, set and read back actual maximum size before running. The r2 test
source is retained separately; committed tests use the deterministic launch
argument and match the maximum-baseline26 run.

Next concrete work: install the authenticated Apple17.5/21F79 download and run
unchanged four original tests, then isolate the CJK/Tools diagnostics on that
runtime; determine why full audits capture offscreen pixels before choosing a
production workaround. Available phone needs unlock for launch; complete
#198/#233/#242 needs the absent selected-object consumer and a named actual build.
Numerical color success and this evidence PR do not clear either target FAIL.

`node scripts/docs-check.mjs` and `git diff --check`: PASS. Native results are
explicitly FAIL as above. Source review confirms no production source diff.
Timing: investigation began about12:27 China time; no repair acceptance reached.
No acceptance duration or successful-fix count is claimed.

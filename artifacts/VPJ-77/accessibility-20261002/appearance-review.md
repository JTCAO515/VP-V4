# Appearance evidence correction

The original f5df2498 named-dark screenshots actually rendered light. Their filenames now state `requested-dark-observed-light`; the old dark-render acceptance claim is withdrawn. No fixed-light policy was found in source or built Info.plist. Default fixture launches follow actual system dark in the retained SE and iOS26 direct-launch screenshots, but these are bounded launch observations, not a default-system full audit matrix.

An iOS26 run with only XCUIDevice appearance setters failed the new actual-scheme guard: requested dark, device getter 2, fixture light. Bundle: `test_sim_2026-10-01T18-22-30-853Z_pid31617_f167c013.xcresult`. This setter path remains FAIL. Final QA palette testing explicitly supplies fixture-only presentation preferences and checks equality with actual colorScheme before each screenshot/audit; ordinary startup uses nil. No global theme or production shell changes.

## Targeted English detail comparison (SE iOS17.5)

| Input and observation | Window / bar / title UIKit style | Title resolved RGBA | Full audit |
| --- | --- | --- | --- |
| Actual system dark, no QA appearance | 2 / 2 / 2 | approximately 1,1,1,1 | PASS |
| System light + QA dark, automatic transparent/material bar | 1 / 2 / 2 | approximately 1,1,1,1 | FAIL: title contrast |
| Same QA request, explicit visible QA bar background | 1 / 2 / 2 | approximately 1,1,1,1 | PASS |

All three had standardBG=nil, edgeBG=nil, standardEffect=SystemChromeMaterial, edgeEffect=nil, barBG=nil. These are public UIKit measurements from a temporary read-only probe, removed after diagnosis. The before screenshot already shows dark background and white title; it does **not** prove a physical white-on-white color error. Background pixel (10,65pt), scale 2: system-dark and QA-before (28,28,30,255); QA-after (39,40,40,255). The title audit difference is retained as a transparent/material path limitation; its exact algorithmic cause is unconfirmed.

Bundles: default `test_sim_2026-10-01T19-53-31-595Z_pid31617_dd3983c1.xcresult`; QA-before `test_sim_2026-10-01T19-54-06-588Z_pid31617_6da91b6c.xcresult`; QA-after `test_sim_2026-10-01T19-45-58-694Z_pid31617_42befda6.xcresult`.

Final fix uses QA preference at the root **and each sheet presentation boundary**, environment-resolved UIKit paragraph color, and QA-only toolbar color scheme/visible background. Default direct launch with actual system-dark readback was also observed on iOS26; this remains a bounded first-page observation, not its default-system full matrix. Normal appearance remains nil and toolbar background automatic. The native title is neither hidden nor replaced. All findings still fail the audit; no suppression or expected-failure workaround.

One maximum-chain exploratory run ended with runner signal-kill (`test_sim_2026-10-01T18-17-09-679Z_pid31617_38bb9a67.xcresult`), cause unconfirmed. Later standard/max chain and large-entry tests passed in `test_sim_2026-10-01T18-54-38-576Z_pid31617_9fd5c7ed.xcresult`; its separate dark audit FAIL remains recorded and was fixed before the final palette runs.

Comparison screenshots: [system-dark](nav-system-dark.png), [QA before](nav-qa-dark-before.png), [QA after](nav-qa-dark-after.png). A further background pixel at (120,65pt) is system/before=(28,28,30,255), after=(40,41,40,255); (200,55pt) is system/before=(28,28,30,255), after=(40,41,41,255). Raw title measurements and screenshots agree on white foreground; the failure cannot be described as a proven physical white-on-white rendering error.

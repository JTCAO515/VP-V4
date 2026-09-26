# VPJ-56 unrun conditions

- The 2026-09-09 repository preparation had no CI execution yet. Later Native iOS checks run
  on the approved self-hosted Mac; their results must be assessed per commit and workflow.
- 2026-09-25: Apple account, Team `NLD68762GG`, Bundle ID, signed Archive/export and
  App Store Connect upload/processing were observed for `0.1.0 (20260924.163820)`
  ([record](signed-testflight-20260925/verification.md)). Physical TestFlight installation,
  build withdrawal and certificate rotation remain UNRUN; no signing secret was committed.
- The iOS 27 SDK upload was accepted for this build. Physical-device installation,
  VoiceOver and product acceptance remain UNRUN; no CI or upload result substitutes for them.
- The exact build `0.1.0 (20260924.163820)` is now assigned to the existing one-tester
  VisePanda Internal group and is visible in JTs17 TestFlight ([record](testflight-install-20260925/verification.md)).
  Device installation remains UNRUN pending action-time confirmation for the UI install.
- VPJ-01 #188 is CLOSED; VPJ-56 #237 acceptance remains open.
- 2026-09-24 X1 (#508): the unsigned Archive and Xcode Cloud device Build evidence remains
  [recorded](cloud-build-20260924/verification.md). The first post-#528 Cloud script failure's
  raw log and cause were not observed in that run; the later successful Build did not explain it.
- Later 2026-09-25 device readback ([record](testflight-install-20260925/verification.md)):
  earlier TestFlight visibility of `0.1.0 (20260924.163820)` is historical. Action-time
  installation authority was granted, but a single bounded client retry ended with
  “TestFlight cannot connect to App Store Connect.” The device still had developer build
  `0.1.0 (1)` before retry; the old app backup remained mode 700 and intact. Current
  TestFlight client reachability/build readback are FAIL; installation, launch and
  post-install data checks remain UNRUN. The client error cause is unknown. This supersedes the earlier
  “pending action-time confirmation” and present-tense device-visibility wording above.
- Latest 2026-09-25 08:36 JTs17 observation ([record](testflight-install-20260925/verification.md)):
  JT saw exact internal build `0.1.0 (20260924.163820)` over Wi-Fi and tapped Install;
  TestFlight returned “所请求的 App 不可用或者不存在。” **Installation FAIL**, superseding the
  prior UNRUN installation state. CoreDevice still read developer build `0.1.0 (1)` afterward.
  Target launch and post-install data checks remain UNRUN; old app backup remains intact.
  The error cause and current App Store Connect agreement status are unknown.
- Main's later authenticated ASC readback at about 08:55 on 2026-09-25
  ([record](testflight-install-20260925/verification.md)) reconfirmed target upload Complete,
  binary Validated, Internal / Testing, one Accepted tester and non-expired iOS-compatible
  build. Free Apps Agreement was active; Paid Apps Agreement remained unsigned.
  The unsigned paid agreement's relationship to the device installation FAIL is unknown,
  and target launch/data checks remain UNRUN. The earlier agreement-status unknown was
  a time-limited browser-session gap, not a current account-state assertion.

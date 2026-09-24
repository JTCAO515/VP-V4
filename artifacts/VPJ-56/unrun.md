# VPJ-56 unrun conditions

- The 2026-09-09 repository preparation had no CI execution yet. Later Native iOS checks run
  on the approved self-hosted Mac; their results must be assessed per commit and workflow.
- 2026-09-25: Apple account, Team `NLD68762GG`, Bundle ID, signed Archive/export and
  App Store Connect upload/processing were observed for `0.1.0 (20260924.163820)`
  ([record](signed-testflight-20260925/verification.md)). Physical TestFlight installation,
  build withdrawal and certificate rotation remain UNRUN; no signing secret was committed.
- The iOS 27 SDK upload was accepted for this build. Physical-device installation,
  VoiceOver and product acceptance remain UNRUN; no CI or upload result substitutes for them.
- VPJ-01 #188 is CLOSED; VPJ-56 #237 acceptance remains open.
- 2026-09-24 X1 (#508): the unsigned Archive and Xcode Cloud device Build evidence remains
  [recorded](cloud-build-20260924/verification.md). The first post-#528 Cloud script failure's
  raw log and cause were not observed in that run; the later successful Build did not explain it.

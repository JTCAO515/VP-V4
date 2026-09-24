# VPJ-56 unrun conditions

- The 2026-09-09 repository preparation had no CI execution yet. Later Native iOS checks run
  on the approved self-hosted Mac; their results must be assessed per commit and workflow.
- Signed Archive, Apple account/Bundle ID ownership, certificates and rotation, TestFlight
  upload/install/withdrawal: UNRUN; operator-owned work, no signing credentials used.
- Actual upload SDK policy, physical-device/VoiceOver/product acceptance: UNRUN; not implied
  by Simulator builds, automated structural accessibility checks, or this CI preparation.
- VPJ-01 #188 is CLOSED; VPJ-56 #237 acceptance remains open.
- 2026-09-24 X1 (#508): the repository signed-Archive path exists. The manual workflow's
  unsigned Archive passed on main `6200724b` with bundle readback ([record](cloud-build-20260924/verification.md));
  Xcode Cloud device Build also passed on that commit after the first post-#528 clone-script
  failure. Signed Archive/export, upload, TestFlight install and on-device Ask/Trip remain UNRUN.
  The first Cloud script failure's raw log and cause are unavailable without Apple account access.

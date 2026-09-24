# VPJ-56 unrun conditions

- Hosted GitHub macOS execution: UNRUN during repository preparation; inspect the new PR's
  Native iOS check and uploaded evidence before claiming hosted build/test acceptance.
- Signed Archive, Apple account/Bundle ID ownership, certificates and rotation, TestFlight
  upload/install/withdrawal: UNRUN; operator-owned work, no signing credentials used.
- Actual upload SDK policy, physical-device/VoiceOver/product acceptance: UNRUN; not implied
  by Simulator builds, automated structural accessibility checks, or this CI preparation.
- Full VPJ-01 #188 and VPJ-56 #237 acceptance remain open.
- 2026-09-23 X1 (#508): the repository signed-Archive path exists and its unsigned Archive
  passed locally ([record](signed-archive-20260923/verification.md)). Signed Archive/export,
  the manual workflow's first run, upload, TestFlight install and on-device Ask/Trip remain
  UNRUN; the privacy-manifest upload requirement is an open blocker for the first upload.

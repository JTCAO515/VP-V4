# WEB-10 frontend acceptance record

## Automated scope

The committed Playwright suite verifies the Homepage, password sign-in, and
Product Shell at 320, 390, 430, 768, 1280, and 1440 pixel viewport widths. It
also checks that the Product Shell accepts keyboard focus, changes to RTL when
Arabic is selected, and that the sign-in surface exposes password and announced
error controls.

The suite runs against a local Next production server after a fresh local build. It is intentionally a
supplement to the existing static contract suites; it does not assert backend
authentication success, live travel data, maps, or third-party account flows.

## Evidence and residual checks

Command outcomes are recorded in `artifacts/WEB-10/commands.jsonl`.

The following checks require an assistive technology, physical device, or
release-preview environment and remain explicitly unrun: VoiceOver/TalkBack
reading-order checks, virtual-keyboard and safe-area behavior, 200% browser
zoom on physical devices, and Preview/production rollback smoke. They are not
represented as passing acceptance evidence.

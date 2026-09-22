# Daily review corrections — 2026-09-22

Related to #187, #206 and #269. Explicit operator request: review all work from today, repair uncommitted/CI gaps, merge reviewed PRs, and write the daily report. This PR contains two narrow corrections discovered in that review and preserves the sole observed group of uncommitted fixture rerun outputs.

## Corrections

- Native AI-assist polls now share one ContinuousClock deadline. The transport (including any session refresh) races the remaining deadline; losing work is cancelled and data received after expiry cannot become a success. The pending delay cannot exceed the same deadline. Existing identity/token guards remain.
- The English label for `original_valid_booking_id` now says “Original identity document used for booking”; it no longer suggests a booking reference number. Reviewed source facts and Chinese copy are unchanged.
- `uncommitted-fixture-rerun.patch.gz` and its SHA-256 manifest preserve the 12 uncommitted artifact differences found in the place-consumer worktree. They contain commit/timing and randomized blind-review rerun changes. They are an observed historical local snapshot, not new implementation or independently attested runtime acceptance. The original worktree remains untouched; historical canonical artifacts are not overwritten.

## Verification

- PASS: source policy lint; Swift syntax parse; docs check; diff whitespace check.
- PASS: actual `aiAssistData` source extracted and compiled with Swift 6 on macOS; before-deadline success, expired no-dispatch, and cancellation/late-data rejection all pass. This is a Foundation-only probe, not an iOS app build.
- PASS: direct import verifies the corrected English claim label; all preserved JSON artifact files parse, and compressed patch checksum is recorded.
- Added three XCTest cases for the same behavioral boundaries. Complete application build/test and required remote checks remain pending on this PR head; the existing serialized Native CI queue is authoritative.
- UNRUN: real model/provider search, Staging or production changes, physical VoiceOver, full parent-Issue acceptance. No new provider spend or database migration execution.

Rollback: revert this PR. Restoring old local fixture outputs is possible from the preserved patch; no source cleanup or destructive reset was performed.

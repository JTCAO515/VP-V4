# VPJ-12 synthetic screenshot preview — 2026-09-17

PASS: a closed in-memory synthetic field bundle distinguishes added, duplicate and
conflict values with line locators. User correction returns a time-bounded pending
proposal only. Replay is owner-scoped; raw media fields, invalid/expired TTLs and
cancelled imports fail closed. No image, OCR text, provider call, artifact storage
or Trip write is accepted.

Focused contract tests pass4/4; TypeScript and diff checks pass. This is C0
preparation, not Photo Picker, screenshot receipt, OCR or product acceptance.

## Native on-device review increment — 2026-09-17

Implemented a single screenshot picker on the Trip screen, local Vision text
recognition, source-line display, and editable date/amount/address/status
fields. The local review keeps data in the sheet and clears it on close or
account change. The selected Trip's saved dates support an exact duplicate
check; other fields remain for manual comparison. No network or Trip mutation
is called by this screen.

Xcode 27 / iOS 26.5 simulator build and launch PASS with no warnings after the
PhotosPicker label isolation fix. Focused native model and bilingual UI tests
PASS 3/3: calendar-date comparison and the local review open/close route in
English and Chinese. The English initial review sheet was visually inspected
from the XCTest screenshot attachment; no clipping was observed. Broader native
run: 12 passed, 3 failed in existing `NativeTripStateTests` synthetic login
setup. The same `testLateRefreshCannotReviveSessionAfterTripDenial` fails at the
same assertion on the unchanged #470 checkout; this failure is retained, not
attributed to the screenshot change or reclassified as a pass.

PR #472's first Native CI run failed two `AppShellUITests` contrast audits:
the new preview button shifted existing Trip text beneath the translucent
tab bar. The button was moved to the Trip navigation toolbar. The affected
light/dark, zh/en accessibility audits and both screenshot-entry UI tests
then passed locally (4/4, zero skipped). The original CI failure remains
recorded; the updated PR head passed Native CI, Quality and Vercel before
merging as PR #472 (`b61d9d2`).

## Owner-scoped native inbox and proposal connection — 2026-09-18

The selected raster image is validated and stored only in a file-protected,
backup-excluded, owner-scoped on-device inbox while its local Vision OCR is
reviewed. A 24-hour logical expiry denies reads and next access purges files;
Close and successful proposal preparation delete the receipt. A deletion
failure stays visible. No image/OCR bytes are sent to a server or provider.

The user chooses and corrects one date plus optional amount/address/status
source lines. A deterministic image+Trip+field ID makes exact replay a no-op
and changed user correction a visible conflict. Corrected fields become a
local Trip draft only for the same active owner and saved Trip version, then
use the existing proposal API. The saved Trip still needs the separate
proposal review and explicit confirmation; the screenshot never writes it.

Xcode 27 / iOS 26.5 focused inbox/OCR/draft and bilingual screenshot UI tests:
8 PASS, 1 expected UNRUN when the simulator Photos fixture was absent. After
adding an actual simulator screenshot to Photos with `simctl addmedia`, the
gated picker→selected image→Vision source-line UI test PASS 1/1. The
`screenshots` subtype filter did not expose that imported asset; the single
image filter did, without granting full-library access. Real authenticated
TripProposal/confirm/reload is not claimed from this simulator-only evidence.

The full native simulator suite on the preceding candidate passed 78, failed
0, skipped 26 (285 seconds). Subsequent review fixes have focused passing
tests; the exact final commit still requires remote Native CI. The skipped cases include environment-gated native
integration and the picker test without a seeded photo. A separate seeded
picker run passed 1/1. The file-backup-exclusion property passed on Simulator;
the physical file-protection attribute is UNRUN because this Simulator does
not report the attribute and the connected iPhone is unavailable.

Independent read-only review found one P2 ambiguous-acknowledgement path:
the proposal POST could succeed while its subsequent read failed, causing a
retry to POST again. The native store now treats that outcome as unknown,
reads the existing pending proposal first, compares exact patch/base version,
and only permits a new POST after a successful no-pending response. A URLProtocol
test simulated POST success plus lost read and then recovery; it passed 1/1
with exactly one POST. The reviewer could not run its own simulator build in
its sandbox; our XcodeBuildMCP test result is the build/test evidence.

A second independent read-only review found an old-owner cleanup failure could
be hidden by account replacement while a protected screenshot was open. The
native Trip screen now clears the narrow app-owned inbox on scope changes,
keeps a visible cleanup-pending warning on failure, and retries when protected
data becomes available. The owner A/B delete-all unit path and affected native
UI/recovery tests passed 6 active / 2 expected environment skips. Actual
locked-device enforcement remains UNRUN without the physical iPhone.

The third independent read-only pass found one P2 field-length mismatch:
the correction control allowed 160 characters even when the source prefix
made the Trip item title longer than its 160-character contract. Both UI
validation and draft construction now call the same title builder. The exact
fit/overflow test and affected proposal/UI tests passed 6 active, with the
unseeded picker test skipped as expected.

The fourth independent pass found that a local draft could be edited while
an earlier POST's outcome was unknown, defeating exact-patch reconciliation.
The native editor/discard paths are now locked during that state, and the
store retains the submitted patch for recovery. The lost-read/no-second-POST
test checks the lock and passed with the affected draft tests (4/4).

The submitted PR's exact-head review found one more P2 TTL gap: an already
open review could submit a cached digest after the image receipt expired.
The UI now invalidates an open review at expiry and re-reads the owner-scoped
receipt before any Proposal request; a missing/expired/corrupt file fails
closed. Focused inbox/recovery/UI tests passed 6 active, with the expected
unseeded-picker and physical-protection skips. The earlier PR head's CI was
green; this correction requires a new exact-head CI run.

The next PR review found a P2 deterministic rejection trap: a server
`STALE_TRIP_VERSION` response left the draft in an uncertain state even though
the proposal was not created. Only definite pre-insert stale/invalid responses
now unlock it. A new synthetic owner-bound transport test returned 409 and
verified that the local draft can be discarded; both recovery tests passed
2/2. Transport loss remains read-before-repost.

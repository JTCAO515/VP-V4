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

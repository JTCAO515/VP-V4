# #681 / PR688 keyboard focus correction

Base: `9871529fca1e99447e0442ea046ebf64be10bb55`. Same owner, branch and new-path lease. Only sample component, its browser proof and this dedicated evidence changed. Previous baseline evidence remains intact and did not cover these newly asserted focus boundaries.

Source SHA256 (`QaDemoWorkspace.tsx`): `03ece0a86cc918dd46d656010cfced8ba5c2875371412c611caf816734505adf`.

Change: explicit submission/reset/return actions request one focus update. A layout effect consumes the request after React commits the mounted/enabled DOM, targeting the textarea or Reset when the selected fixture is full. Ordinary typing, navigation, Session selection and other state changes do not request focus.

PASS — lint, typecheck, the two sample fixture/import-boundary tests and diff check. Production rebuild was necessary to render the changed component; its output is retained with progress-line whitespace normalized. Unchanged 22 baseline tests were reused, not rerun. No backend/DB/provider test matrix was started.

PASS — real local Chromium on production server `127.0.0.1:3181`, 1440×1000 and 390×844:

- 11 preset interactions followed by keyboard input/Tab/Enter for interaction 12: disabled input, `document.activeElement === Reset`.
- Full Session → Memory by keyboard (Memory keeps focus) → return to VP by keyboard: `activeElement === Reset`.
- Press Enter on that Reset: two initial messages, enabled input, `activeElement === textarea`.
- Each non-full empty-state return via keyboard: `activeElement === textarea`.
- Ordinary Session navigation: `activeElement === clicked Session button`, no forced textarea focus.
- Existing preset, unknown input, reset, empty-state, refresh and viewport checks continue passing within the same scoped script.

PASS — tested flows still have zero unexpected network requests, fetch/XHR/socket/beacon/storage/cookie/indexedDB attempts, browser cookies, console warnings/errors or page exceptions. Existing IO guards remained enabled. Results JSON includes the exact source hash; screenshots and production build log accompany this record.

UNRUN — PR688 independent delta review/remote CI/merge, deployed QA, actual Auth/consent/persistent Session/provider, human/device acceptance. No new PR, shared-path edits, permission change, deployment or resource connection performed. #681 real AC remain open. Only this owner's local server was restarted to serve the new build; other resources untouched.

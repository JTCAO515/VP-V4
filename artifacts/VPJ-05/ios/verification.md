# VPJ-05 local native Trip consumer

Related to #192; this slice does not close the Issue.

## Implemented scope

The opt-in loopback native app reads real trips, creates an owner-scoped empty Trip, edits a separate in-memory Day/Item draft, requests a persisted proposal, displays its changes, and explicitly confirms the exact reviewed proposal ID/revision/digest. Confirmation reloads the server's version-matched immutable snapshot; it does not synthesize confirmed content locally. The native protocol is `/api/trips/native/v2`, served by the parallel server worktree on `http://127.0.0.1:59931`. No iOS code starts a service or uses a service-role credential.

Default/remote-disabled launch still uses the existing preview screen and scaled workflow badges. Native `initial`, `confirmed` and `unknown` snapshot states are displayed from the server's explicit confirmationState; missing state is unknown. Version number alone is not a confirmation receipt. User hard locks remain unavailable and external order status remains unknown. Neither is displayed as a successful booking or protected lock.

## State and confirmation boundaries

- Only an active session authorizes a request or displays cached Trip data. Cache ownership includes endpoint, subject, mobile epoch and a local generation. A temporary authentication network failure hides data and preserves the same account's unsent draft in memory. This retained ownership cannot authorize requests. Logout, replacement or account/epoch change clears it; no disk or cross-launch draft store was added.
- Every identity async reply checks its initiating generation before changing credentials or profile state. A late refresh cannot revive a session after a Trip 401. Trip responses also recheck the active scope, and the UI synchronously requires cache scope equality before rendering.
- Proposal creation leaves confirmed content unchanged. A stale draft keeps its original basis and edits. Reload displays the latest saved snapshot alongside the retained draft; it does not automatically rebase. Discarding is explicit. A pending proposal must be rejected before its local draft can be discarded.
- The confirmation dialog binds the exact displayed proposal reference. It forwards the server's opaque digest unchanged and retains a confirmation idempotency key for retry. Only a successful server result followed by a confirmed snapshot reload produces the success notice.

## Actual local checks

The dedicated iOS26.5 Simulator A was used: `B8B7B17F-A447-487E-B52C-31A303CF713A`. Only local ad-hoc Simulator signing was used; no Apple Team, certificate, provisioning profile or physical device was changed.

Four deterministic Trip state checks passed, including a controlled URLSession race (Trip pending → refresh pending → Trip401 → refresh200), account-change late-response rejection, immutable confirmed content under draft edits, and temporary authentication failure/draft recovery/logout clearing. Eight existing navigation contract tests and the remote/missing-endpoint guard also passed in the relevant local runs. These controlled transport tests are not the real API acceptance below.

Real Swift integration run `20260910-084956` passed against the separately supplied local synthetic account: create version0; propose Day/Item without changing content; explicitly confirm and reload version1; independent consumer reload; a second confirmed change to version2; stale local draft retention; and replaced-session rejection with cache clearing. The expanded actual run `20260910-090916` also confirmed item deletion to version3 and day deletion to version4, with persisted reload after each. This tests actual iOS URLSession, Next HTTP and server persistence. Its second consumer is another Swift coordinator, not a browser; browser reciprocity is recorded below.

Actual UI runs passed in all four cases: en normal `20260910-085934`, zh normal `20260910-090408`, en system maximum `20260910-091058`, and zh system maximum `20260910-091439`. Normal and maximum screenshots were visually inspected; text wraps vertically and the actions remain reachable in the scroll view. This is functional/visual evidence, not a full accessibility-audit pass.

Browser reciprocity also passed through the actual native UI. The coordinating root performed the browser writes; this consumer only read the two shared Trips:

| Trip | Native assertions after browser confirmation |
| --- | --- |
| `07457177-9827-4a30-8d49-8169083f2cea` | Version1 confirmed; `Web ↔ iOS 合成行程 09010`; `2026-09-15`; `合成博物馆停留` |
| `570b2d6a-67cc-4764-8afe-1ab313503906` | Native-created version1 was read and renamed by Web, then native read confirmed version2: `iOS 与 Web 已互证 570b`; `2026-09-10`; original `Synthetic museum visit` retained |

Actual UI records and screenshots are identified in `commands.jsonl`. UI tests set the Simulator's real system content size, without an app text-size override. They operate login, creation, adding/removing draft days/items, review, a second explicit confirmation action, and app termination/relaunch plus same-ID reload.

Final regression `20260910-092816` passed 13 unit/state checks (4 Trip state, 8 existing navigation, 1 remote/missing-endpoint) and 2 existing preview UI checks (English tabs/Today/translation navigation and normal-size zh/en workflow badge pixels). Default launch remained a preview with no native API activation. `pnpm docs:check`, Python runner syntax parsing and `git diff --check` passed. The related server/SQL checks and PR CI are coordinated separately; no Web/server test result is invented by this consumer.

The final two browser-reciprocity UI runs are `20260910-092438` and `20260910-092611`; screenshots include the complete version/ID/title/date/item card. The earlier reads also passed; the repeats improved evidence framing only.

## Failures retained and corrected

- `20260910-084744`: first real creation response was rejected because Swift's uppercase generated UUID was compared to PostgreSQL's lowercase UUID. Creation IDs are now canonical lowercase; the next actual integration passed.
- `20260910-085208`: actual UI confirmation exposed a SwiftUI `BindingOperations.ForceUnwrapping.get(base:)` crash when the optional draft was cleared. Drafts now have a unique editor identity and a safe departing-view binding whose setter cannot recreate an absent or different draft. Subsequent real UI confirm/relaunch tests passed. Full raw xcresults remain in the local cache, not copied wholesale into the repository.
- `20260910-090100`: the first Chinese UI attempt clicked a disabled editor before its pending-proposal read finished. The UI test now waits for real enabled state before interaction; the Chinese rerun passed without a product workaround.
- The earlier foundation's four iOS17.5 audit failures and full maximum-size contrast diagnostic **FAIL** are not waived or reclassified here. Physical VoiceOver, physical Dynamic Type/Reduce Motion, remote identity/data activation, Store signing/release, hard-lock persistence and real external orders remain **UNRUN/incomplete** under their owning acceptance.

## Reproduce

Build this checkout with Xcode, the recorded Simulator and `CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-`. Use `ios/scripts/run-local-trip-tests.py --help` for the runner. It requires an explicit protected synthetic credentials file and derived-data directory, supports only the named local API and dedicated A/B Simulators, and starts no server/database. It creates a mode0600 transient xctestrun, removes it after execution, and redacts the test password from retained logs. No credentials are written into evidence.

`commands.jsonl` contains full xcodebuild invocations, exits, locales, actual system size and result paths. Generated xctestrun paths are intentionally removed; regenerate them with the runner and the still-authorized local credentials file. No production, migration, provider, payment or external-message action is performed by this consumer.

After testing, Simulator A was restored to system size large and shut down. B was not used and remained shut down. The server process remains owned by the parallel server task. No transient credential xctestrun is retained.

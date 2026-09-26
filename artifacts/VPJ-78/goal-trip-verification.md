# VPJ-78 goal-to-existing-Trip slice — 2026-09-27

Related to #559. Base `2f7b118ab472657161f2fdbe558433fe860abc96` after #571. This is a third bounded slice, not full #559 acceptance.

## Result and authority

The native v5 assistant lets the signed-in traveller select an existing Trip from the owner-scoped Trip list and separately confirm its title/head version before linking or retargeting. Unlink has a separate confirmation. The server uses the existing mobile actor/session gate, goal/conversation owner and current scope, selected Trip owner/head version, exact link CAS and operation UUID. It stores only Trip ID/version plus a versioned link and operation receipt; it copies no Trip content and writes no Trip/Proposal. Every link, retarget or unlink increments goal scope and link version, invalidating older goal/context/result basis. A stale Trip head or archive is marked noncurrent on read.

The confirmed Trip deletion request already requires recent reauthentication and exact Trip head. Its new append-only admission trigger atomically detaches **only the requested Trip's** goal links and records `trip_deletion_confirmed` receipts before queuing the tombstone. An exact request replay does not detach again. New links check the queued/completed tombstone under the Trip lock and fail. Link/retarget/unlink lock all involved owned Trips in UUID order before link/goal; deletion already holds its Trip before link/goal. A real two-connection interleaving test proves deletion 202 and retarget 409 without a half-link or false completion. Finite deletion lock contention returns unavailable for retry. Deletion execution rechecks goal links alongside existing chat/Turn references before deleting; queued and completed remain distinct.

The ordinary goal/link version cap is 10000. Terminal unlink or confirmed Trip deletion reserves monotonic version 10001, and a trigger prevents ordinary amendments from consuming it. Old goal/context/result/action source versions are therefore stale even at the cap; no saturated same-version detach is allowed. Explicit unlink remains allowed after text-consent withdrawal under the same owner/mobile session and CAS. When the v5 producer flag is off, the native Trip authority still permits a minimal owner-only link list/read/unlink; it never reopens link creation. The v5 Ask surface presents this privacy control without restoring goal text or consent. Export/erase service seams exist for these new references, but the all-user-data executor is not connected by this slice.

The #560 comparison publisher still rejects non-null Trip. A current goal→Trip link is necessary context for a later publisher change, but it does **not** authorize publishing an older task answer for that Trip. A later owner must validate a fresh task/result basis for the new goal scope and exact Trip head before accepting non-null Trip.

## Verification

| Check | Result | Scope |
| --- | --- | --- |
| `node tests/integration/turn/run-native-http.mjs` | PASS 6/6 on #571 base | Disposable local Auth/Postgres/HTTP: real Trip link/retarget/unlink, confirmed TripProposal version drift, cross-owner and same-owner unrelated goals/Trips, deterministic two-connection deletion lock race, queued/execute fault injection, cap 10000→10001 and old context 409, withdrawal and feature-off privacy unlink, export/erase; link path caused zero model calls |
| `node --experimental-strip-types --test tests/security/turn/native-assistant-trip-http.test.mjs` | PASS 4/4 | Default-closed link producer, feature-off Trip-authorized privacy list/read/unlink, closed confirmed input, replaced mobile session and aborted late read |
| `VP_NATIVE_ASSISTANT_ONLY_TRIP_LINK=1 VP_NATIVE_ASSISTANT_OUTPUT=/tmp/vpj78-goal-trip-ui-20260927-0415 VP_NATIVE_ASSISTANT_SIMULATOR=B0AD77FD-33C3-4616-92CE-2E76ACD93148 node tests/integration/turn/run-native-http.mjs --assistant-native` | PASS 1/1 | Actual iPhone 15 Pro iOS 17.5 Simulator UI with disposable local Auth/Postgres/HTTP: select and confirm Trip A, App restart/readback with active composer, retarget Trip B, confirm unlink. `modelCalls=0`, `messages=1`, `goals=1`, `taskAttempts=0`, `tripLinkReceipts=3`. Visually inspected [linked](goal-trip-linked-readback.png) and [unlinked](goal-trip-unlinked.png) screenshots; xcresult retained locally at `/tmp/vpj78-goal-trip-ui-20260927-0415/tests.xcresult`. |
| `node scripts/ci-suites/db-integration.mjs --lane supabase-rls` | PASS 22/22 | Disposable local RLS and authenticated RPC allowlist |
| `node scripts/ci-suites/db-integration.mjs --lane postgres` | PASS 129/129 | Disposable local migration compatibility and Turn/Trip/action receipt regression after #571 |
| `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm docs:check`, `git diff --check` | PASS | Affected source, Next route, native contract and docs |
| `pnpm test:contract` | PASS 691/691 | Full contract suite after #571 |
| `pnpm test:security` | PASS 189; suite INCOMPLETE | One AI-14 local RLS probe skipped without its disposable target; the separate full Supabase RLS lane passed |
| `pnpm test:integration` | PASS 39 always-on; suite INCOMPLETE | 123 target-gated cases skipped in this command; the affected real disposable HTTP suite ran separately above |
| `pnpm db:verify` | PASS baseline check | Local connection probes report not configured; no Production connection attempted |

Local provider is synthetic, but these link actions made no provider request. Staging, physical iPhone, Production migration/data, external model consumption, and a #560 non-null Trip result are **UNRUN**. Code implementation, local observation, overall #559 acceptance and release remain separate.

## Risk and rollback

The Trip link row retains an owned Trip ID/version and blocks direct deletion while active; confirmed deletion admission detaches it atomically. Transient lock contention must fail/retry, never claim deletion completion. Historic receipts drop their Trip ID when that Trip is eventually deleted. A text-consent withdrawal hides conversation content but does not block owner privacy unlink or confirmed Trip deletion. The current native pending link request is retryable with the same operation while the app stays open; process-death recovery of an unknown acknowledgement remains UNRUN. Roll back the new-link producer while retaining the Trip-authorized privacy list/read/unlink and confirmed Trip deletion detach; use a reviewed forward compatibility repair for any already applied migration. Never rewrite applied history or restore a deleted Trip link.

# VPJ-05 — verified local same-Trip consumers

Related to #192 and its #191 identity dependency. This delivers a complete local synthetic Web/iOS create → draft → review → explicit confirm → persisted reload flow. It does not close either parent Issue or enable remote/customer traffic.

## Result and authority

The same ordinary owner can create and read the same Trip IDs from native Swift and Web. Day/Item edits remain drafts until a persisted Proposal is visibly reviewed and explicitly confirmed through the existing TripPatch/CAS transaction. Stale versions preserve the user's draft; retries bind the exact proposal and opaque digest. Both confirmation and rejection leave history restore controls usable. Native data visibility and requests require the current account/mobile epoch; a late response cannot resurrect replaced credentials or display another scope's cache.

Migration `20260910002858_vpj_05_confirm_intent_authority.sql` binds confirmation receipts, rejects forged/cross-owner authority and preserves unbound legacy receipts without guessing their meaning. Root independently performed a real27→28 upgrade: prior Trip content, snapshots and receipt fields remained unchanged, old ambiguous replay failed, and a fresh concurrent retry applied once. No remote migration occurred. Default Web callers retain the legacy protocol until a coordinated upgrade and explicit v2 activation.

## Actual checks

| Check | Result and scope |
| --- | --- |
| `pnpm check` | PASS: lint, typecheck, production build and22 static/copy tests in an isolated build copy;249 runtime/config files independently matched the working tree |
| Unit / contract / eval suites | 92 /199 /25 passed, zero skips; the earlier expired-clock failures are resolved by merged PR299 |
| Security / repository E2E | 99 /40 passed, zero skips; browser interaction evidence is separate |
| Full integration with both local consumer opt-ins | 31 passed,0 failed,10 budget-environment skips; aggregate remains **INCOMPLETE**, not all-green acceptance |
| Actual identity and same-Trip integration cases | Both ran against the designated disposable local Auth/HTTP/database, rather than skipping; exact backend lock ordering, replacement/replay denial, owner isolation and bidirectional Trip writes passed |
| `pnpm db:verify` | Command PASS; probe reports `explicit-local-service-running`, with RPC paths available for explicit probing. The integration/upgrade tests supply the actual database assertions |
| Native Swift and UI | Real URLSession/API persistence and replacement tests; four zh/en normal/system-maximum UI runs; two actual cross-client reciprocal reads; final13 unit/state plus2 default-preview UI regressions passed |
| Browser |1440×900 and390×844 checks; both cross-client Trip IDs/reloads; no pre-confirm write; stale draft retained; explicit discard/reject; restore-confirm/reject controls passed |
| Migration preservation | Real27→28 upgrade and retained-data comparison passed; the root-only upgrade instance was subsequently stopped with its backup/volume preserved |

`commands.jsonl` records the integrated commands and points to logs. Detailed native commands/screenshots are in [ios/verification.md](ios/verification.md) and [ios/commands.jsonl](ios/commands.jsonl); browser actions in [browser-root/verification.md](browser-root/verification.md); server/adversarial cases in [server/verification.md](server/verification.md); upgrade assertions in [upgrade-root/verification.json](upgrade-root/verification.json). No credentials are committed. Retained build-log lines have trailing whitespace normalized; the original log remains in the local test cache.

## Failures and corrections

The first parallel integration run passed30 and failed1 (10 skipped): the old identity test held a real owner write for a fixed two-second sleep, and its observer missed the replacement lock wait. An unchanged serial diagnostic passed31. The test was then corrected to hold a unique advisory gate explicitly, observe the actual write backend PID, prove `pg_blocking_pids` links replacement to that writer, and release the gate with bounded cleanup. The final normal integration command passed31 with the same10 unrelated environment skips. The original failure and serial diagnostic are retained in `integrated-logs/`; they are not relabeled as passes. Production guard semantics were not changed by this test correction.

Earlier Swift creation-UUID, departing-view Binding crash and stale-session resurrection defects were corrected and independently reviewed. Their evidence remains in the native report. The Web rollback state defect and outdated rejected notice were corrected and verified through actual browser actions. An observation that overlapped source hot reload remains explicitly inconclusive, separate from the final stable-source passes.

Independent code review of application HEAD `7e63fe2b4e41d925f65bab76991057885663e0a2` found Critical0 / Important0 after the fixes. Final test/evidence delivery and exact PR HEAD/CI review are recorded in the PR; no unrun CI outcome is asserted here.

See [unrun.md](unrun.md) for full product, remote and policy boundaries. Current synthetic services/fixtures remain local; no provider budget hold was reset and no provider invocation was added.

The first PR301 Native CI failed. A controlled same-source comparison identified the signing-disabled Keychain precondition; the CI test host now uses verified local ad-hoc signing, with application logic and all assertions unchanged. See [ci-signing/verification.md](ci-signing/verification.md) for the original failures,4/4 local state result and separate UI observations. Corrected remote CI status remains authoritative in the PR.

## 2026-09-17 capability-state completion

The remaining code gap was not a missing booking integration; it was an ambiguous wire
value. Both the Web trip read route and the native v2 route previously returned the
string `unknown` for unrelated things: an unavailable user-hard-lock capability and an
absent external-order connection. That could be mistaken for a traveller's actual order
state.

`lib/server/trip/capability-state.ts` now supplies one closed shared projection:
`hardLocks:"not_enabled"` and `externalOrderStatus:"not_connected"`. Web and native
routes use the same helper. Native Swift decodes closed enums and rejects a changed or
unknown value; Web copy also fails closed for an unrecognised payload. Both UI surfaces
explain that the order value does **not** mean there is no booking. No Trip database,
patch operation, provider call, order import, payment or external fulfillment path was
introduced. Existing Day/Item snapshot, CAS, Proposal/Confirm/Patch and conflict behavior
are unchanged.

| Evidence | Result |
| --- | --- |
| `pnpm check` | PASS: lint, strict typecheck, Web production build, static tests 22/22 |
| `pnpm test:unit` | PASS 106/106 |
| `pnpm test:contract` | PASS 548/548; focused native HTTP and shared Web/native capability tests 9/9 |
| `pnpm test:integration` | Exit 0 but INCOMPLETE: 23 pass, 76 environment-gated skips. The pre-existing real same-Trip test is among the skipped cases because the Supabase CLI is unavailable in this environment. |
| `pnpm test:security` | Exit 0 but INCOMPLETE: 149 pass, 1 environment-gated skip |
| `pnpm test:e2e`, `pnpm evals`, `pnpm check:flags`, `pnpm check:assets`, `pnpm docs:check`, `git diff --check` | PASS: 40/40 E2E source checks; 35/35 evals; all named checks pass |
| iOS generic simulator build | PASS with `CODE_SIGNING_ALLOWED=NO` |
| iOS targeted Trip XCTest | PASS: `NativeTripStateTests` + `NativeTripShareTests`, 11/11 with local ad-hoc signing on iPhone 17 Pro UDID `42675EC5-6837-4F73-B478-7D979D5DA392` |
| iOS full XCTest | FAIL: six existing AppShell UI tests. The no-signing attempt also failed Keychain `-34018`; the signed retry fixed that host condition but retained the six UI failures. Four Knowledge and two Trip UI cases were explicit UNRUN fixture skips. |

The full simulator failure is not represented as a pass. It does not originate in the
changed Trip capability decoding: the affected targeted unit suite passes, the app builds,
and the shared route test covers the new native wire response. The unavailable local
Supabase CLI prevents a repeat of the old real cross-client stack, so this completion
relies on its retained prior evidence plus the new route-level contract test; it does not
claim a fresh database, Staging, device accessibility or real-user acceptance.

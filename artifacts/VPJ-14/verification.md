# VPJ-14 local runtime evidence

## Local regression refresh — 2026-09-17

PASS: the disposable local Supabase 2.117.0 stack completed the real GoTrue
Cookie → controlled Ops → independent reviewer → atomic audit → restart and
revocation suite, 7/7 with no skips. The runner now preflights the required
Supabase CLI before it creates its disposable directory, so a missing CLI is an
explicit environment failure and cannot leave an owned temporary stack behind.

PASS: the Ops configuration/request-boundary regressions passed 12/12. `pnpm
check`, unit, contract, docs and diff checks passed on this worktree. The
aggregate security suite was 149 pass/1 existing environment skip and aggregate
integration was 39 pass/77 environment skips; those aggregate skips do not
weaken the dedicated disposable Ops result. `db:verify` reported unconfigured
probes and made no production connection attempt.

The current shared Staging route remains disabled/no-member and thus has no new
browser submit/review/revocation observation in this refresh. Do not treat local
browser-capable integration evidence or the existing HTTP-based Staging slice as
the missing live browser-mutation evidence.

Verified 2026-09-11 (Asia/Shanghai) from `codex/ops-review-204`, based on main `cd2201194402b87e6322f4b703dd780707fcae2e`. This increment supplies private candidate review only. It does not activate real membership, publish a Fact, enable retrieval, touch a remote database, or close #204.

## Real Auth / HTTP / PostgreSQL

Final `VP_OPS_BROWSER_EXECUTABLE=<installed-headless-shell> node tests/integration/ops/run-local.mjs` exited 0: **8 tests passed, 0 skipped**. Without the optional browser executable, the runner exercises the seven Auth/HTTP/PostgreSQL cases. The runner created a new uniquely named `vp-ops-review-*` stack, applied all current migrations including `20260910200522_vpj_14_ops_candidate_review.sql`, and removed only that stack afterward. The separate UI-only synthetic stack was also removed. Existing development databases were not used or stopped.

Observed through actual GoTrue accounts and SSR Cookies:

- Default database switch denies access; empty/default membership remains controlled. An outsider with `user_metadata.ops=true` and `role=admin` is denied through both HTTP and direct RPC. Bearer/Cookie mixing is denied. Ops membership does not expose another synthetic customer's profile through existing RLS.
- Cross-origin writes, caller-selected author fields, empty inputs and wrong versions fail. Concurrent exact submission replay creates one candidate/audit; changed replay payload conflicts. Author self-review fails.
- A different member reviews the candidate. The result has two actor-attributed audits, `published:false`, and `retrievalEligible:false`. Another terminal review conflicts. The exact candidate and audits survive both a Next process restart and a PostgreSQL container restart.
- A real temporary PostgreSQL audit trigger raises an exception. Submission leaves no candidate or receipt. Review leaves the original pending version 1, one submission audit, and no review receipt. Removing the injected fault allows normal review.
- Concurrent opposing reviewers produce one success and one conflict, with exactly two total audits.
- Membership revocation and database disable reject previously successful receipt replay. Real GoTrue global sign-out removes the session; a frozen pre-sign-out Cookie is rejected for both list and receipt replay.

The runner ends with its stack removed. A directly invoked integration suite disables settings and clears its synthetic membership before returning; it requires an explicit disposable target and never discovers the repository's existing local instance.

## Browser evidence

The Browser runtime returned `No browser is available`, and discovery returned `[]`. UI QA therefore used a dedicated Playwright CLI session with the existing Chromium 1187 headless shell. The normal Chrome binary was absent and the cached full Chromium bundle was incomplete; neither existing user profiles nor their cookies were inspected.

Real browser flow: sign-in page → synthetic author → candidate form submission → author self-review notice → local sign-out → synthetic reviewer → `/ops/review` → independent review → expanded audit → refresh/read. The safe return-target allowlist initially redirected Ops login to `/visepanda`; the exact `/ops/review` entry and unsafe-path regressions fixed that defect.

- [Desktop, 1440×1000 viewport](desktop.png): candidate reviewed by a different actor, two audit entries, private/unpublished boundary visible.
- [390×844 viewport](mobile.png): no horizontal overflow (`scrollWidth=390`).
- [Arabic 390×844](arabic-mobile.png): `lang=ar`, `dir=rtl`, no horizontal overflow. All five locale headings, document languages and direction were checked; each reported `scrollWidth=390`.
- [Revoked member](revoked-mobile.png): after database membership revocation and Refresh, HTTP 403 clears candidate content and every submission/review form.

One transient HTTP 503 occurred during live development editing; the page failed closed and recovered through Refresh. A later fresh navigation reported 0 console errors and 0 warnings. Unauthenticated/revoked probes intentionally generated 401/403 resource errors. No production-browser or external-release claim is made.

## Repository checks

`pnpm check` (lint, typecheck, build, tests), `pnpm docs:check`, `git diff --check`, unit and contract suites passed. The static test command includes the repository's copy/claim scan. The focused Ops/navigation contract checks cover fail-closed local config, strict authority/input fields, and post-login open-redirect boundaries.

The aggregate integration/security commands exited 0 but reported **incomplete**, with 55 and 1 opt-in skips respectively. Those skips are not replaced by the dedicated 7/7 Ops live suite. `pnpm db:verify` reported `database-baseline-present` and unconfigured connection probes, not a live remote acceptance result. See [commands.jsonl](commands.jsonl) and [unrun.md](unrun.md).

## Independent-review I/O correction

The Important review finding was reproduced with hostile unfinished streams and stalled credentials/RPC. Final correction adds one shared 8-second deadline and request abort, early closed/auth rejection before reader acquisition, non-awaited cancellation, and late-credential/fetch dispatch fences. Known authority failures remain fail-closed; a dispatched mutation whose acknowledgement is lost returns `OPS_ACK_UNKNOWN`, without asserting SQL cancellation.

Seven focused request-deadline contracts pass: early denial without body acquisition, never-settling body/cancel, late auth after timeout/abort, shared auth/body budget, ignored-abort dependency, unknown-result exact replay/stale-generation handling, and old actor assertion versus new Cookie identity. The UI retains original operation ID/payload in memory and binds retries to the verified POST Cookie actor using a rejection-only assertion. Auth changes clear pending content.

Final fresh disposable run with `VP_OPS_BROWSER_EXECUTABLE` passed **8/8, 0 skips**: the previous real cases plus an actual browser that lets the POST commit, discards its response, then clicks same-operation retry. Both POST payloads/actor assertions match, and PostgreSQL contains exactly one candidate, one audit and one receipt. [Unknown acknowledgement at 390px](unknown-ack-mobile.png) shows the retained operation retry rather than a new-submission form. Existing layout/locale screenshots remain applicable; this new state was separately exercised and visually checked. Final `pnpm check` again passed all 22 static tests, lint/typecheck/build; current-head independent review remains pending.

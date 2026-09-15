# #360 (VPJ-76) verification — slice 8, the real Web trigger

## The design decisions this slice implements

JT chose, after this session laid out the tradeoff: **queued + polling**
for the AI-assist search's execution model, not a single synchronous
request (a multi-round loop can take tens of seconds; a held-open request
risks a timeout and loses all progress on a dropped connection). And
**Web first**, iOS as a deliberate follow-up. Full reasoning:
`docs/contracts/wiki-agentic-search.md`, "Slice 8".

No cron/worker process exists anywhere in this codebase, so the "queue" is
pull-driven: whichever request first observes a job as claimable claims it
and runs the search inline before responding; a concurrent poller sees
`pending`. See the migration's own comment
(`supabase/migrations/20260915200000_vpj_76_360_grounded_ai_assist_jobs.sql`)
for the full reasoning.

## What was built

- `turn_private.grounded_ai_assist_jobs` + `public.grounded_ai_assist_work_v1(p_input jsonb)`
  (new migration): a durable, owner-scoped job per turn, action-routed
  (`ensure`/`complete`), fenced by `claim_token` exactly like VPJ-75's
  `wiki_generation_jobs` reclaim. Authorization is
  `turn_private.text_owner()`/`turn_private.lock_turn()` — **not**
  `knowledge_review_private.current_actor()` (that raises `OPS_FORBIDDEN`
  for non-staff; the caller here is the turn's own owner).
- `lib/server/knowledge/wiki/grounded-ai-assist-job.ts`,
  `runGroundedAiAssistJob`: orchestrates ensure → (if claimed) run the
  slice-7 search → complete, catching a thrown search and completing the
  job as `failed` instead of leaking the claim.
- `app/api/chat/grounded/ai-assist/route.ts`: cookie-identity POST route,
  mirroring `app/api/chat/grounded/route.ts`'s auth pattern. Gated by
  `VISEPANDA_GROUNDED_AI_ASSIST=true` plus a configured provider
  (`VISEPANDA_GROUNDED_AI_ASSIST_PROVIDER`/`_CONFIG_ID`/`_API_KEY`) —
  unset in every environment until an operator configures it, matching
  every other real-model wiring in this codebase (none of which is
  connected to a live credential yet either).
- `components/chat/SavedAnswers.tsx`: a button appears only under a
  `blocked`-family notice, polls the route (1.5s interval, 20-poll cap),
  and renders the result with an explicit "AI-generated, not reviewed"
  disclaimer, visually separate from the reviewed answer above it.
- `lib/server/identity/user-data-adapter.ts`: one new generic method,
  `runGroundedAiAssist`, binding the cookie-authenticated Supabase client's
  `.rpc` to a caller-supplied orchestration function — this feature is the
  first adapter caller that needs several different RPCs under one
  authenticated actor rather than one fixed pair.

## What was verified

### Real database (native PostgreSQL 16, no Docker — same constraint as every other VPJ-75/76 slice)

All 59 real migrations (full history through this slice's own) replayed
against a real instance, using this repo's own auth-stub pattern. A full,
real `grounded-turn/1` round trip (`submit_grounded_turn` →
`claim_grounded_work` → `authorize_grounded_dispatch` →
`complete_grounded_work`, with **zero published statements**, so
`resolve_question` genuinely finds nothing) produced a real, verified
`original_outcome = 'blocked'` turn before any of the following ran.

| # | Scenario | Result |
| --- | --- | --- |
| T1 | Real owner calls `ensure` on the real blocked turn | `kind:'claimed'`, real `jobId`/`claimToken` |
| T2 | Same owner calls `ensure` again immediately (job still fresh `running`) | `kind:'pending'`, same `jobId`, no new claim |
| T3 | A **different** actor calls `ensure` on the same turn | `kind:'unavailable'` — no `jobId`/`claimToken` leaked |
| T4 | `complete` with a wrong `claimToken` | Rejected: `OPS_CONFLICT` |
| T5 | `complete` with the correct `claimToken` | `kind:'succeeded'`, outcome stored |
| T6 | `ensure` again after completion | `kind:'done'`, exact stored outcome echoed back, no re-run |
| T7 | A second real blocked turn's job manually aged past the 2-minute staleness window, then `ensure` called again | `kind:'claimed'` with a **fresh** `claimToken` (reclaim); the **original** claim's late `complete` call is then rejected `OPS_CONFLICT` — fencing holds across a real reclaim |
| T8 | A second real turn completed with `clarification` (real, non-blocked `original_outcome`, confirmed by reading the row) | `kind:'not_applicable'`; **zero rows ever created** in `grounded_ai_assist_jobs` for that turn |
| T9 | An actor who **is** a real Ops-workspace member (`knowledge_review_private.members`), but not the turn's owner, calls `ensure` | `kind:'unavailable'` — Ops membership grants no special access to another traveler's turn, confirming the deliberate choice of `turn_private.text_owner()` over `knowledge_review_private.current_actor()` |

Script: `bash` + `psql`, no Docker/Node dependency, following the same
methodology as slice 7's own database verification.

### Fixture (TS orchestration layer)

`tests/contract/knowledge/wiki-grounded-ai-assist-job.test.mjs` — 9/9
pass: every `ensure` `kind` (`unavailable`/`not_applicable`/`pending`/
`done`/`claimed`), a claimed job running the real search loop and
completing with the exact `claimToken`, a search loop that throws still
completing the job as `failed` with a real `errorCode`, a `complete()`
call that itself fails to reach the server still returning the real
outcome to the immediate caller, and a thrown/errored `ensure` call never
crashing.

Also re-ran for regressions:
- `node scripts/run-ci-suite.mjs contract` — 446/446 pass, 0 skipped, no
  regressions (437 before this slice + 9 new)
- `pnpm lint` / `pnpm typecheck` / `pnpm docs:check` — all clean

## What was NOT verified

- **No real model call in this slice's own verification.** The search
  loop itself was already real-model-verified in earlier slices; this
  slice's job is the queue/route/UI wiring around it, exercised here with
  a fixture transport for the loop (same convention as slice 7).
- **No real browser exercised `SavedAnswers.tsx`'s button/polling UI.**
  The component was typechecked and linted, and its logic (poll interval,
  terminal-status handling, per-outcome-kind rendering) mirrors the
  already-tested job orchestration layer directly, but no Playwright/real
  browser session drove it in this slice.
- **The route's environment gate (`VISEPANDA_GROUNDED_AI_ASSIST` and the
  provider env vars) is unset in every environment.** No deployment has a
  real credential wired to this route yet — consistent with every other
  real-model call in this codebase (none of which is connected to a live
  credential either); an operator must configure it before any real
  traveler ever reaches a real model call through this path.
- **No iOS wiring.** Deliberately out of scope for this slice, per JT's
  own instruction to do Web first.
- **No persistence of the AI-assisted result**, unchanged from slice 7's
  decision.

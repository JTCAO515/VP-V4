# VPJ-07 local durable text backend verification

2026-09-11; isolated branch `codex/durable-text-policy`, base `5cf1439ec61ea7aa7df4f6f2f4085ec566244c68`.
Related to #195; complete Issue/native/provider acceptance remains open.

## Executed result

The actual TypeScript worker ran against disposable PostgreSQL and a loopback HTTP provider:
owner consent → atomic stored input/queue → claimed lease → real durable budget RPCs → protocol
HTTP/normalization → atomic final text/terminal → owner read. All five outcomes were persisted
and mapped correctly; a duplicate poll made no second HTTP call. Unknown usage pricing remained
`pending` in the real SQL ledger, with no fabricated zero charge.

- `VP_TURN_DB_TEST=1 node --experimental-strip-types --test tests/integration/turn/durable-work.test.mjs tests/integration/turn/text-work.test.mjs`: **22 passed, 0 failed, 0 skipped**.
- Both isolated UTF-8 databases applied all **30 application migrations** transactionally. The
  retained previous Turn/events snapshot was unchanged. SQL auth fixtures are not GoTrue/JWT tests.
- Owner/session isolation, private-table/worker RPC denial for ordinary roles, exact retry reuse,
  changed-body conflict, persisted withdrawal, recipient substitution/replay, global revocation,
  terminal once, UTF-16 bounds, all five outcomes and hidden retained records passed.
- Controlled thread/user deletion lock barriers caused safe retryable lock rejection without
  falsely cancelling the lease, followed by successful delete and permanent hiding. Existing
  SIGKILL, expired-lease, multi-owner concurrency and cancellation tests also passed.
- Withdrawal at the final dispatch gate caused **zero HTTP calls** despite earlier budget
  dispatch; its cost hold remained pending. Cancellation while the transport was in flight
  rejected late text. An extra `reasoning` response field produced a generic technical failure,
  not raw output persistence.
- `pnpm check`: lint/typecheck/build and **22 static tests passed**. New deterministic failure copy
  is synchronized in `lib/i18n.ts` for all five existing locales; no UI consumer/layout changed.
- Final regressions: unit **92 passed**, contract **199 passed**, source E2E **40 passed**;
  the independent durable budget/PostgreSQL suite **9 passed**.
- Full security: **99 passed / 0 failed / 1 explicit disposable-Supabase target skip**, exit0.
  The aggregate remains INCOMPLETE for that separate real Auth/RLS target.
- Focused model protocol security: **8 passed**, including a caller's `async () => true` extra
  argument failing to enable C2 through the existing C0 API.

## Failures retained and corrected

1. Initial SQL tests had two harness errors: the stale session correctly returned
   `SESSION_REPLACED` while the test expected `UNAUTHENTICATED`, and the existing cancellation
   RPC returns a composite row, not JSON. The harness now preserves those actual contracts.
2. Loading Unicode-aware migration30 into the old lease fixture's SQL_ASCII database failed.
   The disposable initdb now explicitly uses UTF8; production history was not edited.
3. Independent draft review found a forgeable caller boolean gate and a delete/content lock
   inversion. C2 now has a dedicated entry that owns both durable RPC checks and its stored input;
   C0 remains closed. Hiding moved after deletion, root owner locking and fail-fast thread locks
   prevent cascade inversions. Barrier and bypass regression tests passed.
4. Initial full security run found a compatibility regression: malformed data class returned
   `DATA_POLICY_BLOCKED` before `INVALID_INPUT`. Original validation order was restored; the
   original test plus the new bypass regression pass. Final full security has no failures; its
   explicit missing-Supabase-target skip remains.

## Scope and evidence reuse

No original worktree edits, credential reads, external provider calls, remote migration, policy
activation, deployed worker or new customer/recipient permission occurred. Existing budget deletion
restrictions, unknown costs, RLS and Trip confirmation remain intact. The long-retention behavior
applies only to newly admitted records under a future explicitly qualified notice.

Per ADR-0024, unchanged native and browser acceptance evidence from PR307 is reused: signed
Simulator 21 passed / 0 failed / 8 explicit API-environment skips, and 9 browser checks including
desktop, 390×844 and RTL. Those are dated unchanged-code evidence, not a rerun or new native text
acceptance. New model output semantic quality, bilingual equivalence and real notice UI are UNRUN.

Contract: [VPJ-07](../../docs/contracts/vpj-07.md). Rollback disables the consumer/policy and retains
applied history, receipts and hidden content; no dropping/reviving data. Exact-HEAD independent
review, required GitHub CI and post-merge tree verification remain separate gates.

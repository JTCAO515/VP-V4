# VPJ-75 (#359) — a `/ops/wiki` write action to actually withdraw a source

Status: implemented and verified against real native PostgreSQL 16 (same
harness every prior VPJ-75 slice has used) and a real browser session
against the real production build via the repo's existing
`VP_WIKI_BROWSER_FIXTURE=1` loopback fixture. See
`artifacts/VPJ-75/wiki-source-withdrawal-action-20260917/verification.md`.

## The gap

`docs/contracts/wiki-source-withdrawal.md`'s "What this does not do" section
named this explicitly: **"No `/ops/wiki` UI for withdrawing a source or
seeing withdrawal status — this is a database/RPC-level capability only."**
The prior slice (`docs/contracts/wiki-source-withdrawal-status-ui.md`,
migration `20260917100000`) covered the **seeing** half only and said so in
its own "What this does not do" section: **"No withdrawal action in
`/ops/wiki`. An operator still cannot click a button in this UI to withdraw
a source; `ops_source_revision_withdraw_v1` is still only exercised
directly in tests, by RPC call."** `docs/handoff.json`'s own `nextAction`
named this same gap as the next step. This slice fills it: an operator can
now trigger `ops_source_revision_withdraw_v1` from `/ops/wiki` itself.

## The fix: a same-origin POST on the existing wiki route, plus a two-step form

**No new migration, no new RPC, no new table.** `ops_source_revision_withdraw_v1`
already existed (added by `20260916120000`, the "withdrawn-source dispatch
barrier" slice) and already had everything this needed: real
`current_actor()` authentication/membership/Ops-enabled checks,
receipt-based idempotency by `operationId`, and idempotent-by-state handling
(re-withdrawing an already-withdrawn source under a new `operationId` is a
no-op that returns the original reason, never overwrites it). This slice
only builds the HTTP and UI path that calls it.

- `lib/server/knowledge/wiki/http-wiki.ts`'s `handleWikiRequest` — previously
  GET-only — now also accepts `POST`. The GET branch (query validation,
  `ops_wiki_read_v1` call shape, error-code mapping) is byte-for-byte
  unchanged; a new `mutation` branch requires `options.sameOrigin` (rejecting
  `OPS_FORBIDDEN` before any body read or RPC dispatch, exactly like the
  existing `handleOpsRequest` used by `/api/ops/review`), reads and bounds
  the JSON body (4000-byte cap, matching `isWikiWithdrawInput`'s own size
  check), validates a closed 4-key `{action:"withdraw_source", operationId,
  sourceRevisionId, reason}` shape (UUID-format ids, a 1–500-char trimmed
  reason) before ever calling the RPC, and on success calls
  `ops_source_revision_withdraw_v1` with exactly the three RPC-shaped fields
  (stripping the `action` discriminator). Unknown RPC errors on a mutation
  map to `OPS_ACK_UNKNOWN` (503) rather than `OPS_UNAVAILABLE` — the same
  "a dispatched mutation whose result is unknown must never be reported as
  a clean failure" idiom `handleOpsRequest` already uses, since this endpoint
  is now also a mutation.
- `app/api/ops/wiki/route.ts` gains a `POST` export (previously GET-only),
  using the same `isSameOriginMutation` check `/api/ops/review`'s route
  already uses.
- `app/ops/wiki/workspace.tsx` gains `SourceWithdrawForm`, rendered next to
  any source that is neither already withdrawn nor missing (a source with no
  live `source_revisions` row cannot be withdrawn — that is left to the
  RPC's own `OPS_NOT_FOUND`, never special-cased in the UI). It is a
  **two-step, explicit-reason** control, not a native `window.confirm()`
  dialog: step one is a plain toggle button ("撤回此来源" / "Withdraw this
  source") that mutates nothing; step two reveals a required reason input
  plus its own separate "确认撤回" / "Confirm withdrawal" submit (and a
  "取消" / "Cancel" to back out) — the same "a note plus its own submit is
  the confirmation" idiom this codebase already uses for `revoke_statement`
  in `app/ops/review/workspace.tsx`. On success it triggers a re-read of the
  current page; it never locally hides/reorders the source itself — the next
  read shows the new `withdrawnAt` via the prior slice's existing advisory
  `role="alert"` note (`sourceWithdrawalNote`), which also means the button
  disappears on the next read for the same reason the note already governs
  visibility (`!source.withdrawnAt`).

## What this does not do

- **No cascading revocation, unchanged from every prior slice.** A revision
  generated from a source *before* that source was withdrawn — through this
  UI or the raw RPC — is not retroactively flagged as invalid, hidden, or
  blocked from further operator action.
- **No automated scan or notification**, unchanged from every prior slice.
- **No change to `ops_wiki_generation_v1`'s dispatch barrier or
  `ops_wiki_read_v1`'s read shape.** This slice only adds a new caller
  (an HTTP `POST`) for the pre-existing `ops_source_revision_withdraw_v1`
  RPC; the RPC's own SQL is byte-for-byte unchanged from `20260916120000`.
- **No bulk withdrawal.** One source at a time, matching the RPC's own
  single-`sourceRevisionId` input shape.
- **No visible-in-UI history of past withdrawal attempts beyond the current
  state.** The UI shows the current withdrawal status (from the prior
  slice's read wiring), not an audit trail of every attempt.

# VPJ-74 slice 1 verification

Issue: [#358](https://github.com/JTCAO515/VP-V4/issues/358). Base: main after PR381
(`2da65c4` range, 2026-09-14). This is **slice 1 of an estimated 3-focused-day
ticket** — a bounded, purely additive vertical slice, not full VPJ-74
acceptance. See `docs/contracts/knowledge-provenance.md` for the frozen
contract and `unrun.md` for what remains.

## What this slice adds

- `knowledge_review_private.ontology_types`/`.ontology_relations`: register
  the 9 predicates `statement_valid_v1()`/`statement_valid()` (v2 place
  statements) already accept, each with a domain/range type and zh/en label.
  Documents the existing closed set; does not expand it.
- Three nullable/legacy-default columns on `source_revisions`:
  `fetched_at`, `effective_at`, `lineage_status`.
- `public.ops_knowledge_provenance_read_v1(factId)`: read-only, reuses the
  existing VPJ-14 `current_actor()` ops-membership gate, returns the
  resolved relation, source provenance (including the existing
  `snippet_hash`), same-source-key history, and the publication audit trail.
- `lib/server/knowledge/provenance/ontology.ts`: TypeScript mirror of the
  registry plus input-shape validation, consumed by
  `tests/contract/knowledge/ontology-provenance.test.mjs` (5 tests).

No existing table column was removed or renamed, and neither
`ops_review_workspace` nor `knowledge_read_v1` was changed — the write path
and product read path are untouched.

## Local check commands (see `commands.jsonl` for exact invocations)

`docs:check`, `git diff --check`, `lint` (267 files), `typecheck`,
`test:contract` (313/313, 0 skipped, includes this slice's 5 new tests),
`test:integration` (23/23 non-skipped pass, 75 pre-existing skips — no
shared local-integration harness configured in this session),
`test:security` (146/146 non-skipped pass, 1 pre-existing skip), `db:verify`
(baseline present, no production connection attempted) — all pass.

## Real database verification (disposable local Postgres)

Started a fresh, disposable local Supabase instance under this worktree's
own `project_id` (`vp-v4-ai-08` — distinct containers from any other
session's, nothing shared or reused). `supabase migration up --local`
applied the full 38-migration history, including this slice's migration,
with no errors.

Ran the actual intended vertical slice end to end through real Postgres, not
a mock:

1. A synthetic author (an active `knowledge_review_private.members` row,
   distinct auth user) submitted a real payment-domain statement — subject
   `test-metro-station`, predicate `accepts_method`, object
   `test-mobile-pay`, scope `{cities:[shanghai], scene:payment}`, one
   synthetic source — via the existing, unmodified
   `public.ops_review_workspace(action=submit_statement)`.
2. A different active member reviewed it (`action=review`,
   `decision=reviewed`).
3. The same reviewer published it (`action=publish_statement`), receiving a
   real `fact_id`.
4. The reviewer called the new `public.ops_knowledge_provenance_read_v1`
   with that `fact_id`. Result: `relation` correctly resolved
   (`accepts_method` → domain `service_entity`, range `payment_method`, zh
   "接受支付方式", en "accepts payment method"); `sources` contained the one
   source with its real `snippet_hash`, `lineageStatus: "legacy"`,
   `fetchedAt`/`effectiveAt` both `null` (honest, since the write path was
   not changed); `sourceHistory` matched; `auditTrail` contained the
   `published` entry with its real note and timestamp.

Four negative cases, all against the same real Postgres instance:

| Case | Actor/input | Result |
| --- | --- | --- |
| Non-member | Authenticated user with no active `members` row | `OPS_FORBIDDEN` |
| Unauthenticated | `anon` role | `permission denied` (EXECUTE never granted to `anon`) |
| Malformed input | `factId` plus an extra JSON key | `INVALID_INPUT` |
| Unknown fact | Well-formed, non-existent `factId` | `OPS_NOT_FOUND` |

The disposable instance was torn down (`supabase stop`) after verification;
no Staging or Production environment was touched, no real user data existed
in it, and no other session's containers were read, written, or stopped.

## Acceptance criteria mapping

See `results.json`'s `acceptanceMapping` for the full breakdown against
[EXECUTION-CONTRACT.md#vpj-74](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md)'s
six bullets: 2 of 6 fully PASS with real-DB evidence, 2 PARTIAL (lineage
tracking is honestly deferred, not faked), 1 explicitly UNRUN (Staging), 1
PASS (versioned contract for VPJ-75/76/#211). This slice does not close
#358 — the ticket's own text requires actual Staging producer/consumer and
fault verification before the full ticket is done.

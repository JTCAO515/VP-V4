# VPJ-75 (#359) — explicitly UNRUN

Slice 1 (schema/idempotency data model) — see
`359-wiki-schema-slice1-20260914/verification.md`. Slice 2 (dispatcher RPC
+ real LLM wiring) — see `359-wiki-dispatch-slice2-20260914/verification.md`
and `docs/contracts/wiki-generation-dispatch.md`.

- ~~Generation dispatcher RPC~~ **DONE in slice 2.**
  `public.ops_wiki_generation_v1` (claim/complete) reserves jobs
  idempotently, enforces expectedVersion on write, rejects a duplicate
  claim while a job is `running`, and reopens the same job row (not a new
  one) on retry after failure. Verified against a real local Supabase
  instance with a real GoTrue session, not just direct SQL.
- ~~Real bounded LLM worker~~ **DONE in slice 2, for the summary+gaps
  probe scope only.** `lib/server/jobs/wiki-generation-job.ts` made two
  real calls to the Qwen API (not a fixture), under explicit operator
  authorization for real spend, with a validated closed-schema output and
  real token usage recorded. Cost/timeout/cancel paths are exercised by
  contract tests with an injected transport; an actual mid-call process
  crash was not reproduced for real (see the new gap below).
- **Slice 3 target-environment acceptance remains UNRUN.** Full body storage and
  `/ops/wiki` UI are now implemented, with native PostgreSQL and synthetic browser
  readback evidence in [verification](verification.md). Current connector denies
  the designated Staging project; this machine has no available model key or newly
  confirmed paid-call budget. Full GoTrue/worker/provider/Staging/browser chain,
  full Supabase cold replay/advisors and target rollback remain separate.
- ~~Stale-`running`-job reclaim/sweep~~ **DONE**, see
  `359-wiki-job-reclaim-20260915/verification.md` and
  `docs/contracts/wiki-generation-dispatch.md`. A `running` job whose
  `started_at` is more than 5 minutes old can be reclaimed by a fresh
  `claim` (same page/input, new `claim_token`); a completion carrying the
  superseded `claim_token` is rejected `OPS_CONFLICT` instead of racing or
  overwriting the reclaimer. Verified against real native PostgreSQL 17,
  including the actual race this exists to prevent (a fenced-off "late"
  completion from the original claim holder). Not reproduced with an
  actual killed OS process — the crash is simulated by back-dating
  `started_at`, not by SIGKILLing a real worker.
- **Statement-level source linking.** `statement_refs` exists as a column
  but nothing populates or validates that every key claim actually links
  to a real EvidenceSpan — the probe's `{summary, gaps}` output has no
  statement extraction at all yet.
- **Docling/parser integration**, per #288's existing REJECT — not
  attempted, not silently assumed fine.
- ~~Contradiction/conflict handling~~ **PARTIALLY DONE 2026-09-16, UI-wired
  2026-09-17.** See `wiki-statement-proposals-safety-20260916/verification.md`,
  `docs/contracts/wiki-statement-proposals-safety.md`,
  `wiki-proposal-conflict-ui-20260917/verification.md` and
  `docs/contracts/wiki-proposal-conflict-ui.md`. A pure, deterministic
  `detectProposalConflicts` flags two proposals in the same draft that
  structurally disagree (same subjectId/predicate/overlapping city+scene,
  different objectId/conditions/exclusions), and never flags a legitimate
  cross-city difference. As of 2026-09-17, a new `conflictsByProposal` helper
  and `/ops/wiki` UI wiring render a bilingual advisory warning next to every
  flagged proposal (current revision and each historical revision detail),
  verified against a real persisted-and-read-back draft (real native
  PostgreSQL round trip) and a real browser session via the existing
  `VP_WIKI_BROWSER_FIXTURE=1` fixture. The warning is advisory only — it
  never blocks the existing "verify and edit this proposal" action. Still
  cannot detect semantic contradiction in free-text quotes or across a
  single proposal's own multi-source evidence — that boundary remains a
  locked regression test, not just prose.
- ~~Multi-source synthesis~~ **Structural evidence-binding PARTIALLY DONE
  2026-09-16.** `evals/wiki-statement-proposals-safety/cross-source-cases.ts`
  exercises the real `resolveProposalOutput` with 2 real sources per case
  (bilingual, cross-city and same-city), proving each evidence entry's
  offsets independently reconstruct its own source's quote without
  conflation. This is evidence-binding coverage only, not multi-source page
  *synthesis* (one page combining several sources into one narrative) —
  that remains unbuilt.
- ~~Prompt-injection resistance~~ **PARTIALLY DONE 2026-09-16 for the
  statement-proposal job, fixture-only.** A frozen zh/en adversarial fixture
  set (`evals/wiki-statement-proposals-safety/injection-cases.ts`, 3
  categories x 2 locales) proves the structural validation layer — not a
  real model — rejects an injected-instruction-compliant output, including
  end to end through the real worker path with a scripted transport. A real
  model call against this fixture set (would it actually resist, or would it
  write the injected marker into `summary`/`gaps`?) remains UNRUN. The
  wiki-*generation* job's own system prompt (page-level summary/gaps, not
  statement proposals) is still untested against this or any adversarial
  fixture.
- **Actual per-call RMB cost reconciliation** against Qwen's billing
  console — token counts are real; price is not independently confirmed.
- ~~Withdrawn-source dispatch barrier~~ **DONE 2026-09-16**, see
  `wiki-source-withdrawal-20260916/verification.md` and
  `docs/contracts/wiki-source-withdrawal.md`. `source_revisions` gained an
  explicit `withdrawn_at`/`withdrawn_by`/`withdrawal_reason` state plus a
  new `ops_source_revision_withdraw_v1` RPC; `ops_wiki_generation_v1` now
  refuses to `claim` a job citing an already-withdrawn source (never
  dispatches to the real provider) and refuses to `complete(succeeded)` if
  a cited source was withdrawn during the claim-to-complete window (never
  persists the draft) — verified against real native PostgreSQL, for both
  the plain generation job and the structured statement-proposal payload,
  which share this one dispatcher. Not done: no cascading revocation of a
  `wiki_page_revisions` row that already cites a source withdrawn *after*
  that revision was created, no automated scan of in-flight jobs against
  newly-withdrawn sources. ~~No `/ops/wiki` UI for seeing withdrawal
  status~~ **DONE 2026-09-17** for the "seeing" half only, see
  `wiki-read-withdrawal-status-20260917/verification.md` and
  `docs/contracts/wiki-source-withdrawal-status-ui.md` — a new migration
  adds `withdrawnAt`/`withdrawnBy`/`withdrawalReason` to each source object
  `ops_wiki_read_v1` already returns, and `/ops/wiki` renders a bilingual
  advisory warning next to any withdrawn source, without hiding the source,
  revision, or any existing action. An Ops UI *action* to actually withdraw
  a source (as opposed to seeing that one already was) remains not built.

#359 remains OPEN. Schema, dispatcher+real-LLM-probe, durable draft
storage, the `/ops/wiki` review UI, statement-candidate linking, structured
statement proposals, stale-job reclaim, the withdrawn-source dispatch
barrier, UI wiring for the structural conflict flag (2026-09-17), and (also
2026-09-17) surfacing a withdrawn source's status in `/ops/wiki` (read-only)
are done (see each item above and `docs/knowledge-upgrade/README.md`'s
dated log for what each one actually covers and what it does not).
Structural conflict detection and fixture-only injection/multi-source-binding
coverage are partially done (2026-09-16, statement-proposal job only);
real-model injection resistance, true multi-source page synthesis, an
`/ops/wiki` *action* to withdraw a source, cascading source-withdrawal
revocation, automated newly-withdrawn-source scanning, real per-call RMB
reconciliation, and Docling integration remain not started.

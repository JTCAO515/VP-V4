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
- **Contradiction/conflict handling** between competing source material —
  no logic exists to surface "these two sources disagree" to a reviewer.
- **Multi-source synthesis.** Every real call so far used exactly one
  source text; nothing combines multiple sources into one page.
- **Prompt-injection resistance** against a fixed zh/en adversarial
  fixture set — the wiki-generation system prompt explicitly instructs the
  model to treat embedded instructions as ordinary content, but this has
  not been tested against a real adversarial input, only asserted in the
  prompt text.
- **Actual per-call RMB cost reconciliation** against Qwen's billing
  console — token counts are real; price is not independently confirmed.

#359 remains OPEN. Schema, dispatcher+real-LLM-probe, durable draft
storage, the `/ops/wiki` review UI, statement-candidate linking, structured
statement proposals, and stale-job reclaim are done (see each item above
and `docs/knowledge-upgrade/README.md`'s dated log for what each one
actually covers and what it does not). Contradiction handling,
multi-source synthesis, prompt-injection adversarial testing, real
per-call RMB reconciliation, and Docling integration remain not started.

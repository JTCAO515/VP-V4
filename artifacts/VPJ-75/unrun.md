# VPJ-75 (#359) — explicitly UNRUN

Slice 1 (schema/idempotency data model) — see
`359-wiki-schema-slice1-20260914/verification.md`. Slice 2 (dispatcher RPC
+ real LLM wiring) — see `359-wiki-dispatch-slice2-20260914/verification.md`
and `docs/contracts/wiki-generation-dispatch.md`. Slice 3 (durable draft
content column) — see `359-wiki-draft-content-slice3-20260915/verification.md`
and `docs/contracts/wiki-generation-draft-content.md`: verified against a
real standalone (non-Docker) local Postgres 16 with a hand-built `auth`
stand-in, not the project's own Supabase CLI local stack, and **not yet
pushed to GitHub or opened as a PR**.

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
- **Ops diff review UI.** Still not started — no page shows a
  claimed/completed job to a human reviewer.
- ~~Durable storage of the generated draft content~~ **DONE in slice 3, on
  branch `feat/vpj-75-359-wiki-draft-content` (not yet pushed/PR'd).**
  `wiki_page_revisions.draft_content jsonb` exists, is backfilled and
  shape-checked, and `ops_wiki_generation_v1`'s `complete` path requires
  and persists it. Verified with real INSERT/UPDATE/RPC calls (constraint
  counterexamples, backfill, and a real authenticated claim→complete round
  trip) against a real, standalone local Postgres 16 — not the project's
  own Docker-based Supabase CLI stack (unavailable in this sandbox), so a
  real session should still re-run this on the actual local stack before
  fully trusting it at the same bar as slice 1/2.
- **Stale-`running`-job reclaim/sweep.** A worker crash between `claim`
  and `complete` leaves a job permanently `running` — no automated or
  manual recovery path exists yet. Not reproduced with a real crash this
  slice; the state-machine design was verified by direct RPC calls
  simulating the stuck state, not an actual killed process.
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

#359 remains OPEN. Three slices done and verified (schema,
dispatcher+real-LLM-probe, durable draft storage — the last against a
hand-built non-Docker Postgres stand-in, not the project's own local
Supabase stack, and not yet pushed to GitHub); Ops UI, statement
extraction, contradiction handling, and Docling integration remain not
started.

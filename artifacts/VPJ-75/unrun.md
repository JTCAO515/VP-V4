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
  statement-proposal job, fixture-only; real-model pass DONE 2026-09-17
  (round 22).** A frozen zh/en adversarial fixture set
  (`evals/wiki-statement-proposals-safety/injection-cases.ts`, 3
  categories x 2 locales) proves the structural validation layer — not a
  real model — rejects an injected-instruction-compliant output, including
  end to end through the real worker path with a scripted transport. This
  round rechecked for a real, usable provider credential (found: Qwen has
  real account balance; GLM's key is valid but the account has zero real
  balance, a real HTTP 429; DeepSeek's key is valid but
  `MODEL_PROFILES.deepseek_flash.providerModelId` is confirmed stale against
  the real API, not fixed, shared-module, out of scope) and ran all 6 real
  cases against the real `runWikiStatementProposalJob` worker path with real
  Qwen (`qwen3.7-plus-2026-05-26`) HTTP calls: 6/6 resisted (the injected
  compliance marker never appeared anywhere in the raw model response text),
  every real response explicitly named the embedded instruction as untrusted
  and declined to follow it. A real, separate, reproducible finding
  surfaced: 4/6 real responses were rejected as `MODEL_OUTPUT_INVALID` for a
  reason unrelated to the injection — the model correctly declined to invent
  an unstated city, producing `scope.cities: []`, which
  `isKnowledgeStatement` requires to be nonempty; not fixed here (would
  require reasoning about the `KnowledgeStatement` schema broadly, not a
  narrow #359 slice). See
  `wiki-statement-proposals-injection-real-model-20260917/verification.md`.
  The wiki-*generation* job's own system prompt (page-level summary/gaps,
  not statement proposals) is still untested against this or any
  adversarial fixture — unchanged, not addressed this round.
- **Actual per-call RMB cost reconciliation** against Qwen's billing
  console — token counts are real; price is not independently confirmed.
- ~~Stale DeepSeek `providerModelId`~~ **DONE 2026-09-17 (round 23).**
  `MODEL_PROFILES.deepseek_flash.providerModelId`
  (`lib/server/model-gateway/index.ts`) changed from `"deepseek-v4-flash"`
  to `"deepseek-flash"`. Re-probed the real DeepSeek API directly
  (`api.deepseek.com/chat/completions`, sandbox disabled for the one
  network call, same infra fact round 22 already recorded): unlike round
  22's real `400`, this round's direct probe got a real `200` for all
  three candidate ids (`deepseek-v4-flash`, `deepseek-flash`,
  `deepseek-v4-pro`) — but requesting `deepseek-v4-flash` returns a
  response body whose own `"model"` field is silently normalized to
  `"deepseek-flash"`, not echoed back verbatim. That silent rename is
  exactly what the ACTUAL production code was already failing on:
  `provider-protocol.ts`'s `normalizeResponse` rejects any response whose
  `value.model !== PROTOCOL_MODELS[request.provider]` as
  `MODEL_OUTPUT_INVALID`, so the stale id was breaking the real call chain
  even though the raw HTTP status was a `200`, not a `400` — a stricter,
  more specific real-code-path reproduction than round 22's bare-probe
  finding. Verified both ways through the actual production functions
  (`invokeProviderProtocol` + `createProviderHttpTransport`, not a bespoke
  script): with the old id the real call returns
  `{kind:"unavailable", code:"MODEL_OUTPUT_INVALID"}`; with the fix
  (`"deepseek-flash"`) the identical real call returns
  `{kind:"protocol_validated", model:"deepseek-flash", output:"ok", ...}`
  with real usage tokens. `deepseek_pro`'s existing `"deepseek-v4-pro"` and
  `deepseek_vision`'s `"deepseek-v4-flash-vision-exp"` were left unchanged
  (not re-probed for vision, since its `route` is `shadow_only`/`tasks:[]`
  and it is never dispatched by any job; `deepseek_pro` was probed and
  already round-trips correctly). Qwen's and GLM's profiles are untouched
  (diff is a 2-line functional change: the profile id and its one
  contract-test assertion, plus a doc-table cell and two test-fixture
  literals switched to reference `PROTOCOL_MODELS.deepseek` instead of a
  hardcoded stale string so they cannot silently drift again). See PR
  for the exact diff.
- **`scope.cities: []` vs. `isKnowledgeStatement`'s `length >= 1` check —
  evaluated in round 23, NOT changed.** This round read the actual full
  consumer graph (not just the two sites round 22's finding named) before
  deciding, because the same `isKnowledgeStatement`
  (`lib/server/knowledge/publication/statement.ts:47`) gates far more than
  the one wiki-statement-proposal job:
  - It is reused, unmodified, by `isProposalOutput`,
    `resolveProposalOutput` and `isStructuredWikiDraft`
    (`lib/server/knowledge/wiki/proposals.ts`) — the entire wiki-draft
    pipeline round 22's finding was about.
  - It is *also* the schema for `submit_statement` inside
    `isKnowledgeOperation` — i.e. the same invariant gates the live,
    published knowledge-base write path, not only a draft a human still
    reviews. Loosening it is a change to what can ever be published, not
    just to what a job accepts from a model.
  - `lib/server/knowledge/claim/reviewed-selection.ts:40` matches a
    published statement to a read request with
    `entry.statement.scope.cities.includes(plan.scope.city)`. On an empty
    array this is unconditionally `false`, so an empty-cities statement
    would never match *any* city-scoped read — i.e. allowing it through
    publish does not make it "apply to all cities"; it silently makes the
    statement permanently unretrievable dead weight. The opposite of what
    an empty array might be assumed to mean.
  - `lib/server/knowledge/wiki/proposals.ts:71`'s `detectProposalConflicts`
    skips a pair as a "legitimate cross-city difference" whenever
    `!scopeA.cities.some(c=>scopeB.cities.includes(c))`. `[].some(...)` is
    always `false`, so `!false` is always `true` — an empty-cities proposal
    would be treated as non-overlapping with *every* other proposal in the
    same draft and would never be checked against any of them, including a
    real same-city duplicate. This is a real false-negative regression the
    conflict detector would introduce silently if the schema were loosened
    without also rewriting this overlap check's empty-array case (e.g.
    treating `[]` as "unscoped, always overlaps" rather than "never
    overlaps" — itself a real design decision, not a one-line fix).
  - `lib/grounded/read-model.ts:106` enforces a third, independent,
    *stricter* invariant on a `place`-scoped fact's `cities`
    (`length === 1` exactly, not `>= 1`) for the place-question read path
    — a second call site that would need its own review, separate from the
    two above.
  - **Conclusion:** a one-line schema loosening (`s.cities.length<1` →
    allow `0`) is not safe on its own; it requires coordinated changes to
    at least `detectProposalConflicts`'s overlap semantics and a decision
    about whether an empty-`cities` statement may ever reach
    `submit_statement`/publish at all (today's read-matching logic argues
    it should not, since it would be unreachable dead data if it did) —
    each of those needs its own tests and its own reasoning about blast
    radius, which does not fit safely in the same round as the unrelated,
    independent Bug 1 fix above. **Recommended direction for whoever picks
    this up:** handle it at the wiki-statement-proposal *job* layer instead
    of the shared schema — e.g. have the job (or the system prompt) require
    the model to emit an explicit "scope unresolved" signal distinct from a
    bare `[]`, and have the job treat that signal as "drop this one
    proposal, keep the rest of the response" rather than the current
    all-or-nothing `isProposalOutput` validation, which invalidates
    `summary`/`gaps` and every other proposal in the same response over one
    proposal's honest missing city. That keeps the publish-time and
    read-time invariants (`cities.length >= 1`, `.includes()` matching,
    `detectProposalConflicts`'s overlap check) exactly as they are today
    and confines the fix to where the ambiguity actually originates.
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
  which share this one dispatcher. ~~No cascading revocation of a
  `wiki_page_revisions` row that already cites a source withdrawn *after*
  that revision was created~~ **DONE 2026-09-17 (round 19), as a marking-only
  flag** — see `docs/contracts/wiki-source-withdrawal-revision-flag.md` and
  `wiki-source-withdrawal-revision-flag-20260917/verification.md`. A new
  pure function, `citedWithdrawnSources` (no migration, no RPC), derives
  from fields the read RPC already returns which of a specific
  already-generated revision's cited sources have since been withdrawn, and
  `/ops/wiki` now renders this prominently at the revision-header level
  (not buried inside the collapsed sources details block, where the prior
  round's per-source note still also lives unchanged). It only marks the
  correlation for a human reviewer — it never hides, merges, blocks any
  existing action, or retroactively invalidates the revision itself. It is
  scoped to the two revisions (current + previous) the existing read RPC
  already returns, not full history — that scope is unchanged by the
  automated scan below, which shares it. ~~No automated scan of in-flight
  jobs or already-generated pages against newly-withdrawn sources (the flag
  only appears when an operator actually reads that specific page)~~
  **DONE 2026-09-17 (round 20)**, see
  `docs/contracts/wiki-withdrawal-scan.md` and
  `wiki-withdrawal-scan-20260917/verification.md`. A new nullable column,
  `wiki_generation_jobs.source_revision_ids`, is recorded only at `claim()`
  time (every existing check/branch/statement in `ops_wiki_generation_v1` is
  byte-for-byte unchanged except this one additive assignment, present in
  both the fresh-insert and the terminal-job-reclaim branches). A new
  read-only RPC, `ops_wiki_withdrawal_scan_v1`, scans **every** page's
  current/previous revision and **every** `queued`/`running` job (not just
  the one page an operator happens to be viewing) for one citing a
  withdrawn source, and `/ops/wiki`'s landing view now renders this as a
  bilingual advisory panel, on its own poll cycle, independent of and never
  blocking the existing page lookup/list. Still marking-only — nothing is
  cancelled, hidden, retried or retroactively invalidated by this scan. A
  job claimed before this migration has `source_revision_ids = null` and is
  simply excluded, not reconstructed. There is still no periodic/background
  trigger or notification (email/webhook) — this is a pull-based RPC the UI
  polls on its own existing refresh cadence, not a server-side scheduler.
  ~~No `/ops/wiki` UI for seeing withdrawal
  status~~ **DONE 2026-09-17** for the "seeing" half only, see
  `wiki-read-withdrawal-status-20260917/verification.md` and
  `docs/contracts/wiki-source-withdrawal-status-ui.md` — a new migration
  adds `withdrawnAt`/`withdrawnBy`/`withdrawalReason` to each source object
  `ops_wiki_read_v1` already returns, and `/ops/wiki` renders a bilingual
  advisory warning next to any withdrawn source, without hiding the source,
  revision, or any existing action. ~~An Ops UI *action* to actually
  withdraw a source~~ **DONE 2026-09-17 (round 18)**, see
  `wiki-source-withdrawal-action-20260917/verification.md` and
  `docs/contracts/wiki-source-withdrawal-action-ui.md` — `/api/ops/wiki` now
  accepts a same-origin `POST` calling the existing
  `ops_source_revision_withdraw_v1` RPC (no new migration/RPC), and
  `/ops/wiki` renders a two-step, explicit-reason withdraw control (not a
  native confirm dialog) next to any source that is neither already
  withdrawn nor missing. Verified against real native PostgreSQL (a real
  HTTP-level `POST` through the same `handleWikiRequest` handler the route
  calls, including a real outsider rejection and a real GET-after-POST
  round trip) and a real browser click-through via the existing
  `VP_WIKI_BROWSER_FIXTURE=1` fixture.

#359 remains OPEN. Schema, dispatcher+real-LLM-probe, durable draft
storage, the `/ops/wiki` review UI, statement-candidate linking, structured
statement proposals, stale-job reclaim, the withdrawn-source dispatch
barrier, UI wiring for the structural conflict flag (2026-09-17), surfacing
a withdrawn source's status in `/ops/wiki` (read-only, 2026-09-17), a
write-path `/ops/wiki` action to actually withdraw a source (2026-09-17,
round 18), a revision-level "cites a withdrawn source" marking-only flag
(2026-09-17, round 19), and an automated all-pages/all-in-flight-jobs
withdrawn-source scan (2026-09-17, round 20) are done (see each item above
and `docs/knowledge-upgrade/README.md`'s dated log for what each one
actually covers and what it does not). Structural conflict detection and
fixture-only injection/multi-source-binding coverage are partially done
(2026-09-16, statement-proposal job only); a real-model pass over the
statement-proposals injection fixture set is now DONE (2026-09-17, round
22, see above) — 6/6 resisted against real Qwen. True multi-source page
synthesis, real per-call RMB reconciliation, and Docling integration remain
not started. **Environment correction (2026-09-17, round 22):** this
sandbox DOES have a real, usable LLM credential (Qwen, real account
balance) once the Bash tool's own sandbox is disabled for the network call
— prior rounds' "no real credential" framing conflated a sandboxed-network
restriction with an actual absence of credentials; re-check before assuming
either way in a future round. GLM's configured key has zero real balance
(verified); DeepSeek's configured model id is stale against the real API
(verified, not fixed, shared-module, out of this round's #359-only scope).
The automated scan (round 20) is pull-based (an RPC the UI polls) — a
periodic/scheduled server-side trigger or an outbound notification
(email/webhook) for it remains not started and would need real delivery
infrastructure this sandbox does not have.

**Round 23 (2026-09-17):** the stale `MODEL_PROFILES.deepseek_flash`
`providerModelId` round 22 flagged and deferred is now fixed and
re-verified against the real DeepSeek API through the actual production
call path (see the dedicated bullet above). The `scope.cities: []` schema
question round 22 also flagged was evaluated in depth (full consumer graph
read: the wiki-draft pipeline, the live `submit_statement` publish path,
`reviewed-selection.ts`'s read-time city matching, and
`detectProposalConflicts`'s cross-city-skip logic) and deliberately left
unchanged this round — loosening it safely needs coordinated changes to at
least the conflict-detector's overlap semantics, not a one-line schema
edit, and is recorded above as a separate, still-open item with a
recommended direction (handle it at the job/prompt layer, not the shared
schema).

**Round 25 (2026-09-17):** `provider-protocol.ts` (this file's shared
model-gateway entry, used by `wiki-generation-job.ts` and
`wiki-statement-proposal-job.ts` among others) gained an opt-in,
allowlisted `MODEL_OUTPUT_INVALID` raw-response diagnostic
(`captureRawResponseOnInvalid`), wired on for those two #359 jobs and
deliberately left off for `wiki-search-job.ts` (#360) and the
`c2_sensitive` text-worker path. This was VPJ-76's own named follow-up
(unrun.md item (c)), not a #359 acceptance-criteria item itself, so full
detail lives in `artifacts/VPJ-76/unrun.md` and
`docs/contracts/wiki-raw-response-diagnostics.md`; noted here only because
the changed module is shared with #359's own jobs, and the full
`pnpm check`-equivalent suite (typecheck/lint/build/test/test:contract/
test:unit/test:integration/test:security/evals/docs:check/check:flags/
check:assets) was re-run clean against this branch, confirming no
regression to any #359 wiki-generation or statement-proposal behavior.

**2026-09-19 target-environment readiness observation:** the correct Staging
project (`VP - V4`, `dzqdzetcctkhbrhlxxgn`) is visible and can be linked, but
the authenticated CLI database connection terminates before `migration list`
or `db push --dry-run` can inspect it. Preview also lacks the Ops and grounded
provider activation variables, and main production builds are intentionally
skipped. No target-environment write occurred; see
`target-environment-readiness-20260919/verification.md`.

**2026-09-19 Staging migration update:** ~~Apply the merged VPJ-75 Wiki
migrations to the pinned Staging database~~ **DONE for the 9 VPJ-75 files in
the exact 11-file VPJ-75/76 package.** The target now has 61 history rows,
the Wiki/withdrawal RPCs, private RLS tables and unchanged original Auth,
Trip, source and publication data. The new encrypted backup passed an
isolated PostgreSQL 17 restore; the migration set also passed an in-target
ROLLBACK rehearsal before commit. See
`staging-migration-20260919/verification.md`. Real Ops/worker/publish/readback,
withdrawal behavior, billing and full #359 acceptance remain UNRUN.

**2026-09-19 real Staging Ops/worker update:** ~~Real Qwen Wiki worker,
Staging claim/complete and `/ops/wiki` draft readback~~ **DONE for one
previously reviewed 12306 editorial source.** Real job
`1a485048-d35e-44bb-816c-60af686c6122` persisted revision v1 with
config/input digests and `cost_tokens=475`, `cost_unknown=false`; an
authenticated browser opened the actual deployed page. See
`staging-ops-20260919/verification.md`. Statement proposal, separate human
review, publication, withdrawal and Ask readback are still UNRUN; 475 tokens
is usage, not a reconciled monetary charge.

**2026-09-19 structured-proposal update:** ~~Real Staging source intake and
Qwen-generated statement proposals~~ **DONE for one original editorial
synopsis from the current official Chongqing museum notice.** The source
revision is linked to a pending Ops candidate; a separate real Qwen job
persisted 3 source-span-bound proposals with `cost_tokens=1783` and
`cost_unknown=false`. The deployed `/ops/wiki` UI rendered all three.
Editorial correction, independent human review, actual publication and Ask
consumption are still UNRUN; see `staging-ops-20260919/verification.md`.

**2026-09-19 withdrawal update:** ~~Real Staging source withdrawal after
claim and before publication, plus new-dispatch denial~~ **DONE for an
independent owned source revision.** One real Qwen call reported 528 tokens;
the succeeding completion was refused with `OPS_SOURCE_WITHDRAWN`, no Wiki
revision was written, the job was settled `failed`, and a fresh claim was
also refused before another provider call. The blocked job correctly
remains `cost_unknown=true`; see
`staging-withdrawal-20260919/verification.md`. The separate reviewed-source
publication and Ask readback are still UNRUN.

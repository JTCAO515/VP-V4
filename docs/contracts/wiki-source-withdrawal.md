# VPJ-75 (#359) — withdrawn-source dispatch barrier

Status: implemented and verified against real native PostgreSQL 16 (no
Docker available in this sandbox; used this repo's own
`tests/integration/knowledge/wiki-draft.test.mjs` native-PostgreSQL
harness, the same one every prior VPJ-75 slice has used). See
`artifacts/VPJ-75/wiki-source-withdrawal-20260916/verification.md`.

## The gap

VPJ-75's acceptance criteria (`docs/program/2026-09-05/issue-bodies/VPJ-75.md`)
include: "实际worker超时/取消/进程重启可恢复或明确终态；重试幂等，provider调用有
配置、费用/unknown和预算回执；**拒权或来源撤回后不继续外发/发布**" — after a
denial or source withdrawal, stop continuing to dispatch/publish. Every
earlier slice's verification doc recorded "source withdrawal-before-provider
dispatch" as explicitly UNRUN (see e.g.
`artifacts/VPJ-75/wiki-statement-review/verification.md`).

Before this slice, `knowledge_review_private.source_revisions` had **no
withdrawal state at all**. Only a downstream `publications` row (a
reviewed/published candidate built *from* a source) could be `revoked` — a
`source_revisions` row itself, once inserted, was permanent and had no way
to be marked no-longer-eligible for new generation work.

## The fix: an explicit withdrawal state plus two dispatcher checkpoints

`source_revisions` gains `withdrawn_at timestamptz`, `withdrawn_by uuid`,
`withdrawal_reason text` (a CHECK enforces all-three-or-none). A new RPC,
`public.ops_source_revision_withdraw_v1`, lets an authenticated Ops member
(reusing `knowledge_review_private.current_actor()`, identical
authentication/membership/Ops-enabled semantics to every other Ops RPC in
this codebase) mark a source withdrawn with a reason. It is idempotent two
ways: an exact `operationId` replay returns the stored receipt, and
withdrawing an already-withdrawn source under a *new* `operationId` is a
no-op that returns the **original** withdrawal (who/why/when), never
overwriting it with a later reason.

The barrier itself lives in `public.ops_wiki_generation_v1` — the one real
dispatcher that exists today, shared by both the plain wiki-generation job
and the statement-proposal job (both complete through
`lib/server/jobs/wiki-generation-complete.ts`):

1. **`claim`**: rejects with `OPS_SOURCE_WITHDRAWN` if any requested
   `sourceRevisionIds` entry is already withdrawn — checked before any
   `wiki_pages`/`wiki_generation_jobs` row is touched. This is the "never
   dispatch" half: a withdrawn source can never be claimed, so the
   application never proceeds to make the real provider call with it.
2. **`complete` (`succeeded` outcome only)**: rejects with
   `OPS_SOURCE_WITHDRAWN` if any of the outcome's `sourceRevisionIds` has
   been withdrawn *since* claim — closing the real race where the actual
   provider call takes real wall-clock time and a source could be
   withdrawn while a job is in flight. This is the "never publish" half: a
   draft built from a source that is no longer eligible is never persisted
   as a `wiki_page_revisions` row, even though the model already produced
   output for it.

`complete(failed)` and `complete(cancelled)` are **not** gated by this
check — a job stuck on a since-withdrawn source still needs a way to close
gracefully instead of sitting until the existing 5-minute reclaim window
(`wiki-job-reclaim.md`). A rejected `succeeded` completion leaves the job
row `status='running'`, unchanged — the same idiom this dispatcher already
uses for a stale-`expectedVersion` `OPS_CONFLICT`.

## What this does not do

- **No cascading revocation.** A `wiki_page_revisions` row that already
  cites a source *before* that source is later withdrawn is left exactly
  as-is — this barrier only blocks *new* dispatch/persistence, it does not
  retroactively flag or hide already-generated draft content. Surfacing
  "one of this page's cited sources has since been withdrawn" to an Ops
  reviewer is not built.
- **No `/ops/wiki` UI** for withdrawing a source or seeing withdrawal
  status — this is a database/RPC-level capability only, exercised in this
  slice's tests by calling the RPC directly, exactly like every prior
  VPJ-75 slice before its own UI landed. **Update, 2026-09-17: the "seeing
  withdrawal status" half is now done** — see
  `docs/contracts/wiki-source-withdrawal-status-ui.md`. Withdrawing a
  source from `/ops/wiki` (a write action) is still not built.
- **No automated scan.** Nothing periodically checks in-flight `running`
  jobs against newly-withdrawn sources; the barrier only fires when a
  `claim` or `complete` call actually happens for that job.
- **Statement-level barrier only, not statement-*content* barrier.** This
  gates the wiki-generation/statement-proposal dispatcher's own
  `sourceRevisionIds`. It has no relationship to and does not change
  `ops_review_workspace`'s separate, pre-existing `publications.state`
  revocation path for already-published Facts (`revoke_statement`), which
  this slice leaves untouched.
- **No real killed-in-flight provider call.** The claim-to-complete race
  is reproduced by withdrawing the source between a real
  `runWikiGenerationJob`/`runWikiStatementProposalJob` call and the
  `complete` RPC call, not by withdrawing mid-HTTP-request.

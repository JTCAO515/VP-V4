# VPJ-75 (#359) — flagging a revision whose cited source has since been withdrawn

Status: implemented and verified against real native PostgreSQL 16 (same
harness every prior VPJ-75 slice has used) and a real browser session
against the real production build via the repo's existing
`VP_WIKI_BROWSER_FIXTURE=1` loopback fixture. See
`artifacts/VPJ-75/wiki-source-withdrawal-revision-flag-20260917/verification.md`.

## The gap

`docs/contracts/wiki-source-withdrawal.md`'s "What this does not do" section
and `artifacts/VPJ-75/unrun.md` both name this explicitly: **"No cascading
revocation. A `wiki_page_revisions` row that already cites a source *before*
that source is later withdrawn is left exactly as-is ... Surfacing 'one of
this page's cited sources has since been withdrawn' to an Ops reviewer is
not built."**

The prior slice (`docs/contracts/wiki-source-withdrawal-status-ui.md`,
migration `20260917100000`) did add each cited source's `withdrawnAt`/
`withdrawnBy`/`withdrawalReason` to the read response, and `/ops/wiki`
already renders a bilingual advisory next to a withdrawn source — but that
note only appears **inside the collapsed "Sources and original location"
`<details>` block**, per source. An operator looking at a revision's header
(current/previous, its version, its validation status) has no indication at
all that the revision cites a withdrawn source unless they manually expand
that block and read every source. On a revision with several cited sources,
nothing tells the operator *which* ones (if any) are affected without
reading each one.

## The fix: a pure, revision-level correlation, surfaced prominently

`lib/server/knowledge/wiki/read-model.ts` gains a new pure function,
`citedWithdrawnSources(sources)`, which filters an already-fetched
revision's `sources[]` (a field `ops_wiki_read_v1` has returned since the
prior slice) down to the ones whose `withdrawnAt` is non-null. It adds
**no new migration, RPC or fetch** — it is derived entirely from data the
existing read RPC already returns, in the same idiom this codebase already
uses for `detectProposalConflicts`/`conflictsByProposal` (also a pure,
client-side correlation over already-fetched data).

`app/ops/wiki/workspace.tsx` calls this once per rendered revision (current
and previous — the same two revisions the existing read RPC already
returns) and, when the result is non-empty, renders a bilingual
`role="alert"` line directly under that revision's header — visible
immediately, without expanding any collapsed section — naming how many of
that revision's cited sources have since been withdrawn and pointing the
operator at "Sources and original location" for the per-source reason. The
existing per-source note inside that details block is unchanged and still
renders alongside it.

This is a **marking-only** addition, consistent with every prior
VPJ-75 withdrawal slice's boundary:

- It never hides, merges, blocks, or retroactively invalidates the
  revision, its `draftContent`, its `validationStatus`, or any existing
  action (e.g. "prepare a statement from this version" and "verify and
  edit this proposal" remain exactly as available as before).
- It never distinguishes "withdrawn before this revision existed" from
  "withdrawn after" — by construction (the existing dispatch barrier in
  `docs/contracts/wiki-source-withdrawal.md`), a persisted revision can only
  ever cite a source that becomes withdrawn *after* that revision was
  created, so this is unambiguous.
- It is purely a read-time, derived signal — nothing is written, scanned,
  or scheduled. Whether an already-generated revision remains trustworthy
  is left entirely to human judgment, exactly like the per-source note it
  sits next to.

## What this does not do

- **No automated scan or notification.** Nothing proactively tells an
  operator that a page they are not currently looking at has a newly
  withdrawn cited source; the flag only appears when that specific page is
  read, unchanged from the prior slice.
- **No change to any write path.** `ops_wiki_generation_v1`'s dispatch
  barrier and `ops_source_revision_withdraw_v1`'s idempotency semantics are
  untouched; this slice adds zero migrations and zero RPC changes.
- **No history beyond what `ops_wiki_read_v1` already returns.** The read
  RPC only returns the current and immediately-previous revision of a page
  (`r.version in (p.version, p.version-1)`); an older revision that cites a
  since-withdrawn source is not flagged by this UI, because it was already
  not returned by the read RPC before this slice — that boundary is
  pre-existing and unchanged here.
- **No propagation beyond `wiki_page_revisions`.** This does not touch
  `ops_review_workspace`'s separate `publications`/Fact-publication
  pipeline (`revoke_statement`) or any statement already prepared/published
  from a revision's proposal — only the wiki-draft read model gains this
  flag.

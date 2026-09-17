# Wiring `detectProposalConflicts` into the persisted draft body and `/ops/wiki` UI (#359)

Addresses the item [wiki-statement-proposals-safety.md](./wiki-statement-proposals-safety.md)
named as explicitly out of scope for its own slice: "Wiring that returned
list into the persisted draft body and the `/ops/wiki` UI is **not** part of
this slice." `docs/handoff.json`'s `nextAction` and
`artifacts/VPJ-75/unrun.md` both name this as the next concrete gap. This
slice adds no new fetch, migration, field, or RPC change -- it is a pure
client-side consumer of data that is already persisted and already returned
by the existing `ops_wiki_read_v1` read.

## `conflictsByProposal`

`lib/server/knowledge/wiki/proposals.ts` adds a second pure function that
reshapes `detectProposalConflicts`'s flat `{a, b, reason}[]` list into a
per-proposal-index lookup (`Map<number, {other, reason}[]>`), symmetric in
both directions -- if proposal 0 conflicts with proposal 1, both `.get(0)`
and `.get(1)` return an entry pointing at the other side. This exists purely
so the UI does not have to re-derive pair symmetry itself; it does not
change what counts as a conflict, only how the result is indexed for
rendering.

## `/ops/wiki` UI wiring

`app/ops/wiki/workspace.tsx` computes conflicts client-side, from
`draftContent` that is already present in the `WikiRead` response (no new
network request), in two places:

- The current revision's "Model statement proposals (unreviewed)" list (the
  primary reviewer-facing surface, shown before a proposal is turned into a
  submitted statement).
- Each historical revision's expandable "Statement proposals in this
  revision" detail block, computed independently per revision (a revision's
  own `draftContent` may have a different proposal set and different
  conflicts than the current one).

A conflicting proposal renders a `role="alert"` bilingual line naming the
other proposal's index (1-based, for a human reader) and the structural
reason (`objectId` / `conditions` / `exclusions`), e.g. "Conflicts with
proposal #2 (different object); needs manual review, neither is auto-merged
or dropped." This never disables or hides the "Verify and edit this
proposal" action -- a flagged proposal is still fully actionable, exactly
like every other item in the existing Ops diff view. The conflict signal is
advisory; human review remains the only enforcement gate, unchanged from
`detectProposalConflicts`'s own contract.

`http-wiki.ts`'s existing "returns the RPC payload verbatim under data"
behavior is unchanged -- the conflict computation happens entirely in the
React component, not in the HTTP handler, so the wire contract and its
existing tests (`tests/contract/ops/wiki-request.test.mjs`) are untouched.

## Verification approach

Because this repo has no component-level UI test harness (no
`@testing-library/react`/jsdom setup), verification follows the repo's
established convention for `/ops/*` UI work: real unit coverage for the new
pure function, a real database round trip proving the persisted fields
survive intact, and a real browser session against the real production build
using the existing `VP_WIKI_BROWSER_FIXTURE=1` loopback fixture (real
Next.js production server, real request handlers, real native PostgreSQL,
synthetic actor injection instead of GoTrue). See
[verification](../../artifacts/VPJ-75/wiki-proposal-conflict-ui-20260917/verification.md)
for the full command list and the real bilingual screenshots' content.

Rollback: revert `conflictsByProposal` and the two `workspace.tsx`/
`workspace.module.css` render sites. `detectProposalConflicts` itself,
`ops_wiki_read_v1`, and `http-wiki.ts` are unchanged, so rollback has no
data-shape or migration implications.

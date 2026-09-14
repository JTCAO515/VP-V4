# Ontology relation/type registry and provenance read contract v1

VPJ-74 slice 1. Purely additive to the VPJ-15/16 statement/publication path:
no existing column removed or renamed, no write-path function
(`ops_review_workspace`, `knowledge_read_v1`) changed.

## Ontology registry

`knowledge_review_private.ontology_types` and `.ontology_relations` register
exactly the predicate set `statement_valid_v1()`/`statement_valid()` (v2 place
statements) already accept — 7 VPJ-15 predicates plus `located_at`/
`opens_during` from VPJ-16. Each relation carries a `domainType`, `rangeType`,
and zh/en label. This documents the existing closed set; it does not expand
or relax what the database accepts — an unregistered predicate cannot reach
the table (the SQL check constraints already reject it before a statement is
stored).

The TypeScript mirror is `lib/server/knowledge/provenance/ontology.ts`
(`ONTOLOGY_TYPES`, `ONTOLOGY_RELATIONS`, `resolveOntologyRelation`,
`resolveOntologyType`), kept in sync with the migration's seed rows by hand;
`tests/contract/knowledge/ontology-provenance.test.mjs` asserts the set is
exactly the closed predicate list, not a subset or superset.

## Source lineage

`source_revisions` gains `fetched_at`, `effective_at` (both nullable
timestamptz) and `lineage_status` (`'legacy' | 'tracked'`, default
`'legacy'`). Slice 2
(`20260914090000_vpj_74_lineage_tracking.sql`) taught the existing
`submit_statement` write path (`ops_review_workspace_publication_v1`) to
stamp `fetched_at = clock_timestamp()` and `lineage_status = 'tracked'`
on a genuinely **new** source_revisions row — an existing revision hit via
`ON CONFLICT DO NOTHING` keeps whatever lineage it already had, never
gets rewritten. Every row created before slice 2 stays `legacy` with null
`fetched_at`/`effective_at` forever, honestly.

`effective_at` is still never set by any slice: it is a business fact
about the underlying source (e.g. when a price or rule took effect), not
the moment an ops reviewer typed it in. Stamping it with submission time
would be a fabricated fact, not a real one — it stays null until a later
slice has an actual basis for it (e.g. an explicit field the submitter
provides, or metadata from an automated crawl in VPJ-75).

## `public.ops_knowledge_provenance_read_v1(p_input jsonb)`

Read-only. Reuses `knowledge_review_private.current_actor()` — the existing
VPJ-14 gate requiring a live session and an active
`knowledge_review_private.members` row. `EXECUTE` is granted to
`authenticated` only.

**Input**: `{ "factId": "<uuid>" }`, a closed object — no other key accepted.

**Output** (`schemaVersion: "knowledge-provenance/1"`):

```jsonc
{
  "schemaVersion": "knowledge-provenance/1",
  "factId": "...", "state": "published" | "revoked", "publicationVersion": 1 | 2,
  "assertion": { "subjectId": "...", "predicate": "...", "objectId": "...", "conditions": [], "exclusions": [] },
  "relation": { "predicate": "...", "domainType": "...", "rangeType": "...", "zhLabel": "...", "enLabel": "...", "schemaVersion": 1 } | null,
  "sources": [ { "sourceRevisionId": "...", "sourceKey": "...", "revisionLabel": "...", "snippetHash": "...", "publisher": "...", "uri": "...", "locator": "...", "fetchedAt": null, "effectiveAt": null, "lineageStatus": "legacy" | "tracked" } ],
  "sourceHistory": [ /* every revision recorded under any of this statement's source_key values, so an ops reviewer can compare old vs new revisions of the same source side by side — source_revisions rows are immutable per revision_label; a "new version" is a new revision_label under the same source_key */ ],
  "auditTrail": [ { "version": 1, "action": "published" | "revoked", "note": "...", "createdAt": "..." } ]
}
```

`relation` is `null` only if a stored statement somehow carries a predicate
outside the registered set — not currently reachable given the existing
check constraints, but the RPC does not raise on it, since a read view
should never crash on data it can already see.

**Errors**: `INVALID_INPUT` (malformed/extra-key input), `UNAUTHENTICATED`
(no live session), `OPS_FORBIDDEN` (not an active member — from
`current_actor()`), `OPS_NOT_FOUND` (no publication with that `factId`).

## Verified against real Postgres (disposable local instance)

See `artifacts/VPJ-74/results.json` and `verification.md` for the full
scenario: a real author→reviewer→publish flow followed by a provenance read,
plus four negative cases (non-member, anon role, extra input field,
non-existent `factId`) — all behaved as specified. Staging deployment and an
isolated backup/restore rehearsal remain unrun; see `artifacts/VPJ-74/unrun.md`.

## Consumers

VPJ-75/76 and #211 may read this shape once accepted; they must not assume
`relation` is always non-null, and must not treat a `legacy` lineage row as
if it had a real `fetchedAt`/`effectiveAt`.

## Rollback

Drop `public.ops_knowledge_provenance_read_v1`, drop
`knowledge_review_private.ontology_relations`/`.ontology_types`, and drop the
three added `source_revisions` columns. No existing row in any pre-existing
table is modified by this migration, so rollback loses only this slice's own
additions.

# VPJ-74 slice 1 — explicitly UNRUN

- **Staging deployment and read-back.** Verified against a disposable local
  Postgres instance only (project_id `vp-v4-ai-08`), not the shared Staging
  project. The ticket's own acceptance requires "实际Staging API/Ops读回通过"
  — not satisfied by this slice.
- **Isolated backup/restore rehearsal.** Not run in this session. The
  migration's own reversibility (dropping the new function/tables/columns)
  was reasoned about, not exercised as an actual backup→migrate→restore
  drill against a snapshot.
- **`apps/ops/**` UI surface.** No Ops-facing UI was built or touched in
  this slice — verification used direct RPC calls (`psql`) against real
  Postgres, not an HTTP/UI path. The allowed-paths list in
  EXECUTION-CONTRACT.md includes `apps/ops/**`; this slice did not need it
  and did not add one, since the read-only RPC was independently verifiable
  without a UI.
- **Write-path lineage tracking.** `source_revisions.fetched_at`/
  `effective_at` are added but `ops_review_workspace`'s `submit_statement`
  branch is intentionally NOT changed to stamp them — every row, old and
  new, stays `lineage_status = 'legacy'`. Teaching the write path to record
  a real fetch/effective time (and deciding what "effective time" even
  means for a manually-submitted synthetic source) is deferred.
- **Crawl/parse error handling.** The acceptance bullet "抓取与解析错误不变成
  政策变化" targets an ingestion/crawling path this slice does not have —
  it belongs to VPJ-75 (LLM Wiki ingestion), not to this pure read view.
  Not applicable here, not silently skipped.
- **Full VPJ-75/76/#211 consumption.** The contract
  (`docs/contracts/knowledge-provenance.md`) is frozen and the TS mirror
  exists, but no downstream ticket has actually consumed it yet — "文档/
  schema或fixture单独通过不能关闭本票" per the ticket's own acceptance text.
- **Wider ontology coverage.** Only the 9 predicates the current schema
  already accepts are registered. A future statement using a not-yet-existing
  predicate would need both a `statement_valid()` change and a matching
  `ontology_relations` row — this slice does not anticipate or pre-register
  hypothetical future relations.
- **Version-diff UI/API for "并排核查新旧版本".** `sourceHistory` returns the
  raw list of same-`source_key` revisions; no dedicated diff rendering or
  comparison endpoint was built — a consumer must diff the `declaration`
  JSON itself.

#358 remains OPEN. This slice does not claim full VPJ-74 acceptance.

# VPJ-74 — explicitly UNRUN

- ~~Staging deployment and read-back~~ **DONE in slice 3** — see
  `staging-verification-slice3.md`. Real submit→review→publish→provenance-
  read flow plus an `OPS_FORBIDDEN` negative case, run against the actual
  shared Staging project, with a schema+data backup taken first and all
  test data cleaned up afterward (verified byte-for-byte back to the
  pre-test baseline row counts).
- **Isolated backup/restore *rehearsal*** (an actual restore drill, not
  just taking a backup) remains not run — slice 3 took a real backup but
  never needed to restore from it, since the push succeeded cleanly.
  `docs/runbooks/backup-restore.md`'s full rehearsal protocol (separate
  isolated project, RPO/RTO targets, PITR) is still a separate, larger
  exercise this slice did not attempt.
- **`apps/ops/**` UI surface.** No Ops-facing UI was built or touched in
  this slice — verification used direct RPC calls (`psql`) against real
  Postgres, not an HTTP/UI path. The allowed-paths list in
  EXECUTION-CONTRACT.md includes `apps/ops/**`; this slice did not need it
  and did not add one, since the read-only RPC was independently verifiable
  without a UI.
- **`effective_at` semantics.** `fetched_at`/`lineage_status='tracked'` are
  now stamped on new source revisions (slice 2, see
  `lineage-tracking-slice2.md`), but `effective_at` is still never set for
  any row — deciding what "effective time" means for a manually-submitted
  source (a business fact about the source, not the submission moment) is
  still deferred to a later slice.
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

# Candidate import dry-run contract

AI-24 provides a C0 fixture-only dry-run boundary, not a source importer or Canonical POI service.

The exact closed manifest permits only `csv` or `jsonl`, `utf-8`, a bounded source ID/hash, and a non-empty opaque licence receipt ID. Rows carry bounded external ID, exact name and aliases, city code, and integer latitude/longitude microdegrees. Raw source payloads, arbitrary metadata, model fields, and Canonical IDs are rejected before state changes.

First use of a source ID returns private Candidates. Repeating its exact manifest hash is an idempotent no-op; changing the hash is a conflict and emits no Candidate. Candidate IDs are derived internal identifiers only; no API permits a model or importer to create, merge, or publish a Canonical ID. Each city receives at most 20 candidates.

This ledger has no parser, durable diff/rebase/commit, append-only audit store, database transaction, RLS, feature flag, public route, policy-receipt verification, or public Fact projection. `pnpm db:verify` and `pnpm test:integration` therefore record the unavailable local runtime instead of proving it.

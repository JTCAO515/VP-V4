# AI-23 VP-Final import migration plan

**Objective:** Preserve the VP-Final import/review/audit information relationship in a minimal, closed TypeScript ledger: source row replay creates a private Candidate, an author creates a CAS-bound Change Set, and a distinct reviewer records one reviewed Fact with its eligibility recheck event and audit receipt.

**Scope:** The pure `lib/server/knowledge/import` ledger, security golden fixtures, this contract, command/unrun evidence, and handoff metadata. The ledger accepts only opaque bounded identifiers, source version, and source-row hash; it deliberately does not accept source content.

**Anti-goals:** No legacy directory or CSV service copy; no bulk approval; no database, RLS migration, provider, credential, public route, public Fact projection, external source, or real transaction claim. Merge, split, tombstone, and source-delete are explicit private audit dispositions only, not destructive data operations.

**Acceptance:** Candidate visibility remains private; replay drift, self-review, stale Change Set revisions, and duplicate approval deny closed. A successful independent approval returns the reviewed Fact, eligibility recheck event, and audit receipt atomically from one ledger operation. The public projection remains empty until a separate approved eligibility/publication boundary exists.

**Rollback:** Revert the isolated ledger, fixtures, contract, handoff, plan, and evidence. No schema, durable data, source data, provider configuration, account, flag, or external state exists.

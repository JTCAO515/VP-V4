# AI-24 Candidate Import plan

**Objective:** Provide a bounded, licensed-manifest dry-run that turns fixture CSV/JSONL rows into private Candidate records without creating or merging Canonical IDs.

**Scope:** A closed in-memory dry-run ledger, RL-08 fixtures, contract, evidence, and handoff. Candidate matching carries external ID, exact name/alias, city code, and integer geo coordinates; each city is capped at 20 records.

**Anti-goals:** No source-file parser, legacy data, database migration, RLS, model, Canonical ID, public projection, actual commit, rebase, or destructive conflict resolution.

**Acceptance:** Same source/hash is a no-op, changed source hash is a conflict, malformed/unlicensed/model-bearing input fails closed, and two city fixtures each remain bounded at 20 private Candidates.

**Rollback:** Revert the isolated ledger, fixtures, contract, handoff, plan, and evidence. No schema, durable data, source content, account, provider, flag, or external state exists.

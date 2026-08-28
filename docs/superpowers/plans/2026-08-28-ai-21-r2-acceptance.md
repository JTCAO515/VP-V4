# AI-21 R2 acceptance audit plan

**Objective:** Produce a reproducible R2 Grounded Text Internal Alpha acceptance record that separates the repository's fixture-only implementation evidence from missing provider, environment, database, and release evidence.

**Scope:** Release evidence only: `docs/acceptance/r2-grounded-text-internal-alpha.md`, command/unrun ledger, and required handoff records. It audits AI-16 through AI-20 and red lines RL-04/RL-05 without adding a provider, route, schema, prompt, account, flag, deployment, or external claim.

**Anti-goals:** No production release, provider configuration, credential/environment access, database startup, migration, data write, browser account action, or status-label mutation. A blocked verdict is correct when required evidence is unavailable.

**Assumptions:** The pinned package manager is pnpm 9.15.9; local pnpm 11 must not rewrite its legacy override lockfile format. Existing synthetic contracts are evidence only, not real provider or production capability.

**Acceptance:** Record exact command results for lint/type/build/static, contract, security, eval, docs, diff and database configuration. Name RL-04/RL-05 fixture counts and invariants. Complete all eight dimensions, unrun disclosure, rollback, and observation window; return `blocked` unless R2's real-provider, environment, cost/latency, flag and staging evidence exists.

**Rollback:** Revert this Issue's audit documents and handoff entries. The audit creates no durable or external state.

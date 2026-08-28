# AI-25 Ops review plan

**Objective:** Preserve the author/reviewer/audit relationship required by a future separate Ops deployment without creating an Ops app, deployment, account, secret, or public review route.

**Scope:** A closed process-local review ledger, RL-08 fixtures, contract, evidence, and handoff. A Draft is author-bound; a distinct reviewer can publish one private Fact only when audit recording succeeds.

**Anti-goals:** No `apps/ops`, external deployment, environment variable, secret, public project, bulk approval, raw payload, source content, database, RLS, Canonical ID, Fact public projection, provider, or feature-flag claim.

**Acceptance:** Self-review denies; audit failure leaves neither Fact nor audit event; independent review yields only private metadata without an Ops secret.

**Rollback:** Revert the isolated ledger, fixtures, contract, handoff, plan, and evidence. No durable or external state exists.

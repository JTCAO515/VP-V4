# AI-22 purpose-bound policy receipt plan

**Objective:** Add a deterministic, in-memory policy registry that emits an immutable `PolicyReceipt` for every allowed or denied atomic field/region/action/purpose grant, makes a registered policy immediately unavailable after revocation, and invalidates registered derived consumers on revoke/expiry.

**Scope:** A closed TypeScript policy module, contract/security fixtures, a frozen contract document, command/unrun evidence, and handoff. The module covers display, cache, persist, LLM inference, embedding, translation, TTS, training, trial, derivative, share-alike, combination, backfill, redistribution, retention/purge, and terms-recheck metadata.

**Anti-goals:** No provider, licence dataset, external request, credential, database migration, cache, RAG, Explore/SEO route, actual deletion, feature flag, or public capability. An invalid or expired policy must deny before a caller can transmit or persist anything.

**Acceptance:** Unknown, expired, and trial-ended records deny with `DATA_POLICY_BLOCKED`; every decision creates a receipt; revocation invalidates every registered consumer class in a deterministic cascade plan; RL-06 fixtures state the no-action-without-current-policy invariant.

**Rollback:** Revert the isolated module, fixtures, contract, handoff, and evidence. No durable or external state exists.

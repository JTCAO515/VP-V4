# AI-19 acceptance evidence

Issue: AI-19/#21. Deviation: **D2** — additive and default-closed retrieval interface baseline.

## Executable evidence

- The original implementation retained its expected-red record: the contract and security suites failed with `ERR_MODULE_NOT_FOUND` before the hybrid module existed.
- Current local verification passes `pnpm check` (source-policy lint, strict TypeScript, production build and 22 static/foundation tests), `pnpm evals` (20 deterministic evaluators) and `pnpm test:security` (53 passing; one unrelated local-Supabase test skipped). The focused AI-19 cases cover exact-first fusion, RL-02's six denied fixtures, five opaque locales plus no-evidence, and rejection of content-bearing profile fields or non-deterministic timestamps.
- Runtime invariant: `isEligibleFact` runs before hit association. Candidate, draft, deprecated, expired, licence-blocked and unknown-ID fixtures produce `0/6` evidence leakage.
- The evidence refresh must receive a new independent review before merge; it does not alter the retrieval contract.

## Eight-dimension applicability

| Dimension | Status | Evidence or reason |
| --- | --- | --- |
| Functional | applicable | deterministic exact-first, RRF and no-evidence fixture assertions; current `pnpm evals` passes 20 deterministic evaluators |
| Interface | applicable | closed TypeScript input/output and exact-key runtime validation |
| Data | not applicable | no migration, database, projection table or durable state exists |
| Security | applicable | RL-02 0/6 leakage; content-bearing/duplicate/malformed inputs reject |
| Performance | not applicable | no database, vector scan or production query exists |
| UX | not applicable | no route or UI exists |
| Observability | applicable | deterministic ranks/profile IDs are output; Knowledge owner re-audits at the next adapter Issue |
| Compliance | not applicable | no provider, source text, account, region activation or external data exists |

## Observation and rollback

The Knowledge owner re-audits the fixture report when an accepted retrieval adapter introduces a real database/profile. Until then, the observation cadence is each adapter pull request and the default product behavior is unavailable. Revert this Issue's isolated files to roll back; no durable or external state exists.

# Change Proposal reference backend — 2026-10-02

Related to #560; keep the parent OPEN. Branch `codex/vpj79-change-proposal-reference-20261002`; implementation base `3aae77d7d0bd3f8d0ad7bc9849932c008ffd35a0`. Rebased without conflict onto `0247e8a03b15c3297f51507755130a42837bb090`; intervening native appearance/Library and Ops startup changes do not overlap this backend implementation.

## PASS — local, disposable only

- Closed reference + unchanged comparison contracts: 3/3. Extra patch/digest/confirm/URL/title/actions, unknown schemas, absent fields, noncurrent/historical or non-Trip-bound receipts are rejected.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm docs:check`, diff checks.
- Dedicated full-migration Auth/Next/Postgres runner at explicitly prebound base 63420: 11/11, zero skips. Two synthetic native actors use actual credentials/login; native APIs create/read/revise/reject genuine persisted Proposals. Source tasks use the existing local synthetic worker; no external provider or Proposal-confirm call occurs.
- Exact service-only save/replay, idempotency mismatch, owner versus foreign/anonymous/session-replaced read, producer/owner role separation and content closure; no changes to Trip/title/head/events/confirmation receipts from reference publication/read; no model request from the artifact path.
- Existing Proposal revision creates a new canonical ID/revision, invalidates the old reference and permits a new exact reference; rejection/expiry/owner/revision change, source hide/delete, goal/Task invalidation and consent/artifact withdrawal hide the reference. Canonical Proposal deletion cascades dependent storage.
- Proposal update lock prevents publication with `STALE_BASIS`, leaves no partial artifact and permits exact retry after release. Legacy latest/Trip/Task comparisons remain readable with more than 64 newer references; the new type never consumes their candidate bound.
- Function ACL: anonymous/authenticated EXECUTE remains exactly allowlisted; internal helpers/private tables remain inaccessible; service cannot impersonate owner reference reads. New read privilege is owner-scoped, not a Proposal/confirm writer grant.

## Fixture and repair boundary

No production fixtures, native/UI files or target data change. Initial ordinary cases use actual native-created Trip v0 and pending proposals. Archive guard is tested with a legal synthetic v1 Trip/snapshot prepared **before** goal linking, proposal creation and artifact publication. After proving the reference current, only a valid archived-v1 metadata row is inserted; head/base stay v1 and the no-write assertion compares that legal initial state. No applied Proposal event/receipt is fabricated. This is a SQL archive eligibility boundary, not acceptance of the archive API or proof of a confirmed Trip.

The first test helper attempted to decode the empty 405 response as JSON; it now handles an empty body. The next archive fixture used archived version zero; it was repaired to the legal baseline above without changing constraints. A supplementary lock-holder probe lacked an input newline and stalled before acquiring a lock; the test holder now has newline/readiness timeout/cleanup. Only this test's own process/stack was released, then the dedicated checks passed. All disposable test users/services/stacks were removed.

Effective upstream session/Proposal/Trip permission evidence is reused. Required CI runs on the final PR head. Main owns independent review/merge.

## Restart recovery

JT restarted the computer after the implementation was committed and rebased. On recovery the original branch/worktree was clean at checkpoint `81f70ca4ef6a7694bae30eb2ea5e7cd7dac41c32`; no PR existed yet. Temporary raw logs under `/tmp` were removed by restart and are not claimed as retained artifacts. The completed results above were observed before restart, including the final Auth/ACL 11/11 and contract 3/3/typecheck results independently checked by main. They are reused for the unchanged implementation. No unfinished test is promoted to PASS. Docker's missing local socket on initial recovery is an unavailable runtime dependency, not a product failure; PR preparation does not require another full local run.

## PR #615 review repair

Main found that malformed successful session RPC replies were classified as 401 by the shared comparison/reference HTTP gate. Before comparing identity, the gate now requires a non-array object containing UUID subject/sessionId; malformed data returns 503 `RESULT_UNAVAILABLE`. Valid identity mismatch and explicit `UNAUTHENTICATED`/`SESSION_REPLACED` remain 401. No private result RPC follows malformed/mismatched/error session responses; no-store remains on every outcome.

Focused in-memory signed-credential/transport regression: 2/2 PASS for both reader types, covering null/empty/array/scalar/missing/invalid session fields, valid mismatches, transient/explicit authority errors, and valid exact RPC dispatch. Typecheck/diff PASS after repair. These mocks are transport classification evidence, not real Auth/DB acceptance; the effective real Auth/ACL evidence above is reused as instructed. Applicable CI runs on the repaired final SHA.

## UNRUN

Real provider-produced reference, new consumer UI, real Staging/production migration, physical device and whole #560 acceptance. No Simulator use, target writes, payment, confirmation or deployment in this slice. Rollback/retention on an existing target is not claimed from fresh disposable migration application.

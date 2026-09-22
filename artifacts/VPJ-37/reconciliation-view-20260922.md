# VPJ-37 attempt reconciliation view

Related to #229; S5 repository increment based on main `72095f93`.
One result: the existing authenticated budget snapshot is readable by outcome,
attempt state, provider, money and integrity in zh/en. Same RPC and permission gate;
no migration, worker, ledger, shared Ops layout or runtime flag changes.

- Business answered, partial, technical failure and unobserved stay separate.
  Technical completion is not a semantic success claim. Task IDs remain deduplicated.
- All provider attempt states and exact decimal-string money remain visible.
  Missing metrics stay Unknown even on an empty scope; no invoice is inferred.
- Independent findings remain visible together. Text diagnostic remains available.
- Read failure or invalid payload clears the previous snapshot.

Validation so far:
- PASS: 7 focused observability contract tests (Node strip-types).
- PASS: source policy lint (346 files), git diff --check.
- Linux Quality PR CI owns typecheck/build/full suites and the new desktop/390x844
  synthetic-response browser tests; its eventual exact-head result is recorded in PR.
- UNRUN locally: heavy build, full suites and browser server because Overall prohibits
  additional local load; no database stack or simulator was started.
- UNRUN: deployed authenticated Ops read, provider billing, capability/provider/city
  stop/resume and real operational drill. Existing verification/unrun records remain.

Rollback: revert this presentation increment; retain original ledger and permissions.
No source data is changed. #229 remains open. Overall integrates global handoff.

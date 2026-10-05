# #236 F1 SQL verification — 2026-10-05

Runtime frozen at `e8d61f65`, migration SHA-256
`cc672c2d0afbc9651b97f3f054a72c673a1cbc9e61d1af2e41ed3d06182274e7`.
Base is Main `70a19fd0`, including the original Brief migration/triggers.
Original dirty checkout and paired TS/native files were not edited.

| Check | Observed result |
| --- | --- |
| Full historical migrations + sole `070000` replay on network-none PostgreSQL 17.6.1.159 | PASS |
| Owned PDF SQL suite | PASS 8/8, 0 skipped/cancelled/todo |
| Direct import of paired actual TS `buildPdfPreview`, compared with current SQL snapshots | PASS in the owned SQL suite |
| Default-deny RPC/private table RLS and fixture-only explicit grant | PASS |
| Original bytes vs canonical command, Unicode/UTF16, integral spellings, ordered four fields | PASS |
| Original explicit writer, immutable lineage/revision/expiry, historical exact applied receipt | PASS |
| Duplicate/conflict addition preserving fixed original items and relative ordering | PASS |
| Cancel tombstone, TTL worker, logout/replacement/session deletion, Trip/account lifecycle | PASS |
| Actual encrypted core PDF export commit, unenrolled complete rejection, legitimate old partial artifact not retrofitted, source erasure invalidation | PASS |
| Real two-session cancel/confirm and export-source contention; zero observed deadlocks | PASS |
| Source SQL contract | PASS 3/3 after correcting its SQL-string quote matcher |
| Affected original suites: core-export D2, Memory-export D4, linked-Trip-delete D3, scoped original writer, local recovery guard | PASS 61/61, 0 skipped/cancelled/todo |
| `git diff --check` | PASS |
| `pnpm docs:check` | PASS |

Commands actually run:

```sh
VP_TURN_DB_TEST=1 VP_PDF_TS_WIRE_ROOT=/Users/jtsm5p/Documents/Codex/VP-V5-worktrees/vpj55-pdf-intake-server-20261005 node --test tests/integration/pdf-intake/pdf-intake-postgres.test.mjs tests/contract/pdf-intake/sql.test.mjs
node --test tests/contract/pdf-intake/sql.test.mjs
VP_TURN_DB_TEST=1 node --test --test-concurrency=1 tests/integration/privacy/core-export-d2.test.mjs tests/integration/privacy/memory-export-d4.test.mjs tests/integration/privacy/linked-trip-delete-d3.test.mjs tests/integration/scoped-edit/scoped-edit-postgres.test.mjs tests/integration/trip/local-recovery-guard.test.mjs
git diff --check
```

The combined final PDF/contract command first reported PDF 8/8 and contract 2/3;
the sole failing contract assertion expected unescaped quotes inside an SQL source
string. Its matcher was corrected and only that contract file was rerun: 3/3 PASS.
No runtime source changed after `e8d61f65`, so the 61 original regression results
remain applicable. Earlier runtime findings were fixed: test Auth schema usage,
integer numeric normalization, pre-admission candidate erasure respecting the
original privacy fence, and volatile export source row locking. None was waived.

Paired TS source hashes used for preview parity:

- `contract.ts`: `e4d3b9ee1ed5bc2a004f5373521baa540c52fbe6e29a6d58a0b67c138eae63f5`
- `preview.ts`: `b8bca4998a48f3689037ce52f68dd7cb1a9fc8a245b8accc45441f3aff8c1c1c`

The SQL fixture uses synthetic owned Auth/session rows and claims, never signed
target Auth. Disposable Docker containers are network disabled and removed by
the test harness. No default grants, provider call, Storage, configuration,
credential or real user data operation was performed.

UNRUN in this SQL task: target migrations/enrollment/retention scheduling,
production/provider/device/human acceptance and the full parent #236/F2 scope.
Signed local Auth/HTTP plus actual Native PDFKit producer is independently owned
by the TS integrator; its outcome is not claimed from SQL fixtures here.

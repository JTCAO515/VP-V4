# #236 F1 integrated verification — 2026-10-05

The Files PDF producer, page/line correction UI, actual owner/Trip/head preview,
durable same-operation submission, original Proposal diff/explicit confirm,
historical receipt recovery and temporary-data lifecycle are implemented.
F2 remains a separate unfinished task; this does not close all #236.

Integration base: main `70a19fd023cb0d55108beb57d7d1062fe682d9ba`.
Sole integrator branch: `vpj55-pdf-intake-server-20261005`.
Native original source `d2254fa4`, necessary corrections `d53e7a99`/`fd38ebd7`,
actual Native test corrections `390da6ae`/`f3d6cf6e` were normally integrated.
Adjacent PBX conflicts were resolved by retaining every Brief/PDF object and source/test
membership; `plutil -lint` passed. Original dirty checkout was never edited.

SQL source `e8d61f65` is unchanged after integration; SHA256:
`cc672c2d0afbc9651b97f3f054a72c673a1cbc9e61d1af2e41ed3d06182274e7`.
TS preview/command source hashes match the SQL owner's actual import/parity run.

| Scope | Actual result |
| --- | --- |
| Bounded command/additive preview/receipt negatives | PASS 5/5, 0 skipped |
| SQL source contracts | PASS 3/3, 0 skipped |
| Native PDFKit/limits/private copy/canonical/raw-journal unit checks | PASS original 7/7; necessary contract delta 3/3, separate recorded scopes |
| Native actual PDFKit → ordinary signed Auth → PDF RPC → original Proposal/diff/explicit confirm → same Trip reload/receipt/duplicate/conflict | PASS R3, 1 test, 0 failures/skips, Xcode exit 0 |
| Native same-source reuse | No Native runtime change after R3; later TS-only test corrections do not rerun it |
| Final server real Auth/HTTP/RPC/original confirm/owner-RLS event/repeated-conflicting imports/cancel/TTL/epoch | PASS 1/1, 0 failures/skips/cancelled |
| Owned PDF PostgreSQL + actual TS preview import + lifecycle/export/contention | PASS 8/8, 0 skipped, SQL owner's unchanged-source evidence |
| Affected original export/delete/scoped Proposal/local-recovery PostgreSQL | PASS 61/61, 0 skipped, SQL owner's unchanged-source evidence |
| TypeScript, lint, Web production build, docs, diff | PASS |
| Real DB lane registration/classification | PASS; exact PDF PG path uses existing `VP_TURN_DB_TEST=1`, HTTP runner uses owned port base 65000 |

Native R3 and final server results are separate observed scopes, not a fabricated
single successful combined run. Native R3 actually generated a two-page PDF with PDFKit,
read/corrected its true page lines, compared/confirmed/reloaded the actual same Trip and
recovered the actual applied event. It preserved the original selected file.
The final server case preserved complete original day ID sequences/positions and
every existing explicit manual order, valid fixed timestamp instants and non-time fields.
A previously implicit order can normalize only to that same safe integer position.

## Exact final commands

```sh
node --experimental-strip-types --test tests/contract/intake/pdf-intake.test.ts tests/security/artifacts/pdf-intake-receipt.test.ts
node --experimental-strip-types --test tests/contract/pdf-intake/sql.test.mjs
VP_PDF_NATIVE_INTEGRATION=1 VP_NATIVE_PDF_SIMULATOR_ID=802FD061-F76B-40E6-9DD1-07BBE72166BD VP_NATIVE_PDF_DERIVED_DATA=/tmp/vpj55-native-pdf-dd node --experimental-strip-types tests/integration/intake/run-pdf-intake-http.mjs --port-base 65000
node --experimental-strip-types tests/integration/intake/run-pdf-intake-http.mjs --port-base 65000
pnpm typecheck
pnpm lint
pnpm build
pnpm docs:check
node scripts/ci-suites/db-integration.mjs --list
git diff --check
```

The Native command is the actual R3 invocation. Its Native case passed, while the
following server assertion failed; only the failed server case was subsequently
corrected/rerun. The final server command uses the strengthened complete-day assertions.
Actual Native Xcode invocations and sanitized results are recorded in
`native-pdf-20261005/commands.jsonl` and its sanitized R3 pass log.

## Failures retained, with source corrections

- R1: Xcode did not forward `SIMCTL_CHILD_*`; one Native case skipped. Runner correctly
  rejected it. The fix writes a temporary protected XCTest environment profile and
  removes it afterward; no scheme/signature/credential configuration changed.
- R2: fixed timestamps `10:00+08:00`/`12:00+08:00` became the original writer's
  equivalent UTC representations. Raw string equality failed. Tests now demand valid
  complete ISO timestamps, matching nil presence and exactly equal instants, with no
  tolerance; other fields/order remain exact. Xcode's 600-second diagnostics collection
  ended naturally, without interruption.
- R3: Native 1/1 passed; the server test erroneously expected `versions` on an API that
  intentionally omits history. It now reads the original event through an ordinary
  owner JWT/RLS client and compares exact event/owner/Trip/Proposal/version/type.
- R4: a previously implicit imported item's position became explicit `manualOrder:2`
  at the unchanged position. The test now binds normalization to the exact complete-day
  index and keeps all prior explicit values/other fields/order protected.
- R5: server 1/1 passed. Main requested a clearer complete-day basis instead of prefix
  slicing, so that test-only strengthening was actually rerun: final server 1/1 passed.

No runtime guard, fixture limit, assertion for a real time/order movement, role grant,
timeout, skip condition or original suite was weakened. Raw failure records and the
Native pass remain in the adjacent server/native evidence directories.

## Cleanup and acceptance boundaries

All six uniquely named disposable Auth/HTTP stacks were removed with `--no-backup`,
including the final `vp-native-ask-96e1e22b`; every run recorded cleanup PASS.
Fixtures containing synthetic credentials were mode 0600, passed by file path and
deleted afterward. Native runner retained only sanitized logs and never inherited
Supabase secret/service-role values. The Native owner shut down/deleted its own
`802FD061-F76B-40E6-9DD1-07BBE72166BD` simulator and removed its owned derived data.
Generated Next AGENTS/next-env churn is excluded from the PR.

New PDF entry/retention/export RPCs retain default deny. Local explicit fixture GRANT
is proof of the permitted local chain only; it does not activate any real target.

UNRUN: real user Files picker/provider interaction, physical iPhone/VoiceOver/human
acceptance, real private documents, target migrations/enrollment/retention scheduling,
provider rights/qualification, Production/release and all F2 system sharing/link scope.
No raw PDF/full page text upload, new credentials, paid provider call, Storage,
entitlement/account configuration or target deployment occurred.

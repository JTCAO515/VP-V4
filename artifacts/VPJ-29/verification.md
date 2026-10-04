# #220 backend evidence — 2026-10-04

Source: TS/API `e72ac95d`, SQL owner `bbd127df` + `87967db9`, integrated as
`4ee83d36` on actual main `8d30d0ba`. Native owner's exact `9c466e10` is integrated
without conflicts as `646ff1db`; source review found no additional consumer defect.

Current complete source integration: `beebb365828ee036038918ff0d0aa0d951f15d6c`.
This includes R2 TS/API `5c2a657c`, original digest fix `917b198c`, SQL recovery
`e0678c31` and its `307b5c4b` evidence, Maps authority `b58ae380`, Maps TS/context
`2970e4da`, Native R2 `8bb00f57`, and registry/negative fixture `82d779bb`.
All were normal same-result cherry-picks, no conflicts; source tree is clean.
No second Trip writer, source activation, grant, actual provider call or production action.

## Final integration deltas

- R2 consumes the dedicated source-qualified SQL context with a closed full
  user-selected scope/mode/references. Its report is null and source branch is
  separate from user_report. Qualification absence returns pending; original
  selection/operation receipts remain unchanged.
- Original Proposal digest is `trip-v2:<64hex>`; context/content hashes remain
  bare SHA256. Corrected the TS validator and synthetic fixture, with the existing
  original-ACK case proving wrong-prefix rejection retains the exact unknown
  operation. This was a source-inspection contract mismatch, not an observed
  target UI failure. Affected case PASS 1/1, zero skips.
- R2/R1 targeted consumer run initially had 36 PASS / 1 FAIL / zero skips. The
  failed drift fixture reused a prior request's read counter, so both reads
  returned the same changed digest. Resetting that fixture counter made the one
  failed case PASS 1/1, zero skips; no source guard was weakened. Original log
  `/tmp/vpj29-r2-consumer-tests-initial-fail.log`, rerun
  `/tmp/vpj29-r2-consumer-drift-rerun.log`.
- Actual disposable SQL + production recovery HTTP at 030000 R2 (040000 absent)
  PASS 1/1, zero skips: real missing-qualification pending branch, null report,
  exact transport reference and no candidates. It does not prove successful
  qualified Trip application. Log `/tmp/vpj29-r2-http-joint.log`.
- Existing postgres lane now includes `VP_TRAFFIC_DB_TEST=1` and the one Maps
  authority file; both original recovery PG entries are retained. Classification
  and 9 governance tests PASS, zero skips. Evidence reused from
  `/tmp/vpj29-r2-registry-tests.log` and `/tmp/vpj29-r2-db-classification.json`.
- Native R2's 8 source hashes were checked against the integrated files, PASS
  8/8. Its saved final generic build logs contain BUILD SUCCEEDED. Reuse the
  owner's bounded 8 R2 source cases, one affected digest case and iOS test-module
  typecheck evidence in `native-transport-recovery-20261004/verification.md`;
  no full iOS runtime, device or target claim follows.
- Maps TS/context and Maps SQL evidence are versioned separately. Their fixed
  source and tests are included; no local rerun of the already-proved full Maps
  matrix was requested or performed. See the Maps evidence and the SQL recovery
  protocol evidence directories for exact scopes and original failures.

The successful reservation-authority → source-qualified candidate → original
atomic confirmation chain remains UNRUN until #646 normally merges into main.
Source integration can finish without treating that missing dependency as a pass.

| Check | Actual result and scope |
| --- | --- |
| Existing recovery helper + new candidate/service contracts | PASS 29/29, zero skips. Exact opaque selected scope, fixed dinner/all other items, lawful context pace, unavailable/unknown/unbound orders, future/expiry/high-risk, closed wire and exact unknown ACK/operation identities. |
| Actual Native/Web handler synthetic SDK transport | PASS 5/5, zero skips. Ordinary synthetic JWT/Cookie, exact same Origin, no ambiguous credentials, epoch drift, SQL-seam request dispatch, old Proposal diff/digest and original operation recovery. SQL is intercepted in this set; it is not real DB evidence. |
| Affected original Proposal/Patch contracts and revision/reject security | PASS 12/12, zero skips. Unchanged original writer/diff contracts reused. |
| TypeScript / source policy lint / diff | PASS. Early TS18046/TS2345 selection narrowing and absent Web readArchive TS2339 were actual typecheck failures; corrected locally, typecheck and lint pass. No runtime test failure is inferred from those type errors. |
| Next.js production build | PASS. Both Native and Web recovery routes registered; log `/tmp/vpj29-next-build.log`. No Swift/Hotel build performed. |
| Documentation check | PASS: existing plan/contracts/archive hashes remain valid. |
| Real disposable PostgreSQL + production HTTP | PASS 1/1, zero skips, at main 8d30 (reader absent). Full actual migrations and production handler; synthetic signed JWT/admin SQL bridge. Actual missing reservation reader returns pending, zero context/candidates, original Trip head unchanged. Log `/tmp/vpj29-http-joint.log`. No stand-in reservation reader was installed. |
| SQL owner original package evidence | Owner reported PASS 5/5 zero skips: real full-main DDL transaction/rollback, default ACL/RLS, ordinary writer, missing actual reader, closed input and mandatory marker, private export negatives. Reuse scope is SQL source 87967db9; successful-source chain is not included. |
| Native owner fixed source | Integrated exact 8-file source `9c466e10`, including Today entry, models/store/view/journal, approved Session cleanup hunks and tests/project registration. Owner/Main reported unsigned generic build PASS and 12 source SwiftTesting cases (15 parameter results), including actual Session-method source projection with URLProtocol. These are not a complete iOS runtime or device/human acceptance. iOS test-module typecheck was still in progress at this record. |
| Native evidence and narrow copy delta | Exact original build/source-test logs imported from owner `9b887cae`; BUILD SUCCEEDED and 12-test run read back, 8 original source hashes matched before the copy delta. iOS NativeRecoveryTests typecheck against the full compiled module subsequently PASS (exit 0); historical missing-plugin/harness failures preserved in original logs. Owner `fc56d1d1`, integrated as `e9c2bf9f`, changes only 17 zh/en string lines in RecoveryView. Owner reported Swift frontend parse/diff PASS and code/AX IDs unchanged with strings removed. Reuse original behavior/build evidence by unchanged scope; no full iOS runtime claim. |
| Integration classification/governance | PASS: only two new tests appended in existing postgres lane; classification and 9 governance tests, zero skips. No existing entry removed. |

`tests/integration/trip/recovery-http-joint.test.mjs` contains the actual installed
reader positive path: source context → local candidates/diff → select with lost ACK
after real SQL commit → exact receipt → original confirmed Proposal → same-key retry
→ one exact original event/version, fixed and unselected items preserved. At this
base #646 is still unmerged, so that positive branch is explicitly UNRUN rather
than populated by an unmerged reader. Run it once after normal upstream merge.

New RPCs/functions remain default revoked. No target grants, source publication,
provider/model/Maps calls, deployment, real credentials, phone or resource kill.
Fixture credentials and ordinary target Auth are distinct evidence. Main owns the
final combined integration/registry/PR and whole-Issue closure.

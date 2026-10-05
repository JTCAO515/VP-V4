# VPJ-58 material SQL owner handoff

Owner: this SQL chat / branch `vpj58-material-reference-data-sql-20261006`.
Base: `4d8d9417810d4bfebba3657b7267df3db3345f27`. Original dirty repository untouched.
Runtime freeze: `40a1fc553d2dfcbe5fe83ee44adaca7ff4448a2c` (includes `01477a65`).
Migration SHA256: `fb0a69c0bcb07ca4299a86fcd0602a3655c852af72fe408907d7bd922e814c10`.
Sole TS integrator: `vpj58-material-reference-data-server-20261006`. One combined PR; no SQL-only PR.

RPC: `public.privacy_material_reference_v1(text,text,bigint)`. All roles default denied.
Closed scopes/bytes/bindings/rows/boundaries follow the actual paired TS WIRE and
`contract.ts`, `rows.ts`, `protocol.ts`, `export.ts`. New `trip_list` follows Main
`fa2ed6` approval and the WIRE 03:29 CST addition. No original Trip reader or writer rewrite.

- Real source-backed `trip_list` discovers ordinary owned material Trips and archives.
  Retained historical progress also has an ordinary owner discovery entry. Original
  title only on an existing owned undeleted Trip; deleted/deleting historical context
  uses bound retained Trip version and null label. No Trip reconstruction or mutation.
- Current owner/native session/epoch/enrollment/5-minute server reauth before source
  feedback or effects. Account → session → Trip → PDF proposal/source → request/progress;
  NOWAIT is rejection, never a success receipt. No caller-supplied owner or worker lease.
- Preview CAS hashes full sensitive bytes/command, patch, replay/installed proof state,
  source revisions and projection. Fixed 30s / minimum live PDF expiry; no renewed TTL.
  Applied status without installed original confirmation is rejected, never promoted.
- Order erasure installs reference AND original operation-ID fences before deleting
  current rows and their original cascades. Original new-ID business semantics remain.
  PDF erasure calls original `erase_v1`; original applied patch/history/proof remain.
- `requests_v1` is the immutable source-free request/receipt fence. It retains IDs,
  hashes, bounds, decision times and actual minimal effect counts. `progress_v1`
  stores only transient cursor/counters. `reservation_fences_v1` stores owner/ID/kind/
  request ID only. All three are private RLS/default revoke. Progress rows expose the
  actual retained operation IDs. Selected progress cleanup retains minimum fences.
  Trip deletion clears transient progress; immutable metadata remains discoverable
  through progress `trip_list` and export. Root account deletion cascades owned state.
- Receipt recovery uses exact original UTF8 bytes and the current original actor,
  immutable decision before original deadline; it works after preview expiry and
  source/Trip deletion. Unknown ACK creates no mutation, renewal or replacement ID.

CI ownership: sole TS adds `VP_MATERIAL_DB_TEST=1` with
`tests/integration/privacy/material-reference-data-postgres.test.mjs` to the existing
DB runner lease, plus the owned SQL contract as applicable. SQL owner did not edit registry.
Target grants/roles/policies/credentials/Storage/provider/deployment/device/data UNRUN.
Real signed Auth HTTP belongs to TS; Native caller/file lifecycle belongs to Native.
Whole #239 ALL1 missing denominator / ALL2 remain OPEN, `allUserDataCompleted=false`.

Evidence: latest [PG log](pg-final.log), [SQL contract](contract-final.log), unchanged
original [reservation regression](reservation-regression-r1.log) and
[PDF regression](pdf-regression-r1.log). The PG log prints paired TS file hashes.
Disposable PostgreSQL 17.6.1.159, network none, fixture-only grants; not target Auth proof.
Actual PASS: final PG 24/24 (23 subtests plus parent), 0 FAIL/0 SKIP; owned
SQL contract 3/3, original SQL contract 3/3, original reservation 8/8 and PDF 8/8.
All commands exited 0; owned disposable containers removed. Original regression
evidence reuses unchanged old writer/guard/ACL paths for the trip-list addition.

Final PG command:
```sh
VP_MATERIAL_DB_TEST=1 VP_MATERIAL_TS_WIRE_ROOT=/Users/jtsm5p/Documents/Codex/VP-V5-worktrees/vpj58-material-reference-data-server-20261006 node --test tests/integration/privacy/material-reference-data-postgres.test.mjs
```

Earlier failures: r1 unparenthesized CASE parser; r2 invalid archive fixture; r3
corrupt-progress test uncovered missing consistency rejection; r6 Trip helper alias
ambiguity; r7 fixture violated the existing Trip capacity and used two clock
captures. Fixture now creates real confirmed archived PDF Trips and uses one
clock capture for its capacity rows. All fixed in the same owned files; final log preserves actual results.

Rollback tested transactionally before commit and as owned API/schema removal.
Existing original function bodies/signatures/ACL/config and table schemas/ACL/RLS
compare exactly before/after; only the new documented source/Trip triggers are added.

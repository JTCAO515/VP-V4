# 543e affected-source budget verification

**PASS: 19 additional named checks**, actual fresh isolated PostgreSQL 17.6. Reuse the original 29 checks in `EVIDENCE.md`/`manifest.json` for the unchanged budget function body and full 52-function catalog; the old matrix was not rerun. This addendum is the current SQL source evidence.

## Exact inputs

- Migration SHA256: `543e2617627fe7eddb8564ee4027e4c59cb986d77db2508da12a7a37ae633dea`, copied from Main's current product source after exact candidate verification.
- Previous migration SHA256: `5e07bc1ce41f236c0fd29ece8f9f15525c9e234e78f9a7a25ab22751082babdf`.
- All fields of all 52 static function catalog entries are identical. The budget function definition MD5 remains `6e9254b145253d96940793fc6d09e2d2`. Earlier 154 migration source hashes were checked against the previous actual run and are unchanged.
- Reverse the exact new revoke block, three policy-role catalog values and named-role comparison expression, and the resulting bytes exactly equal the previous approved migration. No other guard, function body/attribute or migration difference was accepted. See `affected-sourcepins.json`.
- Own helper source hash alone was updated 5e07→543e, resulting helper SHA `ed268f90a58c499359089cf94ef468812a5355a59afdeb90c6a31f3ecb08ffc3`. Main's helper also contains another writer's symlink hardening; that independent body delta was not copied here. Both unchanged text/durable overlays retain their original Main-pinned hashes. Product migration and shared helper/test overlays are not committed by this chat.

## Actual affected checks

Fresh ordered155 product replay compiled and `installed_supported_v1()` passed, with the original default-closed recovery state preserved. This fixture created the same original three roles in a different order, yielding a different authenticated OID. All three budget policy role names remained exactly `[authenticated]`; installed support passed without accepting a fixed OID or any unknown role.

The three original budget tables were checked across 4 roles × 8 privileges = **96 actual effective vectors**. Postgres retained all eight; service_role retained SELECT/INSERT/UPDATE only; DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN were false. Anon/authenticated had none, and PUBLIC had no table ACL. Actual service-role budget SELECT succeeded while DELETE/TRUNCATE were permission denied before a write; actual authenticated SELECT was denied. No synthetic grant was executed.

On the new exact source, the sealed retired-budget journal reconciled an already-disabled scope, preserved its exact original row and retired/null-owner fence, and retained monotonic floors101/101. Direct disabled no-op left the fence unchanged; repeat original stop/reconcile succeeded with floors102/102. False-to-true and an actual authenticated active synthetic Ops member's budget resume were refused. The retired eligibility was retained.

Bad digest, late maximum-revision overflow, unknown budget function source and renamed required hook refused and restored exact captured root, controls, all scopes/fences/attempts and operations on rollback. The final installed source guard was true; Trip/Proposal counts remained zero and no provider calls occurred.

## Evidence, limits and cleanup

- `affected-proof.mjs`: separate source-pinned executable. `node artifacts/VPJ-37/v10-retired-budget-20261013/affected-proof.mjs` from this WT and owning session. No original29 proof artifact was rewritten.
- `affected-proof.log`: 19 PASS lines, process exit0, no skipped assertions.
- `affected-manifest.json`: replay inventory, actual vectors, policy role OIDs, checks and final fence/cleanup.
- `affected-sourcepins.json`: verified before/after source deltas and reusable exact function evidence.
- Syntax checks on the new proof and hash-updated helper plus `git diff --check`: PASS.
- UNRUN: the managed-default extra-five removal transition itself, because this isolated initdb fixture begins without managed defaults and no synthetic grants were authorized. Actual final permission vectors and effective SQL denials are verified. Managed Supabase initialization evidence remains the bootstrap writer's scope.
- UNRUN: disabled-trigger injection (explicit no TRIGGER disable boundary), GoTrue, target environment, provider/device/human, full restore/export/erase/source-write, final-head CI/review and release. No permission/source guard was weakened.
- Fresh resource `vpj37-v10-retired-20261013-3a3e974f` used the same approved cached immutable PG17.6 image, postgres user, pullnever, networknone, zero ports/mounts and private0700 socket/data. Owner/nonce checks preceded all SQL and removal. Cleanup: ABSENT; owner-label resource inventory empty. All other writer resources were untouched.

No new product defect or source repair candidate was found. Return the budget scope at exact source543e to Main, with only this affected proof/evidence committed and pushed. No new PR, merge, parent closure or process remains in flight. The standalone proof/JSON artifacts keep the existing conservative full CI selection if Main includes them; no classification or selector change was made.

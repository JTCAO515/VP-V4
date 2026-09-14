# Place Staging integration — in progress

Frozen runtime: e19bd584ba86604047c9216e50c5329e8881dcf8, draft PR374. Local product evidence remains in ../place-grounding-20260914/verification.md.

Fresh encrypted Staging46 backup and isolated restore PASS:6 accounts,3 Trips,78 table projections and262 schema/ACL entries matched. Candidate migrations47/48 applied inside an isolated transaction and rollback exactly restored prior schema, grounded shape and all data. Restore container had no network or published ports and was removed after owned-label verification. Independent backup/restore review0Critical/0Important. Protected backup location and Keychain reference are not published.

First and second migration dry-run controllers STOPPED before CLI/apply at a boolean output parsing error (psql f is not JSON). The second repeated because the first edit script rejected an overly broad match. Both original failure logs are retained. The corrected query emits to_json(enabled); r3 dry-run PASS for exactly the two expected files. Application exit0 and postcheck PASS at2026-09-13T20:14:50Z: Staging now48 migrations, all78 original table projections retained,262 original schema entries checked against the reviewed candidate, grounded shape and RPC ACL exact. Accounts6/Trips3 unchanged; reader/Ops disabled and active members0. No place model call or client acceptance yet.

Next: dedicated compatible Preview/native build, frozen-budget v6 real place/legacy routing and actual native/Web read observations. Preserve original data/usage and restore off-state afterward. Production remains outside this scope.

Dedicated Preview `dpl_HseVd4NP2Yrd9RzC9edxGDpu8qQw` READY at frozen e19bd58; URL https://vp-v4-8hmu9lkqj-jtcao515s-projects.vercel.app. Matching native Staging build PASS with exact endpoint/context and verified ad-hoc signature (`native-build-result.json`). This is build/deployment evidence only; no place model or authenticated native/Web user observation yet. Original native build log remains in the local cache; committed copy trims trailing whitespace. Native CI34779732089 remains in progress; Quality34779732010/Budget34779732028 and PR Preview passed for e19bd58.


Continuation: the actual Ops-capable window and client observations are recorded in ../place-grounding-window-20260914/verification.md. The original read-only Preview receipt above is preserved as preparation history; it is not the active acceptance deployment.

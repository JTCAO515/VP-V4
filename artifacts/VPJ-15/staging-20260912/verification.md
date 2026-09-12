# First-party knowledge: actual Staging publication and withdrawal

Related to #205 / #206; observed 2026-09-12–13. This is a bounded S2 integration result, not complete Issue, native product, Ask grounding or release acceptance.

## Version and environment

- Runtime: merged PR337, `1db3578e7e447e9c38e4c43a338b16cb466f8d94`; isolated Preview `dpl_6F4Kga71kMDjLvezKMnavVZwHWmw` against the existing VP - V4 Staging Supabase in ap-southeast-1. Latest main `33daf722787494297026a7c35d584c0d1201c222` adds brand reference assets only; runtime evidence remains pinned to1db3578e.
- Source content: [12 original bilingual summaries](../../../docs/knowledge-base/batches/2026-09-12-first-party/README.md), not the synthetic local publication fixture. Existing controlled author and separate reviewer used ordinary authenticated API operations; no new users or Trips.
- No production release, shared staging alias move, real-person operation, model invocation, payment or source corpus import.

## Observed results

| Check | Result / evidence |
| --- | --- |
| Encrypted seven-schema backup and isolated restore | PASS; AES-256-GCM, restore with no network/ports, container removed. [Backup](backup-restore.json) |
| Append-only migration38→39 | PASS;72 original tables and237 original schema entries checked; only expected two function changes.6 users/3 Trips preserved. [Migration](migration.json) |
| Ordinary request boundaries | PASS; anonymous401, foreign Origin403, wrong expected actor403, author cannot self-review or publish. |
|12 submit → independent review → separate publish | PASS; saved operation IDs and exact submit/publication replay. Candidates are distinct from reviewed/published/eligible states. |
| Four cities × four content scenes × two languages | PASS32 reads; matching language-neutral assertion IDs, conditions, exclusions and source metadata. Unknown model recipient rejected; uncovered arrival remains empty. |
| Actual nativev2 credentials/login/read/logout | PASS;4 payment statements before logout, stale credential401 afterward. This is API evidence, not a SwiftUI knowledge screen. |
| Web reader | PASS; English390×844 and Chinese1280×900, payment and Chongqing attractions, retained conditions/exclusions and expandable source locator. No horizontal overflow at390. |
| Exact PAY-01 withdrawal | PASS; subsequent API and same-page refresh contain3 payment notes, removing “Check merchant card acceptance; ask the cashier if no network sign is shown.” Old publish receipt does not restore eligibility. |
| Membership removal | PASS; same reviewer Cookie loses Ops403 while ordinary read remains200 until the reader switch is disabled. |
| Cleanup | PASS; switches false,0 active members; Ops/read503, browser0articles/unavailable. Own WAF host removed, original rules restored atversion10; production target unchanged. |

[Safe API results](content-results.json), [final database counts](final-content-state.json), [cleanup](runtime-cleanup.json), [English viewport](en-mobile-viewport.png), [Chinese sources](zh-desktop.png), [before withdrawal](before-revoke.dom.txt), [after withdrawal](after-revoke.dom.txt), [disabled page](cleanup.dom.txt). Browser console reported0errors.

Final retained data:13 candidates including the previous private fixture,12 statements and12 publications (11published/1revoked). Reader and Ops remain disabled. Do not delete immutable audits/receipts or republish the revoked row to undo this test.

## Failures and limits retained

- First activation was refused: the CLI login role lacked private-schema access. Readback confirmed no changes. Added transaction-local `set local role postgres` to the existing authorized administration scripts (activation and cleanup); ordinary business operations still use two authenticated user accounts. Activation then passed. This changes no database grants.
- The first manual UI withdrawal assertion mistakenly identified the Alipay note as PAY-01. Actual count was already3. Corrected the assertion using the persisted candidate ID and exact PAY-01 text; saved before/after DOM confirms the intended row disappeared. No write or test batch was repeated.
- Full-page browser screenshot showed stitching/repetition artifacts; it is not used as visual proof. Actual DOM had4articles and390px scroll width; retained viewport screenshots avoid that artifact.
- Supabase connector advisors were unavailable due to connector permission; targeted actual SQL privilege checks passed. [Advisors status](advisors.json).
- Local implementation/rollback/adversarial and independent review evidence remains in [local verification](../publication-local-20260912/verification.md); it is not relabeled as Staging. No additional product tests are rerun for this evidence-only follow-up.
- Native SwiftUI knowledge consumer, Ask claim coverage/free prose grounding, complete ten-scene coverage, real physical travel services and production acceptance remain unrun. Existing S2 model semantic failures remain failures.

## Delivery

PR337 required CI passed and merge/Production guard was verified: [merge guard](implementation-merge-guard.json). This follow-up updates evidence and the shared handoff only; `pnpm docs:check` and `git diff --check` are its local checks. No Issue acceptance boxes or closure changed.

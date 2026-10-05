# #221 SQL delivery evidence, 2026-10-05

Runtime source: 501acd857c205608023ab724010179d7c6d4bc3e; baseline 4dbde74126206e8ef4229497b21d1c46f85578e8.

Disposable Docker PostgreSQL 17.6.1.159, network none; synthetic roles/claims/consents only.

The SQL runtime is final. This last evidence/test change adds actual concurrent cancel/begin to an existing case; it adds no runtime authority, migration, source or transport change. The same 17 distinct named cases remain. Counts below are runs, not an invented total of distinct passing tests.

| Run | PASS | FAIL | Skip |
| --- | ---: | ---: | ---: |
| complete owned SQL and actual TS scheduler/codec/export integration | 17 | 0 | 0 |
| last source-lock and TOKEN_REVOKED OS-state corrections; reuse unaffected preceding cases | 3 | 0 | 0 |
| explicit cancel versus begin concurrent two-RPC regression; unchanged SQL runtime | 2 | 0 | 0 |

The complete 17-case run covers full history replay, transaction rollback, default RLS/ACL deny, disabled transport, actual mobile/session/epoch and actor negatives, exact operation ACK/tombstone/concurrent abandon, strict timestamps/IANA/DST/quiet hours, semantic dismissal, cancel/begin handoff ordering, one durable attempt/no regrant, crash unknown/no retry, matching token revision, Trip/head/archive/end/expiry/OS fences, original v1 compatibility, actual reviewed source baseline/approved acked recheck/withdrawal/reviewer loss, fair quiet queue, actual Task/result/Memory basis, exact export job lease/cursor and Trip/account cascades.

Actual TS codec/scheduler and notificationExportHandler called disposable PostgreSQL through the fixture callback. Transport was synthetic; no Apple network, credential or physical device was used. Final affected source checks also use actual original publication APIs for populated canonical result evidence, then real source-revision withdrawal; locks and eligibility are rechecked before handoff. TOKEN_REVOKED disables only the matching device revision and retains the actual OS declaration.

Historical failures, repaired without weakening guards:

- first fixture run: 1 PASS / 10 FAIL. Existing Trip insert trigger already created snapshot; fixture duplicate insert repaired.
- second run: 1 PASS / 10 FAIL. PostgreSQL regex repetition upper limit: 512 changed to unbounded hex expression plus strict length.
- support fixture: 12 PASS / 1 FAIL. JS future date interpolation repaired.
- new source/rights fixtures: 3 PASS / 2 FAIL. Fixture disabled notification settings and missing cyclic Memory receipt seed repaired.
- actual service source path: 2 PASS / 1 FAIL. Original mapping helper required ordinary Auth reader; replaced in notification namespace with actual guarded private qualification predicate.
- populated canonical evidence: 1 PASS / 1 FAIL. Publication table alias shadowed preparation row variable; alias corrected.

Useful local raw logs are retained in this directory as ignored artifacts: full-17.log, affected-3.log, concurrent-cancel-2.log, historical-service-failure.log and historical-populated-evidence-failure.log. The JSON report and logs remain local according to the repository artifact ignore convention. This Markdown evidence is versioned.

Reproduction:

```sh
VP_NOTICE_DB_TEST=1 VP_NOTICE_TS_ROOT=/absolute/path/to/actual/TS/checkout node --experimental-strip-types --test tests/integration/notifications/delivery-postgres.test.mjs
```

`docs:check`, test syntax and `git diff --check`: PASS. The test fixture grants exist only inside its network-none disposable cluster; teardown removes only clusters it creates.

Tested source hashes (SHA256):

| Source | SHA256 |
| --- | --- |
| supabase/migrations/20261005030000_reminder_delivery.sql | 006ce49a5e82493d9b2d3acfc6329795bd610a2002ca80d9ca58a91650d86c13 |
| tests/integration/notifications/delivery-postgres.test.mjs | d2282be98f0f437f70f400799536a3ecd3431fbd92c3ade1af18bd54e012fc7d |
| Actual TS lib/server/notifications/wire.ts | c3dc354669aeccb35fd9c313417c850bcf55f69da2e1b96d1b57084041fcd364 |
| Actual TS lib/server/notifications/codec.ts | 1524b30b38f0fb01faf0503a7a90408e874cf2c0a3c2eab1e6cacf920a8dcbcd |
| Actual TS lib/server/notifications/scheduler.ts | bf3992d972ec65b7dc0147e63dda92ceed934c8ca92f113b5c2f26da8387552c |
| Actual TS lib/server/notifications/export.ts | 9fb5a8b8f92667b42e78228a0052b927e2559ef8f08d62dd5278921fababdca3 |
| Actual TS lib/server/notifications/delivery-contract.ts | 0cfc89ae77da0fdc8400498aaf5e798642a95acfdef925181a322d865dbeb022 |

UNRUN: Target GoTrue/JWT acceptance; Target migrations, grants and recipient/source qualification; Real APNs signing credentials/provider network/physical phone delivery; Native runtime and human acceptance; Actual user export/deletion and independent handler enrollment; Production activation.

Legacy v1 intent is not automatically dispatched. Its records without new sidecars make v2 incomplete; the new export page is independently versioned and unenrolled/partial, with no retrofit of previously completed core packages. Rollback disables new authority and preserves historical ACK/outcomes; it cannot recall an already handed-off push.

## Same-task topic handoff correction

Runtime commit `82e588c48d98f8dab78cca87bda8cab55c78c057` adds only `topic=d.topic` to the closed begin grant (now exactly 10 keys). It changes no role, permission, setting, policy or actual target configuration. The actual TS consumer now compares the nonsecret transport environment/topic binding before send; the APNs factory independently rechecks input.topic.

- Direct PostgreSQL affected run: 2 PASS / 0 FAIL / 0 skip; exact grant topic/keys and existing cancellation/handoff case, including the two-RPC race.
- Actual TS scheduler to PostgreSQL affected run: 2 PASS / 0 FAIL / 0 skip; matched grant consumed once, topic mismatch yields TRANSPORT_UNAVAILABLE with zero provider exchanges, active authorized device retained, exact original attempt cannot be regranted. The mismatched factory used an ephemeral synthetic P-256 key and an injected exchange; no Apple or real credential access.
- Existing 17 distinct cases are unchanged in count; unaffected preceding evidence is reused, not rerun or added to a fictitious distinct-case total. Docs, syntax and diff checks PASS.

Local ignored raw logs: topic-grant-2.log and topic-joint-2.log in this same directory. Target/provider/device/enrollment UNRUN facts remain unchanged.

Current affected source hashes:

| Source | SHA256 |
| --- | --- |
| supabase/migrations/20261005030000_reminder_delivery.sql | df67c60c2cb0a07d1ae4086a5e074045a4bfeee6f5174a09a436dabd7650a106 |
| tests/integration/notifications/delivery-postgres.test.mjs | 049e7a5f7660849151e62f8848e4c5a78f5ebace703bb9edfd1cc59de6667e10 |
| Actual TS lib/server/notifications/scheduler.ts | c22ea440dcf47ac106b5675f3529ae2a73bd0d82059bd57b5409fa50ac950c8a |
| Actual TS lib/server/notifications/delivery-contract.ts | 5c851d860f5d4f840673805e48663c542dbaca07d00d9e22960c50a53b34e8b3 |
| Actual TS lib/server/notifications/apns.ts | f0a24b88f1d2ace723a31a7965fc3fc0da9293d28947fd1c33be1c24edb39f2e |

## Same-task typed-claim semantic correction

The complete original typed_claim shape is claimType/subjectId/value/asOf/evidence. Source semantic now includes only status/scope/applicability/itemDigest and claimType/subjectId/value; claimRevision/payloadHash and asOf/evidence receipt metadata are excluded. Actual claimRevision and exact sourceRefs equality are now explicit qualification checks alongside unchanged mapping revision, source digest, payload hash, owner/session/epoch, current item and TTL guards. No role, setting, target or source-publication authority changes.

- Baseline reproduction: immutable SQL 82e588 plus the new existing-watch assertions in an isolated temporary workspace and network-none PostgreSQL; 1 PASS / 1 FAIL / 0 skip. Candidate reviewedAt/publication expiry refresh changed the digest. This is a synthetic old-source reproduction, not a production or CI failure. It ran after the patch because Main’s reproduction instruction arrived then; original FAIL log is retained.
- Corrected affected run: 2 PASS / 0 FAIL / 0 skip (full migration replay/ACL plus the existing watch case). Actual typed-claim receipt timestamps and publication expiry refresh retain the same content digest, create no outbox record and do not extend the stored watch expiry. Original reviewed/acked status change still produces exactly one event; unreviewed source withdrawal and reviewer rights loss remain unavailable. Other 17-case evidence is reused.

Local ignored raw logs: semantic-watch-before.log and semantic-watch-after.log. Docs, syntax and diff checks PASS; target/provider/device/enrollment remain UNRUN.

| Affected source | SHA256 |
| --- | --- |
| supabase/migrations/20261005030000_reminder_delivery.sql | deb196b483d196451b3bd28f6b5e905d347c012bb6cb8c189d889c8f539b6e10 |
| tests/integration/notifications/delivery-postgres.test.mjs | d12201ef08992dabea452a584c607979ceb8cfcf0b0efe1b2964387c7b63af00 |

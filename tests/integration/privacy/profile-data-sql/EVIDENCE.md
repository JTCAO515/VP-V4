# ProfileData SQL actual local evidence

Base: `bdb92b2b7dabf64b4d89fee1b657dcf06998dded`.
Sole Result source dependency: `92e338e19450061f4e048c92177256461825a596`, unchanged SQL from `06a2c4b9`.
Profile sole wire: initial Main-approved `7780cdc6`, strengthened same keys at `3b870971`; TS Unicode codepoint correction `e9bf72dc` changes no SQL contract.

Owned paths: `supabase/migrations/20261007020000_profile_data.sql` and this test directory only.
SQL SHA256: `4e12c0b4775995964382c52357a44c3cbe261f4042023326e833318c6fb8fdfe`.
No Result migration/WT, TS/shared catalog, Native, CI registry or target was written by this writer.

## PASS

`node tests/integration/privacy/profile-data-sql/run.mjs` replayed all real migrations in a new PostgreSQL17 container with no network, then fixed Result and Profile in their actual order. **24 PASS / 0 FAIL / 0 skip**, owned container cleanup PASS. Raw observed output: `ownproof/final-pg.txt`.

- Ordinary Web with no mobile enrollment: original guard, legacy save before floor, fresh v2 CAS and stale rejection.
- Initially absent Profile stays absent; first Native save marks only its actual pace. Invalid wire types fail closed.
- Seven original fields, original pace request/Undo, exact30s preview, source CAS, all-field clear, revoked consent, row/created_at retention, dual revisions/floors, saved-field mask.
- Original byte recovery, whitespace-sensitive digest reuse rejection, immutable decisions; owner progress20+5 pagination and own progress self-exit.
- Old native save/Undo and unversioned Web attempts during actual clear transaction fail with original/fenced errors. A concurrent fresh Web writer makes prior clear CAS stale.
- Fresh Native save, same-op replay and Undo; fresh v2 save remain legal after floor. Service/GUC raw restoration, lowered/deleted watermark, old ABA revision rejected; missing row read/list retains visible floor.
- Original Brief trigger increments shared revision, invalidates, deletes all affected previews and clears original operation bytes/receipt. Exact planned/actual effects are compared. Complete mixed scoped/recovery rows remain byte-equivalent and current source comparison becomes stale.
- Actual leased scoped work blocks clear; terminal mixed work/publication/config/accounting rows remain intact and stale. Terminal text dispatches are inventoried by turn, not only current lease.
- Actual opaque/expired Profile core export copy blocks. Real missing-handler metadata is not falsely called a Profile copy. No exporter or cross-domain cascade was added.
- Full confirmed Trip, snapshots, events, proposals, explicit Memory/receipts/consent, Auth/session/mobile rows remain identical. Actual financial scope rows in mixed-work preservation are included.
- 10,000 owner progress rows reject insertion and oversized listing, never partial eligibility; permanent fences cannot be privileged-cleaned while owner exists.
- Actual30s expiration before effects rolls back. A separately labelled **fixture timing hook** in the owned DB sleeps30.1s after the real mutations; the actual final clock rejects and rolls source/floor/receipt back. This hook is absent from the migration. Original terminal receipt recovers after TTL.
- Foreign selection, stale reauth, unknown Profile shape and inbound FK remain fail-closed.

The final full application catalog reconstructed without exactly three new private tables and two Profile columns/check equals original Result hash `6c2371cd4338f681af77de8fe888a4ae3692bd0abcf1736c14eaf0935314020d`.
Main reviewed and granted only the concrete append in `result-compatibility.candidate.sql`: original three infrastructure helpers unchanged, original complete application algorithm/namespace boundaries preserved; exact new hash `1b026808c513d02dbe168a5fd2698f624283075ba2ae8b8e265e7f4ce4381324`. `result-catalog-delta.json` records the complete specific delta. Private operation/proof JSON is constrained by the original immutable typed Result parser; watermark has no Result JSON/FK. Original fixed240 relation registry still scans all Profile fields.

Compatibility negative cases pass: unknown application table, managed inbound Profile FK, typed artifact column, application regclass/OID consumers, nested private artifact references rejected; arbitrary title text remains legal. Conversation, Profile and Result schema guards all true on the exact accepted shape. Profile also checks the exact full application hash plus qualified relation types/PK/FKs/trigger topology and original source-function hashes.

Direct gated fixture-bootstrap integration was separately observed **4 PASS / 0 skip** (`ownproof/direct-fixture.txt`), including full migration rollback and original function/ACL restoration. Actual default privacy RPC privileges are denied for authenticated/anon/service_role; local grant is fixture-only and revoked afterward.

The direct DB-suite mode is `VP_PROFILE_DATA_SQL=1 node --test tests/integration/privacy/profile-data-sql/profile.test.mjs tests/integration/privacy/profile-data-sql/result-compatibility.test.mjs`; each gated file creates and cleans its own disposable fixture when no owned container is provided. Default ungated discovery skips these actual DB files and is **not** counted as runtime PASS.

## Earlier observed FAIL retained

Initial fixture claims incorrectly cast SET to jsonb; corrected the test. Initial executor ambiguous `id` fixed with exact table alias. Core conflict array literal caused an actual PL/pgSQL error and was fixed with typed array append. Two Brief fixture failures were unqualified invalid operation JSON and missing ordinary actor on a stale-source read; corrected fixtures/claims without weakening original guards. Repeated core fixture nonce collided with original uniqueness; randomized nonce without changing the integrity constraint. Intermediate 8/14/22/23 passes are not substituted for the final24 source run.

## UNRUN / boundaries

Signed GoTrue/JWT Auth -> TS HTTP/decoder and Native consumer is the sole TS/integrator's next step using this fixed source. Main whole-source/formal final-head CI/protected merge remain separate. Target grants, deployment, provider/fees, production, real device and backup acceptance are UNRUN/unauthorized. SQL-claims fixtures are not signed Auth or a target observation. Full #239 and all-account deletion remain incomplete; `allUserDataCompleted=false` always.

Rollback verification: the full migration runs and rolls back before actual replay; original function definitions/ACL hash and original Result schema are identical afterward. Every failed operation uses PostgreSQL transactional rollback. No target migration history or permission was changed. New private proof must be removed at commit; decisions/floors retain their original permanent authority.


## PR670 CI fixture cleanup correction

Actual GitHub Actions job `112818357697` passed all19 Profile subcases, then the parent failed with `hookFailed / No such container: vpj58-profile-4779acb1`. The direct bootstrap registered container removal before a separate RPC revocation hook; Node ran the hooks in that registration order. The earlier external-container24 run and the no-grant direct compatibility4 did not exercise this ordering.

Only `fixture.mjs` and `profile.test.mjs` changed: one fixture lifecycle invokes the supplied RPC cleanup before its owned container removal. Revocation is followed by an actual authenticated EXECUTE=false assertion; removal still runs in finally even when revocation fails. A provided external container gets RPC cleanup without an ownership takeover. No NoSuchContainer error is swallowed and no SQL/runtime/allowlist/oracle is relaxed.

Direct standalone bootstrap was observed with the same real fixture/migrations: **20 PASS / 0 FAIL / 0 skip**; log order is `Fixture RPC revoke PASS` then `Owned fixture container cleanup PASS`, and the owned container is absent afterward. The attempted parent-plus-one selector expanded all children, so this is accurately recorded as one full Profile-file run, not a single-case result; no additional matrix was rerun. Raw receipt `ownproof/cleanup-fixed.txt`, original failure excerpt `ownproof/cleanup-ci-failure.txt`. Migration SHA remains `4e12c0b4775995964382c52357a44c3cbe261f4042023326e833318c6fb8fdfe`. Remote CI on the integrated new PR head remains unrun by this writer.

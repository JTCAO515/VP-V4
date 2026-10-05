# J3/J4 controlled publication SQL evidence

Runtime fixed at e76d18488bcb20994b539b85cc5e2a0900e93fec, migration20261005092000 (386 lines). Base c515848 normal fixed J1/J2 dependency merge ee211ecd; original dirty checkout untouched. Follow-up changes only improve own place/account fixtures and package evidence. No runtime delta after early fixed commit.

## Actual checks

| Evidence | Result | Scope |
| --- | --- | --- |
| pg-r5.log | PASS21, FAIL0, SKIP0 | Full migration history/transaction rollback, original public RPC exact body/owner/ACL; private grants and disabled/empty defaults; actual strict TS decoding/correlation; lawful reader TTL, independent rights/publisher, exact preview/recovery/session/epoch, SQLNULL/probe zero-effects, withdrawal/source/rights/reviewer invalidation, J2 restore non-rebinding, export/delete/capacity, deterministic in-flight withdrawal and J1 erasure, nullable disclosures and original place mapping |
| contract-final.log | PASS3, FAIL0, SKIP0 | New migration contract, no new role/grant/policy/Trip or knowledge writer, exact metadata references, complete retained data/sentinel/account hook |
| j1-regression.log | PASS11, FAIL0, SKIP0 | Existing unchanged J1 full PostgreSQL suite on complete history including J3/J4; canonical J1 decode actually enabled |
| j2-regression.log | PASS19, FAIL0, SKIP0 | Existing unchanged J2 full PostgreSQL suite on complete history including J3/J4; canonical J2 decode actually enabled |
| pg-place-original-producer.log | PASS1, FAIL0, SKIP0 | Improved only existing place test to original Save -> J1 submit/review -> J3 -> current qualified detail; lawful canonical projection, mapping loss/null, Trip frozen/zero Proposals |
| pg-account-cascade.log | PASS1, FAIL0, SKIP0 | New owned auth.users author/reader/rights cascades erase declarations/notes/qualification/links; minimal terminal metadata and old saved replay without body |
| docs-check.log | PASS | Existing documentation checker: 83-task plan/contracts/archive hash/dependency graph and documentation baseline |
| node --check / git diff --check | PASS | Both owned test files syntax; scoped whitespace check |

All PostgreSQL checks use isolated disposable Supabase PostgreSQL17.6.1.159 image sha25686a2e078779e5bdccda1f6f6c5063aa9779a322d1fface5fb408d051909b230f, network=none, Unix socket only, synthetic SQL auth claims. Bootstrap/create role and controlled qualification/reader/Save grants exist only inside these fixtures. All owned containers removed by test after hooks; no shared container killed or reused.

Publication canonical blob3253be9b07a34d069be402fd7380d525e4ffcde0 from sole TS e46f8f10, unchanged at1f0713b5. Actual TS `decodePublicationOutcome` and `matchesPublicationOutcome` ran for every successful publication outcome. No real GoTrue/JWT, browser/device/provider/target acceptance is claimed. Focused proof changes/additions reuse r5 unchanged runtime and do not represent a fresh full22 run.

## Reproduce

From this worktree, with canonical sole TS fixed sources available (or after normal integration into its tree):

```sh
VP_COMMUNITY_PUBLICATION_DB_TEST=1 VP_COMMUNITY_PUBLICATION_TS_WIRE_ROOT=/Users/jtsm5p/Documents/Codex/VP-V5-worktrees/vpj48-community-publication-server-20261006 node --experimental-strip-types --test tests/integration/community/publication-j3j4-postgres.test.mjs
node --test tests/contract/community/publication-j3j4-sql.test.mjs
VP_COMMUNITY_DB_TEST=1 VP_COMMUNITY_TS_WIRE_ROOT=/Users/jtsm5p/Documents/Codex/VP-V5-worktrees/vpj48-community-publication-sql-20261006 node --experimental-strip-types --test tests/integration/community/submission-j1-postgres.test.mjs
VP_COMMUNITY_SAFETY_DB_TEST=1 VP_COMMUNITY_SAFETY_TS_WIRE_ROOT=/Users/jtsm5p/Documents/Codex/VP-V5-worktrees/vpj48-community-publication-sql-20261006 node --experimental-strip-types --test tests/integration/community/safety-j2-postgres.test.mjs
```

Focused logs used `--test-name-pattern='canonical place projection'` and `--test-name-pattern='owned auth account cascades'` respectively with the same publication environment. The new tests gate on VP_COMMUNITY_PUBLICATION_DB_TEST and require the real canonical contract when enabled; no substitute decoder.

## Preserved failures and limits

pg-r1: 8PASS/7FAIL, SQL list alias c colliding with row variable. pg-r2:14PASS/1FAIL, erased saved-reference exact recovery was incorrectly denied. Runtime fixes preceded r3:15PASS, r4:19PASS and final r5:21PASS. Original failed assertions were kept; no acceptance relaxation. j1-wrong-flag-unrun records initial incorrect enable variable and11 skips; corrected actual j1-regression is11PASS0skip. This skipped run is not validation evidence.

Rollback: transaction rollback was actually tested before applying the new migration. Operational disable `community_publication_private.settings.enabled=false` denies display/publication and leaves owner export/delete/metadata/recovery available; never delete terminal fences to roll back. No new target configuration, public/grant/admin credential/role/Storage/provider/Production/phone or all-account enrollment operation was executed.

Sole TS owns registry, actual GoTrue HTTP, consumers and ONE PR. Main owns independent combined J3/J4 review and parent scope decision. Unified account dispatcher remains NOT_ENROLLED; complete scoped handler and owned account-hook fixture do not establish all-account or actual environment acceptance.

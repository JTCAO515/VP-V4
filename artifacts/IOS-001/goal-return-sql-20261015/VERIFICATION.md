# IOS-001 / #203 current QA goal-return SQL

Base `22559396eec5cd47d3a4d3d2a2bd5e49d52c6c7c`. Own branch `codex/ios001-goal-return-sql-20261015`; exact writer is V10 chat `01a13d76-2e7e-7db3-968e-d151f3b44b3d`. Main reviewed the exact two-function delta before this isolated replay. Historical V5 source remains unchanged.

## Product change

New append `20261015024450_ios001_goal_return_current.sql` preserves every original executable byte from SHA256 `15fd14818a09a1e0418aaf31deb639b7e6b9f269c51b3782410d536564e8596b`; only obsolete review-only comments changed. Candidate SHA256 `f4bcc8d953e4b6e27c3a582d84dc4d741c0acdcb8e5689598556c5b2ffb18c0f`. It adds the qualified private reader and authenticated-only public wrapper. No old function, schema, ACL, retained row, wire or source-authority copy changes. Current same-owner goal/version/parent/input must qualify; newest unusable decision denies without historical fallback, nextStep remains unknown. This read path takes existing row locks; it writes no product data.

Both functions remain postgres-owned SECURITY DEFINER with empty search_path. Ordinary authenticated has public EXECUTE only; private helper and anon/service_role access remain denied. Mobile identity/epoch, full64/65 membership, publication event ordering and original result qualification are preserved.

## Actual verification

Self-owned PG17.11, mode0700 data/socket, listen_addresses empty, synthetic SQL Auth tables/roles and claims. Actual 155 historical migrations through current QA `20261013050429_qa_agent_web.sql` followed by the new append replayed. `replay.json` records each source hash. All1101 old functions retain definition/prosrc/owner/config/ACL and other captured metadata, all265 tables retain columns/constraints/triggers/owner/ACL/RLS. Transactional install rollback and removal of only the two readers preserve old catalog/guards. No existing pin is rewritten or dynamically adopted.

Five guards (profile/conversation/result/turn schema and turn runtime) are all TRUE before and after. Exact negative probes: unknown Turn runtime function returns `t|t|t|t|f`; unknown service_tasks column returns `f|f|f|f|t`; altered pinned original schema-function source returns `t|t|t|t|f`. These prove these named guard scopes, not arbitrary whole-database drift rejection. Every rollback restores all TRUE and identical old catalogs/tables.

Behavior: 24 PASS, 1 UNRUN in proof.json; 11 lifecycle PASS; 6 concurrency PASS. Covers original chosen positive, other actor, foreign membership/event, scope fields/epoch, actual current-input correction, newest pending/no fallback, 64/65, Trip/Memory/consent/deletion/unlink, missing publication head without disabling triggers, late locks, publisher/choice/withdraw ordering and real outer SQL cancellation. The separate destructive deletion of an original event was blocked by ASSISTANT_EVENT_ERASE_AUTHORITY and remains UNRUN; guards were never bypassed. Function-local statement_timeout is not proof of an outer RPC timer.

`git diff --check`, all six JS syntax checks, and `node scripts/docs-check.mjs` PASS. No unrelated build/provider matrix was rerun. Test assertions reuse original E3 behavior with transport adaptation and added current QA catalog/scope negatives.

## CI and reproduction

Main owns `scripts/ci-suites/db-integration.mjs`. Register `tests/integration/journey-entry/goal-return-current/current.test.mjs` in its existing postgres isolated lane with `VP_TURN_DB_TEST=1`. This node:test entry starts a new labeled network-none PostgreSQL17.6.1.159 container using the repository's existing pinned image, replays history and append, runs catalog/proof/lifecycle/concurrency, and removes only its own container. It accepts no external DB URL. The local authorized kernel uses `/opt/homebrew/opt/postgresql@17/bin` PG17.11 and psql; no dependency, lockfile, global service or client package changed. Main's pg8.13.1 was available but not required by the psql transport.

Local commands: `node tests/integration/journey-entry/goal-return-current/kernel.mjs prepare`, then `kernel.mjs replay`, `catalog.mjs`, `proof.mjs`, `lifecycle.mjs`, `concurrency.mjs`, finally `kernel.mjs stop`, each relative to this test directory. Prepare refuses an active previous owned fixture. Kernel validates private root/data/socket modes, owner manifest and actual postmaster data directory before commands. Source evidence hashes accompany compact proof files; raw large catalogs remain local ignored evidence, not committed.

## Preserved failures and limits

Initial long socket path/relative libpq hostname preflight FAIL was fixed by safely stopping and moving the same owned cluster to Main-approved private short root. A manifest whitespace comparison failed before queries and was corrected to structural equality. First replay hit macOS E2BIG while sending large SQL as process arguments; stdin transport and a fresh synthetic database fixed it. A second bootstrap encountered the same cluster's existing synthetic roles; exact role metadata check reuses those roles without granting privileges. All related failure logs remain local evidence; replay-r1-fail.log, replay-r2.log and preflight-r1-fail.json retain the material failures. Initial foreign-event probe had no other synthetic actor and was UNRUN; corrected probe with explicit outsider PASS, first log retained locally.

Final own cluster STOP PASS recorded in cleanup.json; private data retained, no foreign resources touched. No alias was created and no second cluster was started.

Docker CI/target17.6 execution, true GoTrue/JWT/PostgREST, provider, Native UI/device/VoiceOver and production are UNRUN in this owner evidence. Main handles exact-head review, CI registration and protected QA integration. This slice does not close #203 and does not authorize shared/real DB installation.

# Intake planning HTTP v2 / combined backend checkpoint

2026-10-03. Base main a9e02f3a196b8c299f79e680ace7cdac0f26c5c2, including merged #624. HTTP own frozen commit: 0937219864550c063ba09c4f58a918b8c3cf5f78. Main authorized a local combined checkpoint with result-owner frozen 295d4c2fdad2b502e9c63d6a0fd2fd1c77f33986; its five exclusive commits are cherry-picked unchanged. No PR/push/release from this worktree.

## Changes and ownership

- New POST `/api/chat/native/v5/planning/intake-tasks`, closed 19-key input → single 20-parameter ordinary v2 RPC.
- Absent test gate closes before auth/RPC; parsed owned loopback DB/API and exact path/port, random project checked by runner. NextRequest normalizes127.0.0.1 to localhost; only existing two loopback hosts are equivalent.
- Exact minimal receipt, both false execution flags. Initial/final session, before/after policy, after-RPC qualified current source. Later source/stale/unrecorded gives same receipt current=false without either digest; blocked403/malformed503. No admission retry.
- Shared registry: only approved HTTP tail step and isolated-postgres qualified test file. No old steps/gates/images touched.
- SQL03020000 and03030000 are unchanged frozen upstream files; no native/worker/publisher/config edit. Result functions remain private/non-executable by API roles; no consumer activation.

## Actual checks

| Check | Result | Command / evidence |
| --- | --- | --- |
| HTTP adversarial + result contracts | PASS38/38,0skip | `node --experimental-strip-types --test tests/contract/artifacts/qualified-intake-comparison.test.ts tests/security/turn/native-planning-intake-http.test.mjs`, contract.log.gz |
| Qualified result PostgreSQL | PASS4/4,0skip | `VP_TURN_DB_TEST=1 node --experimental-strip-types --test tests/integration/turn/qualified-intake-comparison.test.mjs`, pg.log.gz |
| Actual Auth→HTTP→SQL | PASS1/1,0skip | `node tests/integration/turn/run-planning-intake-http.mjs`, http.log.gz |
| Build/type/source lint/docs | PASS | `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm docs:check`; separate logs |
| Registry JS / staged diff | PASS | `node --check scripts/ci-suites/db-integration.mjs`, `git diff --cached --check` |

HTTP runner used vp-native-ask-9fd3d9cd, API64751/DB64741, all actual checkout migrations. Owned cleanup PASS. PG container vpj79-qualified-05121763 was isolated with network none and removed by its fixture. No provider calls, cost attempts or Trip writes in HTTP chain. Auth credentials are neither logged nor committed. Dev-generated AGENTS/next-env edits and dependency symlink are removed before final freeze.

Earlier test-only failure: attempted reaccept of terminal withdrawn planning consent returned403. Test corrected to preserve terminal withdrawal and use an independent ordinary actor for text withdrawal. No consent semantics changed. An attempted eslint invocation was unavailable because this repository uses its own source-policy lint; actual `pnpm lint` passed.

## Limits

UNRUN: formal combined CI, deployed route availability, Staging/Production, real provider/publisher/result execution, native UI, device/VoiceOver/user acceptance and full parent acceptance. Main reviews and integrates the checkpoint. #559/#561 and other parent Issues remain open; fixture and accepted/queued receipts grant no execution authority.

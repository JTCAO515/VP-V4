# Dedicated PostgreSQL17 subject lane

CI source571bc35f; Main's exact doc75d919e4 cherry-picked as5726f483; accepted QA3f9b51d0 normally merged as1e42c21c. No reset or file overwrite. The E3 goal-return-current registration remains in the original postgres lane alongside the new independent subject registration.

The five Main-leased CI files are stable and stopped; future write ownership has been returned to Main for queued cancellation integration. Product source/SQL leases and this chat/worktree remain retained. Further CI fixes require exact coordination with that current writer.

## Implementation

- New postgres-native-17 logical lane runs only tests/integration/knowledge/agent-grounded-subject/subject-binding-postgres.test.mjs, explicit AGENT005_NATIVE_PG=1, concurrency1 and existing VP_WIKI binary/module variables. PG16 is rejected before test execution; missing configuration and skip/todo/cancel/failure still fail.
- DB_LANES, source/consumer/contract-test selection and unique integration classification include the new lane. Unknown/manual/SQL/CI-policy paths retain the full six-lane superset. The dynamic matrix and stable required aggregate still require every selected job to succeed.
- Original Wiki native lane definition, setup shell bytes, version/client variables, task and matrix partition are unchanged. ci-final-proof.json records before/after setup SHA equality and unchanged aggregate bytes; all old logical jobs remain.
- Only the new Ubuntu24.04 job checks for an already usable exact major17 installation. Otherwise it uses an already configured official PGDG source or the official public signing key and a temporary noble-pgdg source, installing only the versioned postgresql-17 package. No local Mac installation or global service action occurred.
- Temporary policy-rc.d exit101 plus create_main_cluster=false/start_conf manual prevent unnecessary package-driven default cluster/service starts. Original CI files are backed up before mutation and restored on success/failure, including the temporary source/key. apt keeps the temporary conf during package installation; needrestart lists rather than restarts. The actual fixture creates only its own0700 data/socket with listen_addresses empty.

## Actual validation

- Governance29/29 PASS, 0skip: all integration files classified, unique new ownership, old lane and matrix retained, selector fail-closed, required aggregate behavior, major16 preflight rejection, and controlled shell-flow success/existing official source/failed install/wrong-major restoration cases.
- Ruby YAML parse and Bash syntax PASS. Controlled mocks execute only rewritten paths inside test-owned temp directories with mock sudo/curl/apt/npm; these are not Linux apt or service acceptance. The first new mock's missing writeFileSync import FAIL is preserved and fixed.
- Actual registered driver on local nativePG17.11 after the new QA merge: postgres-native-17 / grounded-subject-native-17 PASS16/16, 0skip/todo/cancel/fail. The baseline now includes156 accepted QA migrations plus this append;265 tables, two prosrc-only changes, nine guards TRUE and role/catalog/rollback invariants remain verified.
- Combined typecheck/docs/diff PASS. The unchanged TS73 producer evidence remains reusable. Default contract discovery previously58/58,0skip and no PG gated file remains there.

Linux package installation, actual GitHub CI, targetPG17.6/Supabase/GoTrue/provider/Native-Web/device/deployment are UNRUN. The local PG16.15 baseline failure and every earlier real failure remain retained; no guard, role grant, timeout, threshold or skip policy was weakened. #206 remains OPEN and generic canonical Ask admission is still outside this bounded resolved-turn delivery.

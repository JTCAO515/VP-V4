# Bounded task context — local integration evidence

Scope: #195, S2, native v3 API plus a mode-bound job/2 worker. This allows a short
clarification to receive its original same-task question and answer. Four Turns
maximum; new immutable policy and consent; old v1/v2 and job/1 remain compatible.
No provider, recipient, consent, budget or remote environment is activated by this PR.

## Verified locally

- `VP_TURN_DB_TEST=1 node --test tests/integration/turn/text-work.test.mjs`: PASS26/26, zero skips. Full existing migrations and new migration38 apply in a disposable network-none PostgreSQL container. Tests cover legacy compatibility, cost sharing, cross-owner isolation, mode-separated claimers, complete ancestry, four-Turn admission/replay, deleted intermediate ancestor, withdrawn consent and stale context digest.
- Added an explicit migration38 transaction rollback check, then ran `VP_TURN_DB_TEST=1 node --test --test-name-pattern='task history' tests/integration/turn/text-work.test.mjs`: PASS2/2, zero skips, including setup rollback checks. Old policy/input/work persist and new column/RPC disappear after rollback. No implementation change occurred between these runs.
- `node tests/integration/turn/run-native-http.mjs`: PASS1/1, zero skips. Actual disposable GoTrue, ordinary native JWT login, Next HTTP, PostgreSQL and job/2 worker. Old consent denies v3; distinct consent enables it; goal clarification plus `North.` sends exactly system + original user + prior answer + current user. Two attempts settle under one task. Opposite-owner history is empty, withdrawal hides it and old v2 replay still works. Provider destination is a closed local synthetic HTTP fixture; this is not Qwen semantic evidence. Owned disposable stack was removed.
- `node --test tests/contract/model-gateway/provider-protocol/*.ts tests/security/model-gateway/provider-protocol/*.ts tests/security/turn/task-context.test.mjs tests/security/turn/scoped-text-worker.test.mjs tests/security/turn/staging-text-job.test.mjs`: PASS49/49, zero skips. Includes malformed/extra roles, maximum escaped serialized context, public C2 denial, final authorization denial, job/1 compatibility and job/2 claim/prompt journal.
- Typecheck, source-policy lint, `pnpm build` and docs/diff checks: PASS. Build includes all three v3 routes; no visible Web UI was changed, so separate local UI QA is not applicable. Required CI remains to run on the PR.
- Independent permission/data/shared-contract review: Critical0/Important0, reviewed core collection SHA256 `99818865b9731d7a897fec61a5c3faa8ad9890685289624d3622f41ea71bdf65`.

Initial SQL test setup failed because it inserted the new context column before
applying migration38. The fixture now includes the column only for context-mode
rows and preserves the original upgrade case. The first failure was in setup,
not a false passing migration. Logs retained locally; subsequent real DB runs above passed.

## Unrun and rollback

Staging migration38, a new target notice/consent, actual provider short-clarification
understanding and native SwiftUI v3 UI are UNRUN. Earlier courtesy/live-channel
semantic regressions remain FAIL. #195 and full S1/S2 remain open; #194's previously
completed cost integration evidence is separate.

Disable v3/context worker for rollback; retain applied schema, all policy/consent
history, hidden content, task links and budget pins. Never route context tasks to
legacy workers or replay them as a new task/budget. The original checkout and
physical phone were not touched. No production change or user charge occurred.

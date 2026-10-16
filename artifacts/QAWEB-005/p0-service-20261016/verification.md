# P0 server: 503 stage discrimination and original worker dependencies

Source base: `5e960e6d4dd4b1050b23622a4dc6ed57653f4b57`.
Owner branch: `codex/p0-qaw-service-20261016`.

## Delivered finding

First source write is `tests/security/qa-agent-service/unavailable-stage.test.mjs`.
It executes the actual `qaAgentHTTP` and Supabase SSR SDK with synthetic signed
credentials and intercepted HTTP. It is diagnostic verification, not a product
activation or a production-code fix. No production defect has been reproduced
that justifies relaxing the existing config, identity or policy gates.

Three tests PASS: eight distinct config failures each yield the same
`503 PROVIDER_UNAVAILABLE/not_submitted` for both sessions and policy with zero
network; valid config without a cookie yields 401 with zero database calls;
valid synthetic identity plus missing QA RPC (`PGRST202/404`) yields the same
public 503 after the original protected call. No extra public diagnostic fields
or environment values are exposed.

Main's supplied observation is anonymous GET `/qa` 200 and GET sessions/policy
503. If that deployment runs this source, missing QA RPC alone cannot explain
those anonymous responses: this source returns 401 before RPC without a cookie.
Check the deployed SHA and configuration predicates first. Deployed SHA and
target env remain UNKNOWN; there is no proven individual bad env value.
The DB absence is a separate blocker for the authenticated path, not proof of
the cause of the first anonymous response.

Main's fresh read-only DB result (healthy original Go2China target, migration
count 75 and listed QA functions absent) is reused as supplied, not re-queried.
Important source distinction: `qa_session_history_v1` is a context-mode value,
not a public RPC called by this service; `qa_task_history_v1` is not called by
this service or its QA context consumer either. Do not create either function
merely because its name was absent from an inventory.

## Browser configuration and persistent ports

`lib/server/qa-agent/config.ts` requires `VISEPANDA_QA_AGENT=true`, a UUID
`VISEPANDA_QA_AGENT_POLICY_ID`, exact `VISEPANDA_QA_AGENT_ORIGIN`, a nonempty
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and matching `NEXT_PUBLIC_SUPABASE_URL`.
For the QA preview: `VERCEL_ENV=preview`, origin/incoming in the explicit QA
domain or finite Vercel system-host set, and
`VISEPANDA_QA_SUPABASE_PROJECT_REF=dzqdzetcctkhbrhlxxgn` with URL exactly
`https://dzqdzetcctkhbrhlxxgn.supabase.co`.
P0 same-Session mode must explicitly be `VISEPANDA_QA_AGENT_CONTEXT_MODE=qa_session_history_v1`;
omission defaults to historical `current_input_v1`, which is not proof of P0 multi-turn.
All actions still pass the existing browser Origin/Cookie boundary and original
actor authentication. No target configuration is edited here.

| Stage | Actual source dependency |
| --- | --- |
| List/create | Original authenticated `chat_threads` operations; QA list additionally `qa_list_sessions_v1` |
| Policy/consent | `qa_read_policy_v1`, `qa_accept_policy_v1`; original text policy/consent authority |
| Session recovery | Original authenticated thread/turn reads, `qa_read_session_v1`, protected `read_text_turn`; original request IDs |
| Submit | `qa_submit_message_v1`, original Task/Turn admission and budget/identity fences |
| Hosted bootstrap | `read_hosted_worker_status` must report `{kind:status,enabled:false}` before file-mode start |
| Hosted discovery | `hosted_worker_heartbeat`, `qa_ready_groups_v2` with original model, tariff version and endpoint |
| QA execution | `qa_claim_work_v1`, `qa_read_work_v1`, `qa_authorize_dispatch_v1`, `qa_complete_work_v1`, `reserve_model_budget`, `finish_model_budget` |

QA public functions are authored in
`supabase/migrations/20261013050429_qa_agent_web.sql`, consuming earlier original
identity, chat, turn/text, ServiceTask, budget, hosted worker and lifecycle schema.
Presence of that file is not proof of target installation or compatibility.
Main owns the complete source migration diff, prerequisites, grants/RLS and
any target decision; this report is not a SQL apply list. No SQL was applied.

## Minimum original hosted entry (not executed)

The entry remains `lib/server/jobs/run-hosted-text-worker.mjs`, a dedicated Linux
worker/container, never a Vercel route. `/4` profile is required; `/3` is historical
parse/audit compatibility and cannot run QA work. No second daemon or queue.

Closed profile keys: `schemaVersion=vpj07-hosted-text-worker/4`, the approved
`projectRef`, `pollIntervalMs` (1000–60000), `maxLifetimeMs` (60000–86400000),
`drainMs` (0–60000), `concurrency` (1–8), `groupLimit` (1–50),
`modes=[qa_session_history_v1]`, `planning=null`, and `qwen` with exactly
`priceVersion`, `pricing`, `reservedMicros`, `maxOutputTokens`, `timeoutMs`,
`configurationId`, `configurationVersion`. Use the existing reviewed immutable
configuration and real tariff; test fixture prices/IDs are not deployment inputs.
Reservation must cover the existing conservative maximum-input calculation.

The independently supplied target env must match the profile. Endpoint
`VISEPANDA_QWEN_ENDPOINT` must match the original authorized endpoint, protected
policy, discovery and provider configuration. If absent, source uses its legacy
endpoint; this is not permission to change a workspace binding. Exactly one
matching original budget scope must be discovered for each owner/policy group.
Current original consent, policy, switch, lease, identity and lifecycle gates
still apply, with `createQaContextInvoker()` and durable usage journal supplied
by the existing hosted root.

Required env: `VISEPANDA_HOSTED_TEXT_WORKER=true`,
`VISEPANDA_HOSTED_WORKER_SECRET_MODE=files`,
`VISEPANDA_HOSTED_WORKER_PROFILE` containing the reviewed closed JSON,
`VISEPANDA_QA_SUPABASE_PROJECT_REF` as above,
`VISEPANDA_HOSTED_WORKER_JOURNAL_DIR` an existing absolute private directory.
`VERCEL_ENV` and env DB/Qwen key fallbacks must be absent. Leave planning,
scoped-edit and Trip ServiceTask opt-ins unset. Optional BUILD must be 1–64
characters from `[A-Za-z0-9._-]`; health port if supplied must be 1–65535 and free,
with an allowed bind host. Its healthz indicates heartbeat liveness, not answers.

Existing secure mounts only: Linux tmpfs `/run/vp-worker-secrets` mode 0700,
`db.key` and `qwen.key` mode 0400, same process uid/gid, regular single-link files,
1–4096 printable nonspace ASCII bytes, distinct credentials. Keys never go into
the profile, shell command, source, env or report. This task neither reads keys
nor provisions/mounts them. Journal creates a fresh exclusive 0600 JSONL file;
retain pending/unknown holds and receipts across failure.

With those reviewed inputs already installed by the authorized operator, the
original entry command, from repo root, is:

```sh
node --experimental-strip-types lib/server/jobs/run-hosted-text-worker.mjs
```

That command is documented only, NOT run here. It can heartbeat/write journals
and later dispatch paid work if enabled. Disabled-first startup remains required;
this report grants no switch enable, ECS install/pull/start or provider call.

## Exact writer boundary and verification

Main retains QA4 discovery/composition in
`lib/server/jobs/hosted-text-worker.ts` (the `/4` target/discovery/workerFor seams),
`lib/server/jobs/run-hosted-text-worker.mjs` (entry/profile/files/target wiring),
and `lib/server/jobs/hosted-usage-audit.ts` (shared audit composition), plus all
shared schema/CI/config/target env writes. These files are read-only in this
delivery; no old hosted-worker hunk is reacquired. Context consumer belongs to
its original owner. Old cancellation work remains stopped.

Own writes are the new dedicated QA service test and this artifact only.
Dependencies reuse the original service WT node_modules via an untracked symlink;
no package or lockfile change. Run:

```sh
node --experimental-strip-types --test tests/security/qa-agent-service/unavailable-stage.test.mjs
```

Affected regression command also PASS, 12 tests, zero skipped/failed:

```sh
node --experimental-strip-types --test tests/security/qa-agent-service/unavailable-stage.test.mjs tests/security/qa-agent-service/independent-http.test.mjs tests/security/qa-agent-service/http.test.mjs tests/security/qa-agent-service/hosted-profile.test.mjs tests/security/qa-agent-service/worker.test.mjs
```

Real GoTrue login, target authenticated session persistence/reopen, provider
answer, worker startup, target SQL compatibility and real multi-turn acceptance:
UNRUN. Main-owned target/env/schema/worker actions remain necessary; a local
test PASS, file inventory, `/qa` 200 or migration count does not close P0.

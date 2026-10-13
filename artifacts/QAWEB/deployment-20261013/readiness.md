# QAWEB deployment readiness

Scope: exact existing vp-v4 project/team, QA preview branch only. Main integration source remains at daa7bae44a660381fb3295d0d2afc327ea98d3ba; not ready P0. No source deployment or provider call performed.

## Vercel slots

| Slot | Actual status | Next input |
| --- | --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | Generic preview value verified against fixed QA Staging URL | PASS, no override required |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Generic preview public/anon key kind verified | PASS, value never printed or persisted |
| VISEPANDA_QA_AGENT_ORIGIN | Created and read back only on codex/qaw005-main-20261013, preview, plain Config | Fixed authorized QA hostname |
| VISEPANDA_QA_AGENT | Absent, so QA disabled | Enable true only with reviewed source and valid new policy/worker chain |
| VISEPANDA_QA_AGENT_POLICY_ID | Absent | Main's new bounded QA policy; old policy is not reusable authorization |
| VISEPANDA_QA_AGENT_CONTEXT_MODE | Absent | Exact mode supported by final QA producer and worker/profile |

The origin mutation used MCP first; same explicit target returned 404. Documented official CLI POST /v10/projects/{id}/env with the same team and request body succeeded; project getter independently confirms key/type/target/branch. No upsert or other environment mutation. Domain and DNS were not changed again.

## Independent hosted-worker slots

Source evidence: lib/server/jobs/run-hosted-text-worker.mjs, hosted-worker-secrets.mjs and hosted-text-worker.ts at the baseline above. These are source requirements, not live-host observations.

- Host: existing dedicated authorized worker target, exact image/source SHA and owner needed. Entrypoint rejects any VERCEL_ENV; it cannot run in a Vercel Function.
- Explicit VISEPANDA_HOSTED_TEXT_WORKER=true and a closed VISEPANDA_HOSTED_WORKER_PROFILE. Profile requires modes, bounded poll/lifetime/drain/concurrency/group limit; qwen configurationId/configurationVersion, priceVersion, pricing, reservedMicros, maxOutputTokens and timeoutMs. No invented IDs/prices/profile.
- File secret mode: VISEPANDA_HOSTED_WORKER_SECRET_MODE=files; existing secure slots /run/vp-worker-secrets/db.key and qwen.key. Requires Linux tmpfs, private ownership/modes, and initial SQL disabled readback. This report does not create/read/rebind keys or start a host.
- Legacy env mode exists for VISEPANDA_HOSTED_WORKER_DB_KEY and VISEPANDA_HOSTED_WORKER_QWEN_KEY, but cannot be substituted for an approved file-secret deployment. No production secret goes into Vercel.
- VISEPANDA_QWEN_ENDPOINT must match the actual permitted policy/provider region. Existing endpoint presence is not provider entitlement.
- VISEPANDA_HOSTED_WORKER_JOURNAL_DIR must be an absolute private durable path. Build metadata and health settings must match deployed image/runtime.
- SQL must expose current consent, a valid QA policy and exactly one eligible matching owner budget scope/provider model/price version. Existing worker dispatch, stop switch, lease, usage and settlement boundaries remain.
- Baseline modes are current_input_v1, task_history_v1 and knowledge_intent_v1. Main reports old task_history semantics insufficient for new P0 next-turn; new producer/policy and its final worker compatibility are a dependency.

No worker target profile, secure slot presence, current price/budget/consent, region qualification, SQL switch or heartbeat was live-verified by this writer. Historic 2026-09-25 runbook observations are not treated as current host evidence. Main coordinates the actual holder before target worker changes.

## Validation

PASS: exact branch-origin readback, previous domain/DNS readback, script syntax, baseline pin rejection, docs check and diff check. UNRUN: reviewed P0 source deployment, target HTTPS/login/persistence and real provider/multi-turn cases. The live DNS is configured; the earlier local TLS probe failed and remains diagnostic evidence only.

2026-10-13 follow-up: project getter keeps encrypted public values opaque; exact GET /v1/projects/{project}/env/{id} for only the two effective preview PUBLIC fields verified the fixed Staging URL and public/anon key kind in memory. Only booleans were emitted; no production variable was fetched. QA Origin branch match also PASS. In-app browser target probe returned net::ERR_CONNECTION_CLOSED before any QA deployment; this does not establish application behavior.

## HTTPS convergence

Official Vercel MCP list_certs returned QA certificate cert_SYmDaxFvmKmaCXiJ1ssfGOIv for qatesting.go2china.space, createdAt=1791866705993, expiresAt=1799639194000, autoRenew=true. A fresh in-app browser subsequently opened the HTTPS domain and rendered Vercel 404 DEPLOYMENT_NOT_FOUND, request ID sin1::b8ksz-1791867172120-57a18c8b35c7. DNS/TLS prerequisites now PASS. Earlier TLS/connection failures remain historical diagnostics; no application/login/provider success is inferred. No domain/DNS mutation or TLS bypass was used.

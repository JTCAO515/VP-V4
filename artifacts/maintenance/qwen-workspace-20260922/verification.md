# Qwen workspace endpoint migration verification

2026-09-22; Related to #492. Implementation based on `origin/main` 7a05827 in isolated
`codex/qwen-workspace-endpoint-20260922`. No production, schema, policy or consent mutation.

## Observed account and provider

After JT completed QR login, the actual Bailian business-space table showed one default Beijing
workspace: `ws-obkc0qqp3gynaeiu`, with API Host
`ws-obkc0qqp3gynaeiu.cn-beijing.maas.aliyuncs.com`. No workspace/key was created or rotated.

Existing secure local Qwen credential was injected into subprocess environment only. Actual requests
used the modified transport and pinned `qwen3.7-plus-2026-05-26`, not a raw alternate client.

| Probe | Result | Actual calls | Tokens | Elapsed |
| --- | --- | --- | --- | --- |
| ordinary synthetic connectivity | protocol_validated | 1 | 25 | 9877 ms |
| runWikiGenerationJob, imaginary museum source | succeeded | 1 | 435 | 2183 ms |
| runWikiSearchJob, synthetic corpus | answered | 2 | 1465 | 4064 ms |

Total: 4 provider requests, 1925 tokens. Currency cost remains unknown, not zero. No database
calls in these probes. The search corpus and museum are synthetic; this is real provider/job
integration, not real published knowledge, user acceptance or deployed Web/native evidence.
No raw model text, reasoning, key or error body is retained in this report.

Provider invocation IDs:
- `d7ad2524-667e-4c45-a0a4-0295005f0ff1`
- `e736be05-e28c-4c8e-99bc-fcfc6c16e279`
- `3c7caa8c-5d5b-487b-82cb-45b609001505`
- `69e99b5f-b87e-425b-b698-3d24320313ca`

Each had configured → attempted → response_buffered receipts at the exact dedicated endpoint.
Closed raw metadata receipts are retained in the local research directory; the CLI connectivity
probe is repeatable through `scripts/providers/qwen-endpoint-probe.mjs --probe` with explicit env.

## Cloud configuration and policy observations

Vercel project `prj_XwsjEc8YnYNeDVAqBrcdmbJXEqA2`, team `team_vLT8SL2mQJJSnXbD9GzVLP4K`:
added `VISEPANDA_QWEN_ENDPOINT` as Config for **Development and Preview only**, then verified
exact value and target readback. No Production variable was changed. Existing deployments keep
their immutable environment; new code plus a new deployment is required to consume this setting.

Read-only Staging query against `dzqdzetcctkhbrhlxxgn` found seven Qwen text policies, all inactive
(expired/revoked); latest expired on 2026-09-19 at 14:16:38 UTC. No historical policy/notice,
consent or task was rewritten. AI-assist env keys were scoped only to the historical Preview branch
`codex/vpj-75-76-staging-acceptance-20260919`, not globally enabled by this migration.

Connector project listing returned empty and its get_project contract mismatched; authenticated
Vercel CLI readback succeeded. The connector result was not treated as proof of missing projects.

## Checks and review

- PASS: lint, typecheck, production build, docs check, diff check; default tests 22/22.
- PASS: affected first contract/security group 90/90.
- PASS: complete contract suite 124 files, 592 tests, zero skips using test concurrency 2.
- Initial default-concurrency contract run: 591/592; an unrelated Ops request test with a 25 ms
  lifetime returned 503 while the production build was running. First isolated retry still hit
  timeouts under load; after build completion the same unchanged file passed 13/13. Full suite
  subsequently passed without changing code, assertions or timeout thresholds.
- Security suite: 150 passed, zero failed, one SKIP because no explicit disposable identity
  Supabase target was configured. This is incomplete DB/RLS evidence, not full security acceptance.
- Independent read-only migration/security review: one P2 reporting defect fixed (eval outputs now
  record exact endpoint/configuration identity); focused follow-up confirmed no unresolved findings.

## Remaining scope

CI/Preview status is reported on the PR after dispatch. Deployed Web/native authenticated flows,
new text-policy consent/worker persistence, physical iPhone and Production activation are UNRUN.
Current expired Staging policies must not be revived just to make tests green. Historical acceptance
scripts remain snapshots with old IDs/hosts; use the current worker/service CLI and a new valid
policy for the next authorized end-to-end run. Explicit rollback and forward steps are in
[the runbook](../../../docs/runbooks/qwen-workspace-endpoint.md).

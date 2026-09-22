# Qwen workspace endpoint migration

Maintenance [#492](https://github.com/JTCAO515/VP-V4/issues/492). The shared DashScope endpoint
enters maintenance on 2026-09-30; Alibaba says existing service continues. This is a host change,
not a model, API dialect or region migration. [Official migration steps](https://help.aliyun.com/zh/model-studio/regions/).

## Configuration and trust boundary

Copy **API Host** from the existing Beijing workspace in Bailian. Verify the existing API key
belongs to that workspace and can invoke the pinned model. No key rotation is required merely
because the host changes. Do not paste keys into issues, chat, CLI arguments or receipts.

Set the following **server-only** variable separately for each selected deployment and worker:

```dotenv
# Replace the placeholder with the actual console API Host; do not deploy this example.
VISEPANDA_QWEN_ENDPOINT=https://<workspace-id>.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions
```

This is a complete Chat Completions URL, not a base URL. The new shared resolver is
`lib/server/model-gateway/adapters/provider-endpoints.ts`. It accepts only canonical HTTPS Beijing
workspace URLs or the exact legacy URL. No trial host, other region, credentials, query, fragment,
port override, whitespace or redirect is accepted. Only the exact **selected** workspace is
allowed; matching the Alibaba suffix alone cannot authorize another workspace. Job JSON never
supplies its own allowlist. The transport still does not read env, keys or files itself.

- Web and native server routes share `groundedAiAssistProviderConfig`. Their existing key stays
  in `VISEPANDA_GROUNDED_AI_ASSIST_API_KEY`; create a fresh configuration ID or increment
  `VISEPANDA_GROUNDED_AI_ASSIST_CONFIG_VERSION` when changing destination. The version defaults
  to 1 for old deployments. Existing enable flags and authenticated actor checks remain required.
- One-shot and service worker CLIs read the same endpoint variable independently of job JSON.
  Update `provider.endpoint` and configuration identity/version in the selected job file; that
  file's digest continues to identify exactly what ran. Worker keys keep their current env names.
- Wiki generation, proposals and search accept the operator-selected endpoint through their
  trusted `qwenEndpoint` dependency. CLI/route callers must pass that value, independently of
  untrusted input. The two Qwen-specific real-model eval entrypoints do this from process env.
- Missing env preserves the legacy deployment binding during rollout. Explicit malformed/empty
  env fails closed. Setting a workspace does not retain a hidden shared-host fallback.
- No Swift client, model ID, payload dialect, timeout, token cap or pricing changes are required.

## Forward sequence

1. Record target environment, actual console host, model availability and current endpoint/config
   identity. Keep Beijing/space/account fixed. A domain name does not prove physical inference region.
2. Deploy the compatible code before setting the new env. Existing instances continue using legacy.
   Restart/redeploy the selected Web/native backend and worker when activating new configuration.
3. Validate configuration without a key or network request:

   ```sh
   node --experimental-strip-types scripts/providers/qwen-endpoint-probe.mjs --check
   ```

4. With `QWEN_API_KEY` supplied through the existing secure environment, invoke `--probe` instead
   of `--check` for exactly one synthetic request (64 output tokens, 15 seconds, no retry). This can
   incur normal API charges. It uses the existing transport and protocol validator, logs metadata
   and usage only, and does not print model text, reasoning, raw errors or credentials. A PASS is
   connectivity/protocol evidence, not product-path or policy acceptance. Preserve a failed attempt
   and its usage/unknown accounting; do not silently retry or change the pinned model to get green.
5. For persisted user-text work, inspect the target environment's active policy first. It binds
   provider and **exact endpoint**. Create a new policy/version with truthful notices using the
   existing policy mechanism, then obtain the required test actor's consent normally. Never alter
   an existing policy, consent or queued work to pretend the old grant covered a new destination.
   Check policy ID/endpoint and worker configuration together before starting a worker. No schema
   change is needed. Do not infer cloud records from repository fixtures.
6. Validate enabled Staging paths: Web/native AI-assist, Wiki generation/proposals/search and text
   worker as applicable. Check actual destination, result parsing, usage, budget and persistence.
   Old-policy/new-endpoint combinations must refuse with zero provider dispatch. No user material
   is sent without its existing authorization.
7. Record evidence and keep production rollout separate unless explicitly authorized. No historical
   artifact, checked-in example or successful probe establishes that a deployed environment switched.

## Historical scripts

The dated `scripts/acceptance/vpj-75-*` and `vpj-76-staging-text-worker.mjs` scripts retain their
original destination, fixed policy/turn IDs and schema/account-count guards as historical replay
records. Do not globally replace their domains or rerun them to migrate current data. In particular,
`vpj-75-76-staging-qwen-policy.mjs` installs the dated six-hour policy: it is not a generic migration
installer. Use the current job/service CLI with a new matching policy and operator configuration.
The existing notice JSON, migrations and destination receipts are immutable historical evidence.

## Rollback and mixed versions

Stop the selected worker, retaining unresolved budget holds and receipts. Restore its prior job
configuration plus explicit `VISEPANDA_QWEN_ENDPOINT=https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`;
redeploy/restart affected server instances. Confirm the old policy is still valid and consented
before any old-policy task resumes. If it expired/revoked, establish a valid policy through the
normal process; do not extend or resurrect consent silently. Keep new and old queued work bound
to their own policy. No automatic fallback or task repointing is implemented.

Rollback needs no schema reversal or deletion. The shared endpoint's future availability remains
subject to Alibaba's service status. Do not remove compatibility until selected environments have
real migration evidence and removal is separately scoped.

## Validation

Run `pnpm lint`, `pnpm typecheck`, `pnpm build`, relevant model-gateway, knowledge and text-worker
contract/security tests plus required CI. Workspace tests cover target mismatch before I/O,
malformed URLs, policy equality, denied authorization, redirect/error refusal, unchanged
protocol/usage and explicit rollback. Existing legacy fixtures remain in other suites.

At implementation time, record live probe, deployed Staging, policy and end-to-end status separately
as PASS / FAIL / UNRUN. A missing console login or target host is UNRUN, not a waived gate.

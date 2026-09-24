# VPJ-07 #195 hosted resident text worker — verification (2026-09-23)

Base: main `a90ce61`. Environment: macOS, Docker Desktop, local Node v26.8.2 (CI uses
Node 22), disposable `public.ecr.aws/supabase/postgres:17.6.1.159` containers with
`--network none`. Synthetic ids, a controlled fake model on 127.0.0.1 and canary
credentials only. No remote project, real credential, paid provider, Staging or
Production action.

Scope: implemented + observed on a local disposable database. **Not** observed in
Staging, not accepted by the user, and not a TestFlight/device result.

## Results

| Check | Command | Result |
| --- | --- | --- |
| Hosted worker end-to-end (real CLI child processes, all migrations, SQL RPC gateway, fake provider) | `VP_TURN_DB_TEST=1 node --experimental-strip-types --test tests/integration/turn/hosted-worker.test.mjs` | PASS 6/6, 0 skip |
| Existing Turn PostgreSQL suites + hosted | `VP_TURN_DB_TEST=1 node --experimental-strip-types --test tests/integration/turn/durable-work.test.mjs tests/integration/turn/text-work.test.mjs tests/integration/turn/hosted-worker.test.mjs` | PASS 42/42, 0 skip |
| Grounded, Ops ledger, durable budget PostgreSQL suites (all migrations incl. new one) | `VP_GROUNDED_TURN_DB_TEST=1 VP_OPS_DB_TEST=1 VP_BUDGET_DB_TEST=1 node --experimental-strip-types --test tests/integration/knowledge/grounded-turn.test.mjs tests/integration/observability/ops-ledger.test.mjs tests/integration/cost/durable-budget.test.mjs` | PASS 39/39, 0 skip |
| Loop/profile/CLI fail-closed/health | `node --experimental-strip-types --test tests/security/turn/hosted-text-worker.test.mjs` | PASS 9/9 |
| Security suite | `node scripts/run-ci-suite.mjs security` | 159 pass / 0 fail / 1 pre-existing environment skip (AI-14 local Supabase target not configured) |
| Typecheck | `./node_modules/.bin/tsc --noEmit` | PASS |
| Lint | `node scripts/lint.mjs` | PASS |
| Docs | `node scripts/docs-check.mjs`; `git diff --check` | PASS |
| `lib/` alone runs (container premise) | copy `lib/` + `{"type":"module"}` to an empty dir, import module, run CLI | PASS (module loads; CLI exits 1 fail-closed without config) |
| Container image build + fail-closed smoke | `.github/workflows/hosted-worker.yml` step | UNRUN locally: no Node base image present and none was pulled; runs in the new CI workflow |

## End-to-end scenarios observed (hosted-worker.test.mjs)

1. **Starts disabled.** Migration rollback leaves no object; applying it changes no
   existing row. anon/authenticated get `permission denied` on all new RPCs. A running
   worker heartbeats `disabled`; a queued Turn stays queued with 0 model calls. After
   `set_hosted_worker_enabled(true)` the same Turn completes and the owner reads the
   answer. SIGTERM exits 0 with a `stopped:stopped` heartbeat.
2. **Multi-owner / multi-policy / all modes.** Owner A text + task-history policy,
   owner B translation (text lane), owner C grounded (knowledge intent), owner D
   without budget scope. One process: A/B/C completed and read back through the
   ordinary authenticated RPCs (`read_text_turn`, `list_service_task_turns`,
   `list_text_turns` → `projectTranslation` = `translated`, `read_grounded_turn` =
   `clarification`); cross-owner reads return nothing. D is skipped (counter > 0),
   stays queued, 0 model calls. Every model call settled once in the owner's own scope;
   one terminal event per Turn. Status view and journal are content-free.
3. **Budget exhausted.** Scope limit below the reservation: 0 model calls, 0 budget
   attempts, Turn ends `failed` after 3 bounded attempts (`quarantined:3`), one terminal.
4. **Cancellation.** Cancelled before claim: never dispatched. Cancelled while the
   provider call was in flight: late answer not stored, Turn stays `cancelled`, the
   provider's verified usage is settled (real cost not hidden).
5. **Crash + duplicate claim.** SIGKILL while the provider held the request: lease 1
   and budget attempt `dispatched` (unknown cost retained, not released). Lease expiry
   was simulated by moving only that row's `expires_at` to now (natural expiry is 120 s).
   Two live workers then competed with four more owners' Turns: the crashed Turn
   completed on attempt 2 with exactly one recovery dispatch (`dispatched,settled`);
   each other Turn was dispatched exactly once; one terminal event each. The killed
   worker remains visible as a stale heartbeat.
6. **Operator stop switch.** Disabling while running: worker reports `disabled`, a new
   Turn stays queued with 0 model calls, status view shows switch/reason/queue.
   Re-enabling resumes and completes it.

Secrets: canary keys never appear in stdout, stderr or journals (asserted in 1, 2, 6
and in the CLI tests).

## Not established here (UNRUN / open)

- Real Staging migration, container host, real Qwen call, native device/TestFlight read.
- Container image build (CI only) and platform restart/drain behavior.
- Per-group reconciliation of hosted journals with the existing settlement CLI.
- Grounded ai-assist supplement job remains request-driven (#360/#491).
- Natural 120 s lease expiry (simulated by SQL clock shortcut in scenario 5).
- Full native HTTP (Next dev server + GoTrue) readback for this worker; readback here
  uses the same SQL RPCs the native/Web routes call, under the authenticated role.

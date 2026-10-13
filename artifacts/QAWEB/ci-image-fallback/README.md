# PR 684: direct digest-pinned official GHCR pulls

## Current repair, 2026-10-13

Follow-up baseline: `801522beee5efc2ca2cbca92f506272dd6bd658d`.
Main reported PR head `a21be165`; GitHub job `115161288349` logs were read directly.
At 06:27:35 UTC ECR returned `Rate exceeded`, and at 06:28:36 UTC the ECR
PostgREST pull returned `context deadline exceeded`, before database tests.
The earlier throttling-only fallback did not handle that distinct failure.

The image step now pulls all four official GHCR references directly by the same
verified linux/amd64 manifest digests, then tags each as its existing ECR local
name. There are no ECR network calls, retries, added timeouts, third registries or
credential changes. Docker enforces the requested content digest during pull;
any pull/digest failure or tag failure exits the step unchanged. Unknown pins,
empty image lists and failed image-list commands fail before Docker is called.
Lane selection, integration assertions, timeouts and `--pull=never` stay intact.

- PASS: governance tests 21/21, zero skipped/todo/cancelled, including exact four-pin
  command traces, no ECR pull, unknown/empty/failed list, pull and tag failures,
  and stopping before subsequent images after a failure. See
  `ghcr-direct-governance-tests.log`. Docker is stubbed in these shell tests.
- PASS: workflow actionlint 1.7.12 (ShellCheck unavailable, disabled), actual
  candidate Bash `-n`, docs check and diff check.
- Reused: unchanged exact digest readback from both registries in
  `registry-digests.json`, performed earlier in this same repair session.
- UNRUN: real large image pulls and full database matrix locally; Main will
  cherry-pick this follow-up and assess the resulting exact PR head's real CI.
- Tool/network: GitHub job-log read succeeded using existing authentication.
  No new permission or registry access was requested.

Rollback: revert this follow-up commit to the previous throttling-only behavior.

## Historical throttling-only repair (superseded)

Baseline: `4e477a7f7bb05af1539bf940da204dd93df90bf3`.
Branch: `codex/qaw005-ci-image-fallback-20261013`.

Goal: unblock the actual PostgreSQL CI lane without changing any lane, selector,
integration assertion, timeout, image version, or `--pull=never` consumer.
GitHub job `115140480943` failed three ECR pulls with
`toomanyrequests: Data limit exceeded`; the database tests did not execute.

The original ECR pull and three-attempt retry remain. Only exhaustion of the
existing `toomanyrequests` / `Rate exceeded` branch enables the explicit four-image
allowlist. Pull the official `ghcr.io/supabase` image by its verified linux/amd64
manifest digest, then tag it under the original ECR local name. Unknown image
pins, other ECR errors, GHCR pull failures and tag failures remain fatal.

Validation on 2026-10-13:

- PASS: live public ECR and GHCR tag manifests identify identical linux/amd64
  digests for all four images. See `registry-digests.json` for immutable readback.
- PASS: `node --test tests/unit/governance/ci-change-scope.test.mjs tests/unit/governance/db-integration-ci.test.mjs`
  — 21 tests, no failures/skips/todos/cancellations; output in `governance-tests.log`.
  The new behavior tests execute the actual workflow Bash with stubbed Docker,
  Node image-list and sleep functions. These are shell behavior evidence, not a
  real Docker pull or database test result.
- PASS: `actionlint 1.7.12 -shellcheck='' .github/workflows/db-integration.yml`.
  Used an upstream release binary in `/tmp`, verified against the upstream SHA-256
  checksum. ShellCheck unavailable; separate Bash `-n` is covered by the test.
- PASS: `node scripts/ci-suites/db-integration.mjs --list`.
- PASS: `node scripts/docs-check.mjs` and `git diff --check`.
- UNRUN: local full database matrix, intentionally not duplicated for this CI-only
  fix. Actual GitHub runner mirror pull and full PostgreSQL gate await Main's
  cherry-pick into PR 684 and that exact head's CI.

Tool/network facts: GitHub CLI authentication is available via the existing
keyring; PR and job-log reads succeeded. Docker buildx registry reads succeeded
against both registries. No credentials were added or changed. An initial job-log
request used an incorrect owner and returned 404; correcting it to the repository
remote succeeded. GitHub CLI escape-output protection required its documented
`--allow-escape-sequences` option to read the original colored log.

Rollback: revert the scoped commit. No database, product, registry publishing,
production, provider, permissions, package or lockfile changes.

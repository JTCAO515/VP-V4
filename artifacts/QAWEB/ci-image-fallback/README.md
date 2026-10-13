# PR 684: bounded official image fallback

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

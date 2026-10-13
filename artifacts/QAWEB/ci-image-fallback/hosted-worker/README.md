# Hosted worker CI: same pinned PostgreSQL, official GHCR source

Main source: PR #685 `06f5bea0`. Actual failed job: `115275099140`,
run `38391184974`. The read-back GitHub log shows ECR `Data limit exceeded`
at 11:34:59, 11:35:10 and 11:35:30 UTC, followed by exit 1 before code tests.

Change only `.github/workflows/hosted-worker.yml` image preparation: pull
`ghcr.io/supabase/postgres@sha256:617b62a16858dc8436c1ded1970fa13e33539feb4c98b580cf6274b46b2ab1ef`
for linux/amd64, then tag `public.ecr.aws/supabase/postgres:17.6.1.159` for the
unchanged `--pull=never` consumers. Reuse same-session exact dual-registry
manifest proof in `../registry-digests.json`. Any pull/digest/tag failure fails
the job. No ECR retry, third registry, timeout change or permission change.

`workflow-lease.json` records exact before/patch/after SHA-256 against Main's
source. All bytes outside the image preparation step are identical: test
commands, worker health, journal/secret gates, permissions and 15-minute timeout.
The previously fixed DB/GHCR and Quality/Node workflows are not modified.

Validation:

- PASS: governance 23/23, no skips/todos/cancellations; executes the actual Bash
  preparation and checks exact GHCR pull/local tag plus pull/tag failure exits.
- PASS: actionlint 1.7.12 for hosted-worker YAML (ShellCheck unavailable/disabled),
  Bash `-n` in governance, docs check and diff check.
- PASS: cold offline PostgreSQL bootstrap and SQL query; see `cold-postgres.log`. This uses a new task-specific
  local tag to preserve the existing shared arm64 ECR tag. It starts the actual
  amd64 image with `--pull=never`, `--network none`, postgres user and the same
  fixture initdb/socket setup and 60 x 250ms readiness bound; a SQL query checks
  the running database. This is fixture preparation evidence, not full worker
  integration or target-host acceptance.
- UNRUN: full worker/security/secret suite and new exact-head GitHub run. Main
  owns integration; no old job rerun, target host, credential, real database,
  provider or data operation is performed.

GitHub log reads succeeded with existing authentication. Normal local commit
is attempted under the task's authorization; no alternate identity or platform
permission bypass is used. No PR push is needed for this handoff.
Rollback: revert the scoped commit, restoring the old ECR preparation behavior.

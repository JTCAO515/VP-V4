# AI-15 R1 acceptance: unrun checks

## Local durable-runtime evidence

- **Not run:** local Supabase migration/RLS and transaction probes.
- **Observed substitute:** one security and eight integration tests reported `local Supabase is not
  running`; `pnpm db:verify` reports every database path as `not-configured` and made no production
  connection attempt.
- **Owner / unblock:** a local operator starts an isolated Supabase runtime, applies the migration
  head and supplies disposable owner/other/anonymous seed actors. Re-run security and integration
  suites; do not use a production connection.

## Frozen-install evidence

- **Not run:** a clean `pnpm@9.15.9 install --frozen-lockfile`.
- **Reason:** this audit used the available pnpm `11.19.0` for non-install checks; it warns that the
  legacy package override setting is ignored. The working tree also contains a pre-existing,
  uncommitted `pnpm-lock.yaml` change outside this Issue's ownership.
- **Owner / unblock:** resolve the package manifest/lockfile override compatibility in the separate
  deployment-lockfile work item, then test a clean pinned-pnpm frozen install. Do not reuse a green
  source build as install evidence.

## Browser and release observation

- **Not run:** authenticated owner/other-user browser trace across Fact -> Turn -> Proposal ->
  confirmation -> reload/audit; physical-device accessibility; staging/Preview deployment;
  feature-flag rollback; metrics, alerts, latency/cost sampling and observation window.
- **Reason:** no authenticated disposable runtime, deployment target, approved release configuration
  or telemetry environment is available to this repository audit.
- **Owner / unblock:** release operator supplies an isolated staging environment, named signals and
  a finite rollback threshold. This Issue does not authorize account, deployment or production
  action.

## Rollback

Revert the R1 report, command ledger, handoff records and execution-row correction. The audit makes
no runtime, database, provider, account, flag, deployment or data change.

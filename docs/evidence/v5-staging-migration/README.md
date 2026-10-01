# V5 local migration forward replay

Related to #561. One preparation result: compare an audited migration **version set** with
repository files, then rehearse the exact missing set against a newly reconstructed local
baseline and compare it with a fresh full replay. This does not apply anything to Staging.

Inputs: base `27c45b054879c0c57adc75cf6e920327b6bd00da`; coordinator-supplied
2026-10-01 Staging audit (75 applied / 90 local / remote-only 0). The committed JSON lists
75 versions reconstructed from that base and the supplied 15 missing versions. It contains
no remote schema bytes, users, data, credentials or backup. The tool replays current SQL;
the report binds the exact SQL catalog, tool/probe bytes and local Postgres image by SHA-256.
Neither a version match nor this synthetic baseline proves remote schema equivalence.

## Commands

Run from the repository (Node and a running local Docker daemon are required):

```sh
node scripts/acceptance/v5-staging-migration-set.mjs --compare tests/fixtures/v5-staging-migration/observed-20261001.json
node --test tests/unit/acceptance/v5-staging-migration.test.mjs
node scripts/acceptance/v5-staging-migration-replay.mjs --execute
```

For a later audit, provide a local JSON snapshot using the same `schemaVersion`, a plain
`provenance` string, and an `applied` array of 14-digit version strings **sorted by version**:

```sh
node scripts/acceptance/v5-staging-migration-replay.mjs --execute --snapshot /absolute/local/snapshot.json
```

No DSN, API key, linked-project CLI call, existing DB/container name or apply-target mode is
accepted. Docker environment overrides and contexts with non-Unix endpoints are rejected.
The pinned image `public.ecr.aws/supabase/postgres:17.6.1.159` must already be local; the
runner uses `--pull=never`, `--network none`, no published ports or volumes, and a private
Unix socket. It queries only run-created containers and removes only its exact owner label.
Cleanup failure produces a failing result. A killed process may require removal of its
specifically identified run containers; the tool never resets a shared database.

## What is checked

- Unknown applied versions make replay ineligible. Duplicate/malformed versions and
  unordered input fail before provisioning. Missing migrations come from set difference,
  including `20260922033000` below the observed applied max `20260923140000`.
- Bootstrap reuses `tests/integration/turn/fixtures/durable-work-schema.sql` (minimal Auth
  tables/SQL claims, not real GoTrue/JWT). It adds `auth.role`, pgcrypto and the relevant
  Supabase public-function default grants before the repository ACL-hardening migration.
- Baseline: apply exactly the known 75 SQL files in version order. Seed two synthetic
  accounts, one Trip, one revoked memory consent, a disabled/frozen scope and a settled
  budget attempt. Apply the exact 15 missing files in version order, each transactionally.
  Preserve all seeded Trip/consent/budget rows byte-for-byte as JSON across forward replay.
  Stop on the first failing migration and identify its filename and SQL diagnostic.
- Fresh: independently replay all 90 files. Compare schema-only `pg_dump` TOC blocks,
  retaining object definitions, constraints, indexes, functions, triggers, RLS, object/default
  ACLs, types, sequences and extensions. Only restrict tokens and creation-OID-driven block order are ignored; SQL
  body comments are retained. Empty or duplicate-key dumps fail closed; migration history is checked separately by
  count. Unit regressions prove ACL/function changes remain detectable.
- On both paths: owner/other/anon Trip, consent and ledger isolation; service-only planning
  preflight and protected budget/ledger writes; saved pace revoke plus stale save rejection;
  revoked ledger replay remains revoked; erased transaction replay is rejected and its
  ownerless tombstone remains. Existing Trip and settled cost stay unchanged; planning
  policy list stays empty and hosted worker stays disabled. No actual Apple/provider call.

## Observed results (2026-10-01)

[Replay report](replay-20261001.json): **PASS_LOCAL_SYNTHETIC_REPLAY_ONLY**. All seven
stages passed: reconstructed 75, forward 15, unchanged seeded rows, fresh 90, both behavioral
probe sets, structure/permission comparison. Both schema hashes are
`9cbae52a1362f2cf08bc21a03dc4cacdbb770e6ea5e963e91583e1e9dfb94a5b`; differences = 0.
Both owned containers were removed; a subsequent owner-label container listing was empty.

[Intentional dependency-negative report](dependency-negative-20261001.json): expected
**FAIL_LOCAL_SYNTHETIC_REPLAY**, exit 1. A local snapshot additionally omitting the Trip
schema prerequisite stopped at `20260825160314_ai10_durable_trip_proposals.sql` with
`relation "public.trips" does not exist`. Both run containers were removed. No old migration
was changed or reordered to make this pass. To reproduce, copy the committed snapshot to a
temporary local file and remove `20260825052328` from its `applied` array, then use `--snapshot`.

Targeted unit tests: **PASS 6/6**, no skips. Syntax checks, `node scripts/docs-check.mjs` and
`git diff --check`: **PASS**. The first exploratory behavioral run used an incorrect expected
ledger error string (`TRANSACTION_ERASED`); source inspection established the existing
contract is `TRANSACTION_CONFLICT` after owner erasure. Only the probe was corrected.

**UNRUN:** real Staging schema/data compatibility, target migrations or backup/restore,
shared data/account acceptance, real Auth/JWT, provider/Apple calls, host deployment,
activation and native/device behavior. This tool is not a Staging migration plan approval or
backup-recovery acceptance; #561 remains open. Required PR CI is reported on the PR itself.

Scope: only new `scripts/acceptance/v5-staging-migration-*`, dedicated tests/fixtures and this
evidence directory. No migration, common harness, package/CI registry, runtime or deployment
file changed. Unit tests are discovered by the existing unit suite. The Docker replay is an
explicit local acceptance command, not silently added to an ungated integration suite.
Rollback: remove these new files; no target database or deployed behavior was changed.

# #683 independent QA package candidate

2026-10-13 Asia/Shanghai. Base `8b5975e48e850d0cbb1bf6f8ef7c4b0c9ff6b888`; branch/worktree `qaw005-independent-package-20261013`. Scope is the renewed Main lease: QA package validators, QA docs/tests and own evidence. Existing `115f0b70` container execution proof is reused; Dockerfile remains byte-identical to the accepted base. The follow-up key-slot lease changes only the QA installer secret selection/mount and its tests.

## Contract implemented

- Closed profile `vpj07-hosted-text-worker/4` requires lowercase alphanumeric 20-character `projectRef`, excluding `dzqdzetcctkhbrhlxxgn`.
- Closed target `qa-hosted-deployment-target/2` adds the same `projectRef`; its `databaseUrl` must equal exactly `https://<projectRef>.supabase.co`. Existing `environment: staging` denotes deployment class, not the old project. All original identity/hash/build/endpoint/startup/restart checks remain.
- Profile/target reference mismatch, missing/invalid/shared refs, unknown fields, alternate origins, explicit ports, credentials, paths/query/fragment, legacy QA `/3` profile or `/1` target fail closed. No request/header/job-derived binding and no shared-project fallback.
- Existing image Node/same immutable ID, offline validator, private files and disabled-heartbeat workflow stay unchanged. S1/planning are untouched. No actual project reference, key or project provisioning is introduced.

## Current evidence and dependency

PASS: independent Python profile 6 cases (new synthetic ref accepted; missing/shared/uppercase/hyphenated ref and legacy version rejected); Python AST, Node syntax of package validator and container fixture; docs check and diff check.

The current base backend still exports a `/3`-only `parseQaHostedProfile`. The candidate intentionally calls the original backend export with `/4` rather than implementing a divergent runtime validator or modifying another owner's `lib` files. Positive canonical package / Linux container tests are therefore UNRUN pending Main's stable backend dependency commit providing `/4` with `projectRef` and trusted RPC/job binding. Test candidates already cover new-ref success, cross-profile/shared/legacy rejection and retain original package/private-file/old-path regressions. Imported dependency must be integrated by exact commit before running them and building `vp-qa-independent-validator-fixture:20261013`; never reuse the old v3 image tag as if it contained the new parser.

At this checkpoint, no candidate runtime image has been built, no live worker/DB/provider/cloud operation has run, and no target authentication is claimed. Existing local Docker Engine 29.8.0 linux/aarch64 is available. The fixture host image from `115f` remains reusable. Real ECS x86_64, new project Auth/credentials, qualified job execution, provider, migration, activation and heartbeat remain UNRUN. Original ECS keys must stay in place; a new project key handoff requires explicit operator scope.

Main owns dependency integration and final review/CI; this candidate is a local commit only, with no push/PR/merge. Once the backend dependency arrives, continue this same task and update this evidence with exact source/build/test results. No second task or new writer is needed.

## Follow-up: frozen backend interface and isolated key slots

Main supplied the source-owned `readIndependentQaTarget(ref)` contract; the target validator now consumes that export, keeping reference syntax consistent with the backend (`[a-z0-9]{20}`). The Python/shell early metadata selectors mirror it. Backend code remains untouched in this worktree; its stable commit is still required before package integration tests.

QA installer now checks `/run/vp-worker-secrets/qa-<ref>/db.key` only after canonical package validation and reuses the original root Qwen file. It never checks or mounts the legacy root DB key for QA. New slot directory is tmpfs uid/gid 1000 mode 0700; file checks remain regular/no-symlink uid/gid 1000 mode 0400/link1/bounded-size. Worker argv sets the trusted nonsecret reference and provides a private 64KiB tmpfs plus two read-only file binds at the unchanged reader paths. S1/planning directory mount stays unchanged.

PASS: `secret-mount.fixture.mjs` 1/1, zero skips, real local Linux Docker tmpfs volume and the unchanged runtime secret reader. Synthetic independent DB and original Qwen selected; parent/files all statfs TMPFS, per-file mountinfo read-only, write rejected, mode 0644 rejected. No actual worker process or real key used. Fixture-owned donor/volume cleanup completed. Existing S1/planning targeted regression was rerun because installer mount composition changed; 3/3 PASS, zero skips. Current Python reference syntax was separately checked: 7/7 PASS (letter/digit refs accepted; missing/shared/uppercase/hyphen/legacy refused).

Full independent package/preflight/start fixture remains UNRUN until Main integrates the exact backend dependency. It now includes an unusable legacy root DB slot, mandatory new DB slot, reference environment and individual-mount argv assertions. No ECS key slot has been created and no existing credential read, copied, replaced or authenticated.

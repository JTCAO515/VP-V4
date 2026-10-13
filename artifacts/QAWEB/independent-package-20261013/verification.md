# #683 independent QA package candidate

2026-10-13 Asia/Shanghai. Base `8b5975e48e850d0cbb1bf6f8ef7c4b0c9ff6b888`; branch/worktree `qaw005-independent-package-20261013`. Scope is the renewed Main lease: QA package validators, QA docs/tests and own evidence. Existing `115f0b70` container execution proof is reused; installer/Dockerfile remain byte-identical to the accepted base.

## Contract implemented

- Closed profile `vpj07-hosted-text-worker/4` requires lowercase 20-letter `projectRef`, excluding `dzqdzetcctkhbrhlxxgn`.
- Closed target `qa-hosted-deployment-target/2` adds the same `projectRef`; its `databaseUrl` must equal exactly `https://<projectRef>.supabase.co`. Existing `environment: staging` denotes deployment class, not the old project. All original identity/hash/build/endpoint/startup/restart checks remain.
- Profile/target reference mismatch, missing/invalid/shared refs, unknown fields, alternate origins, explicit ports, credentials, paths/query/fragment, legacy QA `/3` profile or `/1` target fail closed. No request/header/job-derived binding and no shared-project fallback.
- Existing image Node/same immutable ID, offline validator, private files and disabled-heartbeat workflow stay unchanged. S1/planning are untouched. No actual project reference, key or project provisioning is introduced.

## Current evidence and dependency

PASS: independent Python profile 6 cases (new synthetic ref accepted; missing/shared/uppercase/digit ref and legacy version rejected); Python AST, Node syntax of package validator and container fixture; docs check and diff check.

The current base backend still exports a `/3`-only `parseQaHostedProfile`. The candidate intentionally calls the original backend export with `/4` rather than implementing a divergent runtime validator or modifying another owner's `lib` files. Positive canonical package / Linux container tests are therefore UNRUN pending Main's stable backend dependency commit providing `/4` with `projectRef` and trusted RPC/job binding. Test candidates already cover new-ref success, cross-profile/shared/legacy rejection and retain original package/private-file/old-path regressions. Imported dependency must be integrated by exact commit before running them and building `vp-qa-independent-validator-fixture:20261013`; never reuse the old v3 image tag as if it contained the new parser.

At this checkpoint, no candidate runtime image has been built, no live worker/DB/provider/cloud operation has run, and no target authentication is claimed. Existing local Docker Engine 29.8.0 linux/aarch64 is available. The fixture host image from `115f` remains reusable. Real ECS x86_64, new project Auth/credentials, qualified job execution, provider, migration, activation and heartbeat remain UNRUN. Original ECS keys must stay in place; a new project key handoff requires explicit operator scope.

Main owns dependency integration and final review/CI; this candidate is a local commit only, with no push/PR/merge. Once the backend dependency arrives, continue this same task and update this evidence with exact source/build/test results. No second task or new writer is needed.

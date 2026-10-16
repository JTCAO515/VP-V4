# QA worker action package — offline review only

Prepared for Main under original #683 sole resource ownership. This document authorizes no operation. ECS/Vercel writes, credential reads by a worker, shared-DB calls and provider calls remain STOP until Main issues the exact stage lease. No new installer, wrapper, service, project or host is proposed.

## Immutable selection and current baseline

Source: `c0ef6edefcc2ac63ed665d14305cca1ad541504f`, combined tree `5f910aa67131b8219a250ee7ab67f00127634bc1`. `worker-action-package-c0ef6ede.json` records immutable lib tree and SHA256 of Dockerfile, ignore file, installer, validators and runtime/target/profile sources. Main's PR729/730 merge evidence is the supplied selection; final worker source review/CI acceptance must be explicitly associated with this package. Later source changes invalidate this selection until a revised manifest is reviewed.

Fixed host: Hong Kong `i-j6c7q3kftufyroypiqvu` / `47.239.12.244`, x86_64 → linux/amd64. Latest live evidence9a1309f9: Docker29.1.3, no containers, no Node process observed; old main54c8 checkout and old54c8 image remain. Two existing tmpfs keys satisfy metadata checks, but authentication is UNRUN. Required profile/target files are absent. This is not a known-good prior QA worker to roll back to.

Preserve `/opt/vp-v4`, old image, keys and journal. Proposed new source-only directory is `/opt/vp-v4-qa/c0ef6edefcc2ac63ed665d14305cca1ad541504f`; refuse existing directory or any unexpected/symlink parent, do not overwrite or reset. Installer keeps its fixed original profile, target, secret, journal and container paths; this is source isolation, not a second worker or new key slot. A fresh readback must revalidate identity/boot/space/memory/empty fixed+candidate+previous containers and metadata immediately before the lease.

## Stage A: supply chain and offline validator (requires host-write lease)

1. Export only immutable `lib` and `deploy/hosted-worker` Git objects from the selected commit into a source-only archive, after checking its file inventory. Record archive SHA256, source/tree and manifest. Transfer through the existing approved Workbench path; no `.git`, local checkout dirt, env files, private material, key or journal is included. No archive/transfer has been performed here.
2. Main selects and reviews the official `node:22-bookworm-slim` linux/amd64 manifest digest. Current Dockerfile uses a mutable tag; a digest is a mandatory unresolved input, not an invented pin. In the isolated source directory prepare `deploy/hosted-worker/Dockerfile.qa-pinned` with exactly the original content except its FROM line is `node:22-bookworm-slim@sha256:<approved-amd64-manifest-digest>`. Preserve matching ignore rules as `Dockerfile.qa-pinned.dockerignore`, record both hashes and the one-line diff. No shared/repository Dockerfile change is required. Refuse a different registry/architecture/digest.
3. Under the explicit lease, pull only that approved immutable base once; inspect OS/architecture/image ID and retain evidence. Build from the isolated context with no network and no implicit pull:

```sh
# Proposed commands only; base digest, staging inventory and host lease are not yet supplied.
docker pull --platform linux/amd64 node:22-bookworm-slim@sha256:<approved-amd64-manifest-digest>
docker build --platform linux/amd64 --network none --pull=false \
  -f deploy/hosted-worker/Dockerfile.qa-pinned \
  --build-arg BUILD_ID=c0ef6edefcc2ac63ed665d14305cca1ad541504f \
  -t vp-hosted-text-worker:c0ef6edefcc2ac63ed665d14305cca1ad541504f .
docker image inspect --format '{{.Id}} {{.Os}} {{.Architecture}}' vp-hosted-text-worker:c0ef6edefcc2ac63ed665d14305cca1ad541504f
```

The command cwd is exactly the proposed isolated source directory. No npm install/build, host Node install, apt, new registry credentials or extra network during build is needed by this Dockerfile. Record full resulting image ID; a local build may have no RepoDigest, so do not fabricate one or confuse image ID with registry digest. Main must accept the archive/base/build provenance chain; source SHA/tag alone is insufficient.

4. Prepare canonical nonsecret profile/target offline with the existing exact-source `validate-qa-target.mjs --prepare`, using the actual reviewed inputs below. Preserve output profileJson/targetJson bytes and profile SHA256. No fixture IDs, key-like strings, synthetic prices or guessed actor values may become deployment inputs. Refuse missing inputs instead of generating a superficially runnable template.
5. Under the host lease install only the two canonical nonsecret files at the existing fixed paths, refusing any unexpected existing file/type/owner/symlink. Directory `/etc/visepanda/qa` root:root0700, profile and target root:root0600, single link; old original env-file is neither created nor required in file mode. Existing keys/journal are not copied, rewritten or reimported.
6. Reuse `bash deploy/hosted-worker/ecs-worker-files.sh preflight --qa`. This is a MUTATING offline validator operation: it creates a short-lived --rm container and invokes install-d on the journal directory. Its validator uses the selected immutable image ID, no network, read-only root, root only to read0600 nonsecret files, cap-drop ALL/no-new-privileges, disabled core/logs, 256MiB/32pids; it mounts only profile/target, no keys, journal or Docker socket. Success proves package/image compatibility, not DB/key/provider readiness. Host Node is unnecessary. No preflight or container was run in this preparation.

## Exact nonsecret inputs Main must bind

| Object | Fields and constraints |
| --- | --- |
| Profile | Closed `vpj07-hosted-text-worker/4`; explicit projectRef `dzqdzetcctkhbrhlxxgn`; only modes `[qa_session_history_v1]`; planning=null |
| Loop | Proposed poll3000ms, lifetime600000ms, drain45000ms, concurrency1, groupLimit1; these are review candidates, not applied settings |
| qwen tariff | Actual configurationId UUID/version, priceVersion, pricing object accepted by existing staging parser, reservedMicros, maxOutputTokens≤4096, timeoutMs≤60000; all must match actual policy/scope/provider configuration and reviewed current pricing. No current amounts are supplied |
| Target | Closed `qa-hosted-deployment-target/2`, environment=staging, same projectRef, exact derived databaseUrl, actual ownerId/policyId/scopeId UUIDs, canonical noticeHash64hex, build=full source SHA, actual allowlisted Beijing qwenEndpoint, startupState=disabled, restartPolicy=no |
| Canonical binding | Existing prepare adds profileSha256; preserve both canonical newline-terminated byte strings; validator rejects unknown keys, legacy versions, mismatched ref/build/endpoint/hash |
| Web producer | QA-branch-only Origin and approved Ref; actual policy ID and explicit context mode `qa_session_history_v1` to match this worker. Keep QA enable absent until Main grants the final stage. Generic public URL/key configuration needs matching safe verification, never secret disclosure |

Critical runtime boundary: target owner/policy/scope/notice fields are offline package provenance, not runtime actor filters. Installer passes validated profile, endpoint and projectRef; runtime calls qa_ready_groups_v2 with limit/model/price/endpoint and uses the returned group identities. groupLimit1 limits count only. Main has assigned the original server owner to close the actual runtime identity guard gap. Provider activation is BLOCKED until a reviewed runtime guard binds the approved actor/policy/scope; a temporarily unique eligible group set is insufficient. A complete eligible-group readback remains supporting evidence only. No fixture/limited first row or snapshot may substitute for code binding. This source selection must be revised after that guard lands.

## Stage B: disabled smoke (separate DB/runtime lease, no provider activation)

Prerequisites: fresh approved shared-DB recovery/compatibility/write-window package, installed correct migrations/RPC ACLs including QA readiness/claim/dispatch/history functions, actual ordinary actor/policy/notice/consent/scope/configuration, and SQL global worker switch readback disabled. Current75-migration target is not ready. Shared ref approval and old expired A-D/E window do not authorize this stage. Main owns DB writes and global-switch impact across all consumers; this sole writer owns ECS operations only.

After those gates and StageA approval, propose the existing command:

```sh
bash deploy/hosted-worker/ecs-worker-files.sh start c0ef6edefcc2ac63ed665d14305cca1ad541504f --qa
```

Start resolves the local tag once to immutable image ID, reuses it for validation and worker creation, no pull/replacement. Container is fixed vp-hosted-text-worker, restart=no, no host ports, read-only root, cap-drop ALL/no-new-privileges, core0, 768MiB/128pids, 75s stop timeout, bounded Docker logs10MiB×3. It mounts existing tmpfs secrets read-only and existing private persistent journal. Real worker start READS both keys, calls DB status and writes heartbeats/journal even with SQL disabled; its separate lease must explicitly authorize that credential consumption and shared-DB I/O. It cannot be labeled a no-key/no-write probe. It must not contact provider while disabled.

Verify only safe State/Image/Health fields and a content-free loopback health result, fresh DB heartbeat phase=disabled/enabled=false (Main's approved DB reader), exact build, zero claims/dispatch/provider attempts and bounded elapsed smoke window. Initial DB status plus first heartbeat both must report disabled before discovery. Do not dump Config.Env, raw process args, full profile, raw logs or journals. Disabled health200 proves heartbeat only. Failure stops this stage, keeps SQL disabled, retains container/image/journal and reports; no retry/replace/rm/restart.

## Stage C: producer enable and real bounded acceptance (separate grant)

Only Main may supply the once-bound actual Auth test actor, policy/notice/consent, context mode, configuration/prices, exact expense cap, request/turn count and window, reviewed runtime actor/policy/scope guard plus complete eligible group supporting readback, DB enable/rollback operator and limits. This package does not grant that spend or global switch change. The existing Vercel QA branch/source must be exact-reviewed and CI accepted; reuse its normal automatic build path. Do not retry manualcreate403/list403, switch identities or bypass protection. Any newly rejected specific action stops with evidence.

Then this writer applies only the approved QA branch flags/policy/context values; no other env/domain/WAF/DNS/Production changes. Record actual rebuilt deployment→alias→SHA/config booleans; Main controls DB activation separately. Real browser acceptance must cover login return to original Session, actual EG/provider answer and safe usage evidence, refresh/reopen persistence, bounded same-Session next turns, explicit cancel/failure/unknown-charge semantics and actor isolation. A page200, offline validator, disabled heartbeat or synthetic sample cannot close these outcomes. Native/TF acceptance remains separately owned.

## Stop, rollback and evidence bounds

A failed deployment does not authorize starting the old54c8 image. Preserve the current old checkout/image and all journals; no known-good compatible QA runtime exists. Main's approved DB operator disables the shared switch and independently confirms it, accounting for other consumers; this is not automatically authorized by an ECS rollback. Within a stop lease use existing files installer stop once (SIGTERM/drain75s). Retain failed/new container for inspection; do not clean/remove/restore/restart until a new precise lease resolves any pending attempt. Unknown provider outcome stays pending/full reserved hold until normal reconciliation; no auto-release or repeat submit.

Vercel rollback is scoped to the same QA branch configuration with captured before/after metadata and Main's approved values; no credential/protection/domain substitution. Main chooses compatible source pin; deployment403 remains historical and not retried. SQL migrations are append-only, no down migration/data restore here. Never use this ECS for encrypted recovery archives or recovery identity material.

Output only stage time/source/build/image/base identifiers, identity/boot, safe metadata, disabled state, approved aggregate usage/counts and PASS/FAIL/UNRUN. Raw key/env/headers/body/Session contents/DB rows never enter chat/Git. Nonsecret IDs and cost receipts can still be private operational metadata; retain only the minimum in Main-approved private locations. No full docker inspect/log export. Journals remain on original private persistent path and are not deleted or uploaded.

## Current review request and external gaps

Main can review the exact source/manifest, proposed isolated path and staged boundaries now. Minimal unresolved external inputs: approved amd64 base digest/provenance; fresh shared-DB compatibility/recovery/write window; actual policy/actor/scope/notice/configuration/tariff, reviewed runtime actor/policy/scope guard and complete eligible-group supporting readback; precise host image/profile/preflight/disabled-start/stop lease; separate producer/provider activation budget/window. No JT key retransmission is required. Existing key files are present but credential validity is UNRUN. This offline plan performs no stage and no resource mutation.

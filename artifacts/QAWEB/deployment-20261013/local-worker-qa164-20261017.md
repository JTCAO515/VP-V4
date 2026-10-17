# QA164b local linux/amd64 disabled-first candidate

Result: **local build PASS / no-configuration fail-closed smoke PASS**. Hosted loop, profile/target runtime, DB heartbeat, user Auth/provider answer/persistence/multi-round remain UNRUN. No remote action was authorized or performed.

## Source and reuse

Original owned WT began clean at e686a131c351bf60be21a4a55110cc04d4eb5929. Exact accepted QA source is `164b157fa61147c271904087de51b46333f908b5`; no unmerged753 or other mutable latest head was selected. Original Dockerfile, matching ignore, installer and validator are byte-identical to prior source12ada. Whole lib tree differs only by the added Native API modules native-http.ts/native-store.ts, so the old remote1ec86928 image cannot be relabeled a complete QA164b image.

Reuse is complete: original Dockerfile and default CLI, original files installer --qa, original target validator, original parsers and runtime-binding guard. No new wrapper, App/lib/worker/shared source/config/CI change or CLI-internal repair is needed. The CLI requires an explicit enable flag before reading profile/secrets or entering the loop; QA mode also requires validated target and runtime tuple binding before secret access, then a disabled DB status and first disabled heartbeat. These later checks are source facts, not remotely exercised results.

## Local tool and source-context evidence

Docker29.8.0 clientdarwin/arm64 and serverlinux/arm64 are actually available. Existing desktop-linux docker builder is running and advertises linux/amd64. No builder bootstrap/change, daemon/context/global configuration change, privileged QEMU or package installation occurred. Existing approved official node22 base is cached as linux/amd64 with immutable digest `sha256:efd0ab5780c2d9ab1f0f869571a00d5edb17793bff4cce4a2792e3eb0ffc7562`. BuildKit resolved public registry metadata normally; no credentials/tokens were retrieved or printed by this task. No inference of native-x86 host architecture is made.

A new private temporary context under `/private/tmp/vp-qa164-local-hy4n3786/context` was materialized from immutable Git objects only. Selected516 source files include runtime lib code/assets and the original Dockerfile/ignore/validator. Each selected file was independently compared to the exact source Git blob; blob ID, original mode and SHA256 are in the JSON manifest. The source lib tree is062037e754c11dad050bf45376672d7a4254c002. No working-tree dirty file or existing environment value was consulted.

To obey the no-fixture/no-real-metadata requirement without editing source, the temporary context excludes43 non-runtime files:29 Markdown,9 review/fixture patches, one development SQL, one unreferenced synthetic fixture-translation module and three audit-evidence JSONs. Runtime TS/MJS source contains no references to the removed fixture module/SQL/audit filenames. All included executable source bytes remain exact164b. Public runtime CA/contract assets remain; no private identity, backup, Auth shim, seed, root artifacts, .git, .env or node_modules is included. This is an explicit filtered packaging selection, not a claim that the packaged lib tree equals the entire repository lib tree.

Only two derived build files were added in the temporary output: Dockerfile.qa-pinned changes exactly the FROM line to the approved digest, and its matching ignore is the original ignore bytes. No root repository file was altered. The original Dockerfile generates its small module package manifest and has no external npm package/lockfile dependency, so no npm install or fabricated lockfile was introduced.

## Actual local image and smoke

One build used --platform linux/amd64, --network none, --pull=false, exactQA SHA as BUILD_ID and OCI revision, isolated3.26MB context and self-owned nonce tag. It completed exit0.

- Image ID: `sha256:f807ed1a79297604bc54e9558cb344da21dc9c5d779269459feeba0f42a7f0c2`
- Local tag: `vp-qa164-local:164b157fa611-f823851c63`
- Inspect: linux/amd64; OCI revision exactly164b157fa61147c271904087de51b46333f908b5

Docker reports a local RepoDigest. No registry push/publication or remote image attestation is claimed. Image/context/build log stay local; no image or archive was committed or uploaded. No other image/container/cache was cleaned.

One own-nonce smoke explicitly requested linux/amd64 on the arm64 host, proving this local environment can execute that target platform. It used the original default CLI with no env arguments/profile/keys, --network none, readonly root, uid/gid1000, cap-drop ALL/no-new-privileges/core0,256MiB/32pids/lognone, no ports or host binds, and only its own ephemeral journal-path tmpfs. Actual exit1, empty stdout and the expected generic unavailable message confirm the missing-enable gate fails closed. --rm removed this smoke only; no self container remained. No worker loop, real Go2China, model, provider or DB request ran. It is not an acceptance test of an enabled worker.

## Exact entry/config-name pins for later review

Entrypoint remains `node --experimental-strip-types --disable-warning=ExperimentalWarning lib/server/jobs/run-hosted-text-worker.mjs`. Existing QA file-mode schemas remain hosted-profile/4, deployment-target/2 and runtime-binding/1. Original validator prepares canonical bytes and emits the bounded tuple, and original installer supplies the matching runtime binding. No policy/actor/scope/notice/price/endpoint value was fabricated or supplied.

Required nonsecret configuration names only:

- VISEPANDA_HOSTED_TEXT_WORKER
- VISEPANDA_HOSTED_WORKER_SECRET_MODE
- VISEPANDA_HOSTED_WORKER_PROFILE
- VISEPANDA_HOSTED_WORKER_BUILD
- VISEPANDA_HOSTED_WORKER_JOURNAL_DIR
- VISEPANDA_HOSTED_WORKER_HEALTH_HOST / VISEPANDA_HOSTED_WORKER_HEALTH_PORT
- VISEPANDA_QA_RUNTIME_BINDING
- VISEPANDA_QA_SUPABASE_PROJECT_REF
- VISEPANDA_QWEN_ENDPOINT

Legacy secret environment names VISEPANDA_HOSTED_WORKER_DB_KEY/QWEN_KEY are forbidden for QA file mode. Existing secure-file handling is the original implementation; no file/key was read, created or copied here.

## Later actions are suggestions, not this lease

Main can review the context exclusions, immutable image/source/revision and original entry/config pins now. A later exact package must supply accepted target DB/API compatibility, canonical profile/target/runtime tuple, actual actor/policy/notice/scope/provider tariff and bounded execution parameters. Main's execution lease within existing authorization is distinct from genuinely new permissions, real-data/high-risk shared-target changes or expanded expense approvals; routine prior authorization is not requested again. Missing values remain missing.

Original installer preflight can create a validator container and touch the journal directory. Worker start reads keys, calls DB and writes heartbeat/journal even while globally disabled. Activation/claims/model spending and producer enable have additional real side effects. None occurred in this local task. Local image delivery to a host/registry, actual profile installation, Vercel/env/alias change, worker start/stop, DB/window/restore/role/budget/provider/TF action requires Main's separate precise package and was not attempted.

Verification: exact Git blob comparison for all516 selected files PASS; actual amd64 build and no-config smoke PASS; diff/docs checks PASS. No unrelated matrix or mirrored test was added. Evidence is `local-worker-qa164-20261017.json`; large build artifacts remain only in the private temporary path.

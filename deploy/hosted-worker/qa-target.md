# QA file-mode approved-target package

The explicit `preflight --qa` / `start <build> --qa` path requires a reviewed nonsecret target at `/etc/visepanda/qa/qa-target.json` as well as the explicit-target v4 profile at `/etc/visepanda/hosted-profile.json`. The target directory must be root-owned mode 0700; both files must be root-owned mode 0600 with one link and no symlink. The original tmpfs secret, journal, swap, container and disabled-heartbeat requirements still apply.

Prepare canonical file contents offline:

```sh
node --experimental-strip-types deploy/hosted-worker/validate-qa-target.mjs --prepare < reviewed-nonsecret-input.json > prepared-files.json
```

Input has exactly `profile` (the reviewed QA v4 profile) and `target`. Target fields are `schemaVersion: "qa-hosted-deployment-target/2"`, `environment: "staging"`, `projectRef: "dzqdzetcctkhbrhlxxgn"`, `databaseUrl: "https://dzqdzetcctkhbrhlxxgn.supabase.co"`, `ownerId`, `policyId`, `scopeId`, `noticeHash`, `build`, `qwenEndpoint`, `startupState: "disabled"`, and `restartPolicy: "no"`. Use the actual reviewed identities, canonical notice hash and exact loaded image build; include no credential. The output contains `profileJson` and `targetJson`, whose bytes must be preserved; the target binds the profile SHA256.

Current operator-approved testing uses the existing `dzqdzetcctkhbrhlxxgn` project; the earlier independent-project/key-slot proposal is superseded. This explicit selection does not grant shared Production export, schema migration, maintenance, provider spending or worker activation authority.

The profile has `schemaVersion: "vpj07-hosted-text-worker/4"` and mandatory `projectRef`; the target uses `/2` and the same reference. Both are closed schemas. The target URL must equal the backend target helper's exact derived HTTPS origin, without credentials, port, path, query or fragment. Missing/invalid references, cross-profile targets, unknown job URL/header fields and legacy QA `/3` or target `/1` are refused. A reference in a request or job cannot override the trusted composition root. The worker gets `VISEPANDA_QA_SUPABASE_PROJECT_REF` from the validated package, while S1/planning retain their original paths and schemas.

QA keeps the already prepared `/run/vp-worker-secrets/db.key` and `qwen.key`, with the original tmpfs, uid/gid 1000, directory mode 0700, file mode 0400, no-symlink and single-link safeguards. The actual worker mounts that complete fixed directory read-only. No new `qa-<ref>` subdirectory, key import/copy or alternate secret path is selected by the package. Preflight checks metadata/size only and proves no authentication. The validator container continues to receive only nonsecret profile and target files. Runtime QA `/4` must parse/bind the trusted reference before reading fixed-path keys and must use files-only secrets; this requires the matching backend implementation in the reviewed image.

Build from the exact integrated backend/package source commit, record its build and immutable image ID, and prepare the package for that build. Older runtime sources without the matching `/4` parser or updated approved-target helper fail closed; do not claim a new package was verified using an old `/3` image.

QA validation requires Docker and Python 3 on the host; it does not require host Node. Before either QA command, load the reviewed worker image as `vp-hosted-text-worker:<target.build>`, built with this Dockerfile and the matching `BUILD_ID`. Independently review and record the image digest; a matching tag alone is not provenance. The installer never pulls. Older images without the packaged validator fail closed and must be rebuilt through the normal image review process.

For both commands, the installer selects the target build using a duplicate-rejecting parser, resolves the local tag to an immutable image ID, and runs the bundled validator with that ID. The validator also requires the image's baked `VISEPANDA_HOSTED_WORKER_BUILD` to match. `start` uses the same ID for worker creation, so a tag change between validation and creation cannot select another image.

The uniquely named validation container is short-lived (`--rm`, restart `no`), has no network, runs with a read-only root filesystem, dropped capabilities and no new privileges, and receives only the two read-only nonsecret files. It uses root solely to read root-owned 0600 package files. No key directory, journal bind, Docker socket, credential environment value or env-file is passed to it. Resource limits, disabled core dumps and disabled persistent Docker logs apply. Its entrypoint is Node running only the offline validator. The existing worker entrypoint and first SQL-disabled heartbeat requirement are unchanged.

Both the legacy Beijing endpoint and supported Beijing workspace endpoint are validated by the existing provider allowlist. `start` revalidates the selected build and passes this exact endpoint through `VISEPANDA_QWEN_ENDPOINT`. Missing, malformed or changed packages fail before worker Docker create. S1 and planning paths retain their original validators.

This package grants no activation authority and does not create a policy, budget, consent or credential. Before host start, independently verify the approved fixed-target schema/RPC ACLs, new policy/notice, actual budget, safely held credentials and maintenance scope. Keep the SQL switch disabled for the first heartbeat. A successful offline check or mocked Linux Docker test is not real ECS/provider acceptance.

Local regression commands (synthetic data only):

```sh
node --experimental-strip-types --test tests/security/qa-hosted-installer/*.test.mjs tests/security/turn/hosted-secret-profile.test.mjs tests/security/turn/hosted-planning-deployment.test.mjs
docker build --network none --pull=false -f deploy/hosted-worker/Dockerfile --build-arg BUILD_ID=abcdefabcdef -t vp-qa-bound-validator-fixture:20261013 .
docker build -f tests/security/qa-hosted-installer/Dockerfile.fixture -t vp-qa-installer-fixture:20261013 .
node --experimental-strip-types --test tests/security/qa-hosted-installer/container.fixture.mjs
```

The explicit container fixture requires a local Docker daemon and builds a Linux host with Python/Docker CLI and no `node` in PATH. Its narrow proxy translates package bind paths through its own nonsecret volume and forwards real validator runs; worker create/start are intercepted. Only the fixture host receives the local Docker socket; validators never do. The fixture deletes only its own volume and ephemeral containers, and leaves its two test images for reuse. This opt-in fixture is separate from ordinary security test discovery because it requires these images and daemon access. It does not validate ECS x86_64, credentials, provider access, database activation or a real worker heartbeat.

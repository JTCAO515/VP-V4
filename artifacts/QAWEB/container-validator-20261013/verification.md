# #683 QA file-mode container validator — local evidence

Date: 2026-10-13 (Asia/Shanghai). Base: `2dbc7136620bd75ce81e99103aac1ea1b5dfd6ae`.
Owner worktree: `qaw005-container-validator-20261013`; branch `codex/qaw005-container-validator-20261013`.
Scope: QA installer branch, offline target validator, required nonsecret image packaging, adjacent QA docs/tests. No shared root management files, SQL, lib, credentials, ECS or other owners' resources changed. Main retains integration/review/CI/merge ownership.

## Implemented

QA preflight/start now use the reviewed, locally loaded worker image's Node. A duplicate-rejecting Python build selector resolves its tag to an immutable ID, which is reused for worker creation. The bundled canonical validator enforces the baked image build as well as the target build, profile SHA, endpoint and all existing canonical profile/target rules. Root/private/tmpfs/link-count/journal/swap/empty-worker checks and first disabled heartbeat requirement remain. S1/planning retain their original validators and interfaces.

Validator invocation has a unique name, `--rm`, no pull, no network, restart `no`, read-only root filesystem and package binds, no added capabilities/new privileges, resource limits, no core dumps and no persistent Docker log. Only two nonsecret files are bound. No secret directory, key contents, value environment, env-file, Docker socket or persistent journal bind reaches the validator. Root in the validator is required for existing root:root 0600 packages. Image provenance remains an external reviewed-image requirement; the tag/build string alone is not authentication.

## Observed PASS

- Exact before hashes matched the transferred lease.
- Local Docker Desktop 4.91.0 / Engine 29.8.0, Linux arm64; outbound GitHub check succeeded. Session permission profile was danger-full-access / approval never. No permission/model/config modification and no platform rejection occurred.
- Runtime Dockerfile built offline with local Node 22 base digest `sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c`, synthetic BUILD_ID `abcdefabcdef`. Image ID: `sha256:7d6be5a555145b3890d967c0e497f47c1fb581381a54eaaa2c54e4e95b7b67e7` (Docker inspect ID on this engine; build metadata also reports config digest `sha256:36100fd3440808ab206a520e8093f1dca0dd2f358061839e72ec2dcfcfd376fc`).
- Explicit `container.fixture.mjs`: 1/1 PASS, zero skips. Single isolated Linux fixture has real Python and Docker CLI, no Node in PATH. Its own nonsecret volume supplies root-owned private files to actual offline validator containers through a bounded Docker proxy. Successful preflight/start, wrong requested build, profile hash, endpoint, duplicate profile/target keys, private-file mode/hardlink/symlink failures and existing-worker rejection observed. Proxy verifies validator argv, unique names, immutable image identity, no env/env-file/secret mount, and worker endpoint/restart arguments. Actual worker create/start are intercepted, never forwarded. Fixture host alone has the local Docker socket; validators do not.
- QA/S1/planning scoped automated coverage: 9 distinct tests PASS, zero skips, with unchanged evidence reused. First combined run: 8/8 before restoring the existing mocked QA Linux test; final target file: 2/2 including that retained test. Covers profile/1, /2, /3 discovery, Python profile rejection, canonical target binding, missing/mismatched runtime image build, S1 and planning Linux installer compatibility.
- `bash -n` installer, `node --check` target validator and explicit fixture, source policy lint (833 files), docs check, and `git diff --check`: PASS.
- Own ephemeral validator/fixture containers and volume absent after tests. Two uniquely named fixture images retained for reuse; unrelated resources untouched.

An intermediate test-harness error (`root is not defined` after restoring the existing mocked Linux regression) failed 1 test. Restored its root binding and updated its Python/Docker stubs for the new call shape; final target tests 2/2 PASS. No production validator was changed to satisfy this harness error.

## Exact source evidence and limits

SHA256 after implementation:

- `ecs-worker-files.sh`: `5eecd8fcfbda2d5d828108a11af834800eb1bfdfd6ad451addd8047c297eb471`
- `validate-qa-target.mjs`: `7d3c8577a8fed8243312660426eebc19f42f9c2c7a04f2afecffff296fa07d0f`
- `Dockerfile`: `446c8c92185ec868bdb522cec04ecbf46f247206671685e723f9b62dac9e210e`

Rerun affected evidence if these runtime sources or imported runtime validators change. Commands and fixture setup are in `deploy/hosted-worker/qa-target.md`; explicit real-container fixture is separate from normal security test discovery, and the existing mocked Linux test remains in that discovery.

UNRUN: ECS x86_64/Docker 29.1.3, real credentials/authentication, provider calls/budget, database migration or activation, actual worker start/heartbeat, production, remote CI and Main's independent final review. No push/PR/merge performed. Project-wide TypeScript check/build not run: no TS or dependency changes; actual imported TS validation was exercised in the built runtime image. Existing shared database/Production boundary remains a deployment blocker outside this implementation. Rollback is reverting these scoped files and retaining the original host-Node QA requirement; no data rollback is involved.

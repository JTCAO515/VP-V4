# #683 QA explicit-target package — current and historical evidence

2026-10-13 Asia/Shanghai. Base `8b5975e48e850d0cbb1bf6f8ef7c4b0c9ff6b888`; branch/worktree `qaw005-independent-package-20261013`. Scope is the renewed Main lease: QA package validators, QA docs/tests and own evidence. Existing `115f0b70` container execution proof is reused; Dockerfile remains byte-identical to the accepted base. The follow-up key-slot lease changes only the QA installer secret selection/mount and its tests.

## Historical independent-target candidate (superseded)

- Closed profile `vpj07-hosted-text-worker/4` requires lowercase alphanumeric 20-character `projectRef`, excluding `dzqdzetcctkhbrhlxxgn`.
- Closed target `qa-hosted-deployment-target/2` adds the same `projectRef`; its `databaseUrl` must equal exactly `https://<projectRef>.supabase.co`. Existing `environment: staging` denotes deployment class, not the old project. All original identity/hash/build/endpoint/startup/restart checks remain.
- Profile/target reference mismatch, missing/invalid/shared refs, unknown fields, alternate origins, explicit ports, credentials, paths/query/fragment, legacy QA `/3` profile or `/1` target fail closed. No request/header/job-derived binding and no shared-project fallback.
- Existing image Node/same immutable ID, offline validator, private files and disabled-heartbeat workflow stay unchanged. S1/planning are untouched. No actual project reference, key or project provisioning is introduced.

## Historical candidate evidence and dependency

PASS: independent Python profile 6 cases (new synthetic ref accepted; missing/shared/uppercase/hyphenated ref and legacy version rejected); Python AST, Node syntax of package validator and container fixture; docs check and diff check.

The current base backend still exports a `/3`-only `parseQaHostedProfile`. The candidate intentionally calls the original backend export with `/4` rather than implementing a divergent runtime validator or modifying another owner's `lib` files. Positive canonical package / Linux container tests are therefore UNRUN pending Main's stable backend dependency commit providing `/4` with `projectRef` and trusted RPC/job binding. Test candidates already cover new-ref success, cross-profile/shared/legacy rejection and retain original package/private-file/old-path regressions. Imported dependency must be integrated by exact commit before running them and building `vp-qa-independent-validator-fixture:20261013`; never reuse the old v3 image tag as if it contained the new parser.

At this checkpoint, no candidate runtime image has been built, no live worker/DB/provider/cloud operation has run, and no target authentication is claimed. Existing local Docker Engine 29.8.0 linux/aarch64 is available. The fixture host image from `115f` remains reusable. Real ECS x86_64, new project Auth/credentials, qualified job execution, provider, migration, activation and heartbeat remain UNRUN. Original ECS keys must stay in place; a new project key handoff requires explicit operator scope.

Main owns dependency integration and final review/CI; this candidate is a local commit only, with no push/PR/merge. Once the backend dependency arrives, continue this same task and update this evidence with exact source/build/test results. No second task or new writer is needed.

## Historical follow-up: separate key slots (superseded)

Main supplied the source-owned `readIndependentQaTarget(ref)` contract; the target validator now consumes that export, keeping reference syntax consistent with the backend (`[a-z0-9]{20}`). The Python/shell early metadata selectors mirror it. Backend code remains untouched in this worktree; its stable commit is still required before package integration tests.

QA installer now checks `/run/vp-worker-secrets/qa-<ref>/db.key` only after canonical package validation and reuses the original root Qwen file. It never checks or mounts the legacy root DB key for QA. New slot directory is tmpfs uid/gid 1000 mode 0700; file checks remain regular/no-symlink uid/gid 1000 mode 0400/link1/bounded-size. Worker argv sets the trusted nonsecret reference and provides a private 64KiB tmpfs plus two read-only file binds at the unchanged reader paths. S1/planning directory mount stays unchanged.

PASS: `secret-mount.fixture.mjs` 1/1, zero skips, real local Linux Docker tmpfs volume and the unchanged runtime secret reader. Synthetic independent DB and original Qwen selected; parent/files all statfs TMPFS, per-file mountinfo read-only, write rejected, mode 0644 rejected. No actual worker process or real key used. Fixture-owned donor/volume cleanup completed. Existing S1/planning targeted regression was rerun because installer mount composition changed; 3/3 PASS, zero skips. Current Python reference syntax was separately checked: 7/7 PASS (letter/digit refs accepted; missing/shared/uppercase/hyphen/legacy refused).

Full independent package/preflight/start fixture remains UNRUN until Main integrates the exact backend dependency. It now includes an unusable legacy root DB slot, mandatory new DB slot, reference environment and individual-mount argv assertions. No ECS key slot has been created and no existing credential read, copied, replaced or authenticated.

## Current JT direction: approved shared target and original key directory

JT superseded the independent-project direction: formal testing continues on `dzqdzetcctkhbrhlxxgn`, with existing root `db.key` and `qwen.key`; no new project/ref/key slot or key input. Historical commits `7fbe169f` and `bea1f92a` and their actual observations above remain preserved, but their shared-ref rejection and separate-key-mount contract are no longer current requirements.

Current package keeps profile `/4` and target `/2` with mandatory matching projectRef and exact derived databaseUrl. It delegates target acceptance to the backend-owned helper, removes the shared-ref exclusion from Python/shell, and emits the validated reference into worker configuration. Unknown/missing/mismatched target fields and legacy QA versions still fail closed. Current tests use the explicitly approved dzt binding; changing a job/request URL cannot select the root.

The installer restores the original accepted fixed-root secret metadata checks and whole-directory read-only worker bind, exactly as before the separate-slot proposal. No new directory or key path is selectable. Validator mounts stay nonsecret-only and worker validation/creation keep the same immutable image ID. The separate-file mount fixture is removed from current source; its previous PASS remains historical evidence only.

At the pre-integration checkpoint, backend dependency was pending Main delivery: current local base still has `/3` only, while the known independent-source commit `1c1e94e3` still rejects dzt and must not be substituted as an accepted current dependency. Full `/4` package/container tests were UNRUN at that checkpoint; the final integration results below supersede that pending state. No actual cloud/ECS/DB/provider/credential operations are implied or performed. Export/DDL/fees keep their specific approval requirements.

Current targeted PASS: approved dzt Python profile plus five malformed/legacy/unknown-path negatives (6/6); byte comparison confirms original secret metadata-guard block and worker mount/create tail match accepted base `8b5975e4` exactly, so prior S1/planning and fixed-root file-mode evidence is reused. Shell/Node syntax, docs and diff checks PASS.

## Final integrated approved-target result

Main-approved backend commits `1c1e94e36f4bcb6bf74450032eac6f5cea8894db` and `d2c2cf7e` were cherry-picked without conflict as local `358fc90e` and `46d84e17`. `git diff d2c2cf7 -- lib` is empty: no backend source was authored or altered by this owner. The package now uses `readApprovedQaTarget` directly; Python and shell early checks likewise accept only explicit dzt. Even a self-consistent profile/target for a different well-formed ref is rejected.

PASS: 9/9 focused tests, zero skips: QA installer/profile/canonical target/discovery plus backend `independent-target.test.mjs`. This covers v1/v2/v4 discovery, explicit approved-ref config, strict URL and no fallback, profile/composition/job agreement, actual CLI binding before key reading and rejection of env fallback, missing/wrong/unknown target fields, mismatched or absent image build, hash/endpoint/duplicate rejection and the retained mocked Linux installer.

PASS: rebuilt runtime image from the integrated source plus the exact package-validator hash below, local Node base digest `sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c`, network-disabled build with synthetic BUILD_ID `abcdefabcdef`. `vp-qa-bound-validator-fixture:20261013` resolves to immutable ID `sha256:86e7003a58aff41d46944166fa7d6b509178ddfa57d977efda5e63b00fcc5e1d`.

PASS: `container.fixture.mjs` 1/1, zero skips, actual local Linux fixture with no Node in host PATH. Its validator runs use the built image's Node and real read-only binds, no network/secret mounts/value env. Preflight/start success used explicit dzt; image ID was identical between validation and intercepted worker creation, which received only the approved ref and original whole-root secret directory read-only bind. Wrong/missing/legacy binding, changed profile hash, endpoint, duplicate fields, private file mode/hardlink/symlink and existing worker state are rejected. Worker create/start remained intercepted: no actual worker or provider ran. Own temporary containers/volume absent afterward.

The first integrated container run failed a fixture assertion that searched for `/qa-` anywhere in worker argv and accidentally matched the legitimate Qwen endpoint hostname. The assertion now checks only `/run/vp-worker-secrets/qa-`; final run passed. Runtime code was not weakened for this fixture error.

Current shell/Node syntax, docs and diff checks PASS. Original accepted root secret metadata/create-tail evidence and S1/planning 3/3 regression are reused; neither unchanged section was broadened. Project-wide TypeScript/build/remote CI are not rerun for this package-only delta; matching imported TS was executed inside the built image, and backend owner evidence remains separately scoped.

Exact current SHA256:

- installer: `8cfa236a42bdcde9132b3da5a812a962597672da3c78f66cdd15039f44a2dfa3`
- Python profile validator: `851f41814b6bb46922dd7377a3ad87a62386b0c93abf0bb002c8d195d8a1d59a`
- packaged target validator: `e4e45e84022ca735f99cf573f2642940f62c6bf86582c600dcb32d141a01b1a0`
- Dockerfile: `446c8c92185ec868bdb522cec04ecbf46f247206671685e723f9b62dac9e210e`
- backend target: `4bd3d303a2d91881e41d19cfc44e04cd49ff8475fb418a540f5fe062a6756cf6`
- backend profile: `70958ae30f8dc17fa8bf21a20fdda45e7167e6d8e83e909732ec41667b1903f5`

UNRUN: real ECS profile `/4`, credential authentication, worker/disabled heartbeat, provider/Auth/budget/SQL, shared Production operations, remote CI and Main final review. No new project/key/slot, secret import/read/overwrite, push/PR/merge or host resource operation. Final package source is ready for Main integration; dependency commits are already present in Main and need not be reapplied there.

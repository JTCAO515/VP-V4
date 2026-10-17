# Inactive QA runtime configuration and minimum execution package

**Configuration preparation complete; real runtime NO_GO.** This package advances the DB-REBUILD goal without waiting for generic new authorization or old full-snapshot recovery. Current permission is source/templates/local synthetic validation only. It neither installs configuration nor declares the actual target ready.

## Pins and reusable implementation

Owned WT began clean at e83dc701755506701537e32574b8a04f5edfbdbe. Accepted source is164b157fa61147c271904087de51b46333f908b5, local candidate sha256:f807ed1a79297604bc54e9558cb344da21dc9c5d779269459feeba0f42a7f0c2, linux/amd64, revision/build164b. The existing image and original validator were actually inspected/reused. No additional image build, runtime wrapper, source helper, worker CLI, App/lib, allowlist, CI or shared configuration edit was needed.

Original entrypoint: node with type stripping running lib/server/jobs/run-hosted-text-worker.mjs. Reuse deploy/hosted-worker/ecs-worker-files.sh --qa and validate-qa-target.mjs. Schemas remain hosted-profile/4, deployment-target/2, runtime-binding/1. Canonical preparation binds profile bytes to target SHA256 and emits the target tuple for VISEPANDA_QA_RUNTIME_BINDING; runtime requires that independent tuple before reading keys. No fake implementation substitutes for these original checks.

## Deliverables and real-value boundary

- runtime-inactive-qa164-20261017.json is the exact two-object validator input shape. Known target/source/schema/build and disabled/no-restart constraints are fixed; required unknowns are null. It is intentionally **not a runnable or installable canonical package**.
- runtime-qa164-known-required-20261017.json separates source facts, inactive environment plan, safe existing key references and required real inputs. null means UNKNOWN, not a default or denied/approved decision. The inactive flag plan remains false and is descriptive only, not an env file written anywhere.
- runtime-qa164-offline-validation-20261017.json records eight actual offline checks through the original image validator. Format PASS is never promoted to runtime GO.

Actual owner/policy/scope/notice/consent qualification, provider configuration/version/tariff/reservation/output/timeout/endpoint, accepted loop bounds, target DB/API compatibility and execution lease are not supplied here. No UUID, notice, approval/signature, key, fee, budget cap or targetReady claim was invented. Actual keys are represented only by existing secure file names/references. No existing environment or key was read, copied, written or transferred.

The concrete gap is authoritative real-value binding from the responsible runtime/DB/service owner, not a request for JT to reapprove routine source work. Main can bind verified existing actor/policy/budget scope under the original P0 authorization and issue an exact execution lease. Genuinely new credentials, material permission changes, new real-data/high-risk shared-target actions or expense beyond a verified cap require only their actual additional scope. No default assumption expands those boundaries.

## Actual offline validation

All containers used the pinned local amd64 candidate, --pull=never, --network none, readonly root, dropped capabilities/no-new-privileges/core0, bounded memory/PIDs, lognone and self-only --rm. Canonical file checks mounted only two newly generated explicitly synthetic nonsecret files read-only; no key directory, host journal, socket, actual env or Auth material was provided. A temporary tmpfs prevented a persistent journal volume. No host/remote/provider/DB call was made. No installer preflight/start or worker runtime loop ran.

| Check | Actual result | Meaning |
| --- | --- | --- |
| Inactive template with UNKNOWN fields | Rejected, exit1, PASS | Missing real inputs cannot become canonical deployment files |
| Complete synthetic --prepare | Accepted, exit0, PASS | Original closed schema accepts an explicitly synthetic example |
| Synthetic canonical files + exact baked build + --emit-runtime | Accepted, exit0; emitted tuple shape/pins match, PASS | Canonical bytes/cross-file/build and runtime-wire format work |
| Different baked-image build pin | Rejected, exit1, PASS | A different build cannot reuse the package blindly |
| Profile byte/hash tampering | Rejected, exit1, PASS | Canonical byte binding is enforced |
| Different unapproved project target | Rejected, exit1, PASS | Self-consistent unapproved target is denied |
| startupState enabled | Rejected, exit1, PASS | Prepared target must start disabled |
| Extra unauthorized target field | Rejected, exit1, PASS | Closed-schema field injection is denied |

The valid synthetic UUIDs, notice string and trivial synthetic tariff exist only in the local proof fixture directory named qa164-synthetic-config-*. They are not real actor/policy/budget facts and must never be installed, uploaded or used to call a provider. The real inactive template contains none of those fabricated values. All self containers were removed; other containers/images/caches and global builder/context/daemon were not changed.

## Proposed real steps: identity, effect, rollback and exact gap

This table is a review/execution-plan boundary, not permission to perform its rows now. Steps must use the eventual reviewed DB-REBUILD implementation/API contract rather than treating historical162-migration/full-restore completion as a universal prerequisite.

| Step and target identity | Real effect and exposure | Rollback/retention | Existing authorization vs unresolved actual scope |
| --- | --- | --- | --- |
| Final source/image acceptance: Main with original QA owner, fixed QA source and reviewed local candidate | Review filtered source manifest/revision/platform and exact runtime inputs; no target state change | Preserve earlier source/image evidence; do not silently relabel old12 image as164 | Routine source preparation/review is already covered. Current result is local format evidence; final real-value acceptance remains required |
| Candidate delivery to original HK instance: original deployment owner, original official connection | Either a precisely approved existing transfer path or same fixed-public-source host build; creates isolated source/image on that host | Retain original checkout/image; refuse existing destination/tag conflicts; no automatic deletion, credential fallback or registry publication | Actual host delivery/build lease is not this task. Main selects precise transport/source/image pins. No new registry credential/account or Mac-file permission is assumed |
| Canonical nonsecret profile/target installation: same original host/operator | Writes fixed profile/target slots and metadata; includes actual runtime tuple, endpoint/configuration and tariff, no key values | Fresh before-state; refuse unexpected existing files/links/ownership, preserve prior canonical bytes safely; never overwrite unknown state | Original P0 setup direction does not supply missing real values. Main binds actual owner/policy/scope/notice/config/prices and precise paths/install lease; new permissions/credentials only if a real delta exists |
| Existing secure-file references: same worker UID and original approved project/provider boundary | Original file mode mounts the existing secure key directory read-only during a real worker start; no --env-file or key-value env fallback. Keys remain values in memory only | Do not reimport/retransmit keys; keep original tmpfs protection; reboot requires a fresh authorized readiness check, not assumed persistence | References are known; present/valid/current project/provider qualification is not established by this template. No value is read here. Any replacement/new key is a separate concrete credential action |
| Original installer preflight --qa: deployment owner, same host/image | Checks key metadata, starts a nonce offline validator container with nonsecret files, and invokes install-d on journal path; metadata/mode effects are real | Validator self --rm only; preserve journal and existing resources; failure stops before worker creation, no repeated replacement/cleanup | Main execution lease must include these effects. It is not pure read-only, and format PASS alone is not host acceptance |
| Disabled worker start: original installer/host, Main-bound target tuple and DB identity | Reads DB and Qwen keys, makes initial DB status request, writes heartbeat and persistent journal, polls only after initial disabled confirmation; actual DB I/O occurs even with no model call | Keep global switch disabled; retain failed container/journals and pending holds; approved stop/drain only, no fallback to incompatible old54c | Needs actual target API/RPC/ordinary-role compatibility and original DB owner's approved write/operational scope. Main may issue a bounded existing-scope lease after verification; missing compatibility is a fact, not invented targetReady |
| Actor/policy/budget qualification: responsible service/DB owner, actual ordinary test actor | Depending on package, creates/reads policy/consent/scope/notice/budget records and changes real state; complete tuple and actual use bounds must agree | Record exact before/after; preserve revocation/history/idempotency; no admin fixture substitutes for actual actor | Existing approved records may be verified/bound without repeat generic approval. New grant/credential, real-material access, shared high-risk apply or expense expansion needs its precise additional authorization. Actual values remain UNKNOWN here |
| Producer enable + bounded real canary: original QA env owner and DB/runtime owner, fixed QA origin and actual actor | Nonsecret enable/policy/context env writes and resulting deployment; DB enable/claims and model POST create billable attempts and saved user outcomes | On failure deny new admission/discovery via approved operators, then bounded drain/stop; preserve unknown outcomes at full reserve, no automatic retry/refund/release or journal deletion | Requires Main's once-bound actual source/target/actor/policy/context/budget/call-count/time-limit and rollback package. Real model cost is not authorized by an offline format PASS; cap/permission expansion is the actual new gap |

The shared worker switch affects all its consumers; this package cannot treat it as a private QA-only toggle. DB switch/apply changes belong to the DB execution owner, not an accidental installer side effect. No role/GRANT/RLS bypass, endpoint/allowlist edit, old W2/SCALE expansion, actual material recovery or new project is proposed.

## Delivery state

Source/build/entry/schema pins and inactive template are reviewable now. No blocking wrapper defect was found and no shared-owner change is requested. Runtime GO remains **NO_GO: actual authority/configuration and target execution prerequisites UNKNOWN**, while local schema/cross-pin/rejection checks are PASS. No remote target, host, Vercel, registry, DB, provider, fee or credential configuration action took place. Old images, worktrees, resources and failed historical evidence remain untouched.

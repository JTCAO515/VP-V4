# Actual hosted composition and smallest unblock conditions

Source: base `5e960e6d4dd4b1050b23622a4dc6ed57653f4b57`, unchanged runtime at
branch `codex/p0-qaw-service-20261016`. This supplements verification.md with
the actual installer/container entry, not another worker or wrapper.

## Conclusion: composition exists; no missing runtime implementation found

1. `deploy/hosted-worker/ecs-worker-files.sh start <build> --qa` validates the
   reviewed profile/target package inside the pinned local image and runs
   `docker create` then `docker start` for the original `vp-hosted-text-worker`.
2. `deploy/hosted-worker/Dockerfile` ENTRYPOINT runs
   `node --experimental-strip-types --disable-warning=ExperimentalWarning lib/server/jobs/run-hosted-text-worker.mjs`.
3. That CLI reads the `/4` profile and trusted ref, secure files, disabled SQL
   status and journal, then constructs `createHostedTextWorker(profile, workerDependencies)`
   and **awaits `worker(controller.signal)`**. It is an executed loop entry,
   not an exported callable factory left for a future host.
4. The hosted loop heartbeats, discovers through `qa_ready_groups_v2`, and its
   `/4` `workerFor` builds `qa-agent-worker/2` via `planQaGroup` then
   `createQaWorker(..., qaTarget)`. It passes `createQaContextInvoker()`, original
   DB/provider credentials, destination journal and a durable usage journal
   callback bound to the job digest. It invokes the returned poll.
5. The QA executor claims/reads the original lease, reserves original budget,
   invokes the QA context consumer, independently reauthorizes dispatch,
   uses original provider transport/protocol, records validated usage, finishes
   original budget and completes original QA work. Unknown ACK is retained for
   reconciliation, not resent or refunded.

`hosted-candidate.test.mjs` executes steps 4–5 through the real loop, worker,
context consumer, transport/protocol, budget and auditor with intercepted SQL/
provider HTTP: one synthetic answer, one attempt, one completion, usage audit
one distinct attempt and no settlement action. This is executable local
composition proof; it is not actual SQL, real provider or a container launch.

## Existing operator command and its nonsecret input schema

After Main's specific target-start authorization and host prerequisites:

```sh
sudo bash deploy/hosted-worker/ecs-worker-files.sh start "$QA_REVIEWED_BUILD" --qa
```

`QA_REVIEWED_BUILD` is the exact 12–40 lowercase hex build SHA already in the
reviewed target package and locally loaded `vp-hosted-text-worker:<build>` image.
There is no install/pull/build in this command. The installer resolves the local
image once to its immutable sha256 ID and uses that ID for validator and worker.
Do not run it against an existing old worker: original, candidate or previous
named containers cause explicit refusal and require separately reviewed replacement.

The one nonsecret `/etc/visepanda/hosted-profile.json` follows the `/4` schema
in verification.md. `/etc/visepanda/qa/qa-target.json` follows the exact schema
`qa-hosted-deployment-target/2`: `schemaVersion`, `environment=staging`, approved
`projectRef`, exact `databaseUrl`, lowercase UUID `ownerId/policyId/scopeId`,
64-lowercase-hex `noticeHash`, `build`, authorized `qwenEndpoint`,
`startupState=disabled`, `restartPolicy=no`, and canonical `profileSha256`.
The existing offline validator's `--prepare` produces canonical profile/target
JSON; full validation rejects byte/hash/build/destination mismatches.
These IDs are validated package metadata, not runtime owner/policy selectors;
the actual group and scope come from protected SQL discovery.

Host package files must be root:root 0600, regular non-symlink single-link files;
QA package directory root:root 0700. Original secret mount/journal requirements
remain in verification.md. Host requires root execution, bash/Python3, Docker,
findmnt/stat/install/swapon, disabled swap and a local image. Host Node is not
required for QA: validation runs offline in the existing image. No credentials
are arguments or profile fields.

## Runtime checks, rather than type declarations

| Gate | Actual existing check and observation needed |
| --- | --- |
| Host package | `sudo bash deploy/hosted-worker/ecs-worker-files.sh preflight --qa`: inspects real Docker daemon, tmpfs/uid/gid/mode/link/size, package bytes/hash/build, offline validator, journal and absence of named containers. It creates/checks journal directory; it is not a pure read-only target operation and does not query SQL. |
| Initial SQL | CLI actually POSTs `read_hosted_worker_status` using existing DB credential, bounded 10 s/no redirect and requires JSON 200 `{kind:"status",enabled:false}` before journal/loop start. Missing/bad RPC or already-enabled switch fails startup. |
| First heartbeat | Real `hosted_worker_heartbeat` must return `{kind:"ok",enabled:false}` on first loop cycle. File mode otherwise stops; disabled cycles never discover or dispatch. |
| Liveness | Existing installer `status` reports real container state/health. `/healthz` is based on a recent successful SQL heartbeat and distinguishes disabled/serving/stale; even serving is not an answer proof. |
| Discovery after separate activation | Real `qa_ready_groups_v2` must return disabled or qualified groups. Protected SQL checks exact QA mode/Qwen endpoint, current effective nonrevoked policy and consent, unhidden queued/expired-lease work, absence of prior dispatch/unresolved budget attempt, and exactly one enabled/unfrozen/unexpired budget scope with enabled exact model/tariff provider limit. Zero groups is idle, not success or a reason to create new grants/scopes. |
| Dispatch | Actual lease read and protected QA authorization recheck identity/context/policy/budget before transport. Missing RPC cannot be papered over by the factory. |
| Completion | Require actual provider answer, protected completion, durable usage receipt plus original budget ledger readback and same actor/Session reopen. Journal audit alone says ledgerState not_checked and cannot settle anything. |

## Which conditions currently block what

- Missing target QA RPCs are confirmed by Main's fresh read-only source. They
  block useful discovery/claim/read/authorization/completion when activated.
  They **do not alone prove disabled CLI startup fails**: that first needs the
  older `read_hosted_worker_status` and heartbeat, whose current usability here
  is UNKNOWN. Do not enable to probe this missing chain.
- A trusted current QA policy, consent, matching immutable provider config and
  exactly one usable original budget scope/limit are necessary for eligible
  work and dispatch. Current target readiness is not proven; their absence
  would produce no eligible group/refusal, not prevent disabled startup.
- ECS login/access and exact current host image/package/mount/container state
  are necessary to perform actual target preflight/start. They are unavailable
  to this owner in this task; no host readiness or running-worker claim follows.
- Browser flags/policy ID are separately known absent. They explain current
  frontend API 503, and must remain disabled until Main's target execution
  package includes the above dependencies. No additional code/queue is needed
  to bypass any of these conditions.

Minimum unblock: Main's reviewed source/target migration compatibility decision
and required existing RPCs available; verified trusted original policy/consent/
provider/budget bindings; verified host access/current resources and matching
reviewed image/package; then specifically authorized disabled-first start and
later bounded activation/real-answer test. These are separate gates; installing
all 86 missing migrations or adding a grant is not inferred authorization.

## Current verification limits

Initial existing suite run: 8 PASS, 1 FAIL. The failure was the existing Linux
installer test at Docker socket access under sandbox; the permitted isolated
retry reached the socket and failed because local Docker daemon is not running.
The retry's offline canonical-package test PASS; Docker-dependent test FAIL.
No daemon was started, no image pulled, no ECS action and no actual worker
started. This environment failure is not a product defect; no test weakened.

Further actual local CLI/loop verification:

```sh
node --experimental-strip-types --test tests/security/turn/hosted-text-worker.test.mjs tests/security/qa-agent-service/hosted-candidate.test.mjs tests/security/qa-hosted-installer/discovery.test.mjs tests/security/qa-hosted-installer/profile.test.mjs
```

Sandbox run: 22/24 PASS; two health-socket tests FAIL (no disabled health
response/child exited before bind). Re-running only the original
`tests/security/turn/hosted-text-worker.test.mjs` with permitted local socket
access: 17/17 PASS, zero skipped, including real child CLI disabled heartbeat,
health, SIGTERM drain, port-conflict exit and three parallel IPC header proofs.
The other seven unchanged QA composition/discovery/profile checks passed in
the first run. Thus all 24 unique checks PASS with the required local socket
access. No assertion, timeout, CLI or shared production source was changed.
These child CLI fixtures use synthetic credentials/intercepted HTTP; they do
not validate Linux real secret mounts or the target deployment.

Production changes: none. No shared-file patch or new lease requested. Main's
QA4 files remain read-only to this owner. Existing relevant loop/profile/
installer-negative checks are recorded separately from container/target UNRUN.

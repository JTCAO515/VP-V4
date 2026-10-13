> STOPPED: Main superseded this preparation after JT supplied actual empty Docker state and Staging disabled/zero-worker readback. These local drafts are retained without integration or execution. Use the original single-worker route only after Main's target migration/secure handoff is ready; do not use this candidate to start a sidecar.

# Additional QA worker candidate

Preparation only, requested by Main. No host login, key read/write, Docker creation/start or SQL switch operation has occurred. Candidate source binding is full reviewed SHA; current proposed source 4e477a7f7bb05af1539bf940da204dd93df90bf3 remains subject to Main's independent review/CI. Rebind if the final reviewed source changes.

The new v3 profile serves only qa_session_history_v1. Replacing the fixed vp-hosted-text-worker container could stop the existing Native text/planning modes. Use an additional container, never the old fixed-name script.

## Exact isolated objects

For SHA 4e477a7f7bb05af1539bf940da204dd93df90bf3:

- New container: vp-qaw005-sidecar-4e477a7f7bb0. Existing name collision refuses; no replace/stop/remove path.
- Separate reviewed checkout: /opt/vp-v4-qaw005/4e477a7f7bb0. The old /opt/vp-v4 checkout remains untouched.
- Image tag: vp-qaw005-sidecar:4e477a7f7bb05af1539bf940da204dd93df90bf3; actual Docker image ID is pinned at start.
- Independent root-private profile package: /etc/visepanda/qaw005-sidecar/4e477a7f7bb0/profile.json.
- Independent uid1000 journal: /var/lib/vp-worker/qaw005-sidecar/4e477a7f7bb0/journal.
- Existing operator-approved secure slots must be provided under the separate tmpfs directory /run/vp-qaw005-sidecar-secrets, bound read-only to the original container path /run/vp-worker-secrets. The candidate does not copy/read/write key contents or retrieve production secrets.

The operator must prepare these objects through existing authorized secure procedures; the scripts do not mkdir, provision keys, modify accounts or install tools. No reviewed profile, price, configuration ID, policy, budget or provider region is invented here.

## Global-switch window is still required

SQL heartbeat supports multiple worker IDs, but the stop switch is GLOBAL. Original file-secret startup reads read_hosted_worker_status and requires disabled before opening its journal, and again on its first real heartbeat.

1. Original holder/operator verifies the actual old container/host/cloud instance identity, source, current health and SQL switch. Unknown old-worker state is a blocker, not permission to replace it.
2. If an old worker is active, obtain operator acceptance of the exact short global disable → additional-worker disabled startup → restore window, including interrupted-claim impact. This candidate cannot grant that acceptance or toggle the switch. Even when no old worker exists, live disabled readback is required.
3. Confirm reviewed new policy/current synthetic actor consent, exactly one valid QA budget/provider scope, current reviewed tariff/endpoint/region, image/source and private storage. Keep existing attempts/holds/consents unchanged.
4. Operator disables the global switch in the accepted window, reads it back, and records the real approval/evidence reference, timestamp and at-most-five-minute expiry in a private receipt. This file records external authority; creating a file does not create authorization. The helper never generates it.
5. Preflight checks metadata only: reviewed source clean/SHA, image ID, private file modes/tmpfs/no-swap, resource headroom, new-name vacancy and closed v3 profile. First activation is conservative concurrency=1/groupLimit=1/lifetime≤1h; groupLimit is not owner authorization.
6. Explicit start consumes the externally reviewed receipt, profile hash and image ID, then creates only the new container. The original runtime must prove a distinct fresh disabled heartbeat. A running/healthy container alone is not readiness.
7. Operator restores the previous global switch only within the accepted window after both legacy and new heartbeat/source checks; verify old modes still operate. Do not automatically enable or broaden provider work. Run the bounded synthetic QA acceptance through normal login/consent.
8. Failure keeps the new container/journal and existing budget holds for diagnosis. Never stop/restart/delete the old container, clear pending costs, bypass disabled startup or invent successful answers. Any subsequent cleanup/restart needs its exact operator scope.

## Candidate interface

Local harmless plan: bash scripts/qa-agent-deploy/sidecar.sh plan <full-reviewed-SHA>.

On the approved host only: preflight or status with the same SHA. Start additionally requires a private operator window receipt; absent receipt refuses before host/Docker operations. The script contains no SQL toggles, replacement/stop/delete actions, published port, restart policy, env-file or secret values. It preserves original VERCEL_ENV refusal and original file-mode startup checks.

Receipt closed fields: schemaVersion=qaw005-sidecar-window/1, action=start-additional-qa-worker, sourceSha, immutable imageId, profileSha256, exact allowed endpoint, operatorEvidence, actual disabledObservedAt, expiresAt. The two timestamps must stay within a five-minute window; secret values are forbidden.

## Actual checks

PASS: bash syntax, Node syntax, offline plan for full SHA, default start without receipt refused before host operations. UNRUN: Linux host metadata preflight, real profile/receipt validation, Docker candidate startup/heartbeat, global disable/restore window, source image build and real provider acceptance. No synthetic test is reported as host acceptance.

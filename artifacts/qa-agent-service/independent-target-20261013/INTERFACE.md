# Independent QA service interface

Accepted specification: docs/contracts/qa-independent-target.md. Base 8b5975e48e850d0cbb1bf6f8ef7c4b0c9ff6b888.
This source package provisions no project, key, policy, budget or runtime activation.

## Web

Operator env VISEPANDA_QA_SUPABASE_PROJECT_REF: exactly twenty lowercase alphanumeric
characters, except dzqdzetcctkhbrhlxxgn. NEXT_PUBLIC_SUPABASE_URL must be exactly
https://<ref>.supabase.co (no trailing slash, port, credentials, query or fragment).
Existing QA-origin, cookie, actor, request/body guards remain. Missing or mismatched
binding is unavailable; no shared-project fallback. Explicit loopback-only local
fixtures retain their old path outside deployed Vercel environments. Production
configuration and native boundaries are unchanged.

## Hosted profile, job and composition

- vpj07-hosted-text-worker/4: exact previous QA fields plus mandatory projectRef;
  modes=[qa_session_history_v1], planning=null. Legacy /3 may be parsed for historical
  evidence but cannot execute. S1 /1 and planning /2 preserve their existing target.
- qa-agent-worker/2: projectRef + exact databaseUrl, alongside original owner/policy,
  budget, provider and pricing. Local-only fixtures can explicitly use projectRef:null
  and a loopback target. Remote QA must use the nonshared independent binding.
- readIndependentQaTarget(ref), exported from lib/server/qa-agent/target.ts, returns
  frozen {kind:independent,projectRef,databaseUrl} or null. Syntax is not readiness.
- parseHostedWorkerProfile(profile) validates /4; getHostedWorkerDatabaseTarget(profile)
  returns its expected URL for the nonsecret package validator. /3 getter refuses.
- Actual createHostedTextWorker(profile, dependencies) additionally requires
  dependencies.qaProjectRef equal to /4.projectRef. It independently binds heartbeat,
  status, discovery and each job to that target.
- createQaWorker(job, dependencies, compositionTarget) validates the job projectRef
  AND databaseUrl against the separately supplied root. Another valid job URL/ref,
  missing root, shared ref or old job /1 cannot authorize execution.

The original canonical job digest/private usage journal now includes version /2 and
its target. The read-only auditor derives the expected job from the trusted /4
profile and rejects cross-project jobs/hashes/receipts. Historical /3 audit remains
read-only; it is not a worker fallback. No provider outcome, Session, reconciliation,
consent, model choice, attempt identity, settlement or TripProposal rule is expanded.

## CLI and credentials

run-hosted-text-worker.mjs validates profile/root before credential access. For /4,
VISEPANDA_QA_SUPABASE_PROJECT_REF must match profile; SECRET_MODE must be files and
original DB/QWEN env-key fallback is refused. It then calls the unchanged
readHostedWorkerSecrets on the new container's fixed private tmpfs db.key/qwen.key.

Package /2 owns host preflight and mounts: only newly approved
/run/vp-worker-secrets/qa-<ref>/db.key and existing readonly
/run/vp-worker-secrets/qwen.key are bound to the new container fixed slots. The
original host db.key must not be mounted, read, copied or overwritten for new QA.
Source code here creates no credential directory/file or mount. Original tmpfs,
uid/gid/mode/link/symlink safeguards and disabled-first-heartbeat remain intact.
Validator runs in the reviewed worker image without credential mounts. No host Node
installation or actual ECS/provider/target SQL operation follows from this source.

# Vercel maintenance preparation — read-only

Base1cbab642d2b2db64fd8827b2ca95d3821623ab78; isolated worktree. Related to #189.
No original33 manifest, runtime or shared handoff changes.

Observed through existing Vercel CLI59.15.1 authentication, filtering raw responses inside the
subprocess before returning selected fields. Eight variable metadata rows, no branch/custom
environment overrides. Only the three NEXT_PUBLIC_SUPABASE_URL values were decrypted, all
pointing to the selected Staging. No env pull/run or private key/value retrieval occurred.

Current production and preview target metadata plus public /auth/sign-in JS from two named
current/recent deployments confirm the Staging binding. No sign-in or product API mutation was
performed. Latest metadata is in metadata.json; this is not exhaustive historical env inventory.
The plan consequently denies all project hosts, not just the inspected samples.

WAF config read succeeded via the collection endpoint. Initial /config/active returned not found
because no active configuration exists, not a Vercel access outage. CLI status reports false,
0 rules,0 bypass,0 drafts. The collection response has no ETag, active/draft null and no versions.
No documented If-Match/CAS support is claimed; exclusive config/alias ownership and repeated
version/fingerprint checks are necessary. They are not an atomic compare-and-swap guarantee.

The deny and disabled-rollback payloads were checked offline against the current official PUT
request schema. PUT may affect active configuration and is treated as a live change in the plan;
a draft response is never assumed effective. Exact-version activation requires a fresh content
check. No WAF mutation, env update, redeploy, pause, provider call or DB action was exercised.

The recovery plan keeps old hosts denied after DB28 and checks alias→deployment→commit/config
immediately before allowing stable hosts. Direct Supabase/SQL/local/worker and in-flight writes
remain outside WAF enforcement; the runbook explicitly requires caller coordination and never
claims database silence from edge403s. Real WAF probes, v2 rollout and temporary account tests
remain UNRUN until the final named authorization.

Validation: collector JavaScript syntax, JSON/schema checks, local Markdown links and docs:check/
diffcheck. Existing required CI and exact-HEAD independent review remain separate merge gates.

# QAWEB-DEPLOY #683 resource evidence

Owner: deployment chat 01a13387-0e68-7300-9608-85aba0f18aba, sole writer of QA Vercel domain/config/deploy resource. Main owns integration source.

## PASS: domain added and read back

2026-10-13 official CLI 59.20.0, authenticated jtcao515, explicit project prj_XwsjEc8YnYNeDVAqBrcdmbJXEqA2 / team team_vLT8SL2mQJJSnXbD9GzVLP4K. MCP list/add same selectors returned 404 not_found; documented official CLI fallback used the same endpoint/method/team. No account or team substitution.

qatesting.go2china.space is assigned to codex/qaw005-main-20261013, not production. Domain readback verified=true. Existing testing/staging/apex/www/default project domains retain original branch assignments.

Actual post-add configuration returned:

- CNAME host: qatesting (full name qatesting.go2china.space).
- Rank-1 target: a37b0a5f0814fb3a.vercel-dns-016.com.
- Nameservers: launch1.spaceship.net, launch2.spaceship.net.
- No TXT ownership challenge returned; verified=true.
- Initial DNS misconfigured=true, no current CNAME/A values. Follow-up actual CNAME DNS read and Vercel configuration now show misconfigured=false with rank-1 target. No DNS write was made by this writer; DNS belongs to JT.

Full allowlisted metadata is in resource-readback.json. No secret values are recorded. No protection settings, nameservers, DNS, existing aliases, billing, native/data permissions or production records changed.

## Limits and next action

- Deployment SHA: UNRUN; Main has not provided a reviewed ready P0 integration pin.
- Actual QA preview URL: UNRUN; exact branch list returned no deployments.
- HTTPS/login/Session persistence/provider/multi-turn acceptance: UNRUN pending source and authorized configuration.
- QA branch env readiness: generic preview has Supabase public config and Qwen endpoint; QA branch overrides/provider policy/budget readiness not established. Production secrets are not copied.
- Observed backend working config accepts only custom QA hostname, preventing pre-DNS preview use. Shared config candidate belongs to Main/backend owner; gap reported to Main.
- snapshot.py: read-only official CLI API, bounded response, live scope checks, allowlisted metadata only.
- pin.py: read-only verifies full reviewed SHA, clean source, matching remote branch, QA source paths and live scope. Creates Git-source preview request with exact SHA; no deployment mutation. Baseline daa7bae44a660381fb3295d0d2afc327ea98d3ba correctly rejected as missing QA product paths.
- Python AST syntax check: PASS for both scripts. git diff --check: PASS.

Deployment request schema checked against official https://openapi.vercel.sh and https://vercel.com/docs/rest-api/deployments/create-a-new-deployment. Use Vercel MCP first, its documented exact-endpoint fallback only if the same 404 persists; inspect deployment SHA/target/state before claiming delivery. Preparation is not provider or target PASS.

Follow-up HTTPS probe: FAIL from this local network (curl TLS SSL_ERROR_SYSCALL; local A lookup returned 198.18.0.68). This is not a target application result; no network/proxy change or security bypass attempted. Source deployment remains UNRUN. Documentation baseline check PASS.

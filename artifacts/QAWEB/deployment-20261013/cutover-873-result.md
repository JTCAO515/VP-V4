# QA branch cutover to reviewed source 8731c54

Main supplied the exact873 fixed-head review and complete applicable CI cutover gate at 2026-10-14T05:30Z. Preflight rechecked remote SHA, immutable source candidate, original project/team and root configuration, old QA domain branch, current environment scope, and the existing exact873 READY automatic Git deployment. No new deployment was created.

One normal official Vercel API PATCH changed only `qatesting.go2china.space` gitBranch from `codex/qaw005-main-20261013` to `codex/qaw005-independent-target-20261013`, at 2026-10-14T05:31:49Z (13:31:49 CST). The live OpenAPI updateProjectDomain schema supports the single gitBranch body field; no corresponding MCP mutation tool is exposed, so the official CLI API was used directly for this action. It was not a fallback for a rejected domain action. The request succeeded once; no retry was made. Independent GET confirmed the new branch and verified=true.

Project/root/build configuration, all environment scope metadata, and all five other project-domain objects matched preflight exactly. CNAME remains `a37b0a5f0814fb3a.vercel-dns-016.com.`. No DNS/WAF/other domain/production/flags/budget/ECS/key/policy/database action was taken. QA enable remains absent in the applicable validated QA inventory. Provider budget/runtime readiness remains UNRUN; nothing was activated by this task.

The deployment's alias list did not list the QA hostname. Therefore the QA hostname itself was independently queried through the read-only deployment endpoint, which resolved to `dpl_GxZbDEZqXMwTrtqZzGWrPVv18Hgh`, same project/team, READY, exact873 source and independent-target branch. MCP GET404 was followed only by its documented same endpoint/team read-only CLI GET. This reconciles the hostname with the expected build without an alias mutation.

Only ordinary anonymous HTTPS requests to the authorized QA hostname were used. `/qa/demo` returned200 and publicly labels itself Sample, synthetic fixtures, not connected to a real Agent, no model selection/fees/real tasks. `/qa` returned200 with server-rendered public text “Agent QA | VisePanda Loading…”. `/` returned307 Location `/qa`. Unparsed HTML words such as FORBIDDEN also occur in200 responses and are not access-denial verdicts. HTTP proof stores status, selected safe headers, hashes and public visible text, not raw HTML or private data.

This establishes domain binding, exact-source hostname resolution and anonymous public delivery. Sample browser interaction, authenticated login/session/provider multi-round acceptance, worker readiness, shared restore and conditional E remain UNRUN. Main owns the next sample browser verification. Manual create-Preview403 remains preserved; no equivalent create retry, temporary link, bypass, alternate hostname or identity was used.

Evidence: `cutover-873-preflight.json`, `cutover-873-patch-body.json`, `cutover-873-patch-result.json`, `cutover-873-readback.json`, `cutover-873-http.json`.

# Automatic sample Preview readback

Read-only verification requested by Main. Deployment `dpl_6X6tjWSmeLhb2qCBXtmQTxN1bLtc` is READY, target null (Preview), project `prj_XwsjEc8YnYNeDVAqBrcdmbJXEqA2`, owner/team `team_vLT8SL2mQJJSnXbD9GzVLP4K`. Git source is exactly `5267889ab11c42a7a8da2a6e92f10b0d14aa367e` on `codex/vpv4-modular-implementation-20261014`. Returned immutable URL is `vp-v4-bvmnko5uy-jtcao515s-projects.vercel.app`; it was not used as an alternate access route.

MCP lookups by the supplied dashboard ID and hostname returned 404. The documented same-endpoint, same-team CLI GET fallback by hostname succeeded; no mutation, identity change or permission-denial fallback occurred. Whitelisted metadata is in `sample-preview-5267889-metadata.json`.

The two newly created plain QA variables bind only `codex/qaw005-independent-target-20261013`, so those branch-specific overrides do not apply to the sample branch. This finding is scoped to those two entries; no secret value was read and no claim is made about all effective runtime variables. This automatic sample build is not the fresh QA build or a QA runtime PASS.

Ordinary anonymous GET of Main's specified branch URL returned HTTP 403, text/plain, body marker FORBIDDEN; Vercel request ID `sin1::brkql-1791953893932-64ca0a56f245`. The response did not expose a rule-specific reason, so it does not establish which WAF/protection rule rejected the request. No temporary authenticated link, bypass, alternate route or new access grant was requested. HTTP proof is in `sample-preview-5267889-http.json`.

Original final QA source pin remains `037486da3ec9a8ab61c72936fa94892961983f87`. Manual create-Preview 403 remains stopped; QA domain, WAF, environment variables, permissions, flags and key scopes were not changed. Worker readiness and real QA Auth/Session/provider multi-round acceptance remain UNRUN.

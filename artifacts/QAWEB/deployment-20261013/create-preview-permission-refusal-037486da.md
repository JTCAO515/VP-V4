# Exact-SHA QA deployment permission refusal

Main approved baseline `037486da3ec9a8ab61c72936fa94892961983f87` on `codex/qaw005-independent-target-20261013`. Exact source CI is 17/17 PASS; its tree equals accepted `eba6ea343cb2764e791f56bf24ccfbe454f91045`. The two branch-only plain QA Ref/Origin settings were created and read back; the original 50 configuration entries were unchanged.

Vercel `POST /v13/deployments` returned explicit `403 forbidden`: “You don't have permission to create a Preview Deployment for this Vercel project: vp-v4.” Request ID: `sin1:sfo1::28ktf-1791952626558-f62c04d4ac4f`. The exact request and boundary are recorded in the adjacent JSON. No fresh build was created after the configuration change. The previous automatic Preview cannot establish validation of the new configuration.

`qatesting.go2china.space` retains `codex/qaw005-main-20261013`. No domain switch, equivalent CLI mutation retry, identity change, DNS/WAF change, or provider enablement followed the refusal. Worker readiness and real authenticated Session/provider multi-round acceptance remain UNRUN.

Main was notified through the existing authorized chat. Resume requires official deployment permission restoration or fresh exact-SHA evidence from an authorized holder. Once available, continue the existing approved QA flow without another routine confirmation.

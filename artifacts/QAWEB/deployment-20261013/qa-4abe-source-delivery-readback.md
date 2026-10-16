# QA exact4abe source delivery — already satisfied by automatic deployment

At 2026-10-16T05:45:25Z (13:45:25 CST), existing official CLI59.20.0 identity `jtcao515` read the original known project/domain/deployment. The requested source was already delivered through the normal automatic Git Preview path; no new deployment or alias mutation was necessary.

`qatesting.go2china.space` independently resolves through both alias and deployment getters to **dpl_4Ebnjqu1WT8nztkGxKNCN2x9DnAo**, READY, Preview target=null, source **4abeeb41e87f2ac36f0efdb9ba94780ce0049a13**, original QA branch/project/team. Domain is verified and still bound to the original independent-target QA branch. No unmerged732/newer unrelated source was selected. Main's exact12→QA4abe review/CI and identical-tree mapping remains the source acceptance evidence.

MCP exact alias getter returned404; the documented same GET endpoint with explicit original project/team via existing CLI succeeded. No403 deployment-list/create operation was retried, no alias assignment API was called, no identity/credentials/protection changed. Getter output about unrelated latest deployment metadata was not used as a target or acceptance input.

Applicable branch-only plain QA Ref/Origin remain present and exactly matching; QA enable remains absent. No policy/context/scope/key/limit/env mutation occurred. Prior deployment **dpl_F9GFMNCULZ6ydNLSyf9bQbVZz85K** at5e960e6d is retained as the rollback pointer from the earlier direct readback; no rollback was executed.

Ordinary anonymous requests, without browser cookies or user Session, returned: root307 Location/qa; /qa200; /qa/demo200 with synthetic marker; /auth/sign-in?returnTo=%2Fqa200. A generic hidden-returnTo-input probe was inapplicable: exact source passes sanitized returnTo as a React prop to the client form/router, with no such hidden input. It is not an observed login failure, nor proof of successful authenticated return navigation. No form was submitted.

Sessions and policy GETs still returned503 `PROVIDER_UNAVAILABLE`, `ack:not_submitted`, versionqa-agent/1. This is the preserved disabled/configuration boundary, not a successful real answer or new authentication failure. It is not repaired by enabling flags without the remaining target/runtime/policy/actor/budget gates.

Actual result: PASS exact-source Preview/alias/public page delivery; zero resource mutations. Real login, original Session return, provider answer, persistence and multi-round behavior remain UNRUN. Existing user Chrome cookies/Sessions, ECS, DB, worker, heartbeat, claim, provider, TF, Production/otheraliases/DNS/WAF were untouched. This bounded source-publication task is complete and stops here. Machine evidence: `qa-4abe-source-delivery-readback.json`.

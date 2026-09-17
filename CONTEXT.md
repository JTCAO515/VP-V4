# Context

Generated from [docs/handoff.json](docs/handoff.json). Full decisions, blockers and evidence: [HANDOFF.md](HANDOFF.md).
This entry is a navigation summary, not a grant of authority or a capability acceptance report. Historical records never override the current user request.

Program: [VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · Source updated: 2026-09-17

目标：交付中英原生iOS的一站式陪伴Journey Agent，全程Trip、知识、现场能力、IAP、运营、用户交付和可维护系统；以VPJ-00#187统筹。

阶段：S2 #359 bounded model statement proposals, preserving manual review and source qualification; VPJ-76 (#360) agentic search structurally built, tuning follow-ups in progress. No non-C0 egress or automatic publication.

## 源记录状态（执行前核对 GitHub）

2026-09-17 (round 21): user re-scoped this thread to VPJ-75 (#359) and VPJ-76 (#360) only, in a dedicated worktree (../vp-v4-work-round21, branch feat/vpj-76-360-tuned-max-rounds-20260917) to avoid conflicting with other parallel sessions on main. #359 was evaluated first: every remaining named gap (real model calls against safety-materials fixtures, true multi-source synthesis, real RMB cost reconciliation, Docling) needs either real provider credentials not present in this sandbox or is out of scope (Docling REJECT stands) -- no bounded, credential-free next step found. Moved to #360 (VPJ-76): its own round-20 unrun.md already recorded three concrete, JT-delegated follow-ups from the 2026-09-16 real-model pass, none started. Picked (a): tune maxRounds relative to a question's required-claim count. New pure function tunedMaxRounds in lib/server/knowledge/wiki/grounded-search.ts raises the round-budget floor to requiredClaimCount+1 (capped at wiki-search-job.ts's own hard bound of 6), applied internally to runGroundedWikiSearch so every existing caller (Web/iOS production routes, both real-model eval scripts) inherits it without its own edit; never lowers a caller's request; place questions and every single-claim question are unaffected under today's callers' flat maxRounds: 2; seven multi-claim questions get a higher real round budget. Verified end to end against the real (non-mocked) runGroundedWikiSearch/runWikiSearchJob code path with a scripted always-search transport: a 4-claim question (payment_getting_started) now gets 5 real model-call attempts before budget_exhausted, up from 2; a 1-claim question is provably unchanged. Full TS contract suite 553/553 (550 baseline + 3 new); frozen eval (fixture mode) still 34/34 PASS with numerically unchanged coverage/over-refusal metrics (its one budget_exhausted scenario is a place question, requiredClaimCount 0, untouched). Zero migrations, zero RPC changes, zero caller-file edits -- see artifacts/VPJ-76/tuned-max-rounds-20260917/verification.md. Whether this actually raises real-model accuracy remains unverified (needs a real GLM re-run, not separately authorized this round) -- named honestly as an open gap, not assumed.

## 下一动作

Finish this PR's CI and evidence; do not merge and do not act on any issue's open/resolved state (user's own standing rule). On the next #360 round, the two other 2026-09-16 follow-ups remain open and un-started: (b) name a specific place in the place-fixture corpus text so the place-question retrieval_miss gap can be re-diagnosed (needs a real model re-run); (c) log raw model responses on MODEL_OUTPUT_INVALID for diagnosability (touches the shared provider-protocol.ts used by every model-gateway task, not just wiki_search_v1 -- scope it carefully, do not fold into an unrelated change). #359's remaining gaps (real model calls, multi-source synthesis, RMB reconciliation, Docling) still all need either real provider credentials this sandbox does not have or are out of scope -- re-check for a live credential before assuming that is still true.

## 开工入口

- [docs/agents/development-workflow.md](docs/agents/development-workflow.md)
- [docs/program/2026-09-05/README.md](docs/program/2026-09-05/README.md)
- [当前决定与授权边界](HANDOFF.md#当前决定)；行动前核对当前任务和已有授权，不从历史验证推导新权限。
- [未决与运行证据](HANDOFF.md#未决与运行证据)；完整 blockers / UNRUN 在此保留，不因摘要省略而视为通过。
- [验证记录](HANDOFF.md#验证) · [回滚与观察](HANDOFF.md#下一动作与回滚)。

# Context

Generated from [docs/handoff.json](docs/handoff.json). Full decisions, blockers and evidence: [HANDOFF.md](HANDOFF.md).
This entry is a navigation summary, not a grant of authority or a capability acceptance report. Historical records never override the current user request.

Program: [VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · Source updated: 2026-09-17

目标：交付中英原生iOS的一站式陪伴Journey Agent，全程Trip、知识、现场能力、IAP、运营、用户交付和可维护系统；以VPJ-00#187统筹。

阶段：S2 #359 bounded model statement proposals, preserving manual review and source qualification. No non-C0 egress or automatic publication.

## 源记录状态（执行前核对 GitHub）

2026-09-17 (round 18): standing #359 resume authorization (recorded 2026-09-16, round 15) continues to apply; JT's per-round scope constraint is satisfied by this round's own bounded, verifiable slice. PR #434 (round 17's withdrawal-status read-model + UI wiring) merged to main at 8f3f8ce. This round filled the remaining named gap: docs/contracts/wiki-source-withdrawal.md, docs/contracts/wiki-source-withdrawal-status-ui.md and the prior round's own nextAction all named the same thing -- "No withdrawal action in /ops/wiki. An operator still cannot click a button in this UI to withdraw a source." No new migration, no new RPC: ops_source_revision_withdraw_v1 already existed (round 16). lib/server/knowledge/wiki/http-wiki.ts's handleWikiRequest now also accepts POST (GET byte-for-byte unchanged, re-verified by rerunning the pre-existing GET contract tests unmodified); app/api/ops/wiki/route.ts gains a POST export with the same isSameOriginMutation guard /api/ops/review already uses; app/ops/wiki/workspace.tsx gains a two-step, explicit-reason SourceWithdrawForm (not a native confirm() dialog, matching the existing revoke_statement idiom in app/ops/review/workspace.tsx). Verified against a real native-PostgreSQL round trip through the actual handleWikiRequest handler (non-same-origin and real-outsider POST rejection, real author POST mutating the real row, and a real GET-after-POST proving the write and read paths compose) and a real browser click-through via the existing VP_WIKI_BROWSER_FIXTURE=1 fixture (toggle button -> reason form -> confirm -> real DB write -> the round-17 advisory note now rendering from a real click, in both zh and en) -- see artifacts/VPJ-75/wiki-source-withdrawal-action-20260917/verification.md and docs/contracts/wiki-source-withdrawal-action-ui.md. This PR is open pending CI; do not merge without explicit authorization.

## 下一动作

Finish this PR's CI and evidence. On the next round, refresh live main/PR/issue state and continue from the gaps recorded in artifacts/VPJ-75/unrun.md: cascading revocation of an already-created wiki_page_revisions row whose cited source is withdrawn later; automated scanning/notification of newly-withdrawn sources; real model calls against the safety-materials fixtures; true multi-source page synthesis (combining several sources into one narrative, not just evidence binding); real per-call RMB cost reconciliation; Docling integration. The write-path /ops/wiki withdrawal action named in the prior round's nextAction is now DONE (this round) -- do not redo it.

## 开工入口

- [docs/agents/development-workflow.md](docs/agents/development-workflow.md)
- [docs/program/2026-09-05/README.md](docs/program/2026-09-05/README.md)
- [当前决定与授权边界](HANDOFF.md#当前决定)；行动前核对当前任务和已有授权，不从历史验证推导新权限。
- [未决与运行证据](HANDOFF.md#未决与运行证据)；完整 blockers / UNRUN 在此保留，不因摘要省略而视为通过。
- [验证记录](HANDOFF.md#验证) · [回滚与观察](HANDOFF.md#下一动作与回滚)。

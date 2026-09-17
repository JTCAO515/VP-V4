# Context

Generated from [docs/handoff.json](docs/handoff.json). Full decisions, blockers and evidence: [HANDOFF.md](HANDOFF.md).
This entry is a navigation summary, not a grant of authority or a capability acceptance report. Historical records never override the current user request.

Program: [VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · Source updated: 2026-09-17

目标：交付中英原生iOS的一站式陪伴Journey Agent，全程Trip、知识、现场能力、IAP、运营、用户交付和可维护系统；以VPJ-00#187统筹。

阶段：S2 #359 bounded model statement proposals, preserving manual review and source qualification. No non-C0 egress or automatic publication.

## 源记录状态（执行前核对 GitHub）

2026-09-17 (round 19): standing #359 resume authorization (recorded 2026-09-16, round 15) continues to apply. PR #436 (round 18's withdraw-source write action) merged to main at 48bd734. This round filled the next named gap from artifacts/VPJ-75/unrun.md's own nextAction: "cascading revocation of an already-created wiki_page_revisions row whose cited source is withdrawn later" -- read as MARKING only (not hiding/auto-retracting), matching every prior withdrawal slice's boundary. Zero new migration, zero new RPC: lib/server/knowledge/wiki/read-model.ts gains a pure function citedWithdrawnSources(sources) that filters an already-fetched revision's sources[] (a field ops_wiki_read_v1 has returned since round 17) down to the ones whose withdrawnAt is non-null -- the same idiom this codebase already uses for detectProposalConflicts/conflictsByProposal. app/ops/wiki/workspace.tsx renders a bilingual role="alert" line directly under each rendered revision's header (current and previous) when it cites at least one withdrawn source, visible without expanding the existing collapsed "Sources and original location" details block where the prior round's per-source note still lives unchanged. Verified against a real native-PostgreSQL round trip (a fresh two-source revision; withdrawing only one of the two sources; asserting the flag names exactly that one source and the revision's own persisted fields -- version/draftContent/validationStatus -- are byte-identical before and after) and a real browser click-through via the existing VP_WIKI_BROWSER_FIXTURE=1 fixture (the badge renders correctly in zh and en, is absent on a page whose source was never withdrawn, and every existing action -- prepare/edit a statement, withdraw the other source -- remains available next to it) -- see artifacts/VPJ-75/wiki-source-withdrawal-revision-flag-20260917/verification.md and docs/contracts/wiki-source-withdrawal-revision-flag.md. This PR is open pending CI; do not merge without explicit authorization.

## 下一动作

Finish this PR's CI and evidence. On the next round, refresh live main/PR/issue state and continue from the gaps recorded in artifacts/VPJ-75/unrun.md: automated scanning/notification of newly-withdrawn sources against pages an operator is not currently viewing; real model calls against the safety-materials fixtures; true multi-source page synthesis (combining several sources into one narrative, not just evidence binding); real per-call RMB cost reconciliation; Docling integration. The revision-level withdrawn-source flag named in the prior round's nextAction is now DONE (this round) -- do not redo it.

## 开工入口

- [docs/agents/development-workflow.md](docs/agents/development-workflow.md)
- [docs/program/2026-09-05/README.md](docs/program/2026-09-05/README.md)
- [当前决定与授权边界](HANDOFF.md#当前决定)；行动前核对当前任务和已有授权，不从历史验证推导新权限。
- [未决与运行证据](HANDOFF.md#未决与运行证据)；完整 blockers / UNRUN 在此保留，不因摘要省略而视为通过。
- [验证记录](HANDOFF.md#验证) · [回滚与观察](HANDOFF.md#下一动作与回滚)。

# Context

Generated from [docs/handoff.json](docs/handoff.json). Full decisions, blockers and evidence: [HANDOFF.md](HANDOFF.md).
This entry is a navigation summary, not a grant of authority or a capability acceptance report. Historical records never override the current user request.

Program: [VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · Source updated: 2026-09-17

目标：交付中英原生iOS的一站式陪伴Journey Agent，全程Trip、知识、现场能力、IAP、运营、用户交付和可维护系统；以VPJ-00#187统筹。

阶段：S2 #359 bounded model statement proposals, preserving manual review and source qualification. No non-C0 egress or automatic publication.

## 源记录状态（执行前核对 GitHub）

2026-09-17 (round 20): standing #359 resume authorization (recorded 2026-09-16, round 15) continues to apply. PR #437 (round 19's revision-level withdrawn-source flag) merged to main at 7758d01. This round filled the remaining named gap from docs/contracts/wiki-source-withdrawal.md's own "What this does not do": "No automated scan. Nothing periodically checks in-flight running jobs against newly-withdrawn sources." New migration 20260917110000: an additive nullable column wiki_generation_jobs.source_revision_ids, recorded only at claim() time (every existing check/branch/statement in ops_wiki_generation_v1 is byte-for-byte unchanged except the two new assignments, each marked -- NEW), plus a new read-only RPC ops_wiki_withdrawal_scan_v1 that scans ALL pages' current/previous revisions and ALL queued/running jobs for one citing a withdrawn source -- not just the one page an operator happens to be viewing. GET /api/ops/wiki?scan=withdrawn wires it in; /ops/wiki's landing view now shows a bilingual advisory panel listing every affected page and stuck job, independent of and never blocking the existing page lookup/list. Read-only throughout: nothing is cancelled, hidden or retroactively invalidated. Verified against a real native PostgreSQL 16 round trip (35/35 pass, 30 baseline + 5 new: migration rollback, claim() additive recording incl. a real reclaim/retry, a real cross-page/cross-job scan against control fixtures that must never appear, outsider/malformed rejection, and the real HTTP GET path) -- see artifacts/VPJ-75/wiki-withdrawal-scan-20260917/verification.md.

## 下一动作

Finish this PR's CI and evidence. On the next round, refresh live main/PR/issue state and continue from the gaps recorded in artifacts/VPJ-75/unrun.md: real model calls against the safety-materials fixtures; true multi-source page synthesis (combining several sources into one narrative, not just evidence binding); real per-call RMB cost reconciliation; Docling integration; and, if still valuable, a periodic/scheduled trigger for ops_wiki_withdrawal_scan_v1 beyond the /ops/wiki landing-view poll this round added (e.g. a notification/webhook, which needs real delivery infrastructure this sandbox does not have). The automated all-pages/all-in-flight-jobs withdrawal scan named in the prior round's nextAction is now DONE (this round) -- do not redo it.

## 开工入口

- [docs/agents/development-workflow.md](docs/agents/development-workflow.md)
- [docs/program/2026-09-05/README.md](docs/program/2026-09-05/README.md)
- [当前决定与授权边界](HANDOFF.md#当前决定)；行动前核对当前任务和已有授权，不从历史验证推导新权限。
- [未决与运行证据](HANDOFF.md#未决与运行证据)；完整 blockers / UNRUN 在此保留，不因摘要省略而视为通过。
- [验证记录](HANDOFF.md#验证) · [回滚与观察](HANDOFF.md#下一动作与回滚)。

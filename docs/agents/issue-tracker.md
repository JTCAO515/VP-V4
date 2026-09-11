# Issue tracker: GitHub

Use [JTCAO515/VP-V4 Issues](https://github.com/JTCAO515/VP-V4/issues) through an authenticated
GitHub tool or `gh`. Current execution follows `development-workflow.md`.

- VPJ-00 #187 is the active product program. The manifest owns task identities, scope, acceptance
  and dependencies; live GitHub and environment observations establish execution state.
- Product Issues use their VPJ rows. Explicit maintenance uses a compact goal, scope, checks,
  acceptance and rollback brief; do not create a second program for a small fix.
- One PR has one coherent outcome. An Issue may have incremental PRs; tightly related fixes
  may share a PR with explicit mapping. Keep independent features separate.
- Use native dependencies plus portable textual links. Do not close parent runtime acceptance
  after fixture preparation. Use `Related to` on partial PRs and retain the unverified checklist.
- Available interfaces may support a scoped preparation PR while its parent remains blocked;
  record the scope and retained integration gate before editing. Do not assume unmerged behavior.
- Reconcile stale labels after inspecting baseline, native blockers, PRs, ownership and external
  conditions. Never remove a valid dependency merely to create ready work.
- `ready-for-agent` means the selected scope is actionable; operator-only steps use
  `ready-for-human`/`needs-info`. A blocked parent may have a separate ready preparation slice.
- Long sessions continue independent work after a PR/handoff. Record a genuinely non-delegable
  action once in `docs/operator-actions.json`, not at every status check.
- Future expand tasks require `activationEvidence` even after dependencies complete.

Full VPJ bodies are generated from `issue-plan.json`; do not replace them with title-only tasks.
The compact body keeps the user result, complete acceptance, blockers and task-specific red lines;
the linked execution row owns scope, commands, evidence, external prerequisites and rollback.
GitHub delivery milestones mirror `deliveryStage` in that same manifest. Use the current stage
to filter the queue; keep later-stage and evidence-triggered work outside the active work list.
Grouping or shortening a body never marks unfinished work complete, replaces Issue identities,
discards checked progress/comments, or removes native dependency edges.
Tracker migration modes are separate from ordinary development and retain their explicit authority.
External PRs are not a feature-request triage surface; collaborator PRs receive normal review.

`UNAUTHENTICATED`, `SAFETY_BLOCKED` and `DATA_POLICY_BLOCKED` remain runtime refusals,
not permission to use a guest actor, service credential or bypass.

## 定义、进度与同步

当前执行行/接口链接默认指向main；历史研究和验收证据保持固定commit。生成正文中的未勾选框是计划定义，不表示远端实际进度。普通`verify-remote`核任务身份、当前验收条款、原生依赖、parent和生命周期，允许实际勾选与追加证据；它不验证产品已运行。初始队列迁移保留严格快照规则。

`publish`、`sync-bodies`、`sync-selected`先对整批做正文预检，只同步能识别的生成前缀并保留勾选与尾部进度；未知漂移拒绝覆盖。预检后逐票写入前再读正文，出现并行修改即停止重读。GitHub没有跨Issue原子事务，先前已成功的安全更新仍需记录。

遇到历史正文/追加契约不能自动识别，先保存快照、核对最新main与live差异，再在已有授权内作可审查的局部更新；不要为了通过全文比较删除进度或重新跑全量队列迁移。未知漂移本身不是新增人工审批门，只有实质性未决目标/权限变化才需要相应决定。

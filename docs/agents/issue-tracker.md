# Issue tracker: GitHub

开发调度以 [2026-09-12接入规则](development-integration-policy.md)为准：供应商工单、法务或产品许可缺失不得单独维持blocked/ready-for-human。依赖保留真实技术缺口，完成状态仍按实测判断。

Use [JTCAO515/VP-V4 Issues](https://github.com/JTCAO515/VP-V4/issues) through an authenticated
GitHub tool or `gh`. Current execution follows `development-workflow.md`.

- VPJ-00 #187 is the active product program. The manifest owns task identities, scope, acceptance
  and dependencies; live GitHub and environment observations establish execution state.
- Product Issues use their VPJ rows. Explicit maintenance uses a compact goal, scope, checks,
  acceptance and rollback brief; do not create a second program for a small fix.
- One PR has one coherent outcome. An Issue may have incremental PRs; tightly related fixes
  may share a PR with explicit mapping. Keep independent features separate.
- Use native dependencies only for actual start blockers; keep integration/acceptance inputs as portable textual links. Do not close parent runtime acceptance
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
discards checked progress/comments. Reclassification requires an authorized, reasoned audit; retain every integration/acceptance input.
Tracker migration modes are separate from ordinary development and retain their explicit authority.
External PRs are not a feature-request triage surface; collaborator PRs receive normal review.

`UNAUTHENTICATED`, `SAFETY_BLOCKED` and `DATA_POLICY_BLOCKED` remain runtime refusals,
not permission to use a guest actor, service credential or bypass.

## 定义、进度与同步

当前执行行/接口链接默认指向main；历史研究和验收证据保持固定commit。生成正文中的未勾选框是计划定义，不表示远端实际进度。普通`verify-remote`核任务身份、当前验收条款、原生依赖、parent和生命周期，允许实际勾选与追加证据；它不验证产品已运行。初始队列迁移保留严格快照规则。

`publish`、`sync-bodies`、`sync-selected`先对整批做正文预检，只同步能识别的生成前缀并保留勾选与尾部进度；未知漂移拒绝覆盖。预检后逐票写入前再读正文，出现并行修改即停止重读。GitHub没有跨Issue原子事务，先前已成功的安全更新仍需记录。

遇到历史正文/追加契约不能自动识别，先保存快照、核对最新main与live差异，再在已有授权内作可审查的局部更新；不要为了通过全文比较删除进度或重新跑全量队列迁移。未知漂移本身不是新增人工审批门，只有实质性未决目标/权限变化才需要相应决定。

## 2026-09-17 排期与有界执行

用户要求尽量不使用blocked。开放未开工任务默认`status:planned`；按executionBrief的首个切片核实际输入，不因上游未结票重复添加blocked或拆准备票。真实无可执行部分时才记录具体阻碍。标签调整不是运行验收。技术依赖分为开工硬依赖和集成/验收引用，均须保留可追溯定义。

父票、实施切片和整链验收不能因标题相似就互相替代：模型协议/业务链/配对评测，核心删除/全域删除/灾备，签名分发/Beta/正式发布分别有责任。优先归并重复条款、指向唯一owner；整票重复须有完整验收迁移和历史链接才按not_planned关闭，不伪装completed。

进度PR只写`Related to #编号`。不要在否定句中嵌入GitHub自动关闭关键词和Issue编号（如“does not”后跟关闭关键词）：GitHub仍可能自动关票。查“已合并”时同时核对base分支和main实际文件。

本轮明确排除VPJ-02/49/62/75/76；不得修改这些任务的定义、正文、标签、状态或依赖。该排除仅约束本轮整理，后续用户解除时按新范围执行。

## 原生 Blocked 与验收引用

`blockedBy` 只映射 GitHub 的原生 `blocked_by`；`acceptanceDependencies` 保存可并行推进任务的集成/最终验收输入，不创建 GitHub 阻塞关系。两类合并用于拓扑、阶段顺序与完整依赖检查；publish/sync 只能添加 blockedBy，不能把验收引用重新写成阻塞。

整票 OPEN 不等于接口不可用；移除原生关系不等于接口、环境、权限或验收已通过。真实无可推进部分时，记录缺少的具体输入和解除条件，再添加原生硬依赖。发布、商业观察及后续 expand 保留原授权/证据门。

2026-09-17 经用户确认复核原生关系，逐票处置见 [依赖复核](../program/2026-09-05/NATIVE-DEPENDENCY-AUDIT-2026-09-17.md)。涉及 VPJ-02/49/62/75/76 任一端的边保持原样；这部分图标可能继续显示，不能因此误报本轮失败或自动删边。

普通关联的上游仍开放或按not_planned关闭时，下游completed会触发completion-evidence-review；该结构核对既不自动关票，也不代替接口/验收证据。

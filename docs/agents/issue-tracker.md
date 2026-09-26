# Issue tracker: GitHub

Use [JTCAO515/VP-V4 Issues](https://github.com/JTCAO515/VP-V4/issues) through an authenticated
GitHub tool or `gh`. Work units and checks follow [`development-workflow.md`](development-workflow.md);
label semantics follow [`triage-labels.md`](triage-labels.md).

- VPJ-00 #187 is the active product program. `issue-plan.json` owns task identities, scope,
  acceptance and dependencies; live GitHub and environment observations establish execution state.
- Product Issues use their VPJ rows. Explicit maintenance uses a compact goal/scope/checks/
  acceptance/rollback brief — never a second program for a small fix.
- Use `Related to` on partial PRs and keep the unverified checklist. An available interface may
  support a scoped preparation PR while its parent stays open; record the retained integration gate.
- Future expand tasks require `activationEvidence` even after their dependencies complete.
- External PRs are not a feature-request triage surface; collaborator PRs get normal review.

`UNAUTHENTICATED`, `SAFETY_BLOCKED` and `DATA_POLICY_BLOCKED` are runtime refusals, not permission
to use a guest actor, a service credential or a bypass.

## 生成正文与同步

Full VPJ bodies are generated from `issue-plan.json`. The compact body keeps the user result,
complete acceptance, blockers and task-specific red lines; the linked execution row owns scope,
commands, evidence, external prerequisites and rollback. GitHub delivery milestones mirror
`deliveryStage` in the same manifest.

当前执行行/接口链接默认指向 main；历史研究和验收证据保持固定 commit。生成正文中的未勾选框是计划定义，
不表示远端实际进度。`verify-remote` 核任务身份、当前验收条款、原生依赖、parent 和生命周期，
允许实际勾选与追加证据；它不验证产品已运行。

`publish`、`sync-bodies`、`sync-selected` 先对整批做正文预检，只同步能识别的生成前缀并保留勾选与
尾部进度；未知漂移拒绝覆盖。预检后逐票写入前再读正文，出现并行修改即停止重读。GitHub 没有跨 Issue
原子事务，先前已成功的安全更新仍需记录。历史正文不能自动识别时，先保存快照、核对最新 main 与 live 差异，
再在已有授权内作可审查的局部更新；未知漂移本身不是新增人工审批门。

分组或精简正文不标记未完成工作为完成，不替换 Issue 身份，不丢弃勾选进度或评论。重分类需要有理由的审计，
并保留全部集成/验收输入。父票、实施切片和整链验收不因标题相似互相替代：模型协议/业务链/配对评测，
核心删除/全域删除/灾备，签名分发/Beta/正式发布各有责任。整票重复须有完整验收迁移和历史链接才按
`not_planned` 关闭，不伪装 completed。

进度 PR 只写 `Related to #编号`。不要在否定句中嵌入 GitHub 自动关闭关键词和 Issue 编号（如 “does not”
后跟关闭关键词）：GitHub 仍可能自动关票。查“已合并”时同时核对 base 分支和 main 实际文件。

## 原生 blocked 与验收引用

`blockedBy` 只映射 GitHub 原生 `blocked_by`（开工硬依赖）；`acceptanceDependencies` 保存可并行推进
任务的集成/最终验收输入，不创建 GitHub 阻塞关系。两类合并用于拓扑、阶段顺序与依赖检查；publish/sync
只能添加 blockedBy，不能把验收引用重写成阻塞。

整票 OPEN 不等于接口不可用；移除原生关系不等于接口、环境、权限或验收已通过。真实无可推进部分时，
记录缺少的具体输入和解除条件，再添加原生硬依赖。上游仍开放或按 `not_planned` 关闭时，下游 completed
会触发 completion-evidence-review；该结构核对既不自动关票，也不代替接口/验收证据。

2026-09-17 经用户确认复核原生关系，逐票处置见
[依赖复核](../program/2026-09-05/NATIVE-DEPENDENCY-AUDIT-2026-09-17.md)。

## 历史整理范围与本轮授权

2026-09-17整理曾冻结VPJ-02/49/62/75/76及其原生依赖。2026-09-27 JT明确授权本轮助手升级
重排仓库全部文档/ADR/Issue，包括既有任务的修改或删除，因此该整理排除不再阻止本轮规划。
仍按最小必要范围迁移，保留已完成证据、实际owner与尚未满足的验收，不默认重写所有票或删除历史。
本轮新入口：[assistant plan](../product/assistant-upgrade-2026-09-27/README.md)。

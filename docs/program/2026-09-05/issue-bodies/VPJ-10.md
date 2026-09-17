## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

选中一天或项目后与 VP 局部改稿。

## 执行边界与首个切片

- 首个可交付结果：在真实Trip选中一天或项目，提出局部改动并显示增删/移日、代价和保留项；确认后回到原位置且重载一致。
- 本票责任/非目标：负责局部提案/确认消费者；65提供测量依据，68验证少走路案例，29负责在途变化触发，均复用同一writer。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-10) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S3](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s3)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-09 #197](https://github.com/JTCAO515/VP-V4/issues/197)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] 选中范围→Ask→局部候选→影响/diff→确认→回到原位置；未选对象保持不动。
- [ ] 用户可直接移日/排序/改时，手动编辑与硬锁区别明确。
- [ ] 并发更新旧proposal不能提交；撤销Trip修改不能伪装取消外部订单。
- [ ] 负责已登录真实Trip的选区→Ask sheet→局部Proposal/diff→确认→回到原对象与位置→重载闭环；复用#188基础导航/样式/可访问性，拒绝或关闭sheet不得误确认，真实凭据/数据条件缺失保留未验收。
- [ ] 体验增量2026-09-17：局部改稿展示新增/移日/替换/移除及受影响时间与接驳，说明保留的已确认事项和备选去向；不只回复“已加入”。步行改善仅在#219同口径证据具备时声明，否则保留待核候选；diff、确认目标、返回选区和重载均绑定同一Trip版本，拒绝或旧版本无误写。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

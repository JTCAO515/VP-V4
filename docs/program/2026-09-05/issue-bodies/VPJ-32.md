## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

真人协助从请求到接单和结果回传。

## 执行边界与首个切片

- 首个可交付结果：在受控容量下完成一次请求→排队→接单/分派→外部等待→有证据结果的可见服务流程。
- 本票责任/非目标：负责服务运营与人工分钟；57负责申请授权，31负责Brief，不伪造接单、ETA或自动写Trip。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-32) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S4](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s4)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-21 #211](https://github.com/JTCAO515/VP-V4/issues/211)
- [VPJ-31 #223](https://github.com/JTCAO515/VP-V4/issues/223)
- [VPJ-57 #222](https://github.com/JTCAO515/VP-V4/issues/222)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] 请求→容量检查→queued/accepted/assigned→waiting_external→resolved/unresolved完整可见。
- [ ] 接单前不承诺ETA/SLA；紧急问题先给官方渠道，用户可退出/撤授权。
- [ ] 任务一条线接回Trip，结果不是自动Trip写入；人工分钟数和容量计量。
- [ ] 真人状态和文案统一：queued无虚构负责人/ETA，accepted后才按真实时段约定更新；提供教程、已联系服务方、外部实际解决分别有证据，不预设固定AI/人工比例。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

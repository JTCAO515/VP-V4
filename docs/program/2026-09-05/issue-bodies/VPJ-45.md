## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

客户收到产品后的观察、支持与发布关账。

## 执行边界与首个切片

- 首个可交付结果：在已交付版本执行72小时系统及7天机会相关观察，归档未解缺陷、支持/事故责任和产品发布结论。
- 本票责任/非目标：负责技术交付与支持关账；47负责付费/留存与服务经济性，不因尚未到旅行节点虚构观察结果。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-45) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S6](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s6)。

## 开工依赖（GitHub 原生关系）

- [VPJ-42 #242](https://github.com/JTCAO515/VP-V4/issues/242)
- [VPJ-44 #244](https://github.com/JTCAO515/VP-V4/issues/244)

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

无其他普通关联；上列真实开工依赖仍保留。

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] 至少72小时系统观察与7天机会相关用户跟踪；自助/人工帮助、拒绝/激活、sandbox/真实购买分开。
- [ ] 支持队列、退款/删除、事故回滚、知识失效有负责人和实测响应。
- [ ] 发布门全部关闭且未解决严重问题为0才结束Program产品交付；不以下载量作为完成。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：#171

## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 后续证据触发任务

## 用户结果

航班来源与中国航线对照（证据触发）。

## 执行边界与首个切片

- 首个可交付结果：保持expand门：对实际存在的中国航线需求，按同一字段/时效样本比较最少候选来源与账户能力。
- 本票责任/非目标：负责航班来源评估；52实现消费，现有官方交通出口可继续；不采购/出票/爬取受限系统。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-51) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 expand](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#expand)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)
- [VPJ-39 #232](https://github.com/JTCAO515/VP-V4/issues/232)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] 按中国境内/跨境航线样本比较coverage/延迟/许可/价格/归因/存储，不直接选择名气最大。
- [ ] agent记录字段来源/TTL和无coverage返回，按已有测试资金授权设置技术上限并实测，不等待额外产品或供应商许可。
- [ ] 不购买/出票/爬取受限系统。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

后续开启门：在VPJ-47记录需求/成本/责任证据，agent据此判断开发优先级；无需额外产品许可，未实测不能自动标为验收通过

替代历史责任：#41

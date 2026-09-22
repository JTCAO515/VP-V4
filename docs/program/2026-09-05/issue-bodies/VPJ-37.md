## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

运营看见质量、成本和故障并能停用能力。

## 执行边界与首个切片

- 首个可交付结果：W1：授权运营在质量/成本视图分辨answered、partial、失败、未观测及待核费用。 PR #501已合入main，复用聚合视图及受保护读接口；真实授权部署读取与实际成本验收仍未完成。
- 本票责任/非目标：负责运营可观测性和停止消费者；59提供账本、35提供商品额度，71执行最终演练；不重建第二账本。 2026-09-22已确认的实施顺序：W1 → W2；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [artifacts/VPJ-37/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-37/verification.md) · [artifacts/VPJ-37/unrun.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-37/unrun.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-37) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S5](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s5)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195)
- [VPJ-35 #227](https://github.com/JTCAO515/VP-V4/issues/227)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] task/attempt/provider/tool/actor-scope计数互相可对账，日志无原聊天和秘密。
- [ ] 仪表盘可读任务成功、partial、错误、延迟、provider费用和人工时间，不把未观测记0。
- [ ] 按能力/供应商/城市关闭可及时作用并提供用户替代；预算熔断可恢复且不删Trip。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：#163

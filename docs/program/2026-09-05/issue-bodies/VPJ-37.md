## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

运营看见质量、成本和故障并能停用能力。

## 执行边界与首个切片

- 首个可交付结果：基于已有budget-scope只读模型贯通一次实际attempt对账与能力停用/恢复，明确unknown费用。
- 本票责任/非目标：负责运营可观测性和停止消费者；59提供账本、35提供商品额度，71执行最终演练；不重建第二账本。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [artifacts/VPJ-37/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-37/verification.md) · [artifacts/VPJ-37/unrun.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-37/unrun.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-37) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S5](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s5)。

## 验收依赖（不自动转为 blocked）

- [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195)
- [VPJ-35 #227](https://github.com/JTCAO515/VP-V4/issues/227)

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

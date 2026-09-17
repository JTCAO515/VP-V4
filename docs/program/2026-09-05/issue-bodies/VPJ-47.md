## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

真实激活、付费与人工成本的经营观察。

## 执行边界与首个切片

- 首个可交付结果：对一个事前定义的有效旅客队列形成激活、机会回访、净付款/退款和人工成本观察，给出继续/调整/证据不足结论。
- 本票责任/非目标：负责B0–B4商业判读；45负责技术发布关账，sandbox和人工代办不能算自助付费成功。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-47) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S6](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s6)。

## 验收依赖（不自动转为 blocked）

- [VPJ-42 #242](https://github.com/JTCAO515/VP-V4/issues/242)
- [VPJ-44 #244](https://github.com/JTCAO515/VP-V4/issues/244)
- [VPJ-46 #246](https://github.com/JTCAO515/VP-V4/issues/246)

## Acceptance criteria

- [ ] activated=采用可继续使用的真实Trip结果；outcome_recorded可含拒绝，不能混为激活。
- [ ] opportunity-based organic/triggered/founder-prompted回访分开；真实净付款与退款/赠送/sandbox分开。
- [ ] 依据主报告单一B0-B4门和容量/现金止损决策，不以一个OR指标杀整个Program；少样本明确不确定。
- [ ] 经营指标以有机会的服务任务/Trip为分母，区分Free/Pass、人工辅助、真实支付与sandbox；保留必要澄清次数、任务成本及实际人工分钟，旧Ask数值不可当同等新服务容量。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

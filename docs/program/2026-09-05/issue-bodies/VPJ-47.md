## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

真实激活、付费与人工成本的经营观察。

## 当前基线与开发入口

原VPJ基线已合并；2026-09-10品牌增量以Q1-Q38报告的已确认方向为准，当前任务及新增规划契约需按合入main后的版本执行。已有可独立进行的准备范围继续；开发接入与可逆参数由agent按现有方向推进，无需第三方、法务或产品许可；真实收费与发布按相应范围验收。 开发阶段不等待供应商工单/书面答复、法务或产品许可；按开发接入规则用现有账号/API推进，未知项记录，保留用户同意和实际技术验证。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-47)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)。
验收阶段：[S6](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s6)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

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

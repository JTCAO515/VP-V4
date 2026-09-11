## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

首批旅程内容从来源登记到已审核可用。

## 当前基线与开发入口

原VPJ基线已合并；2026-09-10品牌增量以Q1-Q38报告的已确认方向为准，当前任务及新增规划契约需按合入main后的版本执行。已有可独立进行的准备范围继续；开发接入与可逆参数由agent按现有方向推进，无需第三方、法务或产品许可；真实收费与发布按相应范围验收。 开发阶段不等待供应商工单/书面答复、法务或产品许可；按开发接入规则用现有账号/API推进，未知项记录，保留用户同意和实际技术验证。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-15)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)。
验收阶段：[S2](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s2)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

- [VPJ-14 #204](https://github.com/JTCAO515/VP-V4/issues/204)

## Acceptance criteria

- [ ] 为Supported Journey Matrix选10–20条原子事实/流程，登记许可、locator、适用范围、版本与审者。
- [ ] 中英表达共享语言中立assertion；candidate/reviewed/published/eligible不可混同。
- [ ] 运营能提交/审查/撤销并在产品读到结果；没有内容授权则阻塞发布，不批量造810条。
- [ ] 首批内容按普通来华游客的城市/场景/必要claim/权利/时效/可用动作组织覆盖；优先支撑规划与变化后的下一步，未定城市名单不得写成已覆盖全国。
- [ ] HF复用：测试集与生产知识分别登记；外部数据记录发布者、准确repo/revision/原行ID、逐源许可及变更，公开/NC/混合来源不自动发布为旅游Fact；优先自有合成评测与已许可审核语料。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：#168

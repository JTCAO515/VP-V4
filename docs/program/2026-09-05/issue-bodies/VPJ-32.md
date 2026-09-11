## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

真人协助从请求到接单和结果回传。

## 当前基线与开发入口

原VPJ基线已合并；2026-09-10品牌增量以Q1-Q38报告的已确认方向为准，当前任务及新增规划契约需按合入main后的版本执行。已有可独立进行的准备范围继续；未决收费、数据许可和激活制不视为已批准，完整验收仍保留真实依赖。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-32)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)。
验收阶段：[S4](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s4)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

- [VPJ-21 #211](https://github.com/JTCAO515/VP-V4/issues/211)
- [VPJ-31 #223](https://github.com/JTCAO515/VP-V4/issues/223)
- [VPJ-57 #222](https://github.com/JTCAO515/VP-V4/issues/222)

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

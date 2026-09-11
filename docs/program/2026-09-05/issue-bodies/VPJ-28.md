## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

地点讲解与语音追问接回当前 Trip。

## 当前基线与开发入口

原VPJ基线已合并；2026-09-10品牌增量以Q1-Q38报告的已确认方向为准，当前任务及新增规划契约需按合入main后的版本执行。已有可独立进行的准备范围继续；未决收费、数据许可和激活制不视为已批准，完整验收仍保留真实依赖。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-28)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)。
验收阶段：[S4](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s4)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

- [VPJ-15 #205](https://github.com/JTCAO515/VP-V4/issues/205)
- [VPJ-19 #209](https://github.com/JTCAO515/VP-V4/issues/209)
- [VPJ-27 #217](https://github.com/JTCAO515/VP-V4/issues/217)

## Acceptance criteria

- [ ] 首批已覆盖地点提供短讲解、来源、事实/传说区别、字幕和暂停续播。
- [ ] 追问使用当前地点/兴趣/已听进度，角色仍VP；未覆盖地点给清楚边界与其他探索入口。
- [ ] 已缓存内容重播不再扣Ask，新增生成按明确额度；现场注意力优先。
- [ ] 讲解按已获准兴趣给简明、有来源、适用的内容；英文为原生表达，中文保持事实/否定一致，幽默可为零；与VPJ-29局部恢复保持职责区分。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

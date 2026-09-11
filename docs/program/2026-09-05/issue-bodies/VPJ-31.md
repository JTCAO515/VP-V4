## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

按服务任务授权的动态 Traveler Brief。

## 当前基线与开发入口

原VPJ基线已合并；2026-09-10品牌增量以Q1-Q38报告的已确认方向为准，当前任务及新增规划契约需按合入main后的版本执行。已有可独立进行的准备范围继续；未决收费、数据许可和激活制不视为已批准，完整验收仍保留真实依赖。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-31)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)。
验收阶段：[S4](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s4)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

- [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)
- [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199)
- [VPJ-12 #201](https://github.com/JTCAO515/VP-V4/issues/201)
- [VPJ-14 #204](https://github.com/JTCAO515/VP-V4/issues/204)
- [VPJ-57 #222](https://github.com/JTCAO515/VP-V4/issues/222)

## Acceptance criteria

- [ ] 用户给case授权后员工只看任务需要字段；Owner可审授权范围和审计，非普通全库读。
- [ ] 需求/预算/偏好/表达详细程度带来源、更新时刻和显式/推断标记；无敏感人格推定。
- [ ] 纠正/撤权/删除传播到报告和可控缓存；旧摘要不能压过最新用户输入。
- [ ] TravelerBrief只投影当前ServiceCase目的下获准的最小资料及偏好版本；不因基础记忆Free可用而开放人工读取全历史，撤回后未来访问与队列重新校验。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

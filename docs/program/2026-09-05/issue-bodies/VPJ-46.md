## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

每周35小时客户发现、招募与材料工作坊。

## 当前基线与开发入口

原VPJ基线已合并；2026-09-10品牌增量以Q1-Q38报告的已确认方向为准，当前任务及新增规划契约需按合入main后的版本执行。已有可独立进行的准备范围继续；开发接入与可逆参数由agent按现有方向推进，无需第三方、法务或产品许可；真实收费与发布按相应范围验收。 开发阶段不等待供应商工单/书面答复、法务或产品许可；按开发接入规则用现有账号/API推进，未知项记录，保留用户同意和实际技术验证。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-46)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)。
验收阶段：[S1](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s1)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

无其他任务依赖；仍需核对当前接口、环境与外部条件。

## Acceptance criteria

- [ ] 执行总35h时间盘：真实客户任务10、研发验收8、招募社区6、内容合作4、知识审查3、支持2、复盘2；30–40h按需求伸缩。
- [ ] 两个周sprint只跑自有/转介绍+一个社区+一个伙伴渠道；3–4访谈+1–2交付起步；禁止未请求群发。
- [ ] Planning/Arriving/In-trip队列、opt-in、原话/行为/来源/分钟数去敏记录；为Supported Journey Matrix提供真实需求。
- [ ] 初期使用许可内现有入口或VPJ-62 intake，不等待地图/支付/完整App；Founder-assisted与产品自助明确。
- [ ] 按规划/临近抵达/在途分别记录真实首值、重复问题与下一自然节点机会；Demo、创始人协助与自助真实能力分别统计，不从社媒触达推断已实现。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

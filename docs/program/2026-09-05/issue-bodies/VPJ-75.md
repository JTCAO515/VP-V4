## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

新来源经LLM Wiki整理为可审查并可发布的知识变更。

## 当前基线与开发入口

知识升级规划已合并；#358已关闭，#359/#360沿既有归属和开放PR接续。核最新main实际接口及当前GitHub状态，不重跑旧规划前置；保留RLS、实际告知/同意、Trip确认和真实验收。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/codex/knowledge-upgrade-plan-20260913/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-75)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/codex/knowledge-upgrade-plan-20260913/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/codex/knowledge-upgrade-plan-20260913/docs/knowledge-upgrade/README.md)。
验收阶段：[S2](https://github.com/JTCAO515/VP-V4/blob/codex/knowledge-upgrade-plan-20260913/docs/program/2026-09-05/DELIVERY-STAGES.md#s2)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/codex/knowledge-upgrade-plan-20260913/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

- [VPJ-74 #358](https://github.com/JTCAO515/VP-V4/issues/358)

## Acceptance criteria

- [ ] 一份获准来源通过实际有界LLM worker生成source/procedure/topic Wiki草稿与statement变更，运营查看差异后经现有异人审查和发布，普通允许reader读到正确版本。
- [ ] 每条关键声明链接原source revision/span；生成摘要、关系与缺口标draft，模型不能创建来源、reviewer、TTL或发布资格，不把旧模型输出当外部证据。
- [ ] 页面版本记录source依赖、statement引用、job/prompt/config/input digest和变更理由；重复输入不重复建页或发布，expectedVersion冲突拒绝覆盖，并发/跨页变更不暴露半更新。
- [ ] 实际worker超时/取消/进程重启可恢复或明确终态；重试幂等，provider调用有配置、费用/unknown和预算回执；拒权或来源撤回后不继续外发/发布。
- [ ] 固定中英材料覆盖相互矛盾、条件/例外、跨城市差异及注入；新增证据只增加或挑战候选，旧发布事实只有按原流程变更；正文与审查UI能定位原文。
- [ ] 沿既有可靠解析路径；#288 Docling REJECT保留，候选重评须明确新缺口和事前判据。实际Ops/worker/发布/读回链与失败结果留证，不以自动标签或本地fixture结票。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

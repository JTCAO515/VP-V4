## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

Ask检索已发布Wiki与原子声明并返回完整证据和具体缺口。

## 当前基线与开发入口

知识升级规划已合并；#358已关闭，#359/#360沿既有归属和开放PR接续。核最新main实际接口及当前GitHub状态，不重跑旧规划前置；保留RLS、实际告知/同意、Trip确认和真实验收。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/codex/knowledge-upgrade-plan-20260913/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-76)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/codex/knowledge-upgrade-plan-20260913/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/codex/knowledge-upgrade-plan-20260913/docs/knowledge-upgrade/README.md)。
验收阶段：[S2](https://github.com/JTCAO515/VP-V4/blob/codex/knowledge-upgrade-plan-20260913/docs/program/2026-09-05/DELIVERY-STAGES.md#s2)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/codex/knowledge-upgrade-plan-20260913/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

- [VPJ-75 #359](https://github.com/JTCAO515/VP-V4/issues/359)

## Acceptance criteria

- [ ] 复用#206/#264生产者消费者：自然语言请求按明确对象、别名、required claims和完整短文/关键词检索已发布投影，输出EvidencePack并在原生zh/en与已有Web读到对应答案、限定和来源。
- [ ] 研究索引和产品索引按用途/actor隔离；在召回、模型外发、展示及历史重载前执行当前资格。旧索引命中已撤回/过期/错范围知识也无法被外发或展示为事实。
- [ ] EvidencePack记录required/background/missing/conflicts及statement/publication/source/span和检索/ontology版本；关键遗漏、错误引用和证据充足时全拒答均判失败，不由相关度决定完整性。
- [ ] 分开missing_content/retrieval_miss/user_input_missing/capability_unsupported/policy_denied/provider_failure；retrieval miss先有界直接lookup，真正缺口仅保留脱敏规范化模式，不保留私人原文。
- [ ] 沿用当前只分类输入的数据边界；如外发知识片段/上下文需版本化实际数据流配置与对应告知/同意及旧模式兼容，不静默改变现有policy。
- [ ] 冻结复用加新增的中英问题族与qrels/必要claim真值，调参和保留集按来源版本/问题族隔离；跑实际查询、普通账号owner隔离、撤回和故障，并报告覆盖/过拒答、p50/p95与成本分母。
- [ ] 记录同批结构化/直接读取baseline和本路径实测差异；向量化/重排仍归#248的真实召回和净收益激活门。iOS/Web实际读回、原Trip不变、历史证据和回退通过后才完成本票。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

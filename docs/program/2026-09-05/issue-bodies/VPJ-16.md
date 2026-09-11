## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

有依据的回答、诚实部分答案与知识缺口。

## 当前基线与开发入口

原VPJ基线已合并；2026-09-10品牌增量以Q1-Q38报告的已确认方向为准，当前任务及新增规划契约需按合入main后的版本执行。已有可独立进行的准备范围继续；未决收费、数据许可和激活制不视为已批准，完整验收仍保留真实依赖。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-16)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)。
验收阶段：[S2](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s2)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

- [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195)
- [VPJ-15 #205](https://github.com/JTCAO515/VP-V4/issues/205)

## Acceptance criteria

- [ ] 结构化/完整短文baseline→claim coverage→中英回答/卡片；权限时效范围预过滤。
- [ ] required/background/coverage/conflicts并存，同一fact多证据可用，no-answer不被相关度掩盖。
- [ ] 真正knowledge gap与provider/policy/user-input/capability问题分流；不自动承诺人工。
- [ ] 有依据回答同时约束自由正文和卡片，partial保留可靠部分并指明具体缺口与可用下一步；个人偏好只能筛选解释，不当外部事实；完整证据下全拒答作为失败反例。
- [ ] HF复用：借MIRACL/BIPIA方法分别诊断检索、无答案与注入，保持请求级资格在召回及模型外发前执行、展示前重验；历史百科/旅行基准不当实时知识，相关高分不推翻时效、反证与许可。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

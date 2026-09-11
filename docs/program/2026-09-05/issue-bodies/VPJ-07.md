## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

真实 Ask 得到可恢复的最终回答。

## 当前基线与开发入口

原VPJ基线已合并；2026-09-10品牌增量以Q1-Q38报告的已确认方向为准，当前任务及新增规划契约需按合入main后的版本执行。已有可独立进行的准备范围继续；未决收费、数据许可和激活制不视为已批准，完整验收仍保留真实依赖。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-07)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)。
验收阶段：[S2](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s2)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

- [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191)
- [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192)
- [VPJ-06 #193](https://github.com/JTCAO515/VP-V4/issues/193)
- [VPJ-59 #194](https://github.com/JTCAO515/VP-V4/issues/194)

## Acceptance criteria

- [ ] 仅完成一个文本请求的持久input→worker→provider→最终回答→原生读取纵切；流式/多模态另单。
- [ ] answered/partial/clarification/blocked/technical_failure各有中英用户结果；技术失败不计成功。
- [ ] taskId与用户扣次幂等，lease expiry/worker crash/重复投递/cancel race/隔离和terminal-once可测；供应商attempt可能重复计费，逐次记录而非承诺费用绝不重复。
- [ ] 第三方AI许可前无个人数据外发，fallback接收方重新验scope；拒绝许可保留手动Trip路径。
- [ ] 按ServiceTask规划契约关联一项明确目标的多轮Turn，必要澄清和系统修复不新建用户消费；归属由服务端核验，partial/完成后改稿/TTL等未决收费策略保持不启用。
- [ ] 真实输出producer采用版本化VP内容与表达策略，英文直接创作、中英事实与动作状态一致；沿现有schema显式扩展并验证消费者，不新增人格服务或无约束二次润色。
- [ ] HF复用：真实输出接入版本化的内容/语气规范与业务状态，相关性和友好表达不能替代证据/动作回执；复用现有prompt登记与响应合同，不新增人格服务或无约束二次润色。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：#157, #156

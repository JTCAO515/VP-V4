## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

用户旅行内容投稿与发布前审核。

## 当前基线与开发入口

历史规划基线：#253。当前执行读取 main 的合同，并核对实时依赖、可用接口和获准环境；本计划定义不代表任务已就绪或已验收。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-48)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)。
验收阶段：[S5](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s5)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

- [VPJ-14 #204](https://github.com/JTCAO515/VP-V4/issues/204)
- [VPJ-20 #210](https://github.com/JTCAO515/VP-V4/issues/210)
- [VPJ-36 #228](https://github.com/JTCAO515/VP-V4/issues/228)

## Acceptance criteria

- [ ] 注册用户可提交旅行体验/求助，所有内容发布前审；官方/员工身份披露。
- [ ] 提交→pending→reviewed→published/rejected→用户撤回形成完整小链；举报/屏蔽/申诉/删除扩展由VPJ-64承担，未完成不得公开UGC。
- [ ] 内容可关联地点/Save/Add to Trip，但体验不自动晋升Fact；无私信/关注/无限社交feed。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

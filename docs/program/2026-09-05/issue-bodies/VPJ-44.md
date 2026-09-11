## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

正式 App Store 1.0 提交与数字商品审核。

## 当前基线与开发入口

历史规划基线：#253。当前执行读取 main 的合同，并核对实时依赖、可用接口和获准环境；本计划定义不代表任务已就绪或已验收。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-44)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)。
验收阶段：[S6](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s6)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

- [VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226)
- [VPJ-40 #233](https://github.com/JTCAO515/VP-V4/issues/233)
- [VPJ-43 #243](https://github.com/JTCAO515/VP-V4/issues/243)

## Acceptance criteria

- [ ] TestFlight测试轨与AppStore完整1.0生产轨区分；满足当前Xcode/SDK、隐私清单、AI第三方同意和账号删除要求。
- [ ] 中英元数据/实机截图/支持/隐私URL、reviewer访问、IAP审查与恢复说明对应实际功能。
- [ ] JT执行签名/提交/发布，拒审按原因修复；未通过不宣称已上架。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：#166

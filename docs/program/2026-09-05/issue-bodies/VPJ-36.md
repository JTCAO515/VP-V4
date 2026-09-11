## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

核心资料的导出删除框架与首批执行器。

## 当前基线与开发入口

历史规划基线：#253。当前执行读取 main 的合同，并核对实时依赖、可用接口和获准环境；本计划定义不代表任务已就绪或已验收。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-36)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)。
验收阶段：[S5](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s5)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

- [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)
- [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191)
- [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199)
- [VPJ-12 #201](https://github.com/JTCAO515/VP-V4/issues/201)
- [VPJ-31 #223](https://github.com/JTCAO515/VP-V4/issues/223)
- [VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226)

## Acceptance criteria

- [ ] 交付核心Trip/chat/material/memory/Brief/权益引用的身份复核→异步导出/删除→回执。所有新数据模块负责挂接handler，全域验收由58承接。
- [ ] 在删除期间阻止新的相关生成/同步；重试幂等，备份保留义务与恢复后重删tombstone明确。
- [ ] 保留法定财务记录的最少字段并解释；provider无法删除的范围如实披露。
- [ ] 离线旧手机不能立即接收撤销；回网/租约到期清理可控缓存，已导出文件不可远端收回，用户说明准确。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：#165

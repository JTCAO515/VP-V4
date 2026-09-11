## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

现有 Staging 的真实身份、迁移与 owner 隔离验证。

## 当前基线与开发入口

当前执行读取main合同及实时接口；计划定义不是完成证据。 开发阶段不等待供应商工单/书面答复、法务或产品许可；按开发接入规则用现有账号/API推进，未知项记录，保留用户同意和实际技术验证。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-02)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)。
验收阶段：[S1](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s1)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

无其他任务依赖；仍需核对当前接口、环境与外部条件。

## Acceptance criteria

- [ ] 确认目标确为无真实用户的现有 Staging，记录24条迁移实际状态和差异，不重建历史。
- [ ] 真实 owner/other-user/anon 三类读取与写入验证；正常数据库、pooler、worker路径分别记录。
- [ ] 输出脱敏配置结果与可执行下一步；失败不伪装通过，不创建Production。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：#152, #154, #153

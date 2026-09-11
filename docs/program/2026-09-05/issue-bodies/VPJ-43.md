## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

独立 Production 与可回滚的客户服务环境。

## 当前基线与开发入口

当前执行读取main合同及实时接口；计划定义不是完成证据。 开发阶段不等待供应商工单/书面答复、法务或产品许可；按开发接入规则用现有账号/API推进，未知项记录，保留用户同意和实际技术验证。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-43)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)。
验收阶段：[S6](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s6)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

- [VPJ-38 #230](https://github.com/JTCAO515/VP-V4/issues/230)
- [VPJ-42 #242](https://github.com/JTCAO515/VP-V4/issues/242)

## Acceptance criteria

- [ ] 独立Production项目/服务凭证/配置和备份，与Staging严格分离；迁移前后验证和回滚完整。
- [ ] 隐私/Terms/support域名/资产/地区契约已齐备，功能旗标按能力设置。
- [ ] 实际部署由operator控制，secrets不写repo；不能用Preview通过替代Production验收。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：#170, #166

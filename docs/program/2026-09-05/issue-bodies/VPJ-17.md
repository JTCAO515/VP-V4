## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

来源更新后安全重验相关知识与 Trip。

## 当前基线与开发入口

当前执行读取main合同及实时接口；计划定义不是完成证据。 开发阶段不等待供应商工单/书面答复、法务或产品许可；按开发接入规则用现有账号/API推进，未知项记录，保留用户同意和实际技术验证。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-17)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)。
验收阶段：[S3](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s3)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

- [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192)
- [VPJ-14 #204](https://github.com/JTCAO515/VP-V4/issues/204)
- [VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206)
- [VPJ-75 #359](https://github.com/JTCAO515/VP-V4/issues/359)

## Acceptance criteria

- [ ] SourceRevision→影响候选→独立复核→outbox→索引/投影ack可重试；不是仅返回cascade意图。
- [ ] TripItemSupport绑定claim版本，旧证据失效不删除用户已确认意图。
- [ ] 404/页面样式变动不当政策反转；撤权立即停新检索/外发，保留允许的审计。
- [ ] 知识升级：来源变化生成有版本的影响集，覆盖Wiki页面、statement、检索索引/缓存、历史答案和TripItemSupport；outbox逐消费者ack可重试，记录延迟/乱序/失败与恢复，删除旧索引未完成时当前资格gate仍阻止失效知识外发。
- [ ] 知识升级：规范化缺口与来源更新只进入有界Wiki草稿/复核任务，区分资料变动、解析差异、404和真正政策反转；记录每次刷新成本/unknown及受影响知识数，不收集私人对话原文、不无限自动抓取或自动发布。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

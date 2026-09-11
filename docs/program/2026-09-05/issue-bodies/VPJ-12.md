## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

单张旅行截图导入、校正与加入 Trip。

## 当前基线与开发入口

当前执行读取main合同及实时接口；计划定义不是完成证据。 开发阶段不等待供应商工单/书面答复、法务或产品许可；按开发接入规则用现有账号/API推进，未知项记录，保留用户同意和实际技术验证。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-12)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)。
验收阶段：[S4](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s4)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

- [VPJ-01 #188](https://github.com/JTCAO515/VP-V4/issues/188)
- [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)
- [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191)
- [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195)
- [VPJ-60 #200](https://github.com/JTCAO515/VP-V4/issues/200)

## Acceptance criteria

- [ ] 只做Photo Picker单张旅行截图→私有收件箱→受控解析→关键日期金额原文定位→用户确认；Share Extension/多页文件由VPJ-55承接。
- [ ] 不给全相册/邮箱读取权限；未批准外发时使用许可内本地/人工录入路径。
- [ ] 重复导入、解析失败、取消、TTL、删除、跨账号隔离可测；OCR成功不是供应商已确认。
- [ ] HF复用：参考VPJ-73的Docling采用/否决证据，合格时只接回本票截图→定位字段→用户校正的边界；研究PDF对照不扩张本票格式，否决Docling不阻止采用其他合格方案；保留原始材料定位及取消/TTL。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

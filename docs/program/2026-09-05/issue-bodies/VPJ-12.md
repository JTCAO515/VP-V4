## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

单张旅行截图导入、校正与加入 Trip。

## 执行边界与首个切片

- 首个可交付结果：单张合成旅行截图经现有材料边界解析，展示原文定位和与Trip的新增/重复/冲突，经用户校正形成提案。
- 本票责任/非目标：负责单图导入；55负责限定PDF与系统入口，24负责外部订单引用；不重跑已否决Docling配置。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-12) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S4](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s4)。

## 验收依赖（不自动转为 blocked）

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
- [ ] 体验增量2026-09-17：单张截图的校正界面展示原文定位、日期/地址/金额/状态及与当前Trip的新增/重复/冲突；用户确认字段后才进入既有Proposal流程，解析失败或取消保留原安排，相同输入重放不重复加项。仅保留本票单图范围，不引入全相册读取。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

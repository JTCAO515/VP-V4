## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

Trip 连续记忆与用户可纠正的偏好。

## 当前基线与开发入口

原VPJ基线已合并；2026-09-10品牌增量以Q1-Q38报告的已确认方向为准，当前任务及新增规划契约需按合入main后的版本执行。已有可独立进行的准备范围继续；开发接入与可逆参数由agent按现有方向推进，无需第三方、法务或产品许可；真实收费与发布按相应范围验收。 开发阶段不等待供应商工单/书面答复、法务或产品许可；按开发接入规则用现有账号/API推进，未知项记录，保留用户同意和实际技术验证。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-11)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)。
验收阶段：[S3](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s3)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

- [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)
- [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192)
- [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195)

## Acceptance criteria

- [ ] 当前Trip事实、working context、显式跨Trip偏好分别管理；推断预算先只用于当前Trip。
- [ ] 纠正/本次不用/忘记后，下一轮上下文和待处理工作不复活旧记录。
- [ ] 同意、来源、scope、版本和memory-use依据可追；Free同样保留当前Trip安全约束和纠错权。
- [ ] Q36明确基础偏好对Free/Pass共同可用并跨Trip；保留Profile/Memory每字段唯一权威，用任务专用资格投影接入真实消费者，不能把管理列表整体注入模型。
- [ ] 通过跨Trip、当前要求覆盖旧默认、纠正/撤回后排队与重试、跨账号迟到响应验证；明确记住且范围许可清楚不重复询问，推断和敏感画像不自动保存，偏好不得改写已确认Trip或替代外部证据。
- [ ] HF复用：借LongMemEval更新/跨会话方法编写自有中英反例，分别观察资格、Context入选、实际使用与撤回；管理API不充当模型检索，Profile/Memory字段保持唯一权威源，不为benchmark新建画像或向量库。
- [ ] 记忆新增/更新实际成功后，顶部轻提示“已加入记忆/Saved to memory”，仅“撤销/Undo”，默认4秒自动隐藏；不抢焦点、不阻断输入。摘要有现成允许内容才附一行，不增加生成步骤；首版不加查看按钮。
- [ ] 撤销必须作用于本次记忆变更及版本，成功显示已撤销，失败/冲突如实提示，不覆盖后续修改或改变Trip；同一逻辑写入重试/重连/重放不重复弹出，撤销自身不再触发加入记忆提示，换账号清理旧操作入口。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

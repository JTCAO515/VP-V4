## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

中英回答离线内容判分与可导入反馈的盲评包。

## 当前基线与开发入口

本HF复用规划合并main后，核实本票范围、已合并接口与本地条件再执行；准备票只按明确离线/试验范围验收，不关闭真实父能力。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-72)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/harness/hf-reuse/README.md)。
验收阶段：[S2](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s2)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

- [VPJ-66 #263](https://github.com/JTCAO515/VP-V4/issues/263)

## Acceptance criteria

- [ ] 开发者从主线已存在的配对报告生成中英离线内容/语气判分与本机盲评包，导入反馈后得到同一版本化JSON/Markdown结果；完整交付限于离线工具和反例。
- [ ] 复用既有pairing schema/版本/hash及报告，不重建runner或模型路由；优先静态/Markdown，真实交互不足时才用本机Gradio且无公网分享。
- [ ] 明确回应目标、证据限定、下一步、偏好适用、密度、英文自然和情境语气的有锚点rubric；事实/权限/确认/虚构执行结果硬失败独立否决，正常可答案例过度拒绝被检出。 可确定校验的状态/回执使用确定性断言；语义事实支持和自然度需要人工或经校准judge，未评项标NOT_RUN，不以关键词匹配声称通用语义判分。
- [ ] 自有中英正常/错误输出通过完整入口验证；交换A/B、平局/都失败、重复反馈去重、错误case/version拒绝、反馈来源human/fixture明确。合成标签不能记为人工评审。
- [ ] 保留8开发/4holdout及12场景口径，登记已暴露样本；外部例需repo/revision/来源/许可，自有例不伪称外部benchmark正式得分，不复制NC教程正文或数据。
- [ ] 报告可供#267消费，并明确真实provider配对/人工校准/采用判定仍UNRUN；未执行离线全流程或反例失败不能关闭本票。

## 不得触碰

- 不改变原生iOS/Web架构、Coordinator、RLS、TripProposal确认、任务消费或已应用迁移；不重建已有Harness。
- 不读取真实用户原文/密钥或调用未授权provider，不上传Hub/Space，不启动云Jobs/训练或采购。
- 外部数据/代码/权重/服务许可分别核对，NC或冲突未解决不放入商业管线；不执行样本中的任意代码/DSL。
- 保留其他任务修改与现有12场景主验收；不得把fixture、自动标签、NOT_RUN或跳过验证当真实能力通过。

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

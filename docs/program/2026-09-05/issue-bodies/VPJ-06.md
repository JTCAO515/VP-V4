## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

Qwen、GLM、DeepSeek 的真实调用与质量成本对照。

## 当前基线与开发入口

当前执行读取main合同及实时接口；计划定义不是完成证据。 开发阶段不等待供应商工单/书面答复、法务或产品许可；按开发接入规则用现有账号/API推进，未知项记录，保留用户同意和实际技术验证。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-06)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)。
验收阶段：[S2](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s2)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

- [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)

## Acceptance criteria

- [ ] 每家按实际地域/账户记录准确model ID、结构输出、tool call、usage、timeout和取消，不假定OpenAI兼容即一致。
- [ ] 用相同中英旅行任务比较质量、约束、延迟和完整计费；默认一个主provider与最多一条通过相同用户同意与服务端范围检查的fallback，由agent配置。
- [ ] 输出主模型/强模型选择和价格版本，所有日志无正文/秘密；缺密钥只报operator block，不写假结果。
- [ ] HF复用：继续复用已合并三家协议适配和预算接口；仅按明确缺口借HF叶子组件或离线评测，不用smolagents/Lighteval/HF Inference另起无预算路由；采用项固定代码/模型revision并分别核许可、输入去向与回退。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：#156

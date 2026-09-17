## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

Qwen、GLM、DeepSeek 的真实调用与质量成本对照。

## 执行边界与首个切片

- 首个可交付结果：从已有HTTP适配器和真实C0记录开始，固定同批中英输入，验证一个尚缺的provider协议/usage路径，再形成同口径成本质量对照。
- 本票责任/非目标：负责协议与候选资格；业务回答归07，真实任务提示词配对/人工校准归70，不另建模型网关。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [artifacts/VPJ-06/http-transport-verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-06/http-transport-verification.md) · [artifacts/VPJ-06/live-c0-20260910/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-06/live-c0-20260910/verification.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-06) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S2](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s2)。

## 验收依赖（不自动转为 blocked）

- [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)

## Acceptance criteria

- [ ] 每家按实际地域/账户记录准确model ID、结构输出、tool call、usage、timeout和取消，不假定OpenAI兼容即一致。
- [ ] 用相同中英旅行任务比较质量、约束、延迟和完整计费；默认一个主provider与最多一条通过相同用户同意与服务端范围检查的fallback，由agent配置。
- [ ] 输出主模型/强模型选择和价格版本，所有日志无正文/秘密；缺安全凭据时记录具体待接入项，继续可独立验证的适配/离线对照；真实调用保持UNRUN，不伪造结果或把整票自动标blocked。
- [ ] HF复用：继续复用已合并三家协议适配和预算接口；仅按明确缺口借HF叶子组件或离线评测，不用smolagents/Lighteval/HF Inference另起无预算路由；采用项固定代码/模型revision并分别核许可、输入去向与回退。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：#156

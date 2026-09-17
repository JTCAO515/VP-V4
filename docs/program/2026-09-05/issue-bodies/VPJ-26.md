## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

中英现场表达与大字展示。

## 执行边界与首个切片

- 首个可交付结果：一个真实文字短句或当前地址生成中英译文与大字卡，核对否定/金额/地点且保留原文。
- 本票责任/非目标：负责文字现场表达；27处理音频生命周期，60负责媒体provider资格，不扩全量图片/常驻录音。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-26) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S4](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s4)。

## 验收依赖（不自动转为 blocked）

- [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195)
- [VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206)

## Acceptance criteria

- [ ] 首单仅文字输入→中英译文→给本地人看大字卡，原文随时可见；图片入口通过材料API另行接入。
- [ ] 金额/否定/地点/过敏等关键语义双向验证，高风险不声称认证翻译。
- [ ] 同一Trip地址/场景可带入但不无关调用历史私密记忆；额度耗尽仍可读已存短语。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

图片和语音 Provider 的中英质量与数据流验收。

## 执行边界与首个切片

- 首个可交付结果：用许可内合成材料验证一个OCR/vision、ASR或TTS实际任务与关键语义，分别记录usage、取消和数据生命周期。
- 本票责任/非目标：负责媒体provider与数据流资格；12/26/27实现用户功能，不能因文本接口兼容就宣称媒体合格。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-60) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S4](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s4)。

## 验收依赖（不自动转为 blocked）

- [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)
- [VPJ-06 #193](https://github.com/JTCAO515/VP-V4/issues/193)

## Acceptance criteria

- [ ] 用许可内合成材料验证实际region OCR/vision、ASR和TTS任务能力、usage、取消/删除，不假定文本模型具备媒体。
- [ ] 中英数字/否定/姓名/日期/字幕朗读一致性及失败输出分任务切片报告。
- [ ] 选择最少合格媒体路径，未验证能力不进入12/27；密钥不进客户端。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

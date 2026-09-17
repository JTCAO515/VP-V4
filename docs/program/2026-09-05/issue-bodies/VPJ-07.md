## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

真实 Ask 得到可恢复的最终回答。

## 执行边界与首个切片

- 首个可交付结果：在现有持久Ask上补一个中英可用结果与下一步的实际缺口；必要澄清/修复沿同一ServiceTask，核对回执与成本。
- 本票责任/非目标：已勾选的首条文本纵切保留；08负责事件恢复，16既有知识结果复用，67负责跨场景真实验收，不重写worker。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [artifacts/VPJ-07/grounded-service-20260913/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-07/grounded-service-20260913/verification.md) · [artifacts/VPJ-07/worker-service-20260912/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-07/worker-service-20260912/verification.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-07) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S2](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s2)。

## 验收依赖（不自动转为 blocked）

- [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191)
- [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192)
- [VPJ-06 #193](https://github.com/JTCAO515/VP-V4/issues/193)
- [VPJ-59 #194](https://github.com/JTCAO515/VP-V4/issues/194)

## Acceptance criteria

- [ ] 仅完成一个文本请求的持久input→worker→provider→最终回答→原生读取纵切；流式/多模态另单。
- [ ] answered/partial/clarification/blocked/technical_failure各有中英用户结果；技术失败不计成功。
- [ ] taskId与用户扣次幂等，lease expiry/worker crash/重复投递/cancel race/隔离和terminal-once可测；供应商attempt可能重复计费，逐次记录而非承诺费用绝不重复。
- [ ] 终端用户同意AI处理前无其个人数据外发，fallback接收方重新验scope；拒绝许可保留手动Trip路径。
- [ ] 按ServiceTask规划契约关联一项明确目标的多轮Turn，必要澄清和系统修复不新建用户消费；归属由服务端核验，partial/完成后改稿/TTL等未决收费策略保持不启用。
- [ ] 真实输出producer采用版本化VP内容与表达策略，英文直接创作、中英事实与动作状态一致；沿现有schema显式扩展并验证消费者，不新增人格服务或无约束二次润色。
- [ ] 体验增量2026-09-17：五种结果均给出自然中英用户结果和可执行下一步，不以outcome/intent代码作为最终回答；answered先给结论，partial保留可靠部分并指出具体缺口，clarification只问影响当前目标的一项，blocked给许可内替代，technical_failure给同任务恢复入口。必要澄清和系统修复沿既有ServiceTask，不以表达优化新增扣次。
- [ ] 体验增量2026-09-17：在受支持城市输入“机场地址”等有歧义问题时，仅用已核实实体构造必要选择；未知城市/实体不猜测，已有上下文不重复索取。复用#206已验行为与当前证据资格；正常可答却全拒答、技术失败伪称缺知识、没有来源的选项均为失败。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：#157, #156

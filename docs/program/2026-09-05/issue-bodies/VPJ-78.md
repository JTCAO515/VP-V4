## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

持续会话、旅程目标与ServiceTask归属。

## 执行边界与首个切片

- 首个可交付结果：先版本化一次独立消息与后续改口的归属，完成持久接纳和原生读回。
- 本票责任/非目标：唯一负责Conversation/goal与Task的关联；#195/196保留执行和传输基础，#199负责记忆权威。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-78) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S2](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s2)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191)
- [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192)
- [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195)
- [VPJ-08 #196](https://github.com/JTCAO515/VP-V4/issues/196)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] 新版本Conversation允许多个ServiceTask和普通问答；Journey goal可在日期/Trip未定前存在，仅引用现有Task/Trip，不建第二个队列或Trip内容副本。
- [ ] 服务端校验消息/任务/选中成果/Trip/actor及scope版本；支持follow-up/amendment/独立问题，歧义才澄清，新消息不自动新收费。
- [ ] 旧text/task/grounded模式和ID摘要语义保留；不直接放宽旧四Turn/clarification-repair合同，不重开终态Turn。
- [ ] 多消息接纳、并发次序、幂等冲突、换账号/顶替、撤权、删除、导出与迟到响应均有生产者消费者反例；新存储append-only及兼容回退。
- [ ] 上下文装配携带当前目标、允许的Trip/Memory/证据和未决项，记录来源版本；合成和真实模型消费分栏，不把完整记忆管理列表外发。
- [ ] 实际API/持久化/事件与原生消费者完成一条无Trip问答到持续目标的链；服务器重启后归属不丢，UI可继续输入。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

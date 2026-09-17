## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

流式回答在断网、后台和跨端重连后接续。

## 执行边界与首个切片

- 首个可交付结果：复用现有cursor/SSE与取消接口，在同一已接受任务上验一次后台/断网/重启后的事件接续和最终结果读取。
- 本票责任/非目标：负责事件与客户端恢复；不重建07执行队列/59账本，提交前后全链故障由69整合验收。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [artifacts/VPJ-08/native-events-staging-20260913/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-08/native-events-staging-20260913/verification.md) · [artifacts/VPJ-08/native-cancel-staging-20260913/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-08/native-cancel-staging-20260913/verification.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-08) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S2](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s2)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] SSE/事件协议提供稳定eventId/cursor；一次已验结构卡以原子事件出现。
- [ ] 断网重连、App后台、取消、服务重启不丢最终回答、不双扣Ask、不重复Trip提交。
- [ ] 跨账号旧事件不可回放；流式tail usage缺失进入待核账。
- [ ] 同一ServiceTask跨轮/断网/重连保持归属，必要澄清或系统恢复不重复消费；状态文案来自实际事件，取消生成、未提交Proposal和已提交Trip分别呈现。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：#158

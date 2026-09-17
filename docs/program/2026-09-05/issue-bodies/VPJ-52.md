## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 后续证据触发任务

## 用户结果

授权航班状态与相关行程重验。

## 执行边界与首个切片

- 首个可交付结果：来源51合格后，让一条实际航班状态变化生成相关Trip重验候选，覆盖unknown/过期/撤权。
- 本票责任/非目标：负责航班观察消费；来源由51，确认由10/29，不能自动改签或把晚点当重新预订成功。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-52) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 expand](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#expand)。

## 开工依赖（GitHub 原生关系）

- [VPJ-51 #249](https://github.com/JTCAO515/VP-V4/issues/249)

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-17 #207](https://github.com/JTCAO515/VP-V4/issues/207)
- [VPJ-29 #220](https://github.com/JTCAO515/VP-V4/issues/220)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] 单主Flight Adapter显示有效观察与来源时刻，延误信息映射到相关Trip重验候选。
- [ ] unknown/取消/过期不自动重订；用户确认后才改变Trip。
- [ ] 撤权、停用、供应商超时和无覆盖演练，不侵入酒店/铁路交易。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

后续开启门：在VPJ-47记录需求/成本/责任证据，agent据此判断开发优先级；无需额外产品许可，未实测不能自动标为验收通过

替代历史责任：#42

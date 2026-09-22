## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

TestFlight 实机贯通 Plan、Ready、Travel 三段。

## 执行边界与首个切片

- 首个可交付结果：BETA1：受控测试用户在指定build完成真实Trip规划、选区Ask、明确确认、材料/订单回流与准备。
- 本票责任/非目标：负责Beta联合验收；57/56等提供基础能力，40/41提供体验结果，71提供Harness；不把安装成功当产品完成。 2026-09-22已确认的实施顺序：BETA1 → BETA2；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-42) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S5](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s5)。

## 开工依赖（GitHub 原生关系）

- [VPJ-49 #241](https://github.com/JTCAO515/VP-V4/issues/241)

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-08 #196](https://github.com/JTCAO515/VP-V4/issues/196)
- [VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206)
- [VPJ-21 #211](https://github.com/JTCAO515/VP-V4/issues/211)
- [VPJ-24 #214](https://github.com/JTCAO515/VP-V4/issues/214)
- [VPJ-28 #218](https://github.com/JTCAO515/VP-V4/issues/218)
- [VPJ-29 #220](https://github.com/JTCAO515/VP-V4/issues/220)
- [VPJ-32 #224](https://github.com/JTCAO515/VP-V4/issues/224)
- [VPJ-35 #227](https://github.com/JTCAO515/VP-V4/issues/227)
- [VPJ-36 #228](https://github.com/JTCAO515/VP-V4/issues/228)
- [VPJ-37 #229](https://github.com/JTCAO515/VP-V4/issues/229)
- [VPJ-38 #230](https://github.com/JTCAO515/VP-V4/issues/230)
- [VPJ-39 #232](https://github.com/JTCAO515/VP-V4/issues/232)
- [VPJ-40 #233](https://github.com/JTCAO515/VP-V4/issues/233)
- [VPJ-41 #234](https://github.com/JTCAO515/VP-V4/issues/234)
- [VPJ-48 #235](https://github.com/JTCAO515/VP-V4/issues/235)
- [VPJ-55 #236](https://github.com/JTCAO515/VP-V4/issues/236)
- [VPJ-56 #237](https://github.com/JTCAO515/VP-V4/issues/237)
- [VPJ-58 #239](https://github.com/JTCAO515/VP-V4/issues/239)
- [VPJ-61 #240](https://github.com/JTCAO515/VP-V4/issues/240)
- [VPJ-64 #238](https://github.com/JTCAO515/VP-V4/issues/238)
- [VPJ-65 #219](https://github.com/JTCAO515/VP-V4/issues/219)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] 邀请受控用户在原生build完成一个真实Trip的Plan/Ready/Travel，含外跳、离线、恢复、拒绝/取消。
- [ ] 真实owner/RLS/provider/数据/网络/权限证明与TestFlight build关联；sandbox购买不算收入。
- [ ] 所有首发必需项有功能/异常/数据/UX/运行证据；只修验收缺陷，不靠fixture替代。
- [ ] 非技术经营留存与真实付费效果由47观察，不因旅行节点未到而伪称成功/失败。
- [ ] 真实设备与账号贯通#198选区Ask、明确确认、跨端/重载及拒绝路径；基础壳、模拟数据或仅#188完成不能替代本项联合验收。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：#162

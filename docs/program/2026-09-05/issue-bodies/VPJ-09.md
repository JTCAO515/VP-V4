## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

从模糊想法得到可确认的多日行程。

## 执行边界与首个切片

- 首个可交付结果：用日期未定且已有偏好的输入产出可修改相对日草稿，展示局部变化并沿既有确认路径保存/重载。
- 本票责任/非目标：只负责初始多日草稿；10负责局部改稿交互，65补实际地点和路线依据，不把相对日草稿称可执行行程。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-09) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S3](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s3)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192)
- [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195)
- [VPJ-08 #196](https://github.com/JTCAO515/VP-V4/issues/196)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] 无精确日期/订单也可先出方向和相对日草稿；日期预算未知明确且追问可跳过。
- [ ] 两种真正有取舍的方案→日程对象→diff→确认→两端重载；已有Trip不被全量覆盖。
- [ ] 时间、预算、固定项由确定性校验；缺实时依据标unknown不把想象时刻当可行。
- [ ] 本单仅相对日方向/用户提供地点草稿；真实地点与grounded计划由VPJ-65补齐，不能把未解析地点当可执行。
- [ ] Chat→Plan过渡、键盘、diff和返回锚点随此功能验收。
- [ ] 体验增量2026-09-17：对“第一次去上海四天、喜欢吃和散步、日期未定”的输入，先交有取舍的方向及首段可修改的相对日草稿，再补仍会改变方案的信息；目的明确时不强凑两案，不等待全部坐标/素材就绪，也不编造实际营业/抵离时间。仍保留本票相对日/用户提供地点边界，真实地点与可执行性归#219。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：#162

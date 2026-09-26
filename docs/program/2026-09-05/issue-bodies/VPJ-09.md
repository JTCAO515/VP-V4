## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

个性化旅行方向比较与可确认计划。

## 执行边界与首个切片

- 首个可交付结果：以新用户无精确日期的真实想法产出有取舍的方向，逐步接到可版本化成果和同Trip草稿。
- 本票责任/非目标：负责方向/相对日规划及草稿生产；VPJ-79负责成果存储，VPJ-65负责真实地点与完整可行性，VPJ-80负责后台执行。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
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
- [ ] 助手升级2026-09-27：前台先呈现体验、偏好与取舍，准备事项随阶段展开；十天/多城市输入不得被旧2–7天本地规则静默截断，未覆盖范围诚实说明并保留可交付部分。
- [ ] 助手升级2026-09-27：选方向、保存草稿、提交已确认Trip分开；成果带输入/偏好/证据版本，修改仅重算受影响部分，持久读回由VPJ-79合同承接。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：#162

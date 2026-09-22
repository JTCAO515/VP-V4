## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

限定文件导入与系统分享、登录回跳衔接。

## 执行边界与首个切片

- 首个可交付结果：F1：用户从Files选择一类受限PDF，逐页定位关键字段并确认加入同Trip。
- 本票责任/非目标：负责文件和系统入口；12负责单图解析基础，24负责订单语义；暂不建设多人协作邀请或任意文档平台。 2026-09-22已确认的实施顺序：F1 → F2；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-55) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S4](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s4)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191)
- [VPJ-12 #201](https://github.com/JTCAO515/VP-V4/issues/201)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] Share Extension/Files沿已验材料通道投递，支持一类限定页数PDF并保持关键字段校正。
- [ ] Universal Link/邀请/登录回跳/未安装回退/链接过期都有明确路径，安装后不承诺系统无法保证的自动传递。
- [ ] AppGroup按账号命名空间、TTL/退出/删除清理；恶意文件/重复导入不覆盖Trip。
- [ ] 体验增量2026-09-17：限定PDF沿#201已验校正与去重合同，将原固定活动/订单保留并展示新增/重复/冲突，不因导入重生成全程；超出页数/格式时保留原文件及Trip并给明确退路，不静默截断。已有行程、账号回跳与用户原意一致，不扩张为任意Word/Excel解析。
- [ ] 邀请/Universal Link在本票仅验已有身份与权限下的入口和原任务回跳，不建立多人Trip协作、跨账号授权或新的分享产品。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

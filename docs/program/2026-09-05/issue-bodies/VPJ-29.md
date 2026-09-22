## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

用户报告变化后的局部恢复。

## 执行边界与首个切片

- 首个可交付结果：R1：用户说走不动或晚点，看到1–2个保留固定订单/晚餐的局部候选，确认后才更新Trip。
- 本票责任/非目标：负责在途变化的业务触发；复用10提案、21准备、25缓存和65约束；不是另一个规划器或地图实时监听器。 2026-09-22已确认的实施顺序：R1 → R2；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-29) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S4](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s4)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-10 #198](https://github.com/JTCAO515/VP-V4/issues/198)
- [VPJ-21 #211](https://github.com/JTCAO515/VP-V4/issues/211)
- [VPJ-25 #215](https://github.com/JTCAO515/VP-V4/issues/215)
- [VPJ-65 #219](https://github.com/JTCAO515/VP-V4/issues/219)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] 疲劳/晚点/关闭由用户报告或有效外部证据触发，保留固定订单与晚餐等约束。
- [ ] 给1–2个局部候选和受影响项目diff，经确认更新Trip。
- [ ] unknown、无法安全修复、求助外部供应商/官方路径完整；不假装取消退款或实时检测。
- [ ] 用户报告变化后，结合获准且最新的偏好给沉着清楚的下一步及局部候选；保留已确认约束，候选/确认/应用回执分开；技术失败、外部未知和已提交后取消不虚构解决状态。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

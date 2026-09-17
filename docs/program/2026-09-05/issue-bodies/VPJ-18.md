## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

高德主选与腾讯补充的实测、用途与成本边界。

## 执行边界与首个切片

- 首个可交付结果：复用#362已完成探针和高德主选决定，补一个确实未验的使用场景、字段用途或成本/配额记录；不重跑整批取数。
- 本票责任/非目标：负责地图供应商准入/适用边界；#363/364实现地点与路线，#367另验受控降级，不以第二家开发完成阻塞主选。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/benchmarks/maps/vpj-18-362-closeout.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/benchmarks/maps/vpj-18-362-closeout.md) · [artifacts/VPJ-18/full-matrix-20260914/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-18/full-matrix-20260914/verification.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-18) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S3](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s3)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] 对海外行前+境内在途、英文检索、中文POI、入口/步行/路线矩阵、SDK UI和授权逐项比较。
- [ ] 依据公开文档、控制台与实测记录价格/配额/缓存和二次展示行为；已有API可用即可开发，不等待书面许可或采购批准，未知商业条件单列。
- [ ] agent按实际效果选择一个主地图并列回滚/无地图模式；第二家有明确效果收益再接入，不设额外产品许可。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

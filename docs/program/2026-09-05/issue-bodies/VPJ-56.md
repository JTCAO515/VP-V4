## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

原生 CI、签名 Archive 与首个 TestFlight 安装包。

## 执行边界与首个切片

- 首个可交付结果：X1：同一commit在实际可用工具链构建，获得可审查Archive及版本/签名准备结果。
- 本票责任/非目标：负责可分发构建；42负责完整Beta、44负责正式上架。CI已勾选记录保留，未获准账号/上传动作不阻止本地诊断。 2026-09-22已确认的实施顺序：X1 → X2；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/contracts/vpj-56.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/contracts/vpj-56.md) · [artifacts/VPJ-56/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-56/verification.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-56) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S5](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s5)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-01 #188](https://github.com/JTCAO515/VP-V4/issues/188)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] macOS CI锁稳定Xcode版本并跑原生build/tests，artifact保存xcresult与bundle版本；PR不用生产秘密。
- [ ] JT完成Apple账号/BundleID/签名/上传，产出首个可安装TestFlight构建；只证明分发，不证明完整产品。
- [ ] 记录实际上传SDK要求和证书轮换/构建失败/撤回路径；42复用该轨，44正式上架。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

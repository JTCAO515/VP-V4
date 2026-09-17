## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

正式 App Store 1.0 提交与数字商品审核。

## 执行边界与首个切片

- 首个可交付结果：复用已验版本准备准确中英商店资料、reviewer路径、隐私/删除/IAP说明，按实际账号完成获准提交。
- 本票责任/非目标：负责正式商店审核与发布；56提供分发能力、42验Beta，未获准上传/发布时继续完成独立资料与检查。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-44) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S6](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s6)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226)
- [VPJ-40 #233](https://github.com/JTCAO515/VP-V4/issues/233)
- [VPJ-43 #243](https://github.com/JTCAO515/VP-V4/issues/243)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] TestFlight测试轨与AppStore完整1.0生产轨区分；满足当前Xcode/SDK、隐私清单、AI第三方同意和账号删除要求。
- [ ] 中英元数据/实机截图/支持/隐私URL、reviewer访问、IAP审查与恢复说明对应实际功能。
- [ ] JT执行签名/提交/发布，拒审按原因修复；未通过不宣称已上架。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：#166

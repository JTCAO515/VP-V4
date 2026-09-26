## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

官方购买、订阅兼容与同源权益。

## 执行边界与首个切片

- 首个可交付结果：保持#503官方测试交易到grant，按#225版本策略设计订阅续期/退款/恢复与旧Pass共存。
- 本票责任/非目标：唯一交易/账号绑定/grant账本；旧720h语义不可当自动续费，#225给政策、#227给任务容量。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-34) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S5](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s5)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191)
- [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192)
- [VPJ-33 #225](https://github.com/JTCAO515/VP-V4/issues/225)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] StoreKit2交易验证→服务端账号绑定→权益→两端生效；重放/换机/恢复不重复延长或补额度。
- [ ] non-renewing类型的期限与恢复由服务端账本处理，退款撤销有可核路径；到期保留Trip/手动编辑/安全资料。
- [ ] TestFlight/sandbox与production隔离，购买pending/cancelled/revoked不当success；真实付款另门验证。
- [ ] 消费VPJ-33唯一版本化政策；现有Pass的720h、排队、生效、退款和恢复作为兼容路径验证，新订阅续期/撤销按新版本单独实现。媒体/容量由33定义，任务消费由35承接，不复制另一账本。
- [ ] StoreKit购买交易/grant与ServiceTask容量及attempt成本分离；恢复或任务重试不补发同一权益，本轮保持现行激活起算，未定容量不写入真实在售商品。
- [ ] 助手升级2026-09-27：新订阅产品需独立版本化renewal/expiry/revocation及同源权益，先以官方Sandbox证据验证；保留既有non-renewing Pass/grant兼容，不把旧720h规则静默套用所有商品。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

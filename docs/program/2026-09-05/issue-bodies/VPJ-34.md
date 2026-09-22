## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

官方 IAP 购买、恢复与服务端权益。

## 执行边界与首个切片

- 首个可交付结果：Q2：用户在官方测试环境购买一次，服务端验证交易绑定账号后，两端读取同一720h权益段。
- 本票责任/非目标：负责交易/grant幂等、排队、生效、退款和恢复；不再定义33的商品规则，不实现35的任务扣次。 2026-09-22已确认的实施顺序：Q2 → Q3 → Q4；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
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
- [ ] 消费VPJ-33唯一版本化商品策略，实现交易到grant的720h时段、提前购买排队、startsAt生效、退款仅撤本段与不移其他时段、恢复不重复授予及可信购买时间乱序对账。媒体与容量参数由33定义，用户任务扣次由35消费；本票不复制另一份政策定义。
- [ ] StoreKit购买交易/grant与ServiceTask容量及attempt成本分离；恢复或任务重试不补发同一权益，本轮保持现行激活起算，未定容量不写入真实在售商品。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 后续证据触发任务

## 用户结果

长期订阅或交易深度升级的证据决策。

## 执行边界与首个切片

- 首个可交付结果：保持expand门：用重复旅行价值、单位经济性和责任证据决定是否探索长期订阅或某一类交易深度。
- 本票责任/非目标：只交付有证据的采纳/暂缓/否决决定；不启用商品/代客执行，不把联盟收入当充分扩展理由。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-54) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 expand](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#expand)。

## 开工依赖（GitHub 原生关系）

- [VPJ-45 #245](https://github.com/JTCAO515/VP-V4/issues/245)
- [VPJ-47 #247](https://github.com/JTCAO515/VP-V4/issues/247)

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

无其他普通关联；上列真实开工依赖仍保留。

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] 只有重复旅行/持续价值证据才考虑Plus月/年订阅；只读Live Offer、代客执行、签约履约按品类分别决策。
- [ ] 比较责任、服务成本、恢复/退款和排名中立性；不把affiliate增长自动当升级理由。
- [ ] 没有授权保持当前Free+Pass与L1a/L1b；本Issue只决策，不启用外部交易。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

后续开启门：在VPJ-47记录需求/成本/责任证据，agent据此判断开发优先级；无需额外产品许可，未实测不能自动标为验收通过

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

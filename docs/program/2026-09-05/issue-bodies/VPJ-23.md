## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

住宿需求比较与透明联盟跳转。

## 执行边界与首个切片

- 首个可交付结果：沿已有日期/人数和行程比较住宿区域与可核实候选，保留已订/暂缓意向，选择后接回Trip调整建议。
- 本票责任/非目标：负责住宿需求、比较和透明外跳；不复制22链接适配或24凭证处理，也不承担房间下单/支付/履约。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-23) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S4](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s4)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199)
- [VPJ-19 #209](https://github.com/JTCAO515/VP-V4/issues/209)
- [VPJ-22 #212](https://github.com/JTCAO515/VP-V4/issues/212)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] L1a整理区域/床型/入住/预算需求，L1b只传已验参数；展示候选范围和取舍。
- [ ] CTA标供应商/佣金/需要重核条件；不展示无实时证据的可售房型/最终价。
- [ ] 域名白名单/参数最小化、opened≠booked、失败/过期出口；佣金移除后候选排序不变。
- [ ] 体验增量2026-09-17：先按实际行程比较有差异的住宿区域与交通负担，再给可核实酒店候选；继承日期、人数、床型和预算，保留已订/不需要/暂缓意向，避免重复推销。明确每晚/全程/房间数及币种口径，缓存起价不当实时价，无实时依据不宣称可售或最终价。
- [ ] 体验增量2026-09-17：酒店暂选后说明它与当前Trip的关系和下一步；换住宿只提出受影响首末日/接驳的调整候选，经既有Proposal确认才改变Trip。推荐、用户暂选、材料核实与供应商确认分别有证据，选择或打开链接不能写成已预订。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

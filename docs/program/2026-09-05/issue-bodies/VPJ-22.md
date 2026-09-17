## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

酒店官方出口、参数落地与联盟归因验证。

## 执行边界与首个切片

- 首个可交付结果：先用已有官方酒店出口验证一组hotel/date/occupancy参数在真机落地；不可用字段向用户说明。
- 本票责任/非目标：负责链接/归因/用途边界；23负责比较UI，24负责回流。TourMind只作可选研究候选，缺联盟账号不阻止普通官方出口。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-22) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S4](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s4)。

## 验收依赖（不自动转为 blocked）

- [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)

## Acceptance criteria

- [ ] 使用Trip.com/Booking.com现有可用API或官方链接开发并验证App跳转、归因和参数；不等待联盟批准、合同或供应商书面答复。
- [ ] 真机验证hotel/date/occupancy/filters究竟保留哪些参数；不保留的字段写入用户提示。
- [ ] 没有联盟账号或专用API时直接使用非联盟官方搜索出口；不自造库存、room SKU或佣金参数。
- [ ] 体验增量2026-09-17：把TourMind列为可选酒店供应商研究候选，记录采纳/暂缓/否决依据及实际查询权限、费用/总价口径、外宾入住信息、字段用途和来源版本。源码可复用性与远端API/内容权利分别核对；候选不可用不阻塞原官方外跳，不把本票扩大为订房、支付、取消或履约，未验项保留UNRUN。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

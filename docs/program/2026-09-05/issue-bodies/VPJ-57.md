## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

用户服务请求与按任务授予资料访问。

## 执行边界与首个切片

- 首个可交付结果：C1：用户不分享也能请求通用支持，或预览问题文本后限时授权指定员工读取。 PR #497 OPEN，已有可弃Supabase登录→HTTP→PG证据；无共享Staging/真实员工或原生交互验收。
- 本票责任/非目标：负责Case身份与AccessGrant；31投影Brief，32安排真人容量；请求记录不等于接单。 2026-09-22已确认的实施顺序：C1 → C2；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-57) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S4](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s4)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)
- [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191)
- [VPJ-14 #204](https://github.com/JTCAO515/VP-V4/issues/204)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] 用户创建CaseRequest、预览要分享字段、授予有期限AccessGrant，指定员工才可读取。
- [ ] 撤回/到期/换员工/其他用户无法继续读取；未授权仍可请求通用支持。
- [ ] 此单提供31/32共同依赖的case身份与授权，不承诺真人已接单。
- [ ] 真人路径以具体旅途执行问题申请为范围；申请已记录不等于接单，未确认容量/时段不承诺即时处理或把普通行前规划默认转人工。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

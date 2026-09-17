## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

第三方订单材料回到同一 Trip。

## 执行边界与首个切片

- 首个可交付结果：从一次酒店外跳返回导入允许的订单材料，校正日期/地址/条款，识别重复/冲突并保存外部引用。
- 本票责任/非目标：负责订单证据回流；12/55提供解析，外部供应商负责取消/改签，选择酒店与打开链接不算预订。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-24) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S4](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s4)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-12 #201](https://github.com/JTCAO515/VP-V4/issues/201)
- [VPJ-23 #213](https://github.com/JTCAO515/VP-V4/issues/213)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] 外跳返回后可跳过或导入凭证；user-reported/artifact-confirmed/provider-verified分开。
- [ ] 用户核实日期/地址/条款候选后形成external reservation reference，约束后续规划。
- [ ] 取消/改签在外部发生，VP只记录证据；导入失败保留原Trip和安全重试。
- [ ] 体验增量2026-09-17：外跳回流材料先显示与现有Trip的新增/重复/冲突及原文定位，用户确认后更新外部订单引用与受影响候选，不重写整趟行程；相同凭证重放不重复加项，user-reported/artifact-confirmed/provider-verified保持区分，未知回执先读取核验再重试。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

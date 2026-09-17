## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

旅行结束、归档与下一次回来。

## 执行边界与首个切片

- 首个可交付结果：从一个已确认Trip执行用户主动归档，保留未完服务与可读成果，再验证下一Trip不继承旧时效约束。
- 本票责任/非目标：负责旅程结束/再次开始；不是删除账户或取消外部服务，偏好保存归11、私密分享49正在独立开发。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-61) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S4](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s4)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192)
- [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199)
- [VPJ-32 #224](https://github.com/JTCAO515/VP-V4/issues/224)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] 用户主动结束/归档Trip；时间已过不等于行程完成，归档不删除未完服务。
- [ ] 提示选择跨Trip保留的偏好，拒绝/跳过可用；创建下一Trip不复活旧时效约束。
- [ ] 最多3草稿+1Active规则可测，旧Trip可读/导出，Pass到期不抹成果。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

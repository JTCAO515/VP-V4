## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

精简 Web Planning Studio 的最终体验验收。

## 执行边界与首个切片

- 首个可交付结果：在真实Web账号上完成一次Trip读写/差异确认/重载，并验证桌面与390宽度、中英、键盘和失败结果。
- 本票责任/非目标：负责轻量Web最终整合验收；不做第二完整App，不重建05数据层、20内容或34权益。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-41) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S5](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s5)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192)
- [VPJ-20 #210](https://github.com/JTCAO515/VP-V4/issues/210)
- [VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] Web保留Chat/Trip基本编辑/diff确认/材料状态/权益，现场工具引导iOS；同Trip连续性可测。
- [ ] 公开Landing/Explore明确当前可用/覆盖/第三方预订，Early Access邮箱同意可撤。
- [ ] 桌面+390x844、中英、键盘无障碍/真实品牌资产/claim scan通过；不重做第二全功能App。
- [ ] 真实Web消费者按VP响应规范呈现主结果、必要限定与下一步；英文原生表达、中英状态一致，正文不控制按钮权限/确认目标，保留轻量同Trip范围与原有可访问性门。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

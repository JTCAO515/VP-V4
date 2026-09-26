## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

精简 Web Planning Studio 的最终体验验收。

## 执行边界与首个切片

- 首个可交付结果：复验轻量Web与原生使用同一Trip、支持成果和准确确认revision。
- 本票责任/非目标：保留轻量Web范围；不复制原生四Tab全产品，不新建第二套artifact/Trip数据。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
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
- [VPJ-79 #560](https://github.com/JTCAO515/VP-V4/issues/560)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] Web保留Chat/Trip基本编辑/diff确认/材料状态/权益，现场工具引导iOS；同Trip连续性可测。
- [ ] 公开Landing/Explore明确当前可用/覆盖/第三方预订，Early Access邮箱同意可撤。
- [ ] 桌面+390x844、中英、键盘无障碍/真实品牌资产/claim scan通过；不重做第二全功能App。
- [ ] 真实Web消费者按VP响应规范呈现主结果、必要限定与下一步；英文原生表达、中英状态一致，正文不控制按钮权限/确认目标，保留轻量同Trip范围与原有可访问性门。
- [ ] 助手升级2026-09-27：支持的新成果和proposal通过同源版本读取；未知schema安全降级，旧客户端不能在丢字段后确认新语义。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

四Tab原生助手壳与Journey全链整合。

## 执行边界与首个切片

- 首个可交付结果：整合四Tab及旧入口映射，先打通VP→Memory纠正→结果变化→Journeys确认→Library读回。
- 本票责任/非目标：新导航/聚合owner；已关闭#188保留旧壳完成范围，最终用户/设备/发布验收仍由#233/#242承担。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-83) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S4](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s4)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-77 #558](https://github.com/JTCAO515/VP-V4/issues/558)
- [VPJ-81 #562](https://github.com/JTCAO515/VP-V4/issues/562)
- [VPJ-82 #563](https://github.com/JTCAO515/VP-V4/issues/563)
- [VPJ-09 #197](https://github.com/JTCAO515/VP-V4/issues/197)
- [VPJ-10 #198](https://github.com/JTCAO515/VP-V4/issues/198)
- [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199)
- [VPJ-13 #203](https://github.com/JTCAO515/VP-V4/issues/203)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] 以VP/Journeys/Library/Memory替换旧五Tab，默认VP；Search全局可达，无活动Tab；account/privacy/purchase/logout、Today、工具和旧deep links无丢失。
- [ ] Memory在一级tab、VP上下文、成功保存undo与成果使用解释四处可感知，纠正能通过真实服务改变结果；不是仅增加设置入口。
- [ ] Journeys可呈现未有准确日期/Trip的目标与已有Trip，清楚显示下一决定、关联任务/成果；goal与Trip不混作两个可编辑事实源。
- [ ] 全壳只聚合已有domain消费者，不复制API/模型/业务状态；后台任务不阻塞tab切换，切账号清理所有投影并拒绝迟到响应。
- [ ] 新壳分阶段能力开关与旧入口fallback经过验证；回退仍可读/取消新任务及保留成果，不产生已接受工作孤儿。
- [ ] 真实原生三段体验及E1–E10适用项、zh/en/小屏大字/VoiceOver/Reduce Motion完成；与#233/#242共享同版本证据，不自动关闭其他父票。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

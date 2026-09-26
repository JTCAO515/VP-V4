## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

VP持续主对话、任务可见性与成果交付。

## 执行边界与首个切片

- 首个可交付结果：先接真实Conversation和一项独立后台任务，保持composer可用并打开同源成果。
- 本票责任/非目标：本票仅主会话及其交互状态；VPJ-83集成全壳，VM/数据库/任务writer不在客户端重做。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-81) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S3](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s3)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-77 #558](https://github.com/JTCAO515/VP-V4/issues/558)
- [VPJ-78 #559](https://github.com/JTCAO515/VP-V4/issues/559)
- [VPJ-79 #560](https://github.com/JTCAO515/VP-V4/issues/560)
- [VPJ-80 #561](https://github.com/JTCAO515/VP-V4/issues/561)
- [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] 原生VP区分首次、探索中、任务中、有结果、无新进展；主对话保持同一身份与恰当记忆提示，不复制多个不相干聊天工作区。
- [ ] 会话输入、任务列表与成果浏览独立状态；支持连续补充/独立问题/取消，慢任务不锁composer，事件不抢滚动/焦点。
- [ ] 展示真实接纳/进度/待输入/待确认/完成/失败/取消，后台结果进来引用同一artifact；不显示无依据Online、假百分比或虚构成功。
- [ ] 在对话自然纠正偏好/本次覆盖/明确长期保存，沿#199保存回执和版本undo；相关成果提供真实使用解释。
- [ ] 新旧会话选择、消息归属、选中成果引用、session replacement/offline/relaunch均有原生行为证据；zh/en/大字/VoiceOver/Reduce Motion可用。
- [ ] 用真实环境跑第一次方向→委托离开→回来成果→改口，不把fixture截图当拟人/执行能力通过。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

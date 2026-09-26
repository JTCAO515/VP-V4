## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

持久版本化成果与跨页面同源读取。

## 执行边界与首个切片

- 首个可交付结果：先保存一份比较成果并在VP和Library同源读回，再扩充其他结果类型。
- 本票责任/非目标：本票拥有结果生命周期；#197/198生产旅行建议/提案，VPJ-81/82/83负责入口呈现。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-79) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S3](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s3)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-78 #559](https://github.com/JTCAO515/VP-V4/issues/559)
- [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] 定义comparison/journey-draft/decision/change-proposal-reference/practical结果的闭合版本schema；owner、来源task/goal/Trip和input/Memory/evidence basis均明确。
- [ ] 成果写入和可发布事件原子或可恢复一致，immutable revision/CAS/currentness可验证；实际结果回执前不显示完成。
- [ ] VP、Journeys、Library及受支持Web读取同一artifact ID/revision；变更proposal只引用既有ID/revision，不能复制确认payload或写Trip。
- [ ] 用户手改、输入/偏好更新、来源撤回和Trip新base使相关结果准确失效；历史可读资格独立核验，旧版本不能继续执行确认。
- [ ] RLS/其他actor/换账号/删除/索引/导出/旧schema消费者与回退验证；不把UserArtifact原材料复制为无来源的生成结果。
- [ ] 原生真实渲染至少一类方向比较及同源重载；安全降级未知schema，不渲染任意模型HTML或动作URL。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

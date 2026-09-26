## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

原生视觉动效、无障碍与性能整链复验。

## 执行边界与首个切片

- 首个可交付结果：在新四Tab真实链上复验连续对话、任务/成果、Memory纠正和可中断状态。
- 本票责任/非目标：整链UX/无障碍/性能owner；旧五Tab验收保留历史，当前遵循ADR-0027和VPJ-77样例，不以概念图替代渲染。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-40) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S5](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s5)。

## 开工依赖（GitHub 原生关系）

- [VPJ-49 #241](https://github.com/JTCAO515/VP-V4/issues/241)

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-13 #203](https://github.com/JTCAO515/VP-V4/issues/203)
- [VPJ-20 #210](https://github.com/JTCAO515/VP-V4/issues/210)
- [VPJ-21 #211](https://github.com/JTCAO515/VP-V4/issues/211)
- [VPJ-23 #213](https://github.com/JTCAO515/VP-V4/issues/213)
- [VPJ-25 #215](https://github.com/JTCAO515/VP-V4/issues/215)
- [VPJ-27 #217](https://github.com/JTCAO515/VP-V4/issues/217)
- [VPJ-28 #218](https://github.com/JTCAO515/VP-V4/issues/218)
- [VPJ-29 #220](https://github.com/JTCAO515/VP-V4/issues/220)
- [VPJ-30 #221](https://github.com/JTCAO515/VP-V4/issues/221)
- [VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226)
- [VPJ-48 #235](https://github.com/JTCAO515/VP-V4/issues/235)
- [VPJ-64 #238](https://github.com/JTCAO515/VP-V4/issues/238)
- [VPJ-55 #236](https://github.com/JTCAO515/VP-V4/issues/236)
- [VPJ-61 #240](https://github.com/JTCAO515/VP-V4/issues/240)
- [VPJ-36 #228](https://github.com/JTCAO515/VP-V4/issues/228)
- [VPJ-83 #564](https://github.com/JTCAO515/VP-V4/issues/564)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] 按VPJ-77确定的一致视觉系统和已批准品牌资产复验；语义token、对话/计划/sheet/键盘/返回锚点保持同一状态语义，不机械照搬概念图。
- [ ] 真机/Simulator完成小屏大屏、大字VoiceOver、Reduce Motion/Transparency、来电低电量弱网；录屏展示可中断动效。
- [ ] 结构卡原子出现、滚动不抢位、已保存动画只在回执后；用profile定位性能不写未测FPS。
- [ ] 在#198真实选区Ask消费者上复验sheet、焦点、返回锚点、大字与VoiceOver及拒绝/关闭状态；不能仅引用#188基础屏幕证据完成整链验收。
- [ ] 体验增量2026-09-17：在相关上游实际可用后，整链复验同一Trip的概览/日程/地图及Today选区、版本、修改后重载一致；采用ADR-0027四Tab、全局搜索与Today在Journeys内的导航，不为图文表现复制桌面多栏或另建Trip数据源。素材未就绪时可用文字成果仍可读，按真实小屏/大字/VoiceOver验证。
- [ ] 助手升级2026-09-27：按EXPERIENCE.md E1–E10检查真实UI；Memory一步可达，任务运行不阻塞对话，结果更新不抢焦点，四Tab/全局搜索/旧deep link/账号与隐私入口全部可达。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

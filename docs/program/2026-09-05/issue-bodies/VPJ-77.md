## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

新版助手三段体验样例与组件契约。

## 执行边界与首个切片

- 首个可交付结果：先让用户完整走通三段样例和Memory纠正，建立前后端共用的可见状态约定。
- 本票责任/非目标：只负责交互样例和输出呈现契约；运行能力由后续producer/consumer证明。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-77) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S1](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s1)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

无其他普通关联；上列真实开工依赖仍保留。

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] 以VP/旅程/资源库/Memory四Tab和全局搜索制作可交互体验样例；首次认识、委托离开、回来交付及Memory纠正四条路径明确标fixture，保留真实组件接线位置。
- [ ] 一个稳定VP身份承接持续对话、实际工作状态与可操作成果；图1关系、图3探索、图2成果分场景使用，三张参考图的旧导航/虚构路线不照搬。
- [ ] 冻结最小Message/Task/Artifact/Memory呈现与点击契约，兼容短答案、比较、草稿、待确认、失败/未知/无更新；不发明真人、记忆、工作和成交。
- [ ] 在目标原生尺寸渲染zh/en、小屏/大字/VoiceOver/Reduce Motion和键盘；记录用户能否找到Memory/任务/成果并纠正的观察，未观察不写accepted。
- [ ] 交付可复用语义token/组件边界和状态映射，允许普通视觉迭代；不把像素审批或全部后台完成作为有界原型前置。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

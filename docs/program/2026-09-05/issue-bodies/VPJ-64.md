## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

社区举报、屏蔽、申诉与内容删除。

## 执行边界与首个切片

- 首个可交付结果：在已有投稿链上完成一次举报→运营处置→回执，再加入屏蔽/申诉/删除和引用失效验证。
- 本票责任/非目标：负责UGC安全生命周期；48负责投稿审核本身，36/58负责统一数据退出，不建设私信/关注系统。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-64) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S5](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s5)。

## 验收依赖（不自动转为 blocked）

- [VPJ-14 #204](https://github.com/JTCAO515/VP-V4/issues/204)
- [VPJ-36 #228](https://github.com/JTCAO515/VP-V4/issues/228)
- [VPJ-48 #235](https://github.com/JTCAO515/VP-V4/issues/235)

## Acceptance criteria

- [ ] 公开UGC前补齐举报→运营处置→回执、用户屏蔽、审核拒绝/申诉、作者撤回/删除。
- [ ] 员工利益关系/来源/著作权字段可见；用户体验不得自动发布为Fact。
- [ ] 挂接privacy handler，避免下架后Explore/缓存/引用继续可见；无私信/关注系统。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

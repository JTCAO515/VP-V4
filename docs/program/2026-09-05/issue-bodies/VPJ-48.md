## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

用户旅行内容投稿与发布前审核。

## 执行边界与首个切片

- 首个可交付结果：用一条旅行体验投稿走注册用户提交→异人审核→发布或拒绝→作者撤回的受控链。
- 本票责任/非目标：负责UGC创建/审核；64负责举报屏蔽申诉删除，未完成其必需保护前不开放公众发布；体验不自动升级Fact。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-48) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S5](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s5)。

## 验收依赖（不自动转为 blocked）

- [VPJ-14 #204](https://github.com/JTCAO515/VP-V4/issues/204)
- [VPJ-20 #210](https://github.com/JTCAO515/VP-V4/issues/210)
- [VPJ-36 #228](https://github.com/JTCAO515/VP-V4/issues/228)

## Acceptance criteria

- [ ] 注册用户可提交旅行体验/求助，所有内容发布前审；官方/员工身份披露。
- [ ] 提交→pending→reviewed→published/rejected→用户撤回形成完整小链；举报/屏蔽/申诉/删除扩展由VPJ-64承担，未完成不得公开UGC。
- [ ] 内容可关联地点/Save/Add to Trip，但体验不自动晋升Fact；无私信/关注/无限社交feed。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

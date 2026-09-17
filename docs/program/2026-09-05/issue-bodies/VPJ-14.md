## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

受保护 Ops 登录与一条候选内容工作流。

## 执行边界与首个切片

- 首个可交付结果：复用现有Ops身份和候选审核，补普通授权账号在真实页面提交/异人审查/撤权的尚缺交互证据。
- 本票责任/非目标：负责运营身份与单候选工作流；15负责实际知识发布，17负责更新传播；不开放跨用户聊天读取。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [artifacts/VPJ-14/staging-20260912/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-14/staging-20260912/verification.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-14) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S2](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s2)。

## 验收依赖（不自动转为 blocked）

- [VPJ-02 #189](https://github.com/JTCAO515/VP-V4/issues/189)
- [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)

## Acceptance criteria

- [ ] 先交付独立受保护Ops身份→提交一个text候选→异人审查→审计记录纵切；来源全生命周期由15/17承接。
- [ ] 作者不能自审；运营无普通用户全库读取；生产内容发布需许可和review资格。
- [ ] 同一操作事务记录审计，失败回滚；无service key进入Ops浏览器。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

独立 Production 与可回滚的客户服务环境。

## 执行边界与首个切片

- 首个可交付结果：先形成可审查的独立Production配置/迁移/回退包；取得指定环境执行授权后部署并核对真实状态。
- 本票责任/非目标：负责独立生产环境和回退；不占用当前共享Staging、不解除既有保护，App Store提交归44。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-43) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S6](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s6)。

## 验收依赖（不自动转为 blocked）

- [VPJ-38 #230](https://github.com/JTCAO515/VP-V4/issues/230)
- [VPJ-42 #242](https://github.com/JTCAO515/VP-V4/issues/242)

## Acceptance criteria

- [ ] 独立Production项目/服务凭证/配置和备份，与Staging严格分离；迁移前后验证和回滚完整。
- [ ] 隐私/Terms/support域名/资产/地区契约已齐备，功能旗标按能力设置。
- [ ] 实际部署由operator控制，secrets不写repo；不能用Preview通过替代Production验收。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：#170, #166

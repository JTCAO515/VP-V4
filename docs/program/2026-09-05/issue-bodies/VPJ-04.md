## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

原生登录、手机登录顶替与 Web 会话并存。

## 执行边界与首个切片

- 首个可交付结果：复用已有原生登录、换机和Web并存链，针对自然过期或丢失回执完成一条尚未验收的真实恢复路径。
- 本票责任/非目标：负责身份/session；不重建02环境或05的Trip业务，也不以模拟器结果替代未验真机条件。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [artifacts/VPJ-04/staging-native/remote-20260911/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-04/staging-native/remote-20260911/verification.md) · [artifacts/VPJ-04/iphone-custom-domain-20260912/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-04/iphone-custom-domain-20260912/verification.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-04) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S1](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s1)。

## 验收依赖（不自动转为 blocked）

- [VPJ-01 #188](https://github.com/JTCAO515/VP-V4/issues/188)
- [VPJ-02 #189](https://github.com/JTCAO515/VP-V4/issues/189)

## Acceptance criteria

- [ ] iOS bearer/session路径可登录/刷新/退出，Web cookie路径继续使用原CSRF/Origin保护。
- [ ] 第二手机登录使第一手机会话失效，不踢Web；Keychain/本地缓存/推送绑定正确账号。
- [ ] 真实iOS→API→RLS owner/other-user及token过期验证，不能以放开Origin实现原生支持。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：#154, #135

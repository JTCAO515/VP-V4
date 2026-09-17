## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

同一 Trip 在 iOS 与精简 Web 创建、编辑和重载。

## 执行边界与首个切片

- 首个可交付结果：复用已落地的两端Trip/Proposal接口，补一个并发改动、未知确认回执或硬锁显示的实际缺口。
- 本票责任/非目标：负责同Trip数据和确认重载；AI生成归09/10，全计划可行性归65，整链视觉归40。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [artifacts/VPJ-05/staging-create-20260912/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-05/staging-create-20260912/verification.md) · [artifacts/VPJ-04/staging-native/remote-20260911/locale-followup.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-04/staging-native/remote-20260911/locale-followup.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-05) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S1](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s1)。

## 验收依赖（不自动转为 blocked）

- [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191)

## Acceptance criteria

- [ ] 复用现有Day/Item与snapshot/CAS；两端同一Trip新增/修改后重载一致。
- [ ] 草稿、confirmed版本、用户硬锁和外部订单状态可分辨，冲突提示保留用户编辑。
- [ ] 改变确认计划沿现有Proposal/Confirm/Patch，不创建第二套Trip数据库。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：#153

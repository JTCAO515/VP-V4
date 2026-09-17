## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

全数据模块导出删除与恢复后的最终隔离验收。

## 执行边界与首个切片

- 首个可交付结果：复用36已交付handler注册，选一个后来接入模块做删除期间并发与恢复后隔离，随后补齐原全模块矩阵。
- 本票责任/非目标：负责最终覆盖与跨模块回归；不重复36的基础执行器或38的备份工具，必需模块未验不能宣称全域删除完成。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-58) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S5](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s5)。

## 验收依赖（不自动转为 blocked）

- [VPJ-30 #221](https://github.com/JTCAO515/VP-V4/issues/221)
- [VPJ-32 #224](https://github.com/JTCAO515/VP-V4/issues/224)
- [VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226)
- [VPJ-36 #228](https://github.com/JTCAO515/VP-V4/issues/228)
- [VPJ-48 #235](https://github.com/JTCAO515/VP-V4/issues/235)
- [VPJ-64 #238](https://github.com/JTCAO515/VP-V4/issues/238)
- [VPJ-24 #214](https://github.com/JTCAO515/VP-V4/issues/214)
- [VPJ-49 #241](https://github.com/JTCAO515/VP-V4/issues/241)
- [VPJ-55 #236](https://github.com/JTCAO515/VP-V4/issues/236)
- [VPJ-28 #218](https://github.com/JTCAO515/VP-V4/issues/218)
- [VPJ-61 #240](https://github.com/JTCAO515/VP-V4/issues/240)
- [VPJ-25 #215](https://github.com/JTCAO515/VP-V4/issues/215)

## Acceptance criteria

- [ ] 整合Trip/材料/记忆/Brief/Case/UGC/举报/通知/权益的数据注册与export/delete handler。
- [ ] 删除中有新任务/通知/社区发布的竞态、恢复后tombstone、离线回网和账号切换均测试。
- [ ] 保留法定字段和外部已导出副本边界准确，任一必需runtime未验则阻塞42。
- [ ] 终验运行在订单引用/本地分享/AppGroup/Guide缓存/归档/离线模块全部存在之后；每个后续数据模块变化必须重跑handler注册与删除恢复验收。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

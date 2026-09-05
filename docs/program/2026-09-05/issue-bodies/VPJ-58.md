## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

全数据模块导出删除与恢复后的最终隔离验收。

整合Trip/材料/记忆/Brief/Case/UGC/举报/通知/权益的数据注册与export/delete handler。

## 当前基线与开发入口

基线PR：#253。合并前不要从旧main实施新合同。
主报告：[完整统筹方案](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。
必须阅读：[本任务执行合同](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-58) 与 [领域接口](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/program/2026-09-05/INTERFACES.md)。

## Blocked by

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

## Scope 与接口

- `tests/security/**`
- `tests/integration/**`
- `docs/acceptance/**`
- `artifacts/VPJ-58/**`

只修改本用户故事需要的路径。接口在消费者接入前版本化，不能仅交fixture声称完成。

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

## 验证与证据

- `pnpm docs:check`
- `git diff --check`
- `pnpm check`
- `pnpm test:unit`
- `pnpm test:contract`
- `pnpm test:integration`
- `pnpm test:security`
- `pnpm db:verify`



- `artifacts/VPJ-58/verification.md`
- `artifacts/VPJ-58/unrun.md`
- `artifacts/VPJ-58/commands.jsonl`

真实DB/provider/设备/购买是验收条件时，skip或fixture只算部分完成。

## Owner / 外部条件 / 观察

Owner: coding-agent。类型: acceptance。预估专注工作3日，外部等待另计；超5日必须再拆。

- Baseline PR merged, all implementation blockers resolved and interfaces available.
- Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.

观察：PR/实际任务验证窗口

## 文档与回滚

- `docs/handoff.json`
- `HANDOFF.md`
- `CONTEXT.md`
- `docs/contracts/vpj-58.md`

Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

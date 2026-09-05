## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

受保护 Ops 登录与一条候选内容工作流。

先交付独立受保护Ops身份→提交一个text候选→异人审查→审计记录纵切；来源全生命周期由15/17承接。

## 当前基线与开发入口

基线PR：#253。合并前不要从旧main实施新合同。
主报告：[完整统筹方案](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。
必须阅读：[本任务执行合同](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-14) 与 [领域接口](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/program/2026-09-05/INTERFACES.md)。

## Blocked by

- [VPJ-02 #189](https://github.com/JTCAO515/VP-V4/issues/189)
- [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)

## Scope 与接口

- `apps/ops/**`
- `lib/server/knowledge/review/**`
- `lib/server/identity/**`
- `supabase/migrations/**`
- `tests/**/ops/**`

只修改本用户故事需要的路径。接口在消费者接入前版本化，不能仅交fixture声称完成。

## Acceptance criteria

- [ ] 先交付独立受保护Ops身份→提交一个text候选→异人审查→审计记录纵切；来源全生命周期由15/17承接。
- [ ] 作者不能自审；运营无普通用户全库读取；生产内容发布需许可和review资格。
- [ ] 同一操作事务记录审计，失败回滚；无service key进入Ops浏览器。

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



- `artifacts/VPJ-14/verification.md`
- `artifacts/VPJ-14/unrun.md`
- `artifacts/VPJ-14/commands.jsonl`

真实DB/provider/设备/购买是验收条件时，skip或fixture只算部分完成。

## Owner / 外部条件 / 观察

Owner: coding-agent。类型: vertical。预估专注工作5日，外部等待另计；超5日必须再拆。

- Baseline PR merged, all implementation blockers resolved and interfaces available.
- Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.

观察：PR/实际任务验证窗口

## 文档与回滚

- `docs/handoff.json`
- `HANDOFF.md`
- `CONTEXT.md`
- `docs/contracts/vpj-14.md`

Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

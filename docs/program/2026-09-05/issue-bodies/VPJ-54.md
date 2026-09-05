## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 后续证据触发任务

## 用户结果

长期订阅或交易深度升级的证据决策。

只有重复旅行/持续价值证据才考虑Plus月/年订阅；只读Live Offer、代客执行、签约履约按品类分别决策。

## 当前基线与开发入口

基线PR：#253。合并前不要从旧main实施新合同。
主报告：[完整统筹方案](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。
必须阅读：[本任务执行合同](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-54) 与 [领域接口](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/program/2026-09-05/INTERFACES.md)。

## Blocked by

- [VPJ-45 #245](https://github.com/JTCAO515/VP-V4/issues/245)
- [VPJ-47 #247](https://github.com/JTCAO515/VP-V4/issues/247)

## Scope 与接口

- `docs/commercial/**`
- `docs/adr/**`
- `artifacts/VPJ-54/**`

只修改本用户故事需要的路径。接口在消费者接入前版本化，不能仅交fixture声称完成。

## Acceptance criteria

- [ ] 只有重复旅行/持续价值证据才考虑Plus月/年订阅；只读Live Offer、代客执行、签约履约按品类分别决策。
- [ ] 比较责任、服务成本、恢复/退款和排名中立性；不把affiliate增长自动当升级理由。
- [ ] 没有授权保持当前Free+Pass与L1a/L1b；本Issue只决策，不启用外部交易。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

## 验证与证据

- `pnpm docs:check`
- `git diff --check`



- `artifacts/VPJ-54/verification.md`
- `artifacts/VPJ-54/unrun.md`
- `artifacts/VPJ-54/commands.jsonl`

真实DB/provider/设备/购买是验收条件时，skip或fixture只算部分完成。

## Owner / 外部条件 / 观察

Owner: operator。类型: decision。预估专注工作2日，外部等待另计；超5日必须再拆。

- JT performs only the named external/decision steps; actual accounts, permissions and evidence must exist.
- Missing access is an explicit operator outcome, never fabricated completion.

观察：外部审批/账号/真机/网络等待另计

后续开启门：需要在VPJ-47记录需求/成本/责任证据及JT明确开启；不得依赖关闭即自动ready

## 文档与回滚

- `docs/handoff.json`
- `HANDOFF.md`
- `CONTEXT.md`
- `docs/contracts/vpj-54.md`

Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

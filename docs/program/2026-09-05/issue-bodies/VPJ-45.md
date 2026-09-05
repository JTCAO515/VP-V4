## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

客户收到产品后的观察、支持与发布关账。

至少72小时系统观察与7天机会相关用户跟踪；自助/人工帮助、拒绝/激活、sandbox/真实购买分开。

## 当前基线与开发入口

基线PR：#253。合并前不要从旧main实施新合同。
主报告：[完整统筹方案](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。
必须阅读：[本任务执行合同](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-45) 与 [领域接口](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/program/2026-09-05/INTERFACES.md)。

## Blocked by

- [VPJ-42 #242](https://github.com/JTCAO515/VP-V4/issues/242)
- [VPJ-44 #244](https://github.com/JTCAO515/VP-V4/issues/244)

## Scope 与接口

- `docs/acceptance/**`
- `docs/runbooks/**`
- `artifacts/VPJ-45/**`
- `docs/handoff.json`

只修改本用户故事需要的路径。接口在消费者接入前版本化，不能仅交fixture声称完成。

## Acceptance criteria

- [ ] 至少72小时系统观察与7天机会相关用户跟踪；自助/人工帮助、拒绝/激活、sandbox/真实购买分开。
- [ ] 支持队列、退款/删除、事故回滚、知识失效有负责人和实测响应。
- [ ] 发布门全部关闭且未解决严重问题为0才结束Program产品交付；不以下载量作为完成。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

## 验证与证据

- `pnpm docs:check`
- `git diff --check`



- `artifacts/VPJ-45/verification.md`
- `artifacts/VPJ-45/unrun.md`
- `artifacts/VPJ-45/commands.jsonl`

真实DB/provider/设备/购买是验收条件时，skip或fixture只算部分完成。

## Owner / 外部条件 / 观察

Owner: operator。类型: acceptance。预估专注工作3日，外部等待另计；超5日必须再拆。

- JT performs only the named external/decision steps; actual accounts, permissions and evidence must exist.
- Missing access is an explicit operator outcome, never fabricated completion.

观察：72h系统观察+至少7天机会相关跟踪；实际旅行节点未到标not_observed

## 文档与回滚

- `docs/handoff.json`
- `HANDOFF.md`
- `CONTEXT.md`
- `docs/contracts/vpj-45.md`

Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

替代历史责任：#171

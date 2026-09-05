## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 后续证据触发任务

## 用户结果

航班来源采购与中国航线实测。

按中国境内/跨境航线样本比较coverage/延迟/许可/价格/归因/存储，不直接选择名气最大。

## 当前基线与开发入口

基线PR：待发布；此状态为开发阻塞。合并前不要从旧main实施新合同。
主报告：[完整统筹方案](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。
必须阅读：[本任务执行合同](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-51) 与 [领域接口](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/program/2026-09-05/INTERFACES.md)。

## Blocked by

- [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)
- [VPJ-39 #232](https://github.com/JTCAO515/VP-V4/issues/232)

## Scope 与接口

- `docs/benchmarks/aviation/**`
- `docs/runbooks/**`
- `artifacts/VPJ-51/**`

只修改本用户故事需要的路径。接口在消费者接入前版本化，不能仅交fixture声称完成。

## Acceptance criteria

- [ ] 按中国境内/跨境航线样本比较coverage/延迟/许可/价格/归因/存储，不直接选择名气最大。
- [ ] 记录字段权威/TTL和无coverage返回，operator批准数据用途与budget。
- [ ] 不购买/出票/爬取受限系统。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

## 验证与证据

- `pnpm docs:check`
- `git diff --check`



- `artifacts/VPJ-51/verification.md`
- `artifacts/VPJ-51/unrun.md`
- `artifacts/VPJ-51/commands.jsonl`

真实DB/provider/设备/购买是验收条件时，skip或fixture只算部分完成。

## Owner / 外部条件 / 观察

Owner: operator。类型: decision。预估专注工作3日，外部等待另计；超5日必须再拆。

- JT performs only the named external/decision steps; actual accounts, permissions and evidence must exist.
- Missing access is an explicit operator outcome, never fabricated completion.

观察：外部审批/账号/真机/网络等待另计

后续开启门：需要在VPJ-47记录需求/成本/责任证据及JT明确开启；不得依赖关闭即自动ready

## 文档与回滚

- `docs/handoff.json`
- `HANDOFF.md`
- `CONTEXT.md`
- `docs/contracts/vpj-51.md`

Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

替代历史责任：#41

## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

高德、百度、腾讯的真实使用地域与采购比较。

对海外行前+境内在途、英文检索、中文POI、入口/步行/路线矩阵、SDK UI和授权逐项比较。

## 当前基线与开发入口

基线PR：#253。合并前不要从旧main实施新合同。
主报告：[完整统筹方案](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。
必须阅读：[本任务执行合同](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-18) 与 [领域接口](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/program/2026-09-05/INTERFACES.md)。

## Blocked by

- [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)

## Scope 与接口

- `docs/benchmarks/maps/**`
- `docs/runbooks/**`
- `docs/operator-actions.json`

只修改本用户故事需要的路径。接口在消费者接入前版本化，不能仅交fixture声称完成。

## Acceptance criteria

- [ ] 对海外行前+境内在途、英文检索、中文POI、入口/步行/路线矩阵、SDK UI和授权逐项比较。
- [ ] 取得实际报价/配额/缓存与二次展示许可，不将公开免费量视为商用合同。
- [ ] 选择一个主地图并列回滚/无地图模式；第二家只在效果/权利证明后加入。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

## 验证与证据

- `pnpm docs:check`
- `git diff --check`



- `artifacts/VPJ-18/verification.md`
- `artifacts/VPJ-18/unrun.md`
- `artifacts/VPJ-18/commands.jsonl`

真实DB/provider/设备/购买是验收条件时，skip或fixture只算部分完成。

## Owner / 外部条件 / 观察

Owner: operator。类型: decision。预估专注工作3日，外部等待另计；超5日必须再拆。

- JT performs only the named external/decision steps; actual accounts, permissions and evidence must exist.
- Missing access is an explicit operator outcome, never fabricated completion.

观察：外部审批/账号/真机/网络等待另计

## 文档与回滚

- `docs/handoff.json`
- `HANDOFF.md`
- `CONTEXT.md`
- `docs/contracts/vpj-18.md`

Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

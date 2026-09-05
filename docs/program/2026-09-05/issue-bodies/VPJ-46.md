## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

每周35小时客户发现、招募与材料工作坊。

执行总35h时间盘：真实客户任务10、研发验收8、招募社区6、内容合作4、知识审查3、支持2、复盘2；30–40h按需求伸缩。

## 当前基线与开发入口

基线PR：#253。合并前不要从旧main实施新合同。
主报告：[完整统筹方案](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。
必须阅读：[本任务执行合同](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-46) 与 [领域接口](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/program/2026-09-05/INTERFACES.md)。

## Blocked by

无其他任务依赖；仍需基线PR已合并。

## Scope 与接口

- `docs/operations/**`
- `docs/commercial/**`
- `artifacts/VPJ-46/**`

只修改本用户故事需要的路径。接口在消费者接入前版本化，不能仅交fixture声称完成。

## Acceptance criteria

- [ ] 执行总35h时间盘：真实客户任务10、研发验收8、招募社区6、内容合作4、知识审查3、支持2、复盘2；30–40h按需求伸缩。
- [ ] 两个周sprint只跑自有/转介绍+一个社区+一个伙伴渠道；3–4访谈+1–2交付起步；禁止未请求群发。
- [ ] Planning/Arriving/In-trip队列、opt-in、原话/行为/来源/分钟数去敏记录；为Supported Journey Matrix提供真实需求。
- [ ] 初期使用许可内现有入口或VPJ-62 intake，不等待地图/支付/完整App；Founder-assisted与产品自助明确。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

## 验证与证据

- `pnpm docs:check`
- `git diff --check`



- `artifacts/VPJ-46/verification.md`
- `artifacts/VPJ-46/unrun.md`
- `artifacts/VPJ-46/commands.jsonl`

真实DB/provider/设备/购买是验收条件时，skip或fixture只算部分完成。

## Owner / 外部条件 / 观察

Owner: operator。类型: operational。预估专注工作2日，外部等待另计；超5日必须再拆。

- JT performs only the named external/decision steps; actual accounts, permissions and evidence must exist.
- Missing access is an explicit operator outcome, never fabricated completion.

观察：每周30–40小时、首两周校准；effort仅建立流程，不是整段观察时长

## 文档与回滚

- `docs/handoff.json`
- `HANDOFF.md`
- `CONTEXT.md`
- `docs/contracts/vpj-46.md`

Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

境内外媒体、酒店跳转、IAP 与通知网络验收。

按真实海外/境内WiFi/漫游/弱网记录DNS→API→DB→model/map/media的p50/p95/失败，不用provider国籍推断可达。

## 当前基线与开发入口

基线PR：#253。合并前不要从旧main实施新合同。
主报告：[完整统筹方案](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。
必须阅读：[本任务执行合同](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-39) 与 [领域接口](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/program/2026-09-05/INTERFACES.md)。

## Blocked by

- [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195)
- [VPJ-19 #209](https://github.com/JTCAO515/VP-V4/issues/209)
- [VPJ-27 #217](https://github.com/JTCAO515/VP-V4/issues/217)
- [VPJ-63 #231](https://github.com/JTCAO515/VP-V4/issues/231)
- [VPJ-23 #213](https://github.com/JTCAO515/VP-V4/issues/213)
- [VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226)
- [VPJ-30 #221](https://github.com/JTCAO515/VP-V4/issues/221)
- [VPJ-55 #236](https://github.com/JTCAO515/VP-V4/issues/236)

## Scope 与接口

- `docs/benchmarks/network/**`
- `scripts/diagnostics/**`
- `artifacts/VPJ-39/**`

只修改本用户故事需要的路径。接口在消费者接入前版本化，不能仅交fixture声称完成。

## Acceptance criteria

- [ ] 按真实海外/境内WiFi/漫游/弱网记录DNS→API→DB→model/map/media的p50/p95/失败，不用provider国籍推断可达。
- [ ] 设置超时、断线恢复和离线读取目标，验证语音长连接/图片导入在预算内。
- [ ] 地区不合格时给实际替代拓扑和用户边界；采购或部署变更不自行执行。
- [ ] 在真实境内外网络验证OTA参数落地、StoreKit购买/恢复、APNs接收与回跳、Files/Share Extension导入，不以model测试代替这些不同链路。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

## 验证与证据

- `pnpm docs:check`
- `git diff --check`



- `artifacts/VPJ-39/verification.md`
- `artifacts/VPJ-39/unrun.md`
- `artifacts/VPJ-39/commands.jsonl`

真实DB/provider/设备/购买是验收条件时，skip或fixture只算部分完成。

## Owner / 外部条件 / 观察

Owner: operator。类型: operational。预估专注工作3日，外部等待另计；超5日必须再拆。

- JT performs only the named external/decision steps; actual accounts, permissions and evidence must exist.
- Missing access is an explicit operator outcome, never fabricated completion.

观察：外部审批/账号/真机/网络等待另计

## 文档与回滚

- `docs/handoff.json`
- `HANDOFF.md`
- `CONTEXT.md`
- `docs/contracts/vpj-39.md`

Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

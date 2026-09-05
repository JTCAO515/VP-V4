## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

Free/Pass 额度与完整任务成本控制。

Free6Ask/4小时+30/滚动7天；Pass300/购买周期+60/滚动24小时作为可配置试点，客户端显示下次可用时刻。

## 当前基线与开发入口

基线PR：#253。合并前不要从旧main实施新合同。
主报告：[完整统筹方案](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。
必须阅读：[本任务执行合同](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-35) 与 [领域接口](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/program/2026-09-05/INTERFACES.md)。

## Blocked by

- [VPJ-06 #193](https://github.com/JTCAO515/VP-V4/issues/193)
- [VPJ-08 #196](https://github.com/JTCAO515/VP-V4/issues/196)
- [VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226)

## Scope 与接口

- `lib/server/identity/quota/**`
- `lib/server/model-gateway/**`
- `lib/server/entitlements/**`
- `ios/**`
- `tests/**/cost/**`

只修改本用户故事需要的路径。接口在消费者接入前版本化，不能仅交fixture声称完成。

## Acceptance criteria

- [ ] Free6Ask/4小时+30/滚动7天；Pass300/购买周期+60/滚动24小时作为可配置试点，客户端显示下次可用时刻。
- [ ] Ask=一个用户请求，内部重试/降级/失败修复不多扣；并发预留→成功结算→失败返还可审。
- [ ] 安全/记忆纠错/导出删除/手动编辑/缓存播放不付费；强模型预算不能悄悄降低安全质量。
- [ ] 每笔交易独立720h/300Ask grant；提前购排队、到自己的startsAt才发额度，到期余量不结转；退款仅撤本段、其他段时间不移，恢复无新额度，账号60/rolling24h不重置；乱序交易按可信购买时间对账。媒体≤60秒录音/次、默认讲解≤2分钟、图≤10MB、PDF≤10页/20MB的试点上限同时公示并核成本。

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
- `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`
- `xcrun simctl list devices available`
- `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`

工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。

- `artifacts/VPJ-35/verification.md`
- `artifacts/VPJ-35/unrun.md`
- `artifacts/VPJ-35/commands.jsonl`

真实DB/provider/设备/购买是验收条件时，skip或fixture只算部分完成。

## Owner / 外部条件 / 观察

Owner: coding-agent。类型: vertical。预估专注工作4日，外部等待另计；超5日必须再拆。

- Baseline PR merged, all implementation blockers resolved and interfaces available.
- Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.

观察：PR/实际任务验证窗口

## 文档与回滚

- `docs/handoff.json`
- `HANDOFF.md`
- `CONTEXT.md`
- `docs/contracts/vpj-35.md`

Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

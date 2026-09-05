## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

社区举报、屏蔽、申诉与内容删除。

公开UGC前补齐举报→运营处置→回执、用户屏蔽、审核拒绝/申诉、作者撤回/删除。

## 当前基线与开发入口

基线PR：#253。合并前不要从旧main实施新合同。
主报告：[完整统筹方案](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。
必须阅读：[本任务执行合同](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-64) 与 [领域接口](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/program/2026-09-05/INTERFACES.md)。

## Blocked by

- [VPJ-14 #204](https://github.com/JTCAO515/VP-V4/issues/204)
- [VPJ-36 #228](https://github.com/JTCAO515/VP-V4/issues/228)
- [VPJ-48 #235](https://github.com/JTCAO515/VP-V4/issues/235)

## Scope 与接口

- `ios/**`
- `apps/ops/**`
- `lib/server/community/**`
- `supabase/migrations/**`
- `tests/**/community/**`

只修改本用户故事需要的路径。接口在消费者接入前版本化，不能仅交fixture声称完成。

## Acceptance criteria

- [ ] 公开UGC前补齐举报→运营处置→回执、用户屏蔽、审核拒绝/申诉、作者撤回/删除。
- [ ] 员工利益关系/来源/著作权字段可见；用户体验不得自动发布为Fact。
- [ ] 挂接privacy handler，避免下架后Explore/缓存/引用继续可见；无私信/关注系统。

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
- `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`
- `xcrun simctl list devices available`
- `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`

工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。

- `artifacts/VPJ-64/verification.md`
- `artifacts/VPJ-64/unrun.md`
- `artifacts/VPJ-64/commands.jsonl`

真实DB/provider/设备/购买是验收条件时，skip或fixture只算部分完成。

## Owner / 外部条件 / 观察

Owner: coding-agent。类型: vertical。预估专注工作3日，外部等待另计；超5日必须再拆。

- Baseline PR merged, all implementation blockers resolved and interfaces available.
- Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.

观察：PR/实际任务验证窗口

## 文档与回滚

- `docs/handoff.json`
- `HANDOFF.md`
- `CONTEXT.md`
- `docs/contracts/vpj-64.md`

Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

按需语音翻译与可中断播放。

push-to-talk→ASR→翻译→字幕/TTS全链，final字幕与朗读一致，录音权限按需。

## 当前基线与开发入口

基线PR：#253。合并前不要从旧main实施新合同。
主报告：[完整统筹方案](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。
必须阅读：[本任务执行合同](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-27) 与 [领域接口](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/program/2026-09-05/INTERFACES.md)。

## Blocked by

- [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)
- [VPJ-26 #216](https://github.com/JTCAO515/VP-V4/issues/216)
- [VPJ-60 #200](https://github.com/JTCAO515/VP-V4/issues/200)

## Scope 与接口

- `ios/**`
- `lib/server/media-translation/**`
- `lib/server/media/**`
- `tests/**/voice/**`
- `evals/**`
- `app/api/media/**`
- `app/api/translate/**`

只修改本用户故事需要的路径。接口在消费者接入前版本化，不能仅交fixture声称完成。

## Acceptance criteria

- [ ] push-to-talk→ASR→翻译→字幕/TTS全链，final字幕与朗读一致，录音权限按需。
- [ ] 来电/耳机/后台/停止/重试不重复播放或存多份，语音价格按实际秒/字符计。
- [ ] 没有常开监听；音频TTL/取消删除和无网文字路径验证。

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
- `pnpm test:e2e`
- `pnpm evals`
- `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`
- `xcrun simctl list devices available`
- `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`

工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。

- `artifacts/VPJ-27/verification.md`
- `artifacts/VPJ-27/unrun.md`
- `artifacts/VPJ-27/commands.jsonl`

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
- `docs/contracts/vpj-27.md`

Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

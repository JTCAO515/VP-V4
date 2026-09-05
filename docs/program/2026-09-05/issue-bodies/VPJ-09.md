## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

从模糊想法得到可确认的多日行程。

无精确日期/订单也可先出方向和相对日草稿；日期预算未知明确且追问可跳过。

## 当前基线与开发入口

基线PR：#253。合并前不要从旧main实施新合同。
主报告：[完整统筹方案](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。
必须阅读：[本任务执行合同](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-09) 与 [领域接口](https://github.com/JTCAO515/VP-V4/blob/codex/vp-final-program-20260905/docs/program/2026-09-05/INTERFACES.md)。

## Blocked by

- [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192)
- [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195)
- [VPJ-08 #196](https://github.com/JTCAO515/VP-V4/issues/196)

## Scope 与接口

- `ios/**`
- `lib/server/turn/**`
- `lib/server/constraints/**`
- `lib/server/trip/**`
- `tests/**/planning/**`
- `evals/**`

只修改本用户故事需要的路径。接口在消费者接入前版本化，不能仅交fixture声称完成。

## Acceptance criteria

- [ ] 无精确日期/订单也可先出方向和相对日草稿；日期预算未知明确且追问可跳过。
- [ ] 两种真正有取舍的方案→日程对象→diff→确认→两端重载；已有Trip不被全量覆盖。
- [ ] 时间、预算、固定项由确定性校验；缺实时依据标unknown不把想象时刻当可行。
- [ ] 本单仅相对日方向/用户提供地点草稿；真实地点与grounded计划由VPJ-65补齐，不能把未解析地点当可执行。
- [ ] Chat→Plan过渡、键盘、diff和返回锚点随此功能验收。

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
- `pnpm evals`
- `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`
- `xcrun simctl list devices available`
- `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`

工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。

- `artifacts/VPJ-09/verification.md`
- `artifacts/VPJ-09/unrun.md`
- `artifacts/VPJ-09/commands.jsonl`

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
- `docs/contracts/vpj-09.md`

Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

替代历史责任：#162

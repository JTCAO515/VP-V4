## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

首访与回访的三种入口获得首个成果。

新想法、已有材料、已在途均可开始；不强制先创建完整计划或填长表。

## 当前基线与开发入口

原VPJ基线已合并；2026-09-10品牌增量以Q1-Q38报告的已确认方向为准，当前任务及新增规划契约需按合入main后的版本执行。已有可独立进行的准备范围继续；未决收费、数据许可和激活制不视为已批准，完整验收仍保留真实依赖。
主报告：[完整统筹方案](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。
必须阅读：[本任务执行合同](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-13) 与 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)。

## Blocked by

- [VPJ-09 #197](https://github.com/JTCAO515/VP-V4/issues/197)
- [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199)
- [VPJ-12 #201](https://github.com/JTCAO515/VP-V4/issues/201)
- [VPJ-62 #202](https://github.com/JTCAO515/VP-V4/issues/202)

## Scope 与接口

- `ios/**`
- `tests/**/onboarding/**`
- `docs/product/**`

只修改本用户故事需要的路径。接口在消费者接入前版本化，不能仅交fixture声称完成。

## Acceptance criteria

- [ ] 新想法、已有材料、已在途均可开始；不强制先创建完整计划或填长表。
- [ ] 回访显示当前Trip/上次决定/下一步，用户可跳过问题；首值来自真实计划对象。
- [ ] 记录first_value与拒绝原因分开；大字/键盘/无权限/配额用尽有路径。
- [ ] 继承同意范围内事件schema；first_value/activated/outcome_declined不混计。
- [ ] 按本轮目标先交可用成果，只有会改变方案的缺失信息才追问；回访使用真实可用偏好与已保存成果，必要澄清沿同一ServiceTask，不机械问卷或反复索取已知信息。

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

- `artifacts/VPJ-13/verification.md`
- `artifacts/VPJ-13/unrun.md`
- `artifacts/VPJ-13/commands.jsonl`

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
- `docs/contracts/vpj-13.md`
- `docs/contracts/vp-response-policy.md`

Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

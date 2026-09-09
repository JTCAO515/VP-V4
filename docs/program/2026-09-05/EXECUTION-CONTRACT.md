# VPJ Issue 执行合同

生成自issue-plan.json。当前共享流程见 [development-workflow.md](../../agents/development-workflow.md) / ADR-0024。
阅读当前Issue/PR、本行、受影响接口与代码；历史研究按需读取。

Checks列是完整Issue验收清单；每条PR按实际改动选择本地验证，保留适用CI和最终运行门。
Allowed列标示主要范围；必要的相邻文件调整、维护任务和独立准备片段按共享流程记录。
运行依赖未完成时父Issue保持未验收；fixture不证明设备、数据库、provider或生产通过。

## VPJ-01

[VPJ-01 #188](https://github.com/JTCAO515/VP-V4/issues/188) — 原生 iOS 五入口、中英文与可访问的首个 Trip 页面

- Owner: coding-agent; 4专注日，PR/实际任务验证窗口
- Blocked by: 无任务依赖；核实际条件
- Allowed: `ios/**`, `lib/i18n.ts`, `tests/**/locale/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-01/verification.md`, `artifacts/VPJ-01/unrun.md`, `artifacts/VPJ-01/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 审计并移植本地 IOS-01 壳的允许行为到 main，保留原始未跟踪文件；原生 SwiftUI，默认 Ask，Trip/Explore/Ask/Tools/Profile。
- [ ] 一个真实屏幕在 zh/en、Dynamic Type、VoiceOver、Reduce Motion 下可用；最低 iOS17，上传工具链满足当前 Apple 要求。
- [ ] 语言发布名单变为 zh/en，es/ru/ar 不向新用户承诺；现有 legacy locale payload兼容策略和五语回归迁移可审查。
- [ ] 首个Ask/Trip屏幕冻结语义token/字体/通用状态与sheet手势，不把所有视觉设计留到整链QA。
- [ ] 保留已接受Logo与成熟清爽视觉，状态文字遵守VP响应规范、英文优先且中英事实一致；本票验收原生基础屏幕、最低系统/可访问性和通用呈现，不将预览文案优化当真实AI能力。
- [ ] 本票不等待已登录真实Trip的选区Ask、Proposal确认和持久重载；这些消费者在#198实现、#233整链UX和#242真机贯通验收。原iOS17、VoiceOver、Dynamic Type、Reduce Motion及基础交互门仍须实证，不因职责澄清自动关闭。

## VPJ-02

[VPJ-02 #189](https://github.com/JTCAO515/VP-V4/issues/189) — 现有 Staging 的真实身份、迁移与 owner 隔离验证

- Owner: operator; 2专注日，外部审批/账号/真机/网络等待另计
- Blocked by: 无任务依赖；核实际条件
- Allowed: `scripts/db/**`, `docs/runbooks/**`, `artifacts/VPJ-02/**`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-02/verification.md`, `artifacts/VPJ-02/unrun.md`, `artifacts/VPJ-02/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: JT performs only the named external/decision steps; actual accounts, permissions and evidence must exist. Missing access is an explicit operator outcome, never fabricated completion.
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 确认目标确为无真实用户的现有 Staging，记录24条迁移实际状态和差异，不重建历史。
- [ ] 真实 owner/other-user/anon 三类读取与写入验证；正常数据库、pooler、worker路径分别记录。
- [ ] 输出脱敏配置结果与可执行下一步；失败不伪装通过，不创建Production。

## VPJ-03

[VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190) — 用户对话、材料、模型地区与人工访问的数据政策

- Owner: operator; 3专注日，外部审批/账号/真机/网络等待另计
- Blocked by: 无任务依赖；核实际条件
- Allowed: `docs/adr/**`, `docs/policy/**`, `docs/runbooks/**`, `docs/operator-actions.json`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-03/verification.md`, `artifacts/VPJ-03/unrun.md`, `artifacts/VPJ-03/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: JT performs only the named external/decision steps; actual accounts, permissions and evidence must exist. Missing access is an explicit operator outcome, never fabricated completion.
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 清楚给出中英告知、目的、保留期限、处理地域、第三方AI接收方、撤回、删除/备份和客服访问矩阵。
- [ ] 由JT/相应责任人填写实际经营主体、期限和合同；Owner角色不自动授予跨用户普通读取。
- [ ] 列出设备端/服务端材料两路径和不授权时可用功能；不要求用户提交密码、验证码、卡号。
- [ ] Q36基础明确偏好的account/Trip/仅本次范围、来源、纠正版本、模型与人工接收方、撤回后队列/缓存/派生物处理进入数据政策；Free/Pass均不替代用户许可。

## VPJ-04

[VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191) — 原生登录、手机登录顶替与 Web 会话并存

- Owner: coding-agent; 5专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-01 #188](https://github.com/JTCAO515/VP-V4/issues/188), [VPJ-02 #189](https://github.com/JTCAO515/VP-V4/issues/189)
- Allowed: `ios/**`, `lib/server/identity/**`, `app/api/auth/**`, `supabase/migrations/**`, `tests/**/identity/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `pnpm test:e2e`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-04/verification.md`, `artifacts/VPJ-04/unrun.md`, `artifacts/VPJ-04/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] iOS bearer/session路径可登录/刷新/退出，Web cookie路径继续使用原CSRF/Origin保护。
- [ ] 第二手机登录使第一手机会话失效，不踢Web；Keychain/本地缓存/推送绑定正确账号。
- [ ] 真实iOS→API→RLS owner/other-user及token过期验证，不能以放开Origin实现原生支持。

## VPJ-05

[VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192) — 同一 Trip 在 iOS 与精简 Web 创建、编辑和重载

- Owner: coding-agent; 5专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191)
- Allowed: `ios/**`, `app/api/trips/**`, `components/canvas/**`, `lib/server/trip/**`, `tests/**/trip/**`, `supabase/migrations/**`, `lib/server/identity/**`, `components/trips/**`, `components/today/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `pnpm test:e2e`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-05/verification.md`, `artifacts/VPJ-05/unrun.md`, `artifacts/VPJ-05/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 复用现有Day/Item与snapshot/CAS；两端同一Trip新增/修改后重载一致。
- [ ] 草稿、confirmed版本、用户硬锁和外部订单状态可分辨，冲突提示保留用户编辑。
- [ ] 改变确认计划沿现有Proposal/Confirm/Patch，不创建第二套Trip数据库。

## VPJ-06

[VPJ-06 #193](https://github.com/JTCAO515/VP-V4/issues/193) — Qwen、GLM、DeepSeek 的真实调用与质量成本对照

- Owner: coding-agent; 5专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)
- Allowed: `lib/server/model-gateway/**`, `evals/**`, `tests/**/model-gateway/**`, `docs/benchmarks/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm evals`
- Evidence: `artifacts/VPJ-06/verification.md`, `artifacts/VPJ-06/unrun.md`, `artifacts/VPJ-06/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 每家按实际地域/账户记录准确model ID、结构输出、tool call、usage、timeout和取消，不假定OpenAI兼容即一致。
- [ ] 用相同中英旅行任务比较质量、约束、延迟和完整计费；默认一个主provider与最多一条已授权fallback。
- [ ] 输出主模型/强模型选择和价格版本，所有日志无正文/秘密；缺密钥只报operator block，不写假结果。
- [ ] HF复用：继续复用已合并三家协议适配和预算接口；仅按明确缺口借HF叶子组件或离线评测，不用smolagents/Lighteval/HF Inference另起无预算路由；采用项固定代码/模型revision并分别核许可、输入去向与回退。

## VPJ-07

[VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195) — 真实 Ask 得到可恢复的最终回答

- Owner: coding-agent; 5专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191), [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192), [VPJ-06 #193](https://github.com/JTCAO515/VP-V4/issues/193), [VPJ-59 #194](https://github.com/JTCAO515/VP-V4/issues/194)
- Allowed: `ios/**`, `app/api/chat/**`, `lib/server/turn/**`, `lib/server/jobs/**`, `supabase/migrations/**`, `tests/**/turn/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `pnpm test:e2e`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-07/verification.md`, `artifacts/VPJ-07/unrun.md`, `artifacts/VPJ-07/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 仅完成一个文本请求的持久input→worker→provider→最终回答→原生读取纵切；流式/多模态另单。
- [ ] answered/partial/clarification/blocked/technical_failure各有中英用户结果；技术失败不计成功。
- [ ] taskId与用户扣次幂等，lease expiry/worker crash/重复投递/cancel race/隔离和terminal-once可测；供应商attempt可能重复计费，逐次记录而非承诺费用绝不重复。
- [ ] 第三方AI许可前无个人数据外发，fallback接收方重新验scope；拒绝许可保留手动Trip路径。
- [ ] 按ServiceTask规划契约关联一项明确目标的多轮Turn，必要澄清和系统修复不新建用户消费；归属由服务端核验，partial/完成后改稿/TTL等未决收费策略保持不启用。
- [ ] 真实输出producer采用版本化VP内容与表达策略，英文直接创作、中英事实与动作状态一致；沿现有schema显式扩展并验证消费者，不新增人格服务或无约束二次润色。
- [ ] HF复用：真实输出接入版本化的内容/语气规范与业务状态，相关性和友好表达不能替代证据/动作回执；复用现有prompt登记与响应合同，不新增人格服务或无约束二次润色。

## VPJ-08

[VPJ-08 #196](https://github.com/JTCAO515/VP-V4/issues/196) — 流式回答在断网、后台和跨端重连后接续

- Owner: coding-agent; 4专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195)
- Allowed: `ios/**`, `app/api/chat/**`, `lib/server/turn/**`, `lib/server/jobs/**`, `tests/**/turn/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:e2e`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-08/verification.md`, `artifacts/VPJ-08/unrun.md`, `artifacts/VPJ-08/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] SSE/事件协议提供稳定eventId/cursor；一次已验结构卡以原子事件出现。
- [ ] 断网重连、App后台、取消、服务重启不丢最终回答、不双扣Ask、不重复Trip提交。
- [ ] 跨账号旧事件不可回放；流式tail usage缺失进入待核账。
- [ ] 同一ServiceTask跨轮/断网/重连保持归属，必要澄清或系统恢复不重复消费；状态文案来自实际事件，取消生成、未提交Proposal和已提交Trip分别呈现。

## VPJ-09

[VPJ-09 #197](https://github.com/JTCAO515/VP-V4/issues/197) — 从模糊想法得到可确认的多日行程

- Owner: coding-agent; 5专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192), [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195), [VPJ-08 #196](https://github.com/JTCAO515/VP-V4/issues/196)
- Allowed: `ios/**`, `lib/server/turn/**`, `lib/server/constraints/**`, `lib/server/trip/**`, `tests/**/planning/**`, `evals/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm evals`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-09/verification.md`, `artifacts/VPJ-09/unrun.md`, `artifacts/VPJ-09/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 无精确日期/订单也可先出方向和相对日草稿；日期预算未知明确且追问可跳过。
- [ ] 两种真正有取舍的方案→日程对象→diff→确认→两端重载；已有Trip不被全量覆盖。
- [ ] 时间、预算、固定项由确定性校验；缺实时依据标unknown不把想象时刻当可行。
- [ ] 本单仅相对日方向/用户提供地点草稿；真实地点与grounded计划由VPJ-65补齐，不能把未解析地点当可执行。
- [ ] Chat→Plan过渡、键盘、diff和返回锚点随此功能验收。

## VPJ-10

[VPJ-10 #198](https://github.com/JTCAO515/VP-V4/issues/198) — 选中一天或项目后与 VP 局部改稿

- Owner: coding-agent; 4专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-09 #197](https://github.com/JTCAO515/VP-V4/issues/197)
- Allowed: `ios/**`, `components/canvas/**`, `lib/server/trip/**`, `lib/server/constraints/**`, `tests/**/planning/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:e2e`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-10/verification.md`, `artifacts/VPJ-10/unrun.md`, `artifacts/VPJ-10/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 选中范围→Ask→局部候选→影响/diff→确认→回到原位置；未选对象保持不动。
- [ ] 用户可直接移日/排序/改时，手动编辑与硬锁区别明确。
- [ ] 并发更新旧proposal不能提交；撤销Trip修改不能伪装取消外部订单。
- [ ] 负责已登录真实Trip的选区→Ask sheet→局部Proposal/diff→确认→回到原对象与位置→重载闭环；复用#188基础导航/样式/可访问性，拒绝或关闭sheet不得误确认，真实凭据/数据条件缺失保留未验收。

## VPJ-11

[VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199) — Trip 连续记忆与用户可纠正的偏好

- Owner: coding-agent; 4专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190), [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192), [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195)
- Allowed: `ios/**`, `lib/server/memory/**`, `lib/server/context/**`, `supabase/migrations/**`, `tests/**/memory/**`, `app/api/memory/**`, `lib/server/identity/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `pnpm test:e2e`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-11/verification.md`, `artifacts/VPJ-11/unrun.md`, `artifacts/VPJ-11/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 当前Trip事实、working context、显式跨Trip偏好分别管理；推断预算先只用于当前Trip。
- [ ] 纠正/本次不用/忘记后，下一轮上下文和待处理工作不复活旧记录。
- [ ] 同意、来源、scope、版本和memory-use依据可追；Free同样保留当前Trip安全约束和纠错权。
- [ ] Q36明确基础偏好对Free/Pass共同可用并跨Trip；保留Profile/Memory每字段唯一权威，用任务专用资格投影接入真实消费者，不能把管理列表整体注入模型。
- [ ] 通过跨Trip、当前要求覆盖旧默认、纠正/撤回后排队与重试、跨账号迟到响应验证；明确记住且范围许可清楚不重复询问，推断和敏感画像不自动保存，偏好不得改写已确认Trip或替代外部证据。
- [ ] HF复用：借LongMemEval更新/跨会话方法编写自有中英反例，分别观察资格、Context入选、实际使用与撤回；管理API不充当模型检索，Profile/Memory字段保持唯一权威源，不为benchmark新建画像或向量库。

## VPJ-12

[VPJ-12 #201](https://github.com/JTCAO515/VP-V4/issues/201) — 单张旅行截图导入、校正与加入 Trip

- Owner: coding-agent; 5专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-01 #188](https://github.com/JTCAO515/VP-V4/issues/188), [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190), [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191), [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195), [VPJ-60 #200](https://github.com/JTCAO515/VP-V4/issues/200)
- Allowed: `ios/**`, `lib/server/artifacts/**`, `lib/server/media/**`, `app/api/artifacts/**`, `supabase/migrations/**`, `tests/**/artifacts/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `pnpm test:e2e`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-12/verification.md`, `artifacts/VPJ-12/unrun.md`, `artifacts/VPJ-12/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 只做Photo Picker单张旅行截图→私有收件箱→受控解析→关键日期金额原文定位→用户确认；Share Extension/多页文件由VPJ-55承接。
- [ ] 不给全相册/邮箱读取权限；未批准外发时使用许可内本地/人工录入路径。
- [ ] 重复导入、解析失败、取消、TTL、删除、跨账号隔离可测；OCR成功不是供应商已确认。
- [ ] HF复用：参考VPJ-73的Docling采用/否决证据，合格时只接回本票截图→定位字段→用户校正的边界；研究PDF对照不扩张本票格式，否决Docling不阻止采用其他合格方案；保留原始材料定位及取消/TTL。

## VPJ-13

[VPJ-13 #203](https://github.com/JTCAO515/VP-V4/issues/203) — 首访与回访的三种入口获得首个成果

- Owner: coding-agent; 3专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-09 #197](https://github.com/JTCAO515/VP-V4/issues/197), [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199), [VPJ-12 #201](https://github.com/JTCAO515/VP-V4/issues/201), [VPJ-62 #202](https://github.com/JTCAO515/VP-V4/issues/202)
- Allowed: `ios/**`, `tests/**/onboarding/**`, `docs/product/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-13/verification.md`, `artifacts/VPJ-13/unrun.md`, `artifacts/VPJ-13/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 新想法、已有材料、已在途均可开始；不强制先创建完整计划或填长表。
- [ ] 回访显示当前Trip/上次决定/下一步，用户可跳过问题；首值来自真实计划对象。
- [ ] 记录first_value与拒绝原因分开；大字/键盘/无权限/配额用尽有路径。
- [ ] 继承同意范围内事件schema；first_value/activated/outcome_declined不混计。
- [ ] 按本轮目标先交可用成果，只有会改变方案的缺失信息才追问；回访使用真实可用偏好与已保存成果，必要澄清沿同一ServiceTask，不机械问卷或反复索取已知信息。

## VPJ-14

[VPJ-14 #204](https://github.com/JTCAO515/VP-V4/issues/204) — 受保护 Ops 登录与一条候选内容工作流

- Owner: coding-agent; 5专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-02 #189](https://github.com/JTCAO515/VP-V4/issues/189), [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)
- Allowed: `apps/ops/**`, `lib/server/knowledge/review/**`, `lib/server/identity/**`, `supabase/migrations/**`, `tests/**/ops/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`
- Evidence: `artifacts/VPJ-14/verification.md`, `artifacts/VPJ-14/unrun.md`, `artifacts/VPJ-14/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 先交付独立受保护Ops身份→提交一个text候选→异人审查→审计记录纵切；来源全生命周期由15/17承接。
- [ ] 作者不能自审；运营无普通用户全库读取；生产内容发布需许可和review资格。
- [ ] 同一操作事务记录审计，失败回滚；无service key进入Ops浏览器。

## VPJ-15

[VPJ-15 #205](https://github.com/JTCAO515/VP-V4/issues/205) — 首批旅程内容从来源登记到已审核可用

- Owner: coding-agent; 5专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-14 #204](https://github.com/JTCAO515/VP-V4/issues/204)
- Allowed: `apps/ops/**`, `lib/server/knowledge/**`, `supabase/migrations/**`, `docs/knowledge-base/**`, `tests/**/knowledge/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`
- Evidence: `artifacts/VPJ-15/verification.md`, `artifacts/VPJ-15/unrun.md`, `artifacts/VPJ-15/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 为Supported Journey Matrix选10–20条原子事实/流程，登记许可、locator、适用范围、版本与审者。
- [ ] 中英表达共享语言中立assertion；candidate/reviewed/published/eligible不可混同。
- [ ] 运营能提交/审查/撤销并在产品读到结果；没有内容授权则阻塞发布，不批量造810条。
- [ ] 首批内容按普通来华游客的城市/场景/必要claim/权利/时效/可用动作组织覆盖；优先支撑规划与变化后的下一步，未定城市名单不得写成已覆盖全国。
- [ ] HF复用：测试集与生产知识分别登记；外部数据记录发布者、准确repo/revision/原行ID、逐源许可及变更，公开/NC/混合来源不自动发布为旅游Fact；优先自有合成评测与已许可审核语料。

## VPJ-16

[VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206) — 有依据的回答、诚实部分答案与知识缺口

- Owner: coding-agent; 5专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195), [VPJ-15 #205](https://github.com/JTCAO515/VP-V4/issues/205)
- Allowed: `lib/server/knowledge/**`, `lib/server/turn/**`, `ios/**`, `components/chat/**`, `tests/**/knowledge/**`, `evals/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:e2e`; `pnpm evals`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-16/verification.md`, `artifacts/VPJ-16/unrun.md`, `artifacts/VPJ-16/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 结构化/完整短文baseline→claim coverage→中英回答/卡片；权限时效范围预过滤。
- [ ] required/background/coverage/conflicts并存，同一fact多证据可用，no-answer不被相关度掩盖。
- [ ] 真正knowledge gap与provider/policy/user-input/capability问题分流；不自动承诺人工。
- [ ] 有依据回答同时约束自由正文和卡片，partial保留可靠部分并指明具体缺口与可用下一步；个人偏好只能筛选解释，不当外部事实；完整证据下全拒答作为失败反例。
- [ ] HF复用：借MIRACL/BIPIA方法分别诊断检索、无答案与注入，保持请求级资格在召回及模型外发前执行、展示前重验；历史百科/旅行基准不当实时知识，相关高分不推翻时效、反证与许可。

## VPJ-17

[VPJ-17 #207](https://github.com/JTCAO515/VP-V4/issues/207) — 来源更新后安全重验相关知识与 Trip

- Owner: coding-agent; 5专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192), [VPJ-14 #204](https://github.com/JTCAO515/VP-V4/issues/204), [VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206)
- Allowed: `lib/server/knowledge/report/**`, `lib/server/jobs/**`, `lib/server/trip/**`, `apps/ops/**`, `supabase/migrations/**`, `tests/**/takedown/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`
- Evidence: `artifacts/VPJ-17/verification.md`, `artifacts/VPJ-17/unrun.md`, `artifacts/VPJ-17/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] SourceRevision→影响候选→独立复核→outbox→索引/投影ack可重试；不是仅返回cascade意图。
- [ ] TripItemSupport绑定claim版本，旧证据失效不删除用户已确认意图。
- [ ] 404/页面样式变动不当政策反转；撤权立即停新检索/外发，保留允许的审计。

## VPJ-18

[VPJ-18 #208](https://github.com/JTCAO515/VP-V4/issues/208) — 高德、百度、腾讯的真实使用地域与采购比较

- Owner: operator; 3专注日，外部审批/账号/真机/网络等待另计
- Blocked by: [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)
- Allowed: `docs/benchmarks/maps/**`, `docs/runbooks/**`, `docs/operator-actions.json`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-18/verification.md`, `artifacts/VPJ-18/unrun.md`, `artifacts/VPJ-18/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: JT performs only the named external/decision steps; actual accounts, permissions and evidence must exist. Missing access is an explicit operator outcome, never fabricated completion.
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 对海外行前+境内在途、英文检索、中文POI、入口/步行/路线矩阵、SDK UI和授权逐项比较。
- [ ] 取得实际报价/配额/缓存与二次展示许可，不将公开免费量视为商用合同。
- [ ] 选择一个主地图并列回滚/无地图模式；第二家只在效果/权利证明后加入。

## VPJ-19

[VPJ-19 #209](https://github.com/JTCAO515/VP-V4/issues/209) — 地点消歧、地图展示与路线出口

- Owner: coding-agent; 5专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192), [VPJ-18 #208](https://github.com/JTCAO515/VP-V4/issues/208)
- Allowed: `ios/**`, `lib/server/external-evidence/**`, `lib/server/explore/**`, `app/api/places/**`, `tests/**/places/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:e2e`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-19/verification.md`, `artifacts/VPJ-19/unrun.md`, `artifacts/VPJ-19/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 中文/英文/拼音同一canonical实体；providerID和内部ID分开，城市同名需要消歧。
- [ ] GCJ/WGS等坐标转换显式且不双转，地图/列表同选中对象；不从向量分数猜入口。
- [ ] 当前位置拒权/无网时可用中文地址和缓存；路线报价只按已授权观察时效呈现。

## VPJ-20

[VPJ-20 #210](https://github.com/JTCAO515/VP-V4/issues/210) — Explore 浏览内容并保存、问 VP、加入 Trip

- Owner: coding-agent; 4专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-09 #197](https://github.com/JTCAO515/VP-V4/issues/197), [VPJ-15 #205](https://github.com/JTCAO515/VP-V4/issues/205), [VPJ-19 #209](https://github.com/JTCAO515/VP-V4/issues/209)
- Allowed: `ios/**`, `app/explore/**`, `components/explore/**`, `lib/server/explore/**`, `tests/**/explore/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:e2e`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-20/verification.md`, `artifacts/VPJ-20/unrun.md`, `artifacts/VPJ-20/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 中英官方/编辑内容可主动浏览、搜索和收藏；说明覆盖与来源。
- [ ] Save/Ask/Add使用同一实体ID，Add走Proposal/Confirm；地点没找到可发起消歧/研究。
- [ ] 无内容、已下架、过期图片/许可、分页/弱网状态可用，不用静态假数据冒充全国。

## VPJ-21

[VPJ-21 #211](https://github.com/JTCAO515/VP-V4/issues/211) — 准备检查把关键缺口变成可做的下一步

- Owner: coding-agent; 4专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-10 #198](https://github.com/JTCAO515/VP-V4/issues/198), [VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206), [VPJ-19 #209](https://github.com/JTCAO515/VP-V4/issues/209)
- Allowed: `ios/**`, `lib/server/readiness/**`, `lib/server/trip/**`, `tests/**/readiness/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-21/verification.md`, `artifacts/VPJ-21/unrun.md`, `artifacts/VPJ-21/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 对首批明确场景检查网络/支付/入场/地址/交通，分knowledgeAvailability/userReadiness/actionTiming。
- [ ] 日期从相对变精确时重核相关证据；建议不改用户计划，未知不当通过。
- [ ] 每个缺口一项可操作下一步与依据/适用范围；非适用项目不制造焦虑。
- [ ] 准备检查以可执行下一步呈现：获准资料、核实入口、条件性候选与修改提案分开；不要把review_fact标签或提示文字作为真实问题已解决。

## VPJ-22

[VPJ-22 #212](https://github.com/JTCAO515/VP-V4/issues/212) — 酒店联盟授权与深链落地验证

- Owner: operator; 2专注日，外部审批/账号/真机/网络等待另计
- Blocked by: [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)
- Allowed: `docs/benchmarks/hotels/**`, `docs/runbooks/**`, `docs/operator-actions.json`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-22/verification.md`, `artifacts/VPJ-22/unrun.md`, `artifacts/VPJ-22/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: JT performs only the named external/decision steps; actual accounts, permissions and evidence must exist. Missing access is an explicit operator outcome, never fabricated completion.
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 先核Trip.com/Booking.com一个供应商的实际许可、App使用/归因、数据/素材、退款联系人。
- [ ] 真机验证hotel/date/occupancy/filters究竟保留哪些参数；不保留的字段写入用户提示。
- [ ] 未取得权限时仍可非联盟官方搜索出口；不抓库存或自造room SKU/佣金参数。

## VPJ-23

[VPJ-23 #213](https://github.com/JTCAO515/VP-V4/issues/213) — 住宿需求比较与透明联盟跳转

- Owner: coding-agent; 4专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199), [VPJ-19 #209](https://github.com/JTCAO515/VP-V4/issues/209), [VPJ-22 #212](https://github.com/JTCAO515/VP-V4/issues/212)
- Allowed: `ios/**`, `lib/server/hotels/**`, `app/api/hotels/**`, `tests/**/hotels/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:e2e`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-23/verification.md`, `artifacts/VPJ-23/unrun.md`, `artifacts/VPJ-23/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] L1a整理区域/床型/入住/预算需求，L1b只传已验参数；展示候选范围和取舍。
- [ ] CTA标供应商/佣金/需要重核条件；不展示无实时证据的可售房型/最终价。
- [ ] 域名白名单/参数最小化、opened≠booked、失败/过期出口；佣金移除后候选排序不变。

## VPJ-24

[VPJ-24 #214](https://github.com/JTCAO515/VP-V4/issues/214) — 第三方订单材料回到同一 Trip

- Owner: coding-agent; 3专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-12 #201](https://github.com/JTCAO515/VP-V4/issues/201), [VPJ-23 #213](https://github.com/JTCAO515/VP-V4/issues/213)
- Allowed: `ios/**`, `lib/server/artifacts/**`, `lib/server/trip/**`, `supabase/migrations/**`, `tests/**/orders/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-24/verification.md`, `artifacts/VPJ-24/unrun.md`, `artifacts/VPJ-24/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 外跳返回后可跳过或导入凭证；user-reported/artifact-confirmed/provider-verified分开。
- [ ] 用户核实日期/地址/条款候选后形成external reservation reference，约束后续规划。
- [ ] 取消/改签在外部发生，VP只记录证据；导入失败保留原Trip和安全重试。

## VPJ-25

[VPJ-25 #215](https://github.com/JTCAO515/VP-V4/issues/215) — Today 与可离线读取的旅行资料

- Owner: coding-agent; 4专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191), [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192)
- Allowed: `ios/**`, `lib/server/today/**`, `app/api/trips/**`, `tests/**/today/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:e2e`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-25/verification.md`, `artifacts/VPJ-25/unrun.md`, `artifacts/VPJ-25/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 确认Trip上的Today/中文地址/用户选择的资料可离线读取，显示最后同步时刻。
- [ ] 原生私有缓存按账号/Trip隔离、登出清理；过期事实不变实时事实。
- [ ] 离线编辑先本地草稿，恢复在线后CAS确认；不执行外部动作或静默覆盖。
- [ ] 离线授权租约到期进入受限读取，回网重验；AppGroup/旧设备不可永久复活被撤销材料。
- [ ] Free/Pass到期或额度不足时，既有权限允许的已保存计划/地址仍按原合同可读；打开App后的接续使用当前实际状态，不承诺后台持续监控。

## VPJ-26

[VPJ-26 #216](https://github.com/JTCAO515/VP-V4/issues/216) — 中英现场表达与大字展示

- Owner: coding-agent; 4专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195), [VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206)
- Allowed: `ios/**`, `lib/server/media-translation/**`, `app/api/translate/**`, `tests/**/translate/**`, `evals/**`, `app/api/media/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:e2e`; `pnpm evals`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-26/verification.md`, `artifacts/VPJ-26/unrun.md`, `artifacts/VPJ-26/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 首单仅文字输入→中英译文→给本地人看大字卡，原文随时可见；图片入口通过材料API另行接入。
- [ ] 金额/否定/地点/过敏等关键语义双向验证，高风险不声称认证翻译。
- [ ] 同一Trip地址/场景可带入但不无关调用历史私密记忆；额度耗尽仍可读已存短语。

## VPJ-27

[VPJ-27 #217](https://github.com/JTCAO515/VP-V4/issues/217) — 按需语音翻译与可中断播放

- Owner: coding-agent; 5专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190), [VPJ-26 #216](https://github.com/JTCAO515/VP-V4/issues/216), [VPJ-60 #200](https://github.com/JTCAO515/VP-V4/issues/200)
- Allowed: `ios/**`, `lib/server/media-translation/**`, `lib/server/media/**`, `tests/**/voice/**`, `evals/**`, `app/api/media/**`, `app/api/translate/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:e2e`; `pnpm evals`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-27/verification.md`, `artifacts/VPJ-27/unrun.md`, `artifacts/VPJ-27/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] push-to-talk→ASR→翻译→字幕/TTS全链，final字幕与朗读一致，录音权限按需。
- [ ] 来电/耳机/后台/停止/重试不重复播放或存多份，语音价格按实际秒/字符计。
- [ ] 没有常开监听；音频TTL/取消删除和无网文字路径验证。

## VPJ-28

[VPJ-28 #218](https://github.com/JTCAO515/VP-V4/issues/218) — 地点讲解与语音追问接回当前 Trip

- Owner: coding-agent; 4专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-15 #205](https://github.com/JTCAO515/VP-V4/issues/205), [VPJ-19 #209](https://github.com/JTCAO515/VP-V4/issues/209), [VPJ-27 #217](https://github.com/JTCAO515/VP-V4/issues/217)
- Allowed: `ios/**`, `lib/server/guide/**`, `app/api/guide/**`, `tests/**/guide/**`, `evals/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:e2e`; `pnpm evals`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-28/verification.md`, `artifacts/VPJ-28/unrun.md`, `artifacts/VPJ-28/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 首批已覆盖地点提供短讲解、来源、事实/传说区别、字幕和暂停续播。
- [ ] 追问使用当前地点/兴趣/已听进度，角色仍VP；未覆盖地点给清楚边界与其他探索入口。
- [ ] 已缓存内容重播不再扣Ask，新增生成按明确额度；现场注意力优先。
- [ ] 讲解按已获准兴趣给简明、有来源、适用的内容；英文为原生表达，中文保持事实/否定一致，幽默可为零；与VPJ-29局部恢复保持职责区分。

## VPJ-29

[VPJ-29 #220](https://github.com/JTCAO515/VP-V4/issues/220) — 用户报告变化后的局部恢复

- Owner: coding-agent; 4专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-10 #198](https://github.com/JTCAO515/VP-V4/issues/198), [VPJ-21 #211](https://github.com/JTCAO515/VP-V4/issues/211), [VPJ-25 #215](https://github.com/JTCAO515/VP-V4/issues/215), [VPJ-65 #219](https://github.com/JTCAO515/VP-V4/issues/219)
- Allowed: `ios/**`, `lib/server/today/recovery/**`, `lib/server/constraints/**`, `tests/**/recovery/**`, `evals/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm evals`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-29/verification.md`, `artifacts/VPJ-29/unrun.md`, `artifacts/VPJ-29/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 疲劳/晚点/关闭由用户报告或有效外部证据触发，保留固定订单与晚餐等约束。
- [ ] 给1–2个局部候选和受影响项目diff，经确认更新Trip。
- [ ] unknown、无法安全修复、求助外部供应商/官方路径完整；不假装取消退款或实时检测。
- [ ] 用户报告变化后，结合获准且最新的偏好给沉着清楚的下一步及局部候选；保留已确认约束，候选/确认/应用回执分开；技术失败、外部未知和已提交后取消不虚构解决状态。

## VPJ-30

[VPJ-30 #221](https://github.com/JTCAO515/VP-V4/issues/221) — 有原因、可关闭的旅行提醒

- Owner: coding-agent; 4专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199), [VPJ-17 #207](https://github.com/JTCAO515/VP-V4/issues/207), [VPJ-25 #215](https://github.com/JTCAO515/VP-V4/issues/215)
- Allowed: `ios/**`, `lib/server/notifications/**`, `lib/server/jobs/**`, `supabase/migrations/**`, `tests/**/notifications/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-30/verification.md`, `artifacts/VPJ-30/unrun.md`, `artifacts/VPJ-30/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] App内Next Step＋用户亲设时间提醒＋明确watch结果，发送前重验Trip版本/同意/时区/有效期。
- [ ] 重复、已完成、撤回、旅行结束、换账号提醒不发送；锁屏不泄漏敏感内容。
- [ ] 通知默认按用途授权，marketing/affiliate不借旅行提醒；Live Activity不在本纵切。
- [ ] 先验打开App后接续与用户授权的提醒，实际发送前重验范围/版本/期限；不把亲切或Pass增强解释为持续定位、永久后台或未经许可的主动联系。

## VPJ-31

[VPJ-31 #223](https://github.com/JTCAO515/VP-V4/issues/223) — 按服务任务授权的动态 Traveler Brief

- Owner: coding-agent; 4专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190), [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199), [VPJ-12 #201](https://github.com/JTCAO515/VP-V4/issues/201), [VPJ-14 #204](https://github.com/JTCAO515/VP-V4/issues/204), [VPJ-57 #222](https://github.com/JTCAO515/VP-V4/issues/222)
- Allowed: `apps/ops/**`, `lib/server/ops/**`, `lib/server/memory/**`, `supabase/migrations/**`, `tests/**/ops/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`
- Evidence: `artifacts/VPJ-31/verification.md`, `artifacts/VPJ-31/unrun.md`, `artifacts/VPJ-31/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 用户给case授权后员工只看任务需要字段；Owner可审授权范围和审计，非普通全库读。
- [ ] 需求/预算/偏好/表达详细程度带来源、更新时刻和显式/推断标记；无敏感人格推定。
- [ ] 纠正/撤权/删除传播到报告和可控缓存；旧摘要不能压过最新用户输入。
- [ ] TravelerBrief只投影当前ServiceCase目的下获准的最小资料及偏好版本；不因基础记忆Free可用而开放人工读取全历史，撤回后未来访问与队列重新校验。

## VPJ-32

[VPJ-32 #224](https://github.com/JTCAO515/VP-V4/issues/224) — 真人协助从请求到接单和结果回传

- Owner: coding-agent; 5专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-21 #211](https://github.com/JTCAO515/VP-V4/issues/211), [VPJ-31 #223](https://github.com/JTCAO515/VP-V4/issues/223), [VPJ-57 #222](https://github.com/JTCAO515/VP-V4/issues/222)
- Allowed: `ios/**`, `apps/ops/**`, `lib/server/service-cases/**`, `supabase/migrations/**`, `tests/**/service-cases/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-32/verification.md`, `artifacts/VPJ-32/unrun.md`, `artifacts/VPJ-32/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 请求→容量检查→queued/accepted/assigned→waiting_external→resolved/unresolved完整可见。
- [ ] 接单前不承诺ETA/SLA；紧急问题先给官方渠道，用户可退出/撤授权。
- [ ] 任务一条线接回Trip，结果不是自动Trip写入；人工分钟数和容量计量。
- [ ] 真人状态和文案统一：queued无虚构负责人/ETA，accepted后才按真实时段约定更新；提供教程、已联系服务方、外部实际解决分别有证据，不预设固定AI/人工比例。

## VPJ-33

[VPJ-33 #225](https://github.com/JTCAO515/VP-V4/issues/225) — Journey Pass 商品、权益和定价实验配置

- Owner: operator; 2专注日，外部审批/账号/真机/网络等待另计
- Blocked by: [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)
- Allowed: `docs/commercial/**`, `docs/runbooks/**`, `lib/server/entitlements/**`, `tests/**/entitlements/**`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-33/verification.md`, `artifacts/VPJ-33/unrun.md`, `artifacts/VPJ-33/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: JT performs only the named external/decision steps; actual accounts, permissions and evidence must exist. Missing access is an explicit operator outcome, never fabricated completion.
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 以Free+30天非自动续费Journey Pass为试点：$19.99参考价，$14.99只单变量实验；地区价来自StoreKit。
- [ ] 明确现行购买开始/提前续买/退款/恢复/到期，以及获准的新服务任务周期与Free窗口口径；新容量未决定前不写入在售商品，无unlimited或人工包含承诺。
- [ ] JT填写store SKU/合同主体/税费及实际价格；未上线商品不能收私人款。
- [ ] 每笔交易独立720h grant，绑定已批准的计量策略版本和容量；提前购排队、到自己的startsAt才发额度，到期余量不结转；退款仅撤本段、其他段时间不移，恢复无新额度，账号滚动窗口不因购买/恢复而重置；乱序交易按可信购买时间对账。容量与窗口数值须按Q37新口径决定，历史300Ask/60Ask只作兼容研究记录，不是新服务任务的实施门。媒体≤60秒录音/次、默认讲解≤2分钟、图≤10MB、PDF≤10页/20MB的既有试点上限保留并核成本。
- [ ] 权益表回写Q36：Free与Pass共同具有获准的基础显式跨Trip偏好；Q37采用完整服务任务方向，原Ask数值不得换名沿用，partial/改稿/TTL/跨期及新容量先决策再公布。
- [ ] Q38购买后激活、到达起算、eSIM和支付渠道保持待研究；本轮不改变现行购买/生效/到期规则、不增加商品承诺。

## VPJ-34

[VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226) — 官方 IAP 购买、恢复与服务端权益

- Owner: coding-agent; 5专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191), [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192), [VPJ-33 #225](https://github.com/JTCAO515/VP-V4/issues/225)
- Allowed: `ios/**`, `app/api/storekit/**`, `lib/server/entitlements/**`, `supabase/migrations/**`, `tests/**/entitlements/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `pnpm test:e2e`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-34/verification.md`, `artifacts/VPJ-34/unrun.md`, `artifacts/VPJ-34/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] StoreKit2交易验证→服务端账号绑定→权益→两端生效；重放/换机/恢复不重复延长或补额度。
- [ ] non-renewing类型的期限与恢复由服务端账本处理，退款撤销有可核路径；到期保留Trip/手动编辑/安全资料。
- [ ] TestFlight/sandbox与production隔离，购买pending/cancelled/revoked不当success；真实付款另门验证。
- [ ] 每笔交易独立720h grant，绑定已批准的计量策略版本和容量；提前购排队、到自己的startsAt才发额度，到期余量不结转；退款仅撤本段、其他段时间不移，恢复无新额度，账号滚动窗口不因购买/恢复而重置；乱序交易按可信购买时间对账。容量与窗口数值须按Q37新口径决定，历史300Ask/60Ask只作兼容研究记录，不是新服务任务的实施门。媒体≤60秒录音/次、默认讲解≤2分钟、图≤10MB、PDF≤10页/20MB的既有试点上限保留并核成本。
- [ ] StoreKit购买交易/grant与ServiceTask容量及attempt成本分离；恢复或任务重试不补发同一权益，本轮保持现行激活起算，未定容量不写入真实在售商品。

## VPJ-35

[VPJ-35 #227](https://github.com/JTCAO515/VP-V4/issues/227) — Free/Pass 额度与完整任务成本控制

- Owner: coding-agent; 4专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-06 #193](https://github.com/JTCAO515/VP-V4/issues/193), [VPJ-08 #196](https://github.com/JTCAO515/VP-V4/issues/196), [VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226)
- Allowed: `lib/server/identity/quota/**`, `lib/server/model-gateway/**`, `lib/server/entitlements/**`, `ios/**`, `tests/**/cost/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-35/verification.md`, `artifacts/VPJ-35/unrun.md`, `artifacts/VPJ-35/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 按Q37服务任务口径，由产品负责人在实际启用前冻结Free/Pass周期与滚动窗口容量，配置化验证且客户端显示正确下次可用时刻；旧6/30/300/60 Ask数字仅作历史占位，不换名沿用或构造旧收费路径。
- [ ] ServiceTask是一项明确目标及必要澄清、系统修复，关联多个Turn/attempt；并发预留、按获准成果标准结算和失败返还可审，未决partial/改稿/TTL/跨期消费不启用。
- [ ] 安全/记忆纠错/导出删除/手动编辑/缓存播放不付费；强模型预算不能悄悄降低安全质量。
- [ ] 每笔交易独立720h grant，绑定已批准的计量策略版本和容量；提前购排队、到自己的startsAt才发额度，到期余量不结转；退款仅撤本段、其他段时间不移，恢复无新额度，账号滚动窗口不因购买/恢复而重置；乱序交易按可信购买时间对账。容量与窗口数值须按Q37新口径决定，历史300Ask/60Ask只作兼容研究记录，不是新服务任务的实施门。媒体≤60秒录音/次、默认讲解≤2分钟、图≤10MB、PDF≤10页/20MB的既有试点上限保留并核成本。
- [ ] 按ServiceTask计用户服务容量，必要澄清/系统修复沿原任务；内部attempt成本独立累计。新计量先记录模式，未决partial/改稿/TTL/跨期及容量保持禁止启用，不构造双重扣次路径。
- [ ] 验证最后一份容量竞争、相同key不同参数、两设备/多worker、取消与完成竞态、晚到usage和跨窗口；实际结果/结算幂等，失败或未知状态不被当零成本。

## VPJ-36

[VPJ-36 #228](https://github.com/JTCAO515/VP-V4/issues/228) — 核心资料的导出删除框架与首批执行器

- Owner: coding-agent; 5专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190), [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191), [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199), [VPJ-12 #201](https://github.com/JTCAO515/VP-V4/issues/201), [VPJ-31 #223](https://github.com/JTCAO515/VP-V4/issues/223), [VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226)
- Allowed: `ios/**`, `app/api/privacy/**`, `lib/server/privacy/**`, `lib/server/jobs/**`, `supabase/migrations/**`, `tests/**/privacy/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `pnpm test:e2e`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-36/verification.md`, `artifacts/VPJ-36/unrun.md`, `artifacts/VPJ-36/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 交付核心Trip/chat/material/memory/Brief/权益引用的身份复核→异步导出/删除→回执。所有新数据模块负责挂接handler，全域验收由58承接。
- [ ] 在删除期间阻止新的相关生成/同步；重试幂等，备份保留义务与恢复后重删tombstone明确。
- [ ] 保留法定财务记录的最少字段并解释；provider无法删除的范围如实披露。
- [ ] 离线旧手机不能立即接收撤销；回网/租约到期清理可控缓存，已导出文件不可远端收回，用户说明准确。

## VPJ-37

[VPJ-37 #229](https://github.com/JTCAO515/VP-V4/issues/229) — 运营看见质量、成本和故障并能停用能力

- Owner: coding-agent; 4专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195), [VPJ-35 #227](https://github.com/JTCAO515/VP-V4/issues/227)
- Allowed: `lib/server/observability/**`, `apps/ops/**`, `lib/flags/**`, `tests/**/observability/**`, `docs/runbooks/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`
- Evidence: `artifacts/VPJ-37/verification.md`, `artifacts/VPJ-37/unrun.md`, `artifacts/VPJ-37/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] task/attempt/provider/tool/actor-scope计数互相可对账，日志无原聊天和秘密。
- [ ] 仪表盘可读任务成功、partial、错误、延迟、provider费用和人工时间，不把未观测记0。
- [ ] 按能力/供应商/城市关闭可及时作用并提供用户替代；预算熔断可恢复且不删Trip。

## VPJ-38

[VPJ-38 #230](https://github.com/JTCAO515/VP-V4/issues/230) — 数据库、对象与删除状态的恢复演练

- Owner: operator; 3专注日，外部审批/账号/真机/网络等待另计
- Blocked by: [VPJ-02 #189](https://github.com/JTCAO515/VP-V4/issues/189), [VPJ-36 #228](https://github.com/JTCAO515/VP-V4/issues/228)
- Allowed: `scripts/db/restore/**`, `docs/runbooks/**`, `tests/**/restore/**`, `artifacts/VPJ-38/**`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-38/verification.md`, `artifacts/VPJ-38/unrun.md`, `artifacts/VPJ-38/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: JT performs only the named external/decision steps; actual accounts, permissions and evidence must exist. Missing access is an explicit operator outcome, never fabricated completion.
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 在隔离恢复目标实测DB与Storage备份、RPO/RTO、恢复数据一致性。
- [ ] 恢复后重新应用删除tombstone与权益/许可撤销，避免已删数据复活。
- [ ] 故障演练记录实际时间/未验项，不在Production做破坏操作。
- [ ] 按数据类确定backup或no-backup TTL；对象元数据/文件、RLS/grants/functions/queue恢复分别验。

## VPJ-39

[VPJ-39 #232](https://github.com/JTCAO515/VP-V4/issues/232) — 境内外媒体、酒店跳转、IAP 与通知网络验收

- Owner: operator; 3专注日，外部审批/账号/真机/网络等待另计
- Blocked by: [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195), [VPJ-19 #209](https://github.com/JTCAO515/VP-V4/issues/209), [VPJ-27 #217](https://github.com/JTCAO515/VP-V4/issues/217), [VPJ-63 #231](https://github.com/JTCAO515/VP-V4/issues/231), [VPJ-23 #213](https://github.com/JTCAO515/VP-V4/issues/213), [VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226), [VPJ-30 #221](https://github.com/JTCAO515/VP-V4/issues/221), [VPJ-55 #236](https://github.com/JTCAO515/VP-V4/issues/236)
- Allowed: `docs/benchmarks/network/**`, `scripts/diagnostics/**`, `artifacts/VPJ-39/**`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-39/verification.md`, `artifacts/VPJ-39/unrun.md`, `artifacts/VPJ-39/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: JT performs only the named external/decision steps; actual accounts, permissions and evidence must exist. Missing access is an explicit operator outcome, never fabricated completion.
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 按真实海外/境内WiFi/漫游/弱网记录DNS→API→DB→model/map/media的p50/p95/失败，不用provider国籍推断可达。
- [ ] 设置超时、断线恢复和离线读取目标，验证语音长连接/图片导入在预算内。
- [ ] 地区不合格时给实际替代拓扑和用户边界；采购或部署变更不自行执行。
- [ ] 在真实境内外网络验证OTA参数落地、StoreKit购买/恢复、APNs接收与回跳、Files/Share Extension导入，不以model测试代替这些不同链路。

## VPJ-40

[VPJ-40 #233](https://github.com/JTCAO515/VP-V4/issues/233) — 原生视觉动效、无障碍与性能整链复验

- Owner: coding-agent; 5专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-13 #203](https://github.com/JTCAO515/VP-V4/issues/203), [VPJ-20 #210](https://github.com/JTCAO515/VP-V4/issues/210), [VPJ-21 #211](https://github.com/JTCAO515/VP-V4/issues/211), [VPJ-23 #213](https://github.com/JTCAO515/VP-V4/issues/213), [VPJ-25 #215](https://github.com/JTCAO515/VP-V4/issues/215), [VPJ-27 #217](https://github.com/JTCAO515/VP-V4/issues/217), [VPJ-28 #218](https://github.com/JTCAO515/VP-V4/issues/218), [VPJ-29 #220](https://github.com/JTCAO515/VP-V4/issues/220), [VPJ-30 #221](https://github.com/JTCAO515/VP-V4/issues/221), [VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226), [VPJ-48 #235](https://github.com/JTCAO515/VP-V4/issues/235), [VPJ-64 #238](https://github.com/JTCAO515/VP-V4/issues/238), [VPJ-49 #241](https://github.com/JTCAO515/VP-V4/issues/241), [VPJ-55 #236](https://github.com/JTCAO515/VP-V4/issues/236), [VPJ-61 #240](https://github.com/JTCAO515/VP-V4/issues/240), [VPJ-36 #228](https://github.com/JTCAO515/VP-V4/issues/228)
- Allowed: `ios/**`, `tests/**/ios/**`, `docs/design/**`, `artifacts/VPJ-40/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-40/verification.md`, `artifacts/VPJ-40/unrun.md`, `artifacts/VPJ-40/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 统一Cream/Ink/Plum/Gold与原始VP资产；对话/计划/sheet/键盘/返回锚点同一状态语义。
- [ ] 真机/Simulator完成小屏大屏、大字VoiceOver、Reduce Motion/Transparency、来电低电量弱网；录屏展示可中断动效。
- [ ] 结构卡原子出现、滚动不抢位、已保存动画只在回执后；用profile定位性能不写未测FPS。
- [ ] 在#198真实选区Ask消费者上复验sheet、焦点、返回锚点、大字与VoiceOver及拒绝/关闭状态；不能仅引用#188基础屏幕证据完成整链验收。

## VPJ-41

[VPJ-41 #234](https://github.com/JTCAO515/VP-V4/issues/234) — 精简 Web Planning Studio 的最终体验验收

- Owner: coding-agent; 4专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192), [VPJ-20 #210](https://github.com/JTCAO515/VP-V4/issues/210), [VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226)
- Allowed: `app/**`, `components/**`, `lib/i18n.ts`, `tests/**/frontend/**`, `docs/design/**`, `public/assets/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:e2e`
- Evidence: `artifacts/VPJ-41/verification.md`, `artifacts/VPJ-41/unrun.md`, `artifacts/VPJ-41/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] Web保留Chat/Trip基本编辑/diff确认/材料状态/权益，现场工具引导iOS；同Trip连续性可测。
- [ ] 公开Landing/Explore明确当前可用/覆盖/第三方预订，Early Access邮箱同意可撤。
- [ ] 桌面+390x844、中英、键盘无障碍/真实品牌资产/claim scan通过；不重做第二全功能App。
- [ ] 真实Web消费者按VP响应规范呈现主结果、必要限定与下一步；英文原生表达、中英状态一致，正文不控制按钮权限/确认目标，保留轻量同Trip范围与原有可访问性门。

## VPJ-42

[VPJ-42 #242](https://github.com/JTCAO515/VP-V4/issues/242) — TestFlight 实机贯通 Plan、Ready、Travel 三段

- Owner: operator; 5专注日，外部审批/账号/真机/网络等待另计
- Blocked by: [VPJ-08 #196](https://github.com/JTCAO515/VP-V4/issues/196), [VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206), [VPJ-21 #211](https://github.com/JTCAO515/VP-V4/issues/211), [VPJ-24 #214](https://github.com/JTCAO515/VP-V4/issues/214), [VPJ-28 #218](https://github.com/JTCAO515/VP-V4/issues/218), [VPJ-29 #220](https://github.com/JTCAO515/VP-V4/issues/220), [VPJ-32 #224](https://github.com/JTCAO515/VP-V4/issues/224), [VPJ-35 #227](https://github.com/JTCAO515/VP-V4/issues/227), [VPJ-36 #228](https://github.com/JTCAO515/VP-V4/issues/228), [VPJ-37 #229](https://github.com/JTCAO515/VP-V4/issues/229), [VPJ-38 #230](https://github.com/JTCAO515/VP-V4/issues/230), [VPJ-39 #232](https://github.com/JTCAO515/VP-V4/issues/232), [VPJ-40 #233](https://github.com/JTCAO515/VP-V4/issues/233), [VPJ-41 #234](https://github.com/JTCAO515/VP-V4/issues/234), [VPJ-48 #235](https://github.com/JTCAO515/VP-V4/issues/235), [VPJ-55 #236](https://github.com/JTCAO515/VP-V4/issues/236), [VPJ-56 #237](https://github.com/JTCAO515/VP-V4/issues/237), [VPJ-58 #239](https://github.com/JTCAO515/VP-V4/issues/239), [VPJ-61 #240](https://github.com/JTCAO515/VP-V4/issues/240), [VPJ-64 #238](https://github.com/JTCAO515/VP-V4/issues/238), [VPJ-65 #219](https://github.com/JTCAO515/VP-V4/issues/219), [VPJ-49 #241](https://github.com/JTCAO515/VP-V4/issues/241)
- Allowed: `docs/acceptance/**`, `tests/e2e/**`, `artifacts/VPJ-42/**`, `docs/runbooks/**`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-42/verification.md`, `artifacts/VPJ-42/unrun.md`, `artifacts/VPJ-42/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: JT performs only the named external/decision steps; actual accounts, permissions and evidence must exist. Missing access is an explicit operator outcome, never fabricated completion.
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 邀请受控用户在原生build完成一个真实Trip的Plan/Ready/Travel，含外跳、离线、恢复、拒绝/取消。
- [ ] 真实owner/RLS/provider/数据/网络/权限证明与TestFlight build关联；sandbox购买不算收入。
- [ ] 所有首发必需项有功能/异常/数据/UX/运行证据；只修验收缺陷，不靠fixture替代。
- [ ] 非技术经营留存与真实付费效果由47观察，不因旅行节点未到而伪称成功/失败。
- [ ] 真实设备与账号贯通#198选区Ask、明确确认、跨端/重载及拒绝路径；基础壳、模拟数据或仅#188完成不能替代本项联合验收。

## VPJ-43

[VPJ-43 #243](https://github.com/JTCAO515/VP-V4/issues/243) — 独立 Production 与可回滚的客户服务环境

- Owner: operator; 3专注日，外部审批/账号/真机/网络等待另计
- Blocked by: [VPJ-38 #230](https://github.com/JTCAO515/VP-V4/issues/230), [VPJ-42 #242](https://github.com/JTCAO515/VP-V4/issues/242)
- Allowed: `docs/runbooks/**`, `scripts/db/**`, `docs/operator-actions.json`, `artifacts/VPJ-43/**`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-43/verification.md`, `artifacts/VPJ-43/unrun.md`, `artifacts/VPJ-43/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: JT performs only the named external/decision steps; actual accounts, permissions and evidence must exist. Missing access is an explicit operator outcome, never fabricated completion.
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 独立Production项目/服务凭证/配置和备份，与Staging严格分离；迁移前后验证和回滚完整。
- [ ] 隐私/Terms/support域名/资产/地区契约已齐备，功能旗标按能力设置。
- [ ] 实际部署由operator控制，secrets不写repo；不能用Preview通过替代Production验收。

## VPJ-44

[VPJ-44 #244](https://github.com/JTCAO515/VP-V4/issues/244) — 正式 App Store 1.0 提交与数字商品审核

- Owner: operator; 3专注日，外部审批/账号/真机/网络等待另计
- Blocked by: [VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226), [VPJ-40 #233](https://github.com/JTCAO515/VP-V4/issues/233), [VPJ-43 #243](https://github.com/JTCAO515/VP-V4/issues/243)
- Allowed: `ios/**`, `docs/release/**`, `docs/runbooks/**`, `artifacts/VPJ-44/**`
- Checks: `pnpm docs:check`; `git diff --check`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-44/verification.md`, `artifacts/VPJ-44/unrun.md`, `artifacts/VPJ-44/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: JT performs only the named external/decision steps; actual accounts, permissions and evidence must exist. Missing access is an explicit operator outcome, never fabricated completion.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] TestFlight测试轨与AppStore完整1.0生产轨区分；满足当前Xcode/SDK、隐私清单、AI第三方同意和账号删除要求。
- [ ] 中英元数据/实机截图/支持/隐私URL、reviewer访问、IAP审查与恢复说明对应实际功能。
- [ ] JT执行签名/提交/发布，拒审按原因修复；未通过不宣称已上架。

## VPJ-45

[VPJ-45 #245](https://github.com/JTCAO515/VP-V4/issues/245) — 客户收到产品后的观察、支持与发布关账

- Owner: operator; 3专注日，72h系统观察+至少7天机会相关跟踪；实际旅行节点未到标not_observed
- Blocked by: [VPJ-42 #242](https://github.com/JTCAO515/VP-V4/issues/242), [VPJ-44 #244](https://github.com/JTCAO515/VP-V4/issues/244)
- Allowed: `docs/acceptance/**`, `docs/runbooks/**`, `artifacts/VPJ-45/**`, `docs/handoff.json`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-45/verification.md`, `artifacts/VPJ-45/unrun.md`, `artifacts/VPJ-45/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: JT performs only the named external/decision steps; actual accounts, permissions and evidence must exist. Missing access is an explicit operator outcome, never fabricated completion.
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 至少72小时系统观察与7天机会相关用户跟踪；自助/人工帮助、拒绝/激活、sandbox/真实购买分开。
- [ ] 支持队列、退款/删除、事故回滚、知识失效有负责人和实测响应。
- [ ] 发布门全部关闭且未解决严重问题为0才结束Program产品交付；不以下载量作为完成。

## VPJ-46

[VPJ-46 #246](https://github.com/JTCAO515/VP-V4/issues/246) — 每周35小时客户发现、招募与材料工作坊

- Owner: operator; 2专注日，每周30–40小时、首两周校准；effort仅建立流程，不是整段观察时长
- Blocked by: 无任务依赖；核实际条件
- Allowed: `docs/operations/**`, `docs/commercial/**`, `artifacts/VPJ-46/**`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-46/verification.md`, `artifacts/VPJ-46/unrun.md`, `artifacts/VPJ-46/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: JT performs only the named external/decision steps; actual accounts, permissions and evidence must exist. Missing access is an explicit operator outcome, never fabricated completion.
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 执行总35h时间盘：真实客户任务10、研发验收8、招募社区6、内容合作4、知识审查3、支持2、复盘2；30–40h按需求伸缩。
- [ ] 两个周sprint只跑自有/转介绍+一个社区+一个伙伴渠道；3–4访谈+1–2交付起步；禁止未请求群发。
- [ ] Planning/Arriving/In-trip队列、opt-in、原话/行为/来源/分钟数去敏记录；为Supported Journey Matrix提供真实需求。
- [ ] 初期使用许可内现有入口或VPJ-62 intake，不等待地图/支付/完整App；Founder-assisted与产品自助明确。
- [ ] 按规划/临近抵达/在途分别记录真实首值、重复问题与下一自然节点机会；Demo、创始人协助与自助真实能力分别统计，不从社媒触达推断已实现。

## VPJ-47

[VPJ-47 #247](https://github.com/JTCAO515/VP-V4/issues/247) — 真实激活、付费与人工成本的经营观察

- Owner: operator; 2专注日，按B0-B4真实分母；至少两轮有效cohort，不设伪日历保证
- Blocked by: [VPJ-42 #242](https://github.com/JTCAO515/VP-V4/issues/242), [VPJ-44 #244](https://github.com/JTCAO515/VP-V4/issues/244), [VPJ-46 #246](https://github.com/JTCAO515/VP-V4/issues/246)
- Allowed: `docs/commercial/**`, `docs/operations/**`, `apps/ops/**`, `artifacts/VPJ-47/**`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-47/verification.md`, `artifacts/VPJ-47/unrun.md`, `artifacts/VPJ-47/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: JT performs only the named external/decision steps; actual accounts, permissions and evidence must exist. Missing access is an explicit operator outcome, never fabricated completion.
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] activated=采用可继续使用的真实Trip结果；outcome_recorded可含拒绝，不能混为激活。
- [ ] opportunity-based organic/triggered/founder-prompted回访分开；真实净付款与退款/赠送/sandbox分开。
- [ ] 依据主报告单一B0-B4门和容量/现金止损决策，不以一个OR指标杀整个Program；少样本明确不确定。
- [ ] 经营指标以有机会的服务任务/Trip为分母，区分Free/Pass、人工辅助、真实支付与sandbox；保留必要澄清次数、任务成本及实际人工分钟，旧Ask数值不可当同等新服务容量。

## VPJ-48

[VPJ-48 #235](https://github.com/JTCAO515/VP-V4/issues/235) — 用户旅行内容投稿与发布前审核

- Owner: coding-agent; 5专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-14 #204](https://github.com/JTCAO515/VP-V4/issues/204), [VPJ-20 #210](https://github.com/JTCAO515/VP-V4/issues/210), [VPJ-36 #228](https://github.com/JTCAO515/VP-V4/issues/228)
- Allowed: `ios/**`, `apps/ops/**`, `lib/server/community/**`, `supabase/migrations/**`, `tests/**/community/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-48/verification.md`, `artifacts/VPJ-48/unrun.md`, `artifacts/VPJ-48/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 注册用户可提交旅行体验/求助，所有内容发布前审；官方/员工身份披露。
- [ ] 提交→pending→reviewed→published/rejected→用户撤回形成完整小链；举报/屏蔽/申诉/删除扩展由VPJ-64承担，未完成不得公开UGC。
- [ ] 内容可关联地点/Save/Add to Trip，但体验不自动晋升Fact；无私信/关注/无限社交feed。

## VPJ-49

[VPJ-49 #241](https://github.com/JTCAO515/VP-V4/issues/241) — 最简本地旅行分享卡与隐私预览

- Owner: coding-agent; 2专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192), [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199)
- Allowed: `ios/**`, `lib/server/sharing/**`, `tests/**/sharing/**`, `docs/design/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-49/verification.md`, `artifacts/VPJ-49/unrun.md`, `artifacts/VPJ-49/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 一款中英本地分享模板，用户选择字段→隐私预览→系统Share Sheet，基础分享无需公共托管。
- [ ] 模板只使用获权资产，标明AI生成或用户体验；不能伪造订单/见证。
- [ ] 分享前可隐藏酒店/订单/同行/日期等私密字段；已导出图片不能远端撤回；复杂模板/视频/托管分享另期开启。

## VPJ-50

[VPJ-50 #248](https://github.com/JTCAO515/VP-V4/issues/248) — 有真实召回失败才启用混合 RAG 与重排

- Owner: coding-agent; 5专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206), [VPJ-17 #207](https://github.com/JTCAO515/VP-V4/issues/207)
- Allowed: `lib/server/knowledge/retrieval/**`, `evals/**`, `docs/benchmarks/**`, `supabase/migrations/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `pnpm evals`
- Evidence: `artifacts/VPJ-50/verification.md`, `artifacts/VPJ-50/unrun.md`, `artifacts/VPJ-50/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 以实际qrels/语料规模触发实验，对同批直接读取baseline比较exact/FTS/trigram/vector/RRF。
- [ ] PGroonga、rerank、Contextual Retrieval逐项消融；权限/时效/例外/反证切片不回退。
- [ ] 只有质量/延迟/成本净收益才开放；extension版本/许可/恢复失败可回滚直接lookup。
- [ ] HF复用：真实激活门保持；明确契约与范围后可先用公开/自有合成数据作有界离线加载、格式和对照准备，不视为本票激活或真实收益。先判定缺内容/别名、排名或召回问题；每轮最多两个候选、只改一个检索变量。
- [ ] HF复用：优先Sentence Transformers验证，收益成立后再评估TEI；精确核Qwen/BGE各权重许可与revision及运行后端支持，不由embedding支持推定reranker兼容。模型库不替代RLS，主线保留原Postgres/直接lookup回退。

## VPJ-51

[VPJ-51 #249](https://github.com/JTCAO515/VP-V4/issues/249) — 航班来源采购与中国航线实测

- Owner: operator; 3专注日，外部审批/账号/真机/网络等待另计
- Blocked by: [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190), [VPJ-39 #232](https://github.com/JTCAO515/VP-V4/issues/232)
- Allowed: `docs/benchmarks/aviation/**`, `docs/runbooks/**`, `artifacts/VPJ-51/**`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-51/verification.md`, `artifacts/VPJ-51/unrun.md`, `artifacts/VPJ-51/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: JT performs only the named external/decision steps; actual accounts, permissions and evidence must exist. Missing access is an explicit operator outcome, never fabricated completion.
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 按中国境内/跨境航线样本比较coverage/延迟/许可/价格/归因/存储，不直接选择名气最大。
- [ ] 记录字段权威/TTL和无coverage返回，operator批准数据用途与budget。
- [ ] 不购买/出票/爬取受限系统。

## VPJ-52

[VPJ-52 #250](https://github.com/JTCAO515/VP-V4/issues/250) — 授权航班状态与相关行程重验

- Owner: coding-agent; 4专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-17 #207](https://github.com/JTCAO515/VP-V4/issues/207), [VPJ-29 #220](https://github.com/JTCAO515/VP-V4/issues/220), [VPJ-51 #249](https://github.com/JTCAO515/VP-V4/issues/249)
- Allowed: `lib/server/external-evidence/flight/**`, `ios/**`, `tests/**/flight/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-52/verification.md`, `artifacts/VPJ-52/unrun.md`, `artifacts/VPJ-52/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 单主Flight Adapter显示有效观察与来源时刻，延误信息映射到相关Trip重验候选。
- [ ] unknown/取消/过期不自动重订；用户确认后才改变Trip。
- [ ] 撤权、停用、供应商超时和无覆盖演练，不侵入酒店/铁路交易。

## VPJ-53

[VPJ-53 #251](https://github.com/JTCAO515/VP-V4/issues/251) — Android 与新增语言的需求触发设计

- Owner: operator; 2专注日，外部审批/账号/真机/网络等待另计
- Blocked by: [VPJ-45 #245](https://github.com/JTCAO515/VP-V4/issues/245), [VPJ-47 #247](https://github.com/JTCAO515/VP-V4/issues/247)
- Allowed: `docs/product/**`, `docs/benchmarks/**`, `artifacts/VPJ-53/**`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-53/verification.md`, `artifacts/VPJ-53/unrun.md`, `artifacts/VPJ-53/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: JT performs only the named external/decision steps; actual accounts, permissions and evidence must exist. Missing access is an explicit operator outcome, never fabricated completion.
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 根据真实需求决定Android/西俄阿的先后，不从schema兼容推断已支持。
- [ ] 复用同协议/Trip/entitlement，平台原生体验、语料和无障碍分别验收。
- [ ] 给独立容量/预算/迁移计划后再拆实现，不把本研究当客户端开发。

## VPJ-54

[VPJ-54 #252](https://github.com/JTCAO515/VP-V4/issues/252) — 长期订阅或交易深度升级的证据决策

- Owner: operator; 2专注日，外部审批/账号/真机/网络等待另计
- Blocked by: [VPJ-45 #245](https://github.com/JTCAO515/VP-V4/issues/245), [VPJ-47 #247](https://github.com/JTCAO515/VP-V4/issues/247)
- Allowed: `docs/commercial/**`, `docs/adr/**`, `artifacts/VPJ-54/**`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-54/verification.md`, `artifacts/VPJ-54/unrun.md`, `artifacts/VPJ-54/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: JT performs only the named external/decision steps; actual accounts, permissions and evidence must exist. Missing access is an explicit operator outcome, never fabricated completion.
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 只有重复旅行/持续价值证据才考虑Plus月/年订阅；只读Live Offer、代客执行、签约履约按品类分别决策。
- [ ] 比较责任、服务成本、恢复/退款和排名中立性；不把affiliate增长自动当升级理由。
- [ ] 没有授权保持当前Free+Pass与L1a/L1b；本Issue只决策，不启用外部交易。

## VPJ-55

[VPJ-55 #236](https://github.com/JTCAO515/VP-V4/issues/236) — 文件与系统分享导入、邀请链接接回原意图

- Owner: coding-agent; 4专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191), [VPJ-12 #201](https://github.com/JTCAO515/VP-V4/issues/201)
- Allowed: `ios/**`, `app/api/artifacts/**`, `lib/server/artifacts/**`, `tests/**/artifacts/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:e2e`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-55/verification.md`, `artifacts/VPJ-55/unrun.md`, `artifacts/VPJ-55/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] Share Extension/Files沿已验材料通道投递，支持一类限定页数PDF并保持关键字段校正。
- [ ] Universal Link/邀请/登录回跳/未安装回退/链接过期都有明确路径，安装后不承诺系统无法保证的自动传递。
- [ ] AppGroup按账号命名空间、TTL/退出/删除清理；恶意文件/重复导入不覆盖Trip。

## VPJ-56

[VPJ-56 #237](https://github.com/JTCAO515/VP-V4/issues/237) — 原生 CI、签名 Archive 与首个 TestFlight 安装包

- Owner: operator; 4专注日，外部审批/账号/真机/网络等待另计
- Blocked by: [VPJ-01 #188](https://github.com/JTCAO515/VP-V4/issues/188)
- Allowed: `ios/**`, `.github/workflows/**`, `scripts/ios/**`, `docs/runbooks/**`, `artifacts/VPJ-56/**`
- Checks: `pnpm docs:check`; `git diff --check`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-56/verification.md`, `artifacts/VPJ-56/unrun.md`, `artifacts/VPJ-56/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: JT performs only the named external/decision steps; actual accounts, permissions and evidence must exist. Missing access is an explicit operator outcome, never fabricated completion.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] macOS CI锁稳定Xcode版本并跑原生build/tests，artifact保存xcresult与bundle版本；PR不用生产秘密。
- [ ] JT完成Apple账号/BundleID/签名/上传，产出首个可安装TestFlight构建；只证明分发，不证明完整产品。
- [ ] 记录实际上传SDK要求和证书轮换/构建失败/撤回路径；42复用该轨，44正式上架。

## VPJ-57

[VPJ-57 #222](https://github.com/JTCAO515/VP-V4/issues/222) — 用户服务请求与按任务授予资料访问

- Owner: coding-agent; 4专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190), [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191), [VPJ-14 #204](https://github.com/JTCAO515/VP-V4/issues/204)
- Allowed: `ios/**`, `apps/ops/**`, `lib/server/service-cases/**`, `lib/server/identity/**`, `supabase/migrations/**`, `tests/**/service-cases/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-57/verification.md`, `artifacts/VPJ-57/unrun.md`, `artifacts/VPJ-57/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 用户创建CaseRequest、预览要分享字段、授予有期限AccessGrant，指定员工才可读取。
- [ ] 撤回/到期/换员工/其他用户无法继续读取；未授权仍可请求通用支持。
- [ ] 此单提供31/32共同依赖的case身份与授权，不承诺真人已接单。
- [ ] 真人路径以具体旅途执行问题申请为范围；申请已记录不等于接单，未确认容量/时段不承诺即时处理或把普通行前规划默认转人工。

## VPJ-58

[VPJ-58 #239](https://github.com/JTCAO515/VP-V4/issues/239) — 全数据模块导出删除与恢复后的最终隔离验收

- Owner: coding-agent; 3专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-30 #221](https://github.com/JTCAO515/VP-V4/issues/221), [VPJ-32 #224](https://github.com/JTCAO515/VP-V4/issues/224), [VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226), [VPJ-36 #228](https://github.com/JTCAO515/VP-V4/issues/228), [VPJ-48 #235](https://github.com/JTCAO515/VP-V4/issues/235), [VPJ-64 #238](https://github.com/JTCAO515/VP-V4/issues/238), [VPJ-24 #214](https://github.com/JTCAO515/VP-V4/issues/214), [VPJ-49 #241](https://github.com/JTCAO515/VP-V4/issues/241), [VPJ-55 #236](https://github.com/JTCAO515/VP-V4/issues/236), [VPJ-28 #218](https://github.com/JTCAO515/VP-V4/issues/218), [VPJ-61 #240](https://github.com/JTCAO515/VP-V4/issues/240), [VPJ-25 #215](https://github.com/JTCAO515/VP-V4/issues/215)
- Allowed: `tests/security/**`, `tests/integration/**`, `docs/acceptance/**`, `artifacts/VPJ-58/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`
- Evidence: `artifacts/VPJ-58/verification.md`, `artifacts/VPJ-58/unrun.md`, `artifacts/VPJ-58/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 整合Trip/材料/记忆/Brief/Case/UGC/举报/通知/权益的数据注册与export/delete handler。
- [ ] 删除中有新任务/通知/社区发布的竞态、恢复后tombstone、离线回网和账号切换均测试。
- [ ] 保留法定字段和外部已导出副本边界准确，任一必需runtime未验则阻塞42。
- [ ] 终验运行在订单引用/本地分享/AppGroup/Guide缓存/归档/离线模块全部存在之后；每个后续数据模块变化必须重跑handler注册与删除恢复验收。

## VPJ-59

[VPJ-59 #194](https://github.com/JTCAO515/VP-V4/issues/194) — 首个真实模型任务的预算预留与故障止损

- Owner: coding-agent; 4专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-02 #189](https://github.com/JTCAO515/VP-V4/issues/189), [VPJ-06 #193](https://github.com/JTCAO515/VP-V4/issues/193)
- Allowed: `lib/server/model-gateway/budget/**`, `lib/server/jobs/**`, `lib/server/observability/**`, `lib/flags/**`, `supabase/migrations/**`, `tests/**/cost/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`
- Evidence: `artifacts/VPJ-59/verification.md`, `artifacts/VPJ-59/unrun.md`, `artifacts/VPJ-59/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 真实调用前做server预算/并发预留，调用后usage结算，取消/超时/无usage尾包进入补偿/待核。
- [ ] 按task与attempt分别限额，kill flag在调用前实际消费，不能只有配置字段。
- [ ] 两worker重复任务和进程崩溃成本账一致；此单不依赖购买IAP，35才加商品额度。
- [ ] Q37下区分ServiceTask业务归属、Turn和provider/tool attempt：必要澄清与修复共享任务成本上限，逐attempt真实计量和未知费用对账；先支持记录模式与持久成本保护，不依赖IAP或未定服务额度数值。

## VPJ-60

[VPJ-60 #200](https://github.com/JTCAO515/VP-V4/issues/200) — 图片和语音 Provider 的中英质量与数据流验收

- Owner: coding-agent; 4专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190), [VPJ-06 #193](https://github.com/JTCAO515/VP-V4/issues/193)
- Allowed: `lib/server/media/**`, `lib/server/media-translation/**`, `evals/**`, `docs/benchmarks/media/**`, `tests/**/media/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm evals`
- Evidence: `artifacts/VPJ-60/verification.md`, `artifacts/VPJ-60/unrun.md`, `artifacts/VPJ-60/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 用许可内合成材料验证实际region OCR/vision、ASR和TTS任务能力、usage、取消/删除，不假定文本模型具备媒体。
- [ ] 中英数字/否定/姓名/日期/字幕朗读一致性及失败输出分任务切片报告。
- [ ] 选择最少合格媒体路径，未验证能力不进入12/27；密钥不进客户端。

## VPJ-61

[VPJ-61 #240](https://github.com/JTCAO515/VP-V4/issues/240) — 旅行结束、归档与下一次回来

- Owner: coding-agent; 3专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192), [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199), [VPJ-32 #224](https://github.com/JTCAO515/VP-V4/issues/224)
- Allowed: `ios/**`, `lib/server/trip/**`, `lib/server/memory/**`, `supabase/migrations/**`, `tests/**/trip/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-61/verification.md`, `artifacts/VPJ-61/unrun.md`, `artifacts/VPJ-61/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 用户主动结束/归档Trip；时间已过不等于行程完成，归档不删除未完服务。
- [ ] 提示选择跨Trip保留的偏好，拒绝/跳过可用；创建下一Trip不复活旧时效约束。
- [ ] 最多3草稿+1Active规则可测，旧Trip可读/导出，Pass到期不抹成果。

## VPJ-62

[VPJ-62 #202](https://github.com/JTCAO515/VP-V4/issues/202) — 公开中英申请入口与隐私可控的招募漏斗

- Owner: coding-agent; 3专注日，PR/实际任务验证窗口
- Blocked by: 无任务依赖；核实际条件
- Allowed: `app/**`, `components/**`, `lib/i18n.ts`, `lib/server/intake/**`, `tests/**/intake/**`, `docs/operations/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:e2e`
- Evidence: `artifacts/VPJ-62/verification.md`, `artifacts/VPJ-62/unrun.md`, `artifacts/VPJ-62/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 一页真实范围说明→邮箱/最少资料opt-in→回执→退出，页面可在完整App前作为研究招募使用。
- [ ] 沿已有允许入口复用，staff/Founder-assisted/fixture说明准确，不声称已可下载完整App。
- [ ] 事件schema分申请/同意/入组/首值/拒绝，防重复/垃圾请求，营销同意与研究同意分开。

## VPJ-63

[VPJ-63 #231](https://github.com/JTCAO515/VP-V4/issues/231) — 登录、Ask 与 Trip 的境内外网络首轮探针

- Owner: operator; 2专注日，外部审批/账号/真机/网络等待另计
- Blocked by: [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191), [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195)
- Allowed: `scripts/diagnostics/**`, `docs/benchmarks/network/**`, `artifacts/VPJ-63/**`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-63/verification.md`, `artifacts/VPJ-63/unrun.md`, `artifacts/VPJ-63/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: JT performs only the named external/decision steps; actual accounts, permissions and evidence must exist. Missing access is an explicit operator outcome, never fabricated completion.
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 尽早测真实海外与境内普通网络的登录/Ask/Trip/API/DB/model，不等完整语音和地图。
- [ ] 明确每段失败原因/延迟和可用退路；无法实测地域标operator evidence missing。
- [ ] 不切生产拓扑，仅为39的全媒体/OTA/IAP网络验收提供基线。

## VPJ-64

[VPJ-64 #238](https://github.com/JTCAO515/VP-V4/issues/238) — 社区举报、屏蔽、申诉与内容删除

- Owner: coding-agent; 3专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-14 #204](https://github.com/JTCAO515/VP-V4/issues/204), [VPJ-36 #228](https://github.com/JTCAO515/VP-V4/issues/228), [VPJ-48 #235](https://github.com/JTCAO515/VP-V4/issues/235)
- Allowed: `ios/**`, `apps/ops/**`, `lib/server/community/**`, `supabase/migrations/**`, `tests/**/community/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-64/verification.md`, `artifacts/VPJ-64/unrun.md`, `artifacts/VPJ-64/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 公开UGC前补齐举报→运营处置→回执、用户屏蔽、审核拒绝/申诉、作者撤回/删除。
- [ ] 员工利益关系/来源/著作权字段可见；用户体验不得自动发布为Fact。
- [ ] 挂接privacy handler，避免下架后Explore/缓存/引用继续可见；无私信/关注系统。

## VPJ-65

[VPJ-65 #219](https://github.com/JTCAO515/VP-V4/issues/219) — 真实地点与依据支撑的完整计划核验

- Owner: coding-agent; 4专注日，PR/实际任务验证窗口
- Blocked by: [VPJ-09 #197](https://github.com/JTCAO515/VP-V4/issues/197), [VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206), [VPJ-19 #209](https://github.com/JTCAO515/VP-V4/issues/209)
- Allowed: `ios/**`, `lib/server/trip/**`, `lib/server/constraints/**`, `lib/server/knowledge/**`, `tests/**/planning/**`, `evals/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm evals`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-65/verification.md`, `artifacts/VPJ-65/unrun.md`, `artifacts/VPJ-65/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- Rollback: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

- [ ] 相对日草稿补成具体日期/实际地点时逐项解析身份、地址、路线和入场约束。
- [ ] 不完整依据仍可保留用户决定但标待核，plan feasible只能由当前必要证据支持。
- [ ] 整条有依据Proposal→diff→确认→TripItemSupport→以后重验可追溯。
- [ ] 计划适合度由最新明确需求与相关基础偏好参与，但步行量、时间、地点和可行性仍需同口径合格证据；不得因品牌个性化而放宽来源或晚餐锁。
- [ ] HF复用：借TravelPlanner等的有限约束检查结构并用独立oracle验最终计划，保留真实来源/版本/时区/用户约束；不执行外部hard_logic_py/任意DSL，不将ChinaTravel/Open-Travel的NC数据或历史价目直接导入商业运行链。

## VPJ-66

[VPJ-66 #263](https://github.com/JTCAO515/VP-V4/issues/263) — Harness：两条离线旅行任务可运行、判分并定位失败

- Owner: coding-agent; 2专注日，有界PR验证；真实环境/人工校准等待另计
- Blocked by: 无任务依赖；核实际条件
- Allowed: `evals/harness/**`, `tests/**/harness/**`, `scripts/run-ci-suite.mjs`, `docs/harness/**`, `artifacts/VPJ-66/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm evals`
- Evidence: `artifacts/VPJ-66/verification.md`, `artifacts/VPJ-66/unrun.md`, `artifacts/VPJ-66/commands.jsonl`, `artifacts/VPJ-66/results.json`
- 接口: docs/harness/README.md; Red lines: RL-01, RL-02, RL-03, RL-04, RL-05, RL-06, RL-07
- 运行门: 本规划已合并；既有版本化合同足以支持两个离线种子。无需provider、数据库或operator授权，不能为方便测试读取实际凭据。
- Rollback: 移除本票新增场景/报告接入，保留原eval与安全测试；不涉及真实业务数据。

- [ ] 从现有 pnpm evals 入口完整运行无 Trip 问答和保留晚餐的局部调整两个合成开发种子，得到一个 JSON 报告与可读摘要；本票只验收离线准备。
- [ ] 记录 producer→adapter→consumer→assertion 复用清单，区分 fixture/in-memory/live；定位现有 Trip 路由/RPC、ContextPlan、ToolGateway 和模型/预算接缝，不另造框架。
- [ ] 定义12个独立场景及6类覆盖，8开发/4分层holdout；每例有固定输入/时钟/证据/Trip版本、允许结果、禁止行为、oracle及required mode。翻译/参数变体不能跨组泄漏或充数。
- [ ] 两个种子分别注入一个可复现错误：不支持的关键claim、晚餐或未确认写入保护被破坏时，判分器稳定FAIL并指出步骤；全拒答不能通过正常可答案例。
- [ ] 其余未接通场景标NOT_RUN并映射VPJ-67/68/69，报告独立案例数、语言、运行数与模式；旧AI-42元数据组合不能计入行为覆盖。
- [ ] 报告执行状态、业务outcome、验收verdict和配置/grader版本分开；仅allowlist元数据。离线测试不连provider、不写真实Trip、不扣用户额度。
- [ ] 准备验收以两个正常种子PASS及故意失败被检出为准；明确12场景和真实服务验收尚未完成。

## VPJ-67

[VPJ-67 #264](https://github.com/JTCAO515/VP-V4/issues/264) — Harness：真实只读问答产生有依据的结果与回执

- Owner: coding-agent; 4专注日，有界PR验证；真实环境/人工校准等待另计
- Blocked by: [VPJ-66 #263](https://github.com/JTCAO515/VP-V4/issues/263), [VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206)
- Allowed: `lib/server/turn/**`, `lib/server/context/**`, `lib/server/knowledge/**`, `lib/server/observability/**`, `app/api/chat/**`, `components/chat/**`, `ios/VisePanda/**`, `evals/harness/**`, `tests/**/harness/**`, `docs/harness/**`, `artifacts/VPJ-67/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm evals`
- Evidence: `artifacts/VPJ-67/verification.md`, `artifacts/VPJ-67/unrun.md`, `artifacts/VPJ-67/commands.jsonl`, `artifacts/VPJ-67/results.json`
- 接口: docs/harness/README.md; Red lines: RL-01, RL-02, RL-03, RL-04, RL-05, RL-06, RL-07
- 运行门: VPJ-16继承VPJ-07及真实身份/provider/预算/知识门；接口、获准Staging、测试身份、provider接收方和批次费用上限必须实际可用。 按共享流程可先交独立fixture准备PR；真实中英客户端、证据与只读无写入验收缺失时父票不得关闭。
- Native: 本票实际受影响原生路径必须build/test并附中英交互证据；先xcrun simctl list devices available，记录实际UDID替换后的xcodebuild test命令及版本/xcresult。真实账号/worker/服务不可用标UNRUN；Simulator不替代原票的真机/商店门。
- Rollback: 关闭本票整合检查点并恢复原支持路径；不清空用户任务、不改授权或预算账本。

- [ ] 获准测试用户在真实原生Ask无需创建Trip即可获得answered/partial/clarification/blocked/technical_failure及对应证据；复用VPJ-07/16实际producer/consumer，不重建基础能力。
- [ ] 服务端身份和用途/接收方资格始终成立，正常可答/部分可答/缺字段/证据过期与冲突/资料注入/provider不可用均有命名观察；只读请求前后Trip数量和内容不变。
- [ ] 关键claim有当前适用证据和对应校验回执；必要claim遗漏、过度拒答和无谓追问能被判失败，固定快照不冒充实时核验。
- [ ] 任务ID可追至attempt、上下文/证据/工具版本、原因码、终态、耗时、预算及实际usage；仅allowlist字段，缺失费用标unknown。
- [ ] 把12场景中本票负责的只读案例接入必测集合；fixture与真实Staging分栏，中英各至少一条实际任务链通过，不能以界面文字或mock结票。
- [ ] 验证原生消费者和现有Web Chat的结果语义，保留老客户端兼容；本票不扩充Web范围。

## VPJ-68

[VPJ-68 #265](https://github.com/JTCAO515/VP-V4/issues/265) — Harness：少走路且保留已确认晚餐的局部改稿闭环

- Owner: coding-agent; 4专注日，有界PR验证；真实环境/人工校准等待另计
- Blocked by: [VPJ-67 #264](https://github.com/JTCAO515/VP-V4/issues/264), [VPJ-10 #198](https://github.com/JTCAO515/VP-V4/issues/198), [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199), [VPJ-65 #219](https://github.com/JTCAO515/VP-V4/issues/219)
- Allowed: `lib/server/trip/**`, `lib/server/constraints/**`, `lib/server/context/**`, `lib/server/memory/**`, `app/api/trips/**`, `components/canvas/**`, `ios/VisePanda/**`, `evals/harness/**`, `tests/**/harness/**`, `docs/harness/**`, `artifacts/VPJ-68/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm evals`
- Evidence: `artifacts/VPJ-68/verification.md`, `artifacts/VPJ-68/unrun.md`, `artifacts/VPJ-68/commands.jsonl`, `artifacts/VPJ-68/results.json`
- 接口: docs/harness/README.md; Red lines: RL-01, RL-02, RL-03, RL-04, RL-05, RL-06, RL-07
- 运行门: 真实Trip、局部提案、可纠正上下文及计划依据由VPJ-10/11/65验收；获准测试身份/数据/路线依据必须存在。 受影响Web路径做桌面与390×844交互/console检查，原生做实际确认/拒绝/重载；全量设备发布门仍归原票。
- Native: 本票实际受影响原生路径必须build/test并附中英交互证据；先xcrun simctl list devices available，记录实际UDID替换后的xcodebuild test命令及版本/xcresult。真实账号/worker/服务不可用标UNRUN；Simulator不替代原票的真机/商店门。
- Rollback: 停用本票整合入口，保留已确认Trip及手动编辑路径；不得回写撤销已发生的用户确认或改历史迁移。

- [ ] 用户对当前Trip要求第二天少走路、不动已确认晚餐；沿现有候选→可见diff→精确版本确认→原子Patch→重载路径验收，不另建writer。
- [ ] 按同日期/时区、出行模式、来源版本和口径比较步行距离或步行时长，运行前选择主要步行指标并要求其严格减少，另一指标辅助披露，不能删必保留项目换成功；基础数据归VPJ-65/19。证据不足只算待核候选，不算已验证少走路。
- [ ] 晚餐item ID、地点、日期/时区、起止时间、确认状态及回执在候选/diff/最终Trip均不变；当前明确要求优先于旧偏好但不能覆盖权限与安全。
- [ ] 用户确认绑定不可变proposal revision与base Trip revision；未确认、拒绝、过期、越权/撤权以及另一客户端修改均不误写或覆盖，重复确认不重复提交。
- [ ] 按12场景规格接入约束/偏好/证据不足及确认冲突案例；原生中英结果和精简Web同Trip/diff语义一致，应用后重载与事务回执一致。
- [ ] 报告fixture与获准真实环境、测量依据及失败案例；缺路线口径或真实原子回执不可用不能关闭本票。

## VPJ-69

[VPJ-69 #266](https://github.com/JTCAO515/VP-V4/issues/266) — Harness：故障取消与重连不伪造成功或重复提交

- Owner: coding-agent; 3专注日，有界PR验证；真实环境/人工校准等待另计
- Blocked by: [VPJ-68 #265](https://github.com/JTCAO515/VP-V4/issues/265)
- Allowed: `lib/server/turn/**`, `lib/server/jobs/**`, `lib/server/observability/**`, `app/api/chat/**`, `ios/VisePanda/**`, `components/chat/**`, `evals/harness/**`, `tests/**/harness/**`, `docs/harness/**`, `artifacts/VPJ-69/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm evals`
- Evidence: `artifacts/VPJ-69/verification.md`, `artifacts/VPJ-69/unrun.md`, `artifacts/VPJ-69/commands.jsonl`, `artifacts/VPJ-69/results.json`
- 接口: docs/harness/README.md; Red lines: RL-01, RL-02, RL-03, RL-04, RL-05, RL-06, RL-07
- 运行门: VPJ-68经VPJ-10→VPJ-09继承VPJ-08的恢复门；不重复建设任务、事件或预算账本。 仅在获准隔离Staging、测试任务与预算下故障注入；无获准worker/持久数据则真实恢复UNRUN，保持父票开放。
- Native: 本票实际受影响原生路径必须build/test并附中英交互证据；先xcrun simctl list devices available，记录实际UDID替换后的xcodebuild test命令及版本/xcresult。真实账号/worker/服务不可用标UNRUN；Simulator不替代原票的真机/商店门。
- Rollback: 移除测试故障注入和新增整合点，保留已发生账目/提交、最终回执与原有恢复能力。

- [ ] 对同一真实任务在接受请求、工具返回、提案生成、提交前后及流式尾包命名检查点注入超时/重复投递/进程崩溃/断网/取消，重新进入得到真实最终状态。
- [ ] 用户扣次和Trip提交不重复；provider attempt可能重复收费须真实计量。提交或usage未知先核验/对账，不盲重试副作用。
- [ ] 取消阻止后续新副作用；提交已发生则显示已提交，不能伪称撤销。旧租约不能继续提交，跨账号旧事件不能回放。
- [ ] 实际Staging持久worker/数据/客户端在进程重启后仍恢复同一任务；进程内fake只能作为准备证据。任务次数/期限/费用均有预设上限。
- [ ] 将12场景中的故障与取消案例及命名注入点加入回归，保存实际最终状态/回执/失败矩阵；原生中英及现有Web受影响恢复路径验证。

## VPJ-70

[VPJ-70 #267](https://github.com/JTCAO515/VP-V4/issues/267) — Harness：只读模型或提示词候选的配对评测与校准

- Owner: coding-agent; 3专注日，有界PR验证；真实环境/人工校准等待另计
- Blocked by: [VPJ-67 #264](https://github.com/JTCAO515/VP-V4/issues/264), [VPJ-72 #287](https://github.com/JTCAO515/VP-V4/issues/287)
- Allowed: `evals/harness/**`, `tests/**/harness/**`, `docs/benchmarks/**`, `lib/server/model-gateway/prompt/**`, `docs/harness/**`, `artifacts/VPJ-70/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm evals`
- Evidence: `artifacts/VPJ-70/verification.md`, `artifacts/VPJ-70/unrun.md`, `artifacts/VPJ-70/commands.jsonl`, `artifacts/VPJ-70/results.json`
- 接口: docs/harness/README.md; Red lines: RL-01, RL-02, RL-03, RL-04, RL-05, RL-06, RL-07
- 运行门: 真实只读、模型和预算依赖由VPJ-67→VPJ-16→VPJ-07继承；允许合成评分器准备先行，真实配对及人工校准缺失不能结票。 使用现有获准配置；产品负责人在候选运行前冻结评分容差与费用上限，缺失时仅做无外发的离线准备或已获准基线采集。
- Rollback: 撤销候选配置，保持基线与原报告；不切换生产配置、不覆盖业务状态。

- [ ] 在获准的同一只读任务链上比较现有基线与一个明确候选，输出采纳/拒绝/证据不足及逐例证据；可只改提示词，不要求新增provider或自动生产路由。
- [ ] 固定任务输入、时钟、证据、权限、预算政策、grader与版本，开发集调优、holdout只作冻结后评测；污染案例登记后转开发集并补未用于调优的holdout。
- [ ] 先允许baseline_only；候选运行前由产品负责人记录质量容差、正常可答/必要claim不退化、延迟/单任务/整批费用上限和预声明收益。缺数值或预算许可只报evidence_insufficient，不作通过。
- [ ] 每个适用只读场景每配置起步重复3次并分中英/风险汇总；样本数、失败、NOT_RUN及unknown成本同时报告，不能用总体均分掩盖切片失败或小样本宣称统计显著。
- [ ] 确定性红线与质量rubric分开；人工校准正反例、记录grader分歧，不由生成模型自评或看结果后改标准。回归中故意退化候选须被拒绝。
- [ ] 交付同一JSON报告/Markdown摘要与可复用配对入口；本票关闭限于只读比较，Trip配对与最终能力判定保留VPJ-71。新接收方/地区必须先满足原数据政策门。
- [ ] 在既有配对入口加入任务完成、事实限定、正确偏好使用、下一步、密度、英文自然度及情境语气rubric；人工校准并预冻结阈值，正常可答的过度拒绝判失败，hard fail不被均分抵消。
- [ ] HF复用：消费VPJ-72的离线内容判分与盲评包，保留A/B交换、平局/都失败、评分来源和反馈版本；工具验证或合成标注不冒充真实人工校准。HF Judge/Guidebook只借方法，真实候选仍走本票原许可/预算/事前阈值。

## VPJ-71

[VPJ-71 #268](https://github.com/JTCAO515/VP-V4/issues/268) — Harness：核心任务发布判定与能力停用恢复验收

- Owner: coding-agent; 3专注日，有界PR验证；真实环境/人工校准等待另计
- Blocked by: [VPJ-69 #266](https://github.com/JTCAO515/VP-V4/issues/266), [VPJ-70 #267](https://github.com/JTCAO515/VP-V4/issues/267), [VPJ-37 #229](https://github.com/JTCAO515/VP-V4/issues/229), [VPJ-63 #231](https://github.com/JTCAO515/VP-V4/issues/231)
- Allowed: `evals/harness/**`, `tests/**/harness/**`, `lib/server/observability/**`, `lib/flags/**`, `docs/acceptance/**`, `docs/runbooks/**`, `docs/benchmarks/**`, `docs/harness/**`, `artifacts/VPJ-71/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm evals`
- Evidence: `artifacts/VPJ-71/verification.md`, `artifacts/VPJ-71/unrun.md`, `artifacts/VPJ-71/commands.jsonl`, `artifacts/VPJ-71/results.json`
- 接口: docs/harness/README.md; Red lines: RL-01, RL-02, RL-03, RL-04, RL-05, RL-06, RL-07
- 运行门: VPJ-69/70实际验收完成，VPJ-37 Ops停用与VPJ-63真实网络证据可用；产品负责人已冻结本轮完整集合阈值。 获准Staging能力停用/恢复与部署回退窗口实际存在；生产开放仍需对应对象/环境/范围有效授权。
- Rollback: 停用本轮候选/整合，保留可审计报告与既有安全不变量；保持Trip和删除/撤权状态，不回退已应用数据库历史。

- [ ] 使用同一选定commit/config与预冻结grader/阈值整合两条任务；选定配置可为达到门槛的原基线，仅对拟采纳候选复用VPJ-70入口扩充Trip配对。候选被拒可保留基线，不强制新增候选；完整回归与停用责任仍必需。
- [ ] 完整12场景按required mode实际运行，必测集无FAIL/NOT_RUN；中英/风险/正常可答分别达门槛，未运行不删除分母、全拒答不算成功，命名集硬违规0但不外推绝对可靠。
- [ ] 真实原生Ask/Trip、精简Web同Trip、持久worker、证据资格、步行量、准确确认/回执与预算/恢复证据可串联；fixture和录制回放不能替代规定真实模式。
- [ ] 接入已有Ops/flag及发布报告，复用VPJ-63同版本或等价受影响路径的真实境内外网络证据；路径变化需重验，不用本机/VPN假装用户网络。
- [ ] 在获准Staging演练按能力停用、恢复与部署回退，用户有可用替代，已确认Trip和删除/撤权状态不丢失；不改已应用迁移、不恢复撤销材料。
- [ ] 先验证故意失败或缺证据能阻塞判定，再提交实际结果；基线/候选变化重跑受影响集合，不拼接不同配置的通过报告。
- [ ] Harness门纳入现有发布验收资料；本票不授权生产、不自动关闭VPJ-41/42/43/45，不替代真实账号、原生设备、IAP、隐私或商店验收。
- [ ] 同一已选配置的两条真实中英任务同时验证ServiceTask必要澄清不重复消费、正确偏好使用及真实状态表达；保留12场景required mode与全部原门，表达更好不替代真实正确性/恢复/费用证据。
- [ ] HF复用：最终报告同时核验真实任务结果和内容/语气，不以讨喜均分抵消状态、事实、记忆、确认硬失败；确认公开基准、开发集和独立验收集的暴露记录，采用资源版本/许可/运行环境可追。

## VPJ-72

[VPJ-72 #287](https://github.com/JTCAO515/VP-V4/issues/287) — 中英回答离线内容判分与可导入反馈的盲评包

- Owner: coding-agent; 3专注日，有界准备PR；真实调用/人工校准/产品集成在原父票验证
- Blocked by: [VPJ-66 #263](https://github.com/JTCAO515/VP-V4/issues/263)
- Allowed: `evals/harness/response-quality/**`, `tests/**/response-quality/**`, `evals/harness/pairing/**`, `docs/harness/hf-reuse/**`, `artifacts/VPJ-72/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm evals`
- Evidence: `artifacts/VPJ-72/verification.md`, `artifacts/VPJ-72/unrun.md`, `artifacts/VPJ-72/commands.jsonl`, `artifacts/VPJ-72/results.json`
- 接口: docs/harness/hf-reuse/README.md; Red lines: RL-01, RL-02, RL-04, RL-05, RL-06, RL-07
- 运行门: VPJ-66已完成，PR277配对接口已在main；只用自有合成样本与已有报告，无真实provider/数据库依赖。 本地反馈界面可选现有静态输出；需要依赖时固定版本和许可，不把安装框架当结果。
- Rollback: 回退新增判分/盲评入口与报告版本适配，保留旧pairing及已有反馈/证据；不改变线上配置。

- [ ] 开发者从主线已存在的配对报告生成中英离线内容/语气判分与本机盲评包，导入反馈后得到同一版本化JSON/Markdown结果；完整交付限于离线工具和反例。
- [ ] 复用既有pairing schema/版本/hash及报告，不重建runner或模型路由；优先静态/Markdown，真实交互不足时才用本机Gradio且无公网分享。
- [ ] 明确回应目标、证据限定、下一步、偏好适用、密度、英文自然和情境语气的有锚点rubric；事实/权限/确认/虚构执行结果硬失败独立否决，正常可答案例过度拒绝被检出。 可确定校验的状态/回执使用确定性断言；语义事实支持和自然度需要人工或经校准judge，未评项标NOT_RUN，不以关键词匹配声称通用语义判分。
- [ ] 自有中英正常/错误输出通过完整入口验证；交换A/B、平局/都失败、重复反馈去重、错误case/version拒绝、反馈来源human/fixture明确。合成标签不能记为人工评审。
- [ ] 保留8开发/4holdout及12场景口径，登记已暴露样本；外部例需repo/revision/来源/许可，自有例不伪称外部benchmark正式得分，不复制NC教程正文或数据。
- [ ] 报告可供#267消费，并明确真实provider配对/人工校准/采用判定仍UNRUN；未执行离线全流程或反例失败不能关闭本票。

## VPJ-73

[VPJ-73 #288](https://github.com/JTCAO515/VP-V4/issues/288) — Docling合成旅行材料解析与校正候选试验

- Owner: coding-agent; 3专注日，有界准备PR；真实调用/人工校准/产品集成在原父票验证
- Blocked by: 无任务依赖；核实际条件
- Allowed: `scripts/experiments/docling/**`, `tests/**/docling/**`, `docs/harness/hf-reuse/**`, `artifacts/VPJ-73/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm evals`
- Evidence: `artifacts/VPJ-73/verification.md`, `artifacts/VPJ-73/unrun.md`, `artifacts/VPJ-73/commands.jsonl`, `artifacts/VPJ-73/results.json`
- 接口: docs/harness/hf-reuse/README.md; Red lines: RL-01, RL-02, RL-04, RL-05, RL-06, RL-07
- 运行门: 明确本票是独立本地试验，不依赖真实材料/provider/账号；只采用可核验许可的输入和组件。 实际转换命令由本票实现并记录在commands.jsonl，不预填尚不存在的Docling脚本命令；必要Python依赖与资源在隔离环境核对。
- Rollback: 移除隔离试验入口与本票自有临时样本，保留采用/否决依据；不改既有材料入口、用户数据或迁移。

- [ ] 用自有合成中英旅行截图评估固定Docling管线，输出带原材料ID/位置/字段/不完整状态的校正候选与可复现采用或否决报告；可搜索PDF仅作对照，不扩#201单张截图或#236多页产品范围。
- [ ] 运行前登记框架与所用解析器/权重各自许可、revision和资产；不默认使用许可矛盾的SmolDocling，不启用未审remote code、远程服务或外部插件。下载准备与真正离线运行分开证明。 在运行前固定小型中英样本与关键字段/来源位置oracle、采用/否决判据和有限输入/时长/内存上限，禁止跑后挑样或改阈值。
- [ ] 可运行分支必须保留可重复的实际转换证据，覆盖日期/时区、金额币种、小字/折行、缺失信息和OCR错误，保留可回看的原位置，错误由校正候选呈现；不可运行分支不填转换PASS，按本票有据否决路径处理。
- [ ] 可运行分支验证文件限额、取消/超时、重复材料与材料内恶意指令只作内容；不连接真实用户、数据库、provider或Trip writer。保留实际资源/耗时、命令与失败，不编造中文效果。
- [ ] 结论为有据ADOPT或REJECT：可运行分支按事前冻结样本/真值/判据判断；不可运行分支仅在固定组件/版本的具体许可或兼容阻断证据充分且已评估替代路线后作REJECT，明确转换/性能UNRUN。仅未安装/缺环境或证据不足时保持OPEN/UNRUN。
- [ ] 有采用价值时提供到现有材料候选合同的差异和后续#201/#236集成清单；否决不阻塞这些父票采用其他合格实现，不宣称材料已审核或全部格式/真实产品通过。

# VPJ Issue 执行合同

生成自issue-plan.json。当前共享流程见 [development-workflow.md](../../agents/development-workflow.md) / ADR-0024。
阅读当前Issue/PR、本行、受影响接口与代码；历史研究按需读取。

Checks列是完整Issue验收清单；每条PR按实际改动选择本地验证，保留适用CI和最终运行门。
Allowed列标示主要范围；必要的相邻文件调整、维护任务和独立准备片段按共享流程记录。
运行依赖未完成时父Issue保持未验收；fixture不证明设备、数据库、provider或生产通过。

## 默认条款

下列三条对全部任务生效。任务行写「默认」即适用本节原文；偏离的任务在自己行里写出完整条款。

- 运行门（默认）: 本片实际输入与接口可用即可开始；上游Issue仍open不单独阻止有界实施。完整验收仍核对列出的技术依赖与真实环境。 Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- 不得触碰（默认）: No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.；No secrets, original user worktree, old applied migrations, branch protection or production actions.；No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.；No archived research/test oracle deletion or invented runtime/provider/Store result.
- Rollback（默认）: Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.

## VPJ-01

[VPJ-01 #188](https://github.com/JTCAO515/VP-V4/issues/188) — 原生 iOS 五入口、中英文与可访问的首个 Trip 页面

- Owner: coding-agent; vertical; 4专注日，PR/实际任务验证窗口
- 验收阶段: S1
- Blocked by: 无任务依赖；核实际条件
- Allowed: `ios/**`, `lib/i18n.ts`, `tests/**/locale/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-01/verification.md`, `artifacts/VPJ-01/unrun.md`, `artifacts/VPJ-01/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-01.md`, `docs/contracts/vp-response-policy.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 审计并移植本地 IOS-01 壳的允许行为到 main，保留原始未跟踪文件；原生 SwiftUI，默认 Ask，Trip/Explore/Ask/Tools/Profile。
- [ ] 一个真实屏幕在 zh/en、Dynamic Type、VoiceOver、Reduce Motion 下可用；最低 iOS17，上传工具链满足当前 Apple 要求。
- [ ] 语言发布名单变为 zh/en，es/ru/ar 不向新用户承诺；现有 legacy locale payload兼容策略和五语回归迁移可审查。
- [ ] 首个Ask/Trip屏幕冻结语义token/字体/通用状态与sheet手势，不把所有视觉设计留到整链QA。
- [ ] 保留已接受Logo与成熟清爽视觉，状态文字遵守VP响应规范、英文优先且中英事实一致；本票验收原生基础屏幕、最低系统/可访问性和通用呈现，不将预览文案优化当真实AI能力。
- [ ] 本票不等待已登录真实Trip的选区Ask、Proposal确认和持久重载；这些消费者在#198实现、#233整链UX和#242真机贯通验收。原iOS17、VoiceOver、Dynamic Type、Reduce Motion及基础交互门仍须实证，不因职责澄清自动关闭。

## VPJ-02

[VPJ-02 #189](https://github.com/JTCAO515/VP-V4/issues/189) — 现有 Staging 的真实身份、迁移与 owner 隔离验证

- Owner: operator; operational; 2专注日，外部审批/账号/真机/网络等待另计
- 验收阶段: S1
- Blocked by: 无任务依赖；核实际条件
- Allowed: `scripts/db/**`, `docs/runbooks/**`, `artifacts/VPJ-02/**`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-02/verification.md`, `artifacts/VPJ-02/unrun.md`, `artifacts/VPJ-02/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: Agent完成已有授权内的开发与配置；只将确需本人交互或未授权实际外部动作交给JT，不索取额外产品或第三方许可。 Missing access is an explicit operator outcome, never fabricated completion.
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-02.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 确认目标确为无真实用户的现有 Staging，记录24条迁移实际状态和差异，不重建历史。
- [ ] 真实 owner/other-user/anon 三类读取与写入验证；正常数据库、pooler、worker路径分别记录。
- [ ] 输出脱敏配置结果与可执行下一步；失败不伪装通过，不创建Production。

## VPJ-03

[VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190) — 用户对话、材料、模型地区与人工访问的数据政策

### 执行边界与首个切片

- 首个可交付结果：核对一个当前启用的文本数据流，给出与实际policy/接收方一致的中英告知、撤回及保留说明，并保留未知项。
- 本票责任/非目标：负责数据政策与告知；执行删除归36/58，真实provider协议归06。复用已修正的披露矩阵，不重新声称零外发。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/policy/vpj-03-data-disclosure.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/policy/vpj-03-data-disclosure.md) · [artifacts/VPJ-03/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-03/verification.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; decision; 3专注日，实际账号/签名/真机/网络等待另计，不含已取消的供应商审批
- 验收阶段: S1
- Blocked by: 无任务依赖；核实际条件
- Allowed: `docs/adr/**`, `docs/policy/**`, `docs/runbooks/**`, `docs/operator-actions.json`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-03/verification.md`, `artifacts/VPJ-03/unrun.md`, `artifacts/VPJ-03/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: 已有账号/API或官方入口可用即可由agent接入；未披露信息标unknown，不以第三方/法务/产品审批阻塞开发。 实际账号不可访问或接口不可用时记录技术原因；真实购买、上架和生产动作按已有授权范围执行。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-03.md`, `docs/contracts/basic-preferences-cross-trip.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 清楚给出中英告知、目的、保留期限、处理地域、第三方AI接收方、撤回、删除/备份和客服访问矩阵。
- [ ] 沿用已提供的经营主体与留存决定；agent依据公开文档、控制台及实际配置记录接收方，未知项如实标注，不等待供应商、法务或产品许可；Owner角色不自动授予跨用户普通读取。
- [ ] 列出设备端/服务端材料两路径和不授权时可用功能；不要求用户提交密码、验证码、卡号。
- [ ] Q36基础明确偏好的account/Trip/仅本次范围、来源、纠正版本、模型与人工接收方、撤回后队列/缓存/派生物处理进入数据政策；Free/Pass均不替代用户许可。

## VPJ-04

[VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191) — 原生登录、手机登录顶替与 Web 会话并存

### 执行边界与首个切片

- 首个可交付结果：复用已有原生登录、换机和Web并存链，针对自然过期或丢失回执完成一条尚未验收的真实恢复路径。
- 本票责任/非目标：负责身份/session；不重建02环境或05的Trip业务，也不以模拟器结果替代未验真机条件。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [artifacts/VPJ-04/staging-native/remote-20260911/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-04/staging-native/remote-20260911/verification.md) · [artifacts/VPJ-04/iphone-custom-domain-20260912/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-04/iphone-custom-domain-20260912/verification.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 5专注日，PR/实际任务验证窗口
- 验收阶段: S1
- Blocked by: [VPJ-02 #189](https://github.com/JTCAO515/VP-V4/issues/189)
- 集成/最终验收依赖（普通关联）: [VPJ-01 #188](https://github.com/JTCAO515/VP-V4/issues/188)
- Allowed: `ios/**`, `lib/server/identity/**`, `app/api/auth/**`, `supabase/migrations/**`, `tests/**/identity/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `pnpm test:e2e`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-04/verification.md`, `artifacts/VPJ-04/unrun.md`, `artifacts/VPJ-04/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-04.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] iOS bearer/session路径可登录/刷新/退出，Web cookie路径继续使用原CSRF/Origin保护。
- [ ] 第二手机登录使第一手机会话失效，不踢Web；Keychain/本地缓存/推送绑定正确账号。
- [ ] 真实iOS→API→RLS owner/other-user及token过期验证，不能以放开Origin实现原生支持。

## VPJ-05

[VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192) — 同一 Trip 在 iOS 与精简 Web 创建、编辑和重载

### 执行边界与首个切片

- 首个可交付结果：复用已落地的两端Trip/Proposal接口，补一个并发改动、未知确认回执或硬锁显示的实际缺口。
- 本票责任/非目标：负责同Trip数据和确认重载；AI生成归09/10，全计划可行性归65，整链视觉归40。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [artifacts/VPJ-05/staging-create-20260912/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-05/staging-create-20260912/verification.md) · [artifacts/VPJ-04/staging-native/remote-20260911/locale-followup.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-04/staging-native/remote-20260911/locale-followup.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 5专注日，PR/实际任务验证窗口
- 验收阶段: S1
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191)
- Allowed: `ios/**`, `app/api/trips/**`, `components/canvas/**`, `lib/server/trip/**`, `tests/**/trip/**`, `supabase/migrations/**`, `lib/server/identity/**`, `components/trips/**`, `components/today/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `pnpm test:e2e`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-05/verification.md`, `artifacts/VPJ-05/unrun.md`, `artifacts/VPJ-05/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-05.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 复用现有Day/Item与snapshot/CAS；两端同一Trip新增/修改后重载一致。
- [ ] 草稿、confirmed版本、用户硬锁和外部订单状态可分辨，冲突提示保留用户编辑。
- [ ] 改变确认计划沿现有Proposal/Confirm/Patch，不创建第二套Trip数据库。

## VPJ-06

[VPJ-06 #193](https://github.com/JTCAO515/VP-V4/issues/193) — Qwen、GLM、DeepSeek 的真实调用与质量成本对照

### 执行边界与首个切片

- 首个可交付结果：从已有HTTP适配器和真实C0记录开始，固定同批中英输入，验证一个尚缺的provider协议/usage路径，再形成同口径成本质量对照。
- 本票责任/非目标：负责协议与候选资格；业务回答归07，真实任务提示词配对/人工校准归70，不另建模型网关。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [artifacts/VPJ-06/http-transport-verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-06/http-transport-verification.md) · [artifacts/VPJ-06/live-c0-20260910/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-06/live-c0-20260910/verification.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 5专注日，PR/实际任务验证窗口
- 验收阶段: S2
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)
- Allowed: `lib/server/model-gateway/**`, `evals/**`, `tests/**/model-gateway/**`, `docs/benchmarks/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm evals`
- Evidence: `artifacts/VPJ-06/verification.md`, `artifacts/VPJ-06/unrun.md`, `artifacts/VPJ-06/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-06.md`, `docs/harness/hf-reuse/README.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 每家按实际地域/账户记录准确model ID、结构输出、tool call、usage、timeout和取消，不假定OpenAI兼容即一致。
- [ ] 用相同中英旅行任务比较质量、约束、延迟和完整计费；默认一个主provider与最多一条通过相同用户同意与服务端范围检查的fallback，由agent配置。
- [ ] 输出主模型/强模型选择和价格版本，所有日志无正文/秘密；缺安全凭据时记录具体待接入项，继续可独立验证的适配/离线对照；真实调用保持UNRUN，不伪造结果或把整票自动标blocked。
- [ ] HF复用：继续复用已合并三家协议适配和预算接口；仅按明确缺口借HF叶子组件或离线评测，不用smolagents/Lighteval/HF Inference另起无预算路由；采用项固定代码/模型revision并分别核许可、输入去向与回退。

## VPJ-07

[VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195) — 真实文本与持久任务执行基础

### 执行边界与首个切片

- 首个可交付结果：保留现有文本纵切和真实worker验收；为新助手模式提供实际执行/恢复接缝。
- 本票责任/非目标：本票保留text/grounded旧模式；持续会话归VPJ-78，多步骤规划归VPJ-80，不能把启用worker当完整助手升级。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [artifacts/VPJ-07/grounded-service-20260913/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-07/grounded-service-20260913/verification.md) · [artifacts/VPJ-07/worker-service-20260912/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-07/worker-service-20260912/verification.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 5专注日，PR/实际任务验证窗口
- 验收阶段: S2
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191), [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192), [VPJ-06 #193](https://github.com/JTCAO515/VP-V4/issues/193), [VPJ-59 #194](https://github.com/JTCAO515/VP-V4/issues/194)
- Allowed: `ios/**`, `app/api/chat/**`, `lib/server/turn/**`, `lib/server/jobs/**`, `supabase/migrations/**`, `tests/**/turn/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `pnpm test:e2e`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-07/verification.md`, `artifacts/VPJ-07/unrun.md`, `artifacts/VPJ-07/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-07.md`, `docs/contracts/service-task-metering.md`, `docs/contracts/vp-response-policy.md`, `docs/harness/hf-reuse/README.md`, `docs/product/assistant-upgrade-2026-09-27/README.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 仅完成一个文本请求的持久input→worker→provider→最终回答→原生读取纵切；流式/多模态另单。
- [ ] answered/partial/clarification/blocked/technical_failure各有中英用户结果；技术失败不计成功。
- [ ] taskId与用户扣次幂等，lease expiry/worker crash/重复投递/cancel race/隔离和terminal-once可测；供应商attempt可能重复计费，逐次记录而非承诺费用绝不重复。
- [ ] 终端用户同意AI处理前无其个人数据外发，fallback接收方重新验scope；拒绝许可保留手动Trip路径。
- [ ] 按ServiceTask规划契约关联一项明确目标的多轮Turn，必要澄清和系统修复不新建用户消费；归属由服务端核验，partial/完成后改稿/TTL等未决收费策略保持不启用。
- [ ] 真实输出producer采用版本化VP内容与表达策略，英文直接创作、中英事实与动作状态一致；沿现有schema显式扩展并验证消费者，不新增人格服务或无约束二次润色。
- [ ] 体验增量2026-09-17：五种结果均给出自然中英用户结果和可执行下一步，不以outcome/intent代码作为最终回答；answered先给结论，partial保留可靠部分并指出具体缺口，clarification只问影响当前目标的一项，blocked给许可内替代，technical_failure给同任务恢复入口。必要澄清和系统修复沿既有ServiceTask，不以表达优化新增扣次。
- [ ] 体验增量2026-09-17：在受支持城市输入“机场地址”等有歧义问题时，仅用已核实实体构造必要选择；未知城市/实体不猜测，已有上下文不重复索取。复用#206已验行为与当前证据资格；正常可答却全拒答、技术失败伪称缺知识、没有来源的选项均为失败。
- [ ] 助手升级2026-09-27：向VPJ-78/80提供当前真实job、授权、attempt成本、取消与完成回执接缝；新模式通过版本化接入，既有文本模式边界及已勾选证据保持原范围。

## VPJ-08

[VPJ-08 #196](https://github.com/JTCAO515/VP-V4/issues/196) — 流式回答在断网、后台和跨端重连后接续

### 执行边界与首个切片

- 首个可交付结果：在现有cursor/replay上核对任务进度和成果引用的兼容扩展接缝。
- 本票责任/非目标：负责可恢复事件传输；VPJ-78负责关联语义、VPJ-79负责成果、VPJ-81负责不阻塞的主会话。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [artifacts/VPJ-08/native-events-staging-20260913/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-08/native-events-staging-20260913/verification.md) · [artifacts/VPJ-08/native-cancel-staging-20260913/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-08/native-cancel-staging-20260913/verification.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 4专注日，PR/实际任务验证窗口
- 验收阶段: S2
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195)
- Allowed: `ios/**`, `app/api/chat/**`, `lib/server/turn/**`, `lib/server/jobs/**`, `tests/**/turn/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:e2e`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-08/verification.md`, `artifacts/VPJ-08/unrun.md`, `artifacts/VPJ-08/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-08.md`, `docs/contracts/service-task-metering.md`, `docs/contracts/vp-response-policy.md`, `docs/product/assistant-upgrade-2026-09-27/README.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] SSE/事件协议提供稳定eventId/cursor；一次已验结构卡以原子事件出现。
- [ ] 断网重连、App后台、取消、服务重启不丢最终回答、不双扣Ask、不重复Trip提交。
- [ ] 跨账号旧事件不可回放；流式tail usage缺失进入待核账。
- [ ] 同一ServiceTask跨轮/断网/重连保持归属，必要澄清或系统恢复不重复消费；状态文案来自实际事件，取消生成、未提交Proposal和已提交Trip分别呈现。
- [ ] 助手升级2026-09-27：新增任务/成果事件需持久cursor与去重、schema兼容和账号失效保护；SSE不是唯一存储，晚到事件不能抢焦点、复活撤回内容或把旧成果标为当前。

## VPJ-09

[VPJ-09 #197](https://github.com/JTCAO515/VP-V4/issues/197) — 个性化旅行方向比较与可确认计划

### 执行边界与首个切片

- 首个可交付结果：以新用户无精确日期的真实想法产出有取舍的方向，逐步接到可版本化成果和同Trip草稿。
- 本票责任/非目标：负责方向/相对日规划及草稿生产；VPJ-79负责成果存储，VPJ-65负责真实地点与完整可行性，VPJ-80负责后台执行。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 5专注日，PR/实际任务验证窗口
- 验收阶段: S3
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192), [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195), [VPJ-08 #196](https://github.com/JTCAO515/VP-V4/issues/196)
- Allowed: `ios/**`, `lib/server/turn/**`, `lib/server/constraints/**`, `lib/server/trip/**`, `tests/**/planning/**`, `evals/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm evals`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-09/verification.md`, `artifacts/VPJ-09/unrun.md`, `artifacts/VPJ-09/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-09.md`, `docs/product/assistant-upgrade-2026-09-27/README.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 无精确日期/订单也可先出方向和相对日草稿；日期预算未知明确且追问可跳过。
- [ ] 两种真正有取舍的方案→日程对象→diff→确认→两端重载；已有Trip不被全量覆盖。
- [ ] 时间、预算、固定项由确定性校验；缺实时依据标unknown不把想象时刻当可行。
- [ ] 本单仅相对日方向/用户提供地点草稿；真实地点与grounded计划由VPJ-65补齐，不能把未解析地点当可执行。
- [ ] Chat→Plan过渡、键盘、diff和返回锚点随此功能验收。
- [ ] 体验增量2026-09-17：对“第一次去上海四天、喜欢吃和散步、日期未定”的输入，先交有取舍的方向及首段可修改的相对日草稿，再补仍会改变方案的信息；目的明确时不强凑两案，不等待全部坐标/素材就绪，也不编造实际营业/抵离时间。仍保留本票相对日/用户提供地点边界，真实地点与可执行性归#219。
- [ ] 助手升级2026-09-27：前台先呈现体验、偏好与取舍，准备事项随阶段展开；十天/多城市输入不得被旧2–7天本地规则静默截断，未覆盖范围诚实说明并保留可交付部分。
- [ ] 助手升级2026-09-27：选方向、保存草稿、提交已确认Trip分开；成果带输入/偏好/证据版本，修改仅重算受影响部分，持久读回由VPJ-79合同承接。

## VPJ-10

[VPJ-10 #198](https://github.com/JTCAO515/VP-V4/issues/198) — 选中一天或项目后与 VP 局部改稿

### 执行边界与首个切片

- 首个可交付结果：把选中成果/Trip范围交给VP，呈现保留项、变化与影响并确认准确版本。
- 本票责任/非目标：唯一承接局部候选到已确认Trip；VPJ-79只引用Proposal，不建第二个writer，VPJ-81/83消费同一结果。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 4专注日，PR/实际任务验证窗口
- 验收阶段: S3
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-09 #197](https://github.com/JTCAO515/VP-V4/issues/197)
- Allowed: `ios/**`, `components/canvas/**`, `lib/server/trip/**`, `lib/server/constraints/**`, `tests/**/planning/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:e2e`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-10/verification.md`, `artifacts/VPJ-10/unrun.md`, `artifacts/VPJ-10/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-10.md`, `docs/product/assistant-upgrade-2026-09-27/README.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 选中范围→Ask→局部候选→影响/diff→确认→回到原位置；未选对象保持不动。
- [ ] 用户可直接移日/排序/改时，手动编辑与硬锁区别明确。
- [ ] 并发更新旧proposal不能提交；撤销Trip修改不能伪装取消外部订单。
- [ ] 负责已登录真实Trip的选区→Ask sheet→局部Proposal/diff→确认→回到原对象与位置→重载闭环；复用#188基础导航/样式/可访问性，拒绝或关闭sheet不得误确认，真实凭据/数据条件缺失保留未验收。
- [ ] 体验增量2026-09-17：局部改稿展示新增/移日/替换/移除及受影响时间与接驳，说明保留的已确认事项和备选去向；不只回复“已加入”。步行改善仅在#219同口径证据具备时声明，否则保留待核候选；diff、确认目标、返回选区和重载均绑定同一Trip版本，拒绝或旧版本无误写。
- [ ] 助手升级2026-09-27：从VP/Journeys/Library进入同一成果或proposal时保持对象和revision；纠正记忆、换Trip或新base使旧候选失效，重新审阅后才能确认，不把方向选择当成交。

## VPJ-11

[VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199) — 可见Memory与真实偏好消费、纠正和遗忘

### 执行边界与首个切片

- 首个可交付结果：打通Memory独立页面→明确保存→真实规划使用→纠正/撤回→相关结果变化的一条链。
- 本票责任/非目标：唯一负责Profile/Memory字段权威、资格投影和纠正；VPJ-83提供一级tab、VPJ-81提供上下文呈现，禁止另建画像库。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 4专注日，PR/实际任务验证窗口
- 验收阶段: S3
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190), [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192), [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195)
- Allowed: `ios/**`, `lib/server/memory/**`, `lib/server/context/**`, `supabase/migrations/**`, `tests/**/memory/**`, `app/api/memory/**`, `lib/server/identity/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `pnpm test:e2e`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-11/verification.md`, `artifacts/VPJ-11/unrun.md`, `artifacts/VPJ-11/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-11.md`, `docs/contracts/basic-preferences-cross-trip.md`, `docs/harness/hf-reuse/README.md`, `docs/product/assistant-upgrade-2026-09-27/README.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 当前Trip事实、working context、显式跨Trip偏好分别管理；推断预算先只用于当前Trip。
- [ ] 纠正/本次不用/忘记后，下一轮上下文和待处理工作不复活旧记录。
- [ ] 同意、来源、scope、版本和memory-use依据可追；Free同样保留当前Trip安全约束和纠错权。
- [ ] Q36明确基础偏好对Free/Pass共同可用并跨Trip；保留Profile/Memory每字段唯一权威，用任务专用资格投影接入真实消费者，不能把管理列表整体注入模型。
- [ ] 通过跨Trip、当前要求覆盖旧默认、纠正/撤回后排队与重试、跨账号迟到响应验证；明确记住且范围许可清楚不重复询问，推断和敏感画像不自动保存，偏好不得改写已确认Trip或替代外部证据。
- [ ] HF复用：借LongMemEval更新/跨会话方法编写自有中英反例，分别观察资格、Context入选、实际使用与撤回；管理API不充当模型检索，Profile/Memory字段保持唯一权威源，不为benchmark新建画像或向量库。
- [ ] 记忆新增/更新实际成功后，顶部轻提示“已加入记忆/Saved to memory”，仅“撤销/Undo”，默认4秒自动隐藏；不抢焦点、不阻断输入。摘要有现成允许内容才附一行，不增加生成步骤；首版不加查看按钮。
- [ ] 撤销必须作用于本次记忆变更及版本，成功显示已撤销，失败/冲突如实提示，不覆盖后续修改或改变Trip；同一逻辑写入重试/重连/重放不重复弹出，撤销自身不再触发加入记忆提示，换账号清理旧操作入口。
- [ ] 助手升级2026-09-27：Memory作为一级Tab，VP相关偏好、真实save/undo和成果使用解释构成四处可见性；无记忆时不伪装熟悉，管理项有来源、scope、修改/暂停/忘记入口。
- [ ] 助手升级2026-09-27：首版真实消费者至少使用已支持的travel pace；再逐字段扩展明确偏好，当前Trip/临时状态/外部事实/任务不得混入长期Memory。
- [ ] 助手升级2026-09-27：在任务排队、运行、重试和成果待确认期间纠正或忘记，新的dispatch与推荐不使用旧值；删除同时覆盖衍生摘要、索引和检查点，Free/付费及到期后保持同等基础记忆控制。

## VPJ-12

[VPJ-12 #201](https://github.com/JTCAO515/VP-V4/issues/201) — 单张旅行截图导入、校正与加入 Trip

### 执行边界与首个切片

- 首个可交付结果：I1：用户用Photo Picker选择单图，校正原文中的日期/金额/地址，再经diff确认加入同一Trip并跨端重载。 PR #472/#474 已合并原生审阅/Proposal；不重写解析UI，不重新研究已否决Docling。
- 本票责任/非目标：负责单图导入；55负责限定PDF与系统入口，24负责外部订单引用；不重跑已否决Docling配置。 2026-09-22已确认的实施顺序：I1 → I2；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 5专注日，PR/实际任务验证窗口
- 验收阶段: S4
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-01 #188](https://github.com/JTCAO515/VP-V4/issues/188), [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190), [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191), [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195), [VPJ-60 #200](https://github.com/JTCAO515/VP-V4/issues/200)
- Allowed: `ios/**`, `lib/server/artifacts/**`, `lib/server/media/**`, `app/api/artifacts/**`, `supabase/migrations/**`, `tests/**/artifacts/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `pnpm test:e2e`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-12/verification.md`, `artifacts/VPJ-12/unrun.md`, `artifacts/VPJ-12/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-12.md`, `docs/harness/hf-reuse/README.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 只做Photo Picker单张旅行截图→私有收件箱→受控解析→关键日期金额原文定位→用户确认；Share Extension/多页文件由VPJ-55承接。
- [ ] 不给全相册/邮箱读取权限；未批准外发时使用许可内本地/人工录入路径。
- [ ] 重复导入、解析失败、取消、TTL、删除、跨账号隔离可测；OCR成功不是供应商已确认。
- [ ] HF复用：参考VPJ-73的Docling采用/否决证据，合格时只接回本票截图→定位字段→用户校正的边界；研究PDF对照不扩张本票格式，否决Docling不阻止采用其他合格方案；保留原始材料定位及取消/TTL。
- [ ] 体验增量2026-09-17：单张截图的校正界面展示原文定位、日期/地址/金额/状态及与当前Trip的新增/重复/冲突；用户确认字段后才进入既有Proposal流程，解析失败或取消保留原安排，相同输入重放不重复加项。仅保留本票单图范围，不引入全相册读取。

## VPJ-13

[VPJ-13 #203](https://github.com/JTCAO515/VP-V4/issues/203) — VP首访、委托与回访的连续体验

### 执行边界与首个切片

- 首个可交付结果：从一句模糊想法形成可用方向，用户委托研究后离开，再回来看到真实成果与下一决定。
- 本票责任/非目标：负责三段入口和用户观测；VPJ-81实现主会话，规划/记忆/材料各沿原owner，首值不是注册或点击。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 3专注日，PR/实际任务验证窗口
- 验收阶段: S4
- Blocked by: [VPJ-62 #202](https://github.com/JTCAO515/VP-V4/issues/202)
- 集成/最终验收依赖（普通关联）: [VPJ-09 #197](https://github.com/JTCAO515/VP-V4/issues/197), [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199), [VPJ-12 #201](https://github.com/JTCAO515/VP-V4/issues/201)
- Allowed: `ios/**`, `tests/**/onboarding/**`, `docs/product/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-13/verification.md`, `artifacts/VPJ-13/unrun.md`, `artifacts/VPJ-13/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-13.md`, `docs/contracts/vp-response-policy.md`, `docs/product/assistant-upgrade-2026-09-27/README.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 新想法、已有材料、已在途均可开始；不强制先创建完整计划或填长表。
- [ ] 回访显示当前Trip/上次决定/下一步，用户可跳过问题；首值来自真实计划对象。
- [ ] 记录first_value与拒绝原因分开；大字/键盘/无权限/配额用尽有路径。
- [ ] 继承同意范围内事件schema；first_value/activated/outcome_declined不混计。
- [ ] 按本轮目标先交可用成果，只有会改变方案的缺失信息才追问；回访使用真实可用偏好与已保存成果，必要澄清沿同一ServiceTask，不机械问卷或反复索取已知信息。
- [ ] 体验增量2026-09-17：以无日期新想法、已有安排导入、在途回访三类任务验收首值；每次必要问题伴随已有成果或具体变化，用户可跳过，已知日期/人数/服务意向不重问。分别记录首次可用成果时间、实际采用/保存、拒绝和技术失败，并以明确分母报告重复提问率，不预设未经测量的收益数字。
- [ ] 助手升级2026-09-27：首次呈现有吸引力的个性化选择，回访优先真实新成果/未决问题；没有进展不捏造更新，不强制先建Trip或填写完整问卷。
- [ ] 助手升级2026-09-27：评价用户能否说明VP记得什么、正在做什么、结果在哪及如何改口；目标结果完成与partial/blocked/technical_failure分开计量。

## VPJ-14

[VPJ-14 #204](https://github.com/JTCAO515/VP-V4/issues/204) — 受保护 Ops 登录与一条候选内容工作流

### 执行边界与首个切片

- 首个可交付结果：复用现有Ops身份和候选审核，补普通授权账号在真实页面提交/异人审查/撤权的尚缺交互证据。
- 本票责任/非目标：负责运营身份与单候选工作流；15负责实际知识发布，17负责更新传播；不开放跨用户聊天读取。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [artifacts/VPJ-14/staging-20260912/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-14/staging-20260912/verification.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 5专注日，PR/实际任务验证窗口
- 验收阶段: S2
- Blocked by: [VPJ-02 #189](https://github.com/JTCAO515/VP-V4/issues/189)
- 集成/最终验收依赖（普通关联）: [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)
- Allowed: `apps/ops/**`, `lib/server/knowledge/review/**`, `lib/server/identity/**`, `supabase/migrations/**`, `tests/**/ops/**`, `app/ops/**`, `app/api/ops/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`
- Evidence: `artifacts/VPJ-14/verification.md`, `artifacts/VPJ-14/unrun.md`, `artifacts/VPJ-14/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-14.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 先交付独立受保护Ops身份→提交一个text候选→异人审查→审计记录纵切；来源全生命周期由15/17承接。
- [ ] 作者不能自审；运营无普通用户全库读取；生产内容发布需许可和review资格。
- [ ] 同一操作事务记录审计，失败回滚；无service key进入Ops浏览器。

## VPJ-15

[VPJ-15 #205](https://github.com/JTCAO515/VP-V4/issues/205) — 首批旅程内容从来源登记到已审核可用

### 执行边界与首个切片

- 首个可交付结果：从已有已审中英声明和发布记录中选一个缺覆盖场景，补真实来源→异人审核→发布/撤回→产品读回。
- 本票责任/非目标：负责首批内容与资格；75/76正在开发的Wiki和检索只复用接口，不改它们的任务或另造知识系统。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [artifacts/VPJ-15/staging-20260912/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-15/staging-20260912/verification.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 5专注日，PR/实际任务验证窗口
- 验收阶段: S2
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-14 #204](https://github.com/JTCAO515/VP-V4/issues/204)
- Allowed: `apps/ops/**`, `lib/server/knowledge/**`, `supabase/migrations/**`, `docs/knowledge-base/**`, `tests/**/knowledge/**`, `app/ops/**`, `app/api/ops/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`
- Evidence: `artifacts/VPJ-15/verification.md`, `artifacts/VPJ-15/unrun.md`, `artifacts/VPJ-15/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-15.md`, `docs/contracts/vp-response-policy.md`, `docs/harness/hf-reuse/README.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 为Supported Journey Matrix选10–20条原子事实/流程，登记许可、locator、适用范围、版本与审者。
- [ ] 中英表达共享语言中立assertion；candidate/reviewed/published/eligible不可混同。
- [ ] 运营能提交/审查/撤销并在产品读到结果；没有内容授权则阻塞发布，不批量造810条。
- [ ] 首批内容按普通来华游客的城市/场景/必要claim/权利/时效/可用动作组织覆盖；优先支撑规划与变化后的下一步，未定城市名单不得写成已覆盖全国。
- [ ] HF复用：测试集与生产知识分别登记；外部数据记录发布者、准确repo/revision/原行ID、逐源许可及变更，公开/NC/混合来源不自动发布为旅游Fact；优先自有合成评测与已许可审核语料。

## VPJ-16

[VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206) — 有依据的回答、诚实部分答案与知识缺口

### 执行边界与首个切片

- 首个可交付结果：复用已完成的直接知识回答与PR #416的MIRACL/BIPIA证据，补一条其余尚未验收的真实claim覆盖、partial或过拒答路径。
- 本票责任/非目标：本票曾在PR #416仅交付一条验收后被关票，现恢复原未完成范围；不重复07任务执行、67整合Harness或受保护76正在做的Wiki检索。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [artifacts/VPJ-206/hf-reuse-miracl-bipia-20260916/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-206/hf-reuse-miracl-bipia-20260916/verification.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 5专注日，PR/实际任务验证窗口
- 验收阶段: S2
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195), [VPJ-15 #205](https://github.com/JTCAO515/VP-V4/issues/205)
- Allowed: `lib/server/knowledge/**`, `lib/server/turn/**`, `ios/**`, `components/chat/**`, `tests/**/knowledge/**`, `evals/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:e2e`; `pnpm evals`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-16/verification.md`, `artifacts/VPJ-16/unrun.md`, `artifacts/VPJ-16/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-16.md`, `docs/contracts/vp-response-policy.md`, `docs/harness/hf-reuse/README.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 结构化/完整短文baseline→claim coverage→中英回答/卡片；权限时效范围预过滤。
- [ ] required/background/coverage/conflicts并存，同一fact多证据可用，no-answer不被相关度掩盖。
- [ ] 真正knowledge gap与provider/policy/user-input/capability问题分流；不自动承诺人工。
- [ ] 有依据回答同时约束自由正文和卡片，partial保留可靠部分并指明具体缺口与可用下一步；个人偏好只能筛选解释，不当外部事实；完整证据下全拒答作为失败反例。
- [ ] HF复用：借MIRACL/BIPIA方法分别诊断检索、无答案与注入，保持请求级资格在召回及模型外发前执行、展示前重验；历史百科/旅行基准不当实时知识，相关高分不推翻时效、反证与许可。

## VPJ-17

[VPJ-17 #207](https://github.com/JTCAO515/VP-V4/issues/207) — 来源更新后安全重验相关知识与 Trip

### 执行边界与首个切片

- 首个可交付结果：消费现有来源版本/撤回信号，完成一个下游投影或TripItemSupport的影响记录、ack和失败重试。
- 本票责任/非目标：负责来源变化向消费者传播；复用75已有撤回标注/扫描产物，不抢占其worker/UI或重复实现；不自动更改确认Trip。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 5专注日，PR/实际任务验证窗口
- 验收阶段: S3
- Blocked by: [VPJ-75 #359](https://github.com/JTCAO515/VP-V4/issues/359)
- 集成/最终验收依赖（普通关联）: [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192), [VPJ-14 #204](https://github.com/JTCAO515/VP-V4/issues/204), [VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206)
- Allowed: `lib/server/knowledge/report/**`, `lib/server/jobs/**`, `lib/server/trip/**`, `apps/ops/**`, `supabase/migrations/**`, `tests/**/takedown/**`, `app/ops/**`, `app/api/ops/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`
- Evidence: `artifacts/VPJ-17/verification.md`, `artifacts/VPJ-17/unrun.md`, `artifacts/VPJ-17/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-17.md`, `docs/knowledge-upgrade/README.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] SourceRevision→影响候选→独立复核→outbox→索引/投影ack可重试；不是仅返回cascade意图。
- [ ] TripItemSupport绑定claim版本，旧证据失效不删除用户已确认意图。
- [ ] 404/页面样式变动不当政策反转；撤权立即停新检索/外发，保留允许的审计。
- [ ] 知识升级：来源变化生成有版本的影响集，覆盖Wiki页面、statement、检索索引/缓存、历史答案和TripItemSupport；outbox逐消费者ack可重试，记录延迟/乱序/失败与恢复，删除旧索引未完成时当前资格gate仍阻止失效知识外发。
- [ ] 知识升级：规范化缺口与来源更新只进入有界Wiki草稿/复核任务，区分资料变动、解析差异、404和真正政策反转；记录每次刷新成本/unknown及受影响知识数，不收集私人对话原文、不无限自动抓取或自动发布。

## VPJ-18

[VPJ-18 #208](https://github.com/JTCAO515/VP-V4/issues/208) — 高德主选与腾讯补充的实测、用途与成本边界

### 执行边界与首个切片

- 首个可交付结果：复用#362已完成探针和高德主选决定，补一个确实未验的使用场景、字段用途或成本/配额记录；不重跑整批取数。
- 本票责任/非目标：负责地图供应商准入/适用边界；#363/364实现地点与路线，#367另验受控降级，不以第二家开发完成阻塞主选。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/benchmarks/maps/vpj-18-362-closeout.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/benchmarks/maps/vpj-18-362-closeout.md) · [artifacts/VPJ-18/full-matrix-20260914/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-18/full-matrix-20260914/verification.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; decision; 3专注日，实际账号/签名/真机/网络等待另计，不含已取消的供应商审批
- 验收阶段: S3
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)
- Allowed: `docs/benchmarks/maps/**`, `docs/runbooks/**`, `docs/operator-actions.json`, `lib/server/maps/**`, `scripts/maps/**`, `tests/**/maps/**`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-18/verification.md`, `artifacts/VPJ-18/unrun.md`, `artifacts/VPJ-18/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: 已有账号/API或官方入口可用即可由agent接入；未披露信息标unknown，不以第三方/法务/产品审批阻塞开发。 实际账号不可访问或接口不可用时记录技术原因；真实购买、上架和生产动作按已有授权范围执行。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-18.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 对海外行前+境内在途、英文检索、中文POI、入口/步行/路线矩阵、SDK UI和授权逐项比较。
- [ ] 依据公开文档、控制台与实测记录价格/配额/缓存和二次展示行为；已有API可用即可开发，不等待书面许可或采购批准，未知商业条件单列。
- [ ] agent按实际效果选择一个主地图并列回滚/无地图模式；第二家有明确效果收益再接入，不设额外产品许可。

## VPJ-19

[VPJ-19 #209](https://github.com/JTCAO515/VP-V4/issues/209) — 地点消歧、地图展示与路线出口

### 执行边界与首个切片

- 首个可交付结果：复用已合并的搜索/详情/geocode/suggest/nearby/reverse-geocode适配；沿#363补原生输入状态隔离与地图/列表/详情同选中消费者，再在#364接路线出口。
- 本票责任/非目标：这是地点/路线能力父票，消费子票证据；不与#363/364重复实现，#366负责交通观测，#365负责Trip消费。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/contracts/place-identity.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/contracts/place-identity.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 5专注日，PR/实际任务验证窗口
- 验收阶段: S3
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192), [VPJ-18 #208](https://github.com/JTCAO515/VP-V4/issues/208)
- Allowed: `ios/**`, `lib/server/external-evidence/**`, `lib/server/explore/**`, `app/api/places/**`, `tests/**/places/**`, `lib/server/maps/**`, `scripts/maps/**`, `tests/**/maps/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:e2e`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-19/verification.md`, `artifacts/VPJ-19/unrun.md`, `artifacts/VPJ-19/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-19.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 中文/英文/拼音同一canonical实体；providerID和内部ID分开，城市同名需要消歧。
- [ ] GCJ/WGS等坐标转换显式且不双转，地图/列表同选中对象；不从向量分数猜入口。
- [ ] 当前位置拒权/无网时可用中文地址和缓存；路线报价只按已授权观察时效呈现。
- [ ] 体验增量2026-09-17：地图、地点列表和详情沿同一Trip/day/item身份保留选中对象；休息、值机、未定用餐等时间线事件不伪装为具名POI或借附近坐标补齐。正式点位缺坐标明确显示，既有文字安排仍可读；绑定已有地点/服务的引用可核对，切换视图不改变确认版本。

## VPJ-20

[VPJ-20 #210](https://github.com/JTCAO515/VP-V4/issues/210) — 全局探索中的地点发现、保存和交给VP

### 执行边界与首个切片

- 首个可交付结果：复用真实内容和地点身份，在全局搜索/探索页展示有依据的旅行发现并交给VP。
- 本票责任/非目标：旧Explore独立Tab迁入搜索/探索；本票拥有内容/Save/Ask/Add行为，VPJ-82拥有跨域搜索聚合。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 4专注日，PR/实际任务验证窗口
- 验收阶段: S3
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-09 #197](https://github.com/JTCAO515/VP-V4/issues/197), [VPJ-15 #205](https://github.com/JTCAO515/VP-V4/issues/205), [VPJ-19 #209](https://github.com/JTCAO515/VP-V4/issues/209)
- Allowed: `ios/**`, `app/explore/**`, `components/explore/**`, `lib/server/explore/**`, `tests/**/explore/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:e2e`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-20/verification.md`, `artifacts/VPJ-20/unrun.md`, `artifacts/VPJ-20/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-20.md`, `docs/product/assistant-upgrade-2026-09-27/README.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 中英官方/编辑内容可主动浏览、搜索和收藏；说明覆盖与来源。
- [ ] Save/Ask/Add使用同一实体ID，Add走Proposal/Confirm；地点没找到可发起消歧/研究。
- [ ] 无内容、已下架、过期图片/许可、分页/弱网状态可用，不用静态假数据冒充全国。
- [ ] 助手升级2026-09-27：新四Tab无独立Explore，全球入口使用明确选区/实体/来源带入主会话；不能把照片或用户偏好当地点证据，生产图片有权利与真实地点对应。

## VPJ-21

[VPJ-21 #211](https://github.com/JTCAO515/VP-V4/issues/211) — 准备检查把关键缺口变成可做的下一步

### 执行边界与首个切片

- 首个可交付结果：从已选方向识别一个当前需要处理的准备缺口，提供可完成的下一步。
- 本票责任/非目标：负责准备事实/依赖与状态；优先级随旅行阶段，任务调度复用VPJ-80，不建设第二个待办引擎。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 4专注日，PR/实际任务验证窗口
- 验收阶段: S3
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-10 #198](https://github.com/JTCAO515/VP-V4/issues/198), [VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206), [VPJ-19 #209](https://github.com/JTCAO515/VP-V4/issues/209), [VPJ-74 #358](https://github.com/JTCAO515/VP-V4/issues/358)
- Allowed: `ios/**`, `lib/server/readiness/**`, `lib/server/trip/**`, `tests/**/readiness/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-21/verification.md`, `artifacts/VPJ-21/unrun.md`, `artifacts/VPJ-21/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-21.md`, `docs/contracts/vp-response-policy.md`, `docs/knowledge-upgrade/README.md`, `docs/product/assistant-upgrade-2026-09-27/README.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 对首批明确场景检查网络/支付/入场/地址/交通，分knowledgeAvailability/userReadiness/actionTiming。
- [ ] 日期从相对变精确时重核相关证据；建议不改用户计划，未知不当通过。
- [ ] 每个缺口一项可操作下一步与依据/适用范围；非适用项目不制造焦虑。
- [ ] 准备检查以可执行下一步呈现：获准资料、核实入口、条件性候选与修改提案分开；不要把review_fact标签或提示文字作为真实问题已解决。
- [ ] 知识升级：用版本化Ontology对象/关系/条件和获准用户状态计算knowledgeAvailability/userReadiness/actionTiming；相同证据下unknown/满足/不满足/不适用/未到时间均有中英原生实际结果，未知不能当false或已准备。
- [ ] 知识升级：每个可做下一步绑定task/trip scope及evidence/rule versions；需改Trip时复用Proposal/diff/exact-version确认/原子Patch，拒绝、撤权、旧版本和重试无误写，原生与同Trip Web重载一致。
- [ ] 助手升级2026-09-27：行前先帮助选择，再渐进呈现网络/支付/预约等适用准备；unknown与未完成区分，完成必须有明确来源，避免首页满屏风险或用阻塞状态充当完成率。

## VPJ-22

[VPJ-22 #212](https://github.com/JTCAO515/VP-V4/issues/212) — 酒店官方出口、参数落地与联盟归因验证

### 执行边界与首个切片

- 首个可交付结果：H1：在原生酒店入口核对条件后跳到官方App/网站，用户清楚哪些参数需重新填写。 PR #498 已合并；Booking与Trip.com已有桌面观察，不能当真机通过。
- 本票责任/非目标：负责链接/归因/用途边界；23负责比较UI，24负责回流。TourMind只作可选研究候选，缺联盟账号不阻止普通官方出口。 2026-09-22已确认的实施顺序：H1 → H2；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; decision; 2专注日，实际账号/签名/真机/网络等待另计，不含已取消的供应商审批
- 验收阶段: S4
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)
- Allowed: `docs/benchmarks/hotels/**`, `docs/runbooks/**`, `docs/operator-actions.json`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-22/verification.md`, `artifacts/VPJ-22/unrun.md`, `artifacts/VPJ-22/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: 已有账号/API或官方入口可用即可由agent接入；未披露信息标unknown，不以第三方/法务/产品审批阻塞开发。 实际账号不可访问或接口不可用时记录技术原因；真实购买、上架和生产动作按已有授权范围执行。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-22.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 使用Trip.com/Booking.com现有可用API或官方链接开发并验证App跳转、归因和参数；不等待联盟批准、合同或供应商书面答复。
- [ ] 真机验证hotel/date/occupancy/filters究竟保留哪些参数；不保留的字段写入用户提示。
- [ ] 没有联盟账号或专用API时直接使用非联盟官方搜索出口；不自造库存、room SKU或佣金参数。
- [ ] 体验增量2026-09-17：把TourMind列为可选酒店供应商研究候选，记录采纳/暂缓/否决依据及实际查询权限、费用/总价口径、外宾入住信息、字段用途和来源版本。源码可复用性与远端API/内容权利分别核对；候选不可用不阻塞原官方外跳，不把本票扩大为订房、支付、取消或履约，未验项保留UNRUN。

## VPJ-23

[VPJ-23 #213](https://github.com/JTCAO515/VP-V4/issues/213) — 住宿需求比较与透明联盟跳转

### 执行边界与首个切片

- 首个可交付结果：H3：用户看到有差异的区域/酒店候选及交通负担，继承日期、人数、床型、预算与已订意向。
- 本票责任/非目标：负责住宿需求、比较和透明外跳；不复制22链接适配或24凭证处理，也不承担房间下单/支付/履约。 2026-09-22已确认的实施顺序：H3 → H4；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 4专注日，PR/实际任务验证窗口
- 验收阶段: S4
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199), [VPJ-19 #209](https://github.com/JTCAO515/VP-V4/issues/209), [VPJ-22 #212](https://github.com/JTCAO515/VP-V4/issues/212)
- Allowed: `ios/**`, `lib/server/hotels/**`, `app/api/hotels/**`, `tests/**/hotels/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:e2e`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-23/verification.md`, `artifacts/VPJ-23/unrun.md`, `artifacts/VPJ-23/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-23.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] L1a整理区域/床型/入住/预算需求，L1b只传已验参数；展示候选范围和取舍。
- [ ] CTA标供应商/佣金/需要重核条件；不展示无实时证据的可售房型/最终价。
- [ ] 域名白名单/参数最小化、opened≠booked、失败/过期出口；佣金移除后候选排序不变。
- [ ] 体验增量2026-09-17：先按实际行程比较有差异的住宿区域与交通负担，再给可核实酒店候选；继承日期、人数、床型和预算，保留已订/不需要/暂缓意向，避免重复推销。明确每晚/全程/房间数及币种口径，缓存起价不当实时价，无实时依据不宣称可售或最终价。
- [ ] 体验增量2026-09-17：酒店暂选后说明它与当前Trip的关系和下一步；换住宿只提出受影响首末日/接驳的调整候选，经既有Proposal确认才改变Trip。推荐、用户暂选、材料核实与供应商确认分别有证据，选择或打开链接不能写成已预订。

## VPJ-24

[VPJ-24 #214](https://github.com/JTCAO515/VP-V4/issues/214) — 第三方订单材料回到同一 Trip

### 执行边界与首个切片

- 首个可交付结果：O1：用户外跳回来可跳过，也可校正确认凭证，把订单引用关联至原Trip。
- 本票责任/非目标：负责订单证据回流；12/55提供解析，外部供应商负责取消/改签，选择酒店与打开链接不算预订。 2026-09-22已确认的实施顺序：O1 → O2；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 3专注日，PR/实际任务验证窗口
- 验收阶段: S4
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-12 #201](https://github.com/JTCAO515/VP-V4/issues/201), [VPJ-23 #213](https://github.com/JTCAO515/VP-V4/issues/213)
- Allowed: `ios/**`, `lib/server/artifacts/**`, `lib/server/trip/**`, `supabase/migrations/**`, `tests/**/orders/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-24/verification.md`, `artifacts/VPJ-24/unrun.md`, `artifacts/VPJ-24/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-24.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 外跳返回后可跳过或导入凭证；user-reported/artifact-confirmed/provider-verified分开。
- [ ] 用户核实日期/地址/条款候选后形成external reservation reference，约束后续规划。
- [ ] 取消/改签在外部发生，VP只记录证据；导入失败保留原Trip和安全重试。
- [ ] 体验增量2026-09-17：外跳回流材料先显示与现有Trip的新增/重复/冲突及原文定位，用户确认后更新外部订单引用与受影响候选，不重写整趟行程；相同凭证重放不重复加项，user-reported/artifact-confirmed/provider-verified保持区分，未知回执先读取核验再重试。

## VPJ-25

[VPJ-25 #215](https://github.com/JTCAO515/VP-V4/issues/215) — Today 与可离线读取的旅行资料

### 执行边界与首个切片

- 首个可交付结果：T1：打开Trip内Today，看到同一确认版本的日程、中文地址与适用准备状态。 main已有Today证据函数，不等于原生Today或离线包已验收。
- 本票责任/非目标：负责原生在途读取与缓存；30负责提醒，29负责恢复，11负责记忆，不能把离线旧数据称实时。 2026-09-22已确认的实施顺序：T1 → T2 → T3；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 4专注日，PR/实际任务验证窗口
- 验收阶段: S4
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191), [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192)
- Allowed: `ios/**`, `lib/server/today/**`, `app/api/trips/**`, `tests/**/today/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:e2e`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-25/verification.md`, `artifacts/VPJ-25/unrun.md`, `artifacts/VPJ-25/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-25.md`, `docs/contracts/vp-response-policy.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 确认Trip上的Today/中文地址/用户选择的资料可离线读取，显示最后同步时刻。
- [ ] 原生私有缓存按账号/Trip隔离、登出清理；过期事实不变实时事实。
- [ ] 离线编辑先本地草稿，恢复在线后CAS确认；不执行外部动作或静默覆盖。
- [ ] 离线授权租约到期进入受限读取，回网重验；AppGroup/旧设备不可永久复活被撤销材料。
- [ ] Free/Pass到期或额度不足时，既有权限允许的已保存计划/地址仍按原合同可读；打开App后的接续使用当前实际状态，不承诺后台持续监控。
- [ ] 体验增量2026-09-17：Today复用确认Trip的日程、地址与适用准备状态，在线修改确认后更新到同一版本；离线继续显示明确的缓存版本/最后同步时间，回网重验，不把旧信息当当前事实。加载图片或地图失败不阻止许可内已保存文字/地址读取，不扩张为常驻后台监控。

## VPJ-26

[VPJ-26 #216](https://github.com/JTCAO515/VP-V4/issues/216) — 中英现场表达与大字展示

### 执行边界与首个切片

- 首个可交付结果：P1：输入一条短语得到中英翻译与随时可见原文，给本地人看可读的大字卡。 PR #485 OPEN，已有API与原生消费者及本地验证，真实provider与现场UX未验。
- 本票责任/非目标：负责文字现场表达；27处理音频生命周期，60负责媒体provider资格，不扩全量图片/常驻录音。 2026-09-22已确认的实施顺序：P1 → P2；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 4专注日，PR/实际任务验证窗口
- 验收阶段: S4
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195), [VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206)
- Allowed: `ios/**`, `lib/server/media-translation/**`, `app/api/translate/**`, `tests/**/translate/**`, `evals/**`, `app/api/media/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:e2e`; `pnpm evals`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-26/verification.md`, `artifacts/VPJ-26/unrun.md`, `artifacts/VPJ-26/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-26.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 首单仅文字输入→中英译文→给本地人看大字卡，原文随时可见；图片入口通过材料API另行接入。
- [ ] 金额/否定/地点/过敏等关键语义双向验证，高风险不声称认证翻译。
- [ ] 同一Trip地址/场景可带入但不无关调用历史私密记忆；额度耗尽仍可读已存短语。

## VPJ-27

[VPJ-27 #217](https://github.com/JTCAO515/VP-V4/issues/217) — 按需语音翻译与可中断播放

### 执行边界与首个切片

- 首个可交付结果：V1：用户按住录音，松开后得到字幕/译文并可主动播放、随时停止。
- 本票责任/非目标：负责原生音频链与取消/TTL；60提供适配资格，26提供文字语义，28消费讲解播放，不重复造录音器。 2026-09-22已确认的实施顺序：V1 → V2；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 5专注日，PR/实际任务验证窗口
- 验收阶段: S4
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190), [VPJ-26 #216](https://github.com/JTCAO515/VP-V4/issues/216), [VPJ-60 #200](https://github.com/JTCAO515/VP-V4/issues/200)
- Allowed: `ios/**`, `lib/server/media-translation/**`, `lib/server/media/**`, `tests/**/voice/**`, `evals/**`, `app/api/media/**`, `app/api/translate/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:e2e`; `pnpm evals`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-27/verification.md`, `artifacts/VPJ-27/unrun.md`, `artifacts/VPJ-27/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-27.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] push-to-talk→ASR→翻译→字幕/TTS全链，final字幕与朗读一致，录音权限按需。
- [ ] 来电/耳机/后台/停止/重试不重复播放或存多份，语音价格按实际秒/字符计。
- [ ] 没有常开监听；音频TTL/取消删除和无网文字路径验证。

## VPJ-28

[VPJ-28 #218](https://github.com/JTCAO515/VP-V4/issues/218) — 地点讲解与语音追问接回当前 Trip

### 执行边界与首个切片

- 首个可交付结果：G1：在首批覆盖地点听简短讲解，查看来源、字幕并暂停续播。
- 本票责任/非目标：负责Guide内容消费与续播；15维护知识，27提供音频，29处理临时变化，不把传说或旧缓存作新事实。 2026-09-22已确认的实施顺序：G1 → G2；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 4专注日，PR/实际任务验证窗口
- 验收阶段: S4
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-15 #205](https://github.com/JTCAO515/VP-V4/issues/205), [VPJ-19 #209](https://github.com/JTCAO515/VP-V4/issues/209), [VPJ-27 #217](https://github.com/JTCAO515/VP-V4/issues/217)
- Allowed: `ios/**`, `lib/server/guide/**`, `app/api/guide/**`, `tests/**/guide/**`, `evals/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:e2e`; `pnpm evals`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-28/verification.md`, `artifacts/VPJ-28/unrun.md`, `artifacts/VPJ-28/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-28.md`, `docs/contracts/vp-response-policy.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 首批已覆盖地点提供短讲解、来源、事实/传说区别、字幕和暂停续播。
- [ ] 追问使用当前地点/兴趣/已听进度，角色仍VP；未覆盖地点给清楚边界与其他探索入口。
- [ ] 已缓存内容重播不再扣Ask，新增生成按明确额度；现场注意力优先。
- [ ] 讲解按已获准兴趣给简明、有来源、适用的内容；英文为原生表达，中文保持事实/否定一致，幽默可为零；与VPJ-29局部恢复保持职责区分。

## VPJ-29

[VPJ-29 #220](https://github.com/JTCAO515/VP-V4/issues/220) — 用户报告变化后的局部恢复

### 执行边界与首个切片

- 首个可交付结果：R1：用户说走不动或晚点，看到1–2个保留固定订单/晚餐的局部候选，确认后才更新Trip。
- 本票责任/非目标：负责在途变化的业务触发；复用10提案、21准备、25缓存和65约束；不是另一个规划器或地图实时监听器。 2026-09-22已确认的实施顺序：R1 → R2；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 4专注日，PR/实际任务验证窗口
- 验收阶段: S4
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-10 #198](https://github.com/JTCAO515/VP-V4/issues/198), [VPJ-21 #211](https://github.com/JTCAO515/VP-V4/issues/211), [VPJ-25 #215](https://github.com/JTCAO515/VP-V4/issues/215), [VPJ-65 #219](https://github.com/JTCAO515/VP-V4/issues/219)
- Allowed: `ios/**`, `lib/server/today/recovery/**`, `lib/server/constraints/**`, `tests/**/recovery/**`, `evals/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm evals`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-29/verification.md`, `artifacts/VPJ-29/unrun.md`, `artifacts/VPJ-29/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-29.md`, `docs/contracts/vp-response-policy.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 疲劳/晚点/关闭由用户报告或有效外部证据触发，保留固定订单与晚餐等约束。
- [ ] 给1–2个局部候选和受影响项目diff，经确认更新Trip。
- [ ] unknown、无法安全修复、求助外部供应商/官方路径完整；不假装取消退款或实时检测。
- [ ] 用户报告变化后，结合获准且最新的偏好给沉着清楚的下一步及局部候选；保留已确认约束，候选/确认/应用回执分开；技术失败、外部未知和已提交后取消不虚构解决状态。

## VPJ-30

[VPJ-30 #221](https://github.com/JTCAO515/VP-V4/issues/221) — 有原因、可关闭的旅行提醒

### 执行边界与首个切片

- 首个可交付结果：先验已接受任务结果与用户设置提醒的真实投递，再增加有来源的持续检查。
- 本票责任/非目标：负责通知/调度资格和真实transport；VPJ-80拥有任务执行，VPJ-81显示进度，不因文件存在声称APNs可用。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 4专注日，PR/实际任务验证窗口
- 验收阶段: S4
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199), [VPJ-17 #207](https://github.com/JTCAO515/VP-V4/issues/207), [VPJ-25 #215](https://github.com/JTCAO515/VP-V4/issues/215)
- Allowed: `ios/**`, `lib/server/notifications/**`, `lib/server/jobs/**`, `supabase/migrations/**`, `tests/**/notifications/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-30/verification.md`, `artifacts/VPJ-30/unrun.md`, `artifacts/VPJ-30/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-30.md`, `docs/contracts/vp-response-policy.md`, `docs/product/assistant-upgrade-2026-09-27/README.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] App内Next Step＋用户亲设时间提醒＋明确watch结果，发送前重验Trip版本/同意/时区/有效期。
- [ ] 重复、已完成、撤回、旅行结束、换账号提醒不发送；锁屏不泄漏敏感内容。
- [ ] 通知默认按用途授权，marketing/affiliate不借旅行提醒；Live Activity不在本纵切。
- [ ] 先验打开App后接续与用户授权的提醒，实际发送前重验范围/版本/期限；不把亲切或Pass增强解释为持续定位、永久后台或未经许可的主动联系。
- [ ] 助手升级2026-09-27：仅有意义的新结果/必要输入触发消息，无变化保持安静；Trip/同意/记忆basis已变、到期、暂停或完成时取消过时跟进，校验去重/时区/quiet hours。

## VPJ-31

[VPJ-31 #223](https://github.com/JTCAO515/VP-V4/issues/223) — 按服务任务授权的动态 Traveler Brief

### 执行边界与首个切片

- 首个可交付结果：B1：用户预览本服务任务要分享的资料后，指定员工看到有来源和更新时间的最小Brief。
- 本票责任/非目标：负责授权Brief投影；57负责grant/访问期限，32负责人员接单与结果，11负责偏好权威。 2026-09-22已确认的实施顺序：B1 → B2；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 4专注日，PR/实际任务验证窗口
- 验收阶段: S4
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190), [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199), [VPJ-12 #201](https://github.com/JTCAO515/VP-V4/issues/201), [VPJ-14 #204](https://github.com/JTCAO515/VP-V4/issues/204), [VPJ-57 #222](https://github.com/JTCAO515/VP-V4/issues/222)
- Allowed: `apps/ops/**`, `lib/server/ops/**`, `lib/server/memory/**`, `supabase/migrations/**`, `tests/**/ops/**`, `app/ops/**`, `app/api/ops/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`
- Evidence: `artifacts/VPJ-31/verification.md`, `artifacts/VPJ-31/unrun.md`, `artifacts/VPJ-31/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-31.md`, `docs/contracts/vp-response-policy.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 用户给case授权后员工只看任务需要字段；Owner可审授权范围和审计，非普通全库读。
- [ ] 需求/预算/偏好/表达详细程度带来源、更新时刻和显式/推断标记；无敏感人格推定。
- [ ] 纠正/撤权/删除传播到报告和可控缓存；旧摘要不能压过最新用户输入。
- [ ] TravelerBrief只投影当前ServiceCase目的下获准的最小资料及偏好版本；不因基础记忆Free可用而开放人工读取全历史，撤回后未来访问与队列重新校验。

## VPJ-32

[VPJ-32 #224](https://github.com/JTCAO515/VP-V4/issues/224) — 真人协助从请求到接单和结果回传

### 执行边界与首个切片

- 首个可交付结果：S1：用户看到queued/accepted/assigned/waiting_external真实状态，员工在实际容量内接单。
- 本票责任/非目标：负责服务运营与人工分钟；57负责申请授权，31负责Brief，不伪造接单、ETA或自动写Trip。 2026-09-22已确认的实施顺序：S1 → S2；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 5专注日，PR/实际任务验证窗口
- 验收阶段: S4
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-21 #211](https://github.com/JTCAO515/VP-V4/issues/211), [VPJ-31 #223](https://github.com/JTCAO515/VP-V4/issues/223), [VPJ-57 #222](https://github.com/JTCAO515/VP-V4/issues/222)
- Allowed: `ios/**`, `apps/ops/**`, `lib/server/service-cases/**`, `supabase/migrations/**`, `tests/**/service-cases/**`, `app/ops/**`, `app/api/ops/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-32/verification.md`, `artifacts/VPJ-32/unrun.md`, `artifacts/VPJ-32/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-32.md`, `docs/contracts/vp-response-policy.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 请求→容量检查→queued/accepted/assigned→waiting_external→resolved/unresolved完整可见。
- [ ] 接单前不承诺ETA/SLA；紧急问题先给官方渠道，用户可退出/撤授权。
- [ ] 任务一条线接回Trip，结果不是自动Trip写入；人工分钟数和容量计量。
- [ ] 真人状态和文案统一：queued无虚构负责人/ETA，accepted后才按真实时段约定更新；提供教程、已联系服务方、外部实际解决分别有证据，不预设固定AI/人工比例。

## VPJ-33

[VPJ-33 #225](https://github.com/JTCAO515/VP-V4/issues/225) — Free与订阅服务边界、商品策略和旧Pass兼容

### 执行边界与首个切片

- 首个可交付结果：先定义行前可感知的免费/付费服务范围与旧Pass兼容矩阵，所有未选销售参数保持未激活。
- 本票责任/非目标：本票是唯一商品/范围/容量策略owner；新订阅方向已接受，月订阅为首候选，价格/周期/额度待验证；VPJ-34/35消费版本策略。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; decision; 2专注日，实际账号/签名/真机/网络等待另计，不含已取消的供应商审批
- 验收阶段: S5
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)
- Allowed: `docs/commercial/**`, `docs/runbooks/**`, `lib/server/entitlements/**`, `tests/**/entitlements/**`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-33/verification.md`, `artifacts/VPJ-33/unrun.md`, `artifacts/VPJ-33/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: 已有账号/API或官方入口可用即可由agent接入；未披露信息标unknown，不以第三方/法务/产品审批阻塞开发。 实际账号不可访问或接口不可用时记录技术原因；真实购买、上架和生产动作按已有授权范围执行。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-33.md`, `docs/contracts/service-task-metering.md`, `docs/contracts/basic-preferences-cross-trip.md`, `docs/product/assistant-upgrade-2026-09-27/README.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 2026-09-27采用Free+用户付费订阅的产品方向，月订阅作为首轮候选；实际价格/周期/容量尚未冻结。旧30天Pass及$19.99/$14.99为历史实现/实验参考，不是新方案唯一销售约束。
- [ ] 明确现行购买开始/提前续买/退款/恢复/到期，以及获准的新服务任务周期与Free窗口口径；新容量未决定前不写入在售商品，无unlimited或人工包含承诺。
- [ ] agent先用StoreKit开发/sandbox配置完成链路；真实上架时从实际账户核对SKU/合同主体/税费及价格，未上线商品不能收私人款。
- [ ] 旧non-renewing Pass保持每笔交易720h、排队/startsAt/退款/恢复的既有账本语义，不能套用于新订阅。按商品策略版本分别规定续期、到期、撤销、容量和跨期服务；未选值只用于明确标记的开发配置，真实销售前核对官方商品及公开权益。
- [ ] 权益表回写Q36：Free与Pass共同具有获准的基础显式跨Trip偏好；Q37采用完整服务任务方向，原Ask数值不得换名沿用，partial/改稿/TTL/跨期及新容量先决策再公布。
- [ ] Q38购买后激活、到达起算、eSIM和支付渠道保持待研究；本轮不改变现行购买/生效/到期规则、不增加商品承诺。
- [ ] 助手升级2026-09-27：付费边界围绕行前研究、约束核查、复杂协调和持续任务；免费保留基础记忆/纠错/导出删除与可用首值。eSIM/无限服务/人工包含不因资源库入口而获准。
- [ ] 助手升级2026-09-27：有佣/无佣候选使用同一适配规则，佣金元数据不提升有机排序，披露商业出口和候选覆盖；用户在其他平台预订仍可获得独立助手价值。

## VPJ-34

[VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226) — 官方购买、订阅兼容与同源权益

### 执行边界与首个切片

- 首个可交付结果：保持#503官方测试交易到grant，按#225版本策略设计订阅续期/退款/恢复与旧Pass共存。
- 本票责任/非目标：唯一交易/账号绑定/grant账本；旧720h语义不可当自动续费，#225给政策、#227给任务容量。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 5专注日，PR/实际任务验证窗口
- 验收阶段: S5
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191), [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192), [VPJ-33 #225](https://github.com/JTCAO515/VP-V4/issues/225)
- Allowed: `ios/**`, `app/api/storekit/**`, `lib/server/entitlements/**`, `supabase/migrations/**`, `tests/**/entitlements/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `pnpm test:e2e`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-34/verification.md`, `artifacts/VPJ-34/unrun.md`, `artifacts/VPJ-34/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-34.md`, `docs/contracts/service-task-metering.md`, `docs/product/assistant-upgrade-2026-09-27/README.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] StoreKit2交易验证→服务端账号绑定→权益→两端生效；重放/换机/恢复不重复延长或补额度。
- [ ] non-renewing类型的期限与恢复由服务端账本处理，退款撤销有可核路径；到期保留Trip/手动编辑/安全资料。
- [ ] TestFlight/sandbox与production隔离，购买pending/cancelled/revoked不当success；真实付款另门验证。
- [ ] 消费VPJ-33唯一版本化政策；现有Pass的720h、排队、生效、退款和恢复作为兼容路径验证，新订阅续期/撤销按新版本单独实现。媒体/容量由33定义，任务消费由35承接，不复制另一账本。
- [ ] StoreKit购买交易/grant与ServiceTask容量及attempt成本分离；恢复或任务重试不补发同一权益，本轮保持现行激活起算，未定容量不写入真实在售商品。
- [ ] 助手升级2026-09-27：新订阅产品需独立版本化renewal/expiry/revocation及同源权益，先以官方Sandbox证据验证；保留既有non-renewing Pass/grant兼容，不把旧720h规则静默套用所有商品。

## VPJ-35

[VPJ-35 #227](https://github.com/JTCAO515/VP-V4/issues/227) — Free/Pass 额度与完整任务成本控制

### 执行边界与首个切片

- 首个可交付结果：记录规划委托的真实attempt成本与服务范围，验证免费也能体验一次有界持续任务。
- 本票责任/非目标：延续唯一容量账和实际成本预算；不以普通提问数量作为新主要付费价值，不自动启用历史开发配额。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 4专注日，PR/实际任务验证窗口
- 验收阶段: S5
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-06 #193](https://github.com/JTCAO515/VP-V4/issues/193), [VPJ-08 #196](https://github.com/JTCAO515/VP-V4/issues/196), [VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226)
- Allowed: `lib/server/identity/quota/**`, `lib/server/model-gateway/**`, `lib/server/entitlements/**`, `ios/**`, `tests/**/cost/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-35/verification.md`, `artifacts/VPJ-35/unrun.md`, `artifacts/VPJ-35/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-35.md`, `docs/contracts/service-task-metering.md`, `docs/product/assistant-upgrade-2026-09-27/README.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 按Q37服务任务口径，由agent在开发启用前冻结Free/Pass周期与滚动窗口的开发容量，真实收费前再确认，配置化验证且客户端显示正确下次可用时刻；旧6/30/300/60 Ask数字仅作历史占位，不换名沿用或构造旧收费路径。
- [ ] ServiceTask是一项明确目标及必要澄清、系统修复，关联多个Turn/attempt；并发预留、按获准成果标准结算和失败返还可审，未决partial/改稿/TTL/跨期消费不启用。 新计量先记录模式，内部attempt成本独立累计，不构造双重扣次路径。
- [ ] 安全/记忆纠错/导出删除/手动编辑/缓存播放不付费；强模型预算不能悄悄降低安全质量。
- [ ] 消费VPJ-34的有效grant与VPJ-33政策版本，验证未到startsAt不发容量、到期余量不结转、退款/恢复不补发或重置账号窗口；媒体上限按33的版本化值核成本。不重新实现购买、排队和退款交易账本。
- [ ] 验证最后一份容量竞争、相同key不同参数、两设备/多worker、取消与完成竞态、晚到usage和跨窗口；实际结果/结算幂等，失败或未知状态不被当零成本。
- [ ] 助手升级2026-09-27：免费保留真实首值、基础Memory和有界委托体验；付费提升研究深度/协调/持续工作范围；系统修复/必要澄清不新增消费，已交付关键资料不因到期锁住。
- [ ] 助手升级2026-09-27：用户所述200问题低于US$5含模型/搜索/地图/语音；增量后台步骤/重试/存储/支持和实际佣金分开计量，报告每任务及旅程窗口成本分布，不把潜在佣金当已到账。

## VPJ-36

[VPJ-36 #228](https://github.com/JTCAO515/VP-V4/issues/228) — 核心资料的导出删除框架与首批执行器

### 执行边界与首个切片

- 首个可交付结果：D1：用户重新验证身份后删除一个无关联聊天的Trip，在原生看到queued到completed并回网清理对应缓存。 main已有真实隔离SQL删除证据；native UI、export、linked-chat及全数据未完成。
- 本票责任/非目标：负责核心生命周期框架与首批执行器；58验全模块竞态/恢复覆盖，38验备份恢复，不能以请求202当删除成功。 2026-09-22已确认的实施顺序：D1 → D2 → D3 → D4 → D5；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 5专注日，PR/实际任务验证窗口
- 验收阶段: S5
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190), [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191), [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199), [VPJ-12 #201](https://github.com/JTCAO515/VP-V4/issues/201), [VPJ-31 #223](https://github.com/JTCAO515/VP-V4/issues/223), [VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226)
- Allowed: `ios/**`, `app/api/privacy/**`, `lib/server/privacy/**`, `lib/server/jobs/**`, `supabase/migrations/**`, `tests/**/privacy/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `pnpm test:e2e`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-36/verification.md`, `artifacts/VPJ-36/unrun.md`, `artifacts/VPJ-36/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-36.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 交付核心Trip/chat/material/memory/Brief/权益引用的身份复核→异步导出/删除→回执。所有新数据模块负责挂接handler，全域验收由58承接。
- [ ] 在删除期间阻止新的相关生成/同步；重试幂等，备份保留义务与恢复后重删tombstone明确。
- [ ] 保留法定财务记录的最少字段并解释；provider无法删除的范围如实披露。
- [ ] 离线旧手机不能立即接收撤销；回网/租约到期清理可控缓存，已导出文件不可远端收回，用户说明准确。

## VPJ-37

[VPJ-37 #229](https://github.com/JTCAO515/VP-V4/issues/229) — 运营看见质量、成本和故障并能停用能力

### 执行边界与首个切片

- 首个可交付结果：W1：授权运营在质量/成本视图分辨answered、partial、失败、未观测及待核费用。 PR #501已合入main，复用聚合视图及受保护读接口；真实授权部署读取与实际成本验收仍未完成。
- 本票责任/非目标：负责运营可观测性和停止消费者；59提供账本、35提供商品额度，71执行最终演练；不重建第二账本。 2026-09-22已确认的实施顺序：W1 → W2；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [artifacts/VPJ-37/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-37/verification.md) · [artifacts/VPJ-37/unrun.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-37/unrun.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 4专注日，PR/实际任务验证窗口
- 验收阶段: S5
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195), [VPJ-35 #227](https://github.com/JTCAO515/VP-V4/issues/227)
- Allowed: `lib/server/observability/**`, `apps/ops/**`, `lib/flags/**`, `tests/**/observability/**`, `docs/runbooks/**`, `app/ops/**`, `app/api/ops/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`
- Evidence: `artifacts/VPJ-37/verification.md`, `artifacts/VPJ-37/unrun.md`, `artifacts/VPJ-37/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-37.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] task/attempt/provider/tool/actor-scope计数互相可对账，日志无原聊天和秘密。
- [ ] 仪表盘可读任务成功、partial、错误、延迟、provider费用和人工时间，不把未观测记0。
- [ ] 按能力/供应商/城市关闭可及时作用并提供用户替代；预算熔断可恢复且不删Trip。

## VPJ-38

[VPJ-38 #230](https://github.com/JTCAO515/VP-V4/issues/230) — 数据库、对象与删除状态的恢复演练

### 执行边界与首个切片

- 首个可交付结果：K1：在隔离目标恢复数据库和必要对象，重放删除/撤权后才允许测试用户读取。
- 本票责任/非目标：负责灾备恢复机制；36提供删除状态，58验全模块退出，已做的74隔离演练不等于全部Storage/生产恢复。 2026-09-22已确认的实施顺序：K1 → K2；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: operator; operational; 3专注日，实际账号/签名/真机/网络等待另计，不含已取消的供应商审批
- 验收阶段: S5
- Blocked by: [VPJ-02 #189](https://github.com/JTCAO515/VP-V4/issues/189)
- 集成/最终验收依赖（普通关联）: [VPJ-36 #228](https://github.com/JTCAO515/VP-V4/issues/228)
- Allowed: `scripts/db/restore/**`, `docs/runbooks/**`, `tests/**/restore/**`, `artifacts/VPJ-38/**`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-38/verification.md`, `artifacts/VPJ-38/unrun.md`, `artifacts/VPJ-38/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: Agent完成已有授权内的开发与配置；只将确需本人交互或未授权实际外部动作交给JT，不索取额外产品或第三方许可。 Missing access is an explicit operator outcome, never fabricated completion.
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-38.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 在隔离恢复目标实测DB与Storage备份、RPO/RTO、恢复数据一致性。
- [ ] 恢复后重新应用删除tombstone与权益/许可撤销，避免已删数据复活。
- [ ] 故障演练记录实际时间/未验项，不在Production做破坏操作。
- [ ] 按数据类确定backup或no-backup TTL；对象元数据/文件、RLS/grants/functions/queue恢复分别验。

## VPJ-39

[VPJ-39 #232](https://github.com/JTCAO515/VP-V4/issues/232) — 境内外媒体、酒店跳转、IAP 与通知网络验收

### 执行边界与首个切片

- 首个可交付结果：NET1：在真实境内外WiFi/漫游/弱网下使用图片/PDF/语音，断网能恢复或保留可读资料。
- 本票责任/非目标：负责扩展端到端网络验收；63负责登录/Ask/Trip基础探针，各功能票负责实现，不重复测未变基线。 2026-09-22已确认的实施顺序：NET1 → NET2；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: operator; operational; 3专注日，实际账号/签名/真机/网络等待另计，不含已取消的供应商审批
- 验收阶段: S5
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195), [VPJ-19 #209](https://github.com/JTCAO515/VP-V4/issues/209), [VPJ-27 #217](https://github.com/JTCAO515/VP-V4/issues/217), [VPJ-63 #231](https://github.com/JTCAO515/VP-V4/issues/231), [VPJ-23 #213](https://github.com/JTCAO515/VP-V4/issues/213), [VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226), [VPJ-30 #221](https://github.com/JTCAO515/VP-V4/issues/221), [VPJ-55 #236](https://github.com/JTCAO515/VP-V4/issues/236)
- Allowed: `docs/benchmarks/network/**`, `scripts/diagnostics/**`, `artifacts/VPJ-39/**`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-39/verification.md`, `artifacts/VPJ-39/unrun.md`, `artifacts/VPJ-39/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: Agent完成已有授权内的开发与配置；只将确需本人交互或未授权实际外部动作交给JT，不索取额外产品或第三方许可。 Missing access is an explicit operator outcome, never fabricated completion.
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-39.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 按真实海外/境内WiFi/漫游/弱网记录DNS→API→DB→model/map/media的p50/p95/失败，不用provider国籍推断可达。
- [ ] 设置超时、断线恢复和离线读取目标，验证语音长连接/图片导入在预算内。
- [ ] 地区不合格时给实际替代拓扑和用户边界；采购或部署变更不自行执行。
- [ ] 在真实境内外网络验证OTA参数落地、StoreKit购买/恢复、APNs接收与回跳、Files/Share Extension导入，不以model测试代替这些不同链路。

## VPJ-40

[VPJ-40 #233](https://github.com/JTCAO515/VP-V4/issues/233) — 原生视觉动效、无障碍与性能整链复验

### 执行边界与首个切片

- 首个可交付结果：在新四Tab真实链上复验连续对话、任务/成果、Memory纠正和可中断状态。
- 本票责任/非目标：整链UX/无障碍/性能owner；旧五Tab验收保留历史，当前遵循ADR-0027和VPJ-77样例，不以概念图替代渲染。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 5专注日，PR/实际任务验证窗口
- 验收阶段: S5
- Blocked by: [VPJ-49 #241](https://github.com/JTCAO515/VP-V4/issues/241)
- 集成/最终验收依赖（普通关联）: [VPJ-13 #203](https://github.com/JTCAO515/VP-V4/issues/203), [VPJ-20 #210](https://github.com/JTCAO515/VP-V4/issues/210), [VPJ-21 #211](https://github.com/JTCAO515/VP-V4/issues/211), [VPJ-23 #213](https://github.com/JTCAO515/VP-V4/issues/213), [VPJ-25 #215](https://github.com/JTCAO515/VP-V4/issues/215), [VPJ-27 #217](https://github.com/JTCAO515/VP-V4/issues/217), [VPJ-28 #218](https://github.com/JTCAO515/VP-V4/issues/218), [VPJ-29 #220](https://github.com/JTCAO515/VP-V4/issues/220), [VPJ-30 #221](https://github.com/JTCAO515/VP-V4/issues/221), [VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226), [VPJ-48 #235](https://github.com/JTCAO515/VP-V4/issues/235), [VPJ-64 #238](https://github.com/JTCAO515/VP-V4/issues/238), [VPJ-55 #236](https://github.com/JTCAO515/VP-V4/issues/236), [VPJ-61 #240](https://github.com/JTCAO515/VP-V4/issues/240), [VPJ-36 #228](https://github.com/JTCAO515/VP-V4/issues/228), [VPJ-83 #564](https://github.com/JTCAO515/VP-V4/issues/564)
- Allowed: `ios/**`, `tests/**/ios/**`, `docs/design/**`, `artifacts/VPJ-40/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-40/verification.md`, `artifacts/VPJ-40/unrun.md`, `artifacts/VPJ-40/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-40.md`, `docs/product/assistant-upgrade-2026-09-27/README.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 按VPJ-77确定的一致视觉系统和已批准品牌资产复验；语义token、对话/计划/sheet/键盘/返回锚点保持同一状态语义，不机械照搬概念图。
- [ ] 真机/Simulator完成小屏大屏、大字VoiceOver、Reduce Motion/Transparency、来电低电量弱网；录屏展示可中断动效。
- [ ] 结构卡原子出现、滚动不抢位、已保存动画只在回执后；用profile定位性能不写未测FPS。
- [ ] 在#198真实选区Ask消费者上复验sheet、焦点、返回锚点、大字与VoiceOver及拒绝/关闭状态；不能仅引用#188基础屏幕证据完成整链验收。
- [ ] 体验增量2026-09-17：在相关上游实际可用后，整链复验同一Trip的概览/日程/地图及Today选区、版本、修改后重载一致；采用ADR-0027四Tab、全局搜索与Today在Journeys内的导航，不为图文表现复制桌面多栏或另建Trip数据源。素材未就绪时可用文字成果仍可读，按真实小屏/大字/VoiceOver验证。
- [ ] 助手升级2026-09-27：按EXPERIENCE.md E1–E10检查真实UI；Memory一步可达，任务运行不阻塞对话，结果更新不抢焦点，四Tab/全局搜索/旧deep link/账号与隐私入口全部可达。

## VPJ-41

[VPJ-41 #234](https://github.com/JTCAO515/VP-V4/issues/234) — 精简 Web Planning Studio 的最终体验验收

### 执行边界与首个切片

- 首个可交付结果：复验轻量Web与原生使用同一Trip、支持成果和准确确认revision。
- 本票责任/非目标：保留轻量Web范围；不复制原生四Tab全产品，不新建第二套artifact/Trip数据。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 4专注日，PR/实际任务验证窗口
- 验收阶段: S5
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192), [VPJ-20 #210](https://github.com/JTCAO515/VP-V4/issues/210), [VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226), [VPJ-79 #560](https://github.com/JTCAO515/VP-V4/issues/560)
- Allowed: `app/**`, `components/**`, `lib/i18n.ts`, `tests/**/frontend/**`, `docs/design/**`, `public/assets/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:e2e`
- Evidence: `artifacts/VPJ-41/verification.md`, `artifacts/VPJ-41/unrun.md`, `artifacts/VPJ-41/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-41.md`, `docs/contracts/vp-response-policy.md`, `docs/product/assistant-upgrade-2026-09-27/README.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] Web保留Chat/Trip基本编辑/diff确认/材料状态/权益，现场工具引导iOS；同Trip连续性可测。
- [ ] 公开Landing/Explore明确当前可用/覆盖/第三方预订，Early Access邮箱同意可撤。
- [ ] 桌面+390x844、中英、键盘无障碍/真实品牌资产/claim scan通过；不重做第二全功能App。
- [ ] 真实Web消费者按VP响应规范呈现主结果、必要限定与下一步；英文原生表达、中英状态一致，正文不控制按钮权限/确认目标，保留轻量同Trip范围与原有可访问性门。
- [ ] 助手升级2026-09-27：支持的新成果和proposal通过同源版本读取；未知schema安全降级，旧客户端不能在丢字段后确认新语义。

## VPJ-42

[VPJ-42 #242](https://github.com/JTCAO515/VP-V4/issues/242) — TestFlight 实机贯通 Plan、Ready、Travel 三段

### 执行边界与首个切片

- 首个可交付结果：用同一真实TestFlight版本贯通首次认识VP、关闭App后的委托、回访交付与Memory纠正。
- 本票责任/非目标：实际设备联合验收owner；复用同版本已有证据，原安装/网络/Store/数据退出缺口继续保留。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: operator; acceptance; 5专注日，实际账号/签名/真机/网络等待另计，不含已取消的供应商审批
- 验收阶段: S5
- Blocked by: [VPJ-49 #241](https://github.com/JTCAO515/VP-V4/issues/241)
- 集成/最终验收依赖（普通关联）: [VPJ-08 #196](https://github.com/JTCAO515/VP-V4/issues/196), [VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206), [VPJ-21 #211](https://github.com/JTCAO515/VP-V4/issues/211), [VPJ-24 #214](https://github.com/JTCAO515/VP-V4/issues/214), [VPJ-28 #218](https://github.com/JTCAO515/VP-V4/issues/218), [VPJ-29 #220](https://github.com/JTCAO515/VP-V4/issues/220), [VPJ-32 #224](https://github.com/JTCAO515/VP-V4/issues/224), [VPJ-35 #227](https://github.com/JTCAO515/VP-V4/issues/227), [VPJ-36 #228](https://github.com/JTCAO515/VP-V4/issues/228), [VPJ-37 #229](https://github.com/JTCAO515/VP-V4/issues/229), [VPJ-38 #230](https://github.com/JTCAO515/VP-V4/issues/230), [VPJ-39 #232](https://github.com/JTCAO515/VP-V4/issues/232), [VPJ-40 #233](https://github.com/JTCAO515/VP-V4/issues/233), [VPJ-41 #234](https://github.com/JTCAO515/VP-V4/issues/234), [VPJ-48 #235](https://github.com/JTCAO515/VP-V4/issues/235), [VPJ-55 #236](https://github.com/JTCAO515/VP-V4/issues/236), [VPJ-56 #237](https://github.com/JTCAO515/VP-V4/issues/237), [VPJ-58 #239](https://github.com/JTCAO515/VP-V4/issues/239), [VPJ-61 #240](https://github.com/JTCAO515/VP-V4/issues/240), [VPJ-64 #238](https://github.com/JTCAO515/VP-V4/issues/238), [VPJ-65 #219](https://github.com/JTCAO515/VP-V4/issues/219), [VPJ-83 #564](https://github.com/JTCAO515/VP-V4/issues/564)
- Allowed: `docs/acceptance/**`, `tests/e2e/**`, `artifacts/VPJ-42/**`, `docs/runbooks/**`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-42/verification.md`, `artifacts/VPJ-42/unrun.md`, `artifacts/VPJ-42/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: Agent完成已有授权内的开发与配置；只将确需本人交互或未授权实际外部动作交给JT，不索取额外产品或第三方许可。 Missing access is an explicit operator outcome, never fabricated completion.
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-42.md`, `docs/product/assistant-upgrade-2026-09-27/README.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 邀请受控用户在原生build完成一个真实Trip的Plan/Ready/Travel，含外跳、离线、恢复、拒绝/取消。
- [ ] 真实owner/RLS/provider/数据/网络/权限证明与TestFlight build关联；sandbox购买不算收入。
- [ ] 所有首发必需项有功能/异常/数据/UX/运行证据；只修验收缺陷，不靠fixture替代。
- [ ] 非技术经营留存与真实付费效果由47观察，不因旅行节点未到而伪称成功/失败。
- [ ] 真实设备与账号贯通#198选区Ask、明确确认、跨端/重载及拒绝路径；基础壳、模拟数据或仅#188完成不能替代本项联合验收。
- [ ] 助手升级2026-09-27：新助手E1–E10在适用真实链和客户端验收，至少含worker重启、任务运行时改口、忘记偏好后重试、旧成果确认拒绝及同源成果读回；截图/merged/fixture不能完成本项。

## VPJ-43

[VPJ-43 #243](https://github.com/JTCAO515/VP-V4/issues/243) — 独立 Production 与可回滚的客户服务环境

### 执行边界与首个切片

- 首个可交付结果：先形成可审查的独立Production配置/迁移/回退包；取得指定环境执行授权后部署并核对真实状态。
- 本票责任/非目标：负责独立生产环境和回退；不占用当前共享Staging、不解除既有保护，App Store提交归44。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: operator; operational; 3专注日，实际账号/签名/真机/网络等待另计，不含已取消的供应商审批
- 验收阶段: S6
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-38 #230](https://github.com/JTCAO515/VP-V4/issues/230), [VPJ-42 #242](https://github.com/JTCAO515/VP-V4/issues/242)
- Allowed: `docs/runbooks/**`, `scripts/db/**`, `docs/operator-actions.json`, `artifacts/VPJ-43/**`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-43/verification.md`, `artifacts/VPJ-43/unrun.md`, `artifacts/VPJ-43/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: Agent完成已有授权内的开发与配置；只将确需本人交互或未授权实际外部动作交给JT，不索取额外产品或第三方许可。 Missing access is an explicit operator outcome, never fabricated completion.
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-43.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 独立Production项目/服务凭证/配置和备份，与Staging严格分离；迁移前后验证和回滚完整。
- [ ] 隐私/Terms/support域名/资产/地区契约已齐备，功能旗标按能力设置。
- [ ] 实际部署由operator控制，secrets不写repo；不能用Preview通过替代Production验收。

## VPJ-44

[VPJ-44 #244](https://github.com/JTCAO515/VP-V4/issues/244) — 正式 App Store 1.0 提交与数字商品审核

### 执行边界与首个切片

- 首个可交付结果：复用已验版本准备准确中英商店资料、reviewer路径、隐私/删除/IAP说明，按实际账号完成获准提交。
- 本票责任/非目标：负责正式商店审核与发布；56提供分发能力、42验Beta，未获准上传/发布时继续完成独立资料与检查。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: operator; release; 3专注日，实际账号/签名/真机/网络等待另计，不含已取消的供应商审批
- 验收阶段: S6
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226), [VPJ-40 #233](https://github.com/JTCAO515/VP-V4/issues/233), [VPJ-43 #243](https://github.com/JTCAO515/VP-V4/issues/243)
- Allowed: `ios/**`, `docs/release/**`, `docs/runbooks/**`, `artifacts/VPJ-44/**`
- Checks: `pnpm docs:check`; `git diff --check`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-44/verification.md`, `artifacts/VPJ-44/unrun.md`, `artifacts/VPJ-44/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: Agent完成已有授权内的开发与配置；只将确需本人交互或未授权实际外部动作交给JT，不索取额外产品或第三方许可。 Missing access is an explicit operator outcome, never fabricated completion.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-44.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] TestFlight测试轨与AppStore完整1.0生产轨区分；满足当前Xcode/SDK、隐私清单、AI第三方同意和账号删除要求。
- [ ] 中英元数据/实机截图/支持/隐私URL、reviewer访问、IAP审查与恢复说明对应实际功能。
- [ ] JT执行签名/提交/发布，拒审按原因修复；未通过不宣称已上架。

## VPJ-45

[VPJ-45 #245](https://github.com/JTCAO515/VP-V4/issues/245) — 客户收到产品后的观察、支持与发布关账

### 执行边界与首个切片

- 首个可交付结果：在已交付版本执行72小时系统及7天机会相关观察，归档未解缺陷、支持/事故责任和产品发布结论。
- 本票责任/非目标：负责技术交付与支持关账；47负责付费/留存与服务经济性，不因尚未到旅行节点虚构观察结果。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: operator; acceptance; 3专注日，72h系统观察+至少7天机会相关跟踪；实际旅行节点未到标not_observed
- 验收阶段: S6
- Blocked by: [VPJ-42 #242](https://github.com/JTCAO515/VP-V4/issues/242), [VPJ-44 #244](https://github.com/JTCAO515/VP-V4/issues/244)
- 集成/最终验收依赖（普通关联）: 无
- Allowed: `docs/acceptance/**`, `docs/runbooks/**`, `artifacts/VPJ-45/**`, `docs/handoff.json`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-45/verification.md`, `artifacts/VPJ-45/unrun.md`, `artifacts/VPJ-45/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: Agent完成已有授权内的开发与配置；只将确需本人交互或未授权实际外部动作交给JT，不索取额外产品或第三方许可。 Missing access is an explicit operator outcome, never fabricated completion.
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-45.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 至少72小时系统观察与7天机会相关用户跟踪；自助/人工帮助、拒绝/激活、sandbox/真实购买分开。
- [ ] 支持队列、退款/删除、事故回滚、知识失效有负责人和实测响应。
- [ ] 发布门全部关闭且未解决严重问题为0才结束Program产品交付；不以下载量作为完成。

## VPJ-46

[VPJ-46 #246](https://github.com/JTCAO515/VP-V4/issues/246) — 两周客户发现试点与后续运营交接

### 执行边界与首个切片

- 首个可交付结果：以已有招募与工作包验证规划阶段真实任务，观察用户是否愿意委托并回来继续。
- 本票责任/非目标：复用原客户发现；不新增外发授权、不把访谈满意等同付费或真实采用。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: operator; operational; 2专注日，每周30–40小时、首两周校准；effort仅建立流程，不是整段观察时长
- 验收阶段: S1
- Blocked by: 无任务依赖；核实际条件
- Allowed: `docs/operations/**`, `docs/commercial/**`, `artifacts/VPJ-46/**`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-46/verification.md`, `artifacts/VPJ-46/unrun.md`, `artifacts/VPJ-46/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: Agent完成已有授权内的开发与配置；只将确需本人交互或未授权实际外部动作交给JT，不索取额外产品或第三方许可。 Missing access is an explicit operator outcome, never fabricated completion.
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-46.md`, `docs/contracts/vp-response-policy.md`, `docs/product/assistant-upgrade-2026-09-27/README.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 执行总35h时间盘：真实客户任务10、研发验收8、招募社区6、内容合作4、知识审查3、支持2、复盘2；30–40h按需求伸缩。
- [ ] 两个周sprint只跑自有/转介绍+一个社区+一个伙伴渠道；3–4访谈+1–2交付起步；禁止未请求群发。
- [ ] Planning/Arriving/In-trip队列、opt-in、原话/行为/来源/分钟数去敏记录；为Supported Journey Matrix提供真实需求。
- [ ] 初期使用许可内现有入口或VPJ-62 intake，不等待地图/支付/完整App；Founder-assisted与产品自助明确。
- [ ] 按规划/临近抵达/在途分别记录真实首值、重复问题与下一自然节点机会；Demo、创始人协助与自助真实能力分别统计，不从社媒触达推断已实现。
- [ ] 本票以两个周sprint的去敏任务/交付/分钟记录、需求复盘与下一轮负责人/节奏交接作为有限交付；后续每周经营持续进行，但不以永久运营义务让本票无法结项。
- [ ] 助手升级2026-09-27：区分探索/关键安排未定/已预订/在途人群；观察任务采用、自然节点回访、记忆可理解与可纠正、无需VP预订时的独立付费意愿；小样本不外推转化率。

## VPJ-47

[VPJ-47 #247](https://github.com/JTCAO515/VP-V4/issues/247) — 真实激活、付费与人工成本的经营观察

### 执行边界与首个切片

- 首个可交付结果：观察新助手真实任务成果、旅程窗口留存与订阅/佣金分列的经营表现。
- 本票责任/非目标：经营观察owner；不以AI标签或月付形式推定长期留存/估值，也不把旅后正常暂停直接当产品失败。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: operator; operational; 2专注日，按B0-B4真实分母；至少两轮有效cohort，不设伪日历保证
- 验收阶段: S6
- Blocked by: [VPJ-44 #244](https://github.com/JTCAO515/VP-V4/issues/244)
- 集成/最终验收依赖（普通关联）: [VPJ-42 #242](https://github.com/JTCAO515/VP-V4/issues/242), [VPJ-46 #246](https://github.com/JTCAO515/VP-V4/issues/246)
- Allowed: `docs/commercial/**`, `docs/operations/**`, `apps/ops/**`, `artifacts/VPJ-47/**`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-47/verification.md`, `artifacts/VPJ-47/unrun.md`, `artifacts/VPJ-47/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: Agent完成已有授权内的开发与配置；只将确需本人交互或未授权实际外部动作交给JT，不索取额外产品或第三方许可。 Missing access is an explicit operator outcome, never fabricated completion.
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-47.md`, `docs/contracts/vp-response-policy.md`, `docs/product/assistant-upgrade-2026-09-27/README.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] activated=采用可继续使用的真实Trip结果；outcome_recorded可含拒绝，不能混为激活。
- [ ] opportunity-based organic/triggered/founder-prompted回访分开；真实净付款与退款/赠送/sandbox分开。
- [ ] 依据主报告单一B0-B4门和容量/现金止损决策，不以一个OR指标杀整个Program；少样本明确不确定。
- [ ] 经营指标以有机会的服务任务/Trip为分母，区分Free/Pass、人工辅助、真实支付与sandbox；保留必要澄清次数、任务成本及实际人工分钟，旧Ask数值不可当同等新服务容量。
- [ ] 助手升级2026-09-27：分开任务完成/有用partial/blocked/失败、订阅实收/退款/实际结算佣金/全体活跃旅客成本；记录跨旅程回访和获客成本，不把月收入简单年化当稳定ARR证据。

## VPJ-48

[VPJ-48 #235](https://github.com/JTCAO515/VP-V4/issues/235) — 用户旅行内容投稿与发布前审核

### 执行边界与首个切片

- 首个可交付结果：J1：用户提交旅行体验或求助，看到pending及审核结果，能撤回；运营异人审阅。 PR #502已合入main，仅内部受控审核实现，公开读关闭；用户界面和完整GoTrue链仍缺。
- 本票责任/非目标：负责UGC创建/审核；64负责举报屏蔽申诉删除，未完成其必需保护前不开放公众发布；体验不自动升级Fact。 2026-09-22已确认的实施顺序：J1 → J3；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 5专注日，PR/实际任务验证窗口
- 验收阶段: S5
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-14 #204](https://github.com/JTCAO515/VP-V4/issues/204), [VPJ-20 #210](https://github.com/JTCAO515/VP-V4/issues/210), [VPJ-36 #228](https://github.com/JTCAO515/VP-V4/issues/228)
- Allowed: `ios/**`, `apps/ops/**`, `lib/server/community/**`, `supabase/migrations/**`, `tests/**/community/**`, `app/ops/**`, `app/api/ops/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-48/verification.md`, `artifacts/VPJ-48/unrun.md`, `artifacts/VPJ-48/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-48.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 注册用户可提交旅行体验/求助，所有内容发布前审；官方/员工身份披露。
- [ ] 提交→pending→reviewed→published/rejected→用户撤回形成完整小链；举报/屏蔽/申诉/删除扩展由VPJ-64承担，未完成不得公开UGC。
- [ ] 内容可关联地点/Save/Add to Trip，但体验不自动晋升Fact；无私信/关注/无限社交feed。

## VPJ-49

[VPJ-49 #241](https://github.com/JTCAO515/VP-V4/issues/241) — 最简本地旅行分享卡与隐私预览

- Owner: coding-agent; vertical; 2专注日，PR/实际任务验证窗口
- 验收阶段: S4
- Blocked by: [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192), [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199)
- Allowed: `ios/**`, `lib/server/sharing/**`, `tests/**/sharing/**`, `docs/design/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-49/verification.md`, `artifacts/VPJ-49/unrun.md`, `artifacts/VPJ-49/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-49.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 一款中英本地分享模板，用户选择字段→隐私预览→系统Share Sheet，基础分享无需公共托管。
- [ ] 模板只使用获权资产，标明AI生成或用户体验；不能伪造订单/见证。
- [ ] 分享前可隐藏酒店/订单/同行/日期等私密字段；已导出图片不能远端撤回；复杂模板/视频/托管分享另期开启。

## VPJ-50

[VPJ-50 #248](https://github.com/JTCAO515/VP-V4/issues/248) — 有真实召回失败才启用混合 RAG 与重排

### 执行边界与首个切片

- 首个可交付结果：保持expand门：先用真实召回失败归因决定是否启动；启动后同批baseline对比一个检索变量并记录净收益。
- 本票责任/非目标：负责有触发证据的检索优化；不重复76正在开发的基础检索，不把缺内容/别名当必需向量库，也不先搭新基础设施。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 5专注日，PR/实际任务验证窗口
- 验收阶段: expand
- Blocked by: [VPJ-76 #360](https://github.com/JTCAO515/VP-V4/issues/360)
- 集成/最终验收依赖（普通关联）: [VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206), [VPJ-17 #207](https://github.com/JTCAO515/VP-V4/issues/207)
- Allowed: `lib/server/knowledge/retrieval/**`, `evals/**`, `docs/benchmarks/**`, `supabase/migrations/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `pnpm evals`
- Evidence: `artifacts/VPJ-50/verification.md`, `artifacts/VPJ-50/unrun.md`, `artifacts/VPJ-50/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-50.md`, `docs/harness/hf-reuse/README.md`, `docs/knowledge-upgrade/README.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- 后续开启门: 在VPJ-47记录需求/成本/责任证据，agent据此判断开发优先级；无需额外产品许可，未实测不能自动标为验收通过
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 以实际qrels/语料规模触发实验，对同批直接读取baseline比较exact/FTS/trigram/vector/RRF。
- [ ] PGroonga、rerank、Contextual Retrieval逐项消融；权限/时效/例外/反证切片不回退。
- [ ] 只有质量/延迟/成本净收益才开放；extension版本/许可/恢复失败可回滚直接lookup。
- [ ] HF复用：真实激活门保持；明确契约与范围后可先用公开/自有合成数据作有界离线加载、格式和对照准备，不视为本票激活或真实收益。先判定缺内容/别名、排名或召回问题；每轮最多两个候选、只改一个检索变量。
- [ ] HF复用：优先Sentence Transformers验证，收益成立后再评估TEI；精确核Qwen/BGE各权重许可与revision及运行后端支持，不由embedding支持推定reranker兼容。模型库不替代RLS，主线保留原Postgres/直接lookup回退。
- [ ] 知识升级：以VPJ-76同批真实baseline/问题族/qrels区分缺内容、别名、排名与召回失误，再依现有activationEvidence触发；产品RLS/时效/范围在检索前、外发前和展示前保持，研究与产品语料不能串用。
- [ ] 知识升级：每轮比较至多两个候选且只变一项，事前冻结质量改进、p95延迟与单任务费用上限；中文分词和中英别名实测，失败/无净收益保留原路径与完整证据，不因安装pgvector/reranker或公开论文收益而称采用成立。

## VPJ-51

[VPJ-51 #249](https://github.com/JTCAO515/VP-V4/issues/249) — 航班来源与中国航线对照（证据触发）

### 执行边界与首个切片

- 首个可交付结果：保持expand门：对实际存在的中国航线需求，按同一字段/时效样本比较最少候选来源与账户能力。
- 本票责任/非目标：负责航班来源评估；52实现消费，现有官方交通出口可继续；不采购/出票/爬取受限系统。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; decision; 3专注日，实际账号/签名/真机/网络等待另计，不含已取消的供应商审批
- 验收阶段: expand
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190), [VPJ-39 #232](https://github.com/JTCAO515/VP-V4/issues/232)
- Allowed: `docs/benchmarks/aviation/**`, `docs/runbooks/**`, `artifacts/VPJ-51/**`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-51/verification.md`, `artifacts/VPJ-51/unrun.md`, `artifacts/VPJ-51/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: 已有账号/API或官方入口可用即可由agent接入；未披露信息标unknown，不以第三方/法务/产品审批阻塞开发。 实际账号不可访问或接口不可用时记录技术原因；真实购买、上架和生产动作按已有授权范围执行。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-51.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- 后续开启门: 在VPJ-47记录需求/成本/责任证据，agent据此判断开发优先级；无需额外产品许可，未实测不能自动标为验收通过
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 按中国境内/跨境航线样本比较coverage/延迟/许可/价格/归因/存储，不直接选择名气最大。
- [ ] agent记录字段来源/TTL和无coverage返回，按已有测试资金授权设置技术上限并实测，不等待额外产品或供应商许可。
- [ ] 不购买/出票/爬取受限系统。

## VPJ-52

[VPJ-52 #250](https://github.com/JTCAO515/VP-V4/issues/250) — 授权航班状态与相关行程重验

### 执行边界与首个切片

- 首个可交付结果：来源51合格后，让一条实际航班状态变化生成相关Trip重验候选，覆盖unknown/过期/撤权。
- 本票责任/非目标：负责航班观察消费；来源由51，确认由10/29，不能自动改签或把晚点当重新预订成功。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 4专注日，PR/实际任务验证窗口
- 验收阶段: expand
- Blocked by: [VPJ-51 #249](https://github.com/JTCAO515/VP-V4/issues/249)
- 集成/最终验收依赖（普通关联）: [VPJ-17 #207](https://github.com/JTCAO515/VP-V4/issues/207), [VPJ-29 #220](https://github.com/JTCAO515/VP-V4/issues/220)
- Allowed: `lib/server/external-evidence/flight/**`, `ios/**`, `tests/**/flight/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-52/verification.md`, `artifacts/VPJ-52/unrun.md`, `artifacts/VPJ-52/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-52.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- 后续开启门: 在VPJ-47记录需求/成本/责任证据，agent据此判断开发优先级；无需额外产品许可，未实测不能自动标为验收通过
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 单主Flight Adapter显示有效观察与来源时刻，延误信息映射到相关Trip重验候选。
- [ ] unknown/取消/过期不自动重订；用户确认后才改变Trip。
- [ ] 撤权、停用、供应商超时和无覆盖演练，不侵入酒店/铁路交易。

## VPJ-53

[VPJ-53 #251](https://github.com/JTCAO515/VP-V4/issues/251) — Android 与新增语言的需求触发设计

### 执行边界与首个切片

- 首个可交付结果：保持expand门：以真实需求及成本证据形成Android或新增语言的先后决定和一个明确实施范围。
- 本票责任/非目标：这是扩展决策票，不是空白客户端实现；保留现有语言兼容，不为凑新平台改首发范围。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: operator; decision; 2专注日，实际账号/签名/真机/网络等待另计，不含已取消的供应商审批
- 验收阶段: expand
- Blocked by: [VPJ-45 #245](https://github.com/JTCAO515/VP-V4/issues/245), [VPJ-47 #247](https://github.com/JTCAO515/VP-V4/issues/247)
- 集成/最终验收依赖（普通关联）: 无
- Allowed: `docs/product/**`, `docs/benchmarks/**`, `artifacts/VPJ-53/**`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-53/verification.md`, `artifacts/VPJ-53/unrun.md`, `artifacts/VPJ-53/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: Agent完成已有授权内的开发与配置；只将确需本人交互或未授权实际外部动作交给JT，不索取额外产品或第三方许可。 Missing access is an explicit operator outcome, never fabricated completion.
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-53.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- 后续开启门: 在VPJ-47记录需求/成本/责任证据，agent据此判断开发优先级；无需额外产品许可，未实测不能自动标为验收通过
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 根据真实需求决定Android/西俄阿的先后，不从schema兼容推断已支持。
- [ ] 复用同协议/Trip/entitlement，平台原生体验、语料和无障碍分别验收。
- [ ] 给独立容量/预算/迁移计划后再拆实现，不把本研究当客户端开发。

## VPJ-54

[VPJ-54 #252](https://github.com/JTCAO515/VP-V4/issues/252) — 年订阅与交易深度升级的证据决策

### 执行边界与首个切片

- 首个可交付结果：评估年订阅与更深外部执行的重复价值、责任和成本；不阻塞已接受的首轮订阅设计。
- 本票责任/非目标：本票保留未来扩展证据门；首轮订阅包装归#225，代订/支付/履约每类单独验证。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: operator; decision; 2专注日，实际账号/签名/真机/网络等待另计，不含已取消的供应商审批
- 验收阶段: expand
- Blocked by: [VPJ-45 #245](https://github.com/JTCAO515/VP-V4/issues/245), [VPJ-47 #247](https://github.com/JTCAO515/VP-V4/issues/247)
- 集成/最终验收依赖（普通关联）: 无
- Allowed: `docs/commercial/**`, `docs/adr/**`, `artifacts/VPJ-54/**`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-54/verification.md`, `artifacts/VPJ-54/unrun.md`, `artifacts/VPJ-54/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: Agent完成已有授权内的开发与配置；只将确需本人交互或未授权实际外部动作交给JT，不索取额外产品或第三方许可。 Missing access is an explicit operator outcome, never fabricated completion.
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-54.md`, `docs/product/assistant-upgrade-2026-09-27/README.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- 后续开启门: 在VPJ-47记录需求/成本/责任证据，agent据此判断开发优先级；无需额外产品许可，未实测不能自动标为验收通过
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 以重复旅行/持续价值证据评估年订阅；首轮订阅方向已由ADR-0027接受，包装由VPJ-33负责。只读Live Offer、代客执行、签约履约按品类分别决策。
- [ ] 比较责任、服务成本、恢复/退款和排名中立性；不把affiliate增长自动当升级理由。
- [ ] 本Issue只评估更长期或更深的商业扩展，不启用外部交易；现有L1a/L1b与旧Pass账本兼容继续保留，不能恢复已被替代的首轮订阅禁令。

## VPJ-55

[VPJ-55 #236](https://github.com/JTCAO515/VP-V4/issues/236) — 限定文件导入与系统分享、登录回跳衔接

### 执行边界与首个切片

- 首个可交付结果：F1：用户从Files选择一类受限PDF，逐页定位关键字段并确认加入同Trip。
- 本票责任/非目标：负责文件和系统入口；12负责单图解析基础，24负责订单语义；暂不建设多人协作邀请或任意文档平台。 2026-09-22已确认的实施顺序：F1 → F2；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 4专注日，PR/实际任务验证窗口
- 验收阶段: S4
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191), [VPJ-12 #201](https://github.com/JTCAO515/VP-V4/issues/201)
- Allowed: `ios/**`, `app/api/artifacts/**`, `lib/server/artifacts/**`, `tests/**/artifacts/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:e2e`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-55/verification.md`, `artifacts/VPJ-55/unrun.md`, `artifacts/VPJ-55/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-55.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] Share Extension/Files沿已验材料通道投递，支持一类限定页数PDF并保持关键字段校正。
- [ ] Universal Link/邀请/登录回跳/未安装回退/链接过期都有明确路径，安装后不承诺系统无法保证的自动传递。
- [ ] AppGroup按账号命名空间、TTL/退出/删除清理；恶意文件/重复导入不覆盖Trip。
- [ ] 体验增量2026-09-17：限定PDF沿#201已验校正与去重合同，将原固定活动/订单保留并展示新增/重复/冲突，不因导入重生成全程；超出页数/格式时保留原文件及Trip并给明确退路，不静默截断。已有行程、账号回跳与用户原意一致，不扩张为任意Word/Excel解析。
- [ ] 邀请/Universal Link在本票仅验已有身份与权限下的入口和原任务回跳，不建立多人Trip协作、跨账号授权或新的分享产品。

## VPJ-56

[VPJ-56 #237](https://github.com/JTCAO515/VP-V4/issues/237) — 原生 CI、签名 Archive 与首个 TestFlight 安装包

### 执行边界与首个切片

- 首个可交付结果：X1：同一commit在实际可用工具链构建，获得可审查Archive及版本/签名准备结果。
- 本票责任/非目标：负责可分发构建；42负责完整Beta、44负责正式上架。CI已勾选记录保留，未获准账号/上传动作不阻止本地诊断。 2026-09-22已确认的实施顺序：X1 → X2；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/contracts/vpj-56.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/contracts/vpj-56.md) · [artifacts/VPJ-56/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-56/verification.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: operator; operational; 4专注日，实际账号/签名/真机/网络等待另计，不含已取消的供应商审批
- 验收阶段: S5
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-01 #188](https://github.com/JTCAO515/VP-V4/issues/188)
- Allowed: `ios/**`, `.github/workflows/**`, `scripts/ios/**`, `docs/runbooks/**`, `artifacts/VPJ-56/**`
- Checks: `pnpm docs:check`; `git diff --check`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-56/verification.md`, `artifacts/VPJ-56/unrun.md`, `artifacts/VPJ-56/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: Agent完成已有授权内的开发与配置；只将确需本人交互或未授权实际外部动作交给JT，不索取额外产品或第三方许可。 Missing access is an explicit operator outcome, never fabricated completion.
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-56.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] macOS CI锁稳定Xcode版本并跑原生build/tests，artifact保存xcresult与bundle版本；PR不用生产秘密。
- [ ] JT完成Apple账号/BundleID/签名/上传，产出首个可安装TestFlight构建；只证明分发，不证明完整产品。
- [ ] 记录实际上传SDK要求和证书轮换/构建失败/撤回路径；42复用该轨，44正式上架。

## VPJ-57

[VPJ-57 #222](https://github.com/JTCAO515/VP-V4/issues/222) — 用户服务请求与按任务授予资料访问

### 执行边界与首个切片

- 首个可交付结果：C1：用户不分享也能请求通用支持，或预览问题文本后限时授权指定员工读取。 PR #497 OPEN，已有可弃Supabase登录→HTTP→PG证据；无共享Staging/真实员工或原生交互验收。
- 本票责任/非目标：负责Case身份与AccessGrant；31投影Brief，32安排真人容量；请求记录不等于接单。 2026-09-22已确认的实施顺序：C1 → C2；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 4专注日，PR/实际任务验证窗口
- 验收阶段: S4
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190), [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191), [VPJ-14 #204](https://github.com/JTCAO515/VP-V4/issues/204)
- Allowed: `ios/**`, `apps/ops/**`, `lib/server/service-cases/**`, `lib/server/identity/**`, `supabase/migrations/**`, `tests/**/service-cases/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-57/verification.md`, `artifacts/VPJ-57/unrun.md`, `artifacts/VPJ-57/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-57.md`, `docs/contracts/vp-response-policy.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 用户创建CaseRequest、预览要分享字段、授予有期限AccessGrant，指定员工才可读取。
- [ ] 撤回/到期/换员工/其他用户无法继续读取；未授权仍可请求通用支持。
- [ ] 此单提供31/32共同依赖的case身份与授权，不承诺真人已接单。
- [ ] 真人路径以具体旅途执行问题申请为范围；申请已记录不等于接单，未确认容量/时段不承诺即时处理或把普通行前规划默认转人工。

## VPJ-58

[VPJ-58 #239](https://github.com/JTCAO515/VP-V4/issues/239) — 全数据模块导出删除与恢复后的最终隔离验收

### 执行边界与首个切片

- 首个可交付结果：ALL1：一个测试账号对当前实际已存在模块完成导出删除，回执列清所有已完成/缺失模块。
- 本票责任/非目标：负责最终覆盖与跨模块回归；不重复36的基础执行器或38的备份工具，必需模块未验不能宣称全域删除完成。 2026-09-22已确认的实施顺序：ALL1 → ALL2；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; acceptance; 3专注日，PR/实际任务验证窗口
- 验收阶段: S5
- Blocked by: [VPJ-49 #241](https://github.com/JTCAO515/VP-V4/issues/241)
- 集成/最终验收依赖（普通关联）: [VPJ-30 #221](https://github.com/JTCAO515/VP-V4/issues/221), [VPJ-32 #224](https://github.com/JTCAO515/VP-V4/issues/224), [VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226), [VPJ-36 #228](https://github.com/JTCAO515/VP-V4/issues/228), [VPJ-48 #235](https://github.com/JTCAO515/VP-V4/issues/235), [VPJ-64 #238](https://github.com/JTCAO515/VP-V4/issues/238), [VPJ-24 #214](https://github.com/JTCAO515/VP-V4/issues/214), [VPJ-55 #236](https://github.com/JTCAO515/VP-V4/issues/236), [VPJ-28 #218](https://github.com/JTCAO515/VP-V4/issues/218), [VPJ-61 #240](https://github.com/JTCAO515/VP-V4/issues/240), [VPJ-25 #215](https://github.com/JTCAO515/VP-V4/issues/215)
- Allowed: `tests/security/**`, `tests/integration/**`, `docs/acceptance/**`, `artifacts/VPJ-58/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`
- Evidence: `artifacts/VPJ-58/verification.md`, `artifacts/VPJ-58/unrun.md`, `artifacts/VPJ-58/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-58.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 整合Trip/材料/记忆/Brief/Case/UGC/举报/通知/权益的数据注册与export/delete handler。
- [ ] 删除中有新任务/通知/社区发布的竞态、恢复后tombstone、离线回网和账号切换均测试。
- [ ] 保留法定字段和外部已导出副本边界准确，任一必需runtime未验则阻塞42。
- [ ] 终验运行在订单引用/本地分享/AppGroup/Guide缓存/归档/离线模块全部存在之后；每个后续数据模块变化必须重跑handler注册与删除恢复验收。

## VPJ-59

[VPJ-59 #194](https://github.com/JTCAO515/VP-V4/issues/194) — 首个真实模型任务的预算预留与故障止损

- Owner: coding-agent; vertical; 4专注日，PR/实际任务验证窗口
- 验收阶段: S2
- Blocked by: [VPJ-02 #189](https://github.com/JTCAO515/VP-V4/issues/189), [VPJ-06 #193](https://github.com/JTCAO515/VP-V4/issues/193)
- Allowed: `lib/server/model-gateway/budget/**`, `lib/server/jobs/**`, `lib/server/observability/**`, `lib/flags/**`, `supabase/migrations/**`, `tests/**/cost/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`
- Evidence: `artifacts/VPJ-59/verification.md`, `artifacts/VPJ-59/unrun.md`, `artifacts/VPJ-59/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-59.md`, `docs/contracts/service-task-metering.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 真实调用前做server预算/并发预留，调用后usage结算，取消/超时/无usage尾包进入补偿/待核。
- [ ] 按task与attempt分别限额，kill flag在调用前实际消费，不能只有配置字段。
- [ ] 两worker重复任务和进程崩溃成本账一致；此单不依赖购买IAP，35才加商品额度。
- [ ] Q37下区分ServiceTask业务归属、Turn和provider/tool attempt：必要澄清与修复共享任务成本上限，逐attempt真实计量和未知费用对账；先支持记录模式与持久成本保护，不依赖IAP或未定服务额度数值。

## VPJ-60

[VPJ-60 #200](https://github.com/JTCAO515/VP-V4/issues/200) — 图片和语音 Provider 的中英质量与数据流验收

### 执行边界与首个切片

- 首个可交付结果：M1：运营运行一组冻结的中英文C0截图，拿到字段、来源定位、usage和明确合格/不合格结论。 PR #484 已合并C0适配器；DeepSeek HTTP400保留，Qwen真实媒体调用仍UNRUN，原付费额度不复用。
- 本票责任/非目标：负责媒体provider与数据流资格；12/26/27实现用户功能，不能因文本接口兼容就宣称媒体合格。 2026-09-22已确认的实施顺序：M1 → M2 → M3；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 4专注日，PR/实际任务验证窗口
- 验收阶段: S4
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190), [VPJ-06 #193](https://github.com/JTCAO515/VP-V4/issues/193)
- Allowed: `lib/server/media/**`, `lib/server/media-translation/**`, `evals/**`, `docs/benchmarks/media/**`, `tests/**/media/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm evals`
- Evidence: `artifacts/VPJ-60/verification.md`, `artifacts/VPJ-60/unrun.md`, `artifacts/VPJ-60/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-60.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 用许可内合成材料验证实际region OCR/vision、ASR和TTS任务能力、usage、取消/删除，不假定文本模型具备媒体。
- [ ] 中英数字/否定/姓名/日期/字幕朗读一致性及失败输出分任务切片报告。
- [ ] 选择最少合格媒体路径，未验证能力不进入12/27；密钥不进客户端。

## VPJ-61

[VPJ-61 #240](https://github.com/JTCAO515/VP-V4/issues/240) — 旅行结束、归档与下一次回来

### 执行边界与首个切片

- 首个可交付结果：A1：用户主动结束Trip，选择保留哪些明确偏好或跳过，归档后仍可读成果与未完服务。 main仅已有显式归档首片；偏好选择、3草稿/1Active与完整真实验收仍缺。
- 本票责任/非目标：负责旅程结束/再次开始；不是删除账户或取消外部服务，偏好保存归11、私密分享49正在独立开发。 2026-09-22已确认的实施顺序：A1 → A2；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 3专注日，PR/实际任务验证窗口
- 验收阶段: S4
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192), [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199), [VPJ-32 #224](https://github.com/JTCAO515/VP-V4/issues/224)
- Allowed: `ios/**`, `lib/server/trip/**`, `lib/server/memory/**`, `supabase/migrations/**`, `tests/**/trip/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-61/verification.md`, `artifacts/VPJ-61/unrun.md`, `artifacts/VPJ-61/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-61.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 用户主动结束/归档Trip；时间已过不等于行程完成，归档不删除未完服务。
- [ ] 提示选择跨Trip保留的偏好，拒绝/跳过可用；创建下一Trip不复活旧时效约束。
- [ ] 最多3草稿+1Active规则可测，旧Trip可读/导出，Pass到期不抹成果。

## VPJ-62

[VPJ-62 #202](https://github.com/JTCAO515/VP-V4/issues/202) — 公开中英申请入口与隐私可控的招募漏斗

- Owner: coding-agent; vertical; 3专注日，PR/实际任务验证窗口
- 验收阶段: S1
- Blocked by: 无任务依赖；核实际条件
- Allowed: `app/**`, `components/**`, `lib/i18n.ts`, `lib/server/intake/**`, `tests/**/intake/**`, `docs/operations/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:e2e`
- Evidence: `artifacts/VPJ-62/verification.md`, `artifacts/VPJ-62/unrun.md`, `artifacts/VPJ-62/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: Baseline PR merged, all implementation blockers resolved and interfaces available. Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-62.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 一页真实范围说明→邮箱/最少资料opt-in→回执→退出，页面可在完整App前作为研究招募使用。
- [ ] 沿已有允许入口复用，staff/Founder-assisted/fixture说明准确，不声称已可下载完整App。
- [ ] 事件schema分申请/同意/入组/首值/拒绝，防重复/垃圾请求，营销同意与研究同意分开。

## VPJ-63

[VPJ-63 #231](https://github.com/JTCAO515/VP-V4/issues/231) — 登录、Ask 与 Trip 的境内外网络首轮探针

### 执行边界与首个切片

- 首个可交付结果：复用已有登录/Ask/Trip入口，从一个真实网络来源开始记录DNS到模型的可达/延迟/失败，再补另一地域。
- 本票责任/非目标：负责基础网络证据；39补媒体/OTA/IAP/通知；缺地域实测单列UNRUN，继续可做的脚本和已有网络测量。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: operator; operational; 2专注日，实际账号/签名/真机/网络等待另计，不含已取消的供应商审批
- 验收阶段: S2
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191), [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195)
- Allowed: `scripts/diagnostics/**`, `docs/benchmarks/network/**`, `artifacts/VPJ-63/**`
- Checks: `pnpm docs:check`; `git diff --check`
- Evidence: `artifacts/VPJ-63/verification.md`, `artifacts/VPJ-63/unrun.md`, `artifacts/VPJ-63/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: evidence-no-fabrication
- 运行门: Agent完成已有授权内的开发与配置；只将确需本人交互或未授权实际外部动作交给JT，不索取额外产品或第三方许可。 Missing access is an explicit operator outcome, never fabricated completion.
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-63.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 尽早测真实海外与境内普通网络的登录/Ask/Trip/API/DB/model，不等完整语音和地图。
- [ ] 明确每段失败原因/延迟和可用退路；无法实测地域标operator evidence missing。
- [ ] 不切生产拓扑，仅为39的全媒体/OTA/IAP网络验收提供基线。

## VPJ-64

[VPJ-64 #238](https://github.com/JTCAO515/VP-V4/issues/238) — 社区举报、屏蔽、申诉与内容删除

### 执行边界与首个切片

- 首个可交付结果：J2：在受控测试内容上完成举报→运营处置→回执，屏蔽或申诉有可追状态。
- 本票责任/非目标：负责UGC安全生命周期；48负责投稿审核本身，36/58负责统一数据退出，不建设私信/关注系统。 2026-09-22已确认的实施顺序：J2 → J4；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 3专注日，PR/实际任务验证窗口
- 验收阶段: S5
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-14 #204](https://github.com/JTCAO515/VP-V4/issues/204), [VPJ-36 #228](https://github.com/JTCAO515/VP-V4/issues/228), [VPJ-48 #235](https://github.com/JTCAO515/VP-V4/issues/235)
- Allowed: `ios/**`, `apps/ops/**`, `lib/server/community/**`, `supabase/migrations/**`, `tests/**/community/**`, `app/ops/**`, `app/api/ops/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-64/verification.md`, `artifacts/VPJ-64/unrun.md`, `artifacts/VPJ-64/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-64.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 公开UGC前补齐举报→运营处置→回执、用户屏蔽、审核拒绝/申诉、作者撤回/删除。
- [ ] 员工利益关系/来源/著作权字段可见；用户体验不得自动发布为Fact。
- [ ] 挂接privacy handler，避免下架后Explore/缓存/引用继续可见；无私信/关注系统。

## VPJ-65

[VPJ-65 #219](https://github.com/JTCAO515/VP-V4/issues/219) — 真实地点与依据支撑的完整计划核验

### 执行边界与首个切片

- 首个可交付结果：把一个相对日草稿补成真实地点/路线/时区/预约与行李缓冲约束，输出有来源的可行/待核结论和提案。
- 本票责任/非目标：负责规划约束与TripItemSupport；19提供地点/路程，09/10提供交互，68验少走路案例，不另造writer。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 4专注日，PR/实际任务验证窗口
- 验收阶段: S3
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-09 #197](https://github.com/JTCAO515/VP-V4/issues/197), [VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206), [VPJ-19 #209](https://github.com/JTCAO515/VP-V4/issues/209)
- Allowed: `ios/**`, `lib/server/trip/**`, `lib/server/constraints/**`, `lib/server/knowledge/**`, `tests/**/planning/**`, `evals/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm evals`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-65/verification.md`, `artifacts/VPJ-65/unrun.md`, `artifacts/VPJ-65/commands.jsonl`
- 接口: docs/program/2026-09-05/INTERFACES.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/contracts/vpj-65.md`, `docs/contracts/vp-response-policy.md`, `docs/harness/hf-reuse/README.md`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 相对日草稿补成具体日期/实际地点时逐项解析身份、地址、路线和入场约束。
- [ ] 不完整依据仍可保留用户决定但标待核，plan feasible只能由当前必要证据支持。
- [ ] 整条有依据Proposal→diff→确认→TripItemSupport→以后重验可追溯。
- [ ] 计划适合度由最新明确需求与相关基础偏好参与，但步行量、时间、地点和可行性仍需同口径合格证据；不得因品牌个性化而放宽来源或晚餐锁。
- [ ] HF复用：借TravelPlanner等的有限约束检查结构并用独立oracle验最终计划，保留真实来源/版本/时区/用户约束；不执行外部hard_logic_py/任意DSL，不将ChinaTravel/Open-Travel的NC数据或历史价目直接导入商业运行链。
- [ ] 体验增量2026-09-17：计划核验覆盖机场/站场到住宿、跨城、换酒店取行李、固定预约报到及末班风险；基于实际地点、日期/时区、同行与行李约束核对门到门时间及必要缓冲。更改机场/酒店后重验受影响段，固定预约不被普通估算静默顺移；缺可靠路线依据保留待核。
- [ ] 体验增量2026-09-17：当前展开天次的餐饮/活动候选与路线、开放/预约条件相容；不强迫用户保留的自由时段绑定商户，不制造未选餐厅或实时席位。可靠缺口交给#211形成有依据的下一步，未确认提案不修改Trip；#265复用同口径少走路与已确认晚餐保持验收。

## VPJ-66

[VPJ-66 #263](https://github.com/JTCAO515/VP-V4/issues/263) — Harness：两条离线旅行任务可运行、判分并定位失败

- Owner: coding-agent; vertical; 2专注日，有界PR验证；真实环境/人工校准等待另计
- 验收阶段: S2
- Blocked by: 无任务依赖；核实际条件
- Allowed: `evals/harness/**`, `tests/**/harness/**`, `scripts/run-ci-suite.mjs`, `docs/harness/**`, `artifacts/VPJ-66/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm evals`
- Evidence: `artifacts/VPJ-66/verification.md`, `artifacts/VPJ-66/unrun.md`, `artifacts/VPJ-66/commands.jsonl`, `artifacts/VPJ-66/results.json`
- 接口: docs/harness/README.md; Red lines: RL-01, RL-02, RL-03, RL-04, RL-05, RL-06, RL-07
- 运行门: 本规划已合并；既有版本化合同足以支持两个离线种子。无需provider、数据库或operator授权，不能为方便测试读取实际凭据。
- 文档影响: `docs/harness/README.md`, `docs/handoff.json`
- 不得触碰: 不新建 Program、Coordinator、模型路由、长期记忆、预算账本或 Ops 仪表盘；缺失基础接口归原 VPJ 责任票。；保留 actor/RLS、证据资格、用途/接收方许可、准确版本确认和原子 TripPatch；不解除 Trip/proposal 工具注册限制。；不读取或持久记录秘密、真实用户原文或完整思维链；不修改原用户工作树、既有65项范围/依赖或已应用迁移。；不把 fixture/NOT_RUN/skip 当真实通过，不自动上线候选，不进行未授权的账号、外发、采购、支付或生产操作。
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

### 执行边界与首个切片

- 首个可交付结果：先核对PR #420的H04离线切片（合入testing-chat-vpv4，尚未在main），独立接回可复用增量；再把一个仍NOT_RUN的只读场景接到真实producer/consumer并核对Trip不变。
- 本票责任/非目标：负责只读真实整合验收；不是再实现07/16/76，离线H04通过不等于全部12场景或S2完成。
- 先读/复用：[docs/harness/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/harness/README.md) · [docs/harness/OFFLINE-SEEDS.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/harness/OFFLINE-SEEDS.md) · [artifacts/VPJ-67/recorded-usage-20260913/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-67/recorded-usage-20260913/verification.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 4专注日，有界PR验证；真实环境/人工校准等待另计
- 验收阶段: S2
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-66 #263](https://github.com/JTCAO515/VP-V4/issues/263), [VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206)
- Allowed: `lib/server/turn/**`, `lib/server/context/**`, `lib/server/knowledge/**`, `lib/server/observability/**`, `app/api/chat/**`, `components/chat/**`, `ios/VisePanda/**`, `evals/harness/**`, `tests/**/harness/**`, `docs/harness/**`, `artifacts/VPJ-67/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm evals`
- Evidence: `artifacts/VPJ-67/verification.md`, `artifacts/VPJ-67/unrun.md`, `artifacts/VPJ-67/commands.jsonl`, `artifacts/VPJ-67/results.json`
- 接口: docs/harness/README.md; Red lines: RL-01, RL-02, RL-03, RL-04, RL-05, RL-06, RL-07
- 运行门: VPJ-16继承VPJ-07及真实身份/provider/预算/知识门；接口、获准Staging、测试身份、provider接收方和批次费用上限必须实际可用。 按共享流程可先交独立fixture准备PR；真实中英客户端、证据与只读无写入验收缺失时父票不得关闭。
- Native: 本票实际受影响原生路径必须build/test并附中英交互证据；先xcrun simctl list devices available，记录实际UDID替换后的xcodebuild test命令及版本/xcresult。真实账号/worker/服务不可用标UNRUN；Simulator不替代原票的真机/商店门。
- 文档影响: `docs/harness/README.md`, `docs/handoff.json`
- 不得触碰: 不新建 Program、Coordinator、模型路由、长期记忆、预算账本或 Ops 仪表盘；缺失基础接口归原 VPJ 责任票。；保留 actor/RLS、证据资格、用途/接收方许可、准确版本确认和原子 TripPatch；不解除 Trip/proposal 工具注册限制。；不读取或持久记录秘密、真实用户原文或完整思维链；不修改原用户工作树、既有65项范围/依赖或已应用迁移。；不把 fixture/NOT_RUN/skip 当真实通过，不自动上线候选，不进行未授权的账号、外发、采购、支付或生产操作。
- Rollback: 关闭本票整合检查点并恢复原支持路径；不清空用户任务、不改授权或预算账本。

- [ ] 获准测试用户在真实原生Ask无需创建Trip即可获得answered/partial/clarification/blocked/technical_failure及对应证据；复用VPJ-07/16实际producer/consumer，不重建基础能力。
- [ ] 服务端身份和用途/接收方资格始终成立，正常可答/部分可答/缺字段/证据过期与冲突/资料注入/provider不可用均有命名观察；只读请求前后Trip数量和内容不变。
- [ ] 关键claim有当前适用证据和对应校验回执；必要claim遗漏、过度拒答和无谓追问能被判失败，固定快照不冒充实时核验。
- [ ] 任务ID可追至attempt、上下文/证据/工具版本、原因码、终态、耗时、预算及实际usage；仅allowlist字段，缺失费用标unknown。
- [ ] 把12场景中本票负责的只读案例接入必测集合；fixture与真实Staging分栏，中英各至少一条实际任务链通过，不能以界面文字或mock结票。
- [ ] 验证原生消费者和现有Web Chat的结果语义，保留老客户端兼容；本票不扩充Web范围。

## VPJ-68

[VPJ-68 #265](https://github.com/JTCAO515/VP-V4/issues/265) — Harness：少走路且保留已确认晚餐的局部改稿闭环

### 执行边界与首个切片

- 首个可交付结果：在实际路线依据就绪时执行同一Trip少走路且保留晚餐的完整局部改稿，取得确认/重载与测量回执。
- 本票责任/非目标：负责整合验收；10实现交互、11提供偏好、65提供可行性，不能用新fake适配器绕过真实输入。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [docs/harness/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/harness/README.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 4专注日，有界PR验证；真实环境/人工校准等待另计
- 验收阶段: S3
- Blocked by: [VPJ-65 #219](https://github.com/JTCAO515/VP-V4/issues/219)
- 集成/最终验收依赖（普通关联）: [VPJ-67 #264](https://github.com/JTCAO515/VP-V4/issues/264), [VPJ-10 #198](https://github.com/JTCAO515/VP-V4/issues/198), [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199), [VPJ-79 #560](https://github.com/JTCAO515/VP-V4/issues/560)
- Allowed: `lib/server/trip/**`, `lib/server/constraints/**`, `lib/server/context/**`, `lib/server/memory/**`, `app/api/trips/**`, `components/canvas/**`, `ios/VisePanda/**`, `evals/harness/**`, `tests/**/harness/**`, `docs/harness/**`, `artifacts/VPJ-68/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm evals`
- Evidence: `artifacts/VPJ-68/verification.md`, `artifacts/VPJ-68/unrun.md`, `artifacts/VPJ-68/commands.jsonl`, `artifacts/VPJ-68/results.json`
- 接口: docs/harness/README.md; Red lines: RL-01, RL-02, RL-03, RL-04, RL-05, RL-06, RL-07
- 运行门: 真实Trip、局部提案、可纠正上下文及计划依据由VPJ-10/11/65验收；获准测试身份/数据/路线依据必须存在。 受影响Web路径做桌面与390×844交互/console检查，原生做实际确认/拒绝/重载；全量设备发布门仍归原票。
- Native: 本票实际受影响原生路径必须build/test并附中英交互证据；先xcrun simctl list devices available，记录实际UDID替换后的xcodebuild test命令及版本/xcresult。真实账号/worker/服务不可用标UNRUN；Simulator不替代原票的真机/商店门。
- 文档影响: `docs/harness/README.md`, `docs/handoff.json`, `docs/product/assistant-upgrade-2026-09-27/README.md`
- 不得触碰: 不新建 Program、Coordinator、模型路由、长期记忆、预算账本或 Ops 仪表盘；缺失基础接口归原 VPJ 责任票。；保留 actor/RLS、证据资格、用途/接收方许可、准确版本确认和原子 TripPatch；不解除 Trip/proposal 工具注册限制。；不读取或持久记录秘密、真实用户原文或完整思维链；不修改原用户工作树、既有65项范围/依赖或已应用迁移。；不把 fixture/NOT_RUN/skip 当真实通过，不自动上线候选，不进行未授权的账号、外发、采购、支付或生产操作。
- Rollback: 停用本票整合入口，保留已确认Trip及手动编辑路径；不得回写撤销已发生的用户确认或改历史迁移。

- [ ] 用户对当前Trip要求第二天少走路、不动已确认晚餐；沿现有候选→可见diff→精确版本确认→原子Patch→重载路径验收，不另建writer。
- [ ] 按同日期/时区、出行模式、来源版本和口径比较步行距离或步行时长，运行前选择主要步行指标并要求其严格减少，另一指标辅助披露，不能删必保留项目换成功；基础数据归VPJ-65/19。证据不足只算待核候选，不算已验证少走路。
- [ ] 晚餐item ID、地点、日期/时区、起止时间、确认状态及回执在候选/diff/最终Trip均不变；当前明确要求优先于旧偏好但不能覆盖权限与安全。
- [ ] 用户确认绑定不可变proposal revision与base Trip revision；未确认、拒绝、过期、越权/撤权以及另一客户端修改均不误写或覆盖，重复确认不重复提交。
- [ ] 按12场景规格接入约束/偏好/证据不足及确认冲突案例；原生中英结果和精简Web同Trip/diff语义一致，应用后重载与事务回执一致。
- [ ] 报告fixture与获准真实环境、测量依据及失败案例；缺路线口径或真实原子回执不可用不能关闭本票。
- [ ] 助手升级2026-09-27：局部改稿增加artifact/task/memory basis一致性观测，精确保留已确认对象；真实步行改善等既有专项不因新UI而缩减。

## VPJ-69

[VPJ-69 #266](https://github.com/JTCAO515/VP-V4/issues/266) — Harness：故障取消与重连不伪造成功或重复提交

### 执行边界与首个切片

- 首个可交付结果：在68同一任务的一个提交/回执检查点注入真实中断，验证原任务恢复、取消和重复投递的终态。
- 本票责任/非目标：负责跨执行/确认的故障整合；07/08实现运行机制，59记attempt费用，不重复建设队列。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [docs/harness/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/harness/README.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 3专注日，有界PR验证；真实环境/人工校准等待另计
- 验收阶段: S3
- Blocked by: [VPJ-68 #265](https://github.com/JTCAO515/VP-V4/issues/265)
- 集成/最终验收依赖（普通关联）: [VPJ-80 #561](https://github.com/JTCAO515/VP-V4/issues/561)
- Allowed: `lib/server/turn/**`, `lib/server/jobs/**`, `lib/server/observability/**`, `app/api/chat/**`, `ios/VisePanda/**`, `components/chat/**`, `evals/harness/**`, `tests/**/harness/**`, `docs/harness/**`, `artifacts/VPJ-69/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm evals`
- Evidence: `artifacts/VPJ-69/verification.md`, `artifacts/VPJ-69/unrun.md`, `artifacts/VPJ-69/commands.jsonl`, `artifacts/VPJ-69/results.json`
- 接口: docs/harness/README.md; Red lines: RL-01, RL-02, RL-03, RL-04, RL-05, RL-06, RL-07
- 运行门: VPJ-68经VPJ-10→VPJ-09继承VPJ-08的恢复门；不重复建设任务、事件或预算账本。 仅在获准隔离Staging、测试任务与预算下故障注入；无获准worker/持久数据则真实恢复UNRUN，保持父票开放。
- Native: 本票实际受影响原生路径必须build/test并附中英交互证据；先xcrun simctl list devices available，记录实际UDID替换后的xcodebuild test命令及版本/xcresult。真实账号/worker/服务不可用标UNRUN；Simulator不替代原票的真机/商店门。
- 文档影响: `docs/harness/README.md`, `docs/handoff.json`, `docs/product/assistant-upgrade-2026-09-27/README.md`
- 不得触碰: 不新建 Program、Coordinator、模型路由、长期记忆、预算账本或 Ops 仪表盘；缺失基础接口归原 VPJ 责任票。；保留 actor/RLS、证据资格、用途/接收方许可、准确版本确认和原子 TripPatch；不解除 Trip/proposal 工具注册限制。；不读取或持久记录秘密、真实用户原文或完整思维链；不修改原用户工作树、既有65项范围/依赖或已应用迁移。；不把 fixture/NOT_RUN/skip 当真实通过，不自动上线候选，不进行未授权的账号、外发、采购、支付或生产操作。
- Rollback: 移除测试故障注入和新增整合点，保留已发生账目/提交、最终回执与原有恢复能力。

- [ ] 对同一真实任务在接受请求、工具返回、提案生成、提交前后及流式尾包命名检查点注入超时/重复投递/进程崩溃/断网/取消，重新进入得到真实最终状态。
- [ ] 用户扣次和Trip提交不重复；provider attempt可能重复收费须真实计量。提交或usage未知先核验/对账，不盲重试副作用。
- [ ] 取消阻止后续新副作用；提交已发生则显示已提交，不能伪称撤销。旧租约不能继续提交，跨账号旧事件不能回放。
- [ ] 实际Staging持久worker/数据/客户端在进程重启后仍恢复同一任务；进程内fake只能作为准备证据。任务次数/期限/费用均有预设上限。
- [ ] 将12场景中的故障与取消案例及命名注入点加入回归，保存实际最终状态/回执/失败矩阵；原生中英及现有Web受影响恢复路径验证。
- [ ] 助手升级2026-09-27：覆盖独立对话与后台任务、重启检查点、改口/撤回后旧成果失效、at-least-once工具执行和逻辑成果幂等；unknown不得变completed。

## VPJ-70

[VPJ-70 #267](https://github.com/JTCAO515/VP-V4/issues/267) — Harness：只读模型或提示词候选的配对评测与校准

### 执行边界与首个切片

- 首个可交付结果：EVAL1：在候选运行前固定语料/阈值/预算与grader，通过真实人工正反例校准盲评。 PR #495已合入main，freeze/report及合成负控已有；真实人工校准和provider配对仍未完成。
- 本票责任/非目标：负责真实任务质量/语气配对与人工校准；06验供应商协议，72离线工具不重做，不自动切生产模型。 2026-09-22已确认的实施顺序：EVAL1 → EVAL2；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/harness/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/harness/README.md) · [artifacts/VPJ-70/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-70/verification.md) · [artifacts/VPJ-70/unrun.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-70/unrun.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 3专注日，有界PR验证；真实环境/人工校准等待另计
- 验收阶段: S5
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-67 #264](https://github.com/JTCAO515/VP-V4/issues/264), [VPJ-72 #287](https://github.com/JTCAO515/VP-V4/issues/287)
- Allowed: `evals/harness/**`, `tests/**/harness/**`, `docs/benchmarks/**`, `lib/server/model-gateway/prompt/**`, `docs/harness/**`, `artifacts/VPJ-70/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm evals`
- Evidence: `artifacts/VPJ-70/verification.md`, `artifacts/VPJ-70/unrun.md`, `artifacts/VPJ-70/commands.jsonl`, `artifacts/VPJ-70/results.json`
- 接口: docs/harness/README.md; Red lines: RL-01, RL-02, RL-03, RL-04, RL-05, RL-06, RL-07
- 运行门: 真实只读、模型和预算依赖由VPJ-67→VPJ-16→VPJ-07继承；允许合成评分器准备先行，真实配对及人工校准缺失不能结票。 使用已有可用配置；agent在候选运行前冻结评分容差与技术费用上限并执行，不等待产品负责人许可。
- 文档影响: `docs/harness/README.md`, `docs/handoff.json`, `docs/contracts/vp-response-policy.md`, `docs/harness/hf-reuse/README.md`
- 不得触碰: 不新建 Program、Coordinator、模型路由、长期记忆、预算账本或 Ops 仪表盘；缺失基础接口归原 VPJ 责任票。；保留 actor/RLS、证据资格、用途/接收方许可、准确版本确认和原子 TripPatch；不解除 Trip/proposal 工具注册限制。；不读取或持久记录秘密、真实用户原文或完整思维链；不修改原用户工作树、既有65项范围/依赖或已应用迁移。；不把 fixture/NOT_RUN/skip 当真实通过，不自动上线候选，不进行未授权的账号、外发、采购、支付或生产操作。
- Rollback: 撤销候选配置，保持基线与原报告；不切换生产配置、不覆盖业务状态。

- [ ] 在获准的同一只读任务链上比较现有基线与一个明确候选，输出采纳/拒绝/证据不足及逐例证据；可只改提示词，不要求新增provider或自动生产路由。
- [ ] 固定任务输入、时钟、证据、权限、预算政策、grader与版本，开发集调优、holdout只作冻结后评测；污染案例登记后转开发集并补未用于调优的holdout。
- [ ] 候选运行前由agent固定质量容差、正常可答/必要claim不退化、延迟/单任务/整批技术上限和预声明收益；无需产品签字，资金范围沿用已有授权。结果不足报evidence_insufficient，不作通过。
- [ ] 每个适用只读场景每配置起步重复3次并分中英/风险汇总；样本数、失败、NOT_RUN及unknown成本同时报告，不能用总体均分掩盖切片失败或小样本宣称统计显著。
- [ ] 确定性红线与质量rubric分开；人工校准正反例、记录grader分歧，不由生成模型自评或看结果后改标准。回归中故意退化候选须被拒绝。
- [ ] 交付同一JSON报告/Markdown摘要与可复用配对入口；本票关闭限于只读比较，Trip配对与最终能力判定保留VPJ-71。开发接收方/地区按开发接入规则记录实际配置及用户同意，不等待第三方审批。
- [ ] 在既有配对入口加入任务完成、事实限定、正确偏好使用、下一步、密度、英文自然度及情境语气rubric；人工校准并预冻结阈值，正常可答的过度拒绝判失败，hard fail不被均分抵消。
- [ ] HF复用：消费VPJ-72的离线内容判分与盲评包，保留A/B交换、平局/都失败、评分来源和反馈版本；工具验证或合成标注不冒充真实人工校准。HF Judge/Guidebook只借方法，真实候选沿用已有测试授权、技术预算和事前阈值，不等待产品许可。

## VPJ-71

[VPJ-71 #268](https://github.com/JTCAO515/VP-V4/issues/268) — Harness：核心任务发布判定与能力停用恢复验收

### 执行边界与首个切片

- 首个可交付结果：GATE1：对同一选定commit/config运行全部required-mode场景，明确是否允许该能力进入Beta。
- 本票责任/非目标：负责Harness最终门；42/43/44/45仍各管设备、生产、商店和交付，不能以本票结果自动关闭它们。 2026-09-22已确认的实施顺序：GATE1 → GATE2；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [docs/harness/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/harness/README.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 3专注日，有界PR验证；真实环境/人工校准等待另计
- 验收阶段: S5
- Blocked by: [VPJ-69 #266](https://github.com/JTCAO515/VP-V4/issues/266), [VPJ-70 #267](https://github.com/JTCAO515/VP-V4/issues/267)
- 集成/最终验收依赖（普通关联）: [VPJ-37 #229](https://github.com/JTCAO515/VP-V4/issues/229), [VPJ-63 #231](https://github.com/JTCAO515/VP-V4/issues/231), [VPJ-83 #564](https://github.com/JTCAO515/VP-V4/issues/564)
- Allowed: `evals/harness/**`, `tests/**/harness/**`, `lib/server/observability/**`, `lib/flags/**`, `docs/acceptance/**`, `docs/runbooks/**`, `docs/benchmarks/**`, `docs/harness/**`, `artifacts/VPJ-71/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm evals`
- Evidence: `artifacts/VPJ-71/verification.md`, `artifacts/VPJ-71/unrun.md`, `artifacts/VPJ-71/commands.jsonl`, `artifacts/VPJ-71/results.json`
- 接口: docs/harness/README.md; Red lines: RL-01, RL-02, RL-03, RL-04, RL-05, RL-06, RL-07
- 运行门: VPJ-69/70实际验收完成，VPJ-37 Ops停用与VPJ-63真实网络证据可用；agent已在运行前冻结本轮完整集合阈值，无需产品负责人签字。 获准Staging能力停用/恢复与部署回退窗口实际存在；生产开放仍需对应对象/环境/范围有效授权。
- 文档影响: `docs/harness/README.md`, `docs/handoff.json`, `docs/contracts/service-task-metering.md`, `docs/contracts/basic-preferences-cross-trip.md`, `docs/contracts/vp-response-policy.md`, `docs/harness/hf-reuse/README.md`, `docs/product/assistant-upgrade-2026-09-27/README.md`
- 不得触碰: 不新建 Program、Coordinator、模型路由、长期记忆、预算账本或 Ops 仪表盘；缺失基础接口归原 VPJ 责任票。；保留 actor/RLS、证据资格、用途/接收方许可、准确版本确认和原子 TripPatch；不解除 Trip/proposal 工具注册限制。；不读取或持久记录秘密、真实用户原文或完整思维链；不修改原用户工作树、既有65项范围/依赖或已应用迁移。；不把 fixture/NOT_RUN/skip 当真实通过，不自动上线候选，不进行未授权的账号、外发、采购、支付或生产操作。
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
- [ ] 助手升级2026-09-27：在既有12场景与实际发布门之外，汇总新助手三段体验和E1–E10的适用证据；不重置历史失败，不以新增场景数替代真实闭环。

## VPJ-72

[VPJ-72 #287](https://github.com/JTCAO515/VP-V4/issues/287) — 中英回答离线内容判分与可导入反馈的盲评包

- Owner: coding-agent; vertical; 3专注日，有界准备PR；真实调用/人工校准/产品集成在原父票验证
- 验收阶段: S2
- Blocked by: [VPJ-66 #263](https://github.com/JTCAO515/VP-V4/issues/263)
- Allowed: `evals/harness/response-quality/**`, `tests/**/response-quality/**`, `evals/harness/pairing/**`, `docs/harness/hf-reuse/**`, `artifacts/VPJ-72/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm evals`
- Evidence: `artifacts/VPJ-72/verification.md`, `artifacts/VPJ-72/unrun.md`, `artifacts/VPJ-72/commands.jsonl`, `artifacts/VPJ-72/results.json`
- 接口: docs/harness/hf-reuse/README.md; Red lines: RL-01, RL-02, RL-04, RL-05, RL-06, RL-07
- 运行门: VPJ-66已完成，PR277配对接口已在main；只用自有合成样本与已有报告，无真实provider/数据库依赖。 本地反馈界面可选现有静态输出；需要依赖时固定版本和许可，不把安装框架当结果。
- 文档影响: `docs/harness/hf-reuse/README.md`, `docs/handoff.json`
- 不得触碰: 不改变原生iOS/Web架构、Coordinator、RLS、TripProposal确认、任务消费或已应用迁移；不重建已有Harness。；不读取真实用户原文/密钥或调用未授权provider，不上传Hub/Space，不启动云Jobs/训练或采购。；外部数据/代码/权重/服务许可分别核对，NC或冲突未解决不放入商业管线；不执行样本中的任意代码/DSL。；保留其他任务修改与现有12场景主验收；不得把fixture、自动标签、NOT_RUN或跳过验证当真实能力通过。
- Rollback: 回退新增判分/盲评入口与报告版本适配，保留旧pairing及已有反馈/证据；不改变线上配置。

- [ ] 开发者从主线已存在的配对报告生成中英离线内容/语气判分与本机盲评包，导入反馈后得到同一版本化JSON/Markdown结果；完整交付限于离线工具和反例。
- [ ] 复用既有pairing schema/版本/hash及报告，不重建runner或模型路由；优先静态/Markdown，真实交互不足时才用本机Gradio且无公网分享。
- [ ] 明确回应目标、证据限定、下一步、偏好适用、密度、英文自然和情境语气的有锚点rubric；事实/权限/确认/虚构执行结果硬失败独立否决，正常可答案例过度拒绝被检出。 可确定校验的状态/回执使用确定性断言；语义事实支持和自然度需要人工或经校准judge，未评项标NOT_RUN，不以关键词匹配声称通用语义判分。
- [ ] 自有中英正常/错误输出通过完整入口验证；交换A/B、平局/都失败、重复反馈去重、错误case/version拒绝、反馈来源human/fixture明确。合成标签不能记为人工评审。
- [ ] 保留8开发/4holdout及12场景口径，登记已暴露样本；外部例需repo/revision/来源/许可，自有例不伪称外部benchmark正式得分，不复制NC教程正文或数据。
- [ ] 报告可供#267消费，并明确真实provider配对/人工校准/采用判定仍UNRUN；未执行离线全流程或反例失败不能关闭本票。

## VPJ-73

[VPJ-73 #288](https://github.com/JTCAO515/VP-V4/issues/288) — Docling合成旅行材料解析与校正候选试验

- Owner: coding-agent; vertical; 3专注日，有界准备PR；真实调用/人工校准/产品集成在原父票验证
- 验收阶段: S2
- Blocked by: 无任务依赖；核实际条件
- Allowed: `scripts/experiments/docling/**`, `tests/**/docling/**`, `docs/harness/hf-reuse/**`, `artifacts/VPJ-73/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm evals`
- Evidence: `artifacts/VPJ-73/verification.md`, `artifacts/VPJ-73/unrun.md`, `artifacts/VPJ-73/commands.jsonl`, `artifacts/VPJ-73/results.json`
- 接口: docs/harness/hf-reuse/README.md; Red lines: RL-01, RL-02, RL-04, RL-05, RL-06, RL-07
- 运行门: 明确本票是独立本地试验，不依赖真实材料/provider/账号；只采用可核验许可的输入和组件。 实际转换命令由本票实现并记录在commands.jsonl，不预填尚不存在的Docling脚本命令；必要Python依赖与资源在隔离环境核对。
- 文档影响: `docs/harness/hf-reuse/README.md`, `docs/handoff.json`
- 不得触碰: 不改变原生iOS/Web架构、Coordinator、RLS、TripProposal确认、任务消费或已应用迁移；不重建已有Harness。；不读取真实用户原文/密钥或调用未授权provider，不上传Hub/Space，不启动云Jobs/训练或采购。；外部数据/代码/权重/服务许可分别核对，NC或冲突未解决不放入商业管线；不执行样本中的任意代码/DSL。；保留其他任务修改与现有12场景主验收；不得把fixture、自动标签、NOT_RUN或跳过验证当真实能力通过。
- Rollback: 移除隔离试验入口与本票自有临时样本，保留采用/否决依据；不改既有材料入口、用户数据或迁移。

- [ ] 用自有合成中英旅行截图评估固定Docling管线，输出带原材料ID/位置/字段/不完整状态的校正候选与可复现采用或否决报告；可搜索PDF仅作对照，不扩#201单张截图或#236多页产品范围。
- [ ] 运行前登记框架与所用解析器/权重各自许可、revision和资产；不默认使用许可矛盾的SmolDocling，不启用未审remote code、远程服务或外部插件。下载准备与真正离线运行分开证明。 在运行前固定小型中英样本与关键字段/来源位置oracle、采用/否决判据和有限输入/时长/内存上限，禁止跑后挑样或改阈值。
- [ ] 可运行分支必须保留可重复的实际转换证据，覆盖日期/时区、金额币种、小字/折行、缺失信息和OCR错误，保留可回看的原位置，错误由校正候选呈现；不可运行分支不填转换PASS，按本票有据否决路径处理。
- [ ] 可运行分支验证文件限额、取消/超时、重复材料与材料内恶意指令只作内容；不连接真实用户、数据库、provider或Trip writer。保留实际资源/耗时、命令与失败，不编造中文效果。
- [ ] 结论为有据ADOPT或REJECT：可运行分支按事前冻结样本/真值/判据判断；不可运行分支仅在固定组件/版本的具体许可或兼容阻断证据充分且已评估替代路线后作REJECT，明确转换/性能UNRUN。仅未安装/缺环境或证据不足时保持OPEN/UNRUN。
- [ ] 有采用价值时提供到现有材料候选合同的差异和后续#201/#236集成清单；否决不阻塞这些父票采用其他合格实现，不宣称材料已审核或全部格式/真实产品通过。

## VPJ-74

[VPJ-74 #358](https://github.com/JTCAO515/VP-V4/issues/358) — 运营可追溯查看来源版本、原文与知识本体关系

- Owner: coding-agent; vertical; 3专注日，估算专注日仅供排程；逐PR交付有界结果，整票以实际Staging生产者/消费者及故障验证为准
- 验收阶段: S2
- Blocked by: 无任务依赖；核实际条件
- Allowed: `apps/ops/**`, `lib/server/knowledge/**`, `supabase/migrations/**`, `tests/**/knowledge/**`, `tests/**/ops/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm lint`; `pnpm typecheck`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`
- Evidence: `artifacts/VPJ-74/verification.md`, `artifacts/VPJ-74/unrun.md`, `artifacts/VPJ-74/commands.jsonl`, `artifacts/VPJ-74/results.json`
- 接口: docs/knowledge-upgrade/README.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 本规划已合并；核对当前Task执行行、已有Ops/发布/Ask真实接口。上游父票OPEN不单独阻止可独立准备，但未具备实际输入不能伪造整票验收。 实际DB/worker/provider/UI验收使用指定获准环境，必要版本化告知和明确用户同意匹配外发数据；本票不新增生产发布或资金授权。
- 文档影响: `docs/knowledge-upgrade/README.md`, `docs/handoff.json`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 关闭本票新增worker/reader能力并恢复兼容的既有直接读取；新投影可重建，数据采用兼容前向迁移，不改已应用迁移、不复活撤回内容。保留操作/预算/审计回执。

- [ ] 以一个已发布支付/铁路/SIM声明为纵切：普通获准Ops从声明读到稳定对象/关系、source revision与原文locator；新旧版本可并列核查，未授权actor无法读取私有候选。
- [ ] 将现有subjectId/predicate/objectId/条件和例外映射到版本化类型/关系domain-range与zh/en别名；复用ID，无破坏性重命名；未注册关系只产生候选且不能执行。
- [ ] 建立或兼容映射SourceRevision/EvidenceSpan的hash、获取时间、生效时间或unknown和原位置；旧记录缺血缘如实标legacy，重放同源幂等且不伪造时间/reviewer。
- [ ] 实际Staging API/Ops读回通过；有界解析保留定位和错误，覆盖URL/重定向/内网请求限制、输入限额和资料注入，抓取与解析错误不变成政策变化。
- [ ] 受影响数据库追加迁移、隔离恢复及权限/撤回反例验证通过，记录同一版本环境；原发布流程、旧客户端、publications和Trip无非预期改变。
- [ ] 提供给VPJ-75/76/#211可消费的版本化契约与真实样本；文档/schema或fixture单独通过不能关闭本票。

## VPJ-75

[VPJ-75 #359](https://github.com/JTCAO515/VP-V4/issues/359) — 新来源经LLM Wiki整理为可审查并可发布的知识变更

- Owner: coding-agent; vertical; 5专注日，估算专注日仅供排程；逐PR交付有界结果，整票以实际Staging生产者/消费者及故障验证为准
- 验收阶段: S2
- Blocked by: [VPJ-74 #358](https://github.com/JTCAO515/VP-V4/issues/358)
- Allowed: `apps/ops/**`, `lib/server/knowledge/**`, `lib/server/jobs/**`, `lib/server/model-gateway/**`, `supabase/migrations/**`, `tests/**/knowledge/**`, `tests/**/ops/**`, `evals/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm lint`; `pnpm typecheck`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`
- Evidence: `artifacts/VPJ-75/verification.md`, `artifacts/VPJ-75/unrun.md`, `artifacts/VPJ-75/commands.jsonl`, `artifacts/VPJ-75/results.json`
- 接口: docs/knowledge-upgrade/README.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 本规划已合并；核对当前Task执行行、已有Ops/发布/Ask真实接口。上游父票OPEN不单独阻止可独立准备，但未具备实际输入不能伪造整票验收。 实际DB/worker/provider/UI验收使用指定获准环境，必要版本化告知和明确用户同意匹配外发数据；本票不新增生产发布或资金授权。
- 文档影响: `docs/knowledge-upgrade/README.md`, `docs/handoff.json`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 关闭本票新增worker/reader能力并恢复兼容的既有直接读取；新投影可重建，数据采用兼容前向迁移，不改已应用迁移、不复活撤回内容。保留操作/预算/审计回执。

- [ ] 一份获准来源通过实际有界LLM worker生成source/procedure/topic Wiki草稿与statement变更，运营查看差异后经现有异人审查和发布，普通允许reader读到正确版本。
- [ ] 每条关键声明链接原source revision/span；生成摘要、关系与缺口标draft，模型不能创建来源、reviewer、TTL或发布资格，不把旧模型输出当外部证据。
- [ ] 页面版本记录source依赖、statement引用、job/prompt/config/input digest和变更理由；重复输入不重复建页或发布，expectedVersion冲突拒绝覆盖，并发/跨页变更不暴露半更新。
- [ ] 实际worker超时/取消/进程重启可恢复或明确终态；重试幂等，provider调用有配置、费用/unknown和预算回执；拒权或来源撤回后不继续外发/发布。
- [ ] 固定中英材料覆盖相互矛盾、条件/例外、跨城市差异及注入；新增证据只增加或挑战候选，旧发布事实只有按原流程变更；正文与审查UI能定位原文。
- [ ] 沿既有可靠解析路径；#288 Docling REJECT保留，候选重评须明确新缺口和事前判据。实际Ops/worker/发布/读回链与失败结果留证，不以自动标签或本地fixture结票。

## VPJ-76

[VPJ-76 #360](https://github.com/JTCAO515/VP-V4/issues/360) — Ask检索已发布Wiki与原子声明并返回完整证据和具体缺口

- Owner: coding-agent; vertical; 5专注日，估算专注日仅供排程；逐PR交付有界结果，整票以实际Staging生产者/消费者及故障验证为准
- 验收阶段: S2
- Blocked by: [VPJ-75 #359](https://github.com/JTCAO515/VP-V4/issues/359)
- Allowed: `lib/server/knowledge/**`, `lib/server/turn/**`, `lib/server/model-gateway/**`, `lib/grounded/**`, `components/chat/**`, `ios/**`, `supabase/migrations/**`, `tests/**/knowledge/**`, `evals/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm lint`; `pnpm typecheck`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm evals`
- Evidence: `artifacts/VPJ-76/verification.md`, `artifacts/VPJ-76/unrun.md`, `artifacts/VPJ-76/commands.jsonl`, `artifacts/VPJ-76/results.json`
- 接口: docs/knowledge-upgrade/README.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 本规划已合并；核对当前Task执行行、已有Ops/发布/Ask真实接口。上游父票OPEN不单独阻止可独立准备，但未具备实际输入不能伪造整票验收。 实际DB/worker/provider/UI验收使用指定获准环境，必要版本化告知和明确用户同意匹配外发数据；本票不新增生产发布或资金授权。
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=NO，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/knowledge-upgrade/README.md`, `docs/handoff.json`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 关闭本票新增worker/reader能力并恢复兼容的既有直接读取；新投影可重建，数据采用兼容前向迁移，不改已应用迁移、不复活撤回内容。保留操作/预算/审计回执。

- [ ] 复用#206/#264生产者消费者：自然语言请求按明确对象、别名、required claims和完整短文/关键词检索已发布投影，输出EvidencePack并在原生zh/en与已有Web读到对应答案、限定和来源。
- [ ] 研究索引和产品索引按用途/actor隔离；在召回、模型外发、展示及历史重载前执行当前资格。旧索引命中已撤回/过期/错范围知识也无法被外发或展示为事实。
- [ ] EvidencePack记录required/background/missing/conflicts及statement/publication/source/span和检索/ontology版本；关键遗漏、错误引用和证据充足时全拒答均判失败，不由相关度决定完整性。
- [ ] 分开missing_content/retrieval_miss/user_input_missing/capability_unsupported/policy_denied/provider_failure；retrieval miss先有界直接lookup，真正缺口仅保留脱敏规范化模式，不保留私人原文。
- [ ] 沿用当前只分类输入的数据边界；如外发知识片段/上下文需版本化实际数据流配置与对应告知/同意及旧模式兼容，不静默改变现有policy。
- [ ] 冻结复用加新增的中英问题族与qrels/必要claim真值，调参和保留集按来源版本/问题族隔离；跑实际查询、普通账号owner隔离、撤回和故障，并报告覆盖/过拒答、p50/p95与成本分母。
- [ ] 记录同批结构化/直接读取baseline和本路径实测差异；向量化/重排仍归#248的真实召回和净收益激活门。iOS/Web实际读回、原Trip不变、历史证据和回退通过后才完成本票。

## VPJ-77

[VPJ-77 #558](https://github.com/JTCAO515/VP-V4/issues/558) — 新版助手三段体验样例与组件契约

### 执行边界与首个切片

- 首个可交付结果：先让用户完整走通三段样例和Memory纠正，建立前后端共用的可见状态约定。
- 本票责任/非目标：只负责交互样例和输出呈现契约；运行能力由后续producer/consumer证明。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 3专注日，按一个可审阅切片推进；effortDays仅为旧manifest字段占位，不是整票工期或上线承诺。
- 验收阶段: S1
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: 无
- Allowed: `docs/product/**`, `ios/**`, `tests/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm lint`; `pnpm typecheck`; `pnpm test:contract`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-77/verification.md`, `artifacts/VPJ-77/unrun.md`
- 接口: docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md`, `docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md`, `docs/handoff.json`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 以VP/旅程/资源库/Memory四Tab和全局搜索制作可交互体验样例；首次认识、委托离开、回来交付及Memory纠正四条路径明确标fixture，保留真实组件接线位置。
- [ ] 一个稳定VP身份承接持续对话、实际工作状态与可操作成果；图1关系、图3探索、图2成果分场景使用，三张参考图的旧导航/虚构路线不照搬。
- [ ] 冻结最小Message/Task/Artifact/Memory呈现与点击契约，兼容短答案、比较、草稿、待确认、失败/未知/无更新；不发明真人、记忆、工作和成交。
- [ ] 在目标原生尺寸渲染zh/en、小屏/大字/VoiceOver/Reduce Motion和键盘；记录用户能否找到Memory/任务/成果并纠正的观察，未观察不写accepted。
- [ ] 交付可复用语义token/组件边界和状态映射，允许普通视觉迭代；不把像素审批或全部后台完成作为有界原型前置。

## VPJ-78

[VPJ-78 #559](https://github.com/JTCAO515/VP-V4/issues/559) — 持续会话、旅程目标与ServiceTask归属

### 执行边界与首个切片

- 首个可交付结果：先版本化一次独立消息与后续改口的归属，完成持久接纳和原生读回。
- 本票责任/非目标：唯一负责Conversation/goal与Task的关联；#195/196保留执行和传输基础，#199负责记忆权威。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 3专注日，按一个可审阅切片推进；effortDays仅为旧manifest字段占位，不是整票工期或上线承诺。
- 验收阶段: S2
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191), [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192), [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195), [VPJ-08 #196](https://github.com/JTCAO515/VP-V4/issues/196)
- Allowed: `lib/server/turn/**`, `lib/server/context/**`, `lib/server/identity/**`, `app/api/chat/**`, `supabase/migrations/**`, `ios/**`, `tests/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm lint`; `pnpm typecheck`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`
- Evidence: `artifacts/VPJ-78/verification.md`, `artifacts/VPJ-78/unrun.md`
- 接口: docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md`, `docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md`, `docs/handoff.json`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 新版本Conversation允许多个ServiceTask和普通问答；Journey goal可在日期/Trip未定前存在，仅引用现有Task/Trip，不建第二个队列或Trip内容副本。
- [ ] 服务端校验消息/任务/选中成果/Trip/actor及scope版本；支持follow-up/amendment/独立问题，歧义才澄清，新消息不自动新收费。
- [ ] 旧text/task/grounded模式和ID摘要语义保留；不直接放宽旧四Turn/clarification-repair合同，不重开终态Turn。
- [ ] 多消息接纳、并发次序、幂等冲突、换账号/顶替、撤权、删除、导出与迟到响应均有生产者消费者反例；新存储append-only及兼容回退。
- [ ] 上下文装配携带当前目标、允许的Trip/Memory/证据和未决项，记录来源版本；合成和真实模型消费分栏，不把完整记忆管理列表外发。
- [ ] 实际API/持久化/事件与原生消费者完成一条无Trip问答到持续目标的链；服务器重启后归属不丢，UI可继续输入。

## VPJ-79

[VPJ-79 #560](https://github.com/JTCAO515/VP-V4/issues/560) — 持久版本化成果与跨页面同源读取

### 执行边界与首个切片

- 首个可交付结果：先保存一份比较成果并在VP和Library同源读回，再扩充其他结果类型。
- 本票责任/非目标：本票拥有结果生命周期；#197/198生产旅行建议/提案，VPJ-81/82/83负责入口呈现。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 3专注日，按一个可审阅切片推进；effortDays仅为旧manifest字段占位，不是整票工期或上线承诺。
- 验收阶段: S3
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-78 #559](https://github.com/JTCAO515/VP-V4/issues/559), [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192)
- Allowed: `lib/server/turn/**`, `lib/server/trip/**`, `lib/server/identity/**`, `lib/server/artifacts/**`, `app/api/**`, `supabase/migrations/**`, `ios/**`, `components/**`, `tests/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm lint`; `pnpm typecheck`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`
- Evidence: `artifacts/VPJ-79/verification.md`, `artifacts/VPJ-79/unrun.md`
- 接口: docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md`, `docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md`, `docs/handoff.json`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 定义comparison/journey-draft/decision/change-proposal-reference/practical结果的闭合版本schema；owner、来源task/goal/Trip和input/Memory/evidence basis均明确。
- [ ] 成果写入和可发布事件原子或可恢复一致，immutable revision/CAS/currentness可验证；实际结果回执前不显示完成。
- [ ] VP、Journeys、Library及受支持Web读取同一artifact ID/revision；变更proposal只引用既有ID/revision，不能复制确认payload或写Trip。
- [ ] 用户手改、输入/偏好更新、来源撤回和Trip新base使相关结果准确失效；历史可读资格独立核验，旧版本不能继续执行确认。
- [ ] RLS/其他actor/换账号/删除/索引/导出/旧schema消费者与回退验证；不把UserArtifact原材料复制为无来源的生成结果。
- [ ] 原生真实渲染至少一类方向比较及同源重载；安全降级未知schema，不渲染任意模型HTML或动作URL。

## VPJ-80

[VPJ-80 #561](https://github.com/JTCAO515/VP-V4/issues/561) — 可恢复的有界规划执行与真实后台交付

### 执行边界与首个切片

- 首个可交付结果：先执行一项住宿区域比较委托，真实工具/provider、关App与worker重启后交付持久成果。
- 本票责任/非目标：复用#195的worker和#194预算；#221拥有实际通知投递，#219拥有完整旅行可行性；无通用浏览器/任意代码平台。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 3专注日，按一个可审阅切片推进；effortDays仅为旧manifest字段占位，不是整票工期或上线承诺。
- 验收阶段: S3
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-78 #559](https://github.com/JTCAO515/VP-V4/issues/559), [VPJ-79 #560](https://github.com/JTCAO515/VP-V4/issues/560), [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199), [VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206), [VPJ-59 #194](https://github.com/JTCAO515/VP-V4/issues/194)
- Allowed: `lib/server/turn/**`, `lib/server/tools/**`, `lib/server/context/**`, `lib/server/constraints/**`, `lib/server/model-gateway/**`, `scripts/jobs/**`, `supabase/migrations/**`, `tests/**`, `evals/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm lint`; `pnpm typecheck`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`
- Evidence: `artifacts/VPJ-80/verification.md`, `artifacts/VPJ-80/unrun.md`
- 接口: docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md`, `docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md`, `docs/handoff.json`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 在现有持久work/lease/attempt预算上增加有界规划模式：装配当前basis、选择允许步骤、工具执行、checkpoint、结果核验、交付或等待；不建通用第二Coordinator。
- [ ] 分别限制steps/retries/time/concurrency/累计成本，等待用户/确认时释放worker；继续任务保留原目标和已花成本，取消/撤权停止新的effect。
- [ ] 最小工具集合含合格知识/地点路线读、约束校验、成果准备；proposal生产只走typed adapter，持久action claim/回执替换进程Map假幂等，confirm/预订/支付仍不提供给模型。
- [ ] 实际provider/tool多步骤链在App关闭及worker重启后得到同一逻辑成果；每次可能重复计费的attempt真实记录，unknown先核验不盲重试。
- [ ] 任务运行时改口/Memory纠正/Trip版本变化重验basis，仅重算受影响部分；旧worker不得发布可行动的新结果，及时保存有用partial。
- [ ] 后台托管、scheduler与tool接线在指定环境实测；源码、空轮询、已完成文本纵切不算本票完成；前台任务状态和成果由同一持久事件读回。

## VPJ-81

[VPJ-81 #562](https://github.com/JTCAO515/VP-V4/issues/562) — VP持续主对话、任务可见性与成果交付

### 执行边界与首个切片

- 首个可交付结果：先接真实Conversation和一项独立后台任务，保持composer可用并打开同源成果。
- 本票责任/非目标：本票仅主会话及其交互状态；VPJ-83集成全壳，VM/数据库/任务writer不在客户端重做。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 3专注日，按一个可审阅切片推进；effortDays仅为旧manifest字段占位，不是整票工期或上线承诺。
- 验收阶段: S3
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-77 #558](https://github.com/JTCAO515/VP-V4/issues/558), [VPJ-78 #559](https://github.com/JTCAO515/VP-V4/issues/559), [VPJ-79 #560](https://github.com/JTCAO515/VP-V4/issues/560), [VPJ-80 #561](https://github.com/JTCAO515/VP-V4/issues/561), [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199)
- Allowed: `ios/**`, `lib/i18n.ts`, `tests/**`, `docs/product/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm lint`; `pnpm typecheck`; `pnpm test:contract`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-81/verification.md`, `artifacts/VPJ-81/unrun.md`
- 接口: docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md`, `docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md`, `docs/handoff.json`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 原生VP区分首次、探索中、任务中、有结果、无新进展；主对话保持同一身份与恰当记忆提示，不复制多个不相干聊天工作区。
- [ ] 会话输入、任务列表与成果浏览独立状态；支持连续补充/独立问题/取消，慢任务不锁composer，事件不抢滚动/焦点。
- [ ] 展示真实接纳/进度/待输入/待确认/完成/失败/取消，后台结果进来引用同一artifact；不显示无依据Online、假百分比或虚构成功。
- [ ] 在对话自然纠正偏好/本次覆盖/明确长期保存，沿#199保存回执和版本undo；相关成果提供真实使用解释。
- [ ] 新旧会话选择、消息归属、选中成果引用、session replacement/offline/relaunch均有原生行为证据；zh/en/大字/VoiceOver/Reduce Motion可用。
- [ ] 用真实环境跑第一次方向→委托离开→回来成果→改口，不把fixture截图当拟人/执行能力通过。

## VPJ-82

[VPJ-82 #563](https://github.com/JTCAO515/VP-V4/issues/563) — Library工具资料与全局搜索探索

### 执行边界与首个切片

- 首个可交付结果：先在Library聚合一类既有工具和同源成果，并支持查找自己的一份材料。
- 本票责任/非目标：负责资源聚合与搜索入口；工具自身、内容资格、导入、外部服务和实际成交各归已有owner。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 3专注日，按一个可审阅切片推进；effortDays仅为旧manifest字段占位，不是整票工期或上线承诺。
- 验收阶段: S4
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-79 #560](https://github.com/JTCAO515/VP-V4/issues/560), [VPJ-20 #210](https://github.com/JTCAO515/VP-V4/issues/210), [VPJ-24 #214](https://github.com/JTCAO515/VP-V4/issues/214), [VPJ-26 #216](https://github.com/JTCAO515/VP-V4/issues/216)
- Allowed: `ios/**`, `lib/server/**`, `app/api/**`, `components/**`, `tests/**`, `supabase/migrations/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm lint`; `pnpm typecheck`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-82/verification.md`, `artifacts/VPJ-82/unrun.md`
- 接口: docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md`, `docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md`, `docs/handoff.json`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] Library清楚区分Tools与My materials/results，聚合既有翻译/地址/上传订单/生成成果来源；不复制域内writer，eSIM仅在实际可用能力下开放。
- [ ] 全局搜索按外部已支持内容和私有资料/成果分组；search/open再次校验actor与当前资格，索引不成为隐私/撤回绕过。
- [ ] 空搜索页可提供有版权、与地点对应的视觉发现，既有Save/Ask/Add带实体/选区/来源交接同一VP；不是新增独立动态流。
- [ ] 跨Trip资料明确范围，成果从Library打开同一revision；纠正/删除/账号切换失效缓存和索引，不泄露标题、数量或摘要。
- [ ] 全局入口及旧Explore/Tools/Profile深链在zh/en和无障碍可达，缺能力时有真实状态和可用替代；搜索性能/质量以实测记录。

## VPJ-83

[VPJ-83 #564](https://github.com/JTCAO515/VP-V4/issues/564) — 四Tab原生助手壳与Journey全链整合

### 执行边界与首个切片

- 首个可交付结果：整合四Tab及旧入口映射，先打通VP→Memory纠正→结果变化→Journeys确认→Library读回。
- 本票责任/非目标：新导航/聚合owner；已关闭#188保留旧壳完成范围，最终用户/设备/发布验收仍由#233/#242承担。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

- Owner: coding-agent; vertical; 3专注日，按一个可审阅切片推进；effortDays仅为旧manifest字段占位，不是整票工期或上线承诺。
- 验收阶段: S4
- Blocked by: 无任务依赖；核实际条件
- 集成/最终验收依赖（普通关联）: [VPJ-77 #558](https://github.com/JTCAO515/VP-V4/issues/558), [VPJ-81 #562](https://github.com/JTCAO515/VP-V4/issues/562), [VPJ-82 #563](https://github.com/JTCAO515/VP-V4/issues/563), [VPJ-09 #197](https://github.com/JTCAO515/VP-V4/issues/197), [VPJ-10 #198](https://github.com/JTCAO515/VP-V4/issues/198), [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199), [VPJ-13 #203](https://github.com/JTCAO515/VP-V4/issues/203)
- Allowed: `ios/**`, `lib/i18n.ts`, `tests/**`, `docs/product/**`
- Checks: `pnpm docs:check`; `git diff --check`; `pnpm lint`; `pnpm typecheck`; `pnpm test:contract`; `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj`; `xcrun simctl list devices available`; `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- Evidence: `artifacts/VPJ-83/verification.md`, `artifacts/VPJ-83/unrun.md`
- 接口: docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md; Red lines: RL-01, RL-02, RL-04, RL-06, RL-07
- 运行门: 默认（见文件开头「默认条款」）
- Native: 工程/scheme由VPJ-01引入；运行xcrun simctl列出可用设备后，用实际UDID执行xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=<该UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-，commands.jsonl必须记录替换后的完整可运行命令。设备动作/录屏/VoiceOver证据另附；Xcode或工程缺失标UNRUN，不声称成功。
- 文档影响: `docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md`, `docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md`, `docs/handoff.json`
- 不得触碰: 默认（见文件开头「默认条款」）
- Rollback: 默认（见文件开头「默认条款」）

- [ ] 以VP/Journeys/Library/Memory替换旧五Tab，默认VP；Search全局可达，无活动Tab；account/privacy/purchase/logout、Today、工具和旧deep links无丢失。
- [ ] Memory在一级tab、VP上下文、成功保存undo与成果使用解释四处可感知，纠正能通过真实服务改变结果；不是仅增加设置入口。
- [ ] Journeys可呈现未有准确日期/Trip的目标与已有Trip，清楚显示下一决定、关联任务/成果；goal与Trip不混作两个可编辑事实源。
- [ ] 全壳只聚合已有domain消费者，不复制API/模型/业务状态；后台任务不阻塞tab切换，切账号清理所有投影并拒绝迟到响应。
- [ ] 新壳分阶段能力开关与旧入口fallback经过验证；回退仍可读/取消新任务及保留成果，不产生已接受工作孤儿。
- [ ] 真实原生三段体验及E1–E10适用项、zh/en/小屏大字/VoiceOver/Reduce Motion完成；与#233/#242共享同版本证据，不自动关闭其他父票。

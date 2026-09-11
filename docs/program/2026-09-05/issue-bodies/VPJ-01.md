## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

原生 iOS 五入口、中英文与可访问的首个 Trip 页面。

## 当前基线与开发入口

原VPJ基线已合并；2026-09-10品牌增量以Q1-Q38报告的已确认方向为准，当前任务及新增规划契约需按合入main后的版本执行。已有可独立进行的准备范围继续；未决收费、数据许可和激活制不视为已批准，完整验收仍保留真实依赖。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-01)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)。
验收阶段：[S1](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s1)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

无其他任务依赖；仍需核对当前接口、环境与外部条件。

## Acceptance criteria

- [ ] 审计并移植本地 IOS-01 壳的允许行为到 main，保留原始未跟踪文件；原生 SwiftUI，默认 Ask，Trip/Explore/Ask/Tools/Profile。
- [ ] 一个真实屏幕在 zh/en、Dynamic Type、VoiceOver、Reduce Motion 下可用；最低 iOS17，上传工具链满足当前 Apple 要求。
- [ ] 语言发布名单变为 zh/en，es/ru/ar 不向新用户承诺；现有 legacy locale payload兼容策略和五语回归迁移可审查。
- [ ] 首个Ask/Trip屏幕冻结语义token/字体/通用状态与sheet手势，不把所有视觉设计留到整链QA。
- [ ] 保留已接受Logo与成熟清爽视觉，状态文字遵守VP响应规范、英文优先且中英事实一致；本票验收原生基础屏幕、最低系统/可访问性和通用呈现，不将预览文案优化当真实AI能力。
- [ ] 本票不等待已登录真实Trip的选区Ask、Proposal确认和持久重载；这些消费者在#198实现、#233整链UX和#242真机贯通验收。原iOS17、VoiceOver、Dynamic Type、Reduce Motion及基础交互门仍须实证，不因职责澄清自动关闭。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：#135

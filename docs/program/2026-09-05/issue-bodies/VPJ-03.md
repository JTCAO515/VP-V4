## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

用户对话、材料、模型地区与人工访问的数据政策。

## 当前基线与开发入口

原VPJ基线已合并；2026-09-10品牌增量以Q1-Q38报告的已确认方向为准，当前任务及新增规划契约需按合入main后的版本执行。已有可独立进行的准备范围继续；开发接入与可逆参数由agent按现有方向推进，无需第三方、法务或产品许可；真实收费与发布按相应范围验收。 开发阶段不等待供应商工单/书面答复、法务或产品许可；按开发接入规则用现有账号/API推进，未知项记录，保留用户同意和实际技术验证。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-03)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)。
验收阶段：[S1](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s1)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

无其他任务依赖；仍需核对当前接口、环境与外部条件。

## Acceptance criteria

- [ ] 清楚给出中英告知、目的、保留期限、处理地域、第三方AI接收方、撤回、删除/备份和客服访问矩阵。
- [ ] 沿用已提供的经营主体与留存决定；agent依据公开文档、控制台及实际配置记录接收方，未知项如实标注，不等待供应商、法务或产品许可；Owner角色不自动授予跨用户普通读取。
- [ ] 列出设备端/服务端材料两路径和不授权时可用功能；不要求用户提交密码、验证码、卡号。
- [ ] Q36基础明确偏好的account/Trip/仅本次范围、来源、纠正版本、模型与人工接收方、撤回后队列/缓存/派生物处理进入数据政策；Free/Pass均不替代用户许可。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：#164

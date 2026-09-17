## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

用户对话、材料、模型地区与人工访问的数据政策。

## 执行边界与首个切片

- 首个可交付结果：核对一个当前启用的文本数据流，给出与实际policy/接收方一致的中英告知、撤回及保留说明，并保留未知项。
- 本票责任/非目标：负责数据政策与告知；执行删除归36/58，真实provider协议归06。复用已修正的披露矩阵，不重新声称零外发。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/policy/vpj-03-data-disclosure.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/policy/vpj-03-data-disclosure.md) · [artifacts/VPJ-03/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-03/verification.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-03) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S1](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s1)。

## 验收依赖（不自动转为 blocked）

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

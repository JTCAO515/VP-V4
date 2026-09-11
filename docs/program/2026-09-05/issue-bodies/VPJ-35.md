## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

Free/Pass 额度与完整任务成本控制。

## 当前基线与开发入口

原VPJ基线已合并；2026-09-10品牌增量以Q1-Q38报告的已确认方向为准，当前任务及新增规划契约需按合入main后的版本执行。已有可独立进行的准备范围继续；未决收费、数据许可和激活制不视为已批准，完整验收仍保留真实依赖。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-35)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)。
验收阶段：[S5](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s5)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

- [VPJ-06 #193](https://github.com/JTCAO515/VP-V4/issues/193)
- [VPJ-08 #196](https://github.com/JTCAO515/VP-V4/issues/196)
- [VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226)

## Acceptance criteria

- [ ] 按Q37服务任务口径，由产品负责人在实际启用前冻结Free/Pass周期与滚动窗口容量，配置化验证且客户端显示正确下次可用时刻；旧6/30/300/60 Ask数字仅作历史占位，不换名沿用或构造旧收费路径。
- [ ] ServiceTask是一项明确目标及必要澄清、系统修复，关联多个Turn/attempt；并发预留、按获准成果标准结算和失败返还可审，未决partial/改稿/TTL/跨期消费不启用。
- [ ] 安全/记忆纠错/导出删除/手动编辑/缓存播放不付费；强模型预算不能悄悄降低安全质量。
- [ ] 每笔交易独立720h grant，绑定已批准的计量策略版本和容量；提前购排队、到自己的startsAt才发额度，到期余量不结转；退款仅撤本段、其他段时间不移，恢复无新额度，账号滚动窗口不因购买/恢复而重置；乱序交易按可信购买时间对账。容量与窗口数值须按Q37新口径决定，历史300Ask/60Ask只作兼容研究记录，不是新服务任务的实施门。媒体≤60秒录音/次、默认讲解≤2分钟、图≤10MB、PDF≤10页/20MB的既有试点上限保留并核成本。
- [ ] 按ServiceTask计用户服务容量，必要澄清/系统修复沿原任务；内部attempt成本独立累计。新计量先记录模式，未决partial/改稿/TTL/跨期及容量保持禁止启用，不构造双重扣次路径。
- [ ] 验证最后一份容量竞争、相同key不同参数、两设备/多worker、取消与完成竞态、晚到usage和跨窗口；实际结果/结算幂等，失败或未知状态不被当零成本。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

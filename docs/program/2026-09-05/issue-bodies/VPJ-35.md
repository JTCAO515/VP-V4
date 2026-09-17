## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

Free/Pass 额度与完整任务成本控制。

## 执行边界与首个切片

- 首个可交付结果：复用34的grant和59的内部费用账本，实现一个ServiceTask容量预留/结算/失败恢复及并发最后一份额度。
- 本票责任/非目标：负责用户任务额度；不复制34交易账本或59供应商attempt计费；必要澄清和修复不新扣用户次数。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-35) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S5](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s5)。

## 验收依赖（不自动转为 blocked）

- [VPJ-06 #193](https://github.com/JTCAO515/VP-V4/issues/193)
- [VPJ-08 #196](https://github.com/JTCAO515/VP-V4/issues/196)
- [VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226)

## Acceptance criteria

- [ ] 按Q37服务任务口径，由agent在开发启用前冻结Free/Pass周期与滚动窗口的开发容量，真实收费前再确认，配置化验证且客户端显示正确下次可用时刻；旧6/30/300/60 Ask数字仅作历史占位，不换名沿用或构造旧收费路径。
- [ ] ServiceTask是一项明确目标及必要澄清、系统修复，关联多个Turn/attempt；并发预留、按获准成果标准结算和失败返还可审，未决partial/改稿/TTL/跨期消费不启用。 新计量先记录模式，内部attempt成本独立累计，不构造双重扣次路径。
- [ ] 安全/记忆纠错/导出删除/手动编辑/缓存播放不付费；强模型预算不能悄悄降低安全质量。
- [ ] 消费VPJ-34的有效grant与VPJ-33政策版本，验证未到startsAt不发容量、到期余量不结转、退款/恢复不补发或重置账号窗口；媒体上限按33的版本化值核成本。不重新实现购买、排队和退款交易账本。
- [ ] 验证最后一份容量竞争、相同key不同参数、两设备/多worker、取消与完成竞态、晚到usage和跨窗口；实际结果/结算幂等，失败或未知状态不被当零成本。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

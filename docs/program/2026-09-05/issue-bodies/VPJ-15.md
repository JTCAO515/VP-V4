## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

首批旅程内容从来源登记到已审核可用。

## 执行边界与首个切片

- 首个可交付结果：从已有已审中英声明和发布记录中选一个缺覆盖场景，补真实来源→异人审核→发布/撤回→产品读回。
- 本票责任/非目标：负责首批内容与资格；75/76正在开发的Wiki和检索只复用接口，不改它们的任务或另造知识系统。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [artifacts/VPJ-15/staging-20260912/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-15/staging-20260912/verification.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-15) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S2](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s2)。

## 验收依赖（不自动转为 blocked）

- [VPJ-14 #204](https://github.com/JTCAO515/VP-V4/issues/204)

## Acceptance criteria

- [ ] 为Supported Journey Matrix选10–20条原子事实/流程，登记许可、locator、适用范围、版本与审者。
- [ ] 中英表达共享语言中立assertion；candidate/reviewed/published/eligible不可混同。
- [ ] 运营能提交/审查/撤销并在产品读到结果；没有内容授权则阻塞发布，不批量造810条。
- [ ] 首批内容按普通来华游客的城市/场景/必要claim/权利/时效/可用动作组织覆盖；优先支撑规划与变化后的下一步，未定城市名单不得写成已覆盖全国。
- [ ] HF复用：测试集与生产知识分别登记；外部数据记录发布者、准确repo/revision/原行ID、逐源许可及变更，公开/NC/混合来源不自动发布为旅游Fact；优先自有合成评测与已许可审核语料。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：#168

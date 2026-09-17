## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

地点讲解与语音追问接回当前 Trip。

## 执行边界与首个切片

- 首个可交付结果：选一个已覆盖地点，将有来源短讲解、字幕播放进度与一条追问接回当前Trip。
- 本票责任/非目标：负责Guide内容消费与续播；15维护知识，27提供音频，29处理临时变化，不把传说或旧缓存作新事实。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-28) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S4](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s4)。

## 验收依赖（不自动转为 blocked）

- [VPJ-15 #205](https://github.com/JTCAO515/VP-V4/issues/205)
- [VPJ-19 #209](https://github.com/JTCAO515/VP-V4/issues/209)
- [VPJ-27 #217](https://github.com/JTCAO515/VP-V4/issues/217)

## Acceptance criteria

- [ ] 首批已覆盖地点提供短讲解、来源、事实/传说区别、字幕和暂停续播。
- [ ] 追问使用当前地点/兴趣/已听进度，角色仍VP；未覆盖地点给清楚边界与其他探索入口。
- [ ] 已缓存内容重播不再扣Ask，新增生成按明确额度；现场注意力优先。
- [ ] 讲解按已获准兴趣给简明、有来源、适用的内容；英文为原生表达，中文保持事实/否定一致，幽默可为零；与VPJ-29局部恢复保持职责区分。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

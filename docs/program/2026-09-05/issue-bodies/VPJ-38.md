## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

数据库、对象与删除状态的恢复演练。

## 执行边界与首个切片

- 首个可交付结果：K1：在隔离目标恢复数据库和必要对象，重放删除/撤权后才允许测试用户读取。
- 本票责任/非目标：负责灾备恢复机制；36提供删除状态，58验全模块退出，已做的74隔离演练不等于全部Storage/生产恢复。 2026-09-22已确认的实施顺序：K1 → K2；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-38) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S5](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s5)。

## 开工依赖（GitHub 原生关系）

- [VPJ-02 #189](https://github.com/JTCAO515/VP-V4/issues/189)

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-36 #228](https://github.com/JTCAO515/VP-V4/issues/228)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] 在隔离恢复目标实测DB与Storage备份、RPO/RTO、恢复数据一致性。
- [ ] 恢复后重新应用删除tombstone与权益/许可撤销，避免已删数据复活。
- [ ] 故障演练记录实际时间/未验项，不在Production做破坏操作。
- [ ] 按数据类确定backup或no-backup TTL；对象元数据/文件、RLS/grants/functions/queue恢复分别验。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：#53

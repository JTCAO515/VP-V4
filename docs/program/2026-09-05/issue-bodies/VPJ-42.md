## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

TestFlight 实机贯通 Plan、Ready、Travel 三段。

## 当前基线与开发入口

历史规划基线：#253。当前执行读取 main 的合同，并核对实时依赖、可用接口和获准环境；本计划定义不代表任务已就绪或已验收。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-42)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)。
验收阶段：[S5](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s5)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

- [VPJ-08 #196](https://github.com/JTCAO515/VP-V4/issues/196)
- [VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206)
- [VPJ-21 #211](https://github.com/JTCAO515/VP-V4/issues/211)
- [VPJ-24 #214](https://github.com/JTCAO515/VP-V4/issues/214)
- [VPJ-28 #218](https://github.com/JTCAO515/VP-V4/issues/218)
- [VPJ-29 #220](https://github.com/JTCAO515/VP-V4/issues/220)
- [VPJ-32 #224](https://github.com/JTCAO515/VP-V4/issues/224)
- [VPJ-35 #227](https://github.com/JTCAO515/VP-V4/issues/227)
- [VPJ-36 #228](https://github.com/JTCAO515/VP-V4/issues/228)
- [VPJ-37 #229](https://github.com/JTCAO515/VP-V4/issues/229)
- [VPJ-38 #230](https://github.com/JTCAO515/VP-V4/issues/230)
- [VPJ-39 #232](https://github.com/JTCAO515/VP-V4/issues/232)
- [VPJ-40 #233](https://github.com/JTCAO515/VP-V4/issues/233)
- [VPJ-41 #234](https://github.com/JTCAO515/VP-V4/issues/234)
- [VPJ-48 #235](https://github.com/JTCAO515/VP-V4/issues/235)
- [VPJ-55 #236](https://github.com/JTCAO515/VP-V4/issues/236)
- [VPJ-56 #237](https://github.com/JTCAO515/VP-V4/issues/237)
- [VPJ-58 #239](https://github.com/JTCAO515/VP-V4/issues/239)
- [VPJ-61 #240](https://github.com/JTCAO515/VP-V4/issues/240)
- [VPJ-64 #238](https://github.com/JTCAO515/VP-V4/issues/238)
- [VPJ-65 #219](https://github.com/JTCAO515/VP-V4/issues/219)
- [VPJ-49 #241](https://github.com/JTCAO515/VP-V4/issues/241)

## Acceptance criteria

- [ ] 邀请受控用户在原生build完成一个真实Trip的Plan/Ready/Travel，含外跳、离线、恢复、拒绝/取消。
- [ ] 真实owner/RLS/provider/数据/网络/权限证明与TestFlight build关联；sandbox购买不算收入。
- [ ] 所有首发必需项有功能/异常/数据/UX/运行证据；只修验收缺陷，不靠fixture替代。
- [ ] 非技术经营留存与真实付费效果由47观察，不因旅行节点未到而伪称成功/失败。
- [ ] 真实设备与账号贯通#198选区Ask、明确确认、跨端/重载及拒绝路径；基础壳、模拟数据或仅#188完成不能替代本项联合验收。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：#162

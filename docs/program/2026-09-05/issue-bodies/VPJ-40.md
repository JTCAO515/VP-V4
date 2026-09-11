## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

原生视觉动效、无障碍与性能整链复验。

## 当前基线与开发入口

历史规划基线：#253。当前执行读取 main 的合同，并核对实时依赖、可用接口和获准环境；本计划定义不代表任务已就绪或已验收。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-40)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)。
验收阶段：[S5](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s5)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

- [VPJ-13 #203](https://github.com/JTCAO515/VP-V4/issues/203)
- [VPJ-20 #210](https://github.com/JTCAO515/VP-V4/issues/210)
- [VPJ-21 #211](https://github.com/JTCAO515/VP-V4/issues/211)
- [VPJ-23 #213](https://github.com/JTCAO515/VP-V4/issues/213)
- [VPJ-25 #215](https://github.com/JTCAO515/VP-V4/issues/215)
- [VPJ-27 #217](https://github.com/JTCAO515/VP-V4/issues/217)
- [VPJ-28 #218](https://github.com/JTCAO515/VP-V4/issues/218)
- [VPJ-29 #220](https://github.com/JTCAO515/VP-V4/issues/220)
- [VPJ-30 #221](https://github.com/JTCAO515/VP-V4/issues/221)
- [VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226)
- [VPJ-48 #235](https://github.com/JTCAO515/VP-V4/issues/235)
- [VPJ-64 #238](https://github.com/JTCAO515/VP-V4/issues/238)
- [VPJ-49 #241](https://github.com/JTCAO515/VP-V4/issues/241)
- [VPJ-55 #236](https://github.com/JTCAO515/VP-V4/issues/236)
- [VPJ-61 #240](https://github.com/JTCAO515/VP-V4/issues/240)
- [VPJ-36 #228](https://github.com/JTCAO515/VP-V4/issues/228)

## Acceptance criteria

- [ ] 统一Cream/Ink/Plum/Gold与原始VP资产；对话/计划/sheet/键盘/返回锚点同一状态语义。
- [ ] 真机/Simulator完成小屏大屏、大字VoiceOver、Reduce Motion/Transparency、来电低电量弱网；录屏展示可中断动效。
- [ ] 结构卡原子出现、滚动不抢位、已保存动画只在回执后；用profile定位性能不写未测FPS。
- [ ] 在#198真实选区Ask消费者上复验sheet、焦点、返回锚点、大字与VoiceOver及拒绝/关闭状态；不能仅引用#188基础屏幕证据完成整链验收。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

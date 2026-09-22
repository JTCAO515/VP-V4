## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

首访与回访的三种入口获得首个成果。

## 执行边界与首个切片

- 首个可交付结果：E1：新用户一句无日期想法先得到可保存的方向或片段，再按需要补一个可跳过的问题。
- 本票责任/非目标：负责入口衔接/首值；不重建09规划、11记忆、12材料或62招募，三类入口全通才是整票完成。 2026-09-22已确认的实施顺序：E1 → E2 → E3；交接输入不新增原生blocked，完整父票验收保留。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-13) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S4](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s4)。

## 开工依赖（GitHub 原生关系）

- [VPJ-62 #202](https://github.com/JTCAO515/VP-V4/issues/202)

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-09 #197](https://github.com/JTCAO515/VP-V4/issues/197)
- [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199)
- [VPJ-12 #201](https://github.com/JTCAO515/VP-V4/issues/201)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] 新想法、已有材料、已在途均可开始；不强制先创建完整计划或填长表。
- [ ] 回访显示当前Trip/上次决定/下一步，用户可跳过问题；首值来自真实计划对象。
- [ ] 记录first_value与拒绝原因分开；大字/键盘/无权限/配额用尽有路径。
- [ ] 继承同意范围内事件schema；first_value/activated/outcome_declined不混计。
- [ ] 按本轮目标先交可用成果，只有会改变方案的缺失信息才追问；回访使用真实可用偏好与已保存成果，必要澄清沿同一ServiceTask，不机械问卷或反复索取已知信息。
- [ ] 体验增量2026-09-17：以无日期新想法、已有安排导入、在途回访三类任务验收首值；每次必要问题伴随已有成果或具体变化，用户可跳过，已知日期/人数/服务意向不重问。分别记录首次可用成果时间、实际采用/保存、拒绝和技术失败，并以明确分母报告重复提问率，不预设未经测量的收益数字。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

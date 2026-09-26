## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

可见Memory与真实偏好消费、纠正和遗忘。

## 执行边界与首个切片

- 首个可交付结果：打通Memory独立页面→明确保存→真实规划使用→纠正/撤回→相关结果变化的一条链。
- 本票责任/非目标：唯一负责Profile/Memory字段权威、资格投影和纠正；VPJ-83提供一级tab、VPJ-81提供上下文呈现，禁止另建画像库。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-11) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S3](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s3)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)
- [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192)
- [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] 当前Trip事实、working context、显式跨Trip偏好分别管理；推断预算先只用于当前Trip。
- [ ] 纠正/本次不用/忘记后，下一轮上下文和待处理工作不复活旧记录。
- [ ] 同意、来源、scope、版本和memory-use依据可追；Free同样保留当前Trip安全约束和纠错权。
- [ ] Q36明确基础偏好对Free/Pass共同可用并跨Trip；保留Profile/Memory每字段唯一权威，用任务专用资格投影接入真实消费者，不能把管理列表整体注入模型。
- [ ] 通过跨Trip、当前要求覆盖旧默认、纠正/撤回后排队与重试、跨账号迟到响应验证；明确记住且范围许可清楚不重复询问，推断和敏感画像不自动保存，偏好不得改写已确认Trip或替代外部证据。
- [ ] HF复用：借LongMemEval更新/跨会话方法编写自有中英反例，分别观察资格、Context入选、实际使用与撤回；管理API不充当模型检索，Profile/Memory字段保持唯一权威源，不为benchmark新建画像或向量库。
- [ ] 记忆新增/更新实际成功后，顶部轻提示“已加入记忆/Saved to memory”，仅“撤销/Undo”，默认4秒自动隐藏；不抢焦点、不阻断输入。摘要有现成允许内容才附一行，不增加生成步骤；首版不加查看按钮。
- [ ] 撤销必须作用于本次记忆变更及版本，成功显示已撤销，失败/冲突如实提示，不覆盖后续修改或改变Trip；同一逻辑写入重试/重连/重放不重复弹出，撤销自身不再触发加入记忆提示，换账号清理旧操作入口。
- [ ] 助手升级2026-09-27：Memory作为一级Tab，VP相关偏好、真实save/undo和成果使用解释构成四处可见性；无记忆时不伪装熟悉，管理项有来源、scope、修改/暂停/忘记入口。
- [ ] 助手升级2026-09-27：首版真实消费者至少使用已支持的travel pace；再逐字段扩展明确偏好，当前Trip/临时状态/外部事实/任务不得混入长期Memory。
- [ ] 助手升级2026-09-27：在任务排队、运行、重试和成果待确认期间纠正或忘记，新的dispatch与推荐不使用旧值；删除同时覆盖衍生摘要、索引和检查点，Free/付费及到期后保持同等基础记忆控制。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

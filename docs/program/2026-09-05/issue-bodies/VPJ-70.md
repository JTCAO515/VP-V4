## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

Harness：只读模型或提示词候选的配对评测与校准。

## 执行边界与首个切片

- 首个可交付结果：复用已交付72盲评包，在同一真实只读任务上冻结基线与一个候选、阈值/预算，形成可复核配对结论。
- 本票责任/非目标：负责真实任务质量/语气配对与人工校准；06验供应商协议，72离线工具不重做，不自动切生产模型。
- 先读/复用：[docs/harness/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/harness/README.md) · [artifacts/VPJ-70/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-70/verification.md) · [artifacts/VPJ-70/unrun.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-70/unrun.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-70) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/harness/README.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S5](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s5)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-67 #264](https://github.com/JTCAO515/VP-V4/issues/264)
- [VPJ-72 #287](https://github.com/JTCAO515/VP-V4/issues/287)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] 在获准的同一只读任务链上比较现有基线与一个明确候选，输出采纳/拒绝/证据不足及逐例证据；可只改提示词，不要求新增provider或自动生产路由。
- [ ] 固定任务输入、时钟、证据、权限、预算政策、grader与版本，开发集调优、holdout只作冻结后评测；污染案例登记后转开发集并补未用于调优的holdout。
- [ ] 候选运行前由agent固定质量容差、正常可答/必要claim不退化、延迟/单任务/整批技术上限和预声明收益；无需产品签字，资金范围沿用已有授权。结果不足报evidence_insufficient，不作通过。
- [ ] 每个适用只读场景每配置起步重复3次并分中英/风险汇总；样本数、失败、NOT_RUN及unknown成本同时报告，不能用总体均分掩盖切片失败或小样本宣称统计显著。
- [ ] 确定性红线与质量rubric分开；人工校准正反例、记录grader分歧，不由生成模型自评或看结果后改标准。回归中故意退化候选须被拒绝。
- [ ] 交付同一JSON报告/Markdown摘要与可复用配对入口；本票关闭限于只读比较，Trip配对与最终能力判定保留VPJ-71。开发接收方/地区按开发接入规则记录实际配置及用户同意，不等待第三方审批。
- [ ] 在既有配对入口加入任务完成、事实限定、正确偏好使用、下一步、密度、英文自然度及情境语气rubric；人工校准并预冻结阈值，正常可答的过度拒绝判失败，hard fail不被均分抵消。
- [ ] HF复用：消费VPJ-72的离线内容判分与盲评包，保留A/B交换、平局/都失败、评分来源和反馈版本；工具验证或合成标注不冒充真实人工校准。HF Judge/Guidebook只借方法，真实候选沿用已有测试授权、技术预算和事前阈值，不等待产品许可。

## 不得触碰

- 不新建 Program、Coordinator、模型路由、长期记忆、预算账本或 Ops 仪表盘；缺失基础接口归原 VPJ 责任票。
- 保留 actor/RLS、证据资格、用途/接收方许可、准确版本确认和原子 TripPatch；不解除 Trip/proposal 工具注册限制。
- 不读取或持久记录秘密、真实用户原文或完整思维链；不修改原用户工作树、既有65项范围/依赖或已应用迁移。
- 不把 fixture/NOT_RUN/skip 当真实通过，不自动上线候选，不进行未授权的账号、外发、采购、支付或生产操作。

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

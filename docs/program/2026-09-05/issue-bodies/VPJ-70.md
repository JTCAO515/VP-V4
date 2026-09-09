## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

Harness：只读模型或提示词候选的配对评测与校准。

在获准的同一只读任务链上比较现有基线与一个明确候选，输出采纳/拒绝/证据不足及逐例证据；可只改提示词，不要求新增provider或自动生产路由。

## 当前基线与开发入口

原VPJ基线已合并；2026-09-10品牌增量以Q1-Q38报告的已确认方向为准，当前任务及新增规划契约需按合入main后的版本执行。已有可独立进行的准备范围继续；未决收费、数据许可和激活制不视为已批准，完整验收仍保留真实依赖。
主报告：[完整统筹方案](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。
必须阅读：[本任务执行合同](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-70) 与 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/harness/README.md)。

## Blocked by

- [VPJ-67 #264](https://github.com/JTCAO515/VP-V4/issues/264)
- [VPJ-72 #287](https://github.com/JTCAO515/VP-V4/issues/287)

## Scope 与接口

- `evals/harness/**`
- `tests/**/harness/**`
- `docs/benchmarks/**`
- `lib/server/model-gateway/prompt/**`
- `docs/harness/**`
- `artifacts/VPJ-70/**`

只修改本用户故事需要的路径。接口在消费者接入前版本化，不能仅交fixture声称完成。

## Acceptance criteria

- [ ] 在获准的同一只读任务链上比较现有基线与一个明确候选，输出采纳/拒绝/证据不足及逐例证据；可只改提示词，不要求新增provider或自动生产路由。
- [ ] 固定任务输入、时钟、证据、权限、预算政策、grader与版本，开发集调优、holdout只作冻结后评测；污染案例登记后转开发集并补未用于调优的holdout。
- [ ] 先允许baseline_only；候选运行前由产品负责人记录质量容差、正常可答/必要claim不退化、延迟/单任务/整批费用上限和预声明收益。缺数值或预算许可只报evidence_insufficient，不作通过。
- [ ] 每个适用只读场景每配置起步重复3次并分中英/风险汇总；样本数、失败、NOT_RUN及unknown成本同时报告，不能用总体均分掩盖切片失败或小样本宣称统计显著。
- [ ] 确定性红线与质量rubric分开；人工校准正反例、记录grader分歧，不由生成模型自评或看结果后改标准。回归中故意退化候选须被拒绝。
- [ ] 交付同一JSON报告/Markdown摘要与可复用配对入口；本票关闭限于只读比较，Trip配对与最终能力判定保留VPJ-71。新接收方/地区必须先满足原数据政策门。
- [ ] 在既有配对入口加入任务完成、事实限定、正确偏好使用、下一步、密度、英文自然度及情境语气rubric；人工校准并预冻结阈值，正常可答的过度拒绝判失败，hard fail不被均分抵消。
- [ ] HF复用：消费VPJ-72的离线内容判分与盲评包，保留A/B交换、平局/都失败、评分来源和反馈版本；工具验证或合成标注不冒充真实人工校准。HF Judge/Guidebook只借方法，真实候选仍走本票原许可/预算/事前阈值。

## 不得触碰

- 不新建 Program、Coordinator、模型路由、长期记忆、预算账本或 Ops 仪表盘；缺失基础接口归原 VPJ 责任票。
- 保留 actor/RLS、证据资格、用途/接收方许可、准确版本确认和原子 TripPatch；不解除 Trip/proposal 工具注册限制。
- 不读取或持久记录秘密、真实用户原文或完整思维链；不修改原用户工作树、既有65项范围/依赖或已应用迁移。
- 不把 fixture/NOT_RUN/skip 当真实通过，不自动上线候选，不进行未授权的账号、外发、采购、支付或生产操作。

## 验证与证据

- `pnpm docs:check`
- `git diff --check`
- `pnpm test:unit`
- `pnpm test:contract`
- `pnpm evals`



- `artifacts/VPJ-70/verification.md`
- `artifacts/VPJ-70/unrun.md`
- `artifacts/VPJ-70/commands.jsonl`
- `artifacts/VPJ-70/results.json`

真实DB/provider/设备/购买是验收条件时，skip或fixture只算部分完成。

## Owner / 外部条件 / 观察

Owner: coding-agent。类型: vertical。预估专注工作3日，外部等待另计；超5日必须再拆。

- 真实只读、模型和预算依赖由VPJ-67→VPJ-16→VPJ-07继承；允许合成评分器准备先行，真实配对及人工校准缺失不能结票。
- 使用现有获准配置；产品负责人在候选运行前冻结评分容差与费用上限，缺失时仅做无外发的离线准备或已获准基线采集。

观察：有界PR验证；真实环境/人工校准等待另计

## 文档与回滚

- `docs/harness/README.md`
- `docs/handoff.json`
- `docs/contracts/vp-response-policy.md`
- `docs/harness/hf-reuse/README.md`

撤销候选配置，保持基线与原报告；不切换生产配置、不覆盖业务状态。

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

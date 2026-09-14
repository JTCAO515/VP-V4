## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 后续证据触发任务

## 用户结果

有真实召回失败才启用混合 RAG 与重排。

## 当前基线与开发入口

当前执行读取main合同及实时接口；计划定义不是完成证据。 开发阶段不等待供应商工单/书面答复、法务或产品许可；按开发接入规则用现有账号/API推进，未知项记录，保留用户同意和实际技术验证。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-50)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)。
验收阶段：[expand](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#expand)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

- [VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206)
- [VPJ-17 #207](https://github.com/JTCAO515/VP-V4/issues/207)
- [VPJ-76 #360](https://github.com/JTCAO515/VP-V4/issues/360)

## Acceptance criteria

- [ ] 以实际qrels/语料规模触发实验，对同批直接读取baseline比较exact/FTS/trigram/vector/RRF。
- [ ] PGroonga、rerank、Contextual Retrieval逐项消融；权限/时效/例外/反证切片不回退。
- [ ] 只有质量/延迟/成本净收益才开放；extension版本/许可/恢复失败可回滚直接lookup。
- [ ] HF复用：真实激活门保持；明确契约与范围后可先用公开/自有合成数据作有界离线加载、格式和对照准备，不视为本票激活或真实收益。先判定缺内容/别名、排名或召回问题；每轮最多两个候选、只改一个检索变量。
- [ ] HF复用：优先Sentence Transformers验证，收益成立后再评估TEI；精确核Qwen/BGE各权重许可与revision及运行后端支持，不由embedding支持推定reranker兼容。模型库不替代RLS，主线保留原Postgres/直接lookup回退。
- [ ] 知识升级：以VPJ-76同批真实baseline/问题族/qrels区分缺内容、别名、排名与召回失误，再依现有activationEvidence触发；产品RLS/时效/范围在检索前、外发前和展示前保持，研究与产品语料不能串用。
- [ ] 知识升级：每轮比较至多两个候选且只变一项，事前冻结质量改进、p95延迟与单任务费用上限；中文分词和中英别名实测，失败/无净收益保留原路径与完整证据，不因安装pgvector/reranker或公开论文收益而称采用成立。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

后续开启门：在VPJ-47记录需求/成本/责任证据，agent据此判断开发优先级；无需额外产品许可，未实测不能自动标为验收通过

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

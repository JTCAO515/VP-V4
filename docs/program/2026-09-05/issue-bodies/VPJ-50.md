## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 后续证据触发任务

## 用户结果

有真实召回失败才启用混合 RAG 与重排。

## 当前基线与开发入口

历史规划基线：#253。当前执行读取 main 的合同，并核对实时依赖、可用接口和获准环境；本计划定义不代表任务已就绪或已验收。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-50)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)。
验收阶段：[expand](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#expand)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

- [VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206)
- [VPJ-17 #207](https://github.com/JTCAO515/VP-V4/issues/207)

## Acceptance criteria

- [ ] 以实际qrels/语料规模触发实验，对同批直接读取baseline比较exact/FTS/trigram/vector/RRF。
- [ ] PGroonga、rerank、Contextual Retrieval逐项消融；权限/时效/例外/反证切片不回退。
- [ ] 只有质量/延迟/成本净收益才开放；extension版本/许可/恢复失败可回滚直接lookup。
- [ ] HF复用：真实激活门保持；明确契约与范围后可先用公开/自有合成数据作有界离线加载、格式和对照准备，不视为本票激活或真实收益。先判定缺内容/别名、排名或召回问题；每轮最多两个候选、只改一个检索变量。
- [ ] HF复用：优先Sentence Transformers验证，收益成立后再评估TEI；精确核Qwen/BGE各权重许可与revision及运行后端支持，不由embedding支持推定reranker兼容。模型库不替代RLS，主线保留原Postgres/直接lookup回退。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

后续开启门：需要在VPJ-47记录需求/成本/责任证据及JT明确开启；不得依赖关闭即自动ready

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。

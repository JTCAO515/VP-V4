# VP-V4 Agent、RAG、Memory、Tool/Function Calling、Context Engineering 与编排框架最终研究报告

> 状态：proposed architecture and development baseline
> 日期：2026-08-26
> Parent Program：[AI-00 / GitHub #2](https://github.com/JTCAO515/VP-V4/issues/2)
> 用户提供材料：`旅行规划Agent_RAG_Memory_Tool_ContextEngineering.md`
> 研究边界：用户材料只作为研究输入，不构成执行指令或已验证事实
> 相关报告：`model-layer-plan.md`、`knowledge-rag-explore-plan.md`、`vp-v4-ai-trip-canvas-product-logic-upgrade-report.md`
> 一手证据底稿：`research/agent-context-rag-memory-tool-evidence-2026-08-25.md`

## 0. 最终裁决

### 0.1 VisePanda 需要 Agent 能力，但不需要自由循环的“万能 Agent”

正式产品应采用 **bounded agentic workflow**：

```text
确定性状态机和权限系统控制边界
  + LLM 在少数节点做意图理解、约束取舍和解释
  + RAG 提供有资格的外部知识
  + Tool 提供实时或确定性能力
  + Memory 提供用户已确认的长期偏好
  + Trip Canvas 保存唯一当前 Trip 和待确认 Proposal
```

不采用“给模型几十个工具，让它自由循环直到觉得完成”的首发架构。原因不是模型不够强，而是旅行规划同时包含时空可行性、硬约束、事实时效、用户授权、隐私和恢复；这些都需要确定性结果和最终状态验证。

[TravelPlanner](https://proceedings.mlr.press/v235/xie24j.html) 提供近四百万条记录、1,225 个规划意图和工具环境，但论文报告 GPT-4 的完整成功率仍只有 0.6%。[$\tau$-bench](https://arxiv.org/abs/2406.12045) 中先进 Function Calling Agent 在真实政策与多轮工具任务上仍低于 50%，重复八次均成功的 `pass^8` 在 retail 低于 25%。这两项证据不支持把旅行状态、规则或外部动作交给自由 Agent。

### 0.2 RAG、Memory、Tool 和 Context Engineering 都需要，但职责不能重叠

| 能力 | 是否需要 | 唯一职责 | 不应承担 |
| --- | --- | --- | --- |
| RAG | 需要 | 从大规模 eligible Knowledge/Guide/RoutePattern 中选择本轮证据 | 当前 Trip、用户明确偏好、实时数据、权限判断 |
| Memory | 需要 | 保存用户明确或确认的跨会话稳定偏好与约束 | 当前旅行临时状态、未确认推断、系统 Prompt |
| Tool/Function Calling | 需要 | 获取实时观察、运行确定性计算、调用受控能力 | 授权、Trip 直接写入、任意 URL/任意 provider |
| Working Context | 必需 | 保存当前 Trip/Thread/Proposal/未解决问题 | 长期个性画像和公共 Knowledge |
| Context Engineering | 必需 | 按任务装配最小有效上下文 | 把完整历史、全 Trip、全工具定义都塞进 Prompt |
| LangChain | 不需要作为生产基线 | 可做实验适配 | 领域合同、状态真理、权限 |
| LangGraph | 当前不需要 | 未来特定动态循环/暂停恢复 spike | 替代已冻结 Turn/Trip/Event 状态机 |
| Vercel AI SDK | 值得按 AI-43 评测 | Chat adapter、结构化输出、工具协议、UI streaming | Domain types、Trip/Fact 真理 |
| Durable Workflow | 条件需要 | 超出单请求、等待审批、独立重试的长任务 | 普通一轮 Chat、Trip confirm transaction |

### 0.3 “Longchain/Longgraph”解释

本文按上下文将用户所说 `Longchain/Longgraph` 解释为 `LangChain/LangGraph`。如果实际指另一组库或论文，需要单独核验，不能将本结论自动外推。

### 0.4 首发技术选择

1. **保留自有 `TurnCoordinator + TripWorkspace + KnowledgeSystem`。**
2. **新增 `ContextAssembler/ContextPolicy`、`ConstraintEngine`、`ToolRegistry/ToolExecutor`、`MemoryProfile` 四个深模块。**
3. **继续 Postgres hybrid RAG，不引入独立向量数据库或 GraphRAG。**
4. **AI-43 重新以当前 Vercel AI SDK 7/Workflow 能力做采用或拒绝 spike。** AI SDK 只能位于 adapter 层。
5. **LangChain/LangGraph 不进入 R1–R3 生产依赖。** 只有满足本文触发条件才建立独立 spike。
6. **多 Agent 不进入在线核心规划。** 仅用于离线研究、内容辅助和正交 Eval，且不能用模型投票替代证据。

## 1. 研究问题、证据与反目标

### 1.1 研究问题

- VisePanda 是否需要 Agent，还是普通 Chat + Workflow 已足够？
- RAG、Memory、Tool、Working Context 分别应该保存或查询什么？
- Function Calling 能否直接承担工具选择和执行？
- 是否需要 LangChain、LangGraph、Vercel Workflow 或 Temporal？
- 轨迹级 RAG、GraphRAG、多 Agent 是否适合旅行规划？
- 这些结论如何修改现有 VP-V4 开发顺序和 Issue 图？

### 1.2 主要证据类型

- 旅行规划 benchmark 与系统论文；
- RAG、长期 Memory、Function Calling 和长上下文原始论文；
- LangGraph、Vercel AI SDK/Workflow、Temporal、OpenAI Agents SDK 官方文档；
- Anthropic、Microsoft、Google、Stripe 的一方工程/安全资料；
- VP-V4 当前代码、ADRs、合同和 GitHub Issue 图。

### 1.3 Anti-goals

- 不因论文或框架流行就增加依赖；
- 不把研究 benchmark 的数据直接变成产品目标；
- 不以 Google/Stripe 的购买能力扩大 VisePanda 当前无购买范围；
- 不把 Memory 设计成人格模拟或自我修改 Prompt；
- 不让 RAG 绕过 Fact eligibility、RLS、license 或 expiry；
- 不让 Tool/Function Calling 绕过用户确认或 TripPatch；
- 不用多 Agent 投票宣称“答案更可靠”。

## 2. 对用户提供论文的审阅与处置

用户材料的核心公式是：

```text
RAG 世界知识
+ Memory 用户偏好
+ Tool 实时状态
+ Working Context 当前旅行
+ Context Engineering 动态装配
= 可靠旅行规划
```

该公式适合作为产品分层，但需要以下修正。

| 材料观点 | 处置 | VP-V4 修正 |
| --- | --- | --- |
| 旅行规划本质是约束收缩 | 接受 | 新增 deterministic `ConstraintEngine`；模型只提取/解释候选约束 |
| RAG 应检索轨迹级经验 | 有条件接受 | 先做 POI/Fact/Guide；RoutePattern 需来源权利、时空标签和专属 Eval 后再做 |
| Memory 保存旅行节奏与取舍 | 接受并收紧 | 只保存 explicit/confirmed；一次旅行的选择不能自动升级为长期偏好 |
| Tool/API 负责现实变化 | 接受 | 实时数据通过 `ExternalEvidenceResolver`，不用模型参数或 RAG 冒充 current |
| Working Context 是当前计划状态 | 接受 | 由 durable Turn/Trip/Proposal 直接读取，不做向量检索 |
| Context Engineering 动态选信息 | 强接受 | 新增 `ContextPolicy`、预算、provenance manifest 和 ablation Eval |
| Agent 将规划交给预订系统 | 只接受 handoff | VisePanda 当前只准备条件与官方/伙伴出口，不购买、支付或代叫 |
| Google 产品证明该架构必然正确 | 拒绝外推 | Google 是产品方向证据，不是 VP-V4 架构、许可或可靠性证据 |

### 2.1 TravelPlanner 的重要补充

[TravelPlanner](https://proceedings.mlr.press/v235/xie24j.html) 证明旅行规划不是“写一篇合理文案”，而是工具收集、环境约束、常识和硬约束的联合满足。其极低完整成功率说明：

- 应按 constraint/fact/tool/plan stage 分解 Eval；
- 最终状态必须由确定性检查器评分；
- 不能用 LLM judge 总分代替预算、时间、存在性和可执行性验证；
- 模型输出“看起来合理”不是产品成功。

### 2.2 TravelAgent 的适用边界

[TravelAgent](https://arxiv.org/abs/2409.08069) 的 Tool-usage、Recommendation、Planning、Memory 四模块可作为职责参考；但它是研究系统，不证明 VP-V4 应复制在线推荐、多 Agent 或自动 Memory 写入。VP-V4 采用模块边界，重写权限、状态、证据、删除和用户确认。

### 2.3 TP-RAG 的适用边界

[TP-RAG](https://arxiv.org/abs/2504.08694) 表明参考轨迹能改善空间效率和 POI 合理性，同时明确存在冲突、噪声、通用性和鲁棒性问题。因此 RoutePattern 只能是候选经验，不能成为当前路线、营业状态或交通时长的证据。

## 3. VisePanda 的 Agent 定义

### 3.1 工作流与 Agent 的边界

[Anthropic Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) 区分：

- workflow：代码预先定义路径；
- agent：模型动态决定过程和工具。

其一方经验建议从最简单可组合模式开始，只有任务真正需要灵活自治时才增加复杂度。VP-V4 的大多数关键路径已知且高风险，适合 workflow；只有方案探索与复杂取舍需要受限 agent behavior。

### 3.2 VP-V4 的三类执行路径

| Path | 控制者 | 示例 |
| --- | --- | --- |
| Deterministic | code/domain | TripPatch、Fact eligibility、RLS、Safe Phrase、时间/预算计算 |
| LLM-assisted workflow | code route + one/few LLM calls | 意图提取、约束取舍、grounded explanation、Proposal Draft |
| Bounded agent loop | model selects from small read-only tool set under budgets | 开放式对比、复杂知识搜索、候选方案探索 |

首发比例应明显偏向前两类。Agent loop 是例外路径，不是默认 request handler。

### 3.3 目标系统图

```text
Authenticated User / UI Action
  -> TurnCoordinator
     -> deterministic Route/Risk Classifier
     -> ContextPolicy + ContextAssembler
     -> ConstraintEngine
     -> EvidencePlan
        -> KnowledgeSystem / RAG
        -> ExternalEvidenceResolver / Tools
        -> MemoryProfile direct fetch
        -> TripWorkspace direct fetch
     -> ModelGateway (only if needed)
     -> schema/evidence/policy/domain/safety validators
     -> Answer | ExecutionCard | TripProposal | Unavailable
  -> Trip Canvas review
  -> user confirm
  -> atomic TripPatch
```

## 4. ConstraintEngine：论文提示但现有规划中不够独立的模块

### 4.1 为什么需要

旅行规划的核心难点是硬约束满足和软偏好取舍。LLM 可以识别自然语言，但不应独自裁决可行性。

### 4.2 建议合同

```ts
type Constraint =
  | HardConstraint
  | SoftPreference
  | Assumption
  | MissingConstraint;

type ConstraintSet = {
  tripId?: string;
  revision: number;
  partyScope: PartyScope;
  constraints: Constraint[];
  sourceRefs: ContextRef[];
};

type FeasibilityResult = {
  status: "feasible" | "infeasible" | "unknown";
  violations: ConstraintViolation[];
  tradeoffs: TradeoffCandidate[];
  missingEvidence: EvidenceNeed[];
};
```

### 4.3 责任分配

| 工作 | LLM | Deterministic |
| --- | --- | --- |
| 从自由文本抽取候选约束 | yes | schema validate |
| 用户点击/显式字段解析 | no | direct |
| 硬约束是否满足 | explain only | yes |
| 预算合计、时间窗、冲突 | no | yes |
| 软偏好权衡方案 | yes | score inputs/limits |
| 默认值 | phrase/explain | policy-owned |

### 4.4 路线与时空计算

路线可行性应使用 route matrix、开放时间、停留时间和确定性 solver。Google [OR-Tools](https://developers.google.com/optimization/introduction) 与 time-window routing 示例说明约束规划可以由专用算法处理；实时路程由经过授权的地图/路线 provider 提供。RoutePattern RAG 只能提供访问顺序候选，不能替代当前路线计算。

## 5. RAG 最终设计

### 5.1 不是所有 Context 都走 RAG

| 信息 | 正确读取方式 | 原因 |
| --- | --- | --- |
| 当前 Trip/Canvas | `TripWorkspace.get` | 精确版本、权限、不能相似搜索 |
| pending Proposal | exact ID/revision | 必须确认准确对象 |
| 显式 Profile/Hard Constraint | structured key lookup | 精确且高优先级 |
| Canonical POI identity | exact ID/alias/city resolver | 防止重猜实体 |
| Reviewed Fact | exact/structured query，必要时 hybrid retrieval | eligibility/scope/freshness first |
| Guide/背景知识 | RAG | 内容较长、开放问答 |
| RoutePattern | 后期 hybrid/spatiotemporal retrieval | 经验候选，不是事实 |
| Weather/transport status | Tool/External Observation | 实时、TTL、provider attribution |
| 用户导入攻略 | private extraction + artifact lookup | 未确认前不能进入公共 RAG |

### 5.2 首发 pipeline

```text
KnowledgeQuery
  -> purpose / actor / scope / asOf / risk
  -> exact entity and alias resolution
  -> authoritative eligibility and policy filter
  -> lexical candidates (exact, pg_trgm, FTS)
  -> vector candidates
  -> RRF
  -> optional evaluated rerank
  -> post-filter and dedupe by Fact/version
  -> small EvidencePack
  -> citation/claim validator
```

[Anthropic Contextual Retrieval](https://www.anthropic.com/engineering/contextual-retrieval) 支持 lexical + embedding + rerank 的组合，但其 49%/67% 改善来自特定实验域，不能直接作为 VP 目标。VP-V4 应通过五语、风险层和旅行场景 qrels 决定是否采用 chunk contextualization。

### 5.3 `KnowledgeQuery` 建议

```ts
type KnowledgeQuery = {
  mode: "exact_entity" | "scoped_discovery" | "comparison" | "guide" | "route_pattern";
  actorId?: string;
  purpose: PolicyPurpose;
  locale: Locale;
  asOf: string;
  cityIds?: string[];
  subjectIds?: string[];
  facets?: TypedFacetFilter[];
  risk: RiskClass;
  maxEvidence: number;
};
```

### 5.4 RoutePattern RAG

RoutePattern 是未来新增类型，不是复制第三方游记：

```ts
type RoutePattern = {
  id: string;
  cityId: string;
  poiIds: string[];
  typicalOrder: string[];
  durationRange: DurationRange;
  transferProfile: TransferProfile;
  applicableTo: Applicability;
  season?: string;
  pace?: PaceClass;
  sourceReceipts: EvidenceReceipt[];
  reviewedAt: string;
  expiresAt?: string;
};
```

流程：检索适用 RoutePatterns -> ConstraintEngine 过滤 -> route matrix/Fact 校验 -> LLM 解释取舍 -> Proposal。禁止把轨迹直接当当前交通或营业证据。

### 5.5 GraphRAG 是否需要

**首发不需要。** Microsoft [GraphRAG](https://microsoft.github.io/graphrag/query/overview/) 主要解决大规模非结构化语料的实体关系和全局主题归纳；Global Search 需要 LLM 构图、community summaries 和 map-reduce，计算成本较高。VP-V4 已有 Canonical POI、Fact、source、city、facet 和 TripPlaceReference 的结构化关系，Postgres 查询比重新用 LLM 生成第二张图更权威。

触发 GraphRAG spike 的条件必须同时满足：

1. 有合法、足量的长篇非结构化 corpus；
2. 高频问题需要跨文档全局主题/关系推理；
3. hybrid baseline 在具名 qrels 上稳定失败；
4. LLM-derived graph 不被用作执行事实；
5. 索引成本、失效、删除和 provenance 可运营。

### 5.6 RAPTOR/Self-RAG 是否需要

- [RAPTOR](https://arxiv.org/abs/2401.18059) 适合长文档多层摘要检索；当前 POI Fact 模型不需要，未来长 Guide/政策 corpus 可做离线 challenger。
- [Self-RAG](https://arxiv.org/abs/2310.11511) 依赖特殊训练/反思 token 机制，不应被误解为给普通模型加一个“自我反思 Prompt”。当前不采用。
- 不做固定 top-k 无差别检索；是否需要 retrieval 由确定性 route/risk 或小型 TurnPlan 决定。

### 5.7 RAG Eval

[RAGChecker](https://arxiv.org/abs/2408.08067) 强调分开诊断 retrieval 和 generation。VP-V4 需要：

- identity resolution accuracy；
- Recall@k/nDCG/MRR，按五语/城市/风险分层；
- evidence precision、citation correctness；
- no-answer/abstention；
- expired/conflict/private leakage；
- route-pattern applicability 和 spatiotemporal feasibility；
- latency/cost/token；
- end-to-end GroundedClaim support。

## 6. Memory 最终设计

### 6.1 Working Context 不等于 Memory

```text
Working Context
  = 当前 Thread + Trip + Proposal + unresolved + current conditions

Long-term Memory
  = 用户跨会话、跨 Trip 仍希望系统记住的稳定信息
```

当前日期、这次预算、这次同行人、某个待选酒店默认属于 Trip/Thread。只有用户保存或确认其长期适用性后才进入 Memory。

### 6.2 四层 Memory

| Layer | 内容 | 读取 | 写入 |
| --- | --- | --- | --- |
| Thread state | 当前消息、事件、summary、unresolved | exact thread | TurnCoordinator |
| Trip memory | 当前 Trip 决定、约束、receipts | exact trip/version | TripWorkspace |
| Profile memory | 稳定偏好、节奏、hard constraint | structured key + scope | explicit/confirmed only |
| Episodic candidate | 成功/失败交互的候选经验 | semantic, low priority | background + review |

### 6.3 Memory 记录

```ts
type MemoryRecord = {
  id: string;
  userId: string;
  kind: "preference" | "hard_constraint" | "negative_preference" | "party_context" | "episode";
  value: unknown;
  scope: MemoryScope;
  status: "explicit" | "confirmed" | "inferred" | "rejected" | "paused" | "deleted";
  sourceRefs: ContextRef[];
  confidence?: number;
  createdAt: string;
  confirmedAt?: string;
  lastUsedAt?: string;
  reviewAt?: string;
  supersedes?: string;
};
```

### 6.4 形成流程

```text
User explicit setting
  -> validate -> active MemoryRecord

Conversation signal
  -> background extraction candidate
  -> policy/sensitivity/conflict/dedupe
  -> inferred UI
  -> user confirms/rejects
  -> active or excluded
```

不允许模型在主回答 hot path 中直接写长期 Memory。背景提取可以降低交互延迟，但只产生 candidate。

### 6.5 检索优先级

1. exact hard constraints；
2. exact task/profile fields；
3. scope-matched confirmed preferences；
4. relevant episodes；
5. inferred candidate 默认不进入决策。

硬约束不能依赖 semantic similarity 才被找到。

### 6.6 场景 Scope

Memory 必须区分：solo、couple、family、parents、business、weekend、long-holiday 等 scope。一次蜜月选择高价酒店不能覆盖用户的普通预算偏好。

### 6.7 Memory Eval

[LongMemEval](https://arxiv.org/abs/2410.10813) 将长期 Memory 分为 extraction、multi-session reasoning、temporal reasoning、knowledge update 和 abstention，并报告长期历史下商业助手约 30% 准确率下降。VP-V4 Eval 还应增加：

- explicit vs inferred classification；
- scope/party applicability；
- contradiction/supersede；
- pause/delete propagation；
- hard constraint recall；
- sensitive inference rejection；
- cross-user isolation；
- “不知道/没有记忆”的正确 abstention。

### 6.8 是否采用 LangMem

LangMem 官方说明 Memory 最佳设计通常是 application-specific，并区分 semantic/episodic/procedural、hot-path/background 形成。[其 Core API](https://langchain-ai.github.io/langmem/concepts/conceptual_guide/) 可作为离线抽取实验参考，但 VP-V4 不采用其 BaseStore 作为生产真理：

- 已有新 V4 Supabase lineage 和 RLS；
- Memory 需要 source receipt、consent、scope、hard constraints、delete evidence；
- Agent 自主管理 memory tool 会扩大 agency；
- Procedural memory 自动改 Prompt 与现有 prompt/version governance 冲突。

## 7. Tool 与 Function Calling 最终设计

### 7.1 Function Calling 只是结构化请求，不是授权

模型输出合法 JSON 仍不代表：

- Tool 对当前 actor 可用；
- 参数语义正确；
- 数据目的/region 合法；
- 调用结果可写入 Trip；
- 外部动作获得用户授权。

OpenAI [Structured Outputs](https://openai.com/index/introducing-structured-outputs-in-the-api/) 可提高 schema adherence，但官方同样区分 valid JSON 和特定 schema，并提示 parallel function calls 的限制。VP-V4 必须在本地重新验证 schema、policy、actor 和 domain。

### 7.2 Tool 分级

| Class | 示例 | 模型可选 | Approval | Trip 写入 |
| --- | --- | --- | --- | --- |
| D0 deterministic internal | money/time/constraint/check | no，代码直接调用 | no | no |
| R1 read-only evidence | knowledge query、weather、route matrix | task-specific allowlist | no/按敏感度 | no |
| R2 transformation | OCR、MT、TTS、artifact extraction | router/explicit UI | media consent | no |
| P proposal-producing | CreateTripProposal | limited | Canvas confirm later | only pending Proposal |
| X external side effect | booking/payment/message/ride | disabled at launch | explicit action-time | never direct Trip truth |

### 7.3 Tool contract

```ts
type ToolDefinition<I, O> = {
  id: string;
  version: string;
  description: string;
  riskClass: ToolRiskClass;
  inputSchema: Schema<I>;
  outputSchema: Schema<O>;
  allowedTaskProfiles: TaskProfileId[];
  allowedDataClasses: DataClass[];
  requiresApproval: boolean;
  idempotency: IdempotencyPolicy;
  timeoutMs: number;
  retryPolicy: RetryPolicy;
  maxModelOutputTokens: number;
  featureFlag: string;
};

type ToolReceipt<O> = {
  toolId: string;
  toolVersion: string;
  callId: string;
  inputDigest: string;
  output: O;
  startedAt: string;
  finishedAt: string;
  providerReceipt?: string;
  policyReceipt: string;
};
```

### 7.4 Tool execution pipeline

```text
ToolCallIntent from model or UI
 -> name/collision allowlist
 -> schema validation
 -> actor/purpose/data/region policy
 -> approval if required
 -> idempotency/deadline/budget
 -> execute adapter
 -> output schema/size/injection screening
 -> ToolReceipt
 -> deterministic card or model-safe projection
```

### 7.5 Tool design原则

[Anthropic 的工具工程实践](https://www.anthropic.com/engineering/writing-tools-for-agents) 指出更多工具不一定更好，Tool 应有清楚 namespace、返回有意义且 token-efficient 的 Context，并用 Eval 优化描述。VP-V4 采用：

- 按 TaskProfile 只暴露 2～8 个相关工具；
- UI action 优先，不让模型重新猜按钮；
- Tool 返回 normalized summary + receipt，不返回整份 provider payload；
- 相关工具按 namespace 命名；
- 无适用 Tool 时模型必须能够不调用；
- 并行只用于独立 read-only calls；
- state-changing/tool-producing Proposal 串行并重新校验版本。

#### 7.5.1 初始 Bounded Tool Budget（待 Eval 调整）

| 任务 | 默认调用预算 | 允许循环 | 终止条件 |
| --- | ---: | --- | --- |
| Fact Q&A | 0–1 | no | EvidencePack 或 unavailable |
| POI comparison | 0–2 parallel reads | no | 每个 exact entity 有可比较 receipt |
| Trip day Proposal | 0–3 reads | 最多一次补缺 | constraint check + valid Proposal |
| Today recovery | 0–3 reads | 最多一次 fallback | current conditions + safe Proposal |
| Import/extraction | workflow steps | 不由 Chat Agent 自由循环 | extraction/review state machine terminal |

这些是安全起始假设，不是模型能力结论；AI-42/Tool Eval 应按任务、语言、风险、延迟和成本校准。

### 7.6 Function Calling Eval

除 provider conformance 外，参考 [BFCL](https://gorilla.cs.berkeley.edu/leaderboard.html) 和 `$\tau$-bench` 构建 VP 自有用例：

- relevant tool selection；
- no-tool / unavailable；
- wrong/missing/extra arguments；
- exact entity ID；
- multi-turn correction；
- tool error/retry/cancel；
- parallel read-only calls；
- tool output injection；
- final database/Trip state；
- repeated-run `pass^k`，不能只看单次成功。

[Apple ToolSandbox](https://aclanthology.org/2025.naacl-findings.65/) 进一步证明 multi-turn state dependency、canonicalization 和 insufficient information 是独立失败面；[AgentDojo](https://proceedings.neurips.cc/paper_files/paper/2024/hash/97091a5177d8dc64b1da8bf3e1f6fb54-Abstract-Datasets_and_Benchmarks_Track.html) 证明恶意指令可能藏在 Tool 返回和旅行相关内容中。VP Tool Eval 因此必须检查完整 trajectory 与 indirect prompt injection，不只检查参数 JSON。

## 8. Context Engineering 最终设计

### 8.1 为什么它是首要模块

[Anthropic Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) 将问题定义为：在有限 token 与 attention 预算下，每轮策划最有用的 Context。`Lost in the Middle` 研究发现，即使长上下文模型，关键信息位于中部时性能仍可能显著下降。[论文](https://aclanthology.org/2024.tacl-1.9/) 不支持“上下文窗口大，所以把全部信息塞进去”。

### 8.2 Context 来源与优先级

```text
1. System/product invariant and output contract
2. Risk/policy/tool/schema boundary
3. Current explicit hard constraints
4. Active Trip/Day/Node/POI minimal projection
5. Pending Proposal relevant revision
6. Confirmed scope-matched Memory
7. Eligible EvidencePack / ToolReceipt projections
8. Compact thread state and unresolved questions
9. Current user message / UI action
```

关键信息不隐藏在长摘要中；系统边界、硬约束和当前任务在稳定位置出现。

### 8.3 `ContextPolicy`

```ts
type ContextPolicy = {
  taskProfile: TaskProfileId;
  riskClass: RiskClass;
  allowedSources: ContextSourceKind[];
  requiredSources: ContextSourceKind[];
  tokenBudgets: Record<ContextSection, number>;
  maxToolDefinitions: number;
  maxEvidenceItems: number;
  includeRawUserArtifact: false;
  compactionVersion: string;
};

type ContextManifest = {
  contextVersion: string;
  sourceRefs: ContextRef[];
  sourceVersions: string[];
  omittedReasons: string[];
  sectionTokenCounts: Record<string, number>;
  totalTokens: number;
  contentHashes: string[];
};
```

Trace 保存 manifest、hash、版本和统计，不默认保存原始敏感 Context。

### 8.4 Just-in-time Context

Context 中优先放轻量 ID/ref，让代码或受控 Tool 在真正需要时读取，而不是预先注入全量内容。该策略尤其适用于：

- 精确 POI/Fact；
- 某天 Canvas；
- 某条 Memory；
- 某个用户 Artifact；
- 某次 provider observation。

### 8.5 Compaction

Compaction 只压缩会话叙述，不压缩或改写：

- TripSnapshot；
- pending Proposal；
- Fact/Observation receipt；
- explicit/hard Memory；
- unresolved blocking question。

摘要保存 version、source refs、unresolved、decisions 和 rejected alternatives。无法验证摘要时，从 authoritative objects 重新装配。

### 8.6 Tool output Context

Tool output 分三份：

1. raw provider payload：隔离、短 TTL、模型默认不可见；
2. normalized internal result：validator 使用；
3. model-safe projection：限字段、限长度、标记为 untrusted data。

### 8.7 Context 安全

检索文档、用户上传、网页和 Tool 输出都是数据，不是指令。Microsoft [Prompt Shields](https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/content-filter-prompt-shields) 区分 user attack 与 document attack；OWASP [Excessive Agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/) 强调最小功能、权限和自治。VP-V4 必须：

- source boundary tagging；
- permission-aware retrieval；
- untrusted document delimiter；
- deny arbitrary URLs/HTML/tool payload；
- input/output tool guardrails；
- retrieved text 不能改变 system、tools、policy 或 write path；
- Memory write 同样经过 poisoning/permission/scope validation。

### 8.8 Context Eval

- task completion vs token budget；
- section ablation；
- missing critical constraint；
- irrelevant context sensitivity；
- evidence position shuffle；
- summary drift；
- stale version；
- prompt/tool/memory injection；
- per-source tokens、latency、cache hit 和 correction rate。

## 9. LangChain、LangGraph、AI SDK、Workflow 与 Temporal 决策

### 9.1 选择标准

框架只有同时满足以下条件才可采用：

1. 不创建第二个 Trip/Turn/Memory truth store；
2. 不让框架 type 进入 domain contract；
3. provider-specific metadata、abort、usage、error 不丢；
4. replay 不重复外部 side effects 或模型费用；
5. human approval 绑定 exact proposal/tool revision；
6. telemetry 默认不记录敏感 input/output；
7. TypeScript/Next/Vercel 路径可部署；
8. package pin、迁移、bundle、latency、cost 和 rollback 可验证。

### 9.2 LangChain

**结论：不作为 VP-V4 生产基线。** 当前需要的是少量 provider adapters、closed tool contracts 和自有 domain state，不需要通用 chain abstraction。若某个 provider integration 只能通过 LangChain adapter 获得，可在 spike 中隔离，但不能向上暴露其 Message/Tool/Memory type。

### 9.3 LangGraph

LangGraph 官方支持 checkpoint、thread、interrupt、Store 和 replay；这与 VP-V4 已有 durable Turn、Trip event、Proposal revision、Memory/RLS 设计高度重叠。其 [interrupt 文档](https://docs.langchain.com/oss/python/langgraph/interrupts) 还说明恢复时节点从头执行，因此 interrupt 前 side effects 必须幂等或隔离。

**R1–R3 不采用。** 触发 spike 必须满足至少一项：

- 同一 Turn 需要三种以上动态循环且代码状态机明显失控；
- human approval 需要跨小时/天恢复，现有 event protocol 成本明显更高；
- 多个可复用 subgraph 有真实第二消费者；
- 故障恢复/可观测性 Eval 显示框架显著胜过现有实现。

即使采用，LangGraph checkpoint 也只能是执行投影，不能成为 Trip/Fact/Memory 真理源。

### 9.4 Vercel AI SDK

当前官方 [AI SDK 7](https://vercel.com/blog/ai-sdk-7) 已包含工具审批、timeouts、runtime context、telemetry 和 `WorkflowAgent`。现有 GitHub #47/AI-43 仍以更早的 `streamText` spike 描述为主，开工前应更新为当前版本矩阵。

**建议：高概率采用 Core adapter，条件采用 Agent abstraction，不立即采用 WorkflowAgent。**

- Core：provider abstraction、structured output、tool parsing、abort/usage，值得 spike；
- ToolLoopAgent：只有 bounded step/TaskProfile/validator 全部可控时采用；
- WorkflowAgent：只有运行超出 request、等待人工或每步需独立重试时采用；
- Domain、Trip、Fact、Memory 仍是自有类型。

### 9.5 Vercel Workflow

[Vercel Workflow](https://vercel.com/blog/a-new-programming-model-for-durable-execution) 可让工具步骤持久化、重试、暂停和恢复，且与 TypeScript/AI SDK 同栈。建议在以下任务出现时再评测：

- 大型攻略导入/OCR/embedding；
- 跨请求人工审批；
- 多分钟 provider polling；
- 可独立重试的多步外部协调。

普通 Chat Turn、Proposal confirm 和 exact Trip RPC 不使用 Workflow。

### 9.6 Temporal

Temporal [Workflow](https://docs.temporal.io/workflows) 使用 Event History replay，外部 API/DB/LLM 放在 idempotent Activities 中，可长期运行和恢复。这是成熟能力，但增加服务、worker、determinism/versioning 和运维成本。

**当前 defer。** 只有 Vercel Workflow/现有 Queue 在真实负载、审计或跨环境可移植性上不能满足时再评测。

### 9.7 MCP

**首发内部工具不需要 MCP。** MCP 解决跨客户端/第三方 Tool 互操作，不自动完成授权、Fact eligibility、Trip version、用户 consent 或 provider policy。内部 first-party Tools 使用直接 typed interface 更小、更可审计。

只有出现真实外部工具生态或跨客户端复用需求时才建立 MCP ADR；远端 MCP server 必须位于 VP `ToolGateway` 后，tool annotations 按 [MCP Tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) 视为 untrusted，仍走自有 allowlist、auth、approval、output screening 和 receipt。

## 10. Long-running 与 Multi-Agent

### 10.1 用户交互主路径不要 Long-running

Chat 应在 bounded deadline 内完成 Answer/Card/Proposal 或返回 job/unavailable。用户不应等待一个几十步 Agent loop 才看到结果。

### 10.2 Background job 适用范围

- guide import/extraction；
- OCR/translation batch；
- embedding/index rebuild；
- provider benchmark；
- content Change Set；
- offline eval/shadow/canary。

每项使用 durable job state、idempotency、retry/quarantine/cancel；不把一个巨大 Context 长期保存在模型会话中。

### 10.3 Multi-Agent 是否需要

[Anthropic multi-agent Research](https://www.anthropic.com/engineering/multi-agent-research-system) 的 orchestrator-worker 适用于开放式研究，因为子任务不可预知且可并行搜索。旅行核心写入路径相反：约束、工具、状态和权限都应受控。

结论：

- 在线 Trip planning：单 TurnCoordinator + specialized deterministic modules；
- 并行 read-only evidence：允许程序化 fan-out，不需要多 Agent；
- Content research/offline evaluation：可使用多 Agent，但输出仍是 private candidate；
- 安全/eval：不同模型或 prompts 可寻找反例，不按多数票合并事实。

### 10.4 其他垂直行业的一方经验

| 来源 | 观察 | 可迁移到 VP | 不能外推 |
| --- | --- | --- | --- |
| [Uber Finch](https://www.uber.com/us/en/blog/unlocking-financial-insights-with-finch/) | 金融 Agent 先用 curated data marts、semantic metadata、RBAC 和分层 eval 缩小问题，再使用 supervisor/sub-agent | 先 exact city/POI/Trip/scene，再给模型；router/tool/end-to-end 分层评测 | LangGraph 是可靠性的唯一原因 |
| [Uber GenAI Gateway](https://www.uber.com/us/en/blog/genai-gateway/) | 集中多 provider access、security、usage 和 budget | 支持 ModelGateway、Policy、Trace 统一入口 | provider 方言可以完全抹平 |
| [Airbnb Guest Journey](https://airbnb.tech/ai-ml/personalizing-airbnb-search-by-learning-from-the-guest-journey/) | offline user representation 与 online retrieval/ranking 分层 | Memory 只影响候选/排序特征，不越过 eligibility | 住宿 marketplace ranking 等于旅行 RAG |
| [Stripe Agent Toolkit](https://docs.stripe.com/agents) | 一方文档要求 restricted key、sandbox 和 eval；非确定 Agent 不能直接获得无限 API 权限 | ToolGateway、least privilege、环境隔离、最终状态审计 | VP 当前应接支付或购买 |

这些案例共同支持“域收缩、权限收缩、评测分层、最终状态审计”，而不是“增加 Agent 数量”。

## 11. Chatbot、Trip Canvas 与 Agent 的最终联动

### 11.1 每轮协议

```text
1. Accept + authenticate
2. Resolve UI action / intent
3. Load exact Working Context
4. Build ConstraintSet
5. Plan Evidence/Tools
6. Retrieve/execute under policy
7. Assemble minimal Context
8. Generate one bounded object
9. Validate schema/evidence/domain/safety
10. Publish Answer/Card/Proposal/Unavailable
11. Background memory candidate extraction
12. Canvas review and explicit confirm
```

### 11.2 Model 允许输出

- `TravelIntentDelta`；
- `ConstraintCandidate[]`；
- `EvidenceNeed[]` closed union；
- `AnswerDraft`；
- `ProposalDraft`；
- suggestion keys from registry。

模型不允许输出：

- eligibility；
- public source label；
- canonical ID；
- actual URL/provider；
- confirmed Memory；
- TripPatch；
- external side effect approval。

### 11.3 Canvas

Canvas 消费的是 authoritative Trip + Proposal/Evidence/Action projections，不消费 LangGraph state、agent scratchpad 或模型未验证 JSON。

## 12. Eval、可观测性和发布门

### 12.1 五套独立 Eval

1. **Planning/Constraint Eval**：硬约束、软偏好、时空、预算、无解；
2. **RAG Eval**：retrieval 与 grounded generation 分开；
3. **Memory Eval**：形成、更新、时间、scope、abstention、delete；
4. **Tool Eval**：selection、args、policy、error、pass^k、final state；
5. **Context Eval**：token budget、ablation、position、injection、summary drift。

### 12.2 最终状态评分

每个 scenario 记录：

```ts
type AgentScenario = {
  userGoal: UserGoal;
  initialTrip: TripSnapshot | null;
  userProfile: MemoryFixture[];
  eligibleFacts: FactFixture[];
  toolWorld: ToolFixture[];
  expectedFinalState: ExpectedState;
  forbiddenActions: ForbiddenAction[];
};
```

评分优先读取最终 Trip/Proposal/tool receipts，而不是 LLM judge 对散文的印象。

### 12.3 Demo 资产转化

- 11 chats：multi-turn and context routing scenarios；
- 74 turns：clarification/result/failure corpus；
- 11 Canvas：initial/final state fixtures；
- 12 Diff：Proposal/confirm/conflict cases；
- 12 Memory：scope/update/abstention cases；
- 34 Tool screens：health/error/approval cases；
- 4 recovery paths：disruption benchmark。

### 12.4 Observability

Trace 至少记录：

- task/context/prompt/schema/model/tool versions；
- context manifest and token counts；
- retrieval candidate/rank/receipt IDs；
- tool call/result/error/deadline/idempotency；
- proposal/Trip versions；
- user accept/edit/reject；
- latency/cost/cache；
- privacy-safe failure category。

默认不记录 raw prompt、tool payload、media、precise location、reasoning chain 或敏感 Memory。

## 13. 开发顺序

### Stage A：在真实模型前补三个核心合同

1. `ContextEnvelope/ContextPolicy/ContextManifest`；
2. `ToolDefinition/ToolCallIntent/ToolReceipt/ToolExecutor`；
3. `ConstraintSet/FeasibilityResult`。

### Stage B：R1 完成

继续 #15/#16/#17，不因本研究重新打开已关闭合同。

### Stage C：R2 Grounded Agent Core

- 更新 AI-43 current framework spike；
- ModelGateway conformance；
- bounded tools；
- lexical/hybrid RAG；
- typed Cards；
- Context/Tool/Constraint Evals。

### Stage D：Memory 与产品面

- explicit Profile；
- inferred candidate pipeline；
- Copilot governance；
- Chat/Canvas Memory receipts。

### Stage E：Trajectory/Long-running challengers

- 两城市完成后评估 RoutePattern RAG；
- import/media 出现真实长任务后评估 Vercel Workflow；
- 不在缺真实问题时引入 LangGraph/Temporal/GraphRAG。

## 14. 对现有 Issue 计划的修正

27-Issue 草案在创建前必须修订：

### 14.1 新增/前移

1. 新增 `Context Engineering Contract 与 ContextAssembler`，放在真实模型/工具消费前；
2. 新增 `Tool Contract、Registry、Executor 与 Guardrails`，不等到 R5 Tools UI；
3. 新增 `ConstraintEngine 与 Feasibility Checker`，作为 Chat/Canvas/Today 共用模块；
4. 新增 `RoutePattern RAG Feasibility Spike`，放在 R3 两城市 Gate 后且默认 blocked。

### 14.2 修改已有

- AI-43/#47：从旧 `streamText` spike 更新为当前 AI SDK 7 Core/ToolLoop/Workflow 三层 decision；加入 thin adapter 和 LangGraph negative comparison。
- AI-42/#46：扩充 tool/context/memory final-state scenarios，不另建通用 LLM judge 平台。
- Memory issues：明确 background candidate、scope、consent、abstention 和 hard exact lookup。
- Tool Registry issue：拆成 R2 runtime contract 与 R5 product health/offline surface。
- Today/Recovery：必须依赖 ConstraintEngine，而不是自由 LLM replanning。

### 14.3 不新增

- 不创建“接入 LangChain”Issue；
- 不创建“接入 LangGraph”Issue；
- 不创建“多 Agent 旅行规划”Issue；
- 不创建“GraphRAG 知识图谱”Issue；
- 不创建“自动长期 Memory”Issue；
- 不创建“Agent 自主购买/预订”Issue。

## 15. Framework/Architecture Trigger Register

| Candidate | 当前 | 触发条件 | 回滚 |
| --- | --- | --- | --- |
| AI SDK Core | spike | provider/tool/abort/usage/metadata 全通过 | thin HTTP adapter |
| ToolLoopAgent | defer/spike subset | bounded loop 显著减少代码且 Eval 不降 | explicit TurnCoordinator calls |
| Vercel WorkflowAgent | defer | 跨请求/人工等待/独立重试真实发生 | queue + durable events |
| LangGraph | reject as baseline | 动态循环/interrupt/subgraph 有真实第二用例 | existing state machine |
| Temporal | defer | Workflow portability/years-long audit 超出现有栈 | Vercel Workflow/queue |
| GraphRAG | reject as baseline | global corpus questions击穿 hybrid baseline | Postgres hybrid RAG |
| RAPTOR | offline challenger | long Guide/Policy corpus多层 QA 需要 | normal chunk/summary retrieval |

## 16. Stop Conditions

立即停线：

- RAG 返回 candidate/draft/expired/private/licence-blocked；
- semantic search 用于 hard constraint 或 exact Trip version；
- Memory 从单轮自动成为 confirmed/hard；
- Tool Function JSON 通过就直接执行；
- 模型获得任意 URL/provider/写数据库工具；
- parallel tools 包含 state-changing call；
- Context 中混入 raw provider payload 或 tool/document instructions；
- framework checkpoint 成为第二 Trip/Memory truth；
- replay 重复模型费用或外部 side effects；
- multi-agent 用投票决定 Fact/Trip；
- route trajectory 跳过当前开放时间、路线或用户约束校验；
- 长任务占用交互 request 直到超时；
- 无 Eval/observability 就增加 tool/agent autonomy。

## 17. 最终建议

VisePanda 的竞争力不应来自“Agent 能调用很多工具”，而应来自：

1. 知道何时不调用模型；
2. 知道当前问题需要 Trip、Memory、RAG 还是 Tool；
3. 能把模糊愿望收缩成显式约束；
4. 能在数据不足时返回 unknown/unavailable；
5. 能把每次变化变成用户可审查的 Proposal；
6. 能在中断、冲突、过期和 provider failure 后恢复；
7. 能证明最终 Trip 状态、来源和用户授权。

这要求一个可靠的旅行状态中枢，而不是一个自由自治的聊天循环。

## 18. Primary Sources

### Travel

- [TravelPlanner, ICML 2024](https://proceedings.mlr.press/v235/xie24j.html)
- [TravelAgent](https://arxiv.org/abs/2409.08069)
- [TP-RAG](https://arxiv.org/abs/2504.08694)
- [Google AI Mode travel Canvas](https://blog.google/products-and-platforms/products/search/agentic-plans-booking-travel-canvas-ai-mode/)
- [OR-Tools](https://developers.google.com/optimization/introduction)
- [Route Optimization API](https://developers.google.com/maps/documentation/route-optimization/overview)

### RAG and context

- [Original RAG paper, NeurIPS 2020](https://proceedings.neurips.cc/paper/2020/hash/6b493230-Abstract.html)
- [Contextual Retrieval](https://www.anthropic.com/engineering/contextual-retrieval)
- [Effective Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Lost in the Middle, TACL 2024](https://aclanthology.org/2024.tacl-1.9/)
- [RAGChecker](https://arxiv.org/abs/2408.08067)
- [GraphRAG docs](https://microsoft.github.io/graphrag/query/overview/)
- [RAPTOR](https://arxiv.org/abs/2401.18059)
- [Self-RAG](https://arxiv.org/abs/2310.11511)

### Memory

- [LongMemEval](https://arxiv.org/abs/2410.10813)
- [MemGPT](https://arxiv.org/abs/2310.08560)
- [Generative Agents](https://arxiv.org/abs/2304.03442)
- [LangMem concepts](https://langchain-ai.github.io/langmem/concepts/conceptual_guide/)

### Tools and agents

- [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents)
- [Writing Effective Tools](https://www.anthropic.com/engineering/writing-tools-for-agents)
- [$\tau$-bench](https://arxiv.org/abs/2406.12045)
- [BFCL](https://gorilla.cs.berkeley.edu/leaderboard.html)
- [OpenAI Function Calling](https://help.openai.com/en/articles/8555517-function-calling-in-the-openai-api)
- [OpenAI Agents SDK tool guardrails](https://openai.github.io/openai-agents-js/guides/guardrails/)
- [MCP Tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [OWASP Excessive Agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/)

### Orchestration

- [LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- [LangGraph interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts)
- [Vercel AI SDK 7](https://vercel.com/blog/ai-sdk-7)
- [Vercel Workflow](https://vercel.com/blog/a-new-programming-model-for-durable-execution)
- [Temporal Workflows](https://docs.temporal.io/workflows)
- [Temporal Activities](https://docs.temporal.io/activities)
- [Anthropic multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)

## 19. 成熟度声明

- **已验证：** 用户材料全文、当前 VP-V4 contracts/dependencies/issues、上述一手论文和官方文档；
- **建议采用：** bounded workflow、ContextAssembler、ConstraintEngine、structured Memory、hybrid RAG、small tool allowlists；
- **需 spike：** current Vercel AI SDK Core adoption、RoutePattern RAG、future durable workflow；
- **当前拒绝/延后：** LangChain production baseline、LangGraph core、GraphRAG、Temporal、多 Agent online planning；
- **未实现：** 本报告所有新增 runtime、Memory、Tool、Context 和 solver；
- **未验证：** 真实模型/工具成本、五语 Context quality、RoutePattern corpus rights、生产用户效果。

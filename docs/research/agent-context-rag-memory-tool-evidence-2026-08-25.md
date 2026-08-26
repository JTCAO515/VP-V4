# VisePanda AI：RAG、Memory、Tool、Context Engineering 与 Agent Runtime 证据底稿

- 核验日期：2026-08-26（Asia/Shanghai；文件名沿用本轮研究计划日期 `2026-08-25`）
- 适用仓库：`JTCAO515/VP-V4`
- 状态：**研究证据与可逆架构建议，不代表相关 runtime、数据库、LangChain、LangGraph、MCP 或 durable workflow 已经开发、接入或验收**
- 研究输入：用户提供的《旅行规划 Agent 的 RAG、Memory、Tool 与 Context Engineering》作为问题清单和线索，不作为一手证明
- 研究方法：优先使用原始论文、会议论文页、官方规范、官方文档、源代码仓库和一方工程案例；把“来源声称”“限制”“给 VP 的推论”分开记录
- 边界：未调用任何模型或外部数据 API，未运行 benchmark，未创建 GitHub Issue，未修改已存在的规划报告

---

## 0. 证据结论先行

### 0.1 是否需要

| 能力/框架 | 证据结论 | VP-V4 当前建议 | 不应误解为 |
| --- | --- | --- | --- |
| RAG | **需要，但只用于适合检索的 reviewed knowledge/guide** | 保留现有 Canonical ID -> eligibility -> lexical/vector -> rerank -> evidence pack；关键执行值优先 typed exact lookup | 把所有数据转成 chunk，或用向量相似度代替事实资格 |
| Memory | **需要，但必须是有来源、有生命周期、可撤销的产品数据** | Trip working state、conversation continuity、long-term preference 分层；长期记忆先形成 candidate，再由用户确认或明确规则晋级 | 保存整段聊天、自动推断永久人格，或把一次旅行偏好写成长期事实 |
| Tool / Function Calling | **需要，是实时事实和确定性能力的桥梁** | 模型只能提出 typed tool intent；服务端授权、校验、选 provider、执行、记 receipt；写 Trip 仍走 Proposal/Confirm/Patch | 模型输出了合法 JSON 就代表动作安全或事实正确 |
| Context Engineering | **需要，是核心运行机制，不是 prompt 美化** | 每个 turn 先形成 `ContextPlan`，按决策类型装配最小高信号上下文；原始历史、摘要、Facts、live observations 分通道 | 大上下文窗口可以替代检索、状态建模和过期控制 |
| LangChain | **当前不构成必要条件** | 首发继续直接 provider adapters + typed domain services；只有 integration/middleware 的实测净收益超过抽象成本才做 spike | “多模型”天然要求 LangChain |
| LangGraph | **能力相关，但当前不应成为 Chat/Canvas 内核前置** | 仅在确实出现跨请求 checkpoint、复杂 branching、interrupt/replay 的长程 agent lane 时做隔离 pilot | 有图形化流程就必须使用 LangGraph，或 checkpoint 就等于产品 Memory |
| Durable workflow | **部分后台/长时任务需要** | 内容导入、embedding、媒体处理、外部数据刷新可优先评测 Vercel Workflow；未来跨服务关键长流程再评估 Temporal | 每个聊天 turn 都应变成长时间运行 workflow |
| MCP | **首发内部工具不需要；跨客户端/第三方互操作时才有价值** | first-party tools 继续内部 typed interface；若引入 MCP，仍需自有 auth/policy/consent/audit gateway | MCP 协议本身会执行授权、安全隔离或事实校验 |
| 自由循环 / 多 Agent | **不作为默认方案** | 一个 Turn Orchestrator + 明确 workflow；只有开放任务且有可验证终止条件时才允许 bounded loop | Agent 数量或多模型投票能提高事实可靠性 |

### 0.2 最高层判断

旅行规划的核心不是“一个 LLM 不断调用工具直到觉得完成”，而是四类不同控制对象协作：

```text
用户目标与偏好
  -> Constraint Model（硬约束、软偏好、未知、冲突）
  -> ContextPlan（本轮真正需要哪些状态/知识/实时观察）
  -> Deterministic retrieval/tools（受权限、资格、TTL、许可约束）
  -> LLM synthesis（解释、比较、提出 Proposal）
  -> Validators（预算、时间、地理、引用、版本、权限）
  -> TripProposal -> 用户确认 -> TripPatch -> Trip Canvas
```

**架构推论：** VisePanda AI 应被定义为“受确定性控制平面约束的规划协作者”，Trip Canvas 是唯一旅行状态，而不是让 Agent 的消息历史、LangGraph checkpoint 或向量 Memory 成为第二份行程真相。

### 0.3 为什么不能直接做“自主旅行 Agent”

- TravelPlanner 在其 2024 benchmark 中提供 1,225 个规划意图、近 400 万条数据和多种工具；论文报告当时 GPT-4 的 final success 仅 0.6%，主要失败包括偏离任务、工具使用和多约束跟踪。[ICML 论文页](https://proceedings.mlr.press/v235/xie24j.html)、[ICML 海报页](https://icml.cc/virtual/2024/poster/33227)
- ToolSandbox 表明多轮工具系统中的 state dependency、canonicalization 和 insufficient information 对强模型仍然困难；单轮函数调用准确率不能代表真实旅行工作流可靠性。[Apple Research](https://machinelearning.apple.com/research/toolsandbox-stateful-conversational-llm-benchmark)、[论文](https://aclanthology.org/2025.naacl-findings.65/)
- AgentDojo 证明外部工具返回的不可信文本可以通过间接 prompt injection 劫持动作；其环境包含 travel booking 场景。[NeurIPS 2024](https://proceedings.neurips.cc/paper_files/paper/2024/hash/97091a5177d8dc64b1da8bf3e1f6fb54-Abstract-Datasets_and_Benchmarks_Track.html)
- Anthropic 的一方实践明确区分 predefined workflow 与 model-directed agent，并建议从最简单方案开始；复杂 framework 会增加调试遮蔽和过度设计风险。[Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)

这些证据不证明“Agent 永远不能用”，而是支持：**先交付可验证 workflow，再按任务级 eval 逐步放宽模型自主权。**

---

## 1. 术语与所有权冻结建议

### 1.1 六类状态不能混为一个 `memory`

| 对象 | Owner | 生命周期 | 进入模型的方式 | 能否直接改变 Trip |
| --- | --- | --- | --- | --- |
| `TripState` | Trip domain | 版本化、持久、用户可见 | 只投影当前任务所需 slice | 只有确认后的 `TripPatch` |
| `WorkingTripContext` | Turn/Trip orchestration | 当前 trip/session | 本轮 ContextPlan 选择 | 否 |
| `ConversationLog` | Conversation domain | append-only + retention | recent turns / on-demand raw retrieval | 否 |
| `ConversationSummary` | Conversation projection | 可重建、版本化 | 作为摘要，不当事实权威 | 否 |
| `MemoryCandidate` | Memory domain | pending/rejected/expired | 默认不用于硬过滤 | 否 |
| `ConfirmedMemory` | Memory domain + user control | confirmed/paused/deleted/superseded | 按 scope、scene、freshness 检索 | 否，只影响排序/Proposal |

### 1.2 RAG、Memory、Tool 和 Context 的职责

```text
RAG       = 检索经过资格控制的外部/编辑知识
Memory    = 检索用户自身经过生命周期控制的偏好、约束和历史洞察
Tool      = 查询或执行仍在变化的外部/确定性能力
TripState = 这趟旅行已确认的唯一业务状态
Context   = 本次模型调用实际看到的最小组合，不是新的数据库
```

### 1.3 Function Call 与 Tool 的区别

- **Function/tool calling protocol**：模型返回一个结构化调用建议。
- **Tool registry**：应用允许模型看见的能力目录及 schema。
- **Policy gateway**：认证、授权、scope、预算、许可、TTL、风险与是否需要确认。
- **Executor/adapter**：真正调用数据库/API/服务。
- **Receipt**：记录输入摘要、provider、policy、时间、结果/错误、freshness 和影响。

模型 function call 只是控制链中一个不可信输入，不是执行授权。

---

## 2. 旅行领域一手证据

### T-01 TravelPlanner：旅行计划是约束与工具 benchmark，不是文案 benchmark

- **来源：** [TravelPlanner，ICML 2024](https://proceedings.mlr.press/v235/xie24j.html)、[项目/海报页](https://icml.cc/virtual/2024/poster/33227)、[arXiv](https://arxiv.org/abs/2402.01622)
- **来源声称：** benchmark 含 sandbox、多类工具、近 400 万数据、1,225 条规划意图；评价环境约束、常识约束和硬约束。论文报告当时最强系统的 final pass 很低。
- **限制：** 冻结数据与 2024 模型结果不能外推到 2026 模型；benchmark 不覆盖 VP 的中国入境、五语、证据许可、用户确认和实际 UI。
- **VP 相关性：** 建立独立 `PlanConstraintEval`，不能只评回答流畅度。关键指标至少包括 hard constraint pass、commonsense pass、budget/time/geography feasibility、tool sufficiency、proposal diff correctness。

### T-02 TP-RAG：轨迹级参考能改善时空合理性，但检索结果有冲突和噪声

- **来源：** [TP-RAG，EMNLP 2025](https://aclanthology.org/2025.emnlp-main.626/)、[arXiv](https://arxiv.org/abs/2504.08694)
- **来源声称：** 数据集含 2,348 个真实查询、85,575 个细粒度 POI、18,784 条轨迹参考；论文实验认为参考轨迹改善空间效率与 POI 合理性，同时指出 conflicting references/noisy data 带来的 universality/robustness 问题。
- **限制：** 轨迹来源、城市分布、文化和许可条件不自动适用于中国入境旅行；论文的 EvoRAG 收益不是 VP 的线上证明。
- **VP 相关性：** 可以建立 `RoutePattern/TrajectoryCandidate`，但只能作为规划先验或 Guide candidate；必须重新绑定 Canonical POI、开放时间、当前交通、用户节奏和可访问性，不能晋级为 Fact 或直接写 Canvas。

### T-03 TravelAgent：Memory + Tool + Recommendation + Planning 是可研究结构，不是生产证明

- **来源：** [TravelAgent arXiv:2409.08069](https://arxiv.org/abs/2409.08069)
- **来源声称：** 系统拆为 Tool-usage、Recommendation、Planning、Memory，并用 short-term/long-term memory 支持个性化。
- **限制：** arXiv 预印本；论文的 simulated/human evaluation 与产品数据治理、删除权、误记忆率和跨场景污染不是同一问题。
- **VP 相关性：** 支持模块分离，但长期 Memory 不能由模型自动持续学习。VP 应增加 candidate/confirm/reject/pause/forget/supersede 和 scene scope。

### T-04 TravelPlanner+：个性化计划需要单独评估 user model 的作用

- **来源：** [Personal Large Language Model Agents: A Case Study on Tailored Travel Planning，EMNLP Industry 2024](https://aclanthology.org/2024.emnlp-industry.37/)
- **来源声称：** 研究把 personalized user model 加入 TravelPlanner，并比较 generic/personal plans。
- **限制：** 包含 LLM-as-a-Judge，不能取代确定性 constraint checks 和真实用户选择；个性化得分不等于用户允许持久化。
- **VP 相关性：** Memory eval 应做 paired test：相同 trip input 在有/无正确 memory、错误 memory、过期 memory 下的排序与解释差异。

### T-05 Google AI Mode Canvas：产品形态验证，不是架构或质量证明

- **来源：** [Google：New ways to plan travel with AI in Search](https://blog.google/products-and-platforms/products/search/agentic-plans-booking-travel-canvas-ai-mode/)、[Canvas 使用说明](https://blog.google/products-and-platforms/products/search/tips-prompts-ai-mode-canvas-travel-planning/)
- **来源声称：** Canvas 将 flights/hotels、Maps、web 信息和持续 follow-up 组织在可保存的 itinerary side panel；预订结果先展示选项并通过 partner link 完成。
- **限制：** Google 没有公开其内部 orchestration、RAG、Memory 或 eval；产品覆盖、数据权利和基础设施与 VP 不可比。
- **VP 相关性：** 支持 Chat + persistent Canvas 的产品方向，也支持“先比较/组织，最终动作保持用户控制”；不支持复制其数据或假设其可靠性。

---

## 3. RAG：需要，但不是统一答案

### R-01 原始 RAG 的能力边界

- **来源：** [Lewis et al., NeurIPS 2020](https://proceedings.neurips.cc/paper/2020/hash/6b493230205f780e1bc26945df7481e5-Abstract.html)
- **来源声称：** RAG 把参数模型与显式非参数索引结合，在论文研究的知识密集任务上改善结果，并提供更新知识与 provenance 的路径。
- **限制：** 论文使用 Wikipedia/dense retrieval 与特定任务；不解决内容许可、文档资格、过期、权限、召回失败、错误引用或工具实时性。
- **VP 相关性：** RAG 是 `ReviewedFact/Guide -> RetrievalUnit` 的消费投影，不是知识真相层。

### R-02 RAG 应分解评估，而不是只打一个答案分

- **来源：** [RAGAS，EACL 2024](https://aclanthology.org/2024.eacl-demo.16/)
- **来源声称：** reference-free metrics 分别评估 context relevance、faithfulness 和 answer quality。
- **限制：** 自动 judge 自身会错；reference-free 不能证明高风险 claim；论文是 system demo。
- **VP 相关性：** 可作为开发反馈，不作为发布红线唯一裁判。Payment/Entry/Rescue 仍需 typed claim validator 和人工 gold set。

### R-03 自动 RAG judge 仍需要少量人工标注来校准

- **来源：** [ARES，NAACL 2024](https://aclanthology.org/2024.naacl-long.20/)
- **来源声称：** 用 context relevance、answer faithfulness、answer relevance 三个 judge，并通过 prediction-powered inference 与少量 human annotations 产生评估和区间。
- **限制：** 论文任务和数据不等于 VP；synthetic data/judges 可能继承 domain blind spot。
- **VP 相关性：** VP 不应做“零人工标注的自动 RAG 验收”。每种语言/scene/风险层建立人工 gold/qrels 和置信区间。

### R-04 Self-RAG/CRAG 是候选策略，不是默认生产要求

- **来源：** [Self-RAG，ICLR 2024](https://research.ibm.com/publications/self-rag-learning-to-retrieve-generate-and-critique-through-self-reflection)、[CRAG arXiv:2401.15884](https://arxiv.org/abs/2401.15884)
- **来源声称：** Self-RAG 研究按需 retrieval 与 reflection tokens；CRAG 研究对 retrieval 质量做评估和纠正。
- **限制：** 通常涉及特定训练/模型或额外调用；自评不能证明真实正确；延迟与成本增加。
- **VP 相关性：** 首发用 deterministic query mode、exact/metadata filter、hybrid retrieval、rerank、citation validator。只有失败簇证明 query rewrite/second retrieval 有增益，才加入 bounded corrective pass。

### R-05 Uber EAg-RAG：先修文档/metadata/hybrid，再增加 agent 步骤

- **来源：** [Uber Enhanced Agentic-RAG](https://www.uber.com/ca/en/blog/enhanced-agentic-rag/)
- **来源声称：** Uber 在 40+ 安全/隐私文档和 100+ SME golden queries 上，先改善结构化文档抽取、table-aware chunking、metadata，再加入 query optimizer、source identifier、BM25 + vector 与去重/重排；其案例报告 acceptable answers 相对提高 27%，incorrect advice 相对下降 60%。
- **限制：** 一方工程博客只报告相对变化，未公开绝对分数、完整样本和可复现实验；其权限、语料和风险域不同。博客将 iterative Chain-of-RAG/self-critique 列为 future work，不是已验证能力。
- **VP 相关性：** 证明“更多 Agent”不是第一步。VP 应优先保证 source parsing、原子 Fact、metadata、eligibility、hybrid retrieval 和 gold set；query rewrite 只处理明确的 ambiguity/multi-hop 类。

### R-06 旅行 RAG 的推荐检索层次（架构推论）

```text
1. Scope/intent：exact entity | city discovery | comparison | scene/national | ambiguous
2. Deterministic eligibility：RLS、status、expiry、license、locale、surface、risk
3. Exact identity：Canonical POI/city/alias/source ID
4. Typed SQL filters：日期、城市、category、payment、language、accessibility
5. Lexical + vector：只在剩余 eligible units 内运行
6. Fusion/rerank：RRF + eval-gated reranker
7. Evidence pack：4–8 个原子 units，数量由 eval 决定
8. Claim validation：critical values 使用 typed claims；冲突/缺证据返回 unavailable
```

**关键推论：** 实时天气、航班状态、临时闭馆、路线 ETA 不写入长期 RAG；它们由 Tool 返回 TTL observation。Safe Phrase/紧急表达走 reviewed exact registry，不走普通语义检索。

---

## 4. Memory：从“会记住”改成“记得对、记得该记的、能忘掉”

### M-01 LongMemEval：Memory 至少包含五种独立能力

- **来源：** [LongMemEval，ICLR 2025](https://openreview.net/forum?id=pZiyCaVuti)、[论文 PDF](https://proceedings.iclr.cc/paper_files/paper/2025/file/d813d324dbf0598bbdc9c8e79740ed01-Paper-Conference.pdf)、[官方代码](https://github.com/xiaowu0162/LongMemEval)
- **来源声称：** 500 个精心设计的问题覆盖 information extraction、multi-session reasoning、temporal reasoning、knowledge updates、abstention；论文观察到商业助手和 long-context 模型在持续交互下明显退化，并把 memory 设计拆成 indexing、retrieval、reading。
- **限制：** benchmark 主要评问答记忆，不覆盖 consent、删除、跨用户隔离、推荐影响或旅行场景；公开排行榜可能有 harness/answer-model 差异。
- **VP 相关性：** Memory QA 不能只测 recall。必须测 update/supersession、time scope、contradiction、abstention、cross-trip/cross-user leak 和真实下游影响。

### M-02 MemGPT：分层 Memory 是解决上下文限制的一种研究设计

- **来源：** [MemGPT arXiv:2310.08560](https://arxiv.org/abs/2310.08560)
- **来源声称：** 通过类似操作系统的分层/virtual context 管理，把数据在有限上下文与外部存储间移动，并用 interrupts 管理控制流。
- **限制：** 论文的“memory tiers”是 agent runtime 机制，不定义产品数据权利、领域真相或用户确认；也不证明要采用 MemGPT/Letta。
- **VP 相关性：** 支持“active context 不等于所有持久状态”，但 VP 应由 ContextPlan 决定装载，长期 Memory 仍由领域 schema 和权限控制。

### M-03 Generative Agents：经验、reflection、retrieval 是生成行为的研究架构

- **来源：** [Generative Agents，UIST 2023/Stanford](https://hci.stanford.edu/publications/paper.php?id=482)、[arXiv](https://arxiv.org/abs/2304.03442)
- **来源声称：** 保存 experience stream、形成 higher-level reflections、动态检索并用于计划。
- **限制：** 目标是 believable simulation，不是对真实用户准确、安全、可撤销的个人画像；reflection 可能把推断放大成伪事实。
- **VP 相关性：** `reflection` 只能形成 `MemoryCandidate`/insight，不得自动成为 hard constraint。任何“用户总是……”必须可见来源、置信/适用场景和否定入口。

### M-04 MemoryBank：长期交互价值的研究线索，不是合规设计

- **来源：** [MemoryBank，AAAI 2024](https://ojs.aaai.org/index.php/AAAI/article/view/29946)
- **来源声称：** 使用长期记忆与遗忘/更新机制改善长期对话个性化。
- **限制：** 论文优化模型互动，不覆盖生产 privacy/RLS/retention；其心理学启发不能当作用户数据政策。
- **VP 相关性：** 可参考 decay/supersession，但真实 retention、删除和 purpose limitation 由产品/法务合同决定。

### M-05 VP Memory 数据模型建议（架构推论）

```ts
type TravelMemory = {
  id: string;
  ownerUserId: string;
  kind: "preference" | "hard_constraint" | "avoidance" | "ability" | "companion";
  value: unknown;
  source: {
    type: "explicit_user" | "confirmed_inference" | "imported_profile";
    conversationId?: string;
    turnId?: string;
  };
  scope: {
    mode: "global" | "trip_type" | "companion_group" | "trip";
    ref?: string;
  };
  status: "candidate" | "confirmed" | "rejected" | "paused" | "superseded" | "deleted";
  confidenceClass: "explicit" | "confirmed"; // 不使用模型自报百分比
  validFrom: string;
  validUntil?: string;
  supersedesId?: string;
  createdAt: string;
};
```

写入策略：

1. 用户明确说“以后不要给我推荐红眼航班”可形成 explicit preference，但 UI 仍允许查看/暂停/删除。
2. 单次行为、点赞、一次行程预算只形成 candidate 或 trip-scoped working state。
3. medical/allergy/mobility 等高风险信息必须显式确认、purpose-limited、最小化展示；不能由模型推断。
4. 冲突不是覆盖旧值：新值 `supersedes` 旧值并保留审计；检索只返回 current applicable memory。
5. 删除后必须从 memory projection、embedding、cache 和后续 context 中消失，并有可验证 purge evidence。

### M-06 Memory 应怎样进入排序与规划

- 硬约束：只有 explicit/confirmed 且当前 scope 适用时进入 deterministic constraint checker。
- 软偏好：影响候选排序，并在解释中显示“因为你曾确认……”。
- 推断 candidate：可用于向用户提问，不能静默过滤。
- 负面记忆：优先用于避免和风险提示，但要允许本次 trip override。
- 用户否定：立即影响本轮和之后 retrieval；不能只改变 UI badge。

---

## 5. Tool / Function Calling：模型选择意图，系统拥有执行权

### F-01 Toolformer/ReAct 支持工具增强，但不证明生产安全

- **来源：** [Toolformer，NeurIPS 2023](https://proceedings.neurips.cc/paper_files/paper/2023/hash/d842425e4bf79ba039352da0f658a906-Abstract-Conference.html)、[ReAct，ICLR 2023](https://openreview.net/forum?id=WE_vluYUL-X)
- **来源声称：** Toolformer 研究模型何时、如何调用 API；ReAct 研究交错 reasoning/action，让外部环境反馈帮助计划和异常处理。
- **限制：** benchmark/API 集合不等于 production authorization、side effects、idempotency、data licensing 或 prompt injection defense。
- **VP 相关性：** 使用 tool loop 的价值是“在需要时查询现实”，不是把领域控制权交给模型。

### F-02 BFCL：必须评估 no-tool、多调用和多轮，而不只看 JSON 解析

- **来源：** [Berkeley Function Calling Leaderboard](https://gorilla.cs.berkeley.edu/leaderboard)、[项目说明](https://sky.cs.berkeley.edu/project/berkeley-function-calling-leaderboard/)、[代码](https://github.com/ShishirPatil/gorilla/tree/main/berkeley-function-call-leaderboard)
- **来源声称：** BFCL 覆盖 single/multiple/parallel、multi-turn、多步和模型在无合适函数时不调用工具的能力，并报告 latency/cost。
- **限制：** live leaderboard 会变化；综合分不代表 VP 的 provider/version/schema；函数选择正确仍不代表结果事实正确或动作安全。
- **VP 相关性：** 每个实际模型 snapshot 做 VP-specific conformance：正确工具、正确参数、拒绝不存在工具、澄清缺字段、multi-turn state、tool result incorporation。

### F-03 ToolSandbox：状态依赖和信息不足是关键失败面

- **来源：** [Apple ToolSandbox](https://machinelearning.apple.com/research/toolsandbox-stateful-conversational-llm-benchmark)、[NAACL Findings 2025](https://aclanthology.org/2025.naacl-findings.65/)、[代码](https://github.com/apple/ToolSandbox)
- **来源声称：** stateful、conversational、on-policy tool execution 与动态 milestone evaluation 暴露 state dependency、canonicalization、insufficient information 等困难。
- **限制：** 虚拟手机工具环境不等于旅行 provider；user simulator 不能替代真实人。
- **VP 相关性：** 工具 eval 必须跑完整 turn trajectory：缺日期/城市/权限时是否澄清，旧结果是否过期，canonical POI 是否保持，失败重试是否重复 side effect。

### F-04 MCP 规范明确要求 consent、安全和不信任 tool metadata

- **来源：** [MCP Specification](https://modelcontextprotocol.io/specification/2025-11-25)、[Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)、[Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- **来源声称：** tool 输入/输出可用 JSON Schema；实现者需考虑用户 consent/control、privacy、tool safety；工具 annotations 默认不可信；authorization 使用 resource/audience binding 与 least privilege。
- **限制：** MCP 定义互操作协议，不替应用执行这些产品/安全规则；spec 在演进，Tasks 曾是 experimental，版本变化会带来迁移。
- **VP 相关性：** 内部 first-party tools 没有跨客户端互操作需求时，直接 typed interfaces 更小、更可审计。若将来接 MCP，放在 `ToolGateway` 后，不能让远端 server 直接进入 model/tool registry。

### F-05 VP Tool 安全执行管线（架构推论）

```text
Model tool intent
  -> canonical schema validation
  -> authenticated user/trip scope
  -> capability allowlist for this task
  -> license/purpose/region/TTL policy
  -> risk classification + confirmation requirement
  -> provider selection by deterministic router
  -> idempotent executor / read-only adapter
  -> normalized result + EvidenceReceipt
  -> result sanitizer (external text remains data)
  -> response/TripProposal composer
```

Tool contract 最小字段：

```ts
type ToolContract<I, O> = {
  name: string;
  version: string;
  effect: "read" | "proposal" | "external_write";
  inputSchema: unknown;
  outputSchema: unknown;
  requiredScopes: string[];
  allowedRiskClasses: string[];
  timeoutMs: number;
  maxAttempts: number;
  idempotency: "required" | "not_applicable";
  freshnessPolicy?: string;
  owner: string;
  fallback: "unavailable" | "reviewed_only" | "official_recheck";
};
```

首发策略：

- model-facing tools 少而语义区分明确；provider adapters 不直接暴露给模型。
- 外部查询默认 read-only；当前不提供购票/支付/取消/预订写工具。
- Trip 写入不是通用 tool：模型只创建 Proposal，用户确认后由 domain service applyPatch。
- retries 只对安全、幂等、已知 transient failure；validation/auth/policy/no coverage 不重试。
- 每个 run 有 tool/time/cost budget 和 loop upper bound；超限 honest unavailable/handoff。

---

## 6. Context Engineering：建立可测试的 `ContextPlan`

### C-01 长上下文不等于可靠上下文

- **来源：** [Lost in the Middle，TACL 2024](https://aclanthology.org/2024.tacl-1.9/)
- **来源声称：** 论文在其任务中观察到模型对长上下文中间位置的信息利用较差，表现随相关信息位置变化。
- **限制：** 模型持续进化，具体曲线不应外推到所有 2026 provider；但不能假设 1M context 消除注意力问题。
- **VP 相关性：** 不把全部聊天、全部 Trip、全城 POI、所有 tool descriptions 同时装入 prompt。

### C-02 Anthropic：Context Engineering 是每次 inference 的信息策展

- **来源：** [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- **来源声称：** context 包含 system instructions、tools、external data、history 等；上下文是有限资源，目标是最小高信号 token 集；just-in-time retrieval、compaction、structured notes 和 tool design 都属于 context engineering。
- **限制：** 一方经验，不提供 VP 的通用数值预算；Claude 的行为不能代表 DeepSeek/Qwen/Kimi/GLM。
- **VP 相关性：** 将 context routing 做成代码和 eval，不靠一个不断膨胀的 system prompt。

### C-03 推荐 `ContextPlan` 合同（架构推论）

```ts
type ContextPlan = {
  turnId: string;
  task: "chat_qa" | "trip_plan" | "trip_edit" | "poi_compare"
    | "today_recovery" | "translation" | "import_review";
  tripSlice: {
    version: number;
    dayIds?: string[];
    nodeIds?: string[];
    fields: string[];
  };
  constraints: {
    hardIds: string[];
    softPreferenceIds: string[];
    unresolved: string[];
  };
  memoryIds: string[];
  retrieval: {
    mode: string;
    scopeIds: string[];
    factTypes: string[];
    maxUnits: number;
  };
  tools: string[];
  liveObservationIds: string[];
  recentTurnIds: string[];
  summaryRevision?: string;
  exclusions: string[];
  budgets: { inputTokens: number; toolCalls: number; latencyMs: number; costClass: string };
};
```

生成方式：

1. deterministic task/risk/route rules 先固定必须/禁止上下文；
2. entity/Trip node exact resolution；
3. 只在低风险歧义上允许 LLM 提议额外 context needs；
4. Context assembler 逐通道取数据并保留 provenance；
5. Context validator 检查 cross-user、draft/expired、license、scope、token budget；
6. 记录实际装载 ID/版本，不记录敏感原文到通用 trace。

### C-04 按旅行决策类型装配

| 决策 | 必需上下文 | 默认排除 |
| --- | --- | --- |
| 选酒店 | trip dates/party/budget、关键地点、住宿偏好、typed hotel observations | 全城攻略、其他旅行历史全文 |
| 排一天路线 | 当日已确认节点、开放/预约 Facts、route ETA、节奏/行动能力 | 其他城市、无关聊天 |
| 降预算 | 当前预算分配、可替换节点、用户取舍偏好、价格 observation freshness | 全量 POI 描述 |
| 雨天恢复 | 当前时间/位置（经同意）、当日 Trip、weather observation、indoor candidates、不可移动预约 | 出发前探索过程 |
| POI Ask/Add | exact POI ID、eligible Facts、当前 Trip day/city、缺失 readiness | 卡片营销文案、全城市向量结果 |
| 图片/语音翻译 | 当前媒体 revision、目标语言、必要 safe phrase domain | 整个 Trip/Memory，除非用户明确需要 |

### C-05 Compaction 不是事实写入

- conversation summary 是 projection，保留 source turn IDs、revision、生成模型和覆盖范围。
- 硬约束/Trip node/confirmed memory 不只存在摘要中；始终从各自 domain truth 读取。
- summary 与最新 raw turns 冲突时，以用户原话/current domain state 为准，并重建 summary。
- compaction eval 覆盖遗漏、错误合并、否定反转、时间漂移、PII 扩散和 token/latency 收益。

---

## 7. LangChain / LangGraph：采用门，而不是信仰

### L-01 LangChain 官方定位与 VP 的错配点

- **来源：** [LangChain JavaScript overview](https://docs.langchain.com/oss/javascript/langchain/overview)
- **来源声称：** 提供统一 model interface、prebuilt agent architecture 与 integrations；当前 agents 构建在 LangGraph 上。
- **限制：** 官方便利性声明不证明多 provider 的所有方言、structured output、thinking、usage、cache、stream/error semantics 都等价；增加框架层会扩大依赖和调试面。
- **VP 相关性：** VP 已明确需要 provider adapter 作为“方言编译器”。首发引入 LangChain 可能与该职责重叠并隐藏差异，因此默认不采用。

### L-02 LangGraph 官方真正提供什么

- **来源：** [LangGraph overview](https://docs.langchain.com/oss/javascript/langgraph/overview)、[Persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)、[Interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)、[Functional API](https://docs.langchain.com/oss/javascript/langgraph/functional-api)
- **来源声称：** low-level agent orchestration；checkpoint/persistence、pause/resume、human-in-the-loop、streaming、time travel、fault tolerance；可独立于 LangChain 使用。Functional API 仍要求确定性恢复路径，并强调 side effect/task idempotency。
- **限制：** checkpoint 是 runtime state，不是领域真相；replay 会重新触发后续 LLM/API/interrupt；节点恢复可能重跑，side effect 仍需隔离与幂等。它不提供 VP 的 auth、license、Fact eligibility、Trip version invariant 或模型质量。
- **VP 相关性：** 只有当这些 runtime 能力是实际瓶颈时才值得引入。图形化展示、两三个 if/else 或一个 tool loop 不足以构成采用理由。

### L-03 一方行业案例不能证明框架普遍必要

- **来源：** [Uber Finch](https://www.uber.com/us/en/blog/unlocking-financial-insights-with-finch/)
- **来源声称：** Uber 使用 GenAI Gateway + curated data marts/semantic metadata + OpenSearch aliases + LangGraph supervisor/sub-agent sequence；分别评子 Agent、routing、end-to-end 和 regression。
- **限制：** Uber 的内部金融数据、规模、团队和基础设施与 VP 不同；文章没有证明若不用 LangGraph 会更差。可靠性同时来自 curated single-table marts、RBAC、golden queries 和 regression，不应只归因框架。
- **VP 相关性：** 可借鉴“域收缩 + alias metadata + 分层 eval + transparent progress”；不应照搬 supervisor/multi-agent 数量。

### L-04 LangChain/LangGraph 采用判定表

| 条件 | 直接 TypeScript workflow | LangGraph | 结论 |
| --- | --- | --- | --- |
| 单 turn、0–3 个明确步骤、无跨请求暂停 | 最简单 | 额外抽象 | 直接 TS |
| 固定 plan -> retrieve -> generate -> validate | 清晰、易测试 | 可表达但非必要 | 直接 TS |
| tool loop 需最多 2 次修复 | 显式 bounded loop 足够 | 非必要 | 直接 TS |
| 多个动态分支、需要查看中间 state/回放 | 自建成本开始上升 | 强项 | 先做 LangGraph spike |
| 用户批准后数小时/数日恢复同一 agent run | 需自建 checkpoint | interrupt/checkpointer 强项 | LangGraph 或 durable workflow 对比 |
| 后台任务的 retry/sleep/webhook，LLM 不是控制中心 | 需 job/workflow | 可做但 agent-specific | 更适合通用 durable workflow |
| 跨服务、关键业务、数日/数月、强恢复/高吞吐 | 单体自建风险高 | 可能但需评估部署 | Temporal 等 durable platform 对比 |

### L-05 VP 当前结论

1. **不在 Chat/Canvas R1–R3 前置安装 LangChain。**
2. **Turn Orchestrator 继续 plain strict TypeScript。** 每个阶段输入/输出是 domain contract，框架可替换。
3. **不把 conversation memory 托管给 LangGraph store。** thread checkpoint 可作为运行投影，Memory/Trip 仍在 Supabase/Postgres domain tables。
4. **允许一个隔离 LangGraph spike，但必须命中采用门：** 至少一个真实跨请求 interrupt/replay 场景；用相同 fixtures 与 plain TS baseline 比较 correctness、恢复、代码量、调试、延迟、成本、迁移/回滚。
5. **若 spike 失败，删除依赖。** 不保留“以后可能需要”的 runtime。

---

## 8. Durable workflow：用于会跨请求的工作，不用于所有对话

### W-01 Vercel Workflow 与当前栈的契合

- **来源：** [Vercel Workflow GA](https://vercel.com/blog/a-new-programming-model-for-durable-execution)、[开源仓库](https://github.com/vercel/workflow)、[WorkflowAgent 说明](https://vercel.com/kb/guide/what-is-workflowagent)
- **来源声称：** TypeScript workflow/step 可持久、重试、暂停/恢复，并支持 durable stream；Vercel 于 2026-04-16 宣布 Workflows GA。
- **限制：** 平台一方声明；运行/存储/region/价格、payload、versioning、local test、vendor lock-in 和 AI SDK compatibility 必须在 VP 账号实测。durable execution 不自动保证语义幂等和模型输出正确。
- **VP 相关性：** VP 已是 Next.js/TypeScript/Vercel 候选，因此适合做首个小型异步 spike，不代表每个 agent turn 使用 `WorkflowAgent`。

适合的 lanes：

- PDF/image import -> extract -> validate -> user review；
- knowledge candidate -> parse -> dedupe -> embed -> projection；
- OCR/ASR/TTS 超过 request 生命周期的媒体任务；
- external feed refresh、expiry invalidation、purge evidence；
- notification/recheck job；
- 未来真实 Human Handoff/partner callback。

不适合首发强行迁入：

- 普通低延迟 Chat turn；
- TripProposal pending（数据库状态已经足够，不需要挂起一个执行）；
- Explore search；
- 纯同步 exact Fact lookup。

### W-02 Temporal：更强跨服务 durable execution，也有更高采用成本

- **来源：** [Temporal Docs](https://docs.temporal.io/)、[官方架构](https://github.com/temporalio/temporal/blob/main/docs/architecture/README.md)、[TypeScript retries/timeouts](https://docs.temporal.io/develop/typescript/core-application)
- **来源声称：** event history/replay 恢复 workflow；workflow code 必须 deterministic，side effects 放 Activity，Activity 需幂等或明确不重试；支持 signals/timers/retries/long duration。
- **限制：** 引入独立平台、worker 和运维/云成本；developer model 与部署复杂度高于单体；不解决 agent correctness。
- **VP 相关性：** 只有当 VP 出现跨多服务、关键外部写、数日流程、大量并发且 Vercel Workflow 无法满足 SLO/region/control 时再评估，不作为当前前置。

### W-03 Workflow 不变量

不管采用哪个 runtime：

- 每个 side-effect step 有 idempotency key；
- retry policy 按错误类型，非笼统重试；
- model/provider/prompt/tool/schema/policy version 在 run 开始时绑定，恢复时不得静默换语义；
- user/trip/auth scope 每次执行重新验证，不能只信旧 checkpoint；
- cancel/timeout/deploy/replay 有 fault-injection tests；
- run state 与 Trip/Memory/Fact truth 分离；
- workflow history 中敏感媒体/PII 最小化且有 retention/purge。

---

## 9. Human-in-the-loop、可靠性与安全

### S-01 HITL 是权限边界，不是“问一句你确定吗”

- **来源：** [OpenAI Practical Guide to Building Agents](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/)、[LangGraph Interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)
- **来源声称：** 对 repeated failure 和 high-risk/irreversible actions 应触发 human intervention；LangGraph 可 checkpoint 后等待恢复。
- **限制：** provider guidance 不定义 VP 风险；interrupt 机制只暂停，不保证审批者看到真实动作或有权限。
- **VP 相关性：** 确认 UI 必须展示目标对象、结构化参数、事实来源/TTL、Trip diff、外部影响、费用（若未来有）、可撤销性；批准绑定 proposal version/digest，不能批准模型摘要后执行另一组参数。

### S-02 AgentDojo：外部内容和 tool result 是不可信数据

- **来源：** [AgentDojo，NeurIPS 2024](https://proceedings.neurips.cc/paper_files/paper/2024/hash/97091a5177d8dc64b1da8bf3e1f6fb54-Abstract-Datasets_and_Benchmarks_Track.html)
- **来源声称：** prompt injection 可藏在工具返回的数据中，诱导 Agent 执行恶意任务；benchmark 覆盖 97 tasks、629 security cases。
- **限制：** benchmark 攻击/防御并非完整现实；某个防御在固定用例通过不代表自适应安全。
- **VP 相关性：** 网页、PDF、provider description、reviews、OCR text 都标记为 data；不进入 system/tool instruction；外部文本不能扩大 tool set/permissions。

### S-03 ToolEmu：高风险长尾需要 sandbox/fault simulation

- **来源：** [ToolEmu，ICLR 2024](https://proceedings.iclr.cc/paper_files/paper/2024/hash/7274ed909a312d4d869cc328ad1c5f04-Abstract-Conference.html)
- **来源声称：** 用 LM-emulated sandbox 扩展风险测试；论文人工核验认为 68.8% 被发现的失败可能是真实 agent failures，且其测试中最安全 agent 仍出现高风险失败。
- **限制：** emulator 和 evaluator 都可能错误；百分比只属于该研究设置。
- **VP 相关性：** 在接真实 provider 前先用 deterministic fake adapters + adversarial fixtures；emulated risk 只做发现，不替代真实 sandbox/staging。

### S-04 OWASP/NIST：生命周期治理与最小权限

- **来源：** [OWASP Agentic AI Threats and Mitigations](https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/)、[OWASP Excessive Agency](https://owasp.org/www-project-top-10-for-large-language-model-applications/2_0_vulns/LLM06_ExcessiveAgency.html)、[NIST AI RMF GenAI Profile](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf)
- **来源声称：** 识别 tool misuse、identity/privilege、prompt injection、data/privacy 等风险，并建议贯穿设计、测试、部署、监控的治理。
- **限制：** 通用框架不是法律意见或 VP 控制清单；需按产品数据流落地。
- **VP 相关性：** 每个 tool/rag/memory/workflow Issue 都要有 threat model、权限测试、日志脱敏、degraded/rollback 和生产观测 owner。

### S-05 Uber Agent Identity：生产多 Agent 的安全复杂度远高于“互相调用”

- **来源：** [Uber: Solving the Identity Crisis for AI Agents](https://www.uber.com/au/en/blog/solving-the-agent-identity-crisis/)
- **来源声称：** Uber 使用 agent registry、short-lived audience-bound tokens、actor chain、MCP Gateway policy enforcement 和 AI Gateway；强调调用者/代表用户/执行链的可审计归因。
- **限制：** Uber 的 Kubernetes/SPIFFE/STS 规模与 VP 不同；不能直接复制。
- **VP 相关性：** 反向证明首发不应拆成多个有身份和工具权的独立 Agent。若未来分 Agent，必须传播 authenticated user、trip、session、delegation、tool scope 和 actor chain，而不是共享 service key。

---

## 10. 其他垂类/产业架构的可迁移经验

### I-01 Uber Finch（金融）：可靠性来自域收缩和分层 eval，不只来自 LangGraph

- curated single-table data marts 降低 SQL 复杂度；semantic metadata/aliases 改善过滤；RBAC 控制访问；sub-agent、routing、end-to-end、historical regression 分层评测。[Uber Finch](https://www.uber.com/us/en/blog/unlocking-financial-insights-with-finch/)
- **给 VP：** 把世界空间先缩到 exact city/POI/Trip/scene，再让模型处理；每个 router/tool independently eval，最终仍跑完整旅行闭环。

### I-02 Uber GenAI Gateway（平台）：统一入口不等于抹平 provider 方言

- Uber 建立统一 Gateway、集中 security review、usage/budget 和多 provider access。[Uber GenAI Gateway](https://www.uber.com/us/en/blog/genai-gateway/)
- **限制：** 其 OpenAI-like interface 是平台选择，文章不证明所有 provider semantics 相同。
- **给 VP：** 支持集中 ModelGateway/telemetry/policy，但 adapter 仍保留 thinking/schema/stream/cache/error 方言。

### I-03 Airbnb Search（旅行）：retrieval、ranking 和 live query 是分层系统

- Airbnb 的搜索工程案例将 offline guest representation 与 online query/listing ranking 分离；embedding retrieval 是 candidate generation，不是最终排序。[Guest journey personalization](https://airbnb.tech/ai-ml/personalizing-airbnb-search-by-learning-from-the-guest-journey/)、[Embedding-Based Retrieval](https://airbnb.tech/ai-ml/embedding-based-retrieval-for-airbnb-search/)
- **限制：** 住宿 marketplace 排名不等于 POI RAG 或 itinerary planning。
- **给 VP：** Memory 影响 ranking features，不能直接越过 eligibility；vector retrieval 是候选层，最终排序/约束在确定性与评测层。

### I-04 Google Travel Canvas（产品）：持续状态和用户控制比一次回答更重要

- 组合实时搜索/Flights/Maps/web，允许 follow-up、保存与恢复；booking 先给 partner options。[Google Travel Canvas](https://blog.google/products-and-platforms/products/search/agentic-plans-booking-travel-canvas-ai-mode/)
- **给 VP：** Trip Canvas 应是 persistent workspace，Chat 是改变它的提议入口；当前不购买类服务时保持 handoff/official channel。

---

## 11. VP-V4 推荐运行时蓝图（证据推论，待 ADR）

```text
Browser / PWA
  -> Authenticated BFF
      -> Input/Media Gate
      -> Turn Orchestrator (plain TypeScript, request-scoped, bounded)
          1. resolve task/risk/entities
          2. load Trip slice + confirmed Memory
          3. build and validate ContextPlan
          4. exact/hybrid knowledge retrieval and/or read-only tools
          5. one primary model generation
          6. schema/claim/constraint/proposal validation
          7. AssistantTurn + optional TripProposal
      -> Trip Domain (versioned proposal/confirm/patch)
      -> Knowledge/RAG Domain (eligible projection)
      -> Memory Domain (candidate/confirmed lifecycle)
      -> Tool Gateway (policy/router/adapters/receipts)
      -> Workflow Lane (only long-running jobs)
      -> Telemetry/Eval (trace IDs, no raw sensitive default)
```

### 11.1 Turn state machine

```text
RECEIVED
 -> POLICY_CHECKED
 -> CONTEXT_PLANNED
 -> CONTEXT_READY | NEEDS_CLARIFICATION | UNAVAILABLE
 -> MODEL_RUNNING
 -> VALIDATING
 -> ANSWER_READY | PROPOSAL_READY | SAFE_FALLBACK
 -> STREAMED/COMMITTED
```

- 状态转换由代码控制，不让模型自己宣称阶段完成。
- `NEEDS_CLARIFICATION` 是成功状态，不是异常。
- validation repair 最多一次且只修结构；事实/约束错误回到 retrieval/clarification 或 unavailable。
- provider fallback 重新生成时绑定同一 context/evidence/schema revision 并重新全量验证。

### 11.2 Bounded tool policy

| 任务 | 默认 tool 上限 | 是否允许循环 | 终止条件 |
| --- | ---: | --- | --- |
| fact Q&A | 0–1 | 否 | evidence pack 或 unavailable |
| POI comparison | 0–2 并行 reads | 否 | 两边 canonical/evidence 完整 |
| trip day proposal | route/weather 等 0–3 reads | 最多一次补缺 | constraints checked + proposal valid |
| Today recovery | 0–3 reads | 最多一次 fallback | current conditions + safe proposal |
| import/extraction | workflow steps | 不由 chat agent 自由循环 | extraction/review state machine |

### 11.3 不采用“九个 Agent”

首发只需要一个用户可见 VisePanda AI。内部 `intent parser / retriever / planner / validator / composer` 是模块或 prompt profiles，不自动成为有独立 Memory、工具权限和循环的 Agents。只有以下条件同时成立才拆 Agent：

1. 独立目标和终止条件；
2. 独立 eval 显著优于模块化 workflow；
3. 接口、权限、context 和失败责任可冻结；
4. trace 能还原 delegation；
5. 成本/延迟仍满足接受门。

---

## 12. 评测体系：框架采用和模型采用都由同一证据门控制

### 12.1 Gold corpus 维度

```text
五语：zh/en/es/ru/ar
x 六个执行时刻：Plan/Entry/Payment/Move/Communicate/Rescue
x 五种检索模式：exact/discovery/comparison/scene/ambiguous
x 风险：low/medium/high
x 状态：current/expired/conflict/missing/unauthorized
x 旅行阶段：pre-trip/on-trip/recovery
```

### 12.2 RAG eval

| 层 | 指标 | 关键红线 |
| --- | --- | --- |
| eligibility | draft/private/expired/prohibited leak | 0 |
| entity | canonical POI/city resolve、ambiguity clarification | high-risk wrong ID = 0 |
| retrieval | Recall@k、Precision@k、MRR/nDCG，按语言/scene 分层 | average 不能掩盖高风险失败 |
| evidence | correct receipt/citation、freshness/conditions | wrong citation ID = 0 |
| generation | faithfulness、answer relevance、abstention | unsupported critical claim = 0 |
| operations | p50/p95、tokens、cost、cache、fallback | 先 baseline 后设门 |

### 12.3 Memory eval

- correct recall / false recall / no-memory abstention；
- single-session、multi-session、temporal、update/supersede；
- scene scope：solo/family/business 等不可互相污染；
- cross-user/cross-trip leakage = 0；
- reject/pause/delete 后下一 turn 与 projection 真正不再使用；
- wrong memory adversarial test：系统是否解释冲突并询问，而不是迎合；
- downstream effect：正确 memory 是否提高选择/constraint pass，而不是只会复述。

### 12.4 Tool/function eval

- correct tool / no tool / missing tool；
- argument validity + semantic correctness；
- insufficient information -> clarification；
- canonical ID 和 state dependency；
- parallel/multi-step；
- timeout/retry/cancel/provider error；
- idempotency/replay，不重复 side effect；
- prompt injection in tool result；
- permission/license/region denial；
- tool budget/loop termination。

### 12.5 Planning/Canvas eval

- Trip version/baseVersion；
- hard constraints、budget、time window、travel duration、opening/booking；
- proposal diff 与用户请求一致；
- 不相关节点保持不变；
- 未确认写入 = 0；
- stale fact/observation 标记 recheck；
- edit/reject/conflict/reload；
- route/trajectory quality 与 fallback。

### 12.6 Context eval

- required evidence/state coverage；
- irrelevant/duplicate token ratio；
- summary omission/negation reversal/time error；
- stale/draft/private/prohibited context leak = 0；
- context length vs task acceptance、latency、cost 的 paired test；
- raw full-history baseline vs ContextPlan baseline；
- 各 provider 同一 context pack 的 sensitivity。

### 12.7 Runtime/workflow eval

- crash after each step；
- deploy/version change during pending run；
- resume/cancel/timeout；
- duplicate webhook/tool result；
- human approval digest mismatch；
- provider failure and retry class；
- auth revoked while workflow paused；
- retention/purge；
- trace replay without re-executing external write。

---

## 13. 分阶段开发建议（供主报告/Issue 拆解使用）

### Phase A：合同和离线 eval，禁止先装通用框架

1. `ContextPlan`、`ToolContract`、`ToolReceipt`、`TravelMemory`、`ConversationSummary` 合同。
2. `ConstraintSet/ConstraintViolation` 与 deterministic Plan checker。
3. 从 Early Access fixtures + TravelPlanner/TP-RAG 思路建立 VP gold corpus，所有内容标 fixture/许可。
4. plain TypeScript orchestration baseline；所有 adapter 用 deterministic fake。

### Phase B：Grounded single-turn closed loop

1. exact ID + eligible Fact retrieval；
2. 一家主模型 + 一家 fallback；
3. read-only tools；
4. `AssistantTurn/TripProposal -> confirm -> TripPatch`；
5. RAG/tool/plan/security eval。

### Phase C：Memory MVP

1. explicit user memory only；
2. candidate/confirm/reject/pause/delete；
3. trip type/companion/trip scope；
4. source receipt + impact explanation；
5. LongMemEval-inspired update/temporal/abstention tests + privacy tests。

### Phase D：Context optimization and bounded corrective retrieval

1. task-specific ContextPlan router；
2. raw turns + summary projection；
3. query rewrite/corrective second pass 只对已证失败簇；
4. token/latency/quality paired eval；
5. 不默认 self-critique/multi-sample。

### Phase E：Durable workflow pilot

1. 选择一个真实长任务（推荐 private guide import 或 knowledge projection rebuild）；
2. plain DB/job baseline vs Vercel Workflow spike；
3. crash/resume/idempotency/version/region/cost 测试；
4. 接受后只在 workflow lane 使用；失败则删除依赖。

### Phase F：LangGraph decision gate（可能永远不需要）

仅当已有真实需求同时包含 dynamic branching、跨请求 interrupt、state inspection/replay，且 plain workflow 明显变复杂，才做 LangGraph Functional API pilot。不得用“以后会做 Agent”作为理由。

---

## 14. 需要加入 Issue 规划的研究/合同工作（不在本轮创建）

1. `CTX-00` ContextPlan Contract、assembler、validator 和 trace receipt。
2. `MEM-00` Memory lifecycle/consent/scope/RLS interface baseline。
3. `MEM-EVAL` temporal/update/abstention/leak/impact suite。
4. `TOOL-00` Tool Registry/Policy Gateway/Receipt/Idempotency baseline。
5. `TOOL-EVAL` BFCL/ToolSandbox/AgentDojo-inspired conformance suite。
6. `PLAN-EVAL` constraint/time/geo/budget/proposal benchmark。
7. `RAG-EVAL-02` 按五语/scene/risk/empty/conflict/expiry 分层的 qrels + human calibration。
8. `WORKFLOW-SPIKE` 一个长任务的 plain baseline vs Vercel Workflow。
9. `LANGGRAPH-DECISION` 仅在采用门出现后创建；当前不应直接变成实现 Issue。
10. `AI-SEC-AGENT` indirect prompt injection、excessive agency、approval digest、tool result data boundary。

父级 Issue 必须避免把以上工作重复叠加到已有 ModelGateway/RAG/Memory/Tool/Today 任务；最终拆解应先做现有 Issue 覆盖矩阵，再决定新增还是补强 acceptance。

---

## 15. Adoption ADR 应回答的问题

### 15.1 LangChain ADR

- 具体减少哪些已测代码/集成成本？
- 是否保留 provider-specific request/response/usage/error/stream 观测？
- 是否改变 canonical schemas、retry 或 model routing？
- framework update/rollback、bundle/runtime、security ownership 是什么？
- 与 direct SDK baseline 的 acceptance/latency/cost/debug 对比？

### 15.2 LangGraph ADR

- 哪个真实流程需要 checkpoint/interrupt/replay？
- graph state 与 Trip/Memory/Conversation truth 的边界？
- replay 哪些节点，side effects 如何幂等？
- checkpointer RLS/retention/region/backup？
- framework unavailable 时如何降级/迁出？

### 15.3 Durable workflow ADR

- 为什么任务不能在 request/job/cron 内完成？
- pause 时长、事件、retry、timeout、cancel、SLO？
- semantic versions（model/prompt/tool/policy/context）如何绑定？
- 运行数据的 region、encryption、retention、cost？
- plain baseline、Vercel Workflow、Temporal 的真实测量？

### 15.4 MCP ADR

- 哪个跨客户端/第三方互操作需求不能由内部 typed API 满足？
- server trust/onboarding、tool allowlist、auth scopes、audience、consent UI？
- remote tool schema/annotation 如何验证和版本固定？
- prompt injection、token passthrough、task/result isolation 如何测试？

---

## 16. Source ledger 汇总

| ID | 一手来源 | 来源拥有的结论 | 不能证明 |
| --- | --- | --- | --- |
| T1 | [TravelPlanner](https://proceedings.mlr.press/v235/xie24j.html) | 工具与多约束旅行规划 benchmark | 2026 模型/VP 生产质量 |
| T2 | [TP-RAG](https://aclanthology.org/2025.emnlp-main.626/) | 轨迹检索对时空规划的实验价值及噪声问题 | 中国场景许可/可迁移性 |
| T3 | [TravelAgent](https://arxiv.org/abs/2409.08069) | Tool/Recommendation/Planning/Memory 研究系统 | 生产隐私和长期可靠性 |
| T4 | [TravelPlanner+](https://aclanthology.org/2024.emnlp-industry.37/) | user model 对个性化规划的研究 | consent 与确定性正确性 |
| T5 | [Google Travel Canvas](https://blog.google/products-and-platforms/products/search/agentic-plans-booking-travel-canvas-ai-mode/) | 持续 Canvas + 实时来源 + partner handoff 产品形态 | 内部架构、数据可复制性 |
| R1 | [Original RAG](https://proceedings.neurips.cc/paper/2020/hash/6b493230205f780e1bc26945df7481e5-Abstract.html) | 参数/非参数记忆结合 | eligibility、安全、实时性 |
| R2 | [RAGAS](https://aclanthology.org/2024.eacl-demo.16/) | RAG 分维自动评测 | 高风险发布证明 |
| R3 | [ARES](https://aclanthology.org/2024.naacl-long.20/) | 小量人工校准的自动评测 | VP 域自动迁移 |
| R4 | [Self-RAG](https://research.ibm.com/publications/self-rag-learning-to-retrieve-generate-and-critique-through-self-reflection) | 按需检索/反思研究 | 默认生产收益 |
| R5 | [CRAG](https://arxiv.org/abs/2401.15884) | retrieval correction 研究 | VP 延迟/质量收益 |
| R6 | [Uber EAg-RAG](https://www.uber.com/ca/en/blog/enhanced-agentic-rag/) | 文档、metadata、hybrid 和 agentic preprocessing 的一方案例 | 普遍/绝对收益 |
| M1 | [LongMemEval](https://openreview.net/forum?id=pZiyCaVuti) | 长期 Memory 五种能力与退化 | privacy/consent/推荐影响 |
| M2 | [MemGPT](https://arxiv.org/abs/2310.08560) | virtual context/memory tiers | 产品 Memory 真相模型 |
| M3 | [Generative Agents](https://hci.stanford.edu/publications/paper.php?id=482) | experience/reflection/retrieval 架构 | 真实用户偏好准确性 |
| M4 | [MemoryBank](https://ojs.aaai.org/index.php/AAAI/article/view/29946) | 长期对话记忆研究 | 合规与 RLS |
| F1 | [Toolformer](https://proceedings.neurips.cc/paper_files/paper/2023/hash/d842425e4bf79ba039352da0f658a906-Abstract-Conference.html) | 模型学习何时/如何调用 API | 执行安全 |
| F2 | [ReAct](https://openreview.net/forum?id=WE_vluYUL-X) | reasoning/action 交错 | 权限/幂等/可靠终止 |
| F3 | [BFCL](https://gorilla.cs.berkeley.edu/leaderboard) | 多种 function-calling 能力评测 | VP-specific 正确性 |
| F4 | [ToolSandbox](https://aclanthology.org/2025.naacl-findings.65/) | 多轮有状态工具评测 | 真实旅行 provider 质量 |
| F5 | [MCP Spec](https://modelcontextprotocol.io/specification/2025-11-25) | 工具互操作与安全原则 | 自动安全执行 |
| C1 | [Lost in the Middle](https://aclanthology.org/2024.tacl-1.9/) | 长上下文位置/利用问题 | 所有 2026 模型曲线 |
| C2 | [Anthropic Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | 最小高信号 context 实践 | 通用 token 数字 |
| L1 | [Anthropic Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) | workflow/agent 区分和先简后繁 | VP 的最终 runtime 选择 |
| L2 | [LangChain](https://docs.langchain.com/oss/javascript/langchain/overview) | prebuilt agents/integrations | 多 provider 完全同义 |
| L3 | [LangGraph](https://docs.langchain.com/oss/javascript/langgraph/overview) | checkpoint/HITL/streaming/runtime | 领域正确性和权限 |
| W1 | [Vercel Workflow](https://vercel.com/blog/a-new-programming-model-for-durable-execution) | Vercel durable workflow GA 与能力 | VP 账号/region/cost 适配 |
| W2 | [Temporal](https://docs.temporal.io/) | event-history durable execution | 低采用成本或 AI correctness |
| S1 | [AgentDojo](https://proceedings.neurips.cc/paper_files/paper/2024/hash/97091a5177d8dc64b1da8bf3e1f6fb54-Abstract-Datasets_and_Benchmarks_Track.html) | indirect injection agent benchmark | 完整现实防御 |
| S2 | [ToolEmu](https://proceedings.iclr.cc/paper_files/paper/2024/hash/7274ed909a312d4d869cc328ad1c5f04-Abstract-Conference.html) | emulated sandbox 风险发现 | 真实执行验证 |
| S3 | [OWASP Agentic AI](https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/) | 威胁与缓解 taxonomy | VP 法律/完整控制设计 |
| S4 | [NIST AI 600-1](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf) | GenAI lifecycle risk profile | 项目具体门禁 |
| I1 | [Uber Finch](https://www.uber.com/us/en/blog/unlocking-financial-insights-with-finch/) | 金融 Agent 架构与 eval 案例 | LangGraph 普遍必要性 |
| I2 | [Uber GenAI Gateway](https://www.uber.com/us/en/blog/genai-gateway/) | 多 provider 统一入口案例 | 方言完全一致 |
| I3 | [Uber Agent Identity](https://www.uber.com/au/en/blog/solving-the-agent-identity-crisis/) | 多 Agent 身份/actor chain/policy gateway 案例 | VP 应复制其基础设施 |
| I4 | [Airbnb Search](https://airbnb.tech/ai-ml/personalizing-airbnb-search-by-learning-from-the-guest-journey/) | offline user representation + online ranking 分层 | 旅行 Agent/RAG 完整方案 |

---

## 17. 最终证据判断

1. **RAG、Memory、Tool 和 Context Engineering 都需要，但它们不是四个可互换的“Agent 插件”。** 它们有不同 owner、生命周期、权限、eval 和失败语义。
2. **VP 的关键创新应是受约束的 Trip state loop，而不是框架。** `ContextPlan -> Evidence/Observation -> TripProposal -> Confirm -> TripPatch` 是核心合同。
3. **LangChain 当前不需要；LangGraph 当前不应进入关键路径。** 它们只能通过真实 bottleneck + paired spike + rollback gate 获得采用资格。
4. **长时能力优先作为独立 workflow lane。** Vercel Workflow 因当前栈适合先做小型 spike；Temporal 是未来更强但更重的比较项。
5. **真正的 Memory 质量由错误记忆、更新、否定、删除和影响来衡量，不由“记住多少”衡量。**
6. **真正的 Tool 质量由 no-tool、澄清、canonical state、权限、幂等、攻击和终止来衡量，不由 JSON 合法率衡量。**
7. **Agentic RAG 不能先于知识质量和基础 retrieval。** Uber 的案例也先修结构化抽取、metadata、权限和 gold set。
8. **任何 runtime checkpoint 都不能成为第二 Trip/Memory/Fact 真相。** 框架可换，领域合同和审计 receipts 必须稳定。

本底稿应由主报告吸收后，再修订 Issue 拆解。未经 ADR/operator 接受，不应据此安装依赖、改变现有 Turn Orchestrator 或创建生产能力声明。

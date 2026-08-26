# VP-V4 VisePanda AI × Trip Canvas 产品逻辑优化升级报告

> 状态：proposed product-logic baseline
> 日期：2026-08-25
> Parent Program：[AI-00 / GitHub #2](https://github.com/JTCAO515/VP-V4/issues/2)
> 相关合同：AI-03、AI-06、AI-09、AI-10、AI-12
> Figma Board：[VisePanda VP-V4 Production Parity & AI-Canvas Upgrade Board](https://www.figma.com/board/pEPaqbirZ7Jkc7GinD1F5c)

## 0. 最终产品结论

VisePanda AI 不应被设计成“会生成行程的聊天机器人”，Trip Canvas 也不应被设计成“AI 回答旁边的一张行程表”。

正式产品应采用以下分工：

- **VisePanda AI 是旅行意图解释器、证据编排器和 Proposal 生成器。**
- **Trip Canvas 是唯一 Trip 状态、版本、确认和执行上下文。**
- **确定性系统负责事实资格、关键执行值、Patch、权限和持久化。**
- **用户是所有 Trip 变化的最终授权者。**

核心产品闭环：

```text
Understand -> Ground -> Propose -> Review -> Confirm -> Apply -> Execute -> Recover
```

任何功能如果不能回到该闭环，就不应进入 AI/Canvas 核心路径。

## 1. 当前产品逻辑的主要问题

### 1.1 Chat 与 Canvas 仍容易被理解成两个并列页面

正式产品需要建立更强的主从关系：

- Chat 是操作入口和解释层；
- Canvas 是用户可见的状态与决策层；
- Chat 不能在没有 Canvas Context 的情况下宣称已经修改行程；
- Canvas 的每个变化必须能回到 origin Turn、Evidence 和用户决定。

### 1.2 “行程生成”概念过重

用户的真实任务往往不是从零生成：

- 导入已有攻略；
- 调整一天；
- 比较两种交通；
- 替换一个闭馆地点；
- 降低步行或预算；
- 解释为什么现在需要复核。

产品应从 `generate itinerary` 升级为 `maintain an executable trip`。

### 1.3 AI 输出与执行事实容易混在一起

自然语言适合解释，关键执行值不适合自由生成。

| 内容 | Owner |
| --- | --- |
| 解释、取舍、澄清、摘要 | VisePanda AI |
| 地址、时间、金额、支付、入场、交通状态、Safe Phrase | GroundedClaim + deterministic renderer |
| Trip 改动 | TripProposal -> TripPatch |
| Fact eligibility | KnowledgeSystem / ExternalEvidenceResolver |
| 当前下一步 | TodayEngine |

### 1.4 Canvas 仍偏“文档”，不够像“旅行控制面”

Canvas 需要同时承载：

- 当前计划；
- 待确认变化；
- 约束与缺失；
- 预约/行动；
- 版本与来源；
- 当前上下文；
- 恢复方案。

它应是 Trip Control Plane，而不是漂亮的 itinerary renderer。

## 2. 新的核心对象模型

### 2.1 `TripIntent`

描述当前用户想解决的问题，不等于最终计划：

```ts
type TripIntent = {
  intentId: string;
  tripId?: string;
  goal: "create" | "adjust" | "compare" | "check" | "recover" | "explain";
  locale: Locale;
  constraints: ConstraintRef[];
  contextRefs: ContextRef[];
  unresolved: MissingInput[];
};
```

### 2.2 `TripWorkspace`

```ts
type TripWorkspace = {
  trip: TripSnapshot;
  headVersion: number;
  pendingProposalIds: string[];
  activeDayId?: string;
  activePlaceRef?: TripPlaceReference;
  currentContext: TripContext;
};
```

Workspace 是 Chat、Canvas、Today、Explore 和 Tools 的共享上下文入口，但各模块不能拥有自己的 Trip 副本。

### 2.3 `AssistantTurn`

一个有效 Turn 只能发布以下内容组合：

```text
Answer
Answer + Evidence summary
Answer + deterministic ExecutionCard
Answer + immutable TripProposal
Unavailable + missing reason + safe next action
```

`unavailable` 不能同时附带可执行 Claim 或 confirmable Proposal。

### 2.4 `TripProposal`

Proposal 是 AI 与 Canvas 的核心联动对象：

- pending revision 不可变；
- 每项 change 有 evidence、assumption、dependency 和 reason；
- 编辑、换方案、逐项选择都创建 child revision；
- confirm 时重新校验 actor、status、expiry、baseTripVersion 和 evidence eligibility；
- CAS 冲突全部回滚，不自动静默 rebase。

### 2.5 `CanvasProjection`

Canvas 不直接消费模型 JSON，而消费 Trip、Proposal、Evidence 和 Action 的投影：

```ts
type CanvasProjection = {
  tripVersion: number;
  timeline: TimelineProjection;
  placeView: PlaceProjection;
  actions: ActionProjection;
  proposalOverlay?: ProposalDiffProjection;
  recheckItems: RecheckProjection[];
};
```

## 3. 新的每轮产品协议

### 3.1 Stage 1：Understand

先判断任务类型和缺少的信息，不立即生成完整行程。

```text
message + Trip context + explicit profile
  -> goal / constraints / missing / risk / tool needs
```

规则：

- 一次最多提出 1～3 个真正阻塞的问题；
- 不重复询问已确认信息；
- 推断只作为假设显示；
- 对非关键偏好允许使用可撤销默认值。

### 3.2 Stage 2：Ground

根据任务选择最小证据路径：

1. Trip 当前状态；
2. 用户显式设置和已确认 Memory；
3. Canonical POI/Fact lexical or hybrid retrieval；
4. ExternalEvidenceResolver；
5. 用户已确认 Artifact；
6. 无证据则 unavailable。

不要为了“更聪明”向模型塞入所有聊天、所有 Canvas 和所有知识库内容。

### 3.3 Stage 3：Plan

TurnCoordinator 产生 `TurnPlan`：

```ts
type TurnPlan = {
  mode: "answer" | "card" | "proposal" | "unavailable";
  retrievalNeeds: ClosedEvidenceNeed[];
  modelTask?: ModelTask;
  deterministicCards: CardKind[];
  proposalPolicy?: ProposalPolicy;
  budget: TurnBudget;
};
```

### 3.4 Stage 4：Generate

模型只负责其擅长部分：

- 自然语言理解；
- 多约束取舍；
- 解释与摘要；
- 产生结构化 Proposal Draft；
- 对检索证据进行有引用的表达。

模型不负责：

- 决定 Fact eligible；
- 算最终金额/时间；
- 生成 Canonical POI ID；
- 应用 Patch；
- 调用支付、购买或真实外部动作；
- 把推断 Memory 写成 confirmed。

### 3.5 Stage 5：Validate

发布前依次执行：

```text
schema -> closed union -> evidence allowlist -> policy -> safety
-> dependency -> Trip base version -> locale/bidi -> renderer
```

结构错误可做一次受控修复；关键证据或权限失败不能通过换模型绕过。

### 3.6 Stage 6：Publish

Streaming 只发送：

- accepted；
- planning/retrieving/generating/validating phase；
- evidence progress；
- 完整验证后的 Answer/Card/Proposal。

不向 Canvas 流式输出未验证 JSON，也不公开 provider token delta。

## 4. Chatbot 的交互升级

### 4.1 从“对话历史”升级为“任务线程”

每个 Thread 需要：

- goal；
- linked Trip；
- active context；
- unresolved questions；
- proposal status；
- last stable outcome；
- recoverable event sequence。

聊天列表副标题不再使用虚构相对时间表达能力，而显示可操作状态：

```text
Waiting for your answer
Proposal ready
Conflict needs review
Data needs recheck
Completed
Unavailable
```

### 4.2 让每轮回答有明确结果类型

| Turn result | 主要 UI |
| --- | --- |
| `answer` | 文本 + 引用 |
| `card` | deterministic ExecutionCard |
| `proposal_ready` | 摘要 + Open Diff |
| `needs_input` | 1～3 个阻塞问题 |
| `unavailable` | 缺口 + 原因 + 官方/安全下一步 |
| `conflict` | 新旧版本差异 + 重新生成选择 |

### 4.3 输入区升级

Composer 不只是文本框：

- 当前作用域：整个 Trip / 某天 / 某节点 / 某 POI；
- 输入方式：文字、语音、图片、文件、链接；
- 显式提示：本轮可能产生 Proposal；
- 发送前显示附件隐私和处理范围；
- cancel 与 retry 对应同一 durable Turn。

### 4.4 反馈闭环

`Copy / Another option / This looks wrong` 应升级为：

- copy：纯客户端动作；
- another option：基于同一 constraints/evidence 创建新 Turn；
- inaccurate：记录 claim/fact/proposal 粒度反馈，不自动修改事实；
- reject proposal：记录结构化 reason；
- user correction：创建 UserArtifact 或 private candidate，等待资格流程。

## 5. Trip Canvas 的产品升级

### 5.1 四层视觉模型

Canvas 同时展示四层，但不能混成一组颜色：

1. **Current Trip**：已应用状态；
2. **Proposal Overlay**：待确认变化；
3. **Evidence/Assumptions**：支持与缺失；
4. **Execution State**：待办、recheck、completed、unavailable。

### 5.2 Timeline 升级

每个节点至少显示：

- local time + timezone；
- duration 和 transfer；
- current Trip state；
- evidence freshness；
- hard constraint impact；
- action/recheck status；
- origin Turn/Proposal。

时间冲突、跨城交通和硬约束不得只用自然语言 warning，必须成为可测试的 CheckResult。

### 5.3 Place View 升级

Place View 不是另一套地图数据，而是 Trip Place References 的投影：

- 精确 Canonical POI ID；
- 用户自定义地点保留 UserPlaceRef；
- 地点不存在或 Fact 过期时保留 Trip 节点，但显示 recheck；
- 路线可以降级为 schematic，不伪装 provider route；
- 点击地点时 Chat 自动进入该 POI scope。

### 5.4 Reservations & Actions

替代误导性的 Bookings：

- 用户票据；
- 预约要求；
- 官方渠道；
- 时刻表/状态卡；
- 准备事项；
- 已完成/需复核/不可用状态。

不产生订单，不显示未授权库存或价格。

### 5.5 Diff 升级

每个 change 展示：

- before/after；
- why；
- triggered by；
- evidence；
- assumption；
- dependency；
- risk/unknown；
- 是否会影响其他节点。

操作：

- accept/reject 单项；
- edit；
- another option；
- accept valid selection；
- close without change；
- conflict 时重新比较。

### 5.6 版本与回滚

版本不是下拉 Fixture，而是 append-only history：

- resulting version；
- actor；
- origin Proposal revision；
- applied change summary；
- EvidenceReceipts；
- audit event；
- rollback 产生新版本，不改写历史。

## 6. AI、Canvas 与其他产品面的联动

### 6.1 Explore

```text
Explore Ask -> exact POI ContextRef -> Chat
Explore Add -> immutable Proposal -> Canvas Diff
```

模型不得从卡片标题重新猜 POI。

### 6.2 Copilot Memory

```text
explicit User setting -> usable immediately
confirmed Memory -> usable with receipt
inferred Memory -> visible hypothesis, not hard constraint
rejected Memory -> excluded from future turns
paused Memory -> not retrieved
```

Canvas 必须能说明某项变化受哪条 Memory 影响。

### 6.3 Tools

Tool 结果只通过两种方式进入核心：

- `ExecutionCard`：只读执行信息；
- `TripProposal`：需要用户确认的 Trip 变化。

不允许 Tool 自建隐藏 Trip state。

### 6.4 Today

Today 不应调用一个通用 LLM“猜下一步”。

```text
Trip head + current time + eligible evidence + user state
  -> deterministic candidates
  -> eligibility/risk ranking
  -> one NextAction + why + alternatives
```

LLM 可以解释或生成恢复方案草稿，但不能决定最终关键值或自动应用。

## 7. 模型层优化

### 7.1 UI 不选择模型

Ask、Today、Explore 和 Tools 只提交 `ModelTask`，由 ModelGateway 根据任务、schema、风险、region、budget 和 provider health 路由。

### 7.2 首发策略

沿用现有模型层规划，不在本文重开 provider 决策：

- DeepSeek/Qwen 为 provisional baseline candidates；
- Kimi/GLM 保持 task-level eval challengers；
- Vision 走独立 capability route；
- OCR、ASR、MT、TTS 可以由不同专业能力组成；
- 不做四模型在线投票。

### 7.3 任务级路由

| Task | 建议模式 |
| --- | --- |
| intent/clarification | fast text baseline |
| structured Proposal | strict schema candidate + validator |
| grounded answer | retrieval pack + text baseline |
| complex async comparison | stronger async challenger if budget permits |
| OCR/image translation | OCR -> MT；Vision shadow |
| voice translation | ASR -> MT -> TTS；realtime challenger |

发布依据是 VisePanda Eval，不是供应商榜单或主观偏好。

## 8. Context 与 Memory 优化

每轮上下文按优先级装载：

1. 当前 user message；
2. active Trip/Day/Node/POI scope；
3. relevant pending Proposal；
4. explicit/hard constraints；
5. accepted recent turn summaries；
6. eligible evidence pack；
7. only then optional broader memory。

不要把完整聊天历史和完整 Canvas 重复塞入每轮 Prompt。Turn、Trip 和 Evidence 使用 ID/version refs，模型只得到本轮必要投影。

## 9. 核心 UX 状态机

```text
idle
 -> accepting
 -> planning
 -> needs_input | retrieving
 -> generating
 -> validating
 -> answer | card | proposal_ready | unavailable | failed | cancelled

proposal_ready
 -> reviewing
 -> revised | rejected | confirming
 -> applied | conflicted | expired
```

关键规则：

- terminal 后不再发业务事件；
- reconnect 只 replay，不重新调用模型；
- cancel 传播到 retrieval/provider；
- `TIMEOUT_AFTER_OUTPUT` 不把未验证内容保留为正式回答；
- conflict 不能显示“成功后稍后修复”。

## 10. 产品观测

### 10.1 用户结果指标

| Metric | 说明 |
| --- | --- |
| intent-to-proposal completion | 用户是否走到可审查 Proposal |
| proposal accept/edit/reject | Proposal 是否准确和可控 |
| clarification efficiency | 达到有效结果前真正必要的问题数 |
| grounded support rate | 重要 Claim 是否有 eligible receipt |
| unavailable honesty | 缺证据时是否正确降级 |
| conflict recovery completion | 版本冲突后是否恢复成功 |
| trip reload consistency | confirm 后 reload 是否一致 |
| next-action completion | Today 建议是否被完成或替换 |

### 10.2 质量指标

- schema validity；
- evidence precision/recall；
- red-line violations；
- stale fact leakage；
- direct-write attempts blocked；
- p50/p95 phase/answer/proposal latency；
- cost per accepted task；
- correction rate by task/provider/prompt/schema version。

## 11. 分阶段产品升级

### Slice A：Durable Core

一条真实链路：

```text
reviewed fixture -> fake/validated Turn -> Proposal
-> visible Diff -> confirm -> persisted Patch -> reload
```

### Slice B：Grounded Chat

真实模型只进入 Answer/Card，不扩大 Trip 写入权限。

### Slice C：Proposal Intelligence

模型产生 strict Proposal Draft，validator 和 TripWorkspace 决定是否可发布。

### Slice D：Knowledge/Explore

exact POI ID、eligible Fact、Ask/Add 联动。

### Slice E：Today/Recovery

从 Trip 和外部条件生成 NextAction 与恢复 Proposal。

### Slice F：Memory/Tools/Offline

完整长期使用能力和旅中降级。

## 12. 验收红线

- Chat 声称改动成功但 Canvas/Trip 未改变；
- Canvas 展示模型未验证的 JSON；
- pending Proposal 被后台补全或原地修改；
- 用户确认与 apply 分成可能永久不一致的两步；
- AI 生成 POI ID、Fact eligibility、金额或官方规则；
- User/Memory/Tool 直接覆盖 Trip；
- 同一节点在 Chat 与 Canvas 显示不同版本；
- unavailable Turn 携带执行 Claim；
- 断线重连重复收费或重复执行；
- rollback 改写历史；
- 用户无法知道某个变化为什么出现。

## 13. 推荐产品原则

1. Chatbot 负责思考和解释，Canvas 负责状态和决定。
2. 模型提出候选，确定性系统守住事实、权限和写入。
3. 用户确认的是明确 revision，不是模糊的“好”。
4. 每个关键值都能追到 receipt，每个变化都能追到 origin。
5. 无法确认是正常产品状态，不是需要用生成内容填满的空白。
6. Trip 始终只有一个当前版本，所有其他视图都是投影。
7. Today 只突出一个符合资格的下一步，并解释为什么。
8. Memory 可见、可否定、可暂停、可删除。
9. Tool 通过 Card/Proposal 接入，不建立隐藏状态。
10. 优化目标是 accepted task 的质量、稳定性和可恢复性，不是回答更长或模型更多。

## 14. 下一控制动作

1. 将本文作为 AI-51 parity contract 与后续 Chat/Canvas Issues 的 mandatory reading；
2. 先完成 #15 Canvas Diff/Confirm/Reload，建立真实视觉与持久化基准；
3. 在 #18 前冻结 `ModelTask`、`TurnPlan` 和 `AssistantTurn` consumer contract；
4. 为 Chat/Canvas 建立 11 场景 Eval/E2E corpus；
5. 所有新产品面只能通过 Evidence/Card/Proposal/Projection 接入核心。

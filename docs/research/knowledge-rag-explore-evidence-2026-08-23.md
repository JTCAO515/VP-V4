# VisePanda 知识库、RAG、Explore 与 Trip Canvas 联动证据底稿

- 核验日期：2026-08-23（Asia/Shanghai）
- 状态：**研究证据与架构建议，不代表功能已开发、数据已获许可、POI 已导入或内容已审核发布**
- 适用仓库：`JTCAO515/VP-V4`
- 历史仓库快照：`JTCAO515/VP-Final@b5ef081`（`main`）
- 配套基线：[模型层规划](../model-layer-plan.md)、[外部数据规划](../external-data-chatbot-plan.md)
- 研究边界：只核验知识/内容领域模型、RAG、外部来源导入、Explore 信息架构和 Chatbot/Trip Canvas 消费关系；不批量导入或生成 POI，不接生产 API，不读取密钥。

---

## 0. 结论先行

本文统一采用三段式术语，避免把导入、发布和页面展示混为一谈：

```text
外部来源文件/API/feed
  -> Imported POI Candidate（私有、保留来源/许可/locator 的候选）
  -> 人工消歧、证据检查、许可检查与明确晋级
  -> Canonical POI（唯一稳定 POI ID）
  -> Reviewed Facts / Reviewed Guides / Licensed Media
  -> Explore Projection / RAG Projection（可重建的消费投影）
```

核心结论：

1. **Explore 不是独立内容库。** Explore、Chatbot、Trip Canvas 和未来 SEO 必须共享同一组 Canonical POI / Fact IDs 与同一 eligibility 函数；Explore 只是读取投影。
2. **“批量导入 POI”不是“批量生成 POI”。** 外部导入只能创建 `ImportedPoiCandidate` 或 draft，不能让 AI 生成缺失字段，不能自动合并，不能自动变为 `reviewed`，也不能因行数多就自动创建公开页面。
3. **POI 身份与 POI 事实必须分离。** POI 只回答“这是哪个真实地点”；Apple Pay、Visa、外语服务、护照规则、无障碍入口等都应是原子、typed、带证据和 expiry 的 Fact。
4. **Capability 是 Fact 的确定性投影，不是另一个事实源。** 例如“适合 Low Mandarin”只能从仍有效的菜单/人员/设备/翻译服务 Facts 推导，并保留 supporting Fact IDs。
5. **RAG 首发不应把所有数据切成无类型文本。** 身份消歧与执行事实先走结构化过滤/精确查找；Guide 才按语义边界切 chunk。检索顺序建议为 metadata/eligibility filter -> lexical + multilingual vector -> RRF -> 可选 rerank -> citation/claim validator。
6. **当前规模先精确检索，不急于 ANN。** pgvector 默认 exact nearest-neighbor 保留完整 recall；HNSW/IVFFlat 用 recall 换性能，且过滤是在近似扫描后应用，可能少返回结果。只有固定 eval 和 p95 证明需要时才加 HNSW。[pgvector 官方文档](https://github.com/pgvector/pgvector#filtering)
7. **多语 embedding 候选更新为 `qwen3.7-text-embedding`。** 2026-08-23 的阿里云官方页列出 256–2560 维、128K 输入及 201 种语言/方言（含项目五语）；这是候选能力事实，不是 VisePanda 质量证明。[模型页](https://help.aliyun.com/zh/model-studio/qwen3-7-text-embedding)、[API/语种页](https://help.aliyun.com/en/model-studio/embedding)
8. **Google/高德不能作为自有 POI 库的默认导入源。** Google Maps 条款禁止抓取、索引、保存多类 Maps Content，并限制基于其内容生成衍生内容/TTS；高德条款禁止未经许可存储、缓存、抓取、翻译或二次包装相关内容。OSM 数据可在 ODbL 下复用，但必须归属/Share-Alike，生产不能滥用公共 Nominatim/tiles。[Google 条款](https://cloud.google.com/maps-platform/terms)、[高德条款](https://lbs.amap.com/pages/terms/)、[OSM 许可](https://www.openstreetmap.org/copyright)
9. **SEO 不能跟随候选数量自动扩张。** 无独特价值、缺少 current reviewed evidence 的 POI/筛选组合页保持 `noindex` 且不进 sitemap；Google 明确把无新增价值的大规模自动页面列为 scaled content abuse。[Google spam policy](https://developers.google.com/search/docs/essentials/spam-policies)、[`noindex` 规则](https://developers.google.com/search/docs/crawling-indexing/block-indexing)

---

## 1. 证据标签与边界

本文每类判断使用以下标签：

| 标签 | 含义 |
| --- | --- |
| **仓库事实** | 当前两个仓库代码/已接受 ADR 的真实状态 |
| **官方能力事实** | 官方文档、规范或产品条款当前明示的能力/限制 |
| **产品/架构建议** | 基于证据给 V4 的可逆方案，尚未接受为 ADR |
| **待实测/待决定** | 需要账号、样本、法务/合同或 operator 决策 |

外部产品页面只用于观察信息架构，不证明其数据可复制或许可可继承。

---

## 2. 两个仓库的真实基线

### 2.1 VP-V4

**仓库事实：** 当前 VP-V4 `main@2dec7b0` 仍是 frontend-only 产品预览。模型层规划已提出 `TripProposal -> Canvas confirm -> TripPatch`，外部数据规划已提出 `ReviewedFact / LiveObservation / EphemeralObservation / UserConfirmedArtifact / ExternalEntityRef`；当前不存在知识表、向量表、RAG runtime、Explore 页面或真实导入器。

因此第三步不能从“给现有 RAG 调参数”开始，必须先冻结领域契约和 eligibility。

### 2.2 VP-Final 可复用的不变量

**仓库事实：** 旧仓库已经实现或接受以下不变量：

- POI 类目是 `food / attraction / hotel / shopping / experience`；Fact 状态是 `draft / reviewed / deprecated / rejected`，并保留只读 legacy `active`。[schema](https://github.com/JTCAO515/VP-Final/blob/b5ef081/packages/domain/src/knowledge/index.ts#L3-L21)
- Fact 有 `poiId / factType / value / sourceClass / sourceLocator / evidenceSummary / verifiedAt / expiresAt / reviewPolicy / version / status`；仅 current `reviewed` 且证据、审核、期限全部合法时 eligible。[schema](https://github.com/JTCAO515/VP-Final/blob/b5ef081/packages/domain/src/knowledge/index.ts#L92-L109)、[eligibility](https://github.com/JTCAO515/VP-Final/blob/b5ef081/packages/domain/src/knowledge/index.ts#L338-L365)
- `payment_acceptance`、hours、booking、reservation、ticket availability 使用 30 天 volatile policy；未知 Fact 默认 90 天，稳定 `rainy_fit` 为 180 天。[policy](https://github.com/JTCAO515/VP-Final/blob/b5ef081/packages/domain/src/knowledge/index.ts#L76-L90)
- POI `searchAliases` 只用于 lexical lookup，不能使 Fact 获得事实资格。[POI schema](https://github.com/JTCAO515/VP-Final/blob/b5ef081/packages/domain/src/knowledge/index.ts#L212-L228)
- Scoped Facts 已区分 `poi / city / national / scene`，并按 POI -> city -> scene -> national 排序检索；这比把所有知识强挂 `poiId` 更适合 V4。[scoped facts](https://github.com/JTCAO515/VP-Final/blob/b5ef081/packages/domain/src/knowledge/scopedFacts.ts)
- Content AI 必须只产生 private typed Change Set；外部材料是不可信数据；模型只能从服务端给出的 bounded POI IDs 中选择；AI、user report、scrape 或 expired fact 不经人工复核不得公开/检索。[Content AI constraints](https://github.com/JTCAO515/VP-Final/blob/b5ef081/docs/constraints/content-ai.md#L6-L22)
- 旧导入器有固定 CSV header、1 MB/1000 行边界、dry-run/commit、source identity、collection status 和研究/审核字段。[bulk import](https://github.com/JTCAO515/VP-Final/blob/b5ef081/apps/server/src/modules/knowledge/bulkImport.ts#L43-L124)
- 实际 commit 总把导入 Facts 写成 `draft`，把审核采集信息放进 private audit；同 `collectionRowId + digest` 重放为 duplicate，内容变化为 conflict；POI 消歧同时看 ID、标准身份与稳定 source identity。[commit path](https://github.com/JTCAO515/VP-Final/blob/b5ef081/apps/server/src/db/knowledgeBulkImportService.ts#L35-L145)、[idempotency/disambiguation](https://github.com/JTCAO515/VP-Final/blob/b5ef081/apps/server/src/db/knowledgeBulkImportService.ts#L250-L407)
- 旧 Explore 已从 Knowledge service 取 POI，并在卡片展示 eligible Facts/复核日期与空状态；但详情链接仍通过静态 `INITIAL_POIS` 映射，说明列表数据与详情/SEO 尚未真正统一。[Explore loader](https://github.com/JTCAO515/VP-Final/blob/b5ef081/apps/web/src/app/explore/page.tsx)、[Explore projection](https://github.com/JTCAO515/VP-Final/blob/b5ef081/apps/web/src/app/explore/view.tsx#L24-L40)、[static detail mapping](https://github.com/JTCAO515/VP-Final/blob/b5ef081/apps/web/src/app/poiSeo.ts#L1-L17)
- 旧 SEO matrix 不是内容生成器：它只从 eligible Facts 派生页面候选，缺支撑则产生 gap。[SEO matrix](https://github.com/JTCAO515/VP-Final/blob/b5ef081/packages/domain/src/seo/index.ts#L99-L143)

### 2.3 不能原样移植的部分

**仓库事实 + 建议：**

1. `PoiFact.value` 仍是任意 `Record<string, unknown>`；Apple Pay、具体卡组织、服务语言、护照场景和无障碍设施需要 V4 的 discriminated typed values。
2. 旧 `derivePoiSceneTags` 通过少数 factType 直接映射五个英文标签，不能表达条件、负证据或多语服务细节。
3. 旧 bulk CSV 一行同时携带 POI 和一个 Fact，适合小批事实采集，不足以表达“外部 POI candidate -> 消歧 -> canonical promotion”的独立生命周期。
4. 旧 Explore 没有 city-first IA、搜索、排序、分页、完整筛选、同库详情页或 TripProposal CTA。
5. 旧仓库没有 `pgvector`、embedding、hybrid retrieval 或 rerank 实现；不能把规划术语写成已交付能力。

---

## 3. 知识/内容库领域分层

### 3.1 建议的对象边界

| 对象 | 唯一职责 | 可以包含 | 不能包含 |
| --- | --- | --- | --- |
| `ImportedPoiCandidate` | 私有外部导入候选 | source record ID、允许保留的原始字段、license policy、locator、digest、候选匹配 | public/reviewed 状态、模型补全、自动推荐 |
| `CanonicalPoi` | 稳定地点身份 | 唯一 ID、城市、主类目、名称/alias、许可允许的几何、source refs、merge lineage | 营业、支付、语言、票务等易变真相 |
| `Fact<T>` | 一个原子可证 claim | typed value、scope、evidence、review、expiry、version | 多个混合 claim、无来源摘要、模型 confidence 当证据 |
| `Scene` | 旅行者处境/需求分类 | stable key、label、适用条件、所需 fact/capability keys | 地点事实、实时值 |
| `Guide` | 人工编辑叙事 | scope、revision、locale、支持 Fact IDs、editorial blocks | 无支撑执行 claim、隐式事实副本 |
| `Media` | 有权展示的资产 | target ID、rights、attribution、alt/caption revision、crop、status | 仅凭图片推导的支付/服务事实 |
| `Capability` | 可消费的确定性能力投影 | key、state、supporting Fact IDs、validUntil、limits | 独立作者化事实、模型自报 confidence |
| `ExternalObservation` | 短时第三方观察 | provider、dataset、observed/retrieved/stale/expiry、policy | 冒充 reviewed Fact、跨期限写入 |
| `TripProposal` | 用户专属待确认变化 | baseVersion、POI refs、Fact/Observation receipts、diff、assumptions | 直接 Trip mutation、候选 POI 晋级 |
| `ExploreProjection` | 公开/登录态读模型 | Canonical POI + eligible facts/capabilities/media/guide 摘要 | 第二套 POI、复制出来的失控事实 |

### 3.2 四个知识 scope

继续采用旧仓库已验证的 scope，而不是要求每条内容都有 `poiId`：

- `national`：入境、支付准备、应急号码、通用网络与安全规则；
- `city`：机场/车站选择、城市交通、节假日影响、城市级执行建议；
- `scene`：payment、show-to-local、entry/booking、translate/communicate、network、rescue/human-help 等执行时刻；
- `poi`：某一地点的地址、入口、支付、语言、票务、无障碍等。

**建议：** Explore 的“类目”与“场景/能力 facet”分开。首发可保留旧五大 primary category，机场/车站留在 Transport domain；`Low Mandarin`、`Apple Pay`、`Visa`、`step-free`、`passport instructions` 是 facet，不扩张成 POI category。

### 3.3 Capability 必须是 tri-state/conditional

不要存：

```ts
foreignFriendly: true
accessible: true
acceptsForeignCards: true
```

建议投影：

```ts
type CapabilityProjection = {
  poiId: string;
  key: CapabilityKey;
  state: "supported" | "conditional" | "unknown";
  supportingFactIds: string[];
  validUntil: string;
  limitations: string[];
};
```

absence = `unknown`，不是 `false`；明确的“不支持”也必须是有证据、有 expiry 的 negative Fact。

---

## 4. 应收集的 typed Facts

### 4.1 所有 Fact 的公共 envelope

```ts
type Fact<T> = {
  id: string;
  target: { scope: "poi"; poiId: string } | { scope: "city"; cityId: string }
    | { scope: "scene"; sceneKey: string } | { scope: "national"; countryCode: "CN" };
  factType: FactType;
  value: T;
  sourceClass: "official" | "operator_verified" | "reputable_editorial"
    | "user_report" | "model_output" | "uncorroborated_scrape";
  sourceLocator: string;
  evidenceSummary: string;
  evidenceDigest?: string;
  sourcePublishedAt?: string;
  ingestedAt: string;
  verifiedAt: string | null;
  expiresAt: string | null;
  reviewPolicy: string | null;
  version: number;
  status: "draft" | "reviewed" | "deprecated" | "rejected";
};
```

`ingestedAt` 不是 `verifiedAt`；模型 output、用户报告和 scrape 只能作为 lead/draft。

### 4.2 Payment：不要用一个 `credit_card=true`

```ts
type PaymentAcceptanceValue = {
  method:
    | "apple_pay"
    | "visa_credit"
    | "mastercard_credit"
    | "amex_credit"
    | "jcb_credit"
    | "unionpay_card"
    | "cash_cny";
  acceptance: "accepted" | "not_accepted" | "conditional";
  channel: "in_person" | "online" | "deposit";
  conditions: string[];
};
```

**建议：** 一种 method 一条 Fact。不能从“有 NFC 终端”推导 Apple Pay，不能从“接受 Visa”推导 Mastercard/Amex，也不能从一次线上支付推导现场收银。旧仓库已把 `payment_acceptance` 归为 30 天 volatile，V4 可先保持该保守上限再用运营数据修订。

**产品观察，不是导入许可：** MICHELIN 上海餐厅筛选明确分开 Visa、Mastercard、Amex、JCB、UnionPay、“Credit/debit accepted”与“foreign credit cards not accepted”，支持使用 typed network 而非总 boolean 的信息架构判断。[MICHELIN 实际产品页](https://guide.michelin.com/sg/en/shanghai-municipality/shanghai/restaurants)

### 4.3 外语/翻译服务

```ts
type LanguageServiceValue = {
  language: "zh" | "en" | "es" | "ru" | "ar" | string;
  mode:
    | "spoken_staff"
    | "written_menu"
    | "printed_guide"
    | "official_audio_guide"
    | "official_app"
    | "onsite_interpreter"
    | "translation_device"
    | "sign_language";
  availability: "regular" | "scheduled" | "on_request" | "conditional";
  reservationRequired: boolean;
  scopeNote: string | null;
};
```

“English menu”“英文员工”“英文 audio guide”必须分行；其中一个不能投影成笼统“提供外语服务”。人员语言与预约型翻译偏 volatile；固定官方 audio guide/printed guide 可使用较长但仍有限的 review policy。

### 4.4 护照/证件

```ts
type DocumentRuleValue = {
  context: "ticket_booking" | "entry" | "pickup" | "hotel_checkin";
  document: "passport" | "mainland_travel_permit" | "other";
  rule: "required" | "accepted" | "not_accepted" | "conditional";
  audience: string[];
  timing: "advance" | "onsite" | "both";
  conditions: string[];
};
```

护照 rule 是高风险执行事实：优先官方来源，scope、游客身份与日期条件不能被压成 `passportFriendly=true`。用户上传票据里的证件信息属于 UserConfirmedArtifact/私有数据，不转成公共 Fact。

### 4.5 无障碍

```ts
type AccessibilityFeatureValue = {
  feature:
    | "step_free_entrance"
    | "wheelchair_route"
    | "elevator"
    | "accessible_toilet"
    | "wheelchair_rental"
    | "seating_rest_points"
    | "tactile_guidance"
    | "audio_description"
    | "sign_language_service"
    | "service_animal_policy";
  availability: "available" | "not_available" | "partial" | "conditional";
  areaOrRoute: string | null;
  bookingRequired: boolean;
  limitations: string[];
};
```

**建议：** 一项设施/路线一条 Fact；不要把一处无障碍卫生间推导成全场馆 accessible。旅行者的个人无障碍需求可能是敏感偏好，只在用户明确保存后进入 Trip context。

### 4.6 其他建议 Fact families

| Family | 例子 | 关键边界 |
| --- | --- | --- |
| identity/local display | local name、中文地址、district、入口/metro exit | 每个显示给本地人的值独立审核 |
| opening/access | hours、temporary closure、last entry | 常规规则与临时 Observation 分离 |
| ticket/reservation | booking required、channel、window、refund/cancellation | 不含未授权库存/价格 |
| transport/wayfinding | nearest verified entrance、metro access、taxi drop-off | 路线/ETA 不是 durable Fact |
| food/dietary | menu languages、allergen communication process、dietary options | 不能把评论推导成过敏安全保证 |
| family/comfort | stroller、changing room、rest area、indoor/rain fit | 设施逐项，不存“family friendly”主观 boolean |
| connectivity | official Wi-Fi availability/registration | 不存密码；动态登录流程需 expiry |
| safety/policy | prohibited items、emergency exit guidance、official notices | 高风险固定/审核表达 |

---

## 5. RAG 技术证据与建议

### 5.1 官方能力事实

- PostgreSQL 使用 `tsvector`/`tsquery` 做全文检索，`websearch_to_tsquery` 可接受更宽容的用户式查询；`ts_rank`/`ts_rank_cd` 提供相关性排序，但官方也明确 relevancy 是应用相关问题。[PostgreSQL FTS](https://www.postgresql.org/docs/current/textsearch-controls.html)
- GIN 是 PostgreSQL 推荐的常规全文检索索引。[PostgreSQL text search indexes](https://www.postgresql.org/docs/current/textsearch-indexes.html)
- `pg_trgm` 提供字符 trigram 相似度与 GiST/GIN 索引，适合 POI 名称/alias 的模糊候选召回。[PostgreSQL pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html)
- Supabase 官方 hybrid 示例把 FTS 与 pgvector 分别排序，再用 Reciprocal Rank Fusion 合并；示例不是 VisePanda 的最佳参数证明。[Supabase hybrid search](https://supabase.com/docs/guides/ai/hybrid-search)
- Supabase/pgvector 可把 RLS 应用于向量检索；PostgreSQL 在启用 RLS 且无 policy 时 default deny。数据库函数默认建议 `security invoker`，而不是无意绕过权限的 definer。[RAG with permissions](https://supabase.com/docs/guides/ai/rag-with-permissions)、[PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)、[Supabase functions](https://supabase.com/docs/guides/database/functions)
- `qwen3.7-text-embedding` 官方列出项目五语在其 201 语种/方言范围；`qwen3-rerank` 是当前文本 rerank 选项，旧 `gte-rerank` 已于 2026-05-30 下线。[embedding](https://help.aliyun.com/en/model-studio/embedding)、[rerank](https://help.aliyun.com/en/model-studio/rerank)
- Supabase 官方提醒 embedding 比较必须来自同一个模型；自动 embedding 示例使用 queue/trigger/worker/重试保持内容更新同步。[vector columns](https://supabase.com/docs/guides/ai/vector-columns)、[automatic embeddings](https://supabase.com/docs/guides/ai/automatic-embeddings)

### 5.2 两条检索 lane

**产品/架构建议：**

1. **Structured Fact lane**：POI identity、支付、语言、护照、开放/预约等先按 `poi/city/scene/factType/asOf/license` 过滤；可直接确定性回答的值不需要先变成自然语言大 chunk。
2. **Editorial Guide lane**：城市/场景/POI Guide 按标题和语义边界切片，用于解释、背景和选择理由；执行 claim 仍必须引用 Fact IDs。

这避免 embedding 相似度把“相关”误当“支持”，也避免一个 guide chunk 同时承担多个不同 expiry。

### 5.3 Retrieval Projection，不复制 truth

```ts
type KnowledgeDocument = {
  id: string;
  kind: "fact_projection" | "guide_chunk" | "safe_phrase";
  sourceEntityId: string;
  sourceRevision: string;
  poiId?: string;
  cityId?: string;
  sceneKeys: string[];
  locale: string;
  text: string;
  supportingFactIds: string[];
  contentHash: string;
  licensePolicyId?: string;
};

type KnowledgeEmbedding = {
  documentId: string;
  modelId: string;
  dimensions: number;
  contentHash: string;
  embedding: number[];
  embeddedAt: string;
};
```

- Fact projection 的文本由 typed value + POI names 通过确定性模板生成，不让 LLM“润色成新事实”。
- Guide chunk 带 `guideId + revision + heading path + supportingFactIds`。
- embedding row 不是资格来源。实际 retrieval 必须 join 当前 source revision 和 eligibility；Fact 过期/撤销后，即使旧 vector 仍在，也不能被返回。
- model/dimension/content hash 全部版本化。更换 embedding model 时写平行索引、离线回归、切流、再删除旧索引，不能混算不同模型向量。

### 5.4 Chunk 策略

| 内容 | 建议单位 | 不做 |
| --- | --- | --- |
| Fact | 一条 typed Fact 一个 projection | 把同一 POI 所有事实拼成一大段 |
| Guide | 标题/段落/步骤边界，初始约 150–350 tokens，最终由 eval 决定 | 固定 800/1000 tokens 无视结构 |
| 表格/清单 | 一行事实或一个完整步骤组 | 横跨表头与多行切断语义 |
| Safe Phrase | 一个 exact expression + scene/severity/locale | 与普通 guide 混排后自由改写 |
| ExternalObservation | 默认不进入 durable RAG | 把航班/天气/营业状态嵌入长期索引 |

### 5.5 推荐查询管线

```text
query + locale + current Trip slice + explicit UI action
 -> exact POI/city/alias resolver (id > external id > exact alias > bounded fuzzy candidates)
 -> deterministic scope/risk/DataNeed
 -> eligibility + RLS + license + locale/asOf metadata filter
 -> lexical candidates (names/aliases/typed text)
 -> multilingual embedding candidates
 -> RRF
 -> optional qwen3-rerank(top-N) only if eval proves benefit
 -> diversity/dedup by source Fact/Guide
 -> small support pack with request-local F1/F2 IDs
 -> answer generation
 -> citation allowlist + typed claim validator
 -> answer / clarification / unavailable
```

**建议：** 初始候选模型用 `qwen3.7-text-embedding` 1024 维只是 spike 参数，不是已接受配置。当前几百至几千 POI/Fact 先 exact vector scan；不建 HNSW 也能获得可测基线。若未来加 HNSW，需特别测试 city/factType/locale filter 下的漏召回，并评估 iterative scan。

### 5.6 Deny by default

以下行必须在进入生成模型前被排除：

- `draft / deprecated / rejected / expired / conflict`；
- `model_output / user_report / uncorroborated_scrape` 未经重新取证审核；
- Imported POI Candidate 和 candidate attributes；
- license policy 缺失或 `mayEmbed/maySendToLlm/mayTranslate=false`；
- 其他用户的 Trip/UserConfirmedArtifact/private guide；
- 过期 ExternalObservation；
- 缺少 reviewed localization 的高风险/法律/安全表达。

服务角色可能绕过 RLS，因此 public RAG 应查询独立的 eligible view/RPC，并用 `security invoker`/显式 grants/RLS 测试；Ops 私有候选与 public index 最好物理或逻辑隔离。

### 5.7 五语策略

- source text 是事实权威；机器翻译只是 private draft。
- 普通事实可以用多语 embedding 跨语检索，再由允许的 Chatbot 管线解释；安全/法律/医疗/Safe Phrase 只有 reviewed localization 可公开。
- Lexical 层不假设一个 PostgreSQL FTS config 覆盖全部五语；启动时检查目标数据库 `\dF`。POI 名称同时使用 exact normalized alias 与 `pg_trgm` bounded candidates。
- 建立 zh/en/es/ru/ar 等义 query qrels，分别统计 recall、MRR、误城市、同名歧义与 unsupported answer；官方“支持该语种”不能替代项目 eval。

### 5.8 RAG eval

官方 RAG 评估建议把 retrieval 与最终生成分开：检索可用 Precision@K、Recall@K、MRR/NDCG；回答再测 groundedness、relevance、completeness。[Microsoft RAG retrieval guide](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/rag/rag-information-retrieval)、[RAG evaluators](https://learn.microsoft.com/en-us/azure/foundry/concepts/evaluation-evaluators/rag-evaluators)

VisePanda fixture 必须包含：

- 五语同义问题、别名、拼写错误、中文名/英文名；
- 同名 POI 跨城市与多分店；
- 有答案、无答案、过期、冲突、draft、撤销；
- Apple Pay 与 card network 不等价；
- spoken English、English menu、audio guide 不等价；
- 护照不同 context；
- 部分无障碍设施不能推导整体 accessible；
- prompt injection 源文本；
- private/owner-scoped 行不能泄漏；
- Guide 与 Fact 冲突时 Fact eligibility 优先；
- ExternalObservation TTL 与 provider policy。

硬门建议为：private/draft/expired 泄漏 0；高风险 unsupported claim 0；错误 citation ID 0。其余阈值必须在真实 baseline 后接受，不能先写一个漂亮数字。

---

## 6. 批量导入：Candidate-first，而不是批量发布

### 6.1 官方导入事实

- PostgreSQL `COPY` 支持 CSV，但 CSV 没有统一区分 NULL 与空字符串的方法，生产导入必须有明确 schema/encoding/null 约定。[PostgreSQL COPY](https://www.postgresql.org/docs/current/sql-copy.html)
- PostgreSQL `ON CONFLICT` 以 unique constraint/index 处理冲突；它能保证数据库层的 insert/update 原子结果，但不能替产品决定两个同名地点是否同一实体。[PostgreSQL INSERT](https://www.postgresql.org/docs/current/sql-insert.html)
- Supabase 把 Dashboard CSV 定位于小数据/开发便利；大规模生产导入应计划完整性、负载和备份，使用 `COPY`/专用通道而非浏览器盲传。[Supabase import](https://supabase.com/docs/guides/database/import-data)
- JSON Lines 要求每行都是独立有效 JSON，适合逐行校验与重放。[JSON Lines](https://jsonlines.org/)

### 6.2 建议的 manifest + row

```ts
type PoiImportManifest = {
  schemaVersion: "poi-import-v1";
  batchId: string;
  sourceProvider: string;
  sourceDataset: string;
  sourceVersion: string;
  licensePolicyId: string;
  retrievedAt: string;
  fileDigest: string;
  coordinateSystem: "WGS84" | "GCJ02" | "BD09";
};

type ImportedPoiCandidate = {
  id: string;
  batchId: string;
  rowKey: string;
  sourceRecordId: string;
  sourceLocator: string;
  sourcePayloadDigest: string;
  nameOriginal: string;
  nameEn?: string;
  nameZh?: string;
  cityId: string;
  proposedCategory: string;
  coordinates?: { lat: number; lng: number };
  permittedAttributes: Record<string, unknown>;
  candidateStatus:
    | "imported"
    | "needs_review"
    | "matched"
    | "conflict"
    | "rejected"
    | "promoted";
  matchedPoiIds: string[];
  createdAt: string;
};
```

只保存 license policy 允许的字段；条款禁止 raw storage 时只保留允许的 ID/locator/digest，不能因“为了审核方便”保存完整 payload。

### 6.3 Dry-run 与消歧顺序

```text
schema/version/file digest
 -> source/dataset/license policy current?
 -> allowed fields + coordinate system
 -> row key/source identity duplicate
 -> canonical category/city mapping
 -> exact provider source ID match
 -> exact existing source ref match
 -> normalized name + city + bounded geographic candidates
 -> fuzzy candidates for reviewer only
 -> report: new / exact match / probable duplicate / conflict / invalid / forbidden
 -> commit candidate staging only
```

模型可对 bounded candidates 排序或解释差异，但不能发明 POI ID、自动 merge 或补齐名称/地址。改变 source row 内容时写新 candidate revision/conflict，不覆盖历史 digest。

### 6.4 CSV 与 JSONL 的使用边界

- CSV：内容人员检查的扁平 candidate/一 Fact 一行工作台，固定 header 和明确 JSON 列；
- JSONL：嵌套 source receipt、多个 aliases、复杂 typed candidate attributes；
- 两者都进入同一 staging schema 和同一 dry-run，不存在“JSONL 直接 production”。

### 6.5 外部来源许可结论

| 来源 | 可否作为自有库默认导入源 | 证据与处理 |
| --- | --- | --- |
| OSM data | 有条件可以 | ODbL 允许复制/修改/分发但要求 attribution 和 Share-Alike；批量应使用许可 feed/extract，自托管或商业服务，不用公共 Nominatim 系统性下载 POIs。[许可](https://www.openstreetmap.org/copyright)、[Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/)、[API policy](https://operations.osmfoundation.org/policies/api/) |
| Google Places/Maps | 不可以作为普通自有底座 | 条款禁止 scraping/indexing/storage 多类内容、TTS 与多类衍生使用；`place_id` 等少数例外按当前 service terms 处理，只能进 License Registry 允许字段。[Terms](https://cloud.google.com/maps-platform/terms)、[service terms](https://cloud.google.com/maps-platform/terms/maps-service-terms) |
| 高德 | 未获书面许可前不可以 | 官方协议禁止直接存储、缓存、抓取，并限制翻译、改编、二次包装/衍生；先保持临时官方 UI/deep link 或 unavailable。[服务协议](https://lbs.amap.com/pages/terms/) |
| 人工官方来源 | 可以形成 draft | 每个字段保留具体 locator/evidence summary，仍需显式 review/expiry |
| 用户报告/模型输出 | 只做 research lead | 不能作为 source evidence 或自动晋级 |

**建议补充 License Registry 字段：** `mayImportIdentity / mayPersistRaw / mayPersistDerived / mayEmbed / maySendToLlm / mayTranslate / mayUseTts / attribution / shareAlike / retention / deleteOnTermination`。`mayEmbed` 不能被 `mayPersistDerived` 默认为 true。

### 6.6 手工 POI 与批量导入 POI 共存

- 手工录入也先创建 candidate/draft，只是 `origin=manual_research`，并不获得更高事实资格。
- 热门城市的“人工精选”通过 `CityCollection + CollectionMembership` 引用 Canonical POI ID；不复制 POI/Facts。
- 普通城市可先完成批量 candidate 导入和 identity review；没有 eligible Facts 的 Canonical POI 可以在产品内显示“仅基本地点信息/详情待核验”，但不能出现能力徽章，也默认不建 indexable SEO 详情页。
- 不提供 bulk fact approval；promotion/review 有目标版本、人工身份、审计和冲突门。

---

## 7. Explore 信息架构

### 7.1 实际产品观察

- Lonely Planet 上海 city landing 把城市概览、Top places、neighborhood/editorial guides 分层，而不是把整城 POI 直接平铺。[实际页面](https://www.lonelyplanet.com/destinations/china/shanghai)
- MICHELIN 上海餐厅页把 primary collection 与 days/hours、diet、occasion、facilities、具体 card network、price 等 facets 分开。[实际页面](https://guide.michelin.com/sg/en/shanghai-municipality/shanghai/restaurants)

这些是 IA 观察，不是复制其排序、数据或内容的许可。

### 7.2 推荐路由

```text
/explore
  城市搜索/选择 + 已开放城市 + truthful coverage

/explore/[city]
  城市概览 + 人工 collection（若有）+ 类目 + 场景/能力筛选 + POI results

/explore/[city]/[poi]
  唯一 POI 身份 + current capabilities/facts + guide/media + Ask/Add CTA
```

筛选 query params 可分享，但组合页默认 canonical 回 city 页面并 `noindex`，避免 facet 组合爆炸。

### 7.3 城市页布局

1. 城市标题、覆盖状态、最后内容巡检时间；
2. 城市 selector（少量城市用 native select，多城市用符合 WAI-ARIA 的 combobox）；
3. Primary category chips；
4. “What do you need?” capabilities：Low Mandarin、Apple Pay、specific card network、passport instructions、step-free 等；
5. 热门城市人工 `CityCollection`；
6. 当前结果、结果数量、排序；
7. load more/分页；
8. 对应 empty/unavailable state。

Combobox 必须有 accessible name、`aria-expanded/controls/activedescendant` 与完整键盘行为；过滤后结果数量/空状态应用 status message，不强制抢焦点。[WAI combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)、[WCAG status messages](https://www.w3.org/TR/WCAG22/#status-messages)

### 7.4 POI 卡与详情最小内容

卡片：

- name + reviewed local name（有则显示）；
- city/neighborhood + primary category；
- 1–3 个 current capability badges，每个可追到 supporting Fact IDs；
- `Verified <date>` / `Recheck required`；
- 有 rights 的 media；
- `View details`、`Ask VisePanda`、`Add to Trip`。

详情页：

- Identity；
- Why it may fit（editorial，不能冒充事实）；
- Payment、Language、Entry/Passport、Accessibility、Getting there、Booking 分区；
- 每条事实的来源 label、verified/expiry 和限制；
- Unknown 不补猜；
- 与 Chatbot/Canvas 的 exact-ID CTA。

### 7.5 排序

先 hard filter：canonical identity、city、public eligibility、license、current facts。之后：

| 模式 | 建议 |
| --- | --- |
| `relevance` | 有 query 时 lexical/vector/rerank；显示为什么匹配 |
| `best_for_trip` | 仅用户明确有 Trip context；按 scene/capability match，不用 LLM 黑箱分数 |
| `recently_verified` | 按 supporting facts 的 freshness，不能称“最好” |
| `distance` | 用户单独授权位置且坐标许可允许；PostGIS 支持 indexable distance 查询。[Supabase PostGIS](https://supabase.com/docs/guides/database/extensions/postgis) |
| `name` | locale-aware A–Z，稳定 tie-breaker `poiId` |

无 query 的默认页：热门城市可先排人工 collection membership；其余使用确定性 `eligible capability coverage + freshness + stable poiId`。不得用不存在的评分/热度。赞助位必须分区与披露，不能混入 relevance score。

### 7.6 Empty/unavailable states

- 城市尚未开放：显示 coverage 缺口和可做的下一步；不展示其他城市假结果；
- 筛选无结果：保留已选 filter，提供 Reset/逐项移除；
- 只有 identity、无 eligible facts：明确“基本地点已核对，执行信息尚未核验”；
- 数据服务失败：显示 unavailable，不把缓存过期值当 current；
- 用户可“提交研究线索”，但只创建 private gap/candidate。

可点击 target 至少满足 WCAG 2.2 的 24×24 CSS px 或充分 spacing，DOM/focus order 与视觉阅读顺序一致。[Target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)、[Focus order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html)

### 7.7 SEO/index gate

```text
Imported candidate                       -> no route
Canonical identity only                  -> public optional, noindex
Current eligible facts but thin/duplicate -> noindex
Unique reviewed guide + sufficient facts -> index candidate
Reviewed localized revision              -> locale index candidate + hreflang
Expired/revoked support                   -> remove sitemap; noindex/retire
```

- sitemap 只列 canonical/index-eligible URL；Google 建议 sitemap 只放 preferred canonical URLs。[Sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- `noindex` 页面不能同时 robots.txt block，否则 crawler 看不到 noindex。[Google noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
- 五语页面只有主内容真正 reviewed localized 才用 `hreflang`；每个版本必须列自身和所有 alternate。[Google localized pages](https://developers.google.com/search/docs/specialty/international/localized-versions)
- JSON-LD 只描述用户可见、current、准确内容；不为缺失 payment/hours/rating 填值。[Structured data guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)
- 不因批量导入而批量产出 AI 描述页；Google 明确反对无价值的 scaled content。[People-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)

---

## 8. Chatbot、Explore 与 Trip Canvas 如何消费同一知识

### 8.1 ID 联动

```text
Explore card: canonicalPoiId + eligibleCapabilityIds
  -> Ask VisePanda UI action { capability: "ask_about_poi", poiId }
  -> SearchKnowledge({ poiId, cityId, sceneKeys, locale, asOf })
  -> eligible Fact/Guide support pack
  -> AssistantTurn with citations

Explore card/detail
  -> Add to Trip UI action { capability: "propose_add_poi", poiId, dayId? }
  -> current Trip + current eligible Facts
  -> TripProposal with POI ref and supporting Fact receipts
  -> Canvas diff
  -> user confirm
  -> deterministic TripPatch
```

模型不重新猜用户点的是哪家 POI，也不能把 Imported Candidate ID 写进 Trip。

### 8.2 Canvas 保存什么

建议保存：

- Canonical POI ID；
- 用户接受的日期/日块/时间意图/备注；
- 创建 Proposal 时使用的 Fact IDs + versions/expiry receipts；
- 合法 ExternalEntityRef；
- `recheckAt`。

不复制保存：

- 整段 guide；
- 第三方 raw payload；
- 过期 payment/language/hours 值作为永久承诺；
- Imported Candidate；
- 未确认的模型建议。

Fact 过期或新 Observation 变化时，Canvas 变为 `recheck_required/change_detected` 并产生新 Proposal；不能静默改 Trip。

### 8.3 场景例

用户筛选“上海 + 餐厅 + Apple Pay + 英文菜单”：

1. Explore 只返回同时有 current eligible `payment_method_acceptance(method=apple_pay)` 与 `language_service(mode=written_menu, language=en)` 的 Canonical POIs；
2. 卡片显示两个独立 capability 及各自 verified date；
3. 点击 Ask 时服务端按 `poiId` 检索，不做全城模糊猜测；
4. 点击 Add 时 Proposal 引用两个 Fact receipts；
5. 任一 Fact 到期后，Explore 对应 facet 消失，Canvas 显示 recheck，而不是把旧承诺保留。

---

## 9. 最小开发/验证顺序（建议，非已接受计划）

1. `KNOW-00`：冻结 Imported Candidate / Canonical POI / Fact / Guide / Media / Capability / Explore Projection 与 eligibility。
2. `IMPORT-00`：manifest、CSV/JSONL dry-run、staging、idempotency、bounded duplicate queue；只写 candidate/draft。
3. `KNOW-01`：public eligible view、exact ID/alias/city resolver、RLS/permission leakage tests。
4. `RAG-00`：五语 qrels、negative/expired/conflict/private/injection fixtures；先建立 lexical/exact baseline。
5. `RAG-01`：`qwen3.7-text-embedding` exact semantic + FTS hybrid/RRF；在 eval 后决定 qwen3-rerank 和 HNSW。
6. `EXPLORE-00`：同库 `ExploreProjection`、city/category/capability/filter/sort/pagination contract。
7. `EXPLORE-01`：city page + POI detail + truthful empty/noindex states + accessibility/browser QA。
8. `LINK-00`：Ask/Add UI actions -> exact POI ID -> Chatbot -> TripProposal -> Canvas confirm。

任何步骤都不需要先生成大批内容。首个 tracer bullet 应使用 1 个城市、10–20 个候选/少量 reviewed facts，证明 import -> review -> Explore -> Chatbot citation -> Canvas proposal 闭环，再扩大。

---

## 10. 待核验/待 operator 决定

1. **数据源合同：** OSM derivative database 的具体 Share-Alike/attribution 落地；Google/Amap 是否完全排除或购买专门许可；这需要法务/合同 review。
2. **POI identity 公开门：** 只有 identity reviewed、暂无 execution Facts 的 Canonical POI 是否允许出现在 Explore 基础卡；建议允许但明确缺口且 `noindex`，需 operator 接受。
3. **V4 primary categories：** 是否继续旧五类；若需要机场/车站/药房等，优先独立 Transport/Practical entity ADR，而不是随意改 enum。
4. **review policy：** Apple Pay/card、人员语言、翻译设备、passport 与 granular accessibility 的 30/90/180 天映射，需要内容运营样本和风险 owner 接受。
5. **embedding 地域/数据流：** 北京或新加坡 endpoint、允许发送的内容类别、DPA/retention、成本与五语延迟尚未用真实账号验证。
6. **embedding/rerank 质量：** 官方语种覆盖不是 VisePanda eval；`qwen3.7-text-embedding` dimensions、distance、RRF weights、top-N、rerank threshold 尚未实测。
7. **中文/阿语 lexical search：** 先用 exact alias + `pg_trgm` + multilingual vectors；是否引入 PGroonga/自定义分词仅在 qrels 证明缺口后决定。
8. **SEO Gate 数值：** “多少 Facts/多少原创 Guide 才 index”必须用真实页面质量/搜索观察设定，不能用 POI 数量替代。
9. **无障碍内容 authority：** 哪些事实需现场专业审核、用户报告如何转 research gap，需要指定 reviewer capability。
10. **地图表现：** 是否在 Explore 嵌入地图、使用哪一底图/tiles、坐标系转换和 attribution 尚未决定；list-first 不依赖该决定。

---

## 11. 来源索引（均于 2026-08-23 核验）

### 数据库/RAG

- [PostgreSQL Full Text Search](https://www.postgresql.org/docs/current/textsearch-controls.html)
- [PostgreSQL preferred text-search indexes](https://www.postgresql.org/docs/current/textsearch-indexes.html)
- [PostgreSQL pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html)
- [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [pgvector](https://github.com/pgvector/pgvector)
- [Supabase Hybrid Search](https://supabase.com/docs/guides/ai/hybrid-search)
- [Supabase RAG with permissions](https://supabase.com/docs/guides/ai/rag-with-permissions)
- [Supabase automatic embeddings](https://supabase.com/docs/guides/ai/automatic-embeddings)
- [Alibaba `qwen3.7-text-embedding`](https://help.aliyun.com/zh/model-studio/qwen3-7-text-embedding)
- [Alibaba embedding catalogue/languages](https://help.aliyun.com/en/model-studio/embedding)
- [Alibaba rerank](https://help.aliyun.com/en/model-studio/rerank)
- [Microsoft RAG retrieval evaluation](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/rag/rag-information-retrieval)

### Import/licensing

- [PostgreSQL COPY](https://www.postgresql.org/docs/current/sql-copy.html)
- [PostgreSQL INSERT / ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html)
- [Supabase import data](https://supabase.com/docs/guides/database/import-data)
- [JSON Lines](https://jsonlines.org/)
- [OpenStreetMap copyright/licence](https://www.openstreetmap.org/copyright)
- [OSMF Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/)
- [Google Maps Platform Terms](https://cloud.google.com/maps-platform/terms)
- [Google Maps service-specific terms](https://cloud.google.com/maps-platform/terms/maps-service-terms)
- [高德地图开放平台服务协议](https://lbs.amap.com/pages/terms/)

### Explore/accessibility/SEO

- [WAI combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [Google noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
- [Google sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google localized pages/hreflang](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [Google structured-data guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)
- [Google people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [Google spam policies](https://developers.google.com/search/docs/essentials/spam-policies)

---

## 12. 研究成熟度声明

- **已核验：** 两仓库当前事实、旧 Knowledge/Content AI/Import/Explore/SEO 约束；Postgres/pgvector/Supabase/Qwen 当前官方能力；OSM/Google/高德公开许可边界；WCAG/Google SEO 基本规则。
- **架构建议：** candidate-first import、统一 Canonical POI/Fact IDs、typed capabilities、双 lane RAG、exact-first hybrid、city-first Explore、evidence-gated SEO。
- **未核验为生产事实：** 任何真实 POI 数据质量、Qwen 账号地域/成本/延迟、五语 retrieval/rerank 指标、地图合同、批量导入吞吐、真实用户排序偏好。
- **明确未做：** 未批量生成/导入 POI，未自动审核，未调用付费模型/API，未修改最终规划、`CONTEXT.md` 或 handoff。

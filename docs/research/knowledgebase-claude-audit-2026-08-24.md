# Claude Code 知识库方案独立审计

- 审计日期：2026-08-24
- 审计对象：`/Users/jtcao/Downloads/knowledgebaseplan.md`
- 对照基线：VP-V4 五轮 AI Core 研究/工程报告、VP-Final Knowledge/Content AI/import/RLS 实现、2026-08-24 可访问的一手资料
- 性质：研究审计，不是已接受 ADR、数据库设计、内容发布授权或生产验收
- 证据标签：`事实` = 一手来源或代码可复核；`建议` = 本审计的工程判断；`待实测` = 只能通过 fixture、provider、Ops pilot 或用户流程验证

## 0. 审计结论

Claude 方案最有价值的部分，不是“约 810 条记录”这个数字，而是三项结构性判断：

1. 不应把所有旅行执行知识都复制成 per-POI 属性；国家、场景、城市、POI 需要分层；
2. Canvas readiness 应由确定性规则消费有证据、可失效的记录，不应交给 LLM 自由判断；
3. “标准规定某类场所应提供某项服务”只能渲染为义务或预期，不能写成现场一定可用。

这些方向可以采纳。但原文**不能直接成为 V4 的知识库 catalogue 或实施规格**，原因如下：

- 原文引用的 `research/fact-catalogue.json` 没有随附件提供；因此 30 个 fact type、810 条、122 条、358 条、60 个场馆、5 周等数字无法重放或逐条审计，只能标为估算；
- “六个执行时刻都不会 unavailable”把“registry 中存在类型”误当成“当前有合格证据”。VP-Final 的实际 eligibility 要同时满足 reviewed、合格来源、真实复核时间、确定性 review policy 和未过期；缺一即不可消费。[VP-Final eligibility](https://github.com/JTCAO515/VP-Final/blob/b5ef081f5e5766a59c547454f297acc69e908c56/packages/domain/src/knowledge/index.ts#L338-L361)
- `national/city/scene/poi` 只表达地理/场景 target，不能表达国籍、护照类型、入境项目、卡组织、发卡行、钱包 provider、交易金额、网络路由、旅程日期等决定答案的条件；
- 原文把 Fact、Procedure、Safe Phrase、Directory、Probe Observation、Readiness Rule 混成同一种“记录”，会把事实真理、内容组合、实时观察和执行逻辑耦合在一起；
- 若干具体结论过度确定：5A/星级义务被用于 `ready`、eSIM 被写成落地后无法恢复、铁路人工核验写死 48 小时、OSM/高德地址被称为“原生完整”、城市取消预约被用于剪枝全部场馆；这些都不能进入执行合同；
- 原文没有补齐 Candidate import、source licence、identity resolution、RLS、Change Set 原子发布、RAG projection、Explore projection、失效传播和纠错/删除路径，而这些已经是 V4 五轮报告冻结前必须解决的系统边界。

最终建议：把 Claude 文档降级为 **需求 catalogue 候选 + readiness 规则假设集**，吸收进现有
`Imported POI Candidate -> Canonical POI -> Fact -> Retrieval Unit / Explore Projection -> Trip Place Reference`
链路；不要另建“810 行规则表”，也不要在 operator 决策和两城市 pilot 前开始批量转录。

## 1. 审计方法与证据边界

本审计逐节检查 Claude 文档的：

- 数字是否可重算；
- source 是否属于能证明该 claim 的一手来源；
- scope 和 conditions 是否足以唯一决定答案；
- 记录是否属于 Fact，还是 Procedure、Observation、Safe Phrase 或 Rule；
- 是否与 V4 已提出的知识资格、Content AI、RAG、Explore、Canvas 合同冲突；
- 是否能由当前 VP-Final 实现安全迁移，而非复制目录或旧 schema。

边界：没有调用付费模型，没有访问生产 Supabase，没有抓取/导入任何 POI，也没有验证附件中缺失的 `fact-catalogue.json`。网页事实按 2026-08-24 当前可访问页面核验；优惠、名录、政策和 provider 行为仍可能继续变化。

## 2. 总体主张审计

| Claude 主张 | 结论 | 审计意见与证据 |
| --- | --- | --- |
| “正确形态是约 810 条记录” | **不采纳为规模目标** | `202 + 458 + 150 = 810` 的算术成立，但原始 catalogue 缺失，不能证明类型完整、来源存在、记录粒度正确或维护成本。规模应由 six-moment qrels、两城市 pilot 和 unavailable gap 决定。`事实`：当前无法重放；`建议`：作为粗略容量假设保留。 |
| “122 条国家/场景规则服务全部旅客” | **需修正** | 全国来源不等于对所有旅客无条件适用。免签依赖国籍、护照、口岸、行程、第三国/地区、活动类型；支付依赖钱包、卡组织、发卡行、金额和促销；领事服务依赖旅客国籍和领区。[国家移民管理局 240 小时过境免签条件](https://www.nia.gov.cn/n741440/n741577/c1731205/content.html) |
| “全部六个时刻无核心 unavailable” | **拒绝** | type 存在不等于 claim 可用。source 权利不足、证据冲突、trip date 超过有效期、用户条件缺失、实体歧义、projection 延迟、provider unavailable 都应 fail closed。VP-Final 只向 public 暴露 current reviewed Fact，并由 RLS 再做数据库门。[reviewed-only policy](https://github.com/JTCAO515/VP-Final/blob/b5ef081f5e5766a59c547454f297acc69e908c56/infra/supabase/migrations/20260716200000_poi_fact_review_policy.sql#L62-L78) |
| “不是研究，是抄写加核对” | **拒绝** | 将法规/标准转成 typed value、conditions、precedence、safe wording 和 readiness action 本身就是研究、解释和产品风险判断；正式英译也只能作为 source text，不能代替范围/现行性/冲突审查。 |
| “默认 national；三个条件同时成立才收窄” | **采纳为 authoring heuristic，拒绝作为查询规则** | 优先复用宽 scope 能降低重复，但 target scope 与 applicability conditions 必须分开。VP-Final 的 scoped target 顺序可作为迁移证据，但其 context 只有 POI/city/scene/country，不能支撑本方案全部条件。[ScopedExecutionFact](https://github.com/JTCAO515/VP-Final/blob/b5ef081f5e5766a59c547454f297acc69e908c56/packages/domain/src/knowledge/scopedFacts.ts#L20-L68) |
| “等级行 + 类级权益替代逐场所观察” | **部分采纳** | 可用于生成“标准义务/预期”的 derived claim，不能证明现场服务可用，也不能使 Canvas `ready`。GB/T 17775-2024 是推荐性国家标准；文化和旅游部还会降级/取消 A 级，2024 年有 1 家 5A 被降级、77 家 4A 被降级或取消。[标准状态](https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=2FA5FF63790692575C2357E99D4E88EF)、[文旅部质量等级动态管理](https://www.mct.gov.cn/gtb/index.jsp?url=https%3A%2F%2Fwww.mct.gov.cn%2Fvipchat%2Fhome%2Fsite%2F2%2F459%2Fabstract%2F2025070903301769.html) |
| “一人 + AI 五周完成” | **待实测** | 未包含 source licensing、identity matching、独立复核、五语 safe phrase、冲突、RLS、projection、用户呈现和持续更新成本。先做 10–20 条、两个 scope、两个城市的 time-and-motion pilot。 |

## 3. 正确的 scope 不是单轴层级

### 3.1 可采纳部分

Claude 方案指出相同规则不应在数万个 POI 上重复，这是正确的规范化方向。V4 应保留四类 target：

- `national`：全国法规、全国官方流程、全国性 provider policy；
- `scene`：跨实体复用的执行流程或用户准备场景；
- `city/region`：地方公告、试点、地方办理渠道；
- `poi/entity`：场所、机构、商户或具体站点的事实。

VP-Final 已实现 `poi -> city -> scene -> national` 的确定性 target order，说明该思路可迁移为 golden contract，而不是重写所有历史目录。[target order](https://github.com/JTCAO515/VP-Final/blob/b5ef081f5e5766a59c547454f297acc69e908c56/packages/domain/src/knowledge/scopedFacts.ts#L90-L121)

### 3.2 必须修正为 target + conditions

`scope=national` 只能说明发布/适用的空间层级，不能说明“对所有用户成立”。最低限度需要独立 conditions：

```ts
type Applicability = {
  geography?: { country?: "CN"; provinces?: string[]; cities?: string[]; poiIds?: string[] };
  traveler?: { nationalities?: string[]; passportTypes?: string[]; residency?: string[] };
  trip?: { effectiveFrom?: string; effectiveTo?: string; transit?: boolean; activityTypes?: string[] };
  payment?: { provider?: string; cardNetworks?: string[]; issuerCountry?: string; amountBand?: string };
  network?: { routingMode?: string; carrier?: string; deviceClass?: string };
  execution?: { sceneKey?: string; prerequisiteKeys?: string[] };
};
```

这是接口方向，不是最终 schema。`待实测`：只有把 Claude 的 30 类各做 2–3 个真实 fixture，才能确认哪些条件应成为闭合 discriminated union，禁止先落成万能 `jsonb conditions` 后把解释权交给 LLM。

### 3.3 scope precedence 不能制造 negative inference

“城市取消全市预约”可以证明城市默认制度变化，却不能证明每个场馆都无需预约；某场馆仍可能因实名、容量、展览、节假日或临时活动要求预约。因此：

- city-level `reservation_default=false` 只能取消“全市统一要求”推断；
- 没有 POI 证据时仍是 `unknown`，不是 `booking_required=false`；
- POI 例外由当前 venue official Fact 覆盖；
- 冲突时返回并列限制或 unavailable，不让模型猜。

这与 V4 主报告“一条 Fact 表达一个 claim；没有正面证据是 unknown，不自动解释为 false”一致，见 [AI Core 整体研究报告 §8.2](../ai-core-integrated-research-report.md#82-内容结构)。

## 4. 记录类型必须拆分，不能都叫 Fact

Claude 的 30 个 `factType` 实际包含至少六种不同生命周期：

| Record kind | Claude 示例 | 正确责任 | 是否进入普通 RAG |
| --- | --- | --- | --- |
| `Fact` | fee threshold、24 小时登记、某场馆预约渠道 | 一条 typed claim + evidence + validity | eligible 时可以 |
| `Procedure/Guide` | wallet binding procedure、lost passport procedure | 有序步骤；每个关键数字/渠道引用 Fact IDs | reviewed chunk 可以，关键值确定性渲染 |
| `SafePhrase` | allergen term、fixed expression、handoff card | exact key lookup、translation revision、专业复核 | 高风险项不进入普通生成式 RAG |
| `Directory/EntityRef` | mission contact、5A 名录、ATM/退税点 | 可枚举实体/机构及 source identity | 先 exact/entity resolution |
| `Observation` | service reachability probe | provider/time/route/device stamped、短 TTL | direct resolver，不进长期公共知识 |
| `ReadinessRule` | fee warning、booking window、fallback gate | versioned deterministic code/rule；引用 facts | 不作为事实文本检索 |

V4 已经把 `Fact`、`Retrieval Unit`、`Explore Projection` 和 `Trip Place Reference` 分开；Claude 方案若全部落到一个 registry，会破坏这条边界。[Knowledge/RAG/Explore 规划 §2](../knowledge-rag-explore-plan.md#2-canonical-domain-language)

`建议`：新增 record kind 之前先由知识模块拥有统一接口，内部可以多表，但调用者只见 `resolveEvidence/explore/prepareImport/commitImport/reviewAndPublish`；不要给每类记录各造一套浅 service。见 [工程报告 §2.3](../ai-core-engineering-development-acceptance-report.md#23-deep-modules-and-interfaces)。

## 5. 各类内容逐项审计

### 5.1 Payment

| Claude 项 | 结论 | 修正 |
| --- | --- | --- |
| `wallet_binding_procedure` | **采纳，但 provider 分拆** | Alipay 和 WeChat 必须是不同 subject/version；绑定是否成功还受卡组织、发卡行和账号状态影响。2024 商务部指南明确写有发卡行可能拒绝绑定。[官方指南](https://nsd.mofcom.gov.cn/tzyts/art/2024/art_a08888d0b9da42f083b00223edaf1de7.html) |
| `wallet_fee_and_limit` | **采纳为 volatile conditional Fact** | 官方指南支持 200 元阈值与超过 200 元按全额 3% 的规则，但促销不能并入永久基线；2026 年首次绑卡 60 天优惠目前可见于政府转引的 WeChat 活动信息，仍需回到 provider 当前条款并按 provider/用户资格存储。[商务部指南](https://nsd.mofcom.gov.cn/tzyts/art/2024/art_a08888d0b9da42f083b00223edaf1de7.html)、[北京政府 2026 WeChat 活动信息](https://russian.beijing.gov.cn/travellinginbeijing/essentials/inboundtourismfacilitationmeasures/202605/t20260522_4662708.html) |
| “250 元 = 7.50 元” | **可作 deterministic example，不是独立 Fact** | 只有当当前 provider fact、支付方式和用户优惠条件均解析成功时计算；receipt 保存输入 Fact versions。 |
| “拆成两笔 190 手续费归零” | **拒绝作为 readiness 建议** | 算术在该 fee rule 下成立，但商户是否允许拆单、provider 风控和活动条件未知；最多是带明确不确定性的低风险选项，不能成为默认优化或 ready 条件。 |
| “wallet procedure 替代 per-POI 外卡受理” | **拒绝** | 这是两个用户问题。钱包准备不能回答“这家餐厅能否刷我的 Visa/Apple Pay”。Apple 明确说明商户既要启用 NFC/contactless，也必须接受用户卡片的 payment network，甚至有标志也可能未实际启用。[Apple Pay 官方说明](https://support.apple.com/en-us/120364) |
| `cash_rights_and_complaint` | **采纳** | 适合作为全国 rule + complaint channel，但需要依法应使用非现金工具等例外。人民银行对 2018 年第 10 号公告的官方答复说明，不得以格式条款、通知、声明、告示拒收现金，依法应使用非现金支付工具的情形除外。[人民银行官方答复](https://www.pbc.gov.cn/zhengwugongkai/4081330/4081344/4081419/4081727/2025080819055236134/2019013110201572820.pdf) |
| `cash_access_channel` 7 条 | **待实测** | ATM 可用性取决于机具受理标识、卡组织、银行和限额。人民银行地方指南也要求看 ATM 标识，不支持把“某银行类别”永久等同为可用。[浙江境外人员支付指南](https://www.pbc.gov.cn/redianzhuanti/118742/5275415/5275419/5301638/index.html) |
| `tax_refund_rules/directory` | **采纳方向，需拆 rule/entity/outlet** | 全国规则与具体退税商店/办理点是不同对象；目录需要 source identity、更新/撤销和城市/口岸条件。 |

结论：保留 per-POI `payment_acceptance` typed facets，至少区分 instrument、network、channel、foreign-issued、conditions、source/expiry。unknown 不能变 false，也不能被国家 wallet guide 覆盖。

### 5.2 Entry / Booking / Stay / Rail

| Claude 项 | 结论 | 修正 |
| --- | --- | --- |
| `visa_free_program` | **P0，有条件采纳** | 不能是“国籍在名单内”一个布尔值。2026-08-20 的 240 小时政策还要求普通护照、前往第三国/地区、确定日期和行程的联程客票、指定 65 口岸/允许区域和短期活动。[国家移民管理局公告](https://www.nia.gov.cn/n794014/n1050181/n1050489/c1796294/content.html) |
| `city_reservation_regime` | **采纳为 city policy，不得负向泛化** | 见 §3.3；它可减少错误的全市默认警告，不能消灭 venue-specific unknown。20 城只是 pilot target，不是数据事实。 |
| `venue_booking_protocol` | **采纳** | 必须是 venue official、带 booking window/timezone、passport/phone/channel/closure/last-entry 条件；60 条是试点容量，不是完整性承诺。 |
| `national_holiday_calendar` | **采纳** | 用 structured date windows，不用散文 chunk；每年版本和补班安排单独处理。 |
| `accommodation_registration_rule` | **采纳并更新** | 旅馆外住宿 24 小时登记有官方法律依据；但 2026-03-20 起 7 个省级地区已试点全国政务平台线上办理，所以 Canvas 不应固定创建“去派出所”动作，应解析所在地区支持的 channel。[国家移民管理局政策解读](https://www.nia.gov.cn/n741440/n741577/c1771556/content.html) |
| `accommodation_acceptance_rule` | **需定义 claim** | “法律/行业不得拒绝”与“某酒店当前接受某护照/国籍”不是同一 Fact；后者可能需要 venue/booking confirmation 或 user artifact。 |
| `rail_ticketing_procedure` | **采纳为 reviewed Guide + exact official actions** | 12306 当前官方页面确认外国护照可上传照片在线核验，也可到车站窗口；页面未承诺 48 小时 SLA。[12306 身份核验须知](https://kyfw.12306.cn/otn/gonggao/saleTicketMeans.html) |
| “人工护照审核可能需 48 小时” | **拒绝当前写法** | 2024 年国铁答复说大量人工比对一般需 3–5 个工作日；当前 12306 页面没有时限承诺。应将 SLA 设为 volatile/unknown，产品只提示尽早核验并提供窗口路径，不硬编码 48 小时。[国铁答复转载于政府网站](https://www.rongjiang.gov.cn/jdhy_5903606/hygq_5903608/202410/t20241025_85982138.html) |

`建议`：签证/登记/铁路属于 R1/R2 高风险类型；Canvas 可以保存 EvidenceReceipt 和 recheck action，但不能把法律解释或实时通过概率交给 LLM。

### 5.3 `venue.class_entitlement` 与 `poi.official_grade`

这部分有启发性，但原模型需要重构：

1. 5A 名录确实存在官方查询，文化和旅游部大众服务当前显示 358 家；但名录会增补、降级和取消，不能当一次性静态表。[文旅部大众旅游服务](https://lyfw.mct.gov.cn/)、[5A 查询](https://app.gjzwfw.gov.cn/jmopen/webapp/html5/scenicspot/index.html)
2. GB/T 17775-2024 的等级条款包含中外文解说要求，但它是推荐性国家标准，等级代表评定时达到标准，不证明用户到访日期、时段、语言、设备或人员当前可用。[GB/T 17775-2024 官方信息](https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=2FA5FF63790692575C2357E99D4E88EF)、[政府网站公开标准文本](https://www.qingcheng.gov.cn/qyqcwgdltj/attachment/0/168/168277/1965013.pdf)
3. GB/T 14308-2023 的星级检查表确有第二种文字/外语服务要求，但“第二种文字”不必然是用户需要的英语/西班牙语/俄语/阿拉伯语，且员工在岗情况仍需现场或 venue evidence。[GB/T 14308-2023 政府 PDF](https://www.dhms.gov.cn/wtj/Attach/2602/05KS9J7P2K2602261031321DBDD7B1.pdf)

因此不应建一个能直接把 block 设为 `ready` 的 join。推荐最小对象：

```text
CertificationRecord
  issuer + scheme + schemeVersion + grade + awardedAt + revokedAt + sourceReceipt
StandardRequirement
  schemeVersion + grade + clause + obligation + locale/medium conditions
DerivedExpectation
  supporting certification/requirement IDs + wording="standard obligation" + recheck=true
```

`DerivedExpectation` 只可帮助排序、解释和提示 recheck；只有 current venue/operator evidence 或 user-confirmed artifact 才能把“某语言服务现在可用”用于执行 readiness。

### 5.4 Network

| Claude 项 | 结论 | 修正 |
| --- | --- | --- |
| `connectivity_option` | **采纳** | provider/plan/device/eSIM compatibility/real-name/channel 是条件，不应只有全国散文。 |
| `service_reachability` 40 条 | **改为 Observation** | reachability 受 mainland/home routing、carrier、DNS、应用版本、设备、网络和时间影响；探测结果必须带这些 receipt 和短 TTL，不能成为 180 天 Fact。探测前还要做合规/robots/provider policy 评审。 |
| “eSIM 必须落地前安装激活，否则无法下载” | **过度绝对，拒绝硬阻塞** | “出发前安装并测试”是合理准备建议；“落地后无法下载”忽略机场/酒店 Wi‑Fi、国际漫游和 provider app 的差异。只有具体 eSIM provider/device 条款证明时才能变成硬前置条件。 |
| `public_wifi_access_rule/offline_kit` | **采纳为 Guide/Rule** | 公共 Wi‑Fi 规则是 scoped Fact；offline kit 是用户准备 procedure，不是事实。 |

### 5.5 Rescue / Human Help

- `emergency_number`、官方公共 assistance hotline：高价值 national Fact，必须保留服务范围、语言、工作时间和“非 SLA”措辞。
- `mission_contact`：不能简单标 `national`。target 是 `Mission/Consulate`，applicability 至少包含 traveler nationality、consular district/provinces、service type、emergency/out-of-hours channel。60 条只是估算。
- “没有覆盖机构时回退北京大使馆并明说它是覆盖机构”：**拒绝自动规则**。没有当前领区证据时只能给官方 mission directory/recheck；不能自称 coverage。
- `lost_passport/medical_access`：适合 reviewed Procedure，关键地址、号码、证件和费用仍由 Fact/EvidenceReceipt 支撑。
- VisePanda 当前边界不承诺 Human Help、医疗、救援或 SLA；知识记录不能把“列出联系人”升级成“服务可提供”。

### 5.6 Translate / Communicate / Show to Local

Claude 对 fixed expressions 的方向与 VP-Final ADR-0016 一致：过敏、医疗、紧急、护照/票据和地址不能让模型自由创作。[ADR-0016](https://github.com/JTCAO515/VP-Final/blob/b5ef081f5e5766a59c547454f297acc69e908c56/docs/adr/ADR-0016-execution-fact-safety.md)

但以下内容必须修正：

- 120 条固定表达 + 30 条过敏原只是容量假设。V4 有 `zh/en/es/ru/ar` 五语，source locale、target locale、translation revision、semantic equivalence reviewer 和医学/过敏风险 reviewer 均需独立记录；“一位双语审核员”不足以覆盖五语和医疗安全。
- 过敏原 term 不应被 LLM 拼接成新句。运行时 exact key lookup，缺少已审核组合就 unavailable。
- 3,700 signage、3,100 dish、300 medical lexicon 是 Phase 2 假设，进入前要有来源许可、去重、locale、sense、示例、风险等级和 eval；不能只因行数大就脚本导入。
- `showlocal.handoff_card_contract` 可作为 deterministic template/version；卡片中的名称、地址、请求文本仍引用独立 Fact/SafePhrase revision。
- “OSM 和高德原生完整，所以不需要自建地址”不成立。OSM 是 ODbL 数据且要求 attribution/share-alike 分析，公共 Nominatim 禁止系统性下载全部 POI；高德当前服务协议禁止未经书面许可抓取、存储、缓存、索引、脱离服务展示或生成数据库。[OSM licence](https://www.openstreetmap.org/copyright)、[Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/)、[高德服务协议](https://lbs.amap.com/pages/terms/)

V4 应继续把 `local_name_zh`、`local_address_zh`、district、metro exit 和 visibility note 分为独立 evidenced rows；VP-Final 已有此安全边界和无事实时 unavailable fallback。[local presentation schema](https://github.com/JTCAO515/VP-Final/blob/b5ef081f5e5766a59c547454f297acc69e908c56/packages/domain/src/knowledge/index.ts#L49-L73)

## 6. TTL 与事实有效期审计

### 6.1 可采纳

`volatile-30d-v1 / execution-90d-v1 / stable-180d-v1` 可保留为**review cadence policy**。VP-Final 已在 domain 和数据库 constraint 中实现相同三档，并禁止某 fact type 自选更长政策。[domain policy](https://github.com/JTCAO515/VP-Final/blob/b5ef081f5e5766a59c547454f297acc69e908c56/packages/domain/src/knowledge/index.ts#L43-L90)、[database constraints](https://github.com/JTCAO515/VP-Final/blob/b5ef081f5e5766a59c547454f297acc69e908c56/infra/supabase/migrations/20260716200000_poi_fact_review_policy.sql#L16-L60)

Claude 用 2026-08-20 免签更新说明该类政策可能快速变化，这一点有一手公告支持。[国家移民管理局 2026 年第 4 号公告](https://www.nia.gov.cn/n794014/n1050181/n1050489/c1796294/content.html)

### 6.2 必须修正

当前 VP-Final 把 review cadence 直接用于 `expiresAt`，是可迁移的保守基线，不应在 V4 中继续把三个概念混为一个时间：

- `effectiveFrom/effectiveTo`：source 声明的法定/活动/标准有效期；
- `verifiedAt/reviewDueAt`：VisePanda 最近复核与下次复核期限；
- `observedAt/observationExpiresAt`：探测或实时观察窗口。

例如国家标准可以长期现行，但仍需每 180 天检查是否被替代；活动可能在 7 天后结束，即使刚复核也不能在第 8 天使用。Canvas 应同时检查 `block.date in validDuring`、review current、source/current version、conflict 和 eligibility，不能只比较一个 `expiresAt`。

## 7. Canvas Readiness 规则审计

### 7.1 总体方向

把 readiness 写成 versioned deterministic rules 是正确方向。规则输出必须带：

```text
ruleVersion + evaluatedAt + trip/block revision
+ input Fact/Observation/UserArtifact receipts
+ status/reasons + next actions + recheckAt
```

模型可以解释，不能改变 rule output、数字、顺序或 Trip。保存/修改行程仍走 `TripProposal -> visible diff -> user confirm -> deterministic TripPatch`。

### 7.2 状态模型需要拆成三轴

Claude 将 `planned/ready/needs_attention/unavailable` 放在同一个 status 上，会混淆：

- `knowledgeAvailability`: `supported | partial | unavailable | conflicted | stale`；
- `userReadiness`: `ready | needs_attention | unknown | not_applicable`；
- `actionTiming`: `now | scheduled | waiting_window | completed`。

“预约窗口尚未开放”可以是 `knowledge=supported + readiness=ready/unknown + timing=waiting_window`；它不是内容 unavailable。“标准要求外语服务”应是 `knowledge=partial + readiness=unknown + recheck`，不能是 ready。

### 7.3 18 条规则逐类处置

| 规则组 | 处置 | 原因 |
| --- | --- | --- |
| wallet 未验证 -> attention | **采纳为 user readiness** | `walletBindingVerified` 是用户自报/确认 artifact，不是 public Fact；应允许选择其他 payment plan。 |
| 金额超过阈值 -> 3% warning | **条件采纳** | 只有支付 provider、卡种、当前活动和金额都解析时计算；不允许从任意 `expectedSpendCNY` 假定用户用该钱包。 |
| 无现金兜底永远不 ready | **需 operator 决策** | 至少一个独立 fallback 是合理安全目标，但是否必须为现金、适用于哪些 block、是否允许用户接受风险，是产品政策，不是 source Fact。 |
| steps 按存储顺序 | **采纳** | Procedure 的顺序是 reviewed content；LLM 不重排。 |
| 节假日/预约窗口/闭馆/最晚入场 | **采纳框架** | 必须使用 venue/timezone/current evidence；闭馆只有明确 current Fact 才能确定陈述。 |
| 免签/停留期对全行程 block 标记 | **采纳风险传播，避免复制 claim** | Trip-level Constraint 记录一次，block 持引用和 reason；不要复制成大量独立事实。 |
| 非酒店缺登记动作 | **采纳但渠道动态** | 24 小时 rule 有依据；action 需按地区解析线上或线下 channel，不能固定派出所。 |
| 服务不可达、出发前准备 | **采纳框架** | reachability 使用短 TTL Observation；eSIM 不自动硬阻塞。 |
| 无领事覆盖不能 ready | **采纳 fail-closed** | 但不能假定北京使馆覆盖；无 evidence 就 directory/recheck。 |
| 铁路核验不足 48h | **拒绝具体阈值** | 当前官方未承诺 48h；以可版本化 provider Fact/unknown buffer 替代。 |
| attached Fact 过期 -> 重算 | **采纳并加强** | 还应覆盖 edit/deprecate/conflict/licence revoked/projection version；Trip 不删除，只标 recheck。 |
| official grade + class entitlement -> ready | **拒绝** | 只能输出标准义务/预期并要求现场确认，不能证明运行可用。 |

## 8. 对 VP-Final 的迁移裁决

### 8.1 可迁移的行为/测试

- 五个 POI primary categories，不把 payment/language/accessibility 变成 category；[category enum](https://github.com/JTCAO515/VP-Final/blob/b5ef081f5e5766a59c547454f297acc69e908c56/packages/domain/src/knowledge/index.ts#L1-L21)
- reviewed/current eligibility、typed source、locator、evidence summary、verified/expiry/version；
- `poi/city/scene/national` target order；
- dry-run/commit、1 MB/1,000 row guard、stable source identity 和 idempotency/conflict checks；[bulk import contract](https://github.com/JTCAO515/VP-Final/blob/b5ef081f5e5766a59c547454f297acc69e908c56/apps/server/src/modules/knowledge/bulkImport.ts#L43-L124)
- import 永远创建 draft，private editorial review 不直接等于 published Fact；[database import service](https://github.com/JTCAO515/VP-Final/blob/b5ef081f5e5766a59c547454f297acc69e908c56/apps/server/src/db/knowledgeBulkImportService.ts#L101-L132)
- importer 并发幂等、重复回放无新事实、public 不见 draft 的 integration tests；[import integration test](https://github.com/JTCAO515/VP-Final/blob/b5ef081f5e5766a59c547454f297acc69e908c56/apps/server/src/db/knowledgeBulkImportService.integration.test.ts#L36-L133)
- reviewer identity、private audit、RLS、public reviewed-only read；[RLS pgTAP](https://github.com/JTCAO515/VP-Final/blob/b5ef081f5e5766a59c547454f297acc69e908c56/infra/supabase/tests/database/knowledge_fact_lifecycle.test.sql#L34-L145)
- Content AI 只能产出私有 typed Change Set，不能发布、绕过 review、自动合并 POI 或覆盖 version conflict。[Content AI constraints](https://github.com/JTCAO515/VP-Final/blob/b5ef081f5e5766a59c547454f297acc69e908c56/docs/constraints/content-ai.md#L6-L22)

### 8.2 必须重写/扩展

- 当前 `PoiFactSchema` 强制 `poiId`；V4 需要统一 target、conditions 和 non-POI entity，而不是同时保留两套相互竞争的 Fact schema；
- 当前 importer 把 POI identity 和一个 Fact 放同一 CSV row，且限定六城；V4 应先 `Imported Candidate -> identity resolution -> Canonical POI`，再建立 Fact Change Set；
- 当前 POI name/city/category 的 fallback merge 只适合 golden tests，不能直接处理 358 个等级名录的别名、合并/拆分/撤销；
- 当前 review policy 主要按少量 legacy fact type 分档；Claude 30 类必须逐类冻结 typed value、risk、source class、review policy 和 applicability；
- current Fact/RLS 的 public table 模式可作证据，但 V4 应按独立 Ops deploy、JWT/RLS RPC、worker-only system adapter 重新设计，不复制 service key 路径。

Supabase 当前文档要求 grants 和 RLS 同时设计，view 默认可能绕过 RLS，secret key 走 `service_role` 会 bypass RLS；因此“开启 RLS”不是完整验收。[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[Securing Data API](https://supabase.com/docs/guides/api/securing-your-api)

## 9. Claude 方案缺失的系统部分

| 缺失 | 风险 | V4 必须补入 |
| --- | --- | --- |
| 原始 catalogue + source locator/evidence excerpt | 数字不可重算，claim 无法逐条证伪 | machine-readable catalogue；每项 source/claim/conditions/risk/owner/status |
| Data License Registry / PolicyReceipt | “能访问”误当“可建库、可送 LLM、可公开展示” | field/surface/region/retention/derivative/attribution/purge policy |
| Candidate/identity/merge lineage | 官方名录名称误绑现有 POI | candidate batch、external ID、alias/geo、人审 merge、undo/split/tombstone |
| source update/delete/correction | 陈旧或撤销内容仍流向产品 | supersedes/conflict、deprecate、appeal/takedown、projection invalidation |
| Content Change Set 与 author/reviewer 权限 | AI/同一人自审或部分发布 | per-operation review + all-or-nothing publish + append-only audit |
| RAG projection | 原始表/散文直接进 prompt | eligible Retrieval Unit、exact-first hybrid、RRF、rerank、citation/claim validator |
| 五语 lexical/eval | 中文/阿语 exact 与 tokenization 漂移 | exact alias/`pg_trgm`/FTS/PGroonga/vector qrels benchmark |
| Explore projection | 知识有了但无法 city-first 筛选/排序 | same Fact IDs、typed facets、coverage/freshness、Ask/Add exact POI ID |
| Trip/Canvas invalidation | 保存后 Fact 更新无感 | receipt/version、recheck state、new Proposal，绝不静默改 Trip |
| privacy/retention | 票据、护照、语音、用户自报混入公共知识 | C0–C4 classification、private user artifact、deletion receipt |
| Ops maintenance economics | 只算首次 5 周，不算续期/冲突/撤销 | review queue throughput、expiry debt、rejection/correction、source failure SLO |

## 10. RAG 与数据库技术裁决

Claude 文档没有给出 RAG 实施，本审计维持 V4 五轮报告的最小方案：

```text
exact canonical ID / alias
 -> hard target + eligibility + permission filters
 -> lexical (`pg_trgm`/evaluated FTS) + exact vector
 -> RRF
 -> optional evaluated rerank
 -> small EvidencePack
 -> typed GroundedClaim / deterministic renderer
```

- Supabase 官方 hybrid search 使用 FTS + pgvector，并用 RRF 融合；该文档是示例，不代表它自动解决 VisePanda 的五语 tokenizer、eligibility 或权限。[Supabase Hybrid Search](https://supabase.com/docs/guides/ai/hybrid-search)
- pgvector 默认 exact nearest-neighbor 提供 perfect recall；ANN 以 recall 换速度，带 metadata filter 时可能返回不足。因此在真实 row count/p95/recall 触发前不要引入 HNSW。[pgvector indexing](https://github.com/pgvector/pgvector#indexing)
- Supabase 的 vector query 可以受 RLS 约束，但 V4 的 public/ops/private retrieval 必须使用不同 actor path，不能让浏览器用 service credential。[RAG with Permissions](https://supabase.com/docs/guides/ai/rag-with-permissions)
- `qwen3.7-text-embedding` 官方列出 201 种语言/方言、默认 1024 维；`qwen3-rerank` 支持 100+ 语言和最多 500 文档。这只证明候选能力，不证明 VisePanda 五语效果，必须用 qrels bake-off。[Qwen embedding](https://help.aliyun.com/en/model-studio/embedding)、[Qwen rerank](https://help.aliyun.com/en/model-studio/rerank)

`建议`：810 条量级甚至不需要 ANN；先 exact vector + lexical baseline。Embedding/Projection 是可删除重建的 read model，Fact 仍是真理源。

## 11. 过度设计与不足设计

### 11.1 过度设计

- 在原始 catalogue 和 pilot 前精确承诺 810/122/358/60/40/120/30 行；
- 以 30 个 fact type 宣称覆盖完成，而不是从真实问题/失败样本反推；
- 把 18 条 readiness 规则全部一次冻结，没有先实现 3–5 条 tracer bullet；
- 为不可操作的“标准义务”建立 ready 自动推断；
- Phase 2 直接规划 7,100 条词典，没有 source rights、review capacity 和 query evidence；
- 将可达性探测器与首批静态知识一起算 5 周，混合不同运行责任。

### 11.2 不足设计

- 没有 multidimensional applicability；
- 没有 record kind 和 source/claim separation；
- 没有 negative Fact、conflict、supersedes 和 effective period；
- 没有 identity resolution、licence、RLS、atomic publication；
- 没有 RAG/Explore/Trip projection contract；
- 没有五语/RTL、Safe Phrase 专业审核与高风险 unavailable gate；
- 没有 correction/takedown、ongoing review capacity 和 owner/cadence；
- 没有 acceptance report、fault injection、rollback 或 production observation window。

## 12. 实现前必须由 operator 决定

以下属于 D2/接口或权限决策；未裁决前不应开始 122 条批量转录：

1. **Record kinds**：是否接受 Fact / Procedure / SafePhrase / Directory / Observation / Rule 六类边界；
2. **Scope contract**：是否接受 target 与 applicability conditions 分离，以及 narrow-scope 不制造 negative inference；
3. **Payment product promise**：是否继续支持 per-POI Apple Pay/credit-card facets，而 national wallet guide 只作准备/兜底；
4. **Certification wording**：等级/星级只生成 obligation expectation + recheck，永不直接设 ready；
5. **Readiness state**：是否拆 knowledge availability、user readiness、action timing 三轴；
6. **Fact time model**：source effective period、review cadence、observation TTL 分离；
7. **Safe Phrase staffing**：五语逐 revision 的语言/医疗风险 reviewer 来源和 second-review policy；
8. **Source rights**：MCT/NIA/PBC/12306/各 venue/OSM/地图 provider 的 exact field、存储、展示、LLM、衍生和 purge 权限；
9. **Ops roles**：author/reviewer/admin/worker 的分权、same-person review prohibition 和独立 Ops deploy；
10. **Pilot**：选择一个普通城市和一个热门城市、每城 10–20 个 POI，以及 3–5 个 national/scene tracer rules；
11. **Coverage gate**：什么 evidence 才能把 city/fact family 从 unavailable 升级，不允许用行数单独晋级；
12. **Migration boundary**：只迁 VP-Final golden contracts/tests，通过 V4 `KnowledgeSystem` 重写实现，不复制旧目录或旧 Supabase 状态。

## 13. 推荐的最小验证顺序

本审计不创建 Issue，但建议后续 Issue 按以下证据顺序执行：

1. 冻结 `FactTarget + Applicability + EvidenceReceipt + eligibility`，移植 VP-Final positive/negative golden tests；
2. 为 `payment.wallet_fee_and_limit`、`entry.visa_free_program`、`stay.registration_rule/channel` 各做一组 typed fixtures，覆盖 supported/conditional/expired/conflict/unavailable；
3. 为一个 5A 景区做 `CertificationRecord -> obligation expectation`，证明它不会使语言服务 ready；
4. 以 10–20 行 source-backed candidate 做 dry-run/commit/replay/conflict/merge-ambiguity 测试，所有产物保持 draft；
5. 建 exact/alias/lexical/exact-vector Retrieval Unit，五语 qrels 先测，无证据 precision 和高风险 unsupported claim 必须为 0；
6. 同一 Fact IDs 投影到 Chatbot、Explore 和 Canvas；edit/deprecate/expiry/licence revoke 触发统一 invalidation；
7. 跑 public/owner/author/reviewer/admin/worker actor matrix、RLS pgTAP、audit failure rollback 和 projection-lag test；
8. 两城市 Ops pilot 测真实分钟/条、source failure、rejection、correction、expiry debt，再决定是否扩大到 122/810。

最低验收不应是“已录入 810 行”，而应是：

- 0 个 Candidate/Draft/expired/conflicted/无权内容泄漏到 public/RAG/Explore；
- Payment/Entry/Rescue 的 unsupported execution claim = 0；
- 所有 critical value 可追溯到 typed EvidenceReceipt/version；
- user 条件缺失、entity 歧义或 source 冲突时诚实 clarification/unavailable；
- Fact 失效可机械传播到 Retrieval、Explore、SEO 和 Canvas recheck；
- 一次 import replay 不新建事实，一次 audit/queue failure 不发生部分发布；
- 五语 retrieval 与 Safe Phrase 分开验收；
- 当前成熟度保持 `research/design proposed; runtime not implemented`。

## 14. 最终处置清单

### 直接采纳

- 宽 scope 复用、避免 per-POI 重复；
- 六个执行时刻反推知识需求；
- deterministic Canvas readiness；
- Procedure 顺序不由模型重排；
- Fact 失效触发 readiness 重算；
- 等级标准只能表述为义务/预期；
- fixed expressions 对高风险沟通的重要性。

### 修正后采纳

- 30 个 fact type 作为候选 catalogue，不作为完成定义；
- 30/90/180 天作为 review cadence，不代替 source validity；
- city reservation regime，不进行 POI negative inference；
- 5A/星级 class requirement，不触发 ready；
- wallet fee/limit，按 provider、活动、资格、金额条件分开；
- rail verification，去掉 48 小时硬编码；
- eSIM preparation，去掉“落地后绝对无法恢复”；
- mission contacts，按 nationality + consular district 建模；
- fixed phrase，升级为五语 revision + 专业复核。

### 拒绝或暂缓

- 810/122/5 周作为承诺；
- “全部旅客/全部时刻无 unavailable”；
- national wallet procedure 替代 per-POI card/Apple Pay；
- 拆单作为默认 fee avoidance；
- OSM/高德地址“原生完整”并直接用于 Show to Local；
- service reachability 作为长期 national Fact；
- official grade 自动使 Canvas ready；
- 在缺少 catalogue/source rights/pilot 时直接批量转录。

## 15. 来源索引

### 当前 V4/VP-Final 仓库

- [V4 AI Core 整体研究报告](../ai-core-integrated-research-report.md)
- [V4 软件工程开发与验收报告](../ai-core-engineering-development-acceptance-report.md)
- [V4 Knowledge/RAG/Explore 规划](../knowledge-rag-explore-plan.md)
- [VP-Final Knowledge domain](https://github.com/JTCAO515/VP-Final/blob/b5ef081f5e5766a59c547454f297acc69e908c56/packages/domain/src/knowledge/index.ts)
- [VP-Final Scoped Facts](https://github.com/JTCAO515/VP-Final/blob/b5ef081f5e5766a59c547454f297acc69e908c56/packages/domain/src/knowledge/scopedFacts.ts)
- [VP-Final Bulk Import](https://github.com/JTCAO515/VP-Final/blob/b5ef081f5e5766a59c547454f297acc69e908c56/apps/server/src/db/knowledgeBulkImportService.ts)
- [VP-Final Fact Review Runbook](https://github.com/JTCAO515/VP-Final/blob/b5ef081f5e5766a59c547454f297acc69e908c56/docs/runbooks/knowledge-fact-review.md)
- [VP-Final Content AI boundary](https://github.com/JTCAO515/VP-Final/blob/b5ef081f5e5766a59c547454f297acc69e908c56/docs/adr/ADR-0022-content-ai-control-boundary.md)

### 官方政策、标准与 provider

- [国家移民管理局：240 小时过境免签政策](https://www.nia.gov.cn/n741440/n741577/c1731205/content.html)
- [国家移民管理局：旅馆外住宿登记线上办理试点](https://www.nia.gov.cn/n741440/n741577/c1771556/content.html)
- [中国铁路 12306：互联网购票身份核验须知](https://kyfw.12306.cn/otn/gonggao/saleTicketMeans.html)
- [商务部等：外国商务人士在华工作生活指引](https://nsd.mofcom.gov.cn/tzyts/art/2024/art_a08888d0b9da42f083b00223edaf1de7.html)
- [中国人民银行：拒收人民币现金问题官方答复](https://www.pbc.gov.cn/zhengwugongkai/4081330/4081344/4081419/4081727/2025080819055236134/2019013110201572820.pdf)
- [文化和旅游部：大众旅游服务/5A 名录](https://lyfw.mct.gov.cn/)
- [SAMR：GB/T 17775-2024](https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=2FA5FF63790692575C2357E99D4E88EF)
- [政府网站公开文本：GB/T 17775-2024](https://www.qingcheng.gov.cn/qyqcwgdltj/attachment/0/168/168277/1965013.pdf)
- [SAMR：GB/T 14308-2023 检索](https://openstd.samr.gov.cn/bzgk/std/std_list?p.p1=0&p.p2=GBT14308&p.p90=circulation_date&p.p91=desc)
- [Apple：Apple Pay 使用条件](https://support.apple.com/en-us/120364)
- [OpenStreetMap licence](https://www.openstreetmap.org/copyright)
- [OSMF Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/)
- [高德开放平台服务协议](https://lbs.amap.com/pages/terms/)

### 数据库与模型

- [Supabase Changelog](https://supabase.com/changelog.md)
- [Supabase Hybrid Search](https://supabase.com/docs/guides/ai/hybrid-search)
- [Supabase RAG with Permissions](https://supabase.com/docs/guides/ai/rag-with-permissions)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Securing the Data API](https://supabase.com/docs/guides/api/securing-your-api)
- [pgvector](https://github.com/pgvector/pgvector)
- [Alibaba Cloud Model Studio：Embedding](https://help.aliyun.com/en/model-studio/embedding)
- [Alibaba Cloud Model Studio：Rerank](https://help.aliyun.com/en/model-studio/rerank)

## 16. 成熟度声明

本文件完成的是 Claude 方案的 source/code 对照审计，并给出可采纳、需修正、缺失、过度设计和实现前决策。它没有接受新的知识 schema，没有授权内容采集，没有证明 810 条可获得，也没有使 V4 具备 Knowledge/RAG/Explore/Canvas runtime。下一步仍应先冻结知识合同并做小批量 dry-run，而不是直接开始全国内容生产。

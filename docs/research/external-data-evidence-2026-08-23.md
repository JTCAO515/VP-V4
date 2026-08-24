# VisePanda V4 外部数据与 Chatbot / Trip Canvas 联动证据

- 研究日期：2026-08-23（Asia/Shanghai）
- 研究对象：Claude 草案 `/Users/jtcao/Downloads/externaldataplan.md`
- 目标：核验外部数据的当前可获得性、许可与产品边界，并给出可进入 Chatbot / Trip Canvas 的事实分级
- 证据规则：只采用 provider 官方 API 文档、官方服务条款/许可、政府或运营方官方页面和必要法规
- 未执行：未调用任何付费 API、未读取或测试 API Key、未申请账户、未接受商业条款、未进行生产流量测试

> 本文是研究证据，不等于已签约、已实测或已上线。价格、配额、覆盖与条款都可能变化，实施前必须再次读取账户实际合同与控制台。

## 1. 最终研究结论

Claude 草案提出的“六域里只有天气值得实时集成，其余全部事实库 + 深链”方向过于绝对。更准确的架构不是按数据域做一次性二选一，而是按**每一个字段的许可、时效和风险**分成五种产品形态：

1. **Reviewed Fact**：来自官方页面或运营方、经人工审核、可持久化的慢变事实。
2. **Live Observation**：来自合同允许缓存的 API，带 `provider / source / observedAt / retrievedAt / expiresAt / attribution`，过期后不可继续支撑回答。
3. **Ephemeral Observation**：只在当前交互实时展示，不进入知识库、不写 Canvas、不进入长期会话摘要。
4. **Deep Link**：把库存、下单、支付、导航或官方确认交回官方/持牌平台；链接是行动出口，不是事实证据。
5. **Unavailable**：没有合法、可靠、足够新的来源时明确说不知道，并给出官方检查路径。

由此得到的首发裁决是：

| 数据域 | 首发主形态 | 推荐源/出口 | 是否进入 LLM | Canvas 是否保存 |
|---|---|---|---|---|
| 天气实况/预报 | Live Observation | QWeather | 只输入归一化、已许可的数值；原始归属单独渲染 | 可保存查询地点和过期引用，不保存“未来仍有效”的天气承诺 |
| 空气质量 | Live Observation | QWeather | 可生成低风险出行提示；不得替代医疗建议 | 只保存过期引用/当天提醒 |
| 灾害/极端天气预警 | Live Observation + 官方出口 | QWeather 的官方预警聚合；原发布方链接 | 高风险快路：原文/字段确定性渲染，模型最多做标注清晰的辅助摘要 | 不把预警正文固化为行程事实；保存“需复核”状态即可 |
| 铁路车次/余票/票价 | Deep Link / Unavailable | 12306 英文站/App | 不抓取、不让模型猜 | 只保存用户选择的车站、日期和车次文本；发车前回官方复核 |
| 铁路规则/车站避坑 | Reviewed Fact | 12306、中国铁路/政府官方页 | 可检索、可引用 | 可以保存，必须有复核周期 |
| 城市交通路线/ETA | Ephemeral Observation 或 Deep Link | 高德实时路线/URI；合同通过前只深链 | 优先用确定性路线卡，不把 provider 内容交给 LLM 改写 | 保存起终点与出发意图；不保存 provider 路线、ETA、首末班时间 |
| 航班状态 | 候选 Live Observation + 官方出口 | Amadeus On-Demand Flight Status；航司/机场官方页 | 先做结构化卡和小范围摘要 | 可保存航班号与日期；状态只保存过期引用 |
| 航班/酒店价格与库存 | Deep Link | 航司、Trip.com 等 | 不让模型报“可订价” | 不保存报价；只保存用户确认的预算/选择 |
| 酒店“是否接待外国护照” | Reviewed Fact + Deep Link + 人工确认 | 官方政策、酒店/平台确认 | 不把平台标签当永久事实 | 用户确认后可保存；临近入住必须再确认 |
| 景点开放/预约规则 | Reviewed Fact | 景点官方页面/小程序/政府页 | 可引用，冲突时 fail closed | 可保存并设 `recheckAt` |
| 景点实时库存 | Deep Link / Unavailable | 景点官方渠道；商业平台只作替代购买出口 | 不猜库存 | 不保存库存 |
| POI 名称/地址/坐标 | 自有 Reviewed Fact；候选可用 Ephemeral | 官方运营方、经许可 OSM 数据；高德/Google 只按合同临时用 | 只有有持久化权的数据可进入 grounding | 只有自有/可持久化数据可保存 |
| POI 营业时间 | Reviewed Fact 或 Ephemeral | 官方运营方；Google/高德临时展示 | 非持久化源不进入生成与 TTS | 非持久化源不得保存 |
| 点评/图片 | 浏览卡/Deep Link | Google/Klook/Trip.com 等按各自条款 | 不作为执行事实；Google 内容不得交给 TTS | 不写 Trip，不进入事实库 |
| 汇率 | Live Observation（仅参考） | ECB SDMX；PBOC/SAFE 官方页面作为人民币参考 | 可算展示用估值，必须标注“非交易价” | 可保存预算基准与时间戳，不保存为支付承诺 |
| 支付环境 | Reviewed Fact | 中国政府/PBOC 指南 | 可回答准备步骤 | 可保存 checklist，不保存用户金融数据 |
| 节假日 | Reviewed Fact | 国务院年度通知 | 可检索 | 可以按自然年保存 |
| 应急号码/官方求助 | Reviewed Fact + 固定快路 | 中国政府、NIA 等 | 不让通用模型自由发挥；确定性模板 | 可保存离线应急卡 |

最重要的产品边界是：**Chatbot 可以编排外部数据，但 Trip Canvas 只能持久化用户意图、用户确认和具有持久化权的事实。**“API 返回了 JSON”不等于“可以写入事实库”。

## 2. 对 Claude 草案的逐项裁决

### 2.1 可接受

- 天气是最适合首发的实时源；QWeather 当前官方文档支持天气、空气质量和官方气象预警，且明确给出缓存建议和归属要求。[QWeather 服务范围](https://dev.qweather.com/en/docs/features/service-and-data/)；[缓存建议](https://dev.qweather.com/en/docs/best-practices/cache/)
- 12306 不应通过逆向接口或 API 市集接入。当前能确认的是 12306 官方网站/App 为正式售票出口；本轮未发现面向普通开发者的官方开放 API 文档。[12306 FAQ](https://www.12306.cn/en/faq.html)
- 酒店、铁路、门票领域存在大量“规则型事实”，这些更适合官方来源 + 人工审核，而不是让 LLM 或聚合平台永久背书。
- Google Places 的地点内容与持久化事实模型存在结构冲突，`place_id` 可以长期保存，但绝大部分 Places 内容不可持久化。[Places 政策](https://developers.google.com/maps/documentation/places/web-service/policies?hl=en)
- `Unavailable` 必须是一等产品状态，不能用模型猜测或过期值填空。

### 2.2 需要修正

1. **“六域里只有天气值得实时接入”未经证实。** Amadeus 官方明确提供 On-Demand Flight Status，包含更新后的起降时间、航站楼、登机口和延误状态；是否覆盖中国国内航班仍需样本实测，但不能先验判死。[Amadeus 官方案例与能力说明](https://developers.amadeus.com/PAS-EAS/api/v1/cms-gateway/sites/default/files/inline-files/1DMA%20Amadeus%20for%20Developers%20Oasis%20case%20study%20Online%2018-05-23%20FA_0.pdf)
2. **“Google Places 除 `place_id` 外全部不能缓存”过度概括。** 当前专项条款还允许 Places 经纬度临时缓存最多 30 天；`place_id` 可长期保存。名称、地址、营业时间、评论等仍不可持久化。[Google Maps 服务专项条款](https://cloud.google.com/maps-platform/terms/maps-service-terms)
3. **Google Places 与语音翻译链冲突比草案写得更严重。** Google Maps 总条款列明不得把 Google Maps Content 用于 text-to-speech；因此 Google 营业时间、评论或地址不能直接喂给 VisePanda TTS。[Google Maps Platform Terms，3.2.3](https://cloud.google.com/maps-platform/terms?sign=1)
4. **高德也不能直接作为 Trip 的持久化 POI 库。** 现行英文平台条款禁止预取、索引、存储/转售 Company Content，并举例禁止保存商户名、地址、时间、联系方式或评论；还限制与非高德地图混用。[高德平台条款](https://lbs.amap.com/api/policies/terms)
5. **“Trip.com 深链可预筛接待外宾”未由官方资料证明。** 官方联盟链接支持跳转到目的地/酒店页面，但 FAQ 明确连酒店入住日期参数都仍在开发中；本轮未找到可由联盟链接强制传递“接待外国护照”过滤器的官方文档。[Trip.com Affiliate Link FAQ](https://www.trip.com/partners/help/faq/tools)
6. **“Klook 没有 API”表述不准确。** Klook 官方伙伴页说明分销商可以对接 API，但这是商务合作，不是公开自助库存 API；普通 Affiliate 公开的是链接、Widget、搜索框与 Banner。[Klook 合作页](https://www.klook.com/partner/)；[Klook Affiliate](https://affiliate.klook.com/)
7. **Viator 不是简单的“自助可缓存数据源”。** 官方 API 要求成为内容/商业合作伙伴；Basic Affiliate 只能访问部分非交易端点，完整内容批量同步和实时 availability check 需要更高访问级别。它能合法同步产品和可用性，但产品是 Viator 的 tours/activities 库，不能冒充景点官方票源。[Viator API 概览](https://docs.viator.com/partner-api/)；[访问级别](https://docs.viator.com/partner-api/technical/)
8. **Amadeus Hotel Search 的“15 万物业、连锁偏向、因此会自信地错”缺少官方证据。** 当前官方文档说可完成约 15 万家酒店/住宿预订，Hotel List 来源包括 BEDBANK 与 DIRECTCHAIN；中国覆盖质量和“接待外国护照”字段均未被证明。正确结论是“它不解决 VisePanda 的核心接待约束”，而不是用未证实的偏向论断否定整个服务。[Amadeus Hotel API](https://admin.developers.amadeus.com/self-service/apis-docs/guides/developer-guides/resources/hotels/)
9. **“12306 从未授权任何第三方且没有合作计划”本轮无法由官方公开页面完整证明。** 可确认的是官方唯一售票渠道和外国护照可用；“绝无合作计划”应降级为未核验，不应写成事实。
10. **“景点实时名额全部活在微信小程序、没有任何 API”是过度泛化。** 故宫明确要求官方小程序且未授权第三方代票，但其他景点已有英文/多币种海外购票平台；应逐景点建事实，不应形成全国统一断言。[故宫官方订票](https://www.dpm.org.cn/subject_booking/)；[秦始皇帝陵博物院海外购票官方报道](https://english.www.gov.cn/news/202404/03/content_WS660d1cb4c6d0868f4e8e5b87.html)
11. Claude 引用的 ABC News “52 家/15 家”属于媒体实测，本研究不采用。官方资料仍承认现实中存在拒绝境外旅客的问题，并要求不得以“无涉外资质”为由拒绝；这足以证明产品需要“到店前再确认”，但不足以给出全国比例。[中国政府回应](https://www.hnhx.gov.cn/portal/zmhd/hygq/webinfo/2024/05/1718255213106456.htm)；[七部门措施](https://english.www.gov.cn/news/202407/26/content_WS66a2d827c6d0868f4e8e975c.html)

### 2.3 已核实的具体数字

- QWeather 当前阶梯价：天气及基础服务每自然月前 **50,000 次为 CNY 0**，其后 950,000 次为 CNY 0.0007/次，再随量下降。Claude 的“约 5 万、价格页需登录”已可由公开官方页直接核验。[QWeather Pricing](https://dev.qweather.com/en/docs/finance/pricing/)
- QWeather 允许个人开发者；中国境内企业可申请企业开发者。账户注册需真实邮箱和手机号码。境外个人注册成功率、可用手机号范围仍需实测。[开发者类型](https://dev.qweather.com/en/docs/account/developers/)；[账户管理](https://dev.qweather.com/en/docs/account/management/)
- Open-Meteo 免费 API 只允许非商业使用，限制为 10,000 次/日、5,000 次/小时、600 次/分钟；商业产品需订阅 customer API，数据采用 CC BY 4.0 并需归属。[Open-Meteo Terms](https://open-meteo.com/en/terms)；[License](https://open-meteo.com/en/license)
- Google Places 当前部分 SKU 有每月免费调用上限，例如 Place Details Essentials 为 10,000 次，之后首档公开单价为 USD 5/1,000 次；实际费用取决于 Field Mask/SKU。[Google Maps Pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
- Mapbox Search Box 默认 10 req/s，但官方覆盖仅美国、加拿大和欧洲，不覆盖中国大陆；它不是中国 POI 主候选。[Mapbox Search Box](https://docs.mapbox.com/api/search/search-box/)
- Mapbox Directions 默认 300 req/min；官方实时+典型交通覆盖表列出香港、澳门但未列中国大陆，因此大陆实时 ETA 不能在未实测前承诺。[Mapbox Directions](https://docs.mapbox.com/api/navigation/directions/)；[交通覆盖](https://docs.mapbox.com/help/dive-deeper/directions/)
- 12306 当前官方 FAQ 支持外国护照实名购票，英文网站支持购票、改签、退票和变更到站；政府英文指南说明可使用中国或外国银行卡和移动支付。[12306 FAQ](https://www.12306.cn/en/faq.html)；[中国政府 2025 指南](https://english.www.gov.cn/2025special/bizexpatsinchina2025)
- 国内铁路客票预售期当前仍为 15 天（含当天），铁路企业调整时会公告。[12306 公告](https://www.12306.cn/mormhweb/zxdt/202205/t20220531_37508.html)
- Trip.com Affiliate 官方称个人网站可申请、无地域限制、免费加入；网站 cookie 30 天、App tracking 7 天。它证明深链可行，不证明任何酒店接待标签永久可靠。[Trip.com Affiliate](https://www.trip.com/partners/index?locale=en-XX)
- ECB 汇率通常在每个工作日约 16:00 CET 更新，属于信息用参考价，不鼓励用于交易；EUR/RUB 参考汇率目前仍暂停，因此不能覆盖所有 VisePanda 语言对应货币。[ECB Reference Rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html)

## 3. 外部数据合同：Chatbot 和 Canvas 共同的硬边界

### 3.1 统一数据信封

每次外部调用都先由 provider adapter 归一化，不允许把任意网页文本或原始 JSON 直接拼进 system prompt：

```ts
type ExternalEvidenceEnvelope = {
  evidenceId: string;
  kind:
    | "reviewed_fact"
    | "live_observation"
    | "ephemeral_observation"
    | "deep_link"
    | "unavailable";
  domain:
    | "weather"
    | "air_quality"
    | "alert"
    | "rail"
    | "urban_route"
    | "flight_status"
    | "hotel"
    | "attraction"
    | "poi"
    | "fx"
    | "payment"
    | "holiday"
    | "emergency";
  provider: string;
  sourceUrl: string;
  retrievedAt: string;
  observedAt?: string;
  expiresAt?: string;
  locale: "zh" | "en" | "es" | "ru" | "ar";
  values: Record<string, string | number | boolean | null>;
  attribution: Array<{ text: string; url?: string; mustBeVerbatim?: boolean }>;
  licensePolicyId: string;
  allowedUses: {
    prompt: boolean;
    display: boolean;
    tts: boolean;
    cacheUntil?: string;
    persist: boolean;
    derive: boolean;
    combineWithOtherMap: boolean;
  };
  privacyClass: "public" | "coarse_location" | "precise_location" | "booking_data";
  failureMode: "official_deep_link" | "stale_disclosure" | "unavailable";
};
```

这里 `allowedUses` 必须来自版本化的 provider policy registry，而不是模型判断。条款变化时关闭 provider，不需要改 Trip 领域模型。

实现层不要只暴露一个大而全的 envelope；至少冻结以下四个可判别契约（商业深链继续使用 `DeepLink/CommercialOffer`）：

```ts
type ReviewedFact = {
  kind: "reviewed_fact";
  persistence: "durable";
  reviewStatus: "reviewed";
  sourceUrl: string;
  verifiedAt: string;
  expiresAt: string;
  supportingValues: Record<string, string | number | boolean>;
};

type LiveObservation = {
  kind: "live_observation";
  persistence: "reference_only";
  provider: string;
  observedAt?: string;
  retrievedAt: string;
  expiresAt: string;
  allowedUses: ExternalEvidenceEnvelope["allowedUses"];
};

type EphemeralObservation = {
  kind: "ephemeral_observation";
  persistence: "session_only";
  provider: string;
  deleteAt: string;
  allowedUses: ExternalEvidenceEnvelope["allowedUses"] & { persist: false };
};

type ExternalEntityRef = {
  kind: "external_entity_ref";
  provider: string;
  providerId: string;
  coordinateSystem?: "WGS84" | "GCJ02" | "BD09";
  refreshAfter?: string;
  // 只保存合同明确允许长期保存的 ID；不能借此复制 provider 内容。
};
```

`ReviewedFact` 是唯一默认允许长期支撑执行型回答的外部事实；`LiveObservation` 必须 TTL 化；`EphemeralObservation` 在本轮结束后删除；`ExternalEntityRef` 只是重新获取的句柄，不是事实本身。

### 3.2 Chatbot 调用顺序

```text
User turn
  -> deterministic intent/risk classifier
  -> location minimizer (city > coarse coordinate > precise GPS)
  -> provider policy gate
  -> reviewed retrieval and/or live tool call
  -> normalize + validate + TTL + attribution
  -> choose rendering path
       A. deterministic card (alerts, routes, flight status, offers)
       B. grounded generation (only allowedUses.prompt=true)
       C. official deep link
       D. unavailable
  -> citation/claim validator
  -> optional TripProposal (only durable, user-confirmable fields)
```

模型不能选择任意 URL、不能选择是否绕过 provider 条款、不能把 `ephemeral` 转成 `reviewed`，也不能把商业库存变成“事实”。

### 3.3 Canvas 保存规则

Canvas 可以保存：

- 用户意图：日期、城市、预算档、出行偏好、候选 POI、航班号、车站选择；
- 用户明确确认的决定；
- 可持久化的 Reviewed Fact；
- Live Observation 的引用、`retrievedAt/expiresAt` 和失效状态（前提是合同允许该缓存）；
- 重新检查任务：`recheckAt`, `reason`, `officialUrl`。

Canvas 不可以保存：

- Google Places/高德等条款禁止持久化的名称、地址、营业时间、评论、照片或路线；
- 实时余票、库存、报价、登机口或 ETA 作为长期承诺；
- 模型根据评论/图片生成的“事实”；
- 用户未确认的外部候选；
- 已过期的 Live Observation 作为当前有效信息。

推荐 Canvas 的视觉语义不是简单“已保存”，而是：

| 状态 | 含义 | UI 行为 |
|---|---|---|
| `confirmed` | 用户决定且持久化事实仍有效 | 正常展示 |
| `live` | 当前值仍在 TTL 内 | 显示来源与更新时间 |
| `recheck_required` | 临近执行或已过期 | 黄色提示 + 一键官方复核 |
| `external_only` | 只能在 provider/官方页面完成 | 显示深链，不复制库存/报价 |
| `unavailable` | 无合格来源 | 解释缺口和人工下一步 |

## 4. 分域证据与产品设计

### 4.1 天气、空气质量与灾害预警

#### QWeather

- **可获得性**：REST API 覆盖天气实况、小时/日预报、空气质量和气象预警。实况相对物理世界可能有 5–20 分钟延迟，应以 `obsTime` 为准。[实时天气](https://dev.qweather.com/docs/api/weather/weather-now/)
- **境外用户**：服务宣称全球部署；个人开发者可注册，但境外手机号/支付流程本轮未实测。数据覆盖中国和全球，预警/空气质量覆盖需按官方列表逐项检查。[QWeather FAQ](https://dev.qweather.com/en/help/)
- **实时性**：官方建议实况缓存 10–30 分钟、预警 5–20 分钟、实时 AQ 30–60 分钟。[缓存建议](https://dev.qweather.com/en/docs/best-practices/cache/)
- **限制**：必须显示 QWeather 归属；天气预警和空气质量必须完整显示响应中的来源信息，不得修改来源内容。GeoAPI 不得批量缓存、下载或建立索引。[归属要求](https://dev.qweather.com/en/docs/terms/attribution/)；[使用限制](https://dev.qweather.com/en/docs/terms/restriction/)
- **产品形态**：天气/AQ 为 Live Observation；预警为高风险 Live Observation + 官方出口；GeoAPI 只作查询辅助，不进入自建地点索引。
- **Chatbot**：普通天气可让模型基于归一化数值生成行程影响；预警必须先确定性显示原级别、时间、地区和官方来源，再允许模型生成标注为“辅助理解”的短摘要。
- **Canvas**：保存目的地/日期和过期引用；禁止把七天预报固化成长期行程承诺。出发前自动进入 `recheck_required`。

#### Open-Meteo

- **可获得性**：全球预报、历史、空气质量、洪水等模型 API；其数据是数值模型整合，不应被描述为中国官方实况或官方灾害预警。[Open-Meteo API](https://open-meteo.com/en/docs)
- **许可/价格**：免费层仅非商业使用并按 CC BY 4.0 归属；商业 VisePanda 必须使用付费 customer endpoint。免费层无 SLA。[Terms](https://open-meteo.com/en/terms)；[Pricing](https://open-meteo.com/en/pricing)
- **产品形态**：可作为商业订阅后的天气/气候备选或影子评测，不替代中国官方预警。
- **优势**：可用于规划期的气候/历史模式，而不是把远期天气预测伪装成精确预报。

#### 官方气象/环境渠道

- 中国气象局/国家预警系统有公开网页和跨部门交换标准，但本轮未找到面向普通商业开发者、带明确许可/配额的公开实时 API。国家预警数据交换标准主要用于各级预警机构和责任单位间交换，不能据此推断公众 API 权利。[GB/T 47321-2026](https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=0ED13E6D982EB340D4A5518F197619DA)
- 生态环境部公开全国空气质量状况与预报页面，但本轮未找到可直接签约的公众实时 API 许可。[生态环境部环境质量](https://www.mee.gov.cn/hjzl/)
- **降级**：QWeather 无数据或预警异常时，不回退到模型记忆；给出中国天气网/地方气象台、应急管理部门官方出口，并明确“当前无法核验”。

### 4.2 铁路与城市交通

#### 12306

- **外国旅客可用性**：英文站支持外国护照注册/实名，官方 FAQ 支持购票、改签、退票；政府指南说明可用外国银行卡。英文网站营业时段和具体规则应以当前 FAQ 为准。[注册页](https://www.12306.cn/en/register.html)；[FAQ](https://www.12306.cn/en/faq.html)
- **实时数据**：公众页面提供车次、票价与余票查询，但没有发现公开开发者 API 文档或可持久化许可。
- **明确禁止爬取**：12306 现行服务条款明确禁止使用未经网站认可的 robot、spider、crawler 或刷屏软件访问或登录，并禁止未经书面同意复制、修改、传输、存储、发布或分发网站资源。这一限制不因请求频率低而消失，因此 VisePanda **不应自建低频定时爬虫**。[12306 英文服务条款，第 6 与第 12 节](https://www.12306.cn/en/rule.html)
- **产品形态**：购票/余票/实时车次为 Deep Link；铁路规则、车站、换乘风险为 Reviewed Fact。
- **Chatbot**：回答“用什么证件、哪个车站、已订列车几点出发”时，可以使用用户导入并确认的车票字段及审核事实；回答“是否改点、晚点、停运、站台是否变化”必须转 12306/车站官方渠道，模型不能猜。
- **Canvas**：可保存用户从车票/确认信息导入并确认的车次、日期、车站和计划时刻；显示“计划时刻，不代表当日运行状态”。不保存爬取结果。

#### 已订火车行程的合法导入与运行状态

用户明确表示不做火车票购买，真正需求应拆为：

1. **计划时刻表**：用户手动输入，或上传自己的车票截图/PDF/邮件文本，由 OCR/解析器提取 `{trainNumber, travelDate, departureStation, arrivalStation, scheduledDeparture, scheduledArrival}`，经用户确认后进入 Canvas。
2. **订行程导入**：首发支持粘贴文本、截图/PDF 和 `.ics`；不接用户完整邮箱，不读取无关邮件。票面姓名、证件号、订单号、二维码先在客户端遮盖或服务端短 TTL 删除。
3. **当天运行状态**：当前没有合规公开 API 可持续查询。Canvas 在出发前显示 `recheck_required`，提供 12306 App/英文站及车站官方出口；重大线路事件可由 Ops 根据铁路官方公告建立短 TTL Reviewed Fact。

合法替代不是“换一个第三方爬虫”：第三方聚合/逆向源无法给 VisePanda 持久化与再展示权，也不能保证站台、晚点和停运准确。若未来出现中国铁路正式合作接口，必须重新做合同、覆盖、外籍用户和缓存评估。

#### 高德路线与 POI

- **能力**：官方 Web Service 支持驾车、公交、步行、骑行、电动车路线，公交响应含站点、首末班、距离和预计时长；路线可考虑实时交通。[高德路线 2.0](https://lbs.amap.com/api/webservice/guide/api/newroute)
- **限制**：现行条款禁止存储 Company Content、保存商户名/地址/时间/评论、与非高德地图混用，以及用内容训练/优化 AI。[高德平台条款](https://lbs.amap.com/api/policies/terms)
- **国际/境外**：国际 Places API 是 premium，需要工单开通海外权限；这不等于境外主体可直接完成大陆 API 的商业认证，本轮未实测。[国际 Places](https://lbs.amap.com/api/web-service/guide/searchs)
- **产品形态**：合同未确认前首发只用 URI Deep Link；若获得书面适用条款，路线结果仍按 Ephemeral Observation 处理。
- **Chatbot**：优先渲染确定性路线卡，不让模型重写路线步骤；用户问“怎么去”时提供高德导航深链。
- **Canvas**：只保存起终点和出发时段；每次打开或临近出发重新请求，不保存 ETA/首末班/拥堵路线。

#### Mapbox

- Search Box POI 官方只覆盖美国、加拿大、欧洲；中国大陆 POI 不适合。[Search Box](https://docs.mapbox.com/api/search/search-box/)
- Geocoding 有 temporary/permanent 两种授权，永久存储需对应 permanent 使用权；Directions 支持全球路线，但中国大陆实时交通未在官方覆盖表中。[Geocoding storage](https://docs.mapbox.com/help/dive-deeper/understand-temporary-vs-permanent-geocoding/)；[Directions coverage](https://docs.mapbox.com/help/dive-deeper/directions/)
- **裁决**：不作为中国大陆首发路线/POI 主源；可做境外阶段或地图 UI 备选。

#### OpenStreetMap

- OSM 数据采用 ODbL，可复制、修改、商用，但必须归属；发布衍生数据库可能触发 share-alike。[OSM Copyright](https://www.openstreetmap.org/copyright)
- OSMF 公共 Nominatim 最多 1 req/s、禁止 autocomplete/系统性 POI 下载，生产规模应自托管或使用商业 OSM 服务。[Nominatim Policy](https://operations.osmfoundation.org/policies/nominatim/)
- 公共 tile 服务器无 SLA，要求缓存、归属且禁止批量预取/离线包；生产应用不应把社区服务器当免费 CDN。[Tile Policy](https://operations.osmfoundation.org/policies/tiles/)
- **产品形态**：经许可治理的 OSM extract 可作为可持久化 POI 候选底座；中国餐饮 `opening_hours` 完整度仍未核验，不能承诺。

### 4.3 航班状态与航班购买

- Amadeus Self-Service 面向独立开发者和初创企业，可进入生产按量付费；测试环境只有受限数据，生产才是完整 live data。[Quick Start](https://admin.developers.amadeus.com/self-service/apis-docs/guides/developer-guides/quick-start/)；[FAQ](https://admin.developers.amadeus.com/self-service/apis-docs/guides/developer-guides/faq/)
- On-Demand Flight Status 官方描述包含实时航班时刻、航站楼、登机口和延误信息。[官方能力说明](https://developers.amadeus.com/PAS-EAS/api/v1/cms-gateway/sites/default/files/inline-files/1DMA%20Amadeus%20for%20Developers%20Oasis%20case%20study%20Online%2018-05-23%20FA_0.pdf)
- Flight Offers 数据有明确缺口：Self-Service 不返回部分大型航司和低成本航司，只返回 published fares；中国国内航司/机场状态覆盖、延迟和准确率没有官方分项数据。[Amadeus FAQ](https://admin.developers.amadeus.com/self-service/apis-docs/guides/developer-guides/faq/)
- 生产环境具体法律条款在开通后通过邮件提供，本轮无法核验缓存、展示和再分发权。因此不能在签约前把它建成事实库。
- **产品形态**：
  - 航班状态：P1 候选 Live Observation，先对用户已保存航班做影子评测；同时给航司/机场官方深链。
  - 航班报价/库存：Deep Link，不在 Chatbot 报“当前可订价”。
- **Canvas**：保存航班号、日期、机场和用户确认；状态/登机口卡带 TTL，过期即 `recheck_required`。
- **上线闸门**：至少对 CA/MU/CZ/HU/3U 等国内航司与 PEK/PKX/PVG/SHA/CAN/SZX/CTU/TFU/XIY 做 30 天、多时段、与航司/机场官方页比对后再决定。

#### 航班计划时刻与状态 provider 对照

用户不需要 VisePanda 购买机票，因此 API 只服务两件事：**核验已订航班的计划时刻**和**旅行日运行状态**。购买搜索、票价与库存不进入此链。

| Provider | 计划时刻 | 当天状态 | 准入/许可要点 | VisePanda 裁决 |
|---|---|---|---|---|
| **OAG Flight Info API** | 官方称覆盖 900+ 航司、计划航班未来 12 个月，计划数据约每 15 分钟更新 | 可返回预计/实际时刻、航站楼、登机口、延误、取消、备降等；Schedules + Status 可按订阅合并 | 14 天 trial 仅 100 hits；试用协议仅允许内部评估，禁止向第三方展示/复制/衍生并要求试用结束清除。生产展示、缓存、衍生权取决于商业合同 | 能力最完整，列为**商业合同候选 A**；未签生产授权前不得进入用户产品 |
| **Cirium Sky / FlightStats Flex** | Schedules by Flight 可查询未来特定航班，按机场/路线通常需更高合同档 | Flight Status 覆盖起飞前约 3 天至到达后约 7 天；含计划/预计/实际时间、gate/terminal/baggage；可选 Alerts | 14 天 trial；按 flight 的 schedule/status 可进入 Pay-As-You-Go，机场/路线/Feed/Alerts 多为 Contract；公开页未给出可持久化和 AI/TTS 权利 | **低量 MVP 候选 B（优先实测）**：只查用户已导入航班，避免全机场 feed |
| **FlightAware AeroAPI v4** | 官方产品表含未来航司计划时刻 | 含实时状态、计划/实际 block in/out、gate/terminal 与轨迹 | 当前公开 Standard License 允许在 B2C 产品的衍生作品中展示并要求归属，原始 AeroAPI Data 最多保留 30 天，除非订单另行允许；商业使用需相应付费许可 | **状态候选 C**：适合短 TTL 查询；不适合把 provider schedule 直接长期固化为 Trip |
| **Amadeus On-Demand Flight Status** | 以 `carrierCode + flightNumber + scheduledDepartureDate` 查询具体航班；不是全量长期 schedule feed | 官方描述为实时航班时刻、terminal/gate、duration 与 delay 状态 | Self-Service 对初创友好、生产按量；测试环境只含 live 数据副本且不实时更新；生产法律条款开通后另行提供，当前无法核验缓存/再展示权 | **易接入影子候选 D**；用来验证中国国内航班覆盖，不先作为唯一源 |

来源：[OAG Flight Info](https://www.oag.com/flight-info-api)、[OAG Schedules](https://www.oag.com/airline-schedules-data)、[OAG Evaluation License](https://www.oag.com/flight-info-api-evaluation-license-agreement)、[Cirium Schedules](https://developer.cirium.com/apis/cirium-sky-api/schedules)、[Cirium Flight Status](https://developer.cirium.com/apis/cirium-sky-api/flight-status)、[Cirium Subscriptions](https://developer.cirium.com/apis/cirium-sky-api/subscriptions)、[FlightAware 产品能力](https://www.flightaware.com/commercial/data)、[FlightAware Standard License](https://www.flightaware.com/commercial/aeroapi/AeroAPI_Standard_License.pdf)、[Amadeus 官方 SDK 示例](https://github.com/amadeus4dev/amadeus-node)、[Amadeus 测试数据说明](https://github.com/amadeus4dev/data-collection)

#### 已订航班导入与轮询策略

首发不依赖 PNR/GDS 通用导入，因为不存在“输入任意订单号即可读取所有航司订单”的公开通用 API。Amadeus Flight Order Management 只覆盖经其自身 booking flow 创建的订单；Cirium Trip Data Services 需要把旅客行程交给 Cirium 存储，扩大隐私和合同范围。

推荐路径：

1. 用户手动添加航司、航班号、出发日期；或上传自己的确认邮件/PDF/截图/`.ics`。
2. 解析器只提取航段字段，用户确认后写入 `UserImportedTransportSegment`；PNR、票号、姓名、证件号默认不保存。
3. 计划阶段：导入后立即查一次 schedule provider，发现差异时生成 Proposal，不直接改 Trip。
4. 临近阶段：T-72h、T-24h、T-6h 和用户打开行程时按需查询；有 provider push/alert 合同时优先事件驱动，避免高频轮询。
5. 执行阶段：任何状态卡显示 provider、`retrievedAt` 和“航司/机场通知优先”；变化需要用户确认或通过受控规则更新 Canvas 状态。
6. 结束后：provider 原始状态按合同 TTL 删除，只保留用户确认的实际事件或不可逆审计摘要。

在没有中国航班实测前，不应从“全球覆盖率”推断 CA/MU/CZ 等国内航司的 gate/terminal/取消更新完整。OAG/Cirium/FlightAware 的首轮对测应使用同一组已发生航班，与航司和机场官方页面做时间对齐；不调用购买/价格接口。

### 4.4 酒店

#### 外国护照接待事实

- 2024 年七部门要求地方部门和平台不得以“涉外资质”限制住宿经营者接待外国旅客，平台/商家不得违法宣传“不接待外国人”。[官方英文说明](https://english.www.gov.cn/news/202407/26/content_WS66a2d827c6d0868f4e8e975c.html)
- 政府回应同时确认现实中仍发生因系统或认知问题拒绝境外旅客的情况。[中国政府回应](https://www.hnhx.gov.cn/portal/zmhd/hygq/webinfo/2024/05/1718255213106456.htm)
- 因而“接待外国护照”不是一个可靠永久属性。它应为 `operator_confirmed`、含确认渠道/时间/入住日期的 Reviewed Fact，并在入住前再次确认。

#### Trip.com

- 中国政府 2025 指南明确把 Trip.com 列为外国旅客可用、可用国际银行卡的酒店预订渠道。[中国政府指南](https://english.www.gov.cn/2025special/bizexpatsinchina2025)
- Affiliate 允许免费加入和生成目的地/酒店深链，但当前官方 FAQ 不支持在联盟链接中固定酒店日期；未找到“接待外国护照”过滤器可写入深链的证据。[Affiliate FAQ](https://www.trip.com/partners/help/faq/tools)
- **产品形态**：Deep Link。Chatbot 可解释为何要在平台和酒店二次确认；不得声称深链结果已全部验证接待外宾。

#### Amadeus Hotels

- 当前官方 Self-Service 页面口径为超过 125,000 家住宿；Hotel List 来源包括 BEDBANK/DIRECTCHAIN。[Hotel API](https://admin.developers.amadeus.com/self-service/apis-docs/guides/developer-guides/resources/hotels/)
- API 未证明含“接受外国护照”字段；Hotel Booking 会传递客人和信用卡资料，且涉及 PCI DSS。生产条款需账户合同确认。[Amadeus FAQ](https://admin.developers.amadeus.com/self-service/apis-docs/guides/developer-guides/faq/)
- **裁决**：不进入首发。它解决搜索/预订，不解决 VisePanda 最关键的外国人接待可靠性，且会扩大支付/PCI/客服责任。

### 4.5 景点门票、预约和体验

#### 官方景点事实

- 景点规则必须逐景点研究。故宫当前要求实名预约、外国游客可用护照、最早提前 7 日 20:00 预约、除法定节假日外周一闭馆，并明确未授权第三方代理门票。[故宫官方订票](https://www.dpm.org.cn/subject_booking/)
- 这些字段可以成为 Reviewed Fact，但必须带 `effectiveFrom`, `reviewedAt`, `expiresAt/recheckAt`, `sourceLocator`，且临时闭馆公告优先于常规开放规则。
- 中国政府已要求主要景区保留线下售票、改进英文界面和外国护照支持，但这不是“所有景区已经做到”的保证。[入境游客便利措施](https://english.www.gov.cn/news/202403/29/content_WS6606c572c6d0868f4e8e5990.html)

#### Klook

- 普通 Affiliate 提供链接、Widget、搜索框、Banner 等；高级分销/供应合作可通过商务渠道接 API。[Affiliate](https://affiliate.klook.com/)；[Partner](https://www.klook.com/partner/)
- **产品形态**：首发为 Deep Link，并标明“第三方体验/票务渠道”；不可把 Klook 库存当景点官方库存。

#### Viator

- Partner API 可同步产品详情、图片、评论、价格与可用性；Full-access 合作伙伴可实时检查 availability，Affiliate 将交易跳转到 Viator。[API Overview](https://docs.viator.com/partner-api/)
- 官方建议 availability schedule 频繁增量更新并在交易前实时 check，说明“已缓存可用性”不等于“现在可订”。[Technical Guide](https://docs.viator.com/partner-api/technical/)
- **产品形态**：可作为 P2 的 Partner Inventory/Deep Link，用于 tour/experience，不用于证明故宫等官方门票是否可约。

#### 无法合法获得的实时名额

- 没有官方/签约 API 的景点名额必须为 Unavailable + 官方深链。
- Chatbot 可以给出预约窗口、证件、官方入口和准备步骤；不能说“现在还有票”。
- Canvas 保存“需预约”和 `recheckAt`，不保存库存。

### 4.6 POI、营业时间、点评与图片

#### Google Places

- Places 可提供名称、地址、评分、评论、照片、营业时间等；`currentOpeningHours` 是请求日起未来 7 天的当前/特殊营业时间。[Places Resource](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places)
- 缓存例外：`place_id` 可长期保存；Places 经纬度最多临时缓存 30 天；其余 Places 内容不得预取、缓存或存储。[Places Policy](https://developers.google.com/maps/documentation/places/web-service/policies?hl=en)；[Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms)
- 显示要求：非 Google 地图场景需 Google 归属；照片/评论需作者归属和 Google Maps 原内容链接；评论排序/过滤应说明。[Places Policies](https://developers.google.com/maps/documentation/places/web-service/policies?hl=en)
- Google Maps 内容不得用于 TTS，也不得用于训练/验证/微调 AI；条款还限制创建基于 Maps Content 的新内容。[Google Maps Terms](https://cloud.google.com/maps-platform/terms?sign=1)
- **产品形态**：最多作为 Single-turn Ephemeral 的原样 Places 卡。不得把营业时间/评论放进 LLM prompt、会话摘要、TTS、Trip 或自有事实库。若这一限制破坏核心体验，应不集成而用 Google Maps 深链。

#### 高德

- 中国大陆搜索/路线能力强，但同样禁止持久化地点内容，且限制与其他地图混用。[高德条款](https://lbs.amap.com/api/policies/terms)
- **产品形态**：POI resolver 只在单轮做候选消歧；最终写入 Trip 的 POI 必须由自有 Reviewed Fact、官方运营方或许可允许持久化的数据重新核验。更简单的首发是 Amap URI Deep Link。

#### OSM

- ODbL 允许建立可持久化地点底座，但要做许可隔离、归属和衍生数据库评估；公共服务不能承载商业生产流量。[OSM Copyright](https://www.openstreetmap.org/copyright)
- 主线程于 2026-08-23 做了两次小范围、只读、带 User-Agent 的 Overpass 抽样：上海框 `31.220,121.450,31.240,121.480` 有 293 个餐厅对象，仅 35 个带 `opening_hours`（11.9%）；成都框 `30.650,104.050,30.670,104.080` 有 88 个，仅 4 个带该字段（4.5%）。OSM base timestamp 为 `2026-08-23T12:08:57Z`。这只是两个中心城区小框，不能外推全城/全国，但已足以否定“直接依赖 OSM 营业时间即可覆盖首发”的假设。
- 该抽样还观察到上海 149/293、成都 26/88 个餐厅有 `name:en`；电话与网站字段更稀疏。名称候选可能有研究价值，营业时间/联系方式不能作为 P0 完整数据源。

#### 点评与图片的事实资格

- 评分/评论是偏好信号，不是营业时间、票价、接待资格或安全规则的事实来源。
- 用户图片 OCR/视觉识别只产候选；POI 需位置范围 + 可持久化 POI 数据 + 用户确认。
- 商业平台图片和评论不进入自有检索库，除非签约条款明确授予本地存储、AI 处理和再展示权。

### 4.7 汇率与支付环境

#### 汇率

- ECB 提供公开 SDMX API 和下载，参考汇率每个工作日更新；这些汇率仅供信息，不用于交易。[ECB SDMX API](https://data.ecb.europa.eu/help/api/data)；[Reference Rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html)
- ECB 当前不发布 EUR/RUB，且基准为 EUR。可以对支持币种做确定性叉算，但必须显示来源日期、计算路径和“最终以银行/支付应用为准”。
- PBOC 每日发布人民币汇率中间价，SAFE 发布月度各种货币对美元折算率，但本轮未找到对普通开发者稳定的官方 JSON API。[PBOC 中间价](https://www.pbc.gov.cn/zhengcehuobisi/125207/125217/125925/17105-2.html)；[SAFE 折算率](https://www.safe.gov.cn/safe/gzhbdmyzslb/)
- **产品形态**：ECB 为参考 Live Observation；PBOC/SAFE 可做 Reviewed Fact/人工采集证据。任何换算都不得称为刷卡/提现成交价。

#### 支付环境

- 中国政府/PBOC 指南说明境外旅客可使用现金、银行卡、Alipay、Weixin Pay、UnionPay；可绑定多种国际卡，但绑定结果、品牌范围、限额和收费以各支付产品页面为准。[2025 Guide](https://english.www.gov.cn/2025special/bizexpatsinchina2025)；[PBOC Payment Guide](https://english.www.gov.cn/news/202403/15/content_WS65f3bcb1c6d0868f4e8e51b5.html)
- **产品形态**：支付准备/备份方案为 Reviewed Fact；用户卡号、金融账户、支付失败详情不得进入模型或 Canvas。
- **Chatbot**：输出“主支付 + 备份卡 + 现金”准备清单；不保证某商户一定接受某卡。
- **Canvas**：保存非敏感 checklist，例如“已绑定 Alipay/准备现金”，不保存卡品牌后四位以外的任何金融信息；更稳妥是完全不存。

### 4.8 节假日与开放规则

- 国务院每年发布法定节假日与调休通知；2026 年安排已有正式通知。[国务院 2026 节假日](https://www.gov.cn/zhengce/content/202511/content_7047090.htm)
- 法定节假日不等于景点开放日、博物馆周一规则或交通运营时间。开放规则必须分别检索运营方公告。
- **产品形态**：年度节假日为 Reviewed Fact，按年过期；景点常规开放、临时闭馆和特别开放是三条不同事实，临时公告优先。
- **Canvas**：若行程命中节假日，标 `crowd_risk/recheck_required`，但不能自动删除景点或声称一定闭馆。

### 4.9 官方应急渠道

- 中国政府英文指南确认：人身侵害/财产犯罪拨 110，火警 119，急救 120；这些号码面向中国境内拨打。[官方指南](https://english.www.gov.cn/2025special/bizexpatsinchina2025)
- 12345 是非紧急政务热线，语言能力因城市而异；北京官方介绍有多语言支持，但不能推广成全国统一八语保证。[北京 12345 多语言说明](https://english.www.gov.cn/news/202412/06/content_WS675265f7c6d0868f4e8edb78.html)
- NIA 12367 为 24/7 移民管理热线，支持中英俄日韩等语言；不能把它当通用警务热线。[12367 多语言](https://english.www.gov.cn/news/202411/26/content_WS67455fb2c6d0868f4e8ed6cf.html)
- **产品形态**：Reviewed Fact + 固定模板 + 离线卡。危险场景不调用开放式模型生成步骤。
- **Canvas**：可以保存城市级应急卡、使领馆信息（需按用户国籍、官方来源单独研究）；号码必须显示适用地域与最近复核日期。

## 5. 隐私、数据地域与多 LLM 边界

### 5.1 精确位置是敏感个人信息

《个人信息保护法》把行踪轨迹列为敏感个人信息；处理需特定目的、充分必要性、严格保护措施和单独同意。向境外提供还需告知境外接收方等事项并取得单独同意。[PIPL 第 28–30 条](https://www.npc.gov.cn/npc/c2/c30834/202108/t20210820_313088.html)；[第 39 条](https://www.npc.gov.cn/WZWSREL25wYy8vLy8vL2MyL2MzMDgzNC8yMDIxMDgvdDIwMjEwODIwXzMxMzA4OC5odG1s)

2024 年数据跨境规定调整了安全评估/标准合同的门槛和例外，但没有取消告知、单独同意和个人信息保护影响评估等义务。[国家网信办规定](https://www.cac.gov.cn/2024-03/22/c_1712776611775634.htm)

因此：

- 默认用城市/POI 坐标，不请求实时 GPS；天气通常只需约 2 位小数坐标；
- 精确 GPS 必须在具体功能点击时单独授权，可撤回；
- 不把精确位置、护照、酒店订单、航班 PNR、支付信息传给多家 LLM 做“择优”；
- provider 调用只带最小字段，不带完整对话和 Trip；
- 用户图片先去 EXIF，除非用户明确允许使用位置做 POI 消歧；
- 日志中坐标做降精度/令牌化，原始媒体按短 TTL 删除。

### 5.2 Provider 地域现状

- Google Maps 会接收搜索词、IP 和经纬度并可用于提供/改进服务；要求对位置处理提前告知并取得可撤回同意。[Google Maps Terms](https://cloud.google.com/maps-platform/terms?sign=1)
- Mapbox 官方隐私页说明个人数据在美国 AWS 处理、可能经全球 CDN 缓存；这对中国境内精确位置构成明确跨境设计问题。[Mapbox Privacy](https://www.mapbox.com/legal/privacy)
- 高德是中国地图服务，但仍需在应用隐私政策披露 SDK/API 和所收集信息；是否将某个 API 请求视为境内处理要以签约实体和实际服务架构为准。[高德合规声明](https://lbs.amap.com/api/compliance-center/ability/data-security)
- QWeather 的公开文档证明全球部署和独立 API Host，但本轮未核验具体数据驻留区域；在签约前标记为 unknown，不作“境内存储”承诺。[QWeather API Host](https://dev.qweather.com/docs/configuration/api-host/)

### 5.3 多 LLM 不扩大外部数据权利

- 外部事实只经一次受控 retrieval，不能为了“让四个模型投票”复制到四家 provider。
- 模型路由只处理允许进入 prompt 的归一化事实；`allowedUses.prompt=false` 的数据走确定性组件。
- Google Maps Content 不能进入 TTS；Google/Amap/其他条款受限内容也不进入离线 eval 语料。
- 任何模型输出都不能把 ephemeral 结果转写为 Reviewed Fact。

## 6. 失败降级与引用规范

### 6.1 每域失败行为

| 域 | 失败时禁止 | 正确降级 |
|---|---|---|
| 天气 | 用模型记忆补温度/预警 | 显示“当前无法刷新”+ 上次值已过期 + 官方天气入口 |
| 灾害预警 | 只给模型摘要、隐藏原发布方 | 原发布方/时间/级别确定性展示；无法核验则建议查看官方渠道 |
| 铁路 | 抓取第三方余票、猜票价 | 12306 深链 + 已审核购票流程 |
| 城市路线 | 展示过期 ETA/末班车 | 重试一次；失败则高德/运营方导航深链 |
| 航班 | 以聚合状态覆盖航司状态 | 航司/机场官方链接 + “以运营方为准” |
| 酒店 | 把“可预订”写成“可接待外国护照” | 提醒平台/酒店双重确认，保存确认时间 |
| 门票 | 把商业 tour 当官方入场库存 | 景点官方渠道 + 预约规则 |
| POI 营业时间 | 模型猜、保存 Google/高德值 | 官方运营方或当轮原样卡；否则 unknown |
| 汇率 | 当成交价或换汇承诺 | 参考价 + 时间 + 支付产品最终价 |
| 应急 | 冗长生成、虚构英语服务 | 固定号码/官方渠道和简短行动指令 |

### 6.2 公共引用对象

Chatbot 向用户展示的引用需要至少包含：

```ts
type PublicExternalCitation = {
  label: string;
  sourceUrl: string;
  provider: string;
  retrievedAt: string;
  observedAt?: string;
  expiresAt?: string;
  attributionText?: string[];
  stale: boolean;
  commercial: boolean;
};
```

- provider 强制归属不能只放在折叠详情里；
- 商业深链标 `commercial=true` 并与事实来源分开；
- 引用必须能支持当前 claim，不能用 provider 首页替代具体条款/运营公告；
- 失效引用仍可保留审计，但不能继续授权事实。

## 7. 推荐开发顺序

### Gate 0：先冻结合同，不接 API

1. 定义 `ExternalEvidenceEnvelope`、provider policy registry、TTL 与失败 taxonomy。
2. 在现有 `TripProposal -> Canvas confirm -> TripPatch` 前加入持久化资格校验。
3. 建立 `Reviewed / Live / Ephemeral / Deep Link / Unavailable` 五类 fixture。
4. 建立五语 disclosure、归属和 stale UI；阿拉伯语检查 RTL。

### Phase 1：天气 + 审核事实 + 官方出口

1. QWeather adapter：天气、AQ、预警；严格按官方缓存和 attribution。
2. Reviewed Facts：12306 规则、支付准备、节假日、应急号码、首批景点开放/预约规则。
3. Trip.com / Klook / 12306 / 官方景点仅做有披露的 Deep Link。
4. Canvas 先实现 `recheck_required`，再实现任何“智能更新”。

### Phase 2：地图/路线临时工具

1. 优先上线 Amap URI 深链，不承担内容许可和存储复杂度。
2. 若确需嵌入路线 API，先取得高德适用合同书面确认，再做 Single-turn Ephemeral 路线卡。
3. OSM 只做小规模质量抽样和许可隔离，不直接依赖公共 Nominatim/tiles 做生产 SLA。

### Phase 3：航班状态影子评测

1. 签署/读取 Amadeus 生产条款并记录缓存、展示、归属、地区处理。
2. 用用户明确添加的航班号做 30 天影子评测，不做航班报价/订票。
3. 达到覆盖率、时延、准确率门槛后，才把状态卡开放给 controlled beta。

### Phase 4：商业 inventory（可选）

1. 只有在内容/库存覆盖经实测且商业责任明确时，再评估 Viator API。
2. Klook API 属商业合作；未签约前保持深链。
3. 不为“看起来实时”接 Amadeus Hotel/批发商；酒店首要问题仍是外国护照接待确认。

### 明确不做

- 12306 逆向、爬虫、MCP 包装或 API 市集；
- 把 Google Places/高德内容写入 Trip 或知识库；
- 把 Google Maps Content 送入 TTS；
- 将点评、照片或 LLM 结果升级为执行事实；
- 报任何未经实时确认的库存/可订价；
- 同时把精确位置和完整 Trip 发送到多家 LLM/provider。

## 8. 上线验收指标

| 维度 | 最低验收 |
|---|---|
| 事实资格 | 100% 外部 claim 有 envelope；无来源数值为 0 |
| 持久化 | Ephemeral/provider 禁存内容写入 Trip 为 0 |
| 过期 | 过期 Live Observation 继续支撑回答为 0 |
| 归属 | QWeather/Google/OSM/商业链接归属漏渲染为 0 |
| 安全 | 预警/应急走确定性快路；模型自由生成关键号码为 0 |
| 隐私 | 未授权精确位置外传为 0；护照/支付信息进入 LLM 为 0 |
| 商业诚实 | “参考价”被展示为“可订价”为 0 |
| Canvas | 未经确认写入为 0；不可持久化 provider 内容写入为 0 |
| 五语 | zh/en/es/ru/ar 的时间、数字、货币、归属与 stale disclosure 通过 fixture |

## 9. 仍未核验、必须由 operator/账户实测的事项

1. QWeather 境外手机号注册、账单支付和实际可用区域；公开文档不足以代替一次无密钥泄露的账户试用。
2. QWeather Developer License 完整合同对 LLM 生成摘要/翻译的具体授权；预警来源必须原样展示已明确，但衍生文本边界仍需书面确认。
3. 高德境外主体认证、面向中国大陆用户的商业许可、与 VisePanda 多地图/多 provider 架构是否可兼容。
4. Google Places 中国大陆实际覆盖、可达性和合同实体；即使技术可用，也不能突破缓存/TTS/衍生内容限制。
5. OSM 在目标城市中 POI、地址、`opening_hours` 的覆盖率与最近更新时间；需独立抽样报告。
6. Amadeus 对中国国内航班的实时状态覆盖、准确率、延迟，以及生产合同的缓存/再展示/归属权。
7. OAG 生产合同价格，以及用户端展示、缓存、衍生、翻译、LLM/TTS 和原始数据删除权；试用协议不授予这些生产权利。
8. Cirium Pay-As-You-Go 的按次价格、生产数据保留/再展示权，以及中国国内航班 gate/terminal/status 覆盖。
9. FlightAware Standard Order 是否需要把公开 Standard License 的 30 天原始数据保留期调整为更短产品 TTL，以及 AeroAPI 在中国国内航班的数据来源/覆盖。
10. 12306 是否未来提供正式合作接口；在此之前不做任何频率的未认可爬虫。
11. Trip.com 联盟能否生成带日期或“接待外国护照”条件的稳定深链；当前公开 FAQ 不支持日期参数。
12. Klook 分销 API、申请门槛、库存覆盖、缓存与展示条款。
13. Viator Basic/Full Access 实际审批条件、中国大陆产品覆盖和官方景点票源比例。
14. 每个景点的官方渠道是否允许深链、是否只接受小程序、护照/外卡/国际手机号实际流程。
15. PBOC/SAFE 是否有可签约或稳定公开的结构化汇率接口。
16. 中国境内/境外部署方案、数据处理者角色和 PIPL/GDPR 跨境合规；需要正式法律评估。

## 10. 建议写入最终规划的裁决

1. 接受五类外部证据合同，而不是“实时 API/事实库”二分类。
2. Phase 1 只接 QWeather；其余先做 Reviewed Facts、Deep Links 和 Unavailable，不代表永久否决航班/路线 API。
3. Google Places 不进入核心链，除非产品愿意接受“单轮原样卡、不能存、不能 TTS、不能生成衍生内容”的体验。
4. 中国地图首发优先高德深链；嵌入 API 需先解决不可存储和地图排他条款。
5. 航班状态保留 Amadeus P1 影子评测，不接航班价格/预订。
6. 酒店不接价格/库存 API；Trip.com 只作深链，外国护照接待必须是带时间的人工/运营方确认。
7. 门票以景点官方 Reviewed Fact + 官方深链为主；Klook/Viator 只作清晰标注的商业替代。
8. Canvas 保存用户决定和可持久化事实，所有动态外部值都显示更新时间/过期状态；禁止把 provider JSON 直接变成 TripPatch。
9. 精确位置、护照、订单、金融信息不进入多模型择优；外部数据权限不会因换模型而扩大。

---

### 研究状态说明

- 已完成：公开官方文档、公开条款、政府/运营方页面的交叉核验；Claude 关键断言的接受/修正/未证实分类。
- 未完成：任何需要账户登录后才能看到的商业合同、生产 API 实测、付费调用、覆盖率抽样和法律意见。
- 本文因此可作为开发前 Gate 0 的证据基线，但不能单独授权部署、付费、签约或公开能力承诺。

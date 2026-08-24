# Claude Knowledge Base Plan：研究处置与最终建议

- Date: 2026-08-24
- Input: `/Users/jtcao/Downloads/knowledgebaseplan.md`
- Status: **research disposition; not an accepted ADR or production content approval**
- Machine-readable result: [draft-knowledge-base.json](draft-knowledge-base.json)

## 0. Verdict

Claude 提出的“用 national/city/scene/poi scoped facts 支撑六个执行时刻”方向正确；把 class standard 表述为义务而不是现场保证，也值得保留。

但“约810条、5周、30类即可让六个时刻核心问题都不再 unavailable”没有可复验证据。被引用的 `research/fact-catalogue.json` 不存在，且458条脚本数据、150条人工签署语言记录、具体来源许可和审核人都尚未获得。

因此本轮只建立30个Knowledge Record Type Candidate和18条Readiness Rule Candidate。它们包含未来的Fact、DirectoryEntry、Procedure和SafePhrase候选；Reviewed/eligible Fact保持0，不批量生成810条记录。

## 1. Adopt

| Claude idea | Why retained | Guardrail |
| --- | --- | --- |
| scoped Fact targets | 已与VP-Final national/city/scene/poi合同方向一致 | scope由authority/variability/target决定，不设national默认 |
| procedure引用其他Facts | 避免playbook重复声明数字和政策 | 每个关键值使用EvidenceReceipt/GroundedClaim |
| booking window未开=`planned` | 等待不是失败，避免警报疲劳 | reminder时间必须来自current venue Fact |
| expiry传播到Canvas | 将知识生命周期机械连接到用户准备状态 | 保留用户决定，只让旧值recheck/unavailable |
| class standard作为obligation | 标准条文可解释设施/服务义务 | 只能informational，不证明现场交付或readiness |
|双语高风险人工审核 | allergy/medical/urgent phrasing不能依赖机器自审 | reviewer能力、版本、severity和独立签署必填 |

## 2. Revise

### 2.1 Scope不是national by default

正确问题是：这条claim由谁发布、在哪个地域/对象上变化、它具体描述谁。

- national：国家政策、国家标准及其条件；
- city：市级机关发布并改变全市执行的规则；
- scene：产品拥有的执行流程或Safe Phrase语境，不代表来源权威；
- poi：场馆/商户/设施的具体运营事实；
- class entitlement：国家标准中的类级义务，使用`classKey`连接，但不增加第五个scope。

### 2.2 810条是未验证估算

Claude文档中的810来自202条人工记录、458条脚本/批量记录和150条人工签署语言记录。当前没有原始catalogue、逐条source locator、license policy、reviewer、去重结果或实际导入报告。

记录数应在source dry-run后计算，不能先作为产品覆盖承诺。

### 2.3 TTL不是事实有效性的唯一来源

30/90/180天可以作为review policy candidate，但每条Fact还需要：`validDuring`、`conditions`、`timezone`、`sourcePublishedAt`、`supersedes`和event-driven revocation。

2026-08-20国家移民管理局将240小时过境免签适用国家更新到57国，证明政策需要dated source和快速失效，而不是依靠模型记忆。[国家移民管理局](https://www.nia.gov.cn/n741440/n741577/c1731205/content.html)

### 2.4 Class entitlement不等于服务存在

GB/T 17775—2024包含中外文对照解说等要求；GB/T 14308—2023是现行推荐性国家标准。[GB/T 17775—2024](https://www.qingcheng.gov.cn/qyqcwgdltj/attachment/0/168/168277/1965013.pdf)、[GB/T 14308—2023](https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=7CCF40654C89E4ABFE6839B1067216B1)

标准条文只能支持“该等级应满足的义务”。POI等级目录还必须current并能稳定匹配；现场是否有某语种人员/设备仍需venue-level evidence。`poi.official_grade + class entitlement`不能让Canvas自动ready。

### 2.5 Knowledge content需要分型

- `PolicyFact`：政策与标准；
- `OperationalFact`：具体场馆/渠道当前规则；
- `ObservedFact`：有时间/方法/地域的观察；
- `DirectoryEntry`：热线、领事机构、机构类条目；
- `Procedure`：有序步骤，关键值引用其他Facts；
- `ClassEntitlement`：类级义务；
- `SafePhrase`：专业双语审核表达；
- `EditorialAssessment/DerivedFacet`：不支撑关键执行claim。

### 2.6 National duty and local channel must be separate

The 24-hour non-hotel accommodation registration duty can be a national Policy Fact. The execution channel is not nationally uniform: the National Immigration Administration launched online handling in seven pilot regions on 2026-03-20 and retained in-person assistance paths.[NIA policy interpretation](https://www.nia.gov.cn/n741440/n741577/c1771556/content.html)

Canvas may flag the national duty, but it must retrieve a current city/province channel or show an official generic fallback. It cannot always create a police-station action or treat a future phase-3 directory as optional to execution.

## 3. Reject or hold

### 3.1 “全部核心问题不再unavailable”

知识库必须允许missing、unknown、conflict和unavailable。没有POI实时预约、商户支付、现场语言服务、网络观测或领事覆盖时，诚实降级才是正确结果。

### 3.2 “只是转录，不是研究”

官方页面也要验证authority、有效日期、适用人群、条件、例外、supersession、翻译和许可。高风险政策转录仍是研究和审核工作。

### 3.3 拆单规避3%手续费

商务部2024指引支持“单笔不超过200元无额外服务费；超过200元按交易金额3%收费”的当时说明。[商务部指引](https://nsd.mofcom.gov.cn/tzyts/art/2024/art_a08888d0b9da42f083b00223edaf1de7.html)

它不证明商户允许拆单，也不证明2026促销、UnionPay豁免和所有provider/账户条件。Readiness只可展示current fee Fact和确定性计算；不主动建议拆单规避。

### 3.4 OSM/高德地址“原生完整”

地址必须有source、license、coordinate system和identity match。Google/高德不能作为默认可持久化自有底库；OSM也需ODbL/derived-database和production service裁决。Show-to-Local不能把provider存在等同于地址真理。

### 3.5 自动探测40个服务

`network.service_reachability`需要合法、可重复、带route/time/location-class的观察方法。没有合规和测量设计前，不创建探测器或public Fact，也不提供规避网络限制的指令。

### 3.6 五周交付承诺

页面结构不一、来源许可、identity matching、双语审核、冲突和Ops容量均未实测。五周只能是Claude假设，不是accepted estimate。

## 4. Canvas Readiness disposition

18条候选规则已写入JSON，但全部`executable:false`。

关键修正：

- readiness按dimension计算，`payment_preparedness=ready`不代表merchant payment会成功；
- visa和住宿登记是trip-level gate，不给每个block复制同一警告；
- holiday不自动等于需要预订，必须结合city/venue current Fact；
- eSIM不是普遍硬阻塞，仍可能存在Wi-Fi/漫游/实体SIM等替代；
-领事机构缺失触发recheck与通用紧急fallback，不使全部rescue能力失效；
-“48小时护照审核”无直接当前来源时保持missing；
-class obligation只显示义务和hedge，永不直接使POI ready；
-Fact过期后保留用户Trip决定，移除旧claim并标`recheck_required`。

## 5. Recommended build sequence

```text
K0 candidate catalogue（本轮完成）
 -> DEC/contracts and AI-11 dependencies
 -> one synthetic lifecycle fixture
 -> one execution-scenario source batch, <=10–20 drafts
 -> independent review and eligibility tests
 -> retrieval/Explore projection
 -> non-executable readiness shadow evaluation
 -> operator acceptance before runtime rule activation
```

首批不要同时覆盖六个执行时刻。优先选一个有直接官方来源、可穷尽条件和明确安全owner的场景；任何高风险字段缺证据时保持missing。

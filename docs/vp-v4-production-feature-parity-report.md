# VP-V4 正式产品功能等价、开发优化与验收规划

> 状态：proposed product and engineering baseline
> 日期：2026-08-25
> Parent Program：[AI-00 / GitHub #2](https://github.com/JTCAO515/VP-V4/issues/2)
> 视觉母版：`JTCAO515/VP-Early-Access` 交互式 Demo
> Figma Board：[VisePanda VP-V4 Production Parity & AI-Canvas Upgrade Board](https://www.figma.com/board/pEPaqbirZ7Jkc7GinD1F5c)

## 0. 最终裁决

VP-V4 应在正式产品中复现交互式 Demo 展示的全部用户能力，但不迁移 Demo 的静态数据、统一状态枚举、本地状态切换和虚构账号。

这里的“功能等价”定义为：

1. 用户能完成与 Demo 相同的任务；
2. 关键结果来自真实持久化、合格证据或诚实降级；
3. 任何 Trip 修改都先产生不可变 Proposal，再由用户确认并原子应用；
4. 每个可点击动作只能真实完成、明确 unavailable/degraded，或被 feature flag 隐藏；
5. 不允许用静态 Toast、Fixture 价格或虚构服务冒充完成。

Demo 是产品行为与视觉验收母版，不是生产数据库种子、领域模型或后端实现。

## 1. G0：目标、范围与反目标

### 1.1 Objective `r`

交付一个真实的 VisePanda planning-and-execution workspace，使国际自由行旅客可以通过 Chatbot 建立和调整计划，在 Trip Canvas 中确认唯一行程状态，并通过 Today、Copilot、Tools、Explore 和 User 完成行前准备与旅中执行。

### 1.2 当前观测 `y`

- VP-V4 `origin/main@ab120b8` 已包含 `/visepanda` 前端产品壳和 R0/R1 部分合同、迁移、Trip Workspace、Fake Turn、RLS 与平台基线。
- GitHub Program #2 已覆盖 Chat/Canvas、模型网关、RAG、Knowledge、Explore、多模态、天气、航空和铁路主线。
- 当前用户可见产品仍以 preview/fixture 为主，没有完成 Demo 全量真实能力。
- `AI-13` Canvas Diff/Confirm/Reload 和 `AI-14` RLS/Fault 是当前可执行 frontier；模型、RAG、Explore、多模态和外部数据仍受依赖门控制。

### 1.3 偏差 `e`

现有 Program 能形成核心 AI/Trip/Knowledge 闭环，但缺少完整的 Memory、User、Today、Tool Registry、非翻译 Tools、通用攻略导入、离线能力和全产品等价验收门。

该偏差为 D2：它跨越产品信息架构、状态所有权、权限、持久化和多个模块接口，不能通过一个前端大 PR 修补。

### 1.4 Scope

- 正式产品六个工作面和一个共享 Trip 状态；
- Chatbot、Trip Canvas、Today、Copilot、Tools、Explore、User 的真实行为；
- Deep link、桌面分屏、移动分段、五语和 RTL；
- 真实持久化、Evidence、Proposal、权限、离线与失败状态；
- 将 Demo Fixtures 转成 contract/eval/E2E 测试资产；
- 新增缺失 Issues 和最终 parity acceptance gate。

### 1.5 Anti-goals

- 不优化或重写 Early Access 营销页面；
- 不把 Demo POI、评论、价格、支付或天气导入生产；
- 不购买机票、火车票、酒店或景点票；
- 不做 12306 周期爬虫；
- 不让模型、Explore、Tool 或客户端直接修改 Trip；
- 不以四模型 ensemble 代替任务级 Eval；
- 不在 R1/R2 恢复旧 VP-Final 全量 monorepo 或高权限 Ops UI。

## 2. 最终产品信息架构

```text
VisePanda Product Shell
├─ Today
├─ Ask VisePanda
│  ├─ Chat
│  └─ Trip Canvas
├─ Copilot
├─ Tools
├─ Explore
└─ User
```

### 2.1 每个产品面的唯一职责

| 产品面 | 唯一职责 | 不能拥有 |
| --- | --- | --- |
| Ask VisePanda | 理解、澄清、解释并产生 Answer/Card/Proposal | Trip 直接写入、事实资格裁决 |
| Trip Canvas | 当前 Trip、版本、Diff、确认和行动投影 | 模型生成、provider 调用 |
| Today | 当前符合资格的下一步、检查与恢复入口 | 隐式更改 Trip、自由文本事实 |
| Copilot | 有来源的旅行记忆、硬约束和影响记录 | 账户身份、通知和权限设置 |
| Tools | 翻译、地址、交通辅助、法规、网络和交接任务 | 自建 Trip 状态、无确认外部动作 |
| Explore | 城市和 Canonical POI 的 eligible projection | 静态 seed、AI 生成 POI、直接 Add |
| User | 账户、显式偏好、隐私、导出和删除 | 推断记忆、模型判断 |

### 2.2 Route 建议

```text
app/(product)/visepanda/
app/(product)/chat/[chatId]/
app/(product)/trips/[tripId]/
app/(product)/today/
app/(product)/copilot/
app/(product)/tools/[toolId]/
app/(product)/settings/
app/explore/[city]/
app/[city]/[poi]/
```

路由用于 deep link、恢复和可测试性；视觉上仍保持一个连续 Product Shell。

## 3. Demo 到正式产品功能等价矩阵

| Demo 能力 | 正式产品等价结果 | 现有覆盖 | 缺口/控制动作 |
| --- | --- | --- | --- |
| 11 段多轮对话 | Durable Turn、历史、澄清、反馈和恢复 | #14、#18–#22 | 新增 Chat UX/History Issue |
| Chat 与 Canvas 同步 | 同 Trip ID、同 Context、Proposal-ready event | #5、#8、#12、#14、#15 | 完成 #15 并接真实 Turn |
| Canvas Timeline/Map/Bookings | Timeline、Place View、Reservations & Actions 投影 | #15 部分 | 新增 Canvas projection Issue |
| Canvas Diff/确认/版本 | immutable revision、partial select、CAS、reload | #11、#12、#15 | #15 是 P0 |
| Evidence/Confidence/Recheck | EvidenceReceipt、GroundedClaim、eligibility、expiry | #5、#13、#22 | UI 不显示 provider 原始字段 |
| Today 下一步 | deterministic NextAction + qualification explanation | #37、#38 仅数据侧 | 新增 Today Engine |
| 四种恢复路径 | Recovery Plan -> TripProposal -> confirm | #15 可复用写入 | 新增 Recovery Issue |
| 九项行程检查 | 规则和证据驱动的 CheckResult | 未完整覆盖 | 新增 Trip Check registry |
| Copilot 12 条记忆 | explicit/confirmed/inferred Memory lifecycle | 无完整 Issue | 新增 Memory module |
| Tools 三种健康状态 | Capability Registry + health + fallback | #48、#49 部分 | 新增 Tool Registry |
| 文本/OCR/STT/TTS | 真实翻译、纠错、同文本 TTS、TTL 删除 | #32–#36 | 沿现有 R4 |
| 叫车辅助 | 上车点、中文地址、预估和 provider handoff | 未覆盖 | 新增 Ride Assist，不代叫不支付 |
| 签证与法规 | scoped Policy Fact、官方渠道、recheck | #22、#37 部分 | 新增垂直产品 Slice |
| 网络/SIM | reviewed Guide/Fact + preparation checklist | Knowledge 可支持 | 新增垂直产品 Slice |
| Human Handoff | 交接材料、官方紧急渠道和运营边界 | 未覆盖 | 新增能力，默认非实时客服 |
| Explore 城市与 POI | eligible projection、稳定 ID、field-level facts | #24–#31 | 沿 R3 |
| Explore Ask/Add | exact POI ID -> context/proposal | #30 | 不得重解析卡片文字 |
| User 五个标签 | Auth、Profile、Preferences、Privacy、Export/Delete | #6、#16 仅基础 | 新增 User lifecycle |
| 攻略 PDF/链接导入 | private UserArtifact、抽取、纠错、冲突和 Proposal | #32、#39 部分 | 新增 General Import |
| 菜品与过敏卡 | typed allergy constraint + Safe Phrase | #22、#33–#35 部分 | Knowledge/Translate 联合 Slice |
| Offline | 已保存 Trip、地址卡、Safe Phrase 可用 | 未覆盖 | 新增 Offline Issue |

## 4. 必须重写的领域语义

### 4.1 不再共享一个 `FactState`

Demo 的 `confirmed/proposed/inferred/recheck` 适合视觉说明，不适合作为生产全局状态。

```text
FactStatus:
candidate | draft | reviewed | expired | blocked | unavailable

ProposalStatus:
building | pending | applied | rejected | expired | conflicted | superseded

TripNodeStatus:
planned | confirmed | completed | skipped | cancelled

MemoryStatus:
explicit | confirmed | inferred | rejected | paused | deleted

ProviderHealth:
healthy | degraded | offline
```

UI 可以继续使用统一视觉语言，但必须从各领域状态显式映射，不能用颜色反向决定业务状态。

### 4.2 Evidence 升级

Demo `Evidence` 只有 label、checked 和 validity。生产 `EvidenceReceipt` 至少需要：

- immutable source/fact/observation/artifact ID；
- schema/version；
- scope 和 applicability；
- reviewedAt/retrievedAt/expiresAt；
- provider 和 PolicyReceipt；
- licence purpose；
- redaction/data class；
- supporting claim IDs。

Confidence 只能表达模型或抽取不确定性，不能替代 Fact eligibility。

### 4.3 POI 能力字段升级

支付、语言、入场和无障碍字段不能只有 supported/unsupported。

```text
supported | unsupported | partial | conditional | unknown | not_applicable
```

每条值必须包含具体对象、情境和条件。例如公共空间本身没有结账行为，Apple Pay 应为 `not_applicable`，而不是 `supported`。

### 4.4 Bookings 更名

在没有购买服务时，Canvas 第三视图应显示为 `Reservations & Actions / 预约与行动`：

- 时刻表与行程信息；
- 用户票据状态；
- 是否需要预约；
- 官方渠道；
- 待办与复核；
- 不产生订单或支付。

## 5. 目标运行架构

```text
React Product Shell
  -> authenticated application routes
  -> deep product modules
     TurnCoordinator
     TripWorkspace
     KnowledgeSystem
     ExternalEvidenceResolver
     MediaTranslation
     MemoryProfile
     TodayEngine
     ToolRegistry
  -> platform seams
     Identity/RLS
     ModelGateway
     Observability/Policy
  -> Supabase/Postgres + private media storage
```

规则：

- route 只做 auth、parse、application call 和 response；
- domain schema 不依赖 Next、Supabase 或 provider SDK；
- provider response 必须先映射为内部结果；
- 所有 Trip 写入只经过 `ConfirmAndApplyProposal`；
- public Web 与高权限 Ops 分离部署；
- 未出现第二个真实 runtime consumer 前不抽全量 monorepo。

## 6. Fixture 资产的高质量迁移

| Demo 资产 | 新用途 | 禁止用途 |
| --- | --- | --- |
| 11 chats / 74 turns | Eval corpus、E2E journeys、copy states | 固定模型答案 |
| 11 Canvas docs | Golden contract fixtures | 生产 Trips |
| 12 Diff entries | accept/reject/partial/conflict tests | 本地 UI 假写入 |
| 12 memories | Memory lifecycle test matrix | 真实用户默认画像 |
| 34 Tool screens | Tool state-machine acceptance | 声称 provider 已连接 |
| 4 city states / 9 POIs | staging projection fixtures | 生产 Knowledge seed |
| 4 recovery paths / 9 checks | deterministic rule tests | LLM 自由决定 |

迁移分类固定为：

- `reuse contract/test`：行为与负例；
- `port behavior`：已证明有价值但实现要适配新接口；
- `rewrite`：UI、状态、provider、数据库和权限；
- `retire`：虚构数据、直接写入、静态真实感和重复真理源。

## 7. 新增工作包建议

下列为 Issue 草案，不在本文中自动创建：

| ID | 工作包 | Dependencies | 验收核心 |
| --- | --- | --- | --- |
| AI-51 | Demo Parity Contract 与 Capability Registry | #5、#48 | 每个 Demo 动作有 owner/maturity/failure/issue |
| AI-52 | Product Shell、Deep Link 与 Feature Gate | #15、#49 | 六面五语/RTL/mobile，未就绪能力隐藏或降级 |
| AI-53 | Durable Chat History、Feedback 与 Scenario UX | #14、#18–#22 | 多轮/reconnect/cancel/feedback 可恢复 |
| AI-54 | Canvas Timeline/Place/Actions Projection | #15、#22 | 三视图同版本、无第二真理源 |
| AI-55 | MemoryProfile Contract 与 RLS | #6、#16 | 来源/否定/暂停/删除/硬约束 |
| AI-56 | User Account、Preferences、Export/Delete | #6、#16、AI-55 | 后端证据与 actor tests |
| AI-57 | Today NextAction 与 Trip Check Registry | #15、#22、#37 | 只显示符合资格的一步和理由 |
| AI-58 | Recovery Proposal 垂直切片 | AI-57、#15、#38 | 四种扰动只生成 Proposal |
| AI-59 | Tool Registry、Health 与 Offline Contract | #48、#49 | healthy/degraded/offline 一致 |
| AI-60 | Ride Assist | AI-59、#22、#37 | 地址/上车点/官方 handoff，不代叫 |
| AI-61 | Visa/Regulations Tool | AI-59、#22、#37 | scoped policy、recheck、official channel |
| AI-62 | Network/SIM Tool | AI-59、#22、#24–#28 | reviewed preparation guide |
| AI-63 | Human Handoff Pack | AI-59、#48 | 官方紧急优先、服务边界明确 |
| AI-64 | General Guide Import | #22、#32、#39 | private artifact、纠错、冲突、Proposal |
| AI-65 | Offline Trip/Safe Phrase/Address Pack | #15、#35、AI-59 | 无网可读，过期可见，不伪装实时 |
| AI-66 | Full Product Parity Acceptance | AI-51–AI-65、#43 | 六面、五语、故障、权限和观察窗 |

每个工作包必须进一步保持 `<=5 focused days`；复杂垂直切片拆 contract、server、web 和 acceptance。

## 8. 推荐里程碑

| Release | 真实用户结果 | 进入门 |
| --- | --- | --- |
| R1 Durable Core | Chat -> Proposal -> Diff -> Confirm -> Reload | #15/#16/#17 |
| R2 Grounded Intelligence | 多模型 Gateway、RAG、Evidence Cards、显式 Memory MVP | #18–#23、AI-53/55 |
| R3 Knowledge & Explore | 两城市、POI Detail、Ask/Add exact ID | #24–#31 |
| R4 Translation Tools | OCR、文本、STT、TTS、Safe Phrase | #32–#36、AI-59 |
| R5 Execution & Recovery | Today、天气、交通信息、导入、恢复 | #37–#42、AI-57/58/64 |
| R6 Full Parity Beta | User、全部 Tools、Offline、全量验收 | AI-56/60–66、#43 |

Early Access 邀请可以在 R1 后做受限测试，但不能因此声称 Demo 全部能力已经上线。

## 9. 八维验收矩阵

| 维度 | 全量等价 Gate |
| --- | --- |
| 功能 | Demo 每个用户动作有真实、degraded 或 hidden 结果 |
| 接口 | Turn/Evidence/Proposal/Trip/Memory/Today/Tool contract tests 通过 |
| 数据 | reload 一致、CAS 冲突、expiry、delete/export、projection rebuild 可证明 |
| 安全/权限 | User/Ops/System actor matrix、RLS、negative fixtures、secret scan |
| 性能 | Chat phase/answer、Canvas confirm、Explore query、Today refresh p95 有预算和读数 |
| UX | desktop、390×844、五语、RTL、keyboard、screen reader、offline/degraded |
| 可观测 | turn/trip/evidence/tool trace、接受/修改/拒绝、unavailable 和成本可查 |
| 合规 | source licence、provider purpose、media TTL、隐私导出删除、官方渠道边界 |

## 10. Stop Conditions

立即停线：

- 模型、Tool、Explore 或 Today 直接写 Trip；
- pending Proposal 被原地修改；
- candidate/draft/expired/licence-blocked 数据进入 Chat/Explore/Canvas；
- high confidence 被用作 eligible；
- Demo POI/用户/价格被导入生产；
- provider 失败后缓存值被标成实时；
- Human Handoff 被宣传为实时客服或紧急救援但无运营能力；
- 语音/图片原始媒体超出已接受 TTL；
- 五语/RTL/移动端被放到最后统一补做；
- 同一产品状态出现两个可写真理源。

## 11. 最终产品输出

最终交付物不是“一个更复杂的聊天页面”，而是：

1. 一个认证后的六面 Product Shell；
2. 一个可持久、可版本化、可回滚的 Trip Canvas；
3. 一个只能提出 Answer/Card/Proposal 的 VisePanda AI；
4. 一个 Evidence/Knowledge/External Observation 资格系统；
5. 一个把当前 Trip、时间和外部条件转成下一步的 Today Engine；
6. 一个有来源、可否定、可删除的 Memory Profile；
7. 一套真实、可降级、可离线的旅途 Tools；
8. 一个和 Chat/Canvas 共用 Canonical POI/Fact 的 Explore；
9. 一个独立受保护的内容审核面；
10. 一套把 Demo 场景转成持续回归证据的 Eval/E2E 系统。

## 12. 下一控制动作

1. operator 接受“功能等价而非代码照搬”作为 Program #2 的产品基线；
2. 将 AI-51～AI-66 与现有 #15～#43 做依赖去重；
3. 先执行 #15 和 #16，不在 R1 前并行构建完整六面 runtime；
4. 将本报告和 Figma Board 作为后续 Issue 的 mandatory reading；
5. 每个 Release Gate 结束后用真实证据更新成熟度，不以页面存在或 PR 合并替代产品验收。

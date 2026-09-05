# VPJ 领域接口基线

日期：2026-09-05。Program #187；主报告 `docs/VISEPANDA-MASTER-PLAN-2026-09-05.md`。这是下一版接口责任与不变量，真实 schema/API 由所属纵切在消费者接入前版本化；不能把本文类型名当作已实现代码。

## 1. 共用信封

所有用户操作至少绑定 schemaVersion、taskId/requestId、actorScope、tripId（如适用）、baseRevision、purpose 和幂等键。服务端解析实际身份，客户端/模型提供的owner不能授予权限。时间采用带offset的RFC3339，Trip日历另外保存IANA时区；金额为币种+整数最小单位。

结果至少区分 answered、partial、clarification、blocked、technical_failure，以及 proposed/confirmed/unknown等对象状态。文字、卡片和动画都不能自行给业务对象盖“成功”章。

## 2. owner / input / output / error / idempotency / permission / version / consumers

| 接口 | Owner / 所属Issue | 输入 → 输出 | 错误/幂等 | 权限/版本/消费者 |
| --- | --- | --- | --- | --- |
| NativeActorContext | Identity / VPJ-04 | bearer/session → 已验actor/mobile epoch | expired/replaced/unauthenticated；登录attempt幂等 | native与Web Cookie-CSRF独立验证；session v2；所有native API |
| TripRepository | Trip / VPJ-05 | owner+Trip/version+操作 → snapshot/receipt | not_found/conflict/forbidden；requestId+CAS | owner RLS；扩展现Day/Item/snapshot；iOS/Web/Context |
| TurnTask | Turn / VPJ-07/08 | 获准input+Trip basis → 持久结果与事件 | lease/cancel/timeout/quarantine；taskId/sequence/terminal once | actor/Trip；event schema v2兼容期；两客户端/worker |
| ModelProfile | Model / VPJ-06 | minimalContext+policy+budget → validated candidate+usage | schema/provider/timeout/partial usage；attemptId | provider/region/purpose grant；模型与价格snapshot；Turn/Skills |
| RuntimeBudget | Budget / VPJ-59 | task/attempt预算预留 → reserve/settle/reconcile | 并发/取消/尾包缺失；唯一reservation | worker命名任务；账本版本；所有真实provider调用 |
| SkillManifest | Journey / VPJ-07/09 | 任务scope/evidence → candidate/next action | unsupported/needs input/needs evidence；task scope | read字段/tool allowlist/动作与时间预算；版本；Coordinator唯一提交 |
| ProposalService | Trip / VPJ-09/10/65 | baseTrip+候选 → diff/immutable proposal | stale basis/invalid patch；proposalRevision | 用户看过并确认的准确版本；兼容原Patch；两端 |
| Context/Memory | Context / VPJ-11 | latestInput+Trip+consent → scoped context+use receipt | revoked/stale/wrong scope；revision | Trip fact留Trip，明确偏好留Memory；删除传播；所有skills |
| ParsedArtifact | Materials / VPJ-12/55/60 | 单个获准材料 → 原文定位字段候选 | unsupported/low confidence/TTL/cancel；artifactHash+owner | 按用途/接收方授权；parserRevision；用户校正/Trip |
| KnowledgeSource | Knowledge / VPJ-15 | source/grant/revision/locator → private draft | no rights/parser drift/conflict；sourceHash/revision | author!=reviewer；source/claim独立版本；Ops/索引 |
| EligibilityReceipt | Policy / VPJ-15/16 | principal+Trip+purpose+field+recipient+region+time → allow/deny理由 | expired/revoked/out-of-scope；policy generation | 请求级计算非永久boolean；所有检索/外发/展示 |
| EvidencePack | Knowledge / VPJ-16 | ClaimRequirements+eligible units → required/background/coverage/conflicts | unsupported/inaccessible/contradiction；索引generation | 语言中立assertion+zh/en投影；Chat/Ready/Guide |
| PlanEvidenceBinding | Trip/Knowledge / VPJ-17/65 | tripVersion/itemId+claimRevision+applicability → support/recheck | missing/stale/conflict；bindingID | 不改用户confirmed意图；Trip/source变化消费者 |
| SourceImpactOutbox | Knowledge / VPJ-17 | source变化候选→人审→失效事件/ack | 404不当政策撤销；at-least-once+consumer幂等 | named worker；review receipt；Chat/Explore/Trip缓存 |
| MapProvider | External / VPJ-18/19 | provider/locale/coordinate system/query → POI/route观察 | no coverage/denied/timeout；query/TTL | 地域/缓存/展示许可；providerID≠canonicalID；Trip/Explore |
| HotelHandoff | Hotels / VPJ-22/23 | 住宿要求+已验参数 → allowlisted URL/receipt | unsupported parameter/expired/open_failed；handoffID | 无姓名/护照/健康/Trip原文进URL；prepared/opened≠booked；iOS/Web |
| ReservationReference | Materials/Trip / VPJ-24 | 用户声明/确认单/未来provider receipt → 带来源状态 | OCR冲突/未知；artifact+revision | 用户校正非第三方核验；外部订单真相不归TripPatch |
| ResolutionIssue | Journey / VPJ-16/29 | unknown原因+影响 → 分类队列/安全下一步 | 不合适任务/重复；独立user-task根因去重 | knowledge/provider/policy/capability分流；不默认人工承诺 |
| CaseRequest/AccessGrant | Service / VPJ-57 | 用户请求+字段/接收人/期限 → request+临时访问 | revoked/expired/forbidden；caseId+grantRevision | 未接单与accepted分开；Ops/Brief/派工 |
| TravelerBrief | Ops / VPJ-31 | 获准case资料 → 有来源的动态字段 | latest-input-frontier不够则标stale；revision | 字段用途、置信度/到期、删除传播；Owner/员工受控 |
| ServiceCase | Service / VPJ-32 | request/capacity → queued/accepted/assigned/result | no capacity/waiting external/unresolved；case操作ID | 接受后才ETA；人工作业不可冒充AI或履约；两端/Ops |
| ProactivePolicy/Job | Journey / VPJ-30 | reason+Trip/topic/channel/expiry → scheduled/suppressed/sent | revoked/stale/quiet hours；dedupe key | 推送前重验epoch/version；营销授权独立；iOS/worker |
| PurchaseLedger | Commerce / VPJ-33/34 | verified StoreKit transaction+account → 权益period | pending/refunded/replayed；transactionID唯一 | sandbox/production分开；服务端时间；两端权益 |
| UsageLedger | Commerce / VPJ-35 | task+entitlement reservation → consume/refund/nextAvailableAt | burst/period cap；同task不多扣 | Free双门/Pass双门；恢复不发新额度；Task/UI |
| PrivacyRegistry | Privacy / VPJ-36/58 | owner request→各域handler→回执 | partial/retry/retention exception；requestID | 合法保留字段最少化、provider边界；导出/删除/恢复 |
| LocalSnapshot | iOS / VPJ-25/55 | 获准快照+租约 → 可离线读取 | stale/revoked-on-reconnect；snapshotVersion | 按账号/Trip/AppGroup；远端不能瞬间删除离线设备 |
| CommunitySubmission | Community / VPJ-48/64 | 用户稿/媒体许可 → pending/review/published/withdrawn | report/block/appeal；submissionRevision | 全量审稿、员工披露、删除handler；Explore不直接变Fact |

## 3. 必须保留的现有不变量

Pass逐交易建不可重复grant：每段720小时、300次仅在该段开始后可用，到期不结转。提前购买排队，恢复不发额度，退款只撤对应段不移动其他段，60/滚动24小时跨购买持续计数；对账不使用设备时钟。具体媒体页数/大小/时长也进入商品和任务预算。

TripProposal→visible diff→explicit confirm→atomic TripPatch；worker不能伪装用户写入。旧SQL迁移append-only；现有fact_records探针表的兼容要显式解决。reviewed Fact未获用途许可不能检索/展示；来源变更不自动写新事实。用户数据不是模型训练默认素材。

## 4. 扩展顺序

先扩展schema/消费者兼容，再迁移调用，最后退役旧form。每个具体接口PR至少有真实生产者/消费者的一对契约用例；仅新增interface.ts或fixture不能单独宣布纵切完成。Skill、middleware、来源适配器都不拥有例外授权。

## 5. 版本与冲突

UI/nav schema、API事件、Trip revision、source revision、memory revision、policy generation、price/entitlement period分别有版本，不能用一个global version解决所有并发。旧客户端在支持窗内收到可理解的降级/升级提示，禁静默新字段改变确认含义。

同一文件可由不同顺序Issue维护，但同时只允许一个编辑owner。`allowedPaths`是边界上限，不是鼓励全范围重构。发现需要未冻结上游行为，先在本Issue记录接口差异，修正依赖后继续。

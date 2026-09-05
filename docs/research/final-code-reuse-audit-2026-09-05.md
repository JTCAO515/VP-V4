# VP-V4 最终统筹规划：代码资产、接缝与交付缺口审计

日期：2026-09-05。性质：代码审计与迁移建议。基线：`fb8d2ba227fded32a8df6e4e09f9586ad0150f21`。审计工作树：`/Users/jtcao/Documents/VP-V4-Final-Planning`。原生 iOS 补充输入来自 `/Users/jtcao/Documents/VP - V4/ios/VisePanda`，该目录在原工作树中未跟踪。

本报告用于总体设计与 Issue 分解；它不证明 Staging、Production、真实模型或 App Store 已经可用。检查范围是已提交代码、必要测试、迁移、CI、文档合同及原工作树的 iOS 壳；没有调用实际供应商、数据库或生产环境。

## 1. 最重要的结论

VP-V4 已经有一批值得保留的 Trip、权限、版本、取消、重试、知识资格和媒体边界合同，也有 owner-JWT 数据访问与 24 条数据库迁移。下一轮开发应围绕这些资产接通真实 Journey 链路。大规模重写后端将浪费已建立的不变量；将所有合同直接视为已实现服务，则会继续放大当前成熟度偏差。

目前最大的缺口集中在六个接缝：

1. **原生 iOS 与服务端认证之间**：当前服务端主要为 Cookie SSR + Web Origin 防护设计，尚无独立的 native Bearer/session 接入路径。
2. **用户文本与模型之间**：Chat route 目前登记 Turn 元数据，模型层主要为 fixture；真实文本保存、调用、回答恢复尚未组成主链。
3. **模型建议与结构化 Trip 之间**：Trip 原子确认和版本链已有代码，真实模型生成完整可验证 Proposal 的连接仍需完成。
4. **知识合同与真实语料之间**：RRF 组合逻辑已有，词法 baseline 仅为 exact/编辑距离评估器；事实资格只有四字段，未形成可维护的生产知识系统。
5. **可见的 Memory/Privacy UI 与完整执行之间**：显式 Memory 有 SQL 与 API，消费回执 writer、聊天保存策略、导出/删除执行和运营用途授权尚未闭合。
6. **可运行仓库与客户可获得产品之间**：真实数据库验收、供应商实测、原生分发、计费、支持、恢复与用户任务观测仍需单独交付。

对一站式的实现建议是：一个用户可持续返回的 Trip 工作空间，承接规划、准备、旅途和复盘；前台保持同一个 VP，后台根据任务选择确定性函数、知识检索、模型和外部渠道。不要先建立多个互相转述完整聊天历史的角色 Agent。

## 2. 本次基线及证据等级

`git ls-files` 在上述基线给出：816 个已跟踪文件，56 个 `lib/server` TypeScript 文件，20 个 API route，24 条迁移，160 个 `.test/.spec` 测试文件，8 个知识模块代码文件，0 个已提交 iOS 文件。文件数量仅说明仓库构成，不代表功能覆盖率或发布进度。

本报告使用以下成熟度：

| 标记 | 本报告含义 |
| --- | --- |
| 合同/fixture | 纯函数、进程内存或合成输入，验证语义，不保证部署能力 |
| 持久代码 | 存在 SQL、owner 访问和路由连接；实际迁移与运行验收另查 |
| 产品消费者 | 页面或客户端确实调用对应服务端/API |
| 运行未验 | 本轮未取得真实 Auth、DB、Provider、Store 或真实用户证明 |

原始 Issue 映射依据 `docs/agents/issue-execution-contract.md` 与本轮主线程保存的 `docs/program/2026-09-05/issue-snapshot-before.json`。后者是当前快照；旧合同中的“完成”“merged”文字不可替代实时 GitHub 状态。

## 3. 资产处置矩阵

分类只回答“下一版如何使用”。`reuse contract/test` 保留语义与回归证据；`port behavior` 在新消费者/适配器中承接行为；`rewrite` 替换不足的实现；`retire` 退出当前产品或运行路径，但保留必要历史。

| 资产与精确证据 | 当前消费者/成熟度 | 建议 | 下一版具体动作 |
| --- | --- | --- | --- |
| `lib/server/trip/patch/contract.ts`；`lib/server/trip/proposal/diff.ts` | API guards、Canvas、Trip tests；合同与持久路径均有 | reuse contract/test | 保留 Proposal → visible diff → confirm → atomic apply，扩展必须有版本和兼容测试 |
| `supabase/migrations/20260825160314_ai10_durable_trip_proposals.sql`、`20260825160458_ai10_confirm_outcomes.sql`、`20260830210000_launch_11_trip_proposal_patch.sql`、`20260830211000_launch_11_trip_proposal_patch_revision.sql` | `user-data-adapter.ts` 中 proposal/confirm/revise RPC；持久代码，运行未验 | reuse contract/test | 先做空库重放、双用户 RLS、陈旧版本和双确认验收，再给 iOS 使用 |
| `app/api/trips/**`、`lib/server/identity/user-data-adapter.ts:153–186` | Web Canvas、TripList、Today、Profile 等实际消费者 | port behavior | 提炼显式 ActorContext 与 request-bound repository adapter；保留现有 Web 入口兼容 |
| `lib/server/identity/request-guards.ts:16–68` | 20 条 route 中的 mutation guards；Web Origin 策略 | reuse contract/test + native adapter | Web Cookie 路径继续 CSRF；新增原生 Bearer 验证路径，不能以放宽 Origin 为 iOS 接入手段 |
| `lib/server/turn/contract.ts`、`thread-store.ts`、`sse-replay.ts` | Chat route/reducer 和合同测试 | reuse contract/test | 保留事件序列、幂等、终态、replay；文本/卡片输出另定版本化 payload |
| `lib/server/turn/reliable-coordinator.ts:29–45` | 进程内 `Map`、`WeakSet`；没有 Provider、持久存储或工作进程接入 | port behavior | 将 lease、attempt、cancel、quarantine 语义迁到持久执行器，做进程中断与重启验证 |
| `lib/server/turn/fake-coordinator.ts`、`trip/workspace/in-memory.ts` | 合同测试直接 import | reuse contract/test | 保留测试 oracle；生产 composition root 不得选择 fake/in-memory 适配器 |
| `lib/server/model-gateway/index.ts:41–118` | `MODEL_PROFILES` route 为 `fixture_only/shadow_only`；只有 `createFixtureModelGateway` | rewrite adapter，reuse contract/test | 新增千问/GLM/DeepSeek 的任务适配器与实测矩阵；旧模型 ID 仅作历史 fixture，不作为采购事实 |
| `lib/server/model-gateway/{prompt,registry,route}/` | 版本、漂移和路由合同及 tests；无真实供应商证明 | reuse contract/test | 跨模型只共享业务输出合同和上下文选择规则，分别记录请求/返回模型、usage、验证结果 |
| `lib/server/model-gateway/spike/ml-01.ts` | `tests/contract/model-gateway/ml-01-spike.test.ts` 消费 | reuse contract/test | 保留“不凭布尔自证 SDK 已合格”的回归；真实 SDK 再评估应产生新结果，不能复用旧 reject 作为永远禁用 |
| `lib/server/model-gateway/budget/index.ts:11–47` | 进程内用户/task计数器；非跨副本配额 | port behavior | 原子 reserve/settle/refund 的持久计费与使用额度；用户一问和内部多次模型/工具调用分开 |
| `lib/server/context/context-plan.ts:74–105`、`context-assembler.ts` | 合同/eval消费者；没有 route 主链实际调用证据 | reuse contract/test + wire | 为 Plan/Ready/Travel/Guide/Translate 输出最小上下文，保留必要约束、来源、token预算与untrusted边界 |
| `lib/server/tools/index.ts:43–52,77–116` | 静态allowlist、schema、policy、deadline、进程内幂等；无商用工具 wiring | reuse contract/test + adapter | 先接只读地图/知识/联盟跳转；Trip和外部副作用保持独立批准路径 |
| `lib/server/constraints/index.ts` | PLAN-EVAL确定性预算、时间、交通/预约约束；无实时证据接入 | reuse contract/test | 作为候选计划可行性裁判；软偏好不提升为硬约束，缺证据返回 unknown |
| `lib/server/knowledge/fact/eligibility.ts:1–3` | `hybrid`、Today 等消费者；仅 status/expiry/licence boolean | rewrite V2 envelope | 保留 fail-closed，但新增来源版本、目标scope、适用性、发布/撤回状态、用途权限；迁移消费者不能一次改坏所有现有tests |
| `lib/server/knowledge/retrieval/lexical/index.ts:34–45` | qrels eval；exact=3、distance≤1=2 | retire 作为生产检索器，保留评估fixture | 用真实数据查询基线替换；不能宣称已有 BM25/FTS/向量搜索 |
| `lib/server/knowledge/retrieval/hybrid/index.ts:22–73,103–122` | 输入预排好 lexical/vector hits 后做 RRF；每 Fact 仅允许一个 unit | reuse fusion tests，rewrite数据装配 | 检索执行与资格过滤接入数据库；EvidencePack V2支持多证据、缺口、冲突、required/background；不要让重复chunk计票压过实体准确匹配 |
| `lib/server/knowledge/claim/grounded-execution.ts`、`components/chat/cards/GroundedExecutionCard.ts` | typed claim/card合同与render测试；未在当前Chat runtime消费 | reuse contract/test，port behavior | 作为iOS typed card contract输入；Native 重写渲染，证据校验仍由服务端拥有 |
| `knowledge/import/candidate-import.ts:5–17`、`review/ops-review.ts:6–11` | Map dry-run/审核ledger；并非生产导入或Ops后台 | port behavior | 持久source/import/review/audit；维持作者≠审核者；实际授权、事务和运营界面需补齐 |
| `knowledge/report/index.ts`、`policy/receipts.ts`、`jobs/projection-queue.ts:10–12` | 撤回、版权与queue合同；queue内存且仅r3 | reuse contract/test，port行为 | 持久失效事件、定向重建、失败隔离；source change不能自动生成已审核真相 |
| `lib/server/memory/profile.ts`、`memory/receipts.ts`、`app/api/memory/**` | owner-JWT UI/API/SQL；显式或confirmed且consent granted才可投影 | reuse + extend | 增加Trip scope/有效期/纠错与消费writer；普通行为推断不能自动成为长期事实或硬约束 |
| `lib/server/privacy/contract.ts:9–16`、`app/api/privacy/route.ts` | 只记录 requested/not_started；数据库有请求和receipt | port behavior + implement executor | 补齐导出、删除、备份例外、重试和身份校验；不能把“已收到”当“已删除” |
| `lib/server/artifacts/user-artifact.ts:5–23` | Map、已确认的flight/rail segment；没有OCR/upload真实链路 | reuse contract/test + rewrite pipeline | 上传→隔离→提取→用户校正→Artifact→Proposal；扩展hotel/POI材料，不以LLM提取即认定订单有效 |
| `lib/server/media/private-media.ts`、`media-translation/realtime/protocol.ts` | 私有上传/删除意图与协议合同，非真实媒体服务 | reuse contract/test + adapter | iOS Photo/Voice权限、短时对象、任务token和删除receipt；供应商密钥留服务端 |
| `lib/server/media-translation/fixture-translation.ts` | `translateFixtureDocument`与field-exact eval；5语合成文本 | reuse fixture，rewrite adapter | 首发中英真实Text/OCR/PTT按能力分别验收；显示、复制、朗读必须来自同一确认版本 |
| `lib/server/today/index.ts`与`components/today/trip-next-action.ts` | 前者为Fact检查合同；后者是当前Today真实Trip API消费者 | port behavior | 合并为面向Journey的NextStep projection但保持两个来源语义：Trip时间计划≠实时事实、完成状态≠时间已过 |
| `external-evidence/{resolver,rail/guidance,weather/projector}.ts` | policy/freshness/card合成合同；无实时供应商adapter | reuse contract/test | 只增加有资质/许可的观察适配器；导航、天气、线路和酒店分别feature-gate |
| `lib/server/explore/exact-id-handoff.ts` | POI exact-ID Ask/Add合同；Explore页面当前 unavailable | reuse + implement content reader | Explore内容、收藏、Ask上下文、Trip proposal使用同一Canonical POI ID |
| `components/{chat,canvas,copilot,today,trips,user}/` | Web consumers真实API调用，部分接口仅metadata | port behavior | Web保留必要浏览与既有链接兼容；原生SwiftUI重写渲染与手势，复用状态机/序列化测试用例 |

“模型/接口/角色名称可以注册”与“服务可运行”必须分开记录。当前 `ToolRegistry` 直接拒绝 `P_proposal_producing` 与 `X_external_side_effect`，因此不能把其接口字段当成已支持外部副作用。

## 4. 七个需要在总体规划中纠正的陈述

### 4.1 “完全没有知识数据库表”不准确

`supabase/migrations/20260825052328_ai14_actor_rls_fault_probes.sql:52–62` 已有 `public.fact_records`。它只含 `status/expires_at/licence_allowed/created_at`，作为 actor/RLS probe；anon和authenticated均无读取权，service role有访问权。正确表述是：**有最小 Fact/RLS 探针表，尚无生产知识对象、来源版本、检索索引和审核维护链路。**

新知识迁移必须检查并兼容该表，不能再创建同名表或改写已执行历史迁移。

### 4.2 “混合检索已经完成”只对组合合同成立

`buildHybridEvidencePack` 接收外部传入的排名，自己没有embedding调用、数据库搜索或reranker。`lexical`文件是评估器，不是生产全文检索器。`FactEligibility`还不包含scope与用途权限。因此工程Issue应按“数据库查询→资格过滤→排名→证据包→引用渲染”的真实链路分解。

### 4.3 “可靠Coordinator已经存在”只对进程内状态机成立

`reliable-coordinator.ts:36–40`明确说明 future durable coordinator。其lease绑定使用WeakSet/WeakMap，重启后失效；不能直接部署为可靠worker。保留行为测试，将lease、attempt、terminal state与outbox迁到持久层，模拟worker在提交前后退出。

### 4.4 “SSE等于AI流式回答”不成立

`app/api/chat/turns/[turnId]/events/route.ts`将已有事件映射为 `eventId/sequence/type/state` 后编码返回；没有实时token或最终assistant内容。`app/api/chat/threads/[threadId]/turns/route.ts`调用 `startChatTurn`，输入无正文。应先交付可恢复的最终回答，再增量优化流式体验；无论采用哪种方式，断线后不能重新付费生成同一个Turn。

### 4.5 “后端API可直接给iOS用”需要认证适配

现有 `createUserDataAdapter` 从Request Cookie构造SSR client；`isSameOriginMutation`要求Origin。在原生iOS中，应显式识别认证方式：Web Cookie会话继续现有CSRF规则；Native请求使用已验证Bearer token和相应session policy。不要让客户端伪造Web Origin来通过测试，也不要全局取消Origin检查。

用户要求的“一个账号仅一台手机，Web不限”需要独立mobile session标识/epoch及撤销检查，不能复用全账号单session策略。服务器必须保证被顶替设备无法继续续期或提交写操作；界面应提供重新登录和未发送草稿恢复。

### 4.6 “已建iOS”当前只存在于本地未跟踪预览壳

主工作树iOS文件确实存在，不能丢弃。但main中没有iOS。该壳使用SwiftUI、Swift6、iOS17最低目标、每Tab独立NavigationStack；Ask发送按钮被disabled，所有capability为previewOnly。默认Ask，Tab为Today/Trip/Ask/Explore/Profile；String Catalog为五语，另有未跟踪ADR-0003。与最新中英和Journey产品决定存在迁移差异。

迁移建议：保留工程配置、App资源、语义颜色、可访问性和NavigationStack结构；保留已有测试思想，但按最新中英和导航决策更新断言；重写Ask/Trip/Explore功能视图；引入APIClient、session store、typed card renderer、离线缓存和网络状态。不要将整个未跟踪文件夹直接覆盖进main。

### 4.7 “所有绿灯等于用户链路验证”需要分层

`tests/e2e/chat/v4-08-ask-route.test.mjs`、`launch-08-sse-replay.test.mjs`通过 `readFileSync`检查源码。它们是有价值的静态结构回归，但不是浏览器真实会话。`web-10-viewport.spec.mjs`才是Playwright浏览器测试，目前重点为布局/键盘/RTL。真实DB测试在Supabase未启动时调用`t.skip`。

`scripts/run-ci-suite.mjs`会把skip标记为`incomplete`，但进程仍随test runner的0退出码成功。PR可以接受“代码合同已验证”而运行验收未完成；Release Gate必须显式拒绝关键运行套件缺失或skip。

`scripts/db-verify.mjs`和`connection-probes.mjs`仅发现配置/本地服务并声明“available-for-explicit-probe”，不执行真实RLS、迁移或连接验收。Release不能以该脚本0退出等价数据库可用。

## 5. 归档、退役与保护清单

本次没有移动或删除任何文件。推荐总体统筹采用“先标历史→更新索引→切换消费者→验证→归档”的顺序。

| 对象 | 当前引用证据 | 处置建议 |
| --- | --- | --- |
| `components/VisePandaLanding.tsx` | 在`app/components/lib`中无运行时import；`tests/security/assets/web-04-asset-policy.test.mjs:24`仍readFile该文件；历史Web04计划引用 | 可归档到非运行目录，保留source/history信息；同步资产测试指向归档文件或等价新约束，之后方可退出typecheck范围 |
| `docs/vp-v4-closed-beta-launch-plan.md` | `CONTEXT.md`已经称其与accepted plan冲突处被supersede；文内仍描述已不存在的`VisePandaChatWorkspace` | 标historical snapshot并加当前总规划链接；保留历史证据，不再作为新Issue必读 |
| `docs/2026-08-29-vp-v4-launch-readiness-audit.md` | 同上；仍引用旧组件和旧编号 | 标historical snapshot，保留审计日期与基线，不覆盖旧事实 |
| `docs/superpowers/plans/2026-08-28-*`和旧phase计划 | 多数仍被execution contract或历史说明链接 | 保留路径、标已执行/历史；从当前Agent阅读入口移除已失效步骤，不批量移动导致断链 |
| `app/homepage/page.tsx`、`components/homepage/Homepage.tsx` | 活跃route、静态输出测试和根首页链接引用 | 暂不可直接删除；如新Web营销入口统一后退役，使用兼容重定向并更新回归测试 |
| `GroundedExecutionCard.ts`、`WeatherObservationCard.ts` | 没有当前Chat运行时接入，但合同/渲染tests有消费者 | 保留为将来iOS/Web卡片语义资产；不要因未接线就删除 |
| `fake-coordinator.ts`、`thread-store.ts`、`trip/workspace/in-memory.ts` | 多个合同/集成测试直接import | 保留测试reference，明确禁止生产注册；实际runtime adapter完成后仍可保留作为快速回归 |
| `media-translation/fixture-translation.ts`、RoutePattern spike | eval/test直接消费 | 保留固定fixture与拒绝证据；退出用户可见生产路径即可 |
| 全部`supabase/migrations`、`scripts/db/restore`、`docs/runbooks/backup-restore.md` | 当前数据/RLS/恢复链路和测试依赖 | 保护；迁移append-only，不能以“旧阶段”理由删除 |
| `docs/knowledge-base/draft-knowledge-base.json` | 工作台明确`productionImportSupported:false`，30类型候选/6draft/18rules | 保留为候选池；禁止自动批量提升；不是需要清掉的脏数据 |
| `docs/licenses`、资产隔离记录、brand源文件 | `check-assets`用Git历史和ledger校验 | 保护；出店资产必须能回溯来源，删除会破坏证据 |
| 原工作树未跟踪`ios/`与其ADR/工件 | 不在main；可能包含用户未交付劳动 | 保护、逐文件迁移分类；不可直接git clean或目录覆盖 |

本轮没有找到“同时无运行引用、无测试引用、无历史价值”的大块代码。可安全优化的是当前阅读入口、重复规划权威和明确的旧Landing，不是数据库或安全基础设施。

## 6. 从前端到客户手上的完整缺口

| 能力链 | 必須补齐的最小真实能力 | 验收观察 |
| --- | --- | --- |
| 获取用户 | 中英定位/能力边界、Early Access申请、来源标记、隐私提示、邀约与跟进 | 一名真实目标用户能理解售卖内容并完成入组；不以邮件量代替有任务用户 |
| 原生入口 | 签名工程、认证、单手机会话、深链、session恢复、版本升级 | TestFlight安装→登录→切App→恢复同一Trip；另一手机登录符合顶替规则 |
| Ask/计划 | 真实文本、材料、上下文、回答、可编辑Proposal、显式确认 | iOS请求→provider→typed output→diff→确认→重启后同版本Trip |
| 准备与旅途 | Ready check、NextStep、地图/交通渠道、翻译/讲解、原订单参考 | 三个连续用户任务都能接续上下文；缺实时证据不会声称路线/营业/订单仍有效 |
| 知识供给 | source/rights/revision、review、适用性、索引、监测、撤回 | 发布一条可查事实→Ask引用→撤回→检索/UI停止把它当current |
| Explore/内容 | Canonical POI、内容来源、加入Trip、内容审核、举报 | 从探索内容加入同一个Trip；UGC不会绕过事实审核进入高风险建议 |
| 酒店浅层执行 | 需求与房型规格、带来源的结果、可用参数的联盟跳转、返回确认 |跳出与回访不丢Trip；不能因点击标已订；无合法实时offer时不生成可售房型承诺 |
| 陪伴与记忆 | 同Trip连续上下文、显式长期偏好、知识缺口、用户控制提醒、自然诚实话术 | 回来后继续未完成事项；错误记忆可撤销；用户能理解未知并采取下一步 |
| 用户资料与Ops | 最小客户case列表、授权范围内对话/Trip摘要、证据链接、角色权限、审计 | 员工仅能读工作所需对象；owner广权限有明确授权和访问记录；推断口气不当事实 |
| Human Task | 请求、分类、澄清、受理/拒绝、处理记录、关闭、反馈、容量 | 不能用research无限pending掩盖无人处理；不许伪装“已联系”或承诺24小时真人 |
| 免费/Plus/Pass | StoreKit购买与恢复、服务端entitlement、额度、重复通知、退款/撤销 | 沙盒购买→权益到服务端→重装恢复→撤销后失效；失败请求计费规则一致 |
| 隐私 | 内容策略、数据用途、导出、删除、对象TTL、备份例外、供应商接收记录 | 删除请求从received走到verified；检索、缓存、媒体、导出都不能残留可取副本 |
| 离线与弱网 | 最近确认Trip/地址/安全短语、缓存归属、过期提示、消息待发与断线恢复 | 飞行模式仍读已缓存安全信息；新模型回答清晰不可用；logout清缓存 |
| 运维 | 任务/模型/工具成本、延迟、失败分类、限额、值班、回滚、restore | 一次供应商故障可观测、限制和恢复；同请求不因重试重复收费或落多版Trip |
| 发布交付 | Staging、Production隔离、真实验收、Store隐私/资产/内购、canary、支持入口 | 用户从商店安装到完成一项Trip任务，全链路无fixture替代、无关键skip |

以上能力不要求每项首发都做到最高自动化深度，但“一站式首发”必须用任务覆盖矩阵明确每个环节的真实完成方式、人工接续方式和不支持范围；不能只列功能名称。

## 7. 建议的新接口与所有权

1. **ActorContext**：经过验证的用户、会话类型、mobile epoch、用途/角色；业务服务消费，UI不能自己宣告权限。
2. **Journey/Trip Snapshot**：沿用Trip ID与版本；Plan/Ready/Travel是读模型/任务阶段，避免复制三套Trip数据。
3. **Turn V2**：用户message、生命周期event、assistant final/card payload分离；同一个Turn可以恢复且不重复生成。
4. **TripProposal V2**：保留CAS/revision/expiry/idempotency；AI只是提案方，确定性检查负责落库前验证。
5. **ContextPlan V2**：任务、当前Trip、必要Memory、EvidencePack、未完成Task；删除/撤回立即影响可用上下文。
6. **EvidencePack V2**：支持、缺口、冲突与适用性，引用来源版本；不以检索分数作为事实可信度。
7. **External Handoff**：目标域名、来源/联盟披露、参数级能力、跳出/回访状态；click不等于booking。
8. **Memory Candidate/Confirmed Memory**：来源、scope、可变性、有效期、用户控制、consumption receipt；聊天原文和记忆分库语义。
9. **Human Case**：明确受理与结果状态、能力/地区、操作员、外部渠道证据；AI不可替真人标完成。
10. **Entitlement/Usage**：App Store交易事实与VP产品权益分开；内部model/tool重试不直接变成用户问题数。

每个接口冻结owner、输入、输出、错误、幂等、权限、版本和消费者，然后允许iOS、API、worker、Ops分工。一次变更多个边界的Issue应继续拆。

## 8. 旧 Issue 与新统筹的承接

以下是语义映射，不表示本子审计已经关闭或创建Issue。

| 旧工作 | 新统筹承接 | 处理理由 |
| --- | --- | --- |
| #149 LAUNCH-00 | 新总Program替代其范围权威，历史子任务仍保留交付证据 | 原“知识/翻译/导入/离线全部后置”与一站式首发变化明显 |
| #152 LAUNCH-02 | 保留Staging基线工作，提升为全平台真实验收前置 | 环境与数据事实不会因iOS战略改变而失效 |
| #153 LAUNCH-03 | 复用Trip内容模型及迁移，补真实验收；需要时拆Native消费者 | 已有代码但环境验收未闭合 |
| #154 LAUNCH-04 | Web身份保留；新增Native Auth/session切片 | 原Web guard不覆盖原生Bearer/mobile顶替 |
| #155 LAUNCH-05 | 新内容保存/输出/运营用途合同承接 | 现有合同是not_persisted；用户希望保留对话需要正式运行数据策略 |
| #156 LAUNCH-06 | 三供应商评估 + 一个首主模型接入 + 受控后备路线 | 使用多个provider是候选范围，生产首路由仍需实测 |
| #157 LAUNCH-07 | 持久Turn worker + Outbox/retry/recovery | 当前Coordinator仅内存，不因Issue存在就可关闭 |
| #158 LAUNCH-08 | 最终输出/卡片replay、iOS与Web事件消费者 | 当前只有状态SSE |
| #159/#160/#161/#169 | 保留Trip入口/Web/Proposal/Today已做行为，增加iOS版与共同读模型 | 用新客户端并不需要丢掉后端与Web合同 |
| #162 LAUNCH-13 | 跨iOS/Web/worker/DB的真实Staging golden path | 静态源码测试不能替代客户任务 |
| #163 LAUNCH-14 | Provider/Tool/Turn/Entitlement/Case观测与预算 | 当前纯C0控制不是运行观测 |
| #164/#165 | 保留并补用户内容保存、运营用途、导出/删除executor | 一站式资料越多，该缺口越关键 |
| #170/#166/#171 | Production迁移、发布、真实用户canary继续承接 | 不因商业范围调整而取消恢复/隔离/发布验收 |
| #53 AI-49 | 保留并纳入发布Gate | 备份/恢复仍是开放工作；不是旧系统垃圾 |
| #20/#21/旧EXPAND-01 | 生产知识检索与EvidencePack V2，不重开旧fixture完成项 | 以新Issue承接新增真实能力，保留旧合同完成证据 |
| #27/#54 | Ops知识审核、纠错/版权/失效 | 旧ledger是合同资产，新Ops/runtime单独计交付 |
| #32–#40/EXPAND-04～09 | 按首发用户任务重排翻译/媒体/导入/恢复 | 不按旧横向大模块一次拉满 |
| 旧IOS-01本地壳 | 新Native基础/登录/Trip首链拆片 | 先审查并迁移未跟踪资产，再建立可运行消费者 |

关闭旧Issue时必须写明 `superseded by` 与承接的新Issue/Program；其未完成的验收义务要逐项转移。不要以“新规划已经覆盖”直接关闭没有承接owner的隐私、备份或运行验收。

## 9. 第一个五个工作日的纵向交付建议

这不是“五天上线完整产品”的承诺。建议首先让原生客户端走通一条代表核心价值的真实纵切；前置是可使用的Staging及已批准的provider/内容数据配置。缺前置时先做接口与fixture故障验证，完成状态明确区分。

| 日/切片 | 交付目标 | 验收证据 |
| --- | --- | --- |
| D1 合同与原生接入 | 审核迁入iOS基础；版本化API和Native Bearer身份；创建/选择同一个Trip | iOS登录→Trip list/create→重启读回；other-user拒绝；Web session仍正常 |
| D2 真实Ask | 一个provider普通文本→typed final output；持久Turn与幂等请求 | 同请求网络重试只有一个Turn和一次计费结算；取消/超时无假成功 |
| D3 计划落点 | 从明确用户需求得到2天候选计划→iOS diff→确认 | 确认前Trip未改变；确认后head+1；reload一致；stale提示更新 |
| D4 Ready/Travel接续 | 一个真实已审核playbook + Trip NextStep + 一个中英翻译任务 | 用户从计划进入准备，再问旅途问题；同Trip上下文连续；未知值不编造 |
| D5 真机/故障/交接 | 弱网重连、App重启、被顶替设备、清数据、跨用户、证据报告 | 一条真机录像、一份redacted trace、一张依赖/未验表；不能用fixture素材冒充实时供应商结果 |

D1–D5之后才用观察到的瓶颈扩大酒店handoff、导入、Explore、语音导游等链路。完整首发范围仍可以大，但每个Issue都必须交付可看到的用户任务，不能连续数周只完成抽象接口。

## 10. 最低测试与交付策略

现有CI应保留，新增分层而非全部推翻：

- **PR快线**：类型/编译、纯合同、反越权与模型输出验证；测试名称明确synthetic/source/browser/database/provider/device。
- **集成线**：空库重放24条及新增迁移；真实双用户JWT/RLS；worker crash/retry；Native授权和session撤销。
- **模型线**：固定prompt版本、模型ID/region、任务集、英语/中文、预算、错误引用/编造/未知处理、proposal有效率；不能只评分文风。
- **知识线**：source→fact→retrieval→citation；失效、冲突、跨scope、权限改变、删除、no-answer。
- **设备线**：原生XCTest与真机任务；Dynamic Type/VoiceOver/Reduce Motion、键盘、后台返回、弱网、Voice中断、缓存归属。
- **发布线**：关键runtime suite零skip，Store购买/恢复/撤销，删除完成证明，生产smoke，回滚与恢复演练。

UI动效的验收也应绑定任务：Proposal应用前后对象对应清晰、Ask到Trip切换不丢输入、长回答滚动不中断阅读、状态变化可撤销。视觉图和Simulator截图只证明设计表达，不证明这些交互和数据成立。

## 11. 本次实际验证记录

只读调查命令包括：`git status --short`、`git rev-parse HEAD`、`git ls-files`、`rg --files`、符号/消费者搜索、针对性`nl/sed`读取、JSON统计，以及原工作树`git status --short ios`。

执行以下纯合同/eval检查，18项通过，0失败，0skip：

```sh
node --experimental-strip-types --test \
  tests/contract/model-gateway/ml-01-spike.test.ts \
  tests/contract/model-gateway/version-registry.test.ts \
  tests/contract/trip/workspace.test.ts \
  tests/contract/turn/thread-history.test.ts \
  tests/contract/knowledge/hybrid-retrieval.test.ts \
  tests/contract/context/context-plan.test.ts \
  evals/qrels/lexical-baseline.evals.test.ts \
  evals/qrels/hybrid-retrieval.evals.test.ts \
  evals/planning/constraint-engine.evals.test.ts
```

本地Node为26.7.0，CI配置Node22；此次结果属于本地纯逻辑验证，不代替CI环境复验。未跑全量build/browser/device/database/provider suites；未建立真实业务数据；未验证远程部署、配置或App签名。

本次唯一文件变更为本报告。其他审计/总规划/Issue快照由并行主线程负责，不能归入本子任务产物。

## 12. 下一位 coding agent 应拿到的最小包

每个新Issue应附：当前总规划相关章节、所属ADR、上表旧资产、确切允许/禁止路径、接口八要素、真实消费者、fixture边界、可执行验收、外部配置前置、rollback和一个下一动作。进入任务时重新核对git与Issue状态；不要求每个Agent重读全项目历史。

规划的最终成熟度标准是：**用户从可安装的原生App进入，给出真实需求，得到可检查的计划或可执行下一步，重启后继续，遇到缺口能安全恢复，完成后可管理自己的数据；团队能看到失败、成本和客户结果，并能维护或撤回能力。**

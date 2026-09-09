# VPJ-66 离线种子与复用边界

运行 `pnpm evals`；现有递归测试入口自动发现 `evals/harness/harness.evals.test.ts`，生成 `artifacts/VPJ-66/results.json` 和 `summary.md`。无需新 CLI、provider、数据库、凭据或依赖。单独复现：`node --experimental-strip-types --test evals/harness/harness.evals.test.ts`。

## 两条可运行任务

H01 输入合成博物馆地址和有时效的 fact receipt，调用现有 `prepareGroundedExecution`，检查输出的地址内容与独立固定 oracle 一致。仅 receipt 存在不等于支持关系成立：故意将地址替换为虚构道路，现有卡构造仍可能接受，但 Harness 必须在 grounding/CLAIM_SUPPORTED_BY_ORACLE 失败。全拒答在 answer/REQUIRED_CLAIM_PRESENT 失败。Trip 集合是本地空数组；无生产身份或只读隔离证明。

H02 将合成 Trip v7 的第二天下午路线文案从长步行改为短步行，复用 `applyPatch` 与 `describeProposalDiff`。步行主指标 minutes 从40到15，辅助 meters 从2800到1000；同日期、时区、walk 模式、synthetic-route-table-v1。数据是固定合成路线，不能声称真实旅行少走路。保留 afternoon 与 dinner 两个必留项目。

评分器逐项核对候选、diff.next 和最终 Trip 中晚餐 ID、日期、时区、时间；地点、确认状态、回执来自明确的 fixture sidecar，因为目前 TripPatch 不包含这些字段。diff 禁止出现 dinner 变更。确认前及拒绝后保持 v7；模拟确认绑定 fixture-proposal-r1/v7，最终 v8，模拟重载完全一致。故意移动晚餐在 candidate/diff/final 失败，提前写入在 confirmation/NO_UNCONFIRMED_WRITE 失败。额外评分器反例覆盖 sidecar、过时确认、路线口径、拒绝写入、重载和范围改变。

确认、重载与 sidecar 是 fixture trace，不是生产适配器；这里验证评分规则和已有纯函数，不证明生产拒绝写入、原子回执、跨客户端幂等或持久化。

## Producer → adapter → consumer → assertion

| 任务 / 接缝 | Producer | adapter / consumer | assertion 与运行层级 | 真正集成责任 |
| --- | --- | --- | --- | --- |
| H01 证据 | `evals/harness/seeds.ts` 合成 GroundedClaim/fact receipt | `lib/server/knowledge/claim/grounded-execution.ts` 的 prepareGroundedExecution → ExecutionCard | fixture 输入、生产纯函数 in-memory；必需 claim、内容 oracle、当前回执；无 live | VPJ-67 / VPJ-16 |
| H02 局部候选 | 合成 TripSnapshot v7 + TripPatch | `lib/server/trip/patch/contract.ts` applyPatch → `lib/server/trip/proposal/diff.ts` describeProposalDiff | fixture 输入、生产纯函数 in-memory；局部变更和晚餐核心字段 | VPJ-68 / VPJ-10 |
| H02 晚餐完整锁 | seeds.ts sidecar | fixture trace candidate/finalSidecar；没有生产 sidecar adapter | fixture only；place/status/receipt 与固定 oracle 相等 | VPJ-68 / VPJ-10 |
| H02 确认与重载 | fixture revision/base + clone | fixture trace；未调用 `app/api/trips/[tripId]/proposal/`、`revision/`、`confirm/` 或 RPC | fixture only；生产请求身份、原子确认和持久重载 NOT_RUN | VPJ-68 / VPJ-10 |
| 上下文 | `lib/server/context/context-plan.ts` / context-assembler | 真实 ContextPlan producer/consumer 未接入本种子 | NOT_RUN；没有重新实现 ContextPlan | VPJ-11 / VPJ-67/68 |
| 工具 | `lib/server/tools/index.ts` | 既有 ToolGateway 未接入；不注册 Trip/proposal 工具 | NOT_RUN；没有假造同名 Gateway | VPJ-07 / VPJ-67/68 |
| 模型与预算 | `lib/server/model-gateway/`、`lib/server/budget/` | 无模型/计费调用；固定 fixture 输出 | NOT_RUN；usage/cost unknown，不能以0费用作为实测 | VPJ-06/59 / VPJ-67 |
| 故障恢复 | `lib/server/turn/reliable-coordinator.ts` | 真实 worker/任务持久化尚未接入种子 | NOT_RUN；H09/H10只定义oracle | VPJ-69 |

## 12例规格、holdout 与评分

完整规格在 `evals/harness/cases.ts`：固定时钟、输入、前置、证据版本、Trip版本、允许/禁止结果、oracle、owner、requiredMode。12个独立任务覆盖正常3、歧义1、约束2、证据2、故障2、授权/注入2。开发集8（H01/H02/H04/H05/H07/H09/H10/H11），holdout4（H03/H06/H08/H12）；两组均含正常与不可执行情形。语言 en；翻译不增加计数。

本票只接通H01/H02的fixture模式。其余10例NOT_RUN并映射VPJ-67/68/69；全部12例的requiredMode=staging均NOT_RUN，阻塞最终验收。当前报告不是12场景通过，也不复用AI-42组合数作为行为覆盖。H09/H10虽未运行，必须保留在最终分母。

holdout内容已由实现者定义和审阅；未用于提示词调优，未执行模型盲测。后续如调优者读到内容或根据失败调参，必须登记污染并替换为未用于调优的案例后才可作盲测。当前确定性评分不使用模型裁判。H01固定内容匹配提供支持/不支持、正常回答/过度拒答正反例；真实语义蕴含与有用性人工校准归VPJ-70。

## 报告和解释

执行状态、业务outcome、verdict分开。故意故障的verdict必须FAIL；只有基线PASS且每个故障在预定步骤被检出，preparationVerdict才PASS。mutation run不增加独立案例数。无调用场景的outcome为null、execution为not_started；不是技术失败。

报告只显式投影合成case/run/task/attempt ID、版本、语言、模式、断言代码、失败步骤、状态、owner、耗时和费用口径；不序列化环境、输入正文、claim、完整trace或思维链。commit是调用时HEAD，sourceState明确包含可能未提交的工作树；不以旧commit冒充精确源码。总elapsedMs是本地整批测量，不是provider latency或SLA；usage/cost未知。providerCalls/realTripWrites/userQuotaDebits的0仅说明离线代码没有这些调用，不是线上观测。

可重复运行会覆盖本票生成的results.json/summary.md。提交证据反映该次本地运行；CI再次运行的动态耗时不要求字节相同。未接通模式不自动降级为通过。回滚移除新增evals/harness及文档/报告，保留既有测试，不涉及数据库或用户数据。

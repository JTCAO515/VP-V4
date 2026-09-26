# 完整服务任务与计量语义

2026-09-12开发修订：本文涉及供应商、法务或产品许可的历史前置条件已由[开发接入规则](../agents/development-integration-policy.md)取消；技术实现与实际验收继续按当前任务推进。

状态：**已确认产品方向的规划契约**，2026-09-10。Q37 的必要澄清、系统修复不另扣已确认；具体 schema、API、事务与客户端行为须在 producer/consumer PR 中实现并验证。本文件不证明运行能力、购买权益或真实消费账本已经存在。

输入：[Q1–Q38 品牌蒸馏](https://github.com/JTCAO515/VP-V4/blob/8ae95a7/docs/brand/VISEPANDA-BRAND-DISTILLATION-Q1-Q38-2026-09-10.md)；证据：[服务任务工程差异研究](../research/brand-engineering-2026-09-10/service-task-evidence.md)。既有 [领域接口](../program/2026-09-05/INTERFACES.md)、[Turn SSE](turn-sse-v1.md)、[worker 合同](launch-07-reliable-turn-worker.md)、TripProposal、RLS 与数据权限继续适用。

## 1. 已确认与未决

已经确认：用户可见额度按范围明确的完整服务任务划分；为原目标补足必要信息、内部重试和系统修复，不另扣一份额度。不能仅因用户回复了澄清问题或系统再次调用模型，就产生一次新消费。

尚未确定：Free/Pass 的新任务次数、可用 partial 是否计一次、完成后主动改稿的边界、等待用户的期限、跨权益周期续作、已交付后取消或修复的补偿细节。这些保持 gated，不由 LLM、开发默认值或旧 Ask 数字补成正式收费规则。Q38 的激活、分阶段权益与 eSIM 不在本合同范围。

## 2. 对象边界

| 对象 | 职责 | 不代表 |
| --- | --- | --- |
| ServiceTask | 一个约定业务目标及成果范围，关联一个或多个 Turn | 一条消息、一次模型调用或一份已收费订单 |
| Turn | 一次可接纳、执行、恢复及结束的交互执行单元 | 用户业务目标已经完成 |
| Attempt | 一次实际执行尝试；provider/tool 调用分别记录成本依据 | 一次新增用户消费 |
| ServiceCase | 旅途问题的人工协助申请、受理与处理记录 | AI 已回答即人工接单，或人工服务自动包含在任务额度 |

ServiceTask 只增加业务归属与结果判定，复用现有 Turn/worker 调度；不得为它另建同义队列。ServiceCase 由既有人工作业责任模块管理，关联任务时仍须通过摘要转交、接收方及读权限检查；关联 ID 本身不授予访问权限。

实现至少需要表达：服务端认可的 task 身份、owner、相关 Trip/选区、范围版本、约定成果类型、关联 Turn、结果引用、判定版本。字段命名与存储布局由具体 PR 确定；避免在计量日志中重复存储对话、敏感偏好或完整材料。

## 3. 归属与接纳

服务端根据已认证 owner、现有 task、当前范围和输入关系决定归属。客户端可提交继续某 task 的意图；服务端必须验证所有权及范围，不能仅信任客户端 ID 或模型分类。分类不确定时先澄清，不能据此自动扣新次数。

同目标必要澄清、输出修复、断线恢复沿用业务归属；明显独立目标可记录新 ServiceTask。新 ID 不等于已获准的新收费单位。完成后自主改稿、扩大范围的计费分界由agent先制定版本化开发策略并验证，实际收费前按对应发布范围确认并明确告知用户。

接纳幂等键按 owner 和请求作用域隔离，并绑定规范化请求摘要及范围版本。同 key、同内容返回原接纳结果；同 key、不同内容拒绝。不得用固定状态控制 digest 代替真实业务请求摘要，也不得通过重试生成新 task 绕过成本上限。摘要的生成、留存与访问受既有数据规则约束。

## 4. 完成判定

业务结果、Turn 终态和账本状态分别记录。一次 Turn 成功返回澄清问题，ServiceTask 可以继续等待输入；单个 Turn 的终态仍不可重开。完成后的系统修复可增加关联执行和更正收据，保留原终态与历史，不能改写已提交记录。

| 结果类别 | 最低完成判定 | 对计量的约束 |
| --- | --- | --- |
| clarification | 已明确缺少什么及下一步，尚无约定成果 | 不是新增任务消费；目标继续等待输入 |
| answered | 范围内回答通过适用证据/约束校验，成果已持久化且 owner 可读取 | 仅是可用于结算的成果证据；record-only 阶段不执行新扣次 |
| planning / proposal | 范围内候选计划和差异可审阅，约束与缺口明确 | 若约定成果为建议，可判建议已交付；不能显示 Trip 已更新 |
| Trip modification | 用户确认有效 TripProposal，版本/权限校验通过，确定性 Patch 原子提交，最新结果可读取 | 不能以 proposal_ready、按钮点击或 provider 返回代替成功 |
| partial | 已交付部分及缺失部分可辨识，保留成果并给下一步 | 不自动当完整交付或完整消费；等待 partial 政策 |
| blocked / technical failure | 缺权限、缺依据或执行失败已如实记录，既有成果保留 | 不计业务成功；新消费补偿实现须按已批准策略验证 |
| external assistance | 约定的建议/官方跳转已交付，可判该建议目标完成 | 代办、联系、预订或退款成功需另有真实结果凭证 |
| human handoff | 请求已创建或发送仅证明申请；真实受理、负责人和结果分别验证 | 不因创建 ServiceCase 或发送通知宣称人工服务完成 |

token 流结束、HTTP 200、生成了一张卡或用户点击“满意”，均不能单独充当通用完成判定。成果判断须绑定范围与任务类型，不能通过要求用户满意才结算形成无限免费重做，也不能把拒绝不合格结果当新收费目标。

## 5. 首步只记录归属，成本保护先行

第一阶段为 **record-only**：记录 ServiceTask 与 Turn/attempt 的关系、结果、澄清/修复次数和内部成本；不因新 task ID 扣费，不同时启用两套消费路径，不把历史 Turn 批量追溯成收费任务。现有代码是否有真实消费路径须按版本核验；本合同不声称已有真实旧扣费必须延续。

#194 的成本预算是首次真实 provider 调用的独立前提，继续与 IAP 解耦。调用前按 task/attempt 预留成本及并发容量，限制输入/输出、步骤、重试、运行时长和累计支出，并实际执行停用控制。必要澄清、系统修复虽不向用户另扣，也消耗同任务成本预算；达到上限应停止自动执行并给出恢复路径，不能悄悄转新任务续烧预算。

实际供应商费用按 attempt 留证。缺 usage、超时或断线进入待核，不假定费用为零，也不保证外部 API 恰好执行一次。用户额度与内部费用待核不能相互代替；费用尚不明确时，不据此把澄清或系统修复转成新的用户消费。

## 6. 消费策略启用门

#227 在完整任务单位、数字、partial、修改边界及跨期策略批准后，才启用对应用户消费。实现需与 #225 的明示权益一致；#226 的验证交易、恢复、退款与环境隔离规则继续独立生效。恢复购买、重试任务或切换设备不得重复发放权益。

届时用户容量检查、唯一预留与任务接纳必须原子化；同 owner/task 的消费归属唯一，不同 task 争用最后一份容量必须正确串行。成果写入与结算需有可恢复的一致提交点；返还、释放及迟到对账也必须幂等。不能仅靠进程内 Map、先查后写或单个唯一键证明所有并发正确。

等待用户 TTL 和费用待核期限须分开。释放预留后的继续执行需要重新检查合法容量，不能复活已到期预留、重置 task 已花成本或默认从下一段 Pass 扣取。上述跨期行为由agent先实现和验证开发策略，不等待产品许可；实际收费启用按对应发布范围确认。

## 7. producer/consumer 与兼容验证

#195 负责真实输入、ServiceTask 归属、Turn 执行与成果读取；#194 负责持久成本预留和 attempt 对账；#227 负责消费策略和容量账；#225/#226 保持商品/交易责任。共享字段和状态含义须在消费者接入前由对应 PR 固定，不要求先建设完整付费系统才开发真实文本纵切。

保留 legacy v1 的 Turn、事件序列与重连兼容；新关联先以兼容方式加入，不强迫每个历史 Turn 具备 ServiceTask。客户端未知的新结果必须诚实降级，不把未知状态映射为已完成。具体版本协商与迁移在实现 PR 列明；已应用迁移不可重写。

| 必需测试场景 | 应证明的结果 |
| --- | --- |
| 同目标两轮必要澄清、一次修复 | 一个业务归属；多个 Turn/attempt；无新增用户消费 |
| 同 key 重投、不同参数复用 key、跨 owner 猜 task | 原接纳重放、参数冲突拒绝、越权拒绝 |
| 两 worker / 两设备并发接纳，两个任务争最后一份额度 | 不重建归属、不重复扣、不超可用容量；record-only 不误开消费 |
| 提案生成、拒绝、确认、版本冲突 | 建议交付与 Trip 写入结果严格区分，未经确认不写入 |
| provider 已响应而写入前崩溃、结算前后崩溃 | 可恢复到一致成果/账本，不补造供应商零费用 |
| cancel 与成果提交竞态、lease 过期旧 worker 返回 | 按服务端有效提交顺序唯一裁定；旧执行不能越过取消或当前 lease |
| 迟到 usage/重复收据、失败返还重投 | 成本不漏记、不重记；额度补偿不重复；不能复活外部或 Trip 动作 |
| 等待恢复、跨额度窗口/Pass 到期、退款 | 按已批准策略处理；未决策略明确阻断，不默认重复授额 |
| legacy v1 重连、旧 Turn 无 task、新旧客户端并存 | 原序列与结果可读取，不追溯收费、不破坏身份隔离 |

fixture 先验证语义与状态机；真实数据库并发/恢复、允许的 provider 调用及适用 StoreKit 环境分别提供证据后，才能验收对应能力。既有 Trip 确认、RLS、来源许可、接收方权限、删除和日志边界不变。

## 一手技术依据

以下均核对于 2026-09-10，仅支持工程机制，不替 VP 决定商品规则。

- [PostgreSQL 约束](https://www.postgresql.org/docs/current/ddl-constraints.html)：唯一约束用于组合身份；跨行余额不能仅由普通 CHECK 保证。
- [PostgreSQL 显式锁](https://www.postgresql.org/docs/current/explicit-locking.html)：行锁用于同一容量状态的并发更新；事务中不持锁等待外部模型响应。
- [Stripe 幂等请求](https://docs.stripe.com/api/idempotent_requests)：仅作 key、请求参数一致性与重放设计参考；不引入 Stripe，不假设模型供应商支持同样机制。
- [Apple Transaction ID](https://developer.apple.com/documentation/storekit/transaction/id)、[currentEntitlements](https://developer.apple.com/documentation/storekit/transaction/currententitlements)：购买交易身份和权益读取不等于 VP 的服务消费记录，不可用任务重试或恢复购买重复发权益。

## 2026-09-12 记录模式实施切片（Staging 已验证）

本切片服务 #195/#194：同一明确声明的独立文本目标，其必要澄清和技术修复共享 ServiceTask 与内部成本上限。新任务、Turn、供应商 attempt 使用不同 ID；不启用用户扣次、商品额度、Trip 写入或历史内容外发。

- 私有 `service_tasks` 保存 owner、唯一 thread、首个目标 Turn、policy/consent、固定 scopeVersion=1、成果类型 `text_answer`、目标正文 SHA-256、当前末尾 Turn、首次成功预留后固定的 budget scope。正文仍只有现有 text_content 一份。私有 Turn 关联保存 task、parent、关系、规范化完整请求摘要与幂等键；普通角色与 service_role 不直接读写这些表。
- 新 native v2 提交在现有文本字段之外接收 `serviceTask:{id,scopeVersion,relationship,parentTurnId}`；关系仅 `new_goal/clarification/repair`。v1 提交、历史与 wire 保留，旧记录不追溯关联或收费。
- 新目标只进入自己的新 thread；同一任务的后续请求必须 owner/thread/policy/原 consent/scopeVersion 全部一致。`clarification` 只能接在该任务最新的 clarification Turn；`repair` 只能接在最新 technical_failure Turn。不得接续已删除、撤权、非终态或其他任务/owner 的 Turn，不开启完成后改稿或 partial 续作策略。
- 归属在此版本指服务端核验的显式目标链及权限，不声称能确定任意自然语言回复是否语义上属于原目标；不确定的业务分类不触发新用户收费。结果状态由既有 Turn/output 投影，不因 metadata ID 宣称任务完成。
- 接纳与队列入列、关联与最新 Turn 推进在同一事务内完成。幂等请求摘要使用服务端 canonical JSON，覆盖正文、语言、对象和全部归属字段；同键不同参数拒绝。对最新 parent 的并发接续最多接纳一次，重放同请求返回原 Turn。
- 接纳先获取现有 owner/session 授权，再按 UUID 顺序获取 Task/Turn 身份锁，随后 thread/task；预算只按 task → budget scope 加锁，不反向获取 account/thread。数据库预算入口把已关联 Turn ID 归一到 ServiceTask ID，旧 worker 也无法重置单任务预算。首次成功预留原子固定 budget scope；失败不绑定，释放不清除，切换 scope 拒绝。底层旧预算函数移入私有 schema 并收回直接执行权。
- 不扩展原告知的上下文范围。worker 仍只发送本次输入；相关历史、记忆、Trip 不因 metadata 关联获得外发权限。多轮上下文消费须另行实现可见告知与服务端范围检查。
- 验证包含真实本地 Auth/v2 HTTP/SQL/受控 worker 的新目标→澄清→技术失败→修复归属、共享 task 成本止损、跨 owner/错 parent/过期与撤权、幂等并发、v1 兼容与删除后不可复活。Staging、新 native UI 和完整业务归属验收分别记录，不以本地 fixture 代替。

新接口：`POST /api/chat/native/v2/turns` 返回 `version:2`、既有 accepted/turnId/reused，加 `serviceTaskId/scopeVersion/relationship/parentTurnId`。`GET` 返回当前授权、可见的最近记录及相同关联字段；不返回内部金额或额外正文。历史数量沿用最近 20 条文本记录窗口，窗口中的未关联 v1 记录不出现在 v2 结果中。任务/parent 冲突返回 409 `SERVICE_TASK_CONFLICT`，完整请求幂等冲突仍为 409 `IDEMPOTENCY_KEY_REUSE`。

Task/Turn UUID 共用接纳身份锁并双向拒绝碰撞。旧 v1 可重放已接纳文本，但不能向已绑定任务的 thread 加入无关联 Turn。元数据指向已有保留正文，不添加阻止账号/Turn 物理删除的外键；根记录隐藏或删除后，历史、续作与新派发均不可恢复。

回退：撤回本切片 API 的部署即可停止 v2 接纳，保留追加迁移、任务关联和预算固定，继续对既有 worker 强制共享预算；已关联任务不自动降级到 v1。不得通过清除关联或解除 scope 来恢复额度。迁移事务回滚在独立数据库演练；不对已有环境执行破坏性 down migration。本切片未实现 SwiftUI 消费、多轮模型上下文或生产发布。

真实 Staging 的两语言、四次模型调用共享任务预算与迁移/权限证据见[验证记录](../../artifacts/VPJ-07/service-task-staging-20260912/verification.md)。这不替代多轮上下文、原生 v2 消费或完整语义判断验收。

## 2026-09-26 U1 开发容量实现

VPJ-35 的追加迁移建立私有 ServiceTask 容量记录，默认关闭容量执行，既有任务仍是 record-only。仅在隔离开发数据库明确启用 `turn_private.service_task_capacity_settings.enabled` 后，新的文本 `new_goal` 接纳才按 `service-task-development/1` 预留一份容量；这不是正式收费启用或真实环境验收。旧 v1 Turn 与已接纳的 record-only 任务不追溯消费。

开发策略使用 #225 冻结的 Free 168 小时 4 项、24 小时 2 项，或 #226 已验证且正在有效期内的 Sandbox Pass 快照 720 小时 80 项、账号 24 小时 12 项。账号统一的 24 小时窗口计入 Free/Pass 的已结算及有效预留；有效 Pass 用尽不回退 Free。接纳与 grant 变更共用账号事务锁；请求幂等、归属、同键异参仍由 #195 原接纳契约核验。Pass 未到 `startsAt`、已过 `endsAt` 或已撤销不提供容量。

单个文本任务的 `clarification` 沿原预留；`technical_failure` 释放预留，合法 `repair` 在同一任务及原内部成本范围内重新校验容量。`answered` 仅在当前 Turn 成功提交、原 owner 可读取持久结果、相关 grant 仍有效时，将该任务预留唯一结算；失败、阻断与交付前取消释放预留。结算与成果写入在同一数据库事务，旧 worker 的重复完成与取消竞态不能重复结算。`partial` 保留已写入的部分成果、释放预留且不结算；该 Turn 已终结，现有归属契约禁止从 partial 自动续作或改稿，旧 worker 也不能再结算同一 Turn。跨窗口续作、等待 TTL、完成后改稿、真实收费及媒体任务均不在 U1 启用范围。新账本提供 service-role 限定的导出与删除 RPC；不复制 StoreKit 交易或供应商 attempt 账本。

## 2026-09-26 U2 Trip 确认成果凭证（准备切片）

`read_trip_confirmation_receipt_v1(proposal_id)` 只向当前 owner 返回仍是 Trip 最新版本的确认成果。它交叉核对已应用的 Proposal、唯一 Trip event、绑定该 Proposal 的幂等提交记录、可读取的版本快照和当前 Trip head；提案展示、拒绝、过期、旧版本和历史上未绑定 Proposal 的回执均不返回成果。结果只包含 Proposal、Trip 和版本 ID，不复制行程内容。

此凭证不是扣次接口。现有 ServiceTask 表允许 `text_answer` 与 `reviewed_answer`；U1 的容量接纳仍仅覆盖现有文本目标路径，没有 `trip_modification` 类型或 Trip thread 绑定。#198 的 Trip 确认入口尚未携带可验证的 ServiceTask 身份；因此不能把手动 Trip 编辑、任意文本任务或按钮点击视作可计量 Trip 目标。后续接入须在同一数据库事务中锁定 owner、任务与 Trip，验证任务目标/范围、当前 Proposal 和确认意图，原子 Patch 成功且版本可读后才把已有任务预留结算一次。现有确认 RPC 保持原有 owner/RLS 与幂等保护，开发容量开关仍默认关闭。Trip 变更后的延迟独立结算不能依赖本凭证，因为最新版本可能已变化。

U2 下一前置守卫：`service_task_capacity` 的新增和状态更新须核对同 owner 的 `text_answer` 任务及未绑定 Trip 的 thread；已有容量的任务不能事后改成果类型、owner 或 thread。该守卫明确冻结 U1 文本结算范围，Trip 手动确认不会接入 U1 账本。Trip 开发计量仍需可信的 agent 生产者在接纳时绑定目标、Trip、Turn、同意与 Proposal；目前没有这样的接口，不能从确认回执或已有文本任务倒推。未来实现必须显式迁移本守卫，并在同一确认事务里验证原 Proposal 及最新可读版本后结算；拒绝、修改、取消、过期、旧 worker、撤权和删除均须保持零新增结算。

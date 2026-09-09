# Q37：完整服务任务与消费账本的工程差异

研究日期：2026-09-10。代码固定于 `d4eeb084b41f8c82a1794a0f946529bb54e2d5db`；产品输入为 [Q1–Q38 原文](https://github.com/JTCAO515/VP-V4/blob/8ae95a7/docs/brand/VISEPANDA-BRAND-DISTILLATION-Q1-Q38-2026-09-10.md)。下述对象、状态与扣次方案是**建议，尚未批准或实施**。仅作源码、执行合同和一手资料研究，未运行数据库、provider 或 StoreKit 验收。

## 结论与现状证据

Q37 已接受“一项明确服务目标包含必要澄清与系统修复”，但没有确定次数、部分交付和修改边界。当前工程已有 task 级幂等方向，却没有可直接复用的完整服务任务消费实现。最小调整是在 Turn 上方建立业务归属，继续复用 Turn/attempt、TripProposal 与现有身份隔离；不另造聊天引擎，也不能把 300 Ask 直接改名为 300 服务任务。

以下路径行号均指上述固定提交，可在 [固定代码树](https://github.com/JTCAO515/VP-V4/tree/d4eeb084b41f8c82a1794a0f946529bb54e2d5db) 核对。

| 事实 | 文件与行号 | 证据边界 |
| --- | --- | --- |
| Ask 仍定义为一次用户请求，重试与修复不额外扣；partial 计费待商品固定 | `docs/VISEPANDA-MASTER-PLAN-2026-09-05.md:284–304` | 试验合同；不是实际付款用户权益 |
| RuntimeBudget 与 UsageLedger 已分别定义，后者要求同 task 不多扣 | `docs/program/2026-09-05/INTERFACES.md:17–20,37–45` | 接口意图；不足以证明真实账本 |
| Turn 终态和事件序列已定义；请求注册表是 Map | `lib/server/turn/contract.ts:1–23` | 本地合同；terminal once 不能替代服务完成判断 |
| Coordinator 明确为未来 durable 实现的内存合同 | `lib/server/turn/reliable-coordinator.ts:26–44,68–107` | 有 lease/attempt/cancel，不持久、不调用 provider |
| CostGuard 以进程内 Map 限尝试次数；另一预算 guard 仅累加内存预留 | `lib/server/model-gateway/budget/index.ts:14–47`；`lib/server/observability/launch-14.ts:118–139` | 不能证明多进程扣次、崩溃恢复或成本结算 |
| 已有事件唯一键、owner RLS、Turn 幂等表及事务 RPC | `supabase/migrations/20260828153000_v4_08_durable_chat_threads.sql:33–99` | 持久状态基础，未包含服务额度账本 |
| 最新修复 RPC 保留固定 `chat-state-control-v1` digest；HTTP 只启动状态 | `supabase/migrations/20260909033302_vpj_02_repair_local_rpc_runtime.sql:66–98`；`lib/server/identity/user-data-adapter.ts:1027–1043` | 不能拿固定 digest 识别真实消息/服务目标差异 |
| 模型适配代码注明 durable reservation/dispatch 未实现 | `lib/server/model-gateway/adapters/provider-protocol.ts:56` | 协议准备，不是调用链上线 |
| Staging 25 条迁移和普通 JWT 隔离有执行记录；worker 未验 | `artifacts/VPJ-02/unrun.md:3–8` | 本研究只读已有证据，未独立重跑；不能外推真实 Ask/收费可用 |

在固定快照的 `lib/`、`app/`、`ios/`、全部 25 条迁移中检索 entitlement/usage ledger、quota、StoreKit，未找到对应购买/消费运行实现；此结论仅覆盖本快照，不能代表其他任务未合并分支。

## 最小对象与判定建议

保留 `Thread → Turn → Attempt`；新增 `ServiceTask` 作为一个或多个 Turn 的共同业务归属。最少记录 owner、可选 Trip、目标/范围版本、约定成果类型、状态、原始额度预留及结果引用。归属必须由服务端验证；LLM 可建议分类，但不能单独决定收费或解除限制。

将业务结果和执行状态分开：一次 Turn 可以成功返回澄清问题，但 ServiceTask 仍在 `awaiting_input`；一份可审阅提案可以构成规划成果，但 `proposal_ready` 不代表 Trip 已修改。完成依据是约定成果持久化并可读取，不是 token 流结束，也不能简单要求用户点“满意”才结算。

| 输入/异常 | 建议归属与扣次 | 待固定条件 |
| --- | --- | --- |
| clarification | 同目标补日期、人数、约束，沿用 task，不新增扣次 | 等待用户的保留时间 |
| amendment | 在已约定范围内补充或纠错，沿用 task；显著扩展则先说明新范围 | 完成后自主改偏好的次数/时间边界 |
| new goal | 新目的地、另一日期范围或独立成果，新 task；生成前告知消费 | 不能仅凭消息相似度判断 |
| retry / 系统修复 | 原 task 下新 attempt/Turn，用户不多扣，内部成本照实累加 | 终态修复不改写原收据与历史事件 |
| timeout / technical failure | 无合格成果则释放用户预留；供应商费用未知另入待核 | 等待超时不等于供应商未执行 |
| partial | 明确已交付/缺失部分和下一步；未确定政策前不自动当完整消费 | 可用成果标准及是否扣一次必须先定 |
| cancel | 未交付则释放；已持久交付与取消竞态依服务端提交顺序裁定 | 取消已有可用成果是否返还须明示 |

外部动作另保留独立结果，例如“说明退票办法”可以完成咨询任务，“已退票”必须有真实证据；人工受理也不能由 AI 回答终态代替。

## 两本账与防重复治理

**用户容量**按服务任务；**内部成本**按每个真实 attempt。调用前以事务原子完成额度检查、唯一预留和任务接纳：同一 owner/task 仅一份消费归属，服务端锁定账号额度行，避免两个不同 task 同时消费最后一份额度。`UNIQUE` 解决重复身份，行锁解决同一余额的竞争，两者不能互替；PostgreSQL 官方还明确跨行余额规则不能仅靠普通 CHECK 保证。[约束](https://www.postgresql.org/docs/current/ddl-constraints.html)、[行锁](https://www.postgresql.org/docs/current/explicit-locking.html)（核对于 2026-09-10）。

结果持久化和用户账结算应有同一事务提交点，取消/完成使用状态条件更新；释放、返还、对账也必须幂等。重投递使用原 key 与原输入摘要；相同 key 不同业务参数拒绝，重试不能生成新消费。Stripe 官方的 key 重放和参数冲突规则可作设计参考，**不是选择 Stripe，也不能假设三个模型 API 支持同等幂等**。[官方幂等说明](https://docs.stripe.com/api/idempotent_requests)（2026-09-10）。

每次 dispatch 前独立预留成本上界，限制输入/输出、工具次数、总运行时长、重试、并发和全局支出；所有澄清与修复共享 task 总预算，不因用户免费而无限运行。缺 usage 尾包保留待核费用，不按零结算，不盲目放出对应成本预算；晚到响应只能对账，不能恢复已取消的 Trip 写入。用户预留的等待 TTL 与供应商费用待核期限分开；超时释放后恢复原目标须重新检查可用容量，不能复活已失效预留或重置历史成本。

## 兼容、测试与既有 Issue 调整

先以影子记录同时统计 Ask、ServiceTask、Turn、attempt、成本及成功成果，只有旧规则执行真实扣次；新规则批准切换后也只能有一个权威扣次路径。保留旧事件 schema/接口版本，增量加入 task 关联；历史结果不追溯扣费、不重写已应用迁移。回滚关闭新接纳，继续读取和对账已产生记录，不能用代码回滚抹除消费。

| Issue | 建议增量与验收 |
| --- | --- |
| #195 | 首条真实文本纵切保留；在输入前固定 task 归属，补“回答澄清后继续同任务”、跨端恢复、成果与 Trip 确认分离 |
| #194 | 完成 durable task/attempt 预算、崩溃与未知费用对账；继续不依赖 IAP，不等商业条款才建设成本止损 |
| #227 | 改为明确服务任务口径；测两个 worker、两个设备、最后一份额度、重放、跨窗口、cancel/complete、退款/结算竞态 |
| #225 | 对照更新免费基础记忆与任务容量；重测原数字；partial、修改边界、TTL/跨期处理先决策再公示 |
| #226 | 保留购买、恢复、撤销和环境隔离；交易只发原权益，不因恢复、task 重试或跨端重新发额度 |

StoreKit 的 transaction `id` 是交易身份，`currentEntitlements` 对非续费订阅返回最新交易，不能替代 VP 的逐段购买/消费账。此处只支持已有“不重复发 grant”的工程边界；不研究或改动 Q38 激活/eSIM。[交易 ID](https://developer.apple.com/documentation/storekit/transaction/id)、[权益序列](https://developer.apple.com/documentation/storekit/transaction/currententitlements)（2026-09-10）。

最终真实验收必须观察数据库账本、允许的 provider 成本和两端同一成果；fixture 能先验证分类与状态机，但无法证明数据库并发、真实供应商计费或实际 Store 交易。当前建议优先锁定 ServiceTask 最小契约，并行推进 #194 的成本账与 #195 的真实结果；#227 集成等待其真实前置，商业未决不应阻塞独立技术准备。

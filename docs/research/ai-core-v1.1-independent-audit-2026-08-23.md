# VisePanda AI Core v1.1 独立审计与处置记录

- 日期：2026-08-23
- 对象：[整体研究报告](../ai-core-integrated-research-report.md)、[工程报告](../ai-core-engineering-development-acceptance-report.md)及三份领域规划
- 审计方式：两个只读独立 agent，分别以产品/领域和 Staff+ 工程视角审查；主任务再用仓库代码、官方资料和确定性检查验证后处置
- 证据边界：agent 意见不是事实投票；本文件记录反例、处置和残余风险，不替代 operator/ADR acceptance

## 1. 产品/领域 P0 处置

| Finding | Resolution | Canonical location |
| --- | --- | --- |
| workspace/companion 定位冲突 | workspace 为产品定义，companion 为体验承诺；列入 DEC-01 | master §0.1/§13 |
| Fact 与 External ReviewedFact 竞争 | Fact 仅属 Knowledge；Observation/UserArtifact/ExternalRef 分离；统一 EvidenceReceipt | master §2.4；external §2.2 |
| AssistantTurn 缺 ExecutionCard | canonical AssistantTurn 增加 cards；执行卡由 deterministic renderer 产生 | model §5.4；master §3.2 |
| Proposal 状态/revision/后台修改 | pending revision immutable；building draft 不可确认；edit/partial/day detail 产生新 revision/child | master §4.2；model §6 |
| 用户私有地点缺失 | 新增 UserPlaceRef/UnresolvedPlaceRef，仅 owner Trip 可见 | master §4.4；knowledge §8 |
| expired Canvas 语义矛盾 | 不能支撑新 claim；保留用户决定/receipt并标 recheck | master §0.4/§4.4 |
| Guide 第二事实源 | critical sentence 绑定 Fact IDs 并继承失效 | master §8.2；knowledge §7.1 |
| supportingValues 字符串门 | 替换为 typed GroundedClaim + EvidenceReceipt + deterministic rendering | master §8.3.1；knowledge §7.9；model §7.2 |
| 流式先展示后验证 | R1/R2 所有模型正文 buffered；SSE 仅 phase/progress；未来增量另立 ADR | master §3.7；engineering §4.2；model §5.5 |
| RAG 强制单实体 | exact/discovery/comparison/scene-national/ambiguous query modes | master §8.3；knowledge §7.4 |
| Fact/assessment/facet 混淆 | Operational/Observed Fact、EditorialAssessment、DerivedFacet、Guide 分层 | master §8.2 |
| licence 只有 dataset boolean | purpose-bound rules + PolicyReceipt + trial/derived/share-alike/combine/backfill/purge | master §7.2；external §2.3 |
| OSM 过早生产化 | isolated staging，等待 ODbL/database-boundary/legal decision | master §7.4；knowledge §5.1 |
| 模型候选写成最终组合 | 改 provisional baseline，需 eval/conformance/region/DPA | master §0.3/§5 |
| 多模态跨阶段合同缺失 | source/target language、revision、final-only、TTS hash、TTL/delete receipt | master §6.3 |
| runtime host 未证明 | request/background/batch/realtime 分平面，direct upload，WebRTC/WS conformance | engineering §8 |
| 三个“唯一下一动作” | 全局只用 DEC register -> SYS-00/R0 -> R1–R5 | master §13；engineering §12/§17 |

## 2. 工程 P0 处置

| Finding | Resolution | Canonical location |
| --- | --- | --- |
| durable Turn/SSE 未定义 | TurnCoordinator start/observe/get/cancel；durable events、sequence、resume、idempotency、abort | engineering §2.3/§4.2/§5.1 |
| confirm 与 apply 非原子 | only `confirmAndApplyProposal`; CAS + snapshot/event/proposal/audit one transaction | engineering §4.3 |
| JWT/RLS 与 pooler 混淆 | User/Ops JWT security-invoker RPC；worker-only system/pooler path；三 adapters | engineering §7.4/§8.1 |
| Ops 在 public deploy | R1/R2 no Ops UI；first curation uses separate protected deploy | engineering §3/§7.4 |
| queue/outbox 叠加 | R1 no queue；Postgres pgmq send in same transaction when needed；outbox only external broker | engineering §5.5 |
| projection lag 可泄漏 | projection narrows candidates；authoritative eligibility recheck and cache expiry/tag invalidation | engineering §5.3/§8.1 |
| legacy 与工期失真 | disposition matrix；R0–R5 critical path；full beta 24–35 focused weeks | engineering §3.1/§12 |
| realtime 被单 Promise 接口掩盖 | split BatchTranslation and RealtimeTranslation open/observe/finish/cancel | engineering §2.3/§4 |
| module owner 名称冲突 | interface table fully aligned to TurnCoordinator/TripWorkspace/KnowledgeSystem/etc. | engineering §4 |
| grounded answer 仍是散文+Fact IDs | split low-risk explanation vs typed grounded execution | model §7.2 |
| field-level policy 未进入 detailed type | ExternalDataPolicy rules + PolicyReceipt schema/acceptance | external §2.3/§13 |

## 3. 仍需 operator/implementation 验证

- DEC-01 through DEC-11 尚未接受；
- new Supabase project vs VP-Final migration 未决定；
- authenticated-only closed beta 与 separate Ops deploy 未接受；
- model/media region、retention、DPA和实际账号能力未验证；
- DeepSeek Flash beta、Vision experimental、Qwen region/LiveTranslate 只完成文档证据；
- User/Ops security-invoker RPC 和 SystemDataAdapter 尚未实现/pgTAP；
- WebRTC/WS、direct upload、pooler、queue quarantine、Storage restore 未实测；
- 五语 model/RAG/OCR/voice eval、内容 pilot、航空合同和生产观察窗未运行。

## 4. Audit verdict

- Research/design proposal：通过审计处置，可进入最终 deterministic checks 与 operator decision；
- G1 interface baseline：只有 operator 接受 DEC/SYS-00 后才可冻结；
- Runtime：not implemented / not eligible；
- Production：not accepted；
- Public capability claim：prohibited。

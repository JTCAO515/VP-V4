# Domain documentation

> 当前执行定义已迁至 [Agent / iOS / Web 计划](../product/VPV10-MODULAR-001/current-overview.md)。旧 issue-plan.json 的83任务、20 replacements及旧生成正文保留为历史定义/证据；旧同步命令禁止恢复旧标题正文。当前用户结果、稳定ID、依赖和批次只从新源读取。

> 2026-10-14 当前方向：[同仓 iOS / Web / Agent 三工程](../contracts/vpv4-project-boundaries.md)。该方向替代下文历史的端侧主从定位与固定实施次序；已有领域合同、验收条款、完成证据和权限门保留。先完成方向与开放 Issue 重排，后续实施由唯一 Main 按真实输入接续。

VP-V4 has one active product context: VPJ-00 #187. The [Program entry](../program/2026-09-05/README.md)
maps product decisions, task planning, interfaces, runtime evidence and historical records.
[ADR-0023](../adr/ADR-0023-vpj-integrated-native-journey-baseline.md) defines the native-first zh/en
product; [ADR-0025](../adr/ADR-0025-brand-service-task-and-response-semantics.md) adds the confirmed
preference, ServiceTask and response semantics. The [development workflow](development-workflow.md)
/ ADR-0024 governs execution and supersedes conflicting historical procedure.

## Read for the current task

The current assistant experience and versioned Conversation/goal/artifact integration follow
[ADR-0027](../adr/ADR-0027-personal-journey-assistant.md). These planned additions do not imply
live APIs; retain each existing domain authority and the single durable work/budget path.

Read root AGENTS/CONTEXT, the current Issue/PR and its [VPJ execution row](../program/2026-09-05/EXECUTION-CONTRACT.md),
then affected interfaces, code, tests and accepted decisions. Read the master report on first
entry or scope change. Load historical research and old AI/V4/LAUNCH rows only when their evidence
or retained contract is relevant. Planning status and copied handoff do not establish live readiness.

Use the existing domain vocabulary from [INTERFACES.md](../program/2026-09-05/INTERFACES.md) and the
owning module contract: TurnCoordinator, TripWorkspace, TripProposal, EvidenceReceipt, GroundedClaim,
KnowledgeSystem, Imported POI Candidate, Canonical POI, Fact and Explore Projection. A term or type
in a plan does not prove that its schema or runtime consumer exists.

ServiceTask is the bounded user goal across Turns/attempts; ServiceCase is human assistance.
Their responsibilities, execution state, business result and accounting state remain distinct.
Read the [metering contract](../contracts/service-task-metering.md),
[basic-preferences contract](../contracts/basic-preferences-cross-trip.md) or
[response policy](../contracts/vp-response-policy.md) when affected; do not duplicate their rules
or treat planning semantics as an already active wire or billing change.

## Resolve changes at the owning contract

Resolve ordinary implementation choices within accepted contracts. A substantive product,
security, privacy or architecture conflict needs a scoped decision/new ADR; prepare options and
continue independent authorized work. ADR-0024 supersession handles obsolete procedure without
removing valid runtime invariants. Maintain source documents and their declared projections;
update affected module contracts when behavior changes, not every related historical report.

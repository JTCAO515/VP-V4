# Domain documentation

VP-V4 has one active product context: VPJ-00 #187. The [Program entry](../program/2026-09-05/README.md)
maps product decisions, task planning, interfaces, runtime evidence and historical records.
[ADR-0023](../adr/ADR-0023-vpj-integrated-native-journey-baseline.md) defines the native-first zh/en
product; [ADR-0025](../adr/ADR-0025-brand-service-task-and-response-semantics.md) adds the confirmed
preference, ServiceTask and response semantics. The [development workflow](development-workflow.md)
/ ADR-0024 governs execution and supersedes conflicting historical procedure.

## Read for the current task

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

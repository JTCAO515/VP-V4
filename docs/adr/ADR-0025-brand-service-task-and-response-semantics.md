# ADR-0025: Basic cross-Trip preferences, service-task metering and response semantics

2026-09-27 scoped supersession: [ADR-0027](ADR-0027-personal-journey-assistant.md) defines the current assistant experience, navigation and versioned integration. Historical decisions/evidence below remain intact; unaffected Trip, memory authority, billing integrity and safety contracts still apply.

Status: proposed for the adopting planning PR. The Q36/Q37 product directions are confirmed inputs; this repository specification takes effect when the PR merges. Runtime schemas, unsettled charging policies and operational permissions are not approved by this ADR.

## Context

The [Q1–Q38 brand report](https://github.com/JTCAO515/VP-V4/blob/8ae95a7/docs/brand/VISEPANDA-BRAND-DISTILLATION-Q1-Q38-2026-09-10.md) confirms Free access to explicitly saved basic cross-Trip preferences and a service unit that includes necessary clarification and system repair. The old plan still defines one Ask per user request and puts cross-Trip enhancements in Pass. Renaming those limits would change the work represented by each unit without establishing its cost or lifecycle.

The current code already has Profile/Memory, Turn, provider protocol and response contracts. Replacing them would duplicate responsibilities while leaving actual consumers disconnected. The [engineering study](../research/VISEPANDA-BRAND-ENGINEERING-ADJUSTMENTS-2026-09-10.md) records the code evidence, operational limits and alternatives.

## Decision

- Free and Pass share explicitly saved basic preferences under the same consent, scope, correction and withdrawal controls. Each Profile/Memory field retains one authoritative owner; tasks use a minimal eligible projection.
- ServiceTask names a bounded user goal and its agreed deliverable. It associates one or more Turns and actual attempts; it is neither a new execution queue nor an automatically billable ID. ServiceCase remains the distinct human-assistance responsibility.
- Necessary clarification and system repair do not add another user consumption. Internal attempt cost remains measured and bounded. Start with record-only task attribution; activate charging only after its policy is settled and its actual path verified.
- VP response content and tone use the existing producer/prompt lifecycle. Evidence and real action receipts govern claims, controls and status; natural wording cannot grant permissions or establish completion. English is the primary authored language with equivalent Chinese meaning; existing legacy locale compatibility remains.

Normative planning detail: [basic preferences](../contracts/basic-preferences-cross-trip.md), [service-task metering](../contracts/service-task-metering.md), [response policy](../contracts/vp-response-policy.md). Concrete schema/consumer migrations are reviewed in the responsible implementation PRs.

## Supersession and retained gates

This supersedes only the blanket Pass-only interpretation of basic explicit cross-Trip preferences and the use of one-message Ask counts as the new service-task unit. Six conflicting criteria in #225/#226/#227 are explicitly replaced; their exact prior text remains in [the delta record](../research/brand-engineering-2026-09-10/issue-deltas.json). Historical Ask numbers do not become ServiceTask quotas.

ADR-0023 architecture, native-first zh/en scope, current purchase-to-effective-time policy, transaction identity/order/refund/restoration invariants, media limits, actor/RLS, evidence eligibility, exact TripProposal confirmation, append-only migrations, deletion and ADR-0024 workflow remain. Q38 activation, eSIM, new recipients, real charging and new commercial terms remain outside this change. Partial charging, amendment boundaries, waiting TTL, cross-period continuation and new capacity values are still decision gates.

## Acceptance and rollback

Verify all task identities, native dependencies, states and existing completion evidence remain preserved; only the recorded acceptance delta changes. Check generated documents, local links, archive hashes and applicable CI. Runtime acceptance remains with the original Issues and requires actual producer/consumer, cost, data and device evidence.

Revert the adopting planning change and restore only its Issue-body delta using the preserved prior text, without overwriting intervening execution progress. This is a planning rollback, not authority to restore old runtime billing, applied migrations, deleted data or revoked permissions.

# Coding-agent kickoff and handoff

Copy the following after choosing a live Issue. This is an implementation entry, not permission to start all tasks, launch subagents or operate Production.

```text
Implement one observable result of the VP personal-assistant upgrade under Program #187.
Current Issue: <number and VPJ-ID>
Upgrade wave: <U0–U4 from issue-plan.json deliverySupplements.assistant-20260927>
This slice's user-visible result: <one behaviour, including the UI that proves it>
Mode: <prototype/preparation, real runtime integration, or release acceptance>

Read AGENTS.md, CONTEXT.md, docs/agents/development-workflow.md and the live Issue/PR.
Read docs/adr/ADR-0027-personal-journey-assistant.md and
docs/product/assistant-upgrade-2026-09-27/{README,EXPERIENCE,ARCHITECTURE}.md.
Use the existing issue-plan.json row for full scope, dependencies and checks.
Inspect current main, pending PRs, ownership and the exact interfaces needed by this slice.

The accepted shell is VP / Journeys / Library / Memory, default VP; global search hosts
discovery. Memory is conspicuous and changes actual results. Do not implement the old
five-tab UI or copy the concept images' obsolete navigation. The visual system may evolve.
Preserve usable tools, account/privacy/purchases, Today and old deep-link reachability.

Deliver front-end perception together with the underlying capability. State precisely which
producer, schema, persistence, event, consumer and validation path this PR connects.
Reuse identity, TripProposal/diff/confirm/atomic Patch, qualified knowledge, memory authority,
durable jobs/budgets and privacy contracts; no shadow truth source or new generic Agent platform.
Treat text-only legacy mode and new assistant mode separately. An accepted task may continue
with the app closed, but a shown progress/result must be supported by current server state.

Use an isolated checkout when necessary, one coherent outcome per PR, actual scope-appropriate
checks and all required CI. For auth/data/critical contracts run the applicable adversarial and
independent review required by repository rules. Do not broaden tests merely because a skill
changes. Real provider/device/database assertions need actual target-environment evidence.
Do not close an existing parent from a prototype or a partial upgrade slice.

Record implemented / target-environment observed / user accepted / released separately.
Keep blocked, failed, unknown and UNRUN distinct from completion. At handoff give the changed
contract, source revision, actual commands/results, remaining inputs and exact next slice.
Update shared handoff only for shared decisions/state, preserving concurrent execution evidence.
```

## First work units

- VPJ-77 can start the interaction specimen from the accepted direction, without waiting for provider deployment. Use explicit fixtures and include the three-moment journey plus memory correction. A prototype is not release acceptance.
- VPJ-78 can inventory and version message/task/goal association alongside U0. Freeze producer/consumer fixtures and deletion semantics before schema implementation. It does not need every historical #195 criterion closed to prepare the new interface.
- #199 can connect a bounded actual memory consumer and visible correction using current Profile/Memory authority. Coordinate API/model basis fields with VPJ-78 rather than creating a competing store.
- Preserve independently progressing #243/#237/#503 foundational work. Do not rename, overwrite or dispatch into another chat merely because the schedule changed; coordinate when an actual interface/file/environment collision exists.

## Check selection

Planning-only changes: `pnpm docs:check`, `git diff --check`, link/reference inspection, and existing governance tests when touching the manifest/generation contract. No new app build or fixture mirroring a text edit is required locally.

Native UI: affected build/tests, rendered state/interaction checks on available runtimes, zh/en, Dynamic Type/VoiceOver/Reduce Motion as affected; actual device evidence for promised device behaviour. Web changes: affected browser flows and console, not a static source test labelled browser acceptance.

Task/context/tool/data changes: contract and adversarial tests for ownership, versioning, retry, cancellation, withdrawal, stale basis, duplicate events and cost settlement; isolated migration compatibility/rollback. Real worker/provider/native integration uses the same version/environment. Reuse effective evidence rather than repeating unrelated suites.

## Evidence to hand off

The PR/Issue records a concise result, not a directory count. Persist selected screenshots/logs under the owning existing `artifacts/VPJ-ID/` only when useful. Include unresolved external inputs, capability flags and rollback; never secrets, full private prompts or hidden reasoning. The upgrade is accepted only when the traveller can find memory, delegate work, return to a real result, correct a preference and confirm a precise change through the supported path.

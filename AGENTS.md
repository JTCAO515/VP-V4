# VP-V4 Engineering Instructions

Active product: VPJ-00 #187. ADR-0027 defines the current personal-assistant upgrade;
unaffected ADR-0023/0025 domain and safety contracts remain. Native SwiftUI iOS is the complete
product; Web is a lightweight same-Trip Planning Studio. Start with `CONTEXT.md` and the current Issue.
Upgrade entry: `docs/product/assistant-upgrade-2026-09-27/README.md`.
Product entry: `docs/program/2026-09-05/README.md`.

## Where each rule lives

Every rule below has exactly one home. Read the one you need; do not expect it restated elsewhere.

| Topic | File |
| --- | --- |
| Work unit, scope, local check selection, evidence vocabulary, handoff updates | `docs/agents/development-workflow.md` (ADR-0024) |
| Authority classes, merge rules, operator queue, long-session scheduling and stop conditions | `docs/agents/continuous-afk-execution.md` |
| Task scope, runnable command registry, red-line suite registry | `docs/agents/issue-execution-contract.md` |
| Issue and label semantics | `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md` |
| Development-stage integration approvals | `docs/agents/development-integration-policy.md` (JT, 2026-09-12) |
| Domain vocabulary | `docs/agents/domain.md` |

## Implementation foundations

- Web/server: Next.js App Router, React, strict TypeScript, Tailwind CSS v4.
- Build routes in `app/` and typed interactive UI in `components/`. Keep `app/page.tsx` a Server
  Component; isolate browser state/handlers behind explicit `"use client"` boundaries.
- Use `next/image` for supported raster assets and `next/font/local` for bundled fonts. SVG may
  use an accessible inline component or image element as appropriate to the asset.
- Use product tokens and the accepted responsive layer in `app/globals.css`; scope visual changes
  to the requested UI task. Runtime imagery uses local `public/assets/visepanda/` assets, not
  `/assets/source/`. Observe existing asset rights and release checks.
- Release languages are zh/en. Preserve legacy es/ru/ar assets and payload compatibility until
  VPJ-01's migration is verified; test affected locale/RTL paths.
- Describe only capabilities verified for the stated version, environment and supported scope;
  fixture demos, planned features and actual runtime outcomes must remain distinguishable.
- For external ML tools, weights or datasets, use `docs/harness/hf-reuse/README.md` for scoped
  reuse, separate licences, fixed revisions and offline-versus-runtime acceptance.

## Invariants

These hold regardless of task, agent or urgency:

- Confirmed TripProposal → visible diff → atomic Patch.
- Actor isolation and RLS; data and recipient permissions; asset licences; safe logging.
- Applied migrations are append-only; deletion and rollback contracts stay intact.
- Never fabricate an approval, test result, transaction or runtime observation.
- Never reveal, request in chat, or commit a secret; never weaken a check to get green CI.
- Development autonomy grants no production, account, payment or external-message authority.

## Judgement

The rule files state boundaries, not a procedure to follow step by step. Within those boundaries,
choose the reading, the slice, the checks and the sequence yourself, and record what you actually
ran. When a rule and an observed repository or runtime fact disagree, the observation wins and the
rule file gets corrected in the same PR.

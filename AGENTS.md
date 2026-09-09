# VP-V4 Engineering Instructions

Active product: VPJ-00 #187 / ADR-0023. Native SwiftUI iOS is the complete product;
Web is a lightweight same-Trip Planning Studio. Start with `CONTEXT.md` and the current task.
Product entry: `docs/program/2026-09-05/README.md`.

## Development workflow

Follow `docs/agents/development-workflow.md` (ADR-0024) for reading, scope, preparation,
validation and handoff. It replaces conflicting historical workflow instructions.

- Read the current Issue/PR, its VPJ row and affected interfaces/code; load research and other ADRs on demand.
- Verify live dependencies and readiness; reconcile stale labels instead of treating them as permanent blockers.
- Use one coherent outcome per PR. Incremental PRs may share an Issue; preserve complete acceptance tracking.
- Use an isolated checkout/worktree as needed to protect concurrent and user changes.
- Explicit maintenance requests may use a compact Issue/PR brief without a new VPJ product row.
- Explain necessary adjacent-file changes and coordinate actual ownership conflicts.
- Run checks appropriate to changed behavior; existing CI and final capability acceptance remain required.
- Update shared handoff when shared state changes, using `docs/handoff.json` as the source.
- Long sessions follow `docs/agents/continuous-afk-execution.md`; continue independent work after a blocker.

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

## Invariants and authority

Preserve confirmed TripProposal/diff/atomic Patch, actor isolation/RLS, data/recipient permissions,
licences, safe logging, append-only applied migrations, deletion and rollback contracts.
Never fabricate approvals, test results, transactions or runtime evidence. Preserve secrets and
unrelated user changes. Development autonomy grants no new production, account, payment or
external-message authority and never bypasses required checks or reviews.

Tracker and labels: `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`.
Task checks and red lines: `docs/agents/issue-execution-contract.md`.

# VP-V4 Engineering Instructions

The current Web/server runtime is Next.js App Router + React + strict TypeScript + Tailwind CSS v4.
The active delivery baseline is VPJ-00 #187 and ADR-0023: native SwiftUI iOS is the complete product;
Web is a lightweight same-Trip Planning Studio. Start at `docs/program/2026-09-05/README.md`.

- Build routes in `app/` and interactive UI in typed components under `components/`.
- Keep `app/page.tsx` a Server Component; isolate browser state and event handlers behind explicit `"use client"` boundaries.
- Use `next/image` for local raster/SVG assets and `next/font/local` for bundled fonts.
- Tailwind owns global foundations and product tokens. `app/globals.css` contains the accepted responsive visual compatibility layer; do not silently redesign it outside an approved UI task.
- Runtime imagery and wordmarks are project-local VisePanda assets under `public/assets/visepanda/`; do not reintroduce `/assets/source/` media paths. Existing bundled fonts and shape masks still require rights review before public release.
- Current release copy and acceptance target `zh` and `en`. VPJ-01 owns the explicit migration of
  existing five-locale UI/wire tests; preserve legacy es/ru/ar assets and payload compatibility until
  that migration is verified. Do not advertise future languages as supported or silently break RTL.
- Do not claim real AI, persistence, inventory, booking, payment, Human Help, SLA, or complete city coverage.
- Required checks: `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, copy/claim scan, desktop browser QA, and 390×844 browser QA.

## Agent skills

### Issue tracker

Track work in `JTCAO515/VP-V4` GitHub Issues. External PRs are not a triage request surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the canonical `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix` roles together with project `phase:*`, `priority:*`, and `status:*` labels. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository: read root `CONTEXT.md`, relevant `docs/adr/`, and the mandatory reading order before planning or implementation. See `docs/agents/domain.md`.

### Issue execution contract

Every AI Core Issue's mandatory reading order, allowed and forbidden paths, runnable commands,
evidence artifacts, and red-line suite IDs live in `docs/agents/issue-execution-contract.md`.
Issue bodies link to it; that file is the authority. Do not start an Issue whose row is missing.

Only the current VPJ execution rows are active. Native dependencies and unmerged interface work
gate implementation. A fixture preparation may proceed only if its own Issue explicitly permits
that scope; it is not runtime acceptance. Preserve one-Issue/branch/PR and every fail-closed guard.

### Continuous AFK sessions

A Continuous AFK session may move from one independently executable Issue to another without
per-Issue operator confirmation. It must follow `docs/agents/continuous-afk-execution.md`: keep one
Issue/branch/PR per work unit, recompute the live frontier after every PR or merge, and record then
skip operator-only blockers while other safe work remains.

AFK mode never authorizes bypassing required checks, branch protection, RLS,
permission boundaries, privacy/data-licence policy, migration rollback requirements, secrets,
production cutover, or irreversible actions. Human confirmation may be replaced by deterministic
or browser-automated evidence only when that evidence actually tests the acceptance condition.
An active explicit operator instruction may authorize repository-only Class B preparation to merge
after independent automated review and every required check; it never authorizes production actions.

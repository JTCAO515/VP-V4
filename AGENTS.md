# VP-V4 Engineering Instructions

The accepted runtime is Next.js App Router + React + strict TypeScript + Tailwind CSS v4.

- Build routes in `app/` and interactive UI in typed components under `components/`.
- Keep `app/page.tsx` a Server Component; isolate browser state and event handlers behind explicit `"use client"` boundaries.
- Use `next/image` for local raster/SVG assets and `next/font/local` for bundled fonts.
- Tailwind owns global foundations and product tokens. `app/globals.css` contains the accepted responsive visual compatibility layer; do not silently redesign it outside an approved UI task.
- Runtime imagery and wordmarks are project-local VisePanda assets under `public/assets/visepanda/`; do not reintroduce `/assets/source/` media paths. Existing bundled fonts and shape masks still require rights review before public release.
- Keep all user-facing copy synchronized across `zh`, `en`, `es`, `ru`, and `ar` in `lib/i18n.ts`. Arabic must keep document-level `lang="ar"` and `dir="rtl"` behavior.
- Do not claim real AI, persistence, inventory, booking, payment, Human Help, SLA, or complete city coverage.
- Required checks: `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, copy/claim scan, desktop browser QA, and 390×844 browser QA.

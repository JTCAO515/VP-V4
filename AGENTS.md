# VP-V4 Engineering Instructions

The accepted runtime is Next.js App Router + React + strict TypeScript + Tailwind CSS v4.

- Build routes in `app/` and interactive UI in typed components under `components/`.
- Keep `app/page.tsx` a Server Component; isolate browser state and event handlers behind explicit `"use client"` boundaries.
- Use `next/image` for local raster/SVG assets and `next/font/local` for bundled fonts.
- Tailwind owns global foundations and product tokens. `app/globals.css` temporarily retains the reference-clone fidelity layer; do not silently redesign it during framework migration.
- The current images, video, logo, portraits, and fonts are reference-site assets. The repository remains a local text draft and must not be published until a separate asset, brand, and rights migration passes review.
- Do not claim real AI, persistence, inventory, booking, payment, Human Help, SLA, or complete city coverage.
- Required checks: `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, copy/claim scan, desktop browser QA, and 390×844 browser QA.

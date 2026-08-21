# Context

Objective: migrate VP-V4 to Next.js, React, strict TypeScript, and Tailwind CSS while replacing runtime copy with the approved VisePanda product-preview language.

Status: framework migration and text draft only; not publishable.

Scope:

- Next.js App Router runtime and build configuration
- typed React Client Component for existing interactions
- Tailwind v4 foundation plus the preserved fidelity CSS layer
- text, aria, toast, metadata, and project documentation migration

Blockers: reference-site images, video, logo, portraits, and fonts remain. Real VisePanda interfaces and backends are not connected. Browser-rendered QA must be rerun outside the current port-restricted sandbox.

Reading order:

1. `README.md`
2. `docs/adr/0001-nextjs-typescript-tailwind-migration.md`
3. `design-qa.md`
4. `app/page.tsx`
5. `components/VisePandaLanding.tsx`
6. `app/globals.css`

Next action: run a separate asset, brand, and interface migration review before any public deployment.

Rollback: revert the framework-and-copy migration commit.

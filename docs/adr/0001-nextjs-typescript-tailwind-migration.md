# ADR-0001: Next.js, TypeScript, and Tailwind migration

Status: accepted by direct operator instruction on 2026-08-21.

## Context

VP-V4 began as a Vite/JavaScript reference clone. The operator requested Next.js + React + TypeScript + Tailwind CSS and VisePanda product-preview copy. The accepted visual structure and local assets must remain stable during the framework migration.

## Decision

- Use Next.js 16 App Router and React 19.
- Keep `app/page.tsx` as a Server Component.
- Put existing browser interactions in one explicit Client Component.
- Enable strict TypeScript.
- Use Tailwind CSS v4/PostCSS for foundations and product tokens.
- Retain the prior high-fidelity global CSS as a temporary compatibility layer rather than redesigning during migration.
- Use `next/font/local` and `next/image` for local resources.
- Remove Vite, the old Sites Worker wrapper, and their tests.

## Consequences

- The build and verification contract changes to ESLint, TypeScript, Next build, copy scan, and browser QA.
- The page remains frontend-only and not publishable because reference assets remain.
- A later, separate migration must replace assets, brand surfaces, mock behaviors, and connect real interfaces.

## Rollback

Revert the framework-and-copy migration commit to restore the Vite baseline at `61afe20`.

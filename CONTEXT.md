# Context

Objective: keep the accepted Layla-inspired page structure while completing the VisePanda wordmark, five-locale UI, Arabic RTL, China-travel imagery, and removal of unsupported reference-brand sections.

Status: implementation and automated verification complete; browser-rendered QA and remaining font/shape rights review are open.

Scope:

- Next.js App Router runtime and build configuration
- typed React Client Component for existing interactions
- Tailwind v4 foundation plus the preserved fidelity CSS layer
- text, aria, toast, metadata, and project documentation migration
- Chinese, English, Spanish, Russian, and Arabic localization with document-level RTL
- project-local ImageGen China-travel imagery and VisePanda wordmarks
- removal of the reference logo walls and four-promises chapter

Blockers: the requested same-font treatment keeps the existing local font files, and the existing shape masks remain; both need a rights review before public release. Real VisePanda interfaces and backends are not connected. Browser-rendered QA must be rerun outside the current port-restricted sandbox.

Reading order:

1. `README.md`
2. `docs/adr/0002-visepanda-brand-localization-assets.md`
3. `design-qa.md`
4. `lib/i18n.ts`
5. `components/VisePandaLanding.tsx`
6. `app/globals.css`

Next action: review the deployed branch preview in desktop and 390×844 mobile widths, including all five locales and Arabic RTL.

Rollback: revert the VisePanda brand/localization/assets commit.

# Context

Objective: simplify the VisePanda landing page so the four core-capability cards always show their complete copy, remove two lower-priority narrative sections and two FAQ items, and make the header navigation visibly local to each supported language.

Status: implementation, production build, static regression tests, desktop browser QA, mobile browser QA, five-locale navigation checks, and Arabic RTL checks pass. Commit and remote synchronization are the remaining delivery steps.

Scope:

- remove feature-card detail toggles and text clamping
- remove the guessing marquee and evidence-delivery sections
- render 10 FAQ items by excluding the execution-moments and input-storage questions
- remove metric/imperial state and navigation
- show locale flags and currency symbols in the header and language modal
- keep Chinese, English, Spanish, Russian, and Arabic copy plus Arabic document-level RTL
- rewrite project documentation around VisePanda product scope and current maturity

Locale mapping:

- `zh` → `🇨🇳` + `¥`
- `en` → `🇺🇸` + `$`
- `es` → `🇪🇸` + `€`
- `ru` → `🇷🇺` + `₽`
- `ar` → `🇸🇦` + `ر.س`

Boundaries: the page remains frontend-only. Real AI, accounts, Trip persistence, inventory, booking, payment, partner services, and Human Help are not connected. Bundled local fonts and shape masks still need rights review before production release.

Reading order:

1. `README.md`
2. `HANDOFF.md`
3. `design-qa.md`
4. `lib/i18n.ts`
5. `components/VisePandaLanding.tsx`
6. `app/globals.css`
7. `tests/static-output.test.mjs`

Next action: commit the verified change, push `main`, and confirm the Vercel deployment status for that exact commit.

Rollback: revert the UI simplification commit.

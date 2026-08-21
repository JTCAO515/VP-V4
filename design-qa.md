# VisePanda Landing Simplification QA

## Result

The requested feature-card expansion, section removals, ten-item FAQ, localized header navigation, five-language switching, Arabic RTL, production build, and browser checks passed.

## Automated evidence

- `pnpm lint` → source policy lint passed.
- `pnpm typecheck` → strict TypeScript passed with no diagnostics.
- `pnpm build` → Next.js 16.2.6 webpack production build passed; `/` prerendered as static content.
- `pnpm test` → 10/10 static-output tests passed.
- `git diff --check` → passed.
- Documentation scan → no prohibited historical brand or clone terminology.
- Runtime scan → no guessing marquee, evidence-delivery section, metric state, feature-detail toggles, or the two removed FAQ questions in rendered HTML.

The default Next.js 16 Turbopack build could not run in this sandbox because its PostCSS worker attempted to bind an internal port and received `EPERM`. The supported `next build --webpack` path passed and is the recorded project build command.

## Static prerender inspection

The generated `.next/server/app/index.html` confirms:

- `lang="zh-CN"`
- theme color `#fefdf9`
- VisePanda title and description metadata
- Next-managed local font preloads
- project-local VisePanda image references
- Tailwind `bg-vp-paper` and `text-vp-ink` utilities in compiled CSS
- complete Chinese, English, Spanish, Russian, and Arabic copy dictionaries
- document-level Arabic `lang`/`dir` switching
- 10 FAQ controls
- VisePanda Planner, Trip Canvas, Today, execution-fact, recovery, and honest product-boundary copy

## Browser evidence

- Local dev server: `next dev --webpack --hostname 127.0.0.1 --port 4173` → ready.
- Desktop 1440 × 1000: `scrollWidth === innerWidth`; four capability cards rendered; all paragraph `clientHeight === scrollHeight`; `overflow: visible`; zero card detail buttons.
- Mobile 390 × 844: `scrollWidth === innerWidth`; one carousel card visible at a time; both first and fourth cards had `clientHeight === scrollHeight`.
- Removed sections: `.joy-section` and `.team-section` absent at desktop and mobile.
- FAQ: exactly 10 rendered articles.
- Locale interaction: `zh/🇨🇳/¥`, `en/🇺🇸/$`, `es/🇪🇸/€`, `ru/🇷🇺/₽`, `ar/🇸🇦/ر.س` passed.
- Arabic: `lang="ar"`, `dir="rtl"`, no horizontal overflow, and all four capability paragraphs fully visible.
- Framework error overlay: absent.
- Browser console errors: 0. A development-only Next.js LCP warning appeared after a reload preserved a scrolled viewport; it does not block this scoped acceptance.

## Release blockers

- The requested same-font treatment retains existing bundled local fonts; existing shape masks also remain. Both need rights review before public release.
- Real VisePanda interfaces and backends are not connected.
- Target Vercel deployment must be checked after the exact commit is pushed.

## Rollback

Revert the UI simplification commit.

final result: pass for the requested frontend scope; production integrations remain outside scope

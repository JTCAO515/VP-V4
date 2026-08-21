# Framework and Copy Migration QA

## Result

The framework migration, strict TypeScript check, production build, static-output tests, and copy/claim scan passed. Browser-rendered visual and interaction QA is blocked by the managed sandbox, not marked as passed.

## Automated evidence

- `pnpm lint` → source policy lint passed.
- `pnpm typecheck` → strict TypeScript passed with no diagnostics.
- `pnpm build` → Next.js 16.2.6 webpack production build passed; `/` prerendered as static content.
- `pnpm test` → 5/5 static-output tests passed.
- `git diff --check` → passed.
- Runtime/meta/docs scan → no source-brand copy, false user-volume text, investor text, media endorsement text, or positive real-time booking claims in the accepted scope.

The default Next.js 16 Turbopack build could not run in this sandbox because its PostCSS worker attempted to bind an internal port and received `EPERM`. The supported `next build --webpack` path passed and is the recorded project build command.

## Static prerender inspection

The generated `.next/server/app/index.html` confirms:

- `lang="zh-CN"`
- theme color `#fefdf9`
- VisePanda title and description metadata
- Next-managed local font preloads
- local-only image/video references
- Tailwind `bg-vp-paper` and `text-vp-ink` utilities in compiled CSS
- 12 FAQ controls
- VisePanda Planner, Trip Canvas, Today, execution-fact, recovery, and honest product-boundary copy

## Browser blocker

- `next dev --webpack --hostname 0.0.0.0 --port 4174` → `listen EPERM`.
- Loopback `127.0.0.1:4174` → the same `listen EPERM`.
- The in-app browser blocks `file://` URLs by security policy, so the static prerender cannot be substituted for hydrated browser QA.

Therefore desktop, 390 × 844, hydrated interactions, responsive overflow, and browser console checks remain unverified in this session.

## Release blockers

- Reference-site images, video, logo, portraits, and fonts remain.
- Real VisePanda interfaces and backends are not connected.
- Browser QA must be rerun in an environment that allows local preview.
- The page must not be publicly deployed.

## Rollback

Revert the framework-and-copy migration commit to return to the Vite baseline at `61afe20`.

final result: blocked

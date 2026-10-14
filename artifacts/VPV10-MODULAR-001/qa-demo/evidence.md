# #681 limited sample delivery

Owner: this isolated sample chat; Main remains `01a13311-9212-7db3-8c75-691eac0f03ea`.
Base: `eba6ea343cb2764e791f56bf24ccfbe454f91045` on `codex/vpv4-frontend-sample-20261014`.
Ready entered: 2026-10-14 (exact dispatch timestamp unavailable).
Source scope: new `app/qa/demo`, `components/qa-demo`, `tests/contract/qa-demo`, this evidence directory. No old/shared source changed.
Model: dispatch requested Sol/medium; current effective fields not exposed, UNVERIFIED. No model or permission configuration altered.

User result: `/qa/demo` presents two explicitly synthetic Sessions, exact Chinese/English preset matching, honest unknown-input handling, reset, bounded in-memory interactions, and four existing navigation labels with honest empty states. The fixed sample header remains visible when scrolling. A normal anchor enters `/qa`; it does not prefetch or simulate authentication/consent. No new dependencies.

## Actual evidence

- Source PASS: lint, typecheck, production build (static `/qa/demo`), baseline 22 tests, diff check.
- Fixture PASS: `node --experimental-strip-types --test tests/contract/qa-demo/sample.test.mjs` (2 tests, two fixtures, preset and unknown negatives, AST import/IO closure).
- Local browser PASS: `node tests/contract/qa-demo/browser-proof.mjs`, Chromium, production server `127.0.0.1:3181`, desktop 1440×1000 and mobile 390×844. Keyboard submit/focus return, fixture switch, why/simplify/correction, unknown input, reset/focus, four tabs/empty states, 12-turn disabled bound, refresh to default fixture, plain `/qa` href, and no horizontal overflow.
- Boundary PASS in tested flows: request allowlist allowed only initial sample document and static assets. No attempted fetch/XHR/WebSocket/EventSource/beacon/storage write/cookie write/indexedDB; no unexpected requests, cookies, console errors or page exceptions. Browser results JSON and screenshots accompany this record.
- Local dependency setup: frozen offline install, all 108 packages from cache, no download/lock change. Port 3181 was free; only own server started. No other server/container touched.
- Browser plugin not available in this session; existing Playwright used under frontend-testing-debugging fallback. No browser/dependency install performed.
- Build emitted Node DEP0205 deprecation warnings; compilation succeeded, browser console clean.

## Retained gaps

QA domain deployment, remote CI, independent review, actual `/qa` authentication/consent, persistence/provider/multi-turn/user isolation, physical device and human acceptance: UNRUN by this sample owner. Existing real `/qa` Auth code was inspected and preserved; this is source evidence, not real login acceptance. No Supabase/provider/ECS/Vercel connection or production operation performed. #681 remains OPEN; this bounded sample does not fulfill its real AC.

Reproduce: `pnpm install --offline --frozen-lockfile --ignore-scripts`; `pnpm build`; `pnpm exec next start --hostname 127.0.0.1 --port 3181`; run the two scoped scripts above. Existing global styles/QA stylesheet conventions are reused without changing their source. Rollback is removal of these new sample paths only; no data rollback needed.

Evidence formatting: first staged diff check detected progress-line whitespace in build.log; normalized whitespace only, then repeated diff check. Build output content retained.

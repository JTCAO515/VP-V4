# Web release locale verification

Environment: isolated macOS checkout, Node 26.7.0, pnpm 9.15.9, Next 16.2.6.
Final base: origin/main 51879c3 (PR257). No native edits, migrations or deployed state.

- PASS `pnpm lint` (186 source files), `pnpm typecheck`.
- PASS `pnpm test:unit`: 36 tests, including the new five-locale release selection/payload test.
- PASS `pnpm test:contract`: 161 tests, including retained five-language password copy coverage.
- PASS `pnpm test:e2e`: 40 source contract tests; migrated picker assertions preserve the locale invariant.
- PASS dedicated in-app browser 390x844 check: Arabic selected label, document ar/rtl, no horizontal
  overflow, English change removes Arabic and restores en/ltr. Actual API unavailable state observed.
- PASS Playwright locale and existing viewport suite: 5 tests on the metadata fix, including default
  zh/en discovery, es/ru/ar URLs, active legacy label, Arabic title/RTL, English/Chinese escape,
  24 viewport/surface combinations, keyboard focus and sign-in controls.

Initial static/browser invocations started before build completed and failed on missing build files;
rerun after build succeeded. First new browser fixture incorrectly returned [] to the Trip-list API;
replaced with an intentional 401 response to verify unauthenticated locale UI without an invalid
payload. The Arabic URL also revealed late static Next metadata overwriting its initial client title;
fixed by locale-aware server metadata. The canonical route now renders dynamically from locale and
static copy only. No production/backend capability is inferred.

Latest-base build, migrated static checks and added canonical/no-preview browser assertions are
recorded below after their final run.

Final latest-base results: PASS `pnpm build`; PASS `pnpm test` 22/22 after migrating dynamic
route evidence; PASS `pnpm exec playwright test tests/e2e/frontend/vpj-01-web-locales.spec.mjs
--workers=1` 2/2, including preserved localized title, canonical and no-preview assertions.
PASS `pnpm docs:check` and `git diff --check`. Required remote CI/review remain separate gates.

Review follow-up: repeated `?locale=ar&locale=en` now uses the first locale in server metadata,
matching client URLSearchParams.get. PASS typecheck, build, docs/diff and both desktop/390 browser
regressions with explicit Arabic title/lang/RTL assertions for the repeated query.

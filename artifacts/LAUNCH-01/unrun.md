# LAUNCH-01 unrun and incomplete evidence

Recorded 2026-08-29 for Issue #150.

## Incomplete local suites

- `pnpm test:integration` completed with exit code 0 and `VP_CI_SUITE_RESULT` of `incomplete`: 8 tests require a running local Supabase instance.
- `pnpm test:security` completed with exit code 0 and `VP_CI_SUITE_RESULT` of `incomplete`: 1 test requires a running local Supabase instance.
- `pnpm db:verify` found the AI-08 local baseline but no configured connection. It made no production connection attempt.

These results are deliberately not promoted to database, RLS, Staging, or release acceptance. Staging configuration belongs to LAUNCH-02 and requires its operator-only account actions.

## Intentional release block

`pnpm check:assets:release` was run and failed as designed: 9 blocked preview assets remain in the public output. Preview asset validation passed, but release validation remains a hard block until their rights and release disposition are resolved by the owning release work.

## Other boundaries

- No external provider, Vercel, Supabase project, production database, DNS, payment, domain, or real-user action was attempted.
- Playwright browser E2E passed locally, including the required 390x844 and desktop viewport coverage. This is repository browser evidence, not live Staging acceptance.
- The normal host `pnpm` 11 command is incompatible with the repository's `pnpm@9.15.9` lock configuration; all recorded validation used the declared pnpm 9 runner.
- The internal text-asset checker normalizes CRLF only for its ledgered `.html`, `.json`, and `.svg` records. This fixes Windows/Linux checkout parity without weakening owner-master or binary asset hashes.
